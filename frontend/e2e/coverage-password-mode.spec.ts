import { expect, type APIResponse, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable } from './support/session';
import { authorization, save } from './support/coverage-access';
import { PasswordModeServer, type PasswordIdentity } from './support/isolated-password-identity';
import { zFailureBody, zLocalSession, zMe, zSavedUserView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the owning disposable PostgreSQL database and captured Go binary.');
// Only this fixture browser trusts its own local HTTPS certificate. The real Go
// database client still uses verify-full with our private CA and IP SAN.
test.use({ ignoreHTTPSErrors: true, trace: 'off' });
test.setTimeout(120_000);
const passwordPath = '/api/v1/auth/password-sign-in';

async function signIn(page: Page, server: PasswordModeServer, identity: PasswordIdentity) {
  await page.getByLabel('Username', { exact: true }).fill(identity.username);
  await page.getByLabel('Password', { exact: true }).fill(identity.password);
  const signedIn = page.waitForResponse(response => response.request().method() === 'POST' && response.url() === server.origin + passwordPath);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const response = await signedIn;
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}

async function safeDenial(response: APIResponse, code: string, privateValues: readonly string[]) {
  expect(response.headers()['cache-control']).toBe('no-store');
  const body: unknown = await response.json();
  const failure = zFailureBody.parse(body);
  expect(failure.error.code).toBe(code);
  expect(failure.current).toBeNull(); expect(failure.unfinished).toBeNull();
  expect(Object.hasOwn(body as object, 'accessToken')).toBe(false);
  const serialized = JSON.stringify(body);
  for (const value of privateValues) expect(serialized.includes(value), 'The safe denial must not reflect private credentials.').toBe(false);
  return failure;
}

test('hosted password production mode uses real provisioning, current approval and memory-only browser sessions', async ({ page, request }, info) => {
  const suffix = randomBytes(8).toString('hex');
  const approved = { username: 'hosted-' + suffix, email: 'hosted-' + suffix + '@example.test', password: '  Owned hosted password ' + randomBytes(16).toString('base64url') + '  ' };
  const unapproved = { username: 'unapproved-' + suffix, email: 'unapproved-' + suffix + '@example.test', password: 'Private unapproved ' + randomBytes(16).toString('base64url') };
  const user = (await save(request, '/api/v1/admin/users', { email: approved.email, displayName: 'Hosted browser ' + suffix, administrator: false }, zSavedUserView, { method: 'POST', status: 201 })).result;
  const server = new PasswordModeServer(info);
  try {
    await server.prepare();
    await server.provision(approved); await server.provision(unapproved);
    await server.start();
    expect(server.encryptedDatabaseConnections).toBeGreaterThan(0);
    await useCase('UC-ACC-0065', async () => {
      const wrong = 'Wrong private password ' + randomBytes(12).toString('base64url');
      const response = await request.post(server.origin + passwordPath, { data: { username: approved.username, password: wrong } });
      expect(response.status()).toBe(401);
      const failure = await safeDenial(response, 'authentication_required', [approved.username, approved.password, wrong, approved.email]);
      expect(failure.error.message).toBe('The username or password is incorrect.');
      expect(failure.error.nextAction).toBe('sign_in');
    }, 'rest');
    await useCase('UC-ACC-0066', async () => {
      const response = await request.post(server.origin + passwordPath, { data: { username: unapproved.username, password: unapproved.password } });
      expect(response.status()).toBe(403);
      const failure = await safeDenial(response, 'account_inactive', [unapproved.username, unapproved.password, unapproved.email]);
      expect(failure.error.nextAction).toBe('contact_administrator');
      expect(failure.error.message).toBe('An active approved company account is required.');
    }, 'rest');
    const session = await useCase('UC-ACC-0064', async () => {
      const response = await request.post(server.origin + passwordPath, { data: { username: approved.username, password: approved.password } });
      expect(response.status()).toBe(200); expect(response.headers()['cache-control']).toBe('no-store');
      const session = zLocalSession.parse(await response.json());
      expect(Date.parse(session.expiresAt)).toBeGreaterThan(Date.now());
      const me = await request.get(server.origin + '/api/v1/me', { headers: { Authorization: 'Bearer ' + session.accessToken } });
      expect(me.status()).toBe(200);
      expect(zMe.parse(await me.json())).toEqual({ userId: user.id, email: approved.email, displayName: user.displayName, administrator: false, companyTimeZone: 'Africa/Cairo' });
      return session;
    }, 'rest');
    await useCase('UC-ACC-0069', async () => {
      const encoded = session.accessToken.split('.')[1];
      if (!encoded) throw new Error('The real password service did not issue a signed token.');
      const payload: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
      const claims = z.object({ iss: z.string(), sub: z.string(), aud: z.array(z.string()), scope: z.string() }).parse(payload);
      expect(claims.iss).toBe(server.origin + '/'); expect(claims.sub).toBe('password|' + approved.username);
      expect(claims.aud).toEqual([server.origin + '/api']); expect(claims.scope).toBe('gategoldjira:access');
      const accepted = await request.get(server.origin + '/api/v1/me', { headers: { Authorization: 'Bearer ' + session.accessToken } });
      expect(accepted.status()).toBe(200); expect(zMe.parse(await accepted.json()).userId).toBe(user.id);
    }, 'rest');
    await useCase('UC-ACC-0069', async () => {
      const response = await request.post(server.origin + '/mcp', { headers: { Authorization: 'Bearer ' + session.accessToken, Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' }, data: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
      expect(response.status()).toBe(401);
      expect(response.headers()['www-authenticate']).toBe('Bearer resource_metadata="' + server.origin + '/.well-known/oauth-protected-resource/mcp"');
      const failure = zFailureBody.parse(await response.json());
      expect(failure.error.code).toBe('authentication_required'); expect(failure.error.nextAction).toBe('sign_in');
      expect(failure.current).toBeNull();
    }, 'mcp');
    await useCase('UC-ACC-0067', async () => {
      // A valid ordinary-development actor reaches route dispatch; a missing
      // bearer would only prove the generic authentication middleware.
      const response = await request.post(apiOrigin + passwordPath, { headers: await authorization(), data: { username: approved.username, password: approved.password } });
      expect(response.status()).toBe(404);
      expect((await response.text()).includes(approved.password)).toBe(false);
    }, 'rest');
    await useCase('UC-ACC-0064', async () => {
      await page.goto(server.origin + '/sign-in');
      await expect(page.getByRole('heading', { name: 'Welcome to GateGoldJira', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign in locally', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Continue with Google', exact: true })).toHaveCount(0);
      await expect(page.getByText('Local development · Test accounts only.', { exact: false })).toHaveCount(0);
      const current = page.waitForResponse(response => response.url() === server.origin + '/api/v1/me' && response.status() === 200);
      await signIn(page, server, approved);
      expect(zMe.parse(await (await current).json()).userId).toBe(user.id);
      await expect(page.getByRole('heading', { name: 'Welcome, ' + user.displayName, exact: true })).toBeVisible();
    }, 'web');
    await useCase('UC-ACC-0068', async () => {
      const timeOrigin = await page.evaluate(() => performance.timeOrigin);
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Welcome, ' + user.displayName, exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
      await signIn(page, server, approved);
      await expect(page.getByRole('heading', { name: 'Welcome, ' + user.displayName, exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Welcome, ' + user.displayName, exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)).some(key => /token|password|session/i.test(key)))).toBe(false);
    }, 'web');
  } finally { await server.stop(); }
});
