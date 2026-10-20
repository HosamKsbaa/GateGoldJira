import { expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { read, save } from './support/coverage-access';
import { zTokenList, zTokenView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Use the isolated browser runner.');

test('browser sign-in approves an OAuth connection with activity and immediate revocation', async ({ page, request }) => {
  test.setTimeout(60_000);
  const preexistingIds = new Set((await read(request, '/api/v1/me/mcp-tokens', zTokenList, 'member')).items.map(connection => connection.id));
  let ownConnectionId: string | undefined;
  try {
  const verifier = 'abcdefghijklmnopqrstuvwxyz0123456789-._~ABCDE';
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const callback = apiOrigin + '/oauth/callback';
  const query = new URLSearchParams({ client_id: 'gategoldjira-antigravity', response_type: 'code', scope: 'gategoldjira:access', resource: apiOrigin + '/mcp', redirect_uri: callback, state: 'browser-test-state', code_challenge: challenge, code_challenge_method: 'S256' });
  const authorization = await request.get(apiOrigin + '/oauth/authorize?' + query, { maxRedirects: 0 });
  expect(authorization.status()).toBe(302);
  const destination = new URL(authorization.headers()['location']!);
  const appRequest = destination.pathname + destination.search;
  await signIn(page, 'member', appRequest, /Connect Antigravity/);
  await expect(page.getByText('It can read and change records using your current account and project permissions.')).toBeVisible();
  await page.route(callback + '?**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Connection approved</h1>' }));
  await page.getByRole('button', { name: 'Approve connection', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Connection approved', exact: true })).toBeVisible();
  const result = new URL(page.url());
  expect(result.searchParams.get('state')).toBe('browser-test-state');
  expect(result.searchParams.get('iss')).toBe(apiOrigin + '/oauth');
  const created = (await read(request, '/api/v1/me/mcp-tokens', zTokenList, 'member')).items.filter(connection => !preexistingIds.has(connection.id) && connection.kind === 'oauth');
  expect(created).toHaveLength(1); ownConnectionId = created[0]!.id;
  const exchange = await request.post(apiOrigin + '/oauth/token', { form: { grant_type: 'authorization_code', client_id: 'gategoldjira-antigravity', code: result.searchParams.get('code')!, code_verifier: verifier, redirect_uri: callback, resource: apiOrigin + '/mcp' } });
  expect(exchange.status()).toBe(200);
  const credentials = z.object({ access_token: z.string().regex(/^gg_oauth_[A-Za-z0-9_-]{43}$/) }).parse(await exchange.json());
  const me = await request.post(apiOrigin + '/mcp', { headers: { Authorization: 'Bearer ' + credentials.access_token, Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' }, data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_me', arguments: {} } } });
  expect(me.status()).toBe(200);
  expect((await me.json()).result.structuredContent.data.userId).toBe('10000000-0000-4000-8000-000000000002');
  await signIn(page, 'member', '/account/mcp-tokens', /MCP connections/);
  await expect(page.getByRole('heading', { name: 'Connect Antigravity with browser login', exact: true })).toBeVisible();
  const row = page.locator('[data-token-id="' + ownConnectionId + '"]');
  await expect(row).toContainText('Browser OAuth');
  await row.getByRole('button', { name: 'View activity for Antigravity (browser login)', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Token activity', exact: true })).toContainText('get_me');
  await expect(page.getByRole('region', { name: 'Token activity', exact: true })).toContainText('Succeeded');
  const metadata = await request.get(apiOrigin + '/api/v1/me/mcp-tokens', { headers: { Authorization: 'Bearer ' + await token('member') } });
  expect((await metadata.text()).includes(credentials.access_token)).toBe(false);
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  await page.evaluate(() => window.scrollTo(0, 0));
  if (evidence) await page.screenshot({ path: join(evidence, 'mcp-oauth-desktop.png'), fullPage: true });
  await row.getByRole('button', { name: 'Revoke Antigravity (browser login)', exact: true }).click();
  await row.getByRole('button', { name: 'Confirm revoke Antigravity (browser login)', exact: true }).click();
  await expect(row).toContainText('Revoked');
  const revoked = await request.post(apiOrigin + '/mcp', { headers: { Authorization: 'Bearer ' + credentials.access_token, Accept: 'application/json, text/event-stream' }, data: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_me', arguments: {} } } });
  expect(revoked.status()).toBe(401);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (evidence) await page.screenshot({ path: join(evidence, 'mcp-oauth-mobile.png'), fullPage: true });
  } finally {
    if (ownConnectionId) await save(request, '/api/v1/me/mcp-tokens/' + ownConnectionId + '/revoke', {}, zTokenView, { method: 'POST', role: 'member' });
  }
});
