import '@angular/compiler';
import { Injector } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { ConfigService, type PublicConfig } from '../config/config.service';
import { LocalSignIn, SIGN_IN, type SignInProvider } from './sign-in.provider';
import type { Me } from '../../api/generated/types.gen';
import { listUsers } from '../../api/generated/sdk.gen';

const config: PublicConfig = {
  mode: 'development',
  apiBaseUrl: '/api/v1',
  issuer: 'http://localhost:21080/development-identity/',
  clientId: 'local-development',
  audience: 'http://localhost:21080/api',
  scope: 'openid profile email gategoldjira:access',
};
const owner: Me = {
  userId: '10000000-0000-4000-8000-000000000001',
  email: 'owner@example.test',
  displayName: 'Owner',
  administrator: true,
  companyTimeZone: 'Africa/Cairo',
};
const member: Me = {
  ...owner,
  userId: '10000000-0000-4000-8000-000000000002',
  administrator: false,
  displayName: 'عضو',
};
function makeAuth(provider: SignInProvider = new LocalSignIn()): AuthService {
  vi.stubGlobal('window', { location: { origin: 'http://localhost:4200' } });
  return Injector.create({
    providers: [
      { provide: ConfigService, useValue: new ConfigService(config) },
      { provide: SIGN_IN, useValue: provider },
      { provide: AuthService, useFactory: () => new AuthService() },
    ],
  }).get(AuthService);
}
function deferredResponse(): { promise: Promise<Response>; resolve: (response: Response) => void } {
  let resolve: (response: Response) => void = () => {
    throw new Error('Deferred response was not initialized.');
  };
  const promise = new Promise<Response>(finish => {
    resolve = finish;
  });
  return { promise, resolve };
}
afterEach(() => vi.unstubAllGlobals());

const login = (accessToken = 'new.token.signature'): Response =>
  Response.json({ accessToken, expiresAt: '2026-10-12T14:00:00Z' });

describe('local username and password sign-in', () => {
  it('keeps production sign-in with the configured provider and refuses local credentials', async () => {
    const provider: SignInProvider = {
      mode: 'production',
      accessToken: async () => undefined,
      signIn: vi.fn(async () => undefined),
      signOut: async () => undefined,
    };
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal('fetch', fetch);
    const auth = makeAuth(provider);
    await expect(auth.signInLocalCredentials('owner', 'password')).rejects.toThrow(
      'Local sign-in is unavailable.',
    );
    await auth.signIn();
    expect(provider.signIn).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('exchanges credentials without an authorization header and installs only a verified identity', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(login())
      .mockResolvedValueOnce(Response.json(owner));
    vi.stubGlobal('fetch', fetch);
    const provider = new LocalSignIn();
    const auth = makeAuth(provider);
    expect(await auth.signInLocalCredentials(' owner ', ' password with spaces ')).toBe(
      'signed-in',
    );
    const credentials = fetch.mock.calls[0]?.[0];
    expect(credentials).toBeInstanceOf(Request);
    if (!(credentials instanceof Request)) throw new Error('Missing login request.');
    expect(credentials.url).toBe('http://localhost:4200/api/v1/auth/local-sign-in');
    expect(credentials.headers.get('Authorization')).toBeNull();
    expect(await credentials.json()).toEqual({
      username: 'owner',
      password: ' password with spaces ',
    });
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', credentials: 'omit' });
    const identity = fetch.mock.calls[1]?.[0];
    expect(identity instanceof Request ? identity.headers.get('Authorization') : null).toBe(
      'Bearer new.token.signature',
    );
    expect(auth.me()).toEqual(owner);
    expect(await provider.accessToken()).toBe('new.token.signature');
  });
  it('clears the previous token and identity when credentials are rejected', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(Response.json(owner))
        .mockResolvedValueOnce(Response.json({ error: 'invalid credentials' }, { status: 401 })),
    );
    const provider = new LocalSignIn();
    const auth = makeAuth(provider);
    await auth.signInLocal('old.token.signature');
    expect(await auth.signInLocalCredentials('owner', 'incorrect')).toBe('invalid-credentials');
    expect(auth.me()).toBeNull();
    expect(await provider.accessToken()).toBeUndefined();
  });
  it.each([
    { status: 403, result: 'access-denied' },
    { status: 503, result: 'unavailable' },
  ])(
    'distinguishes account denial from service unavailability ($status)',
    async ({ status, result }) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn<typeof globalThis.fetch>()
          .mockResolvedValueOnce(Response.json({ error: 'denied' }, { status })),
      );
      const provider = new LocalSignIn();
      const auth = makeAuth(provider);
      expect(await auth.signInLocalCredentials('owner', 'password')).toBe(result);
      expect(auth.me()).toBeNull();
      expect(await provider.accessToken()).toBeUndefined();
    },
  );
  it('reports an offline service and discards the previous session', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(Response.json(owner))
        .mockRejectedValueOnce(new TypeError('Failed to fetch')),
    );
    const provider = new LocalSignIn();
    const auth = makeAuth(provider);
    await auth.signInLocal('old.token.signature');
    expect(await auth.signInLocalCredentials('owner', 'password')).toBe('unavailable');
    expect(auth.me()).toBeNull();
    expect(await provider.accessToken()).toBeUndefined();
  });
  it('rejects a malformed token response at the generated API boundary', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ accessToken: 123, expiresAt: 'invalid date' }));
    vi.stubGlobal('fetch', fetch);
    const provider = new LocalSignIn();
    const auth = makeAuth(provider);
    expect(await auth.signInLocalCredentials('owner', 'password')).toBe('unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await provider.accessToken()).toBeUndefined();
  });
  it('does not install an identity until company access has been verified', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(login())
        .mockResolvedValueOnce(Response.json({ error: 'disabled account' }, { status: 403 })),
    );
    const provider = new LocalSignIn();
    const auth = makeAuth(provider);
    expect(await auth.signInLocalCredentials('owner', 'password')).toBe('access-denied');
    expect(auth.me()).toBeNull();
    expect(await provider.accessToken()).toBeUndefined();
  });
  it('does not install a pending login after the user signs out', async () => {
    const pending = deferredResponse();
    vi.stubGlobal('fetch', vi.fn<typeof globalThis.fetch>().mockReturnValueOnce(pending.promise));
    const provider = new LocalSignIn();
    const auth = makeAuth(provider);
    const attempt = auth.signInLocalCredentials('owner', 'password');
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    await auth.signOut();
    pending.resolve(login());
    expect(await attempt).toBe('superseded');
    expect(auth.me()).toBeNull();
    expect(await provider.accessToken()).toBeUndefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
  it('does not let a stale rejected login erase a newer session', async () => {
    const old = deferredResponse();
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof globalThis.fetch>()
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(login('new.token.signature'))
        .mockResolvedValueOnce(Response.json(member)),
    );
    const provider = new LocalSignIn();
    const auth = makeAuth(provider);
    const earlier = auth.signInLocalCredentials('owner', 'old password');
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    expect(await auth.signInLocalCredentials('member', 'new password')).toBe('signed-in');
    old.resolve(Response.json({ error: 'invalid credentials' }, { status: 401 }));
    expect(await earlier).toBe('superseded');
    expect(auth.me()?.userId).toBe(member.userId);
    expect(await provider.accessToken()).toBe('new.token.signature');
  });
  it('does not let a stale company-access denial erase a newer session', async () => {
    const old = deferredResponse();
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(login('old.token.signature'))
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(login('new.token.signature'))
        .mockResolvedValueOnce(Response.json(member)),
    );
    const provider = new LocalSignIn();
    const auth = makeAuth(provider);
    const earlier = auth.signInLocalCredentials('owner', 'old password');
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2));
    expect(await auth.signInLocalCredentials('member', 'new password')).toBe('signed-in');
    old.resolve(Response.json({ error: 'disabled account' }, { status: 403 }));
    expect(await earlier).toBe('superseded');
    expect(auth.me()?.userId).toBe(member.userId);
    expect(await provider.accessToken()).toBe('new.token.signature');
  });
});

describe('current session authority', () => {
  it('does not let an earlier malformed permission refresh erase a later verified login', async () => {
    const old = deferredResponse();
    const forbidden = { error: { code: 'forbidden', message: 'Administrator access is required.', fieldErrors: [], retryable: false, nextAction: 'contact_administrator' }, current: null, unfinished: null };
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(owner))
      .mockResolvedValueOnce(Response.json(forbidden, { status: 403 }))
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(Response.json(member));
    vi.stubGlobal('fetch', fetch);
    const provider = new LocalSignIn(), auth = makeAuth(provider);
    await auth.signInLocal('old.token.signature');
    await listUsers({ client: auth.client });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    await auth.signOut();
    expect(await auth.signInLocal('new.token.signature')).toBe(true);
    const epoch = auth.sessionEpoch();
    old.resolve(Response.json({ userId: false, email: 'invalid authority data' }));
    // Drain the old request's promise chain; no clock delay determines success.
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(auth.me()?.userId).toBe(member.userId);
    expect(await provider.accessToken()).toBe('new.token.signature');
    expect(auth.sessionEpoch()).toBe(epoch);
  });

  it('does not publish malformed authority and permits a later verified refresh', async () => {
    const forbidden = { error: { code: 'forbidden', message: 'Administrator access is required.', fieldErrors: [], retryable: false, nextAction: 'contact_administrator' }, current: null, unfinished: null };
    const fetch = vi.fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(owner))
      .mockResolvedValueOnce(Response.json(forbidden, { status: 403 }))
      .mockResolvedValueOnce(Response.json({ userId: false, email: 'invalid authority data' }))
      .mockResolvedValueOnce(Response.json(owner));
    vi.stubGlobal('fetch', fetch);
    const provider = new LocalSignIn(), auth = makeAuth(provider);
    await auth.signInLocal('old.token.signature');
    await listUsers({ client: auth.client });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(auth.me()).toBeNull();
    expect(auth.sessionDenied()).toBe(false);
    expect(await provider.accessToken()).toBe('old.token.signature');
    expect(await auth.refresh()).toEqual(owner);
    expect(auth.me()).toEqual(owner);
  });

  it('uses access tokens and clears the protected session on the next denial', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json(owner))
      .mockResolvedValueOnce(new Response('', { status: 403 }));
    vi.stubGlobal('fetch', fetch);
    const auth = makeAuth();
    expect(await auth.signInLocal('x.y.z')).toBe(true);
    const request = fetch.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    expect(request instanceof Request ? request.headers.get('Authorization') : null).toBe(
      'Bearer x.y.z',
    );
    const epoch = auth.sessionEpoch();
    await auth.refresh();
    expect(auth.me()).toBeNull();
    expect(auth.sessionEpoch()).toBeGreaterThan(epoch);
  });
  it('clears an old token when an invalid fixture token is submitted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(Response.json(owner)),
    );
    const provider = new LocalSignIn();
    const auth = makeAuth(provider);
    await auth.signInLocal('old.token.signature');
    await expect(auth.signInLocal('invalid')).rejects.toThrow('Enter a valid local access token.');
    expect(auth.me()).toBeNull();
    expect(await provider.accessToken()).toBeUndefined();
  });
  it('does not let an old response erase a newer signed-in identity', async () => {
    const old = deferredResponse();
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof globalThis.fetch>()
        .mockReturnValueOnce(old.promise)
        .mockResolvedValueOnce(Response.json(member)),
    );
    const auth = makeAuth();
    const earlier = auth.signInLocal('old.token.signature');
    await vi.waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    await auth.signOut();
    await auth.signInLocal('new.token.signature');
    old.resolve(Response.json(owner));
    await earlier;
    expect(auth.me()?.userId).toBe(member.userId);
  });
  it('clears cached resources when fresh account data changes the company role', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(Response.json(owner))
        .mockResolvedValueOnce(Response.json({ ...owner, administrator: false })),
    );
    const auth = makeAuth();
    await auth.signInLocal('x.y.z');
    const epoch = auth.sessionEpoch();
    await auth.refresh();
    expect(auth.me()?.administrator).toBe(false);
    expect(auth.sessionEpoch()).toBeGreaterThan(epoch);
  });
  it('refreshes a removed role while retaining an active identity on scoped denial', async () => {
    const failure = {
      error: {
        code: 'forbidden',
        message: 'Administrator access is required.',
        fieldErrors: [],
        retryable: false,
        nextAction: 'contact_administrator',
      },
      current: null,
      unfinished: null,
    };
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(Response.json(owner))
        .mockResolvedValueOnce(Response.json(failure, { status: 403 }))
        .mockResolvedValueOnce(Response.json({ ...owner, administrator: false })),
    );
    const auth = makeAuth();
    await auth.signInLocal('x.y.z');
    const epoch = auth.sessionEpoch();
    await listUsers({ client: auth.client });
    await vi.waitFor(() => expect(auth.me()?.administrator).toBe(false));
    expect(auth.me()?.userId).toBe(owner.userId);
    expect(auth.sessionDenied()).toBe(false);
    expect(auth.sessionEpoch()).toBeGreaterThan(epoch);
  });
});
