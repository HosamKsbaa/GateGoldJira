import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { join } from 'node:path';
import { z } from 'zod';
import { zSavedMembershipView, zCreatedToken, zTokenView, zFailureBody, zSavedUserView } from '../src/app/api/generated/zod.gen';
import { callTool, save } from './support/coverage-access';
import {
  apiOrigin,
  localFixturesAvailable,
  configureLocalSignIn,
  fillCredentials,
  signIn,
  token,
} from './support/session';

const projectId = '20000000-0000-4000-8000-000000000001';
const memberId = '10000000-0000-4000-8000-000000000002';
test.skip(
  !localFixturesAvailable,
  'Use make test-browser for isolated real identities and PostgreSQL.',
);

test('username/password login rejects wrong credentials, then signs in without browser persistence', async ({
  page,
}) => {
  await configureLocalSignIn(page);
  await page.goto('/admin/users');
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
  await page.getByLabel('Username', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
  const rejected = page.waitForResponse(response =>
    response.url().endsWith('/api/v1/auth/local-sign-in'),
  );
  await page.getByRole('button', { name: 'Sign in locally' }).click();
  expect((await rejected).status()).toBe(401);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
  await fillCredentials(page, 'owner');
  await page.getByRole('button', { name: 'Sign in locally' }).click();
  await expect(page.getByRole('heading', { name: 'Company users', exact: true })).toBeVisible();
  const storedValues = await page.evaluate(() => [
    ...Object.values(localStorage),
    ...Object.values(sessionStorage),
  ]);
  expect(storedValues).toEqual([]);
  expect(await page.context().cookies()).toEqual([]);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await fillCredentials(page, 'owner');
  await page.getByRole('button', { name: 'Sign in locally' }).click();
  await expect(page.getByRole('heading', { name: /Welcome,/ })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/);
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
});

test('correct credentials for an inactive account cannot open company data', async ({ page }) => {
  await configureLocalSignIn(page);
  await page.goto('/');
  await fillCredentials(page, 'disabled');
  const rejected = page.waitForResponse(response =>
    response.url().endsWith('/api/v1/auth/local-sign-in'),
  );
  await page.getByRole('button', { name: 'Sign in locally' }).click();
  expect((await rejected).status()).toBe(403);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Projects', exact: true })).toHaveCount(0);
});

test('approved local roles, Arabic forms, project membership and sign-out', async ({ page }) => {
  await signIn(page, 'owner');
  await page.getByRole('link', { name: 'Users', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Company users' })).toBeVisible();
  const displayName = 'مستخدم جديد 😀 ' + crypto.randomUUID().slice(0, 8);
  const email = 'browser-new-' + crypto.randomUUID() + '@example.test';
  const findAccount = async (name: string) => {
    const row = page.locator('.records > li').filter({ has: page.getByRole('button', { name: 'Edit ' + name, exact: true }) });
    while (await row.count() === 0) {
      const more = page.getByRole('button', { name: 'More users', exact: true });
      await expect(more).toBeVisible(); await expect(more).toBeEnabled();
      const count = await page.locator('.records > li').count(); await more.click();
      await expect.poll(() => page.locator('.records > li').count()).toBeGreaterThan(count);
    }
    return row;
  };
  const approved = await useCase('UC-ACC-0041', async () => {
    await page.getByLabel('Display name', { exact: true }).fill(displayName);
    await expect(page.getByLabel('Display name', { exact: true })).toHaveAttribute('dir', 'auto');
    await page.getByLabel('Email', { exact: true }).fill(email);
    const response = page.waitForResponse(reply => reply.request().method() === 'POST' && new URL(reply.url()).pathname === '/api/v1/admin/users');
    await page.getByRole('button', { name: 'Approve user' }).click();
    expect((await response).status()).toBe(201);
    const saved = zSavedUserView.parse(await (await response).json());
    await expect(page.getByText('User approved.', { exact: true })).toBeVisible();
    const row = await findAccount(displayName);
    await expect(row.locator('strong[dir=auto]')).toHaveText(displayName);
    await expect(row.locator('strong[dir=auto]')).toHaveCSS('direction', 'rtl');
    await expect(row).toContainText(email); expect(saved.result.displayName).toBe(displayName);
    return saved.result;
  }, 'web');
  const currentName = 'تم تحديث الحساب 😀 ' + crypto.randomUUID().slice(0, 8);
  await (await findAccount(displayName)).getByRole('button', { name: 'Edit ' + displayName, exact: true }).click();
  await page.getByLabel('Display name', { exact: true }).fill('مسودة لم تحفظ');
  const changed = (await save(page.request, '/api/v1/admin/users/' + approved.id, { expectedRevision: approved.revision, email, displayName: currentName, active: approved.active, administrator: approved.administrator }, zSavedUserView)).result;
  await useCase('UC-ACC-0053', async () => {
    const conflict = page.waitForResponse(reply => reply.request().method() === 'PUT' && new URL(reply.url()).pathname === '/api/v1/admin/users/' + approved.id);
    await page.getByRole('button', { name: 'Save account', exact: true }).click(); expect((await conflict).status()).toBe(409);
    await expect(page.getByText('Current account:', { exact: false })).toContainText(currentName);
    await expect(page.getByLabel('Display name', { exact: true })).toHaveValue('مسودة لم تحفظ');
    await page.getByRole('button', { name: 'Review current account', exact: true }).click();
    await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(changed.displayName);
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue(changed.email);
    await expect(page.getByLabel('Active account', { exact: true })).toBeChecked();
    await expect(page.getByLabel('Company administrator', { exact: true })).not.toBeChecked();
    await expect(page.getByText('Review these current values before saving.', { exact: true })).toBeVisible();
  }, 'web');
  await signIn(page, 'owner', '/admin/projects/' + projectId + '/memberships', /Project access/);
  await expect(page.getByRole('heading', { name: 'Project access' })).toBeVisible();
  await page.getByLabel('Approved user').selectOption(memberId);
  await page.getByLabel('Project role').selectOption('viewer');
  await page.getByRole('button', { name: 'Save membership' }).click();
  await expect(page.getByText('Project role saved.', { exact: true })).toBeVisible();
  await page.getByLabel('Approved user').selectOption(memberId);
  await page.getByLabel('Project role').selectOption('member');
  const restored = page.waitForResponse(
    response =>
      response.request().method() === 'PUT' && response.url().includes('/memberships/' + memberId),
  );
  await page.getByRole('button', { name: 'Save membership' }).click();
  const response = await restored;
  expect(response.status()).toBe(200);
  const result: unknown = await response.json();
  expect(zSavedMembershipView.parse(result).result.role).toBe('member');
  await expect(page.getByText('Project role saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Welcome to GateGoldJira' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
  await page.goto('/admin/users');
  await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/);
  await signIn(page, 'viewer', '/admin/users');
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);
  await page.reload();
  await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/);
});

test('next request enforces account disable and clears protected state', async ({
  page,
  browser,
  request,
}) => {
  const context = await browser.newContext();
  const ownerPage = await context.newPage();
  let credential: z.infer<typeof zCreatedToken> | undefined;
  try {
    await signIn(ownerPage, 'owner', '/admin/users', /Company users/);
    await ownerPage.getByRole('button', { name: 'Edit مطور تجريبي', exact: true }).click();
    await ownerPage.getByLabel('Company administrator', { exact: true }).check();
    await ownerPage.getByRole('button', { name: 'Save account' }).click();
    await expect(ownerPage.getByText('Account saved.', { exact: true })).toBeVisible();
    await signIn(page, 'member', '/admin/users', /Company users/);
    await expect(page.getByText('owner@example.test')).toBeVisible();
    credential = await save(request, '/api/v1/me/mcp-tokens', { name: 'Disabled account regression ' + crypto.randomUUID() }, zCreatedToken, { method: 'POST', role: 'member', status: 201 });
    await ownerPage.getByRole('button', { name: 'Edit مطور تجريبي', exact: true }).click();
    await ownerPage.getByLabel('Active account', { exact: true }).uncheck();
    await ownerPage.getByRole('button', { name: 'Save account' }).click();
    await expect(ownerPage.getByText('Account saved.', { exact: true })).toBeVisible();
    await useCase('UC-ACC-0025', async () => {
      await useCase('UC-ACC-0028', async () => {
        await page.getByRole('button', { name: 'Refresh users' }).click();
        await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/);
        await expect(page.getByText('owner@example.test')).toHaveCount(0);
        await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
      }, 'web');
    }, 'web');
    await useCase('UC-ACC-0028', async () => {
      const denied = await request.get(apiOrigin + '/api/v1/me', {
        headers: { Authorization: 'Bearer ' + (await token('member')) },
      });
      expect(denied.status()).toBe(403);
      expect(zFailureBody.parse(await denied.json()).error.code).toBe('account_inactive');
    }, 'rest');
    await useCase('UC-ACC-0028', async () => {
      // This signed human MCP token reaches the transport identity guard;
      // the personal-credential rejection below is a distinct boundary.
      const denied = await callTool(request, 'get_me', {}, await token('member', 'mcp'));
      expect(denied.status()).toBe(403);
      expect(zFailureBody.parse(await denied.json()).error.code).toBe('account_inactive');
    }, 'mcp');
    await useCase('UC-MCP-0029', async () => {
      expect((await callTool(request, 'get_me', {}, credential!.token)).status()).toBe(401);
    }, 'mcp');
  } finally {
    // Restore the dedicated fixture so later story tests can use it.
    await ownerPage.getByRole('button', { name: 'Refresh users' }).click();
    await ownerPage.getByRole('button', { name: 'Edit مطور تجريبي', exact: true }).click();
    await ownerPage.getByLabel('Active account', { exact: true }).check();
    await ownerPage.getByLabel('Company administrator', { exact: true }).uncheck();
    await ownerPage.getByRole('button', { name: 'Save account' }).click();
    await expect(ownerPage.getByText('Account saved.', { exact: true })).toBeVisible();
    if (credential) await save(request, '/api/v1/me/mcp-tokens/' + credential.details.id + '/revoke', {}, zTokenView, { method: 'POST', role: 'member' });
    await context.close();
  }
});

test('last administrator guard and keyboard focus at tablet width', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page, 'owner', '/admin/users', /Company users/);
  await page.getByRole('button', { name: 'Edit Local Owner', exact: true }).click();
  await expect(page.getByLabel('Display name', { exact: true })).toBeFocused();
  await page.getByLabel('Company administrator', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Save account' }).click();
  await expect(page.getByRole('alert')).toContainText(/administrator/i);
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByRole('link', { name: 'Users', exact: true })).toBeVisible();
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence)
    await page.screenshot({ path: join(evidence, 'access-owner-tablet.png'), fullPage: true });
});
