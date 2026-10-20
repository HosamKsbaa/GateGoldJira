import { expect } from '@playwright/test';
import { join } from 'node:path';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';

test.skip(!localFixturesAvailable, 'Use the isolated browser runner.');

test('each account creates a private token, uses MCP, and revokes it', async ({
  page,
  request,
}) => {
  await signIn(page, 'member', '/account/mcp-tokens', /MCP connections/);
  await expect(page.getByRole('link', { name: 'Account MCP tokens' })).toBeVisible();
  await page.getByLabel('Token name', { exact: true }).fill('Antigravity browser test');
  await page.getByRole('button', { name: 'Generate token' }).click();
  await expect(page.getByRole('heading', { name: 'Token created', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Token created', exact: true })).toBeFocused();
  const secret = await page.getByLabel('Your new MCP token').inputValue();
  expect(/^gg_mcp_[A-Za-z0-9_-]{43}$/.test(secret)).toBe(true);
  await expect(page.getByLabel('Your new MCP token')).toHaveAttribute('type', 'password');
  const response = await request.post(apiOrigin + '/mcp', {
    headers: {
      Authorization: 'Bearer ' + secret,
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get_me', arguments: {} },
    },
  });
  expect(response.status()).toBe(200);
  const identity = await response.json();
  expect(identity.result.structuredContent.data.userId).toBe(
    '10000000-0000-4000-8000-000000000002',
  );
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByLabel('Your new MCP token')).toHaveCount(0);
  await page.getByRole('button', { name: 'Refresh tokens' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Antigravity browser test' });
  await expect(row).toContainText('Active');
  await expect(row).toContainText('Never');
  await page.getByRole('button', { name: 'View activity for Antigravity browser test', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Activity for Antigravity browser test', exact: true })).toBeFocused();
  const activity = page.getByRole('region', { name: 'Token activity', exact: true });
  await expect(activity).toContainText('get_me');
  await expect(activity).toContainText('Succeeded');
  await expect(activity).not.toContainText(secret);
  // A full reload signs in again and cannot recover the one-time credential.
  await signIn(page, 'member', '/account/mcp-tokens', /MCP connections/);
  await expect(page.getByLabel('Your new MCP token')).toHaveCount(0);
  await expect(page.getByRole('row').filter({ hasText: 'Antigravity browser test' })).toBeVisible();
  await signIn(page, 'viewer', '/account/mcp-tokens', /MCP connections/);
  await expect(page.getByText('Antigravity browser test', { exact: true })).toHaveCount(0);
  await page.getByLabel('Token name', { exact: true }).fill('My viewer token');
  await page.getByRole('button', { name: 'Generate token' }).click();
  await expect(page.getByRole('heading', { name: 'Token created', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await signIn(page, 'member', '/account/mcp-tokens', /MCP connections/);
  await expect(page.getByText('My viewer token', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Revoke Antigravity browser test', exact: true }).click();
  await page
    .getByRole('button', { name: 'Confirm revoke Antigravity browser test', exact: true })
    .click();
  await expect(page.getByRole('row').filter({ hasText: 'Antigravity browser test' })).toContainText(
    'Revoked',
  );
  const revoked = await request.post(apiOrigin + '/mcp', {
    headers: { Authorization: 'Bearer ' + secret, Accept: 'application/json, text/event-stream' },
    data: {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'get_me', arguments: {} },
    },
  });
  expect(revoked.status()).toBe(401);
  const metadata = await request.get(apiOrigin + '/api/v1/me/mcp-tokens', {
    headers: { Authorization: 'Bearer ' + (await token('member')) },
  });
  expect((await metadata.text()).includes(secret)).toBe(false);
  await page.getByRole('button', { name: 'View activity for Antigravity browser test', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Token activity', exact: true })).toContainText('get_me');
  await page.evaluate(() => window.scrollTo(0, 0));
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence)
    await page.screenshot({ path: join(evidence, 'mcp-tokens-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Generate token' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  if (evidence)
    await page.screenshot({ path: join(evidence, 'mcp-tokens-mobile.png'), fullPage: true });
});
