import '@angular/compiler';
import { Injector } from '@angular/core';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { LocalSignIn, SIGN_IN } from './sign-in.provider';
import { ConfigService, type PublicConfig } from '../config/config.service';
import type { Me } from '../../api/generated/types.gen';

const config: PublicConfig = { mode: 'development', apiBaseUrl: '/api/v1', issuer: 'http://localhost:21080/development-identity/', clientId: 'local-development', audience: 'http://localhost:21080/api', scope: 'openid profile email gategoldjira:access' };
const owner: Me = { userId: '10000000-0000-4000-8000-000000000001', email: 'owner@example.test', displayName: 'Owner', administrator: true, companyTimeZone: 'Africa/Cairo' };
afterEach(() => vi.unstubAllGlobals());

it('rejects a contract-shaped but invalid local bearer token before publishing its verified identity', async () => {
  vi.stubGlobal('window', { location: { origin: 'http://localhost:4200' } });
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json(owner))
    .mockResolvedValueOnce(Response.json({ accessToken: 'not-a-bearer-token', expiresAt: '2026-10-20T14:00:00Z' }))
    .mockResolvedValueOnce(Response.json(owner));
  vi.stubGlobal('fetch', fetch);
  const provider = new LocalSignIn();
  const auth = Injector.create({ providers: [
    { provide: ConfigService, useValue: new ConfigService(config) },
    { provide: SIGN_IN, useValue: provider },
    { provide: AuthService, useFactory: () => new AuthService() },
  ] }).get(AuthService);
  expect(await auth.signInLocal('old.valid.signature')).toBe(true);
  const epoch = auth.sessionEpoch();
  expect(await auth.signInLocalCredentials('owner', 'password')).toBe('unavailable');
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(auth.me()).toBeNull(); expect(await provider.accessToken()).toBeUndefined();
  expect(auth.sessionDenied()).toBe(false); expect(auth.sessionEpoch()).toBeGreaterThan(epoch);
});
