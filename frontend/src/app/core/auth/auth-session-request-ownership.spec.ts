import '@angular/compiler';
import { Injector } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { listBoards } from '../../api/generated/sdk.gen';
import type { FailureBody, Me } from '../../api/generated/types.gen';
import { ConfigService, type PublicConfig } from '../config/config.service';
import { AuthService } from './auth.service';
import { LocalSignIn, SIGN_IN } from './sign-in.provider';

const configuration: PublicConfig = {
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
const replacement: Me = {
  ...owner,
  userId: '10000000-0000-4000-8000-000000000002',
  displayName: 'Replacement',
  administrator: false,
};
const projectId = '20000000-0000-4000-8000-000000000001';
const failure: FailureBody = {
  error: {
    code: 'authentication_required',
    message: 'Sign in again.',
    fieldErrors: [],
    retryable: false,
    nextAction: 'sign_in',
  },
  current: null,
  unfinished: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}

// This public provider port retains LocalSignIn's actual token semantics. Only
// completion of one accessToken call is controlled, as an asynchronous OIDC
// provider or the generated SDK's await can delay transport dispatch.
class DelayedTokenProvider extends LocalSignIn {
  private nextRead: ReturnType<DelayedTokenProvider['holdNextTokenRead']> | undefined;

  holdNextTokenRead() {
    const gate = { captured: deferred<string | undefined>(), release: deferred<void>() };
    this.nextRead = gate;
    return gate;
  }

  override async accessToken(): Promise<string | undefined> {
    const gate = this.nextRead;
    this.nextRead = undefined;
    const token = await super.accessToken();
    if (gate) {
      gate.captured.resolve(token);
      await gate.release.promise;
    }
    return token;
  }
}

function makeAuth(provider = new DelayedTokenProvider()): AuthService {
  vi.stubGlobal('window', { location: { origin: 'http://localhost:4200' } });
  return Injector.create({
    providers: [
      { provide: ConfigService, useValue: new ConfigService(configuration) },
      { provide: SIGN_IN, useValue: provider },
      { provide: AuthService, useFactory: () => new AuthService() },
    ],
  }).get(AuthService);
}

function useTransport(handler: (request: Request) => Promise<Response>) {
  const transport = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    expect(init).toMatchObject({ cache: 'no-store', credentials: 'omit' });
    return handler(request);
  });
  vi.stubGlobal('fetch', transport);
  return transport;
}

const loginResponse = () => Response.json({
  accessToken: 'new.token.signature',
  expiresAt: '2026-10-21T14:00:00Z',
});
const denied = () => Response.json(failure, { status: 401 });
const pathOf = (request: Request) => new URL(request.url).pathname;

afterEach(() => vi.unstubAllGlobals());

describe('protected SDK request session ownership', () => {
  it('does not let an unsigned workspace denial supersede a pending credential exchange after sign-out', async () => {
    const loginStarted = deferred<Request>();
    const loginReply = deferred<Response>();
    const verifiedTokens: Array<string | null> = [];
    useTransport(async request => {
      if (pathOf(request).endsWith('/auth/local-sign-in')) {
        loginStarted.resolve(request);
        return loginReply.promise;
      }
      if (pathOf(request).endsWith('/me')) {
        verifiedTokens.push(request.headers.get('Authorization'));
        return Response.json(verifiedTokens.length === 1 ? owner : replacement);
      }
      expect(pathOf(request)).toBe(`/api/v1/projects/${projectId}/boards`);
      expect(request.headers.get('Authorization')).toBeNull();
      return denied();
    });
    const provider = new DelayedTokenProvider();
    const auth = makeAuth(provider);
    expect(await auth.signInLocal('old.token.signature')).toBe(true);
    await auth.signOut();
    const signingIn = auth.signInLocalCredentials('replacement', 'fixture-password');
    const credentials = await loginStarted.promise;
    expect(credentials.headers.get('Authorization')).toBeNull();
    expect(await credentials.json()).toEqual({ username: 'replacement', password: 'fixture-password' });
    const loginEpoch = auth.sessionEpoch();
    try {
      const result = await listBoards({ client: auth.client, path: { projectId } });
      expect(result.response?.status).toBe(401);
      expect(result.error).toEqual(failure);
      expect(auth.sessionEpoch()).toBe(loginEpoch);
      expect(auth.sessionDenied()).toBe(false);
    } finally {
      loginReply.resolve(loginResponse());
    }
    expect(await signingIn).toBe('signed-in');
    expect(verifiedTokens).toEqual(['Bearer old.token.signature', 'Bearer new.token.signature']);
    expect(auth.me()).toEqual(replacement);
    expect(await provider.accessToken()).toBe('new.token.signature');
  });

  it('cancels a queued unsigned SDK request when login supersedes it during asynchronous token acquisition', async () => {
    const loginStarted = deferred<Request>();
    const loginReply = deferred<Response>();
    const dispatchedBoards: Request[] = [];
    useTransport(async request => {
      if (pathOf(request).endsWith('/auth/local-sign-in')) {
        loginStarted.resolve(request);
        return loginReply.promise;
      }
      if (pathOf(request).endsWith('/me')) {
        expect(request.headers.get('Authorization')).toBe('Bearer new.token.signature');
        return Response.json(replacement);
      }
      dispatchedBoards.push(request);
      return denied();
    });
    const provider = new DelayedTokenProvider();
    const auth = makeAuth(provider);
    await auth.signOut();
    const gate = provider.holdNextTokenRead();
    const queuedRead = listBoards({ client: auth.client, path: { projectId }, throwOnError: true })
      .then(value => ({ kind: 'response' as const, value }), error => ({ kind: 'error' as const, error: error as unknown }));
    expect(await gate.captured.promise).toBeUndefined();
    const signingIn = auth.signInLocalCredentials('replacement', 'fixture-password');
    await loginStarted.promise;
    const loginEpoch = auth.sessionEpoch();
    gate.release.resolve();
    try {
      const outcome = await queuedRead;
      expect(outcome.kind).toBe('error');
      if (outcome.kind !== 'error') throw new Error('A superseded SDK read must be cancelled.');
      expect(outcome.error).toMatchObject({ name: 'AbortError' });
      expect(dispatchedBoards).toHaveLength(0);
      expect(auth.sessionEpoch()).toBe(loginEpoch);
    } finally {
      loginReply.resolve(loginResponse());
    }
    expect(await signingIn).toBe('signed-in');
    expect(auth.me()).toEqual(replacement);
    expect(await provider.accessToken()).toBe('new.token.signature');
  });

  it('cancels an old bearer snapshot delayed by SDK authentication rather than denying a newer verified account', async () => {
    const dispatchedBoards: Request[] = [];
    useTransport(async request => {
      if (pathOf(request).endsWith('/me')) {
        const token = request.headers.get('Authorization');
        expect(['Bearer old.token.signature', 'Bearer new.token.signature']).toContain(token);
        return Response.json(token === 'Bearer old.token.signature' ? owner : replacement);
      }
      dispatchedBoards.push(request);
      return denied();
    });
    const provider = new DelayedTokenProvider();
    const auth = makeAuth(provider);
    expect(await auth.signInLocal('old.token.signature')).toBe(true);
    const gate = provider.holdNextTokenRead();
    const queuedRead = listBoards({ client: auth.client, path: { projectId }, throwOnError: true })
      .then(value => ({ kind: 'response' as const, value }), error => ({ kind: 'error' as const, error: error as unknown }));
    expect(await gate.captured.promise).toBe('old.token.signature');
    await auth.signOut();
    expect(await auth.signInLocal('new.token.signature')).toBe(true);
    const replacementEpoch = auth.sessionEpoch();
    gate.release.resolve();
    const outcome = await queuedRead;
    expect(outcome.kind).toBe('error');
    if (outcome.kind !== 'error') throw new Error('A superseded SDK read must be cancelled.');
    expect(outcome.error).toMatchObject({ name: 'AbortError' });
    expect(dispatchedBoards).toHaveLength(0);
    expect(auth.sessionEpoch()).toBe(replacementEpoch);
    expect(auth.me()).toEqual(replacement);
    expect(auth.sessionDenied()).toBe(false);
    expect(await provider.accessToken()).toBe('new.token.signature');
  });

  it('does not clear a newer account when parsing an old denial finishes after the session changes', async () => {
    const readingFailure = deferred<void>();
    const releaseFailure = deferred<void>();
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        readingFailure.resolve();
        await releaseFailure.promise;
        controller.enqueue(new TextEncoder().encode(JSON.stringify(failure)));
        controller.close();
      },
    }, { highWaterMark: 0 });
    const oldDenial = new Response(body, {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
    useTransport(async request => {
      if (pathOf(request).endsWith('/me')) {
        const token = request.headers.get('Authorization');
        expect(['Bearer old.token.signature', 'Bearer new.token.signature']).toContain(token);
        return Response.json(token === 'Bearer old.token.signature' ? owner : replacement);
      }
      expect(pathOf(request)).toBe(`/api/v1/projects/${projectId}/boards`);
      expect(request.headers.get('Authorization')).toBe('Bearer old.token.signature');
      return oldDenial;
    });
    const provider = new DelayedTokenProvider();
    const auth = makeAuth(provider);
    expect(await auth.signInLocal('old.token.signature')).toBe(true);
    const oldRead = listBoards({ client: auth.client, path: { projectId } });
    await readingFailure.promise;
    let replacementEpoch: number;
    try {
      await auth.signOut();
      expect(await auth.signInLocal('new.token.signature')).toBe(true);
      replacementEpoch = auth.sessionEpoch();
    } finally {
      releaseFailure.resolve();
    }
    const result = await oldRead;
    expect(result.response?.status).toBe(401);
    expect(result.error).toEqual(failure);
    expect(auth.sessionEpoch()).toBe(replacementEpoch);
    expect(auth.me()).toEqual(replacement);
    expect(auth.sessionDenied()).toBe(false);
    expect(await provider.accessToken()).toBe('new.token.signature');
  });

  it('still clears a verified current credential when its own protected SDK request returns 401', async () => {
    useTransport(async request => {
      expect(request.headers.get('Authorization')).toBe('Bearer current.token.signature');
      if (pathOf(request).endsWith('/me')) return Response.json(owner);
      expect(pathOf(request)).toBe(`/api/v1/projects/${projectId}/boards`);
      return denied();
    });
    const provider = new DelayedTokenProvider();
    const auth = makeAuth(provider);
    expect(await auth.signInLocal('current.token.signature')).toBe(true);
    const currentEpoch = auth.sessionEpoch();
    const result = await listBoards({ client: auth.client, path: { projectId } });
    expect(result.response?.status).toBe(401);
    expect(result.error).toEqual(failure);
    expect(auth.me()).toBeNull();
    expect(auth.sessionDenied()).toBe(true);
    expect(auth.sessionEpoch()).toBeGreaterThan(currentEpoch);
    expect(await provider.accessToken()).toBeUndefined();
  });
});
