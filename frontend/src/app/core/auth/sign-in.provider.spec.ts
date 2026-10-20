import type { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalSignIn, OidcSignIn } from './sign-in.provider';
import type { PublicConfig } from '../config/config.service';

const config: PublicConfig = {
  mode: 'production', apiBaseUrl: 'https://api.example.test/api/v1',
  issuer: 'https://identity.example.test/', clientId: 'public-client',
  audience: 'https://api.example.test/api', scope: 'openid profile email gategoldjira:access',
};

function oidc(authenticated: boolean) {
  const getAccessTokenSilently = vi.fn<Auth0Service['getAccessTokenSilently']>().mockReturnValue(of('verified-provider-token'));
  const loginWithRedirect = vi.fn<Auth0Service['loginWithRedirect']>().mockReturnValue(of(undefined));
  const logout = vi.fn<Auth0Service['logout']>().mockReturnValue(of(undefined));
  // Only the public SDK methods consumed by this adapter are doubled. These
  // unit checks do not establish acceptance against an actual Auth0 tenant.
  const sdk = { isAuthenticated$: of(authenticated), getAccessTokenSilently, loginWithRedirect, logout } as unknown as Auth0Service;
  return { provider: new OidcSignIn(sdk, config), getAccessTokenSilently, loginWithRedirect, logout };
}

afterEach(() => vi.unstubAllGlobals());

describe('in-memory local sign-in adapter', () => {
  it('starts empty, trims a valid local token and clears it on sign-out', async () => {
    const provider = new LocalSignIn();
    expect(provider.mode).toBe('development'); expect(await provider.accessToken()).toBeUndefined();
    provider.setLocalToken('  local.payload.signature\n');
    expect(await provider.accessToken()).toBe('local.payload.signature');
    await provider.signOut(); expect(await provider.accessToken()).toBeUndefined();
    provider.clearLocalToken(); expect(await provider.accessToken()).toBeUndefined();
  });
  it('requires the explicit credentials exchange instead of inventing a local redirect', async () => {
    await expect(new LocalSignIn().signIn()).rejects.toThrow('Enter your local username and password.');
  });
  it.each(['', 'opaque-token', 'one.two', 'one.two.three.four', 'one .two.three', 'a.b.' + 'c'.repeat(16_384)])('rejects malformed or oversized local credentials', value => {
    expect(() => new LocalSignIn().setLocalToken(value)).toThrow('Enter a valid local access token.');
  });
  it('accepts the exact byte-sized ASCII limit and does not install an invalid replacement', async () => {
    const provider = new LocalSignIn(), token = 'a.b.' + 'c'.repeat(16_380);
    provider.setLocalToken(token); expect(await provider.accessToken()).toBe(token);
    expect(() => provider.setLocalToken(token + 'c')).toThrow();
    expect(await provider.accessToken()).toBe(token);
  });
});

describe('production identity SDK adapter', () => {
  it('never asks the SDK for a token when it reports no authenticated identity', async () => {
    const f = oidc(false); expect(f.provider.mode).toBe('production');
    expect(await f.provider.accessToken()).toBeUndefined(); expect(f.getAccessTokenSilently).not.toHaveBeenCalled();
  });
  it('requests only the configured REST audience and scopes from an authenticated SDK', async () => {
    const f = oidc(true); expect(await f.provider.accessToken()).toBe('verified-provider-token');
    expect(f.getAccessTokenSilently).toHaveBeenCalledExactlyOnceWith({ authorizationParams: { audience: config.audience, scope: config.scope } });
  });
  it('propagates token exchange failure instead of installing a fallback credential', async () => {
    const f = oidc(true); f.getAccessTokenSilently.mockReturnValue(throwError(() => new Error('Provider unavailable')));
    await expect(f.provider.accessToken()).rejects.toThrow('Provider unavailable');
  });
  it('selects company Google sign-in and keeps the requested app state public', async () => {
    const f = oidc(false); await f.provider.signIn();
    expect(f.loginWithRedirect).toHaveBeenCalledExactlyOnceWith({ authorizationParams: { connection: 'google-oauth2' }, appState: { target: '/' } });
  });
  it('returns logout to the actual frontend origin', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://jira.example.test' } });
    const f = oidc(true); await f.provider.signOut();
    expect(f.logout).toHaveBeenCalledExactlyOnceWith({ logoutParams: { returnTo: 'https://jira.example.test' } });
  });
  it.each(['login', 'logout'] as const)('does not swallow a rejected SDK %s', async operation => {
    vi.stubGlobal('window', { location: { origin: 'https://jira.example.test' } });
    const f = oidc(true);
    if (operation === 'login') f.loginWithRedirect.mockReturnValue(throwError(() => new Error('Identity unavailable')));
    else f.logout.mockReturnValue(throwError(() => new Error('Identity unavailable')));
    await expect(operation === 'login' ? f.provider.signIn() : f.provider.signOut()).rejects.toThrow('Identity unavailable');
  });
});
