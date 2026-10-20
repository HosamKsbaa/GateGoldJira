import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { localFixturesAvailable, signIn } from './support/session';
import { coverageConfiguration, coverageProject, coverageWrite } from './support/coverage-boards';
import { zSavedPrioritySaved } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires disposable real Go/PostgreSQL fixtures.');
test.use({ trace: 'off' });

for (const family of ['priority', 'defaults'] as const) test('native settings protect changed ' + family + ' and release the guard after a successful save', async ({ page, request }) => {
  const project = await coverageProject(request), root = `/api/v2/projects/${project}`;
  const alternate = (await coverageWrite(request, 'PUT', root + '/priorities/' + crypto.randomUUID(), { expectedRevision: (await coverageConfiguration(request, project)).revision, key: 'guard_alternate', name: 'Guard alternate priority', sortOrder: '8', retired: false }, zSavedPrioritySaved, 201)).result.priority;
  await signIn(page, 'owner', `/projects/${project}/settings`, /^Issue configuration$/);
  if (family === 'priority') { await page.getByRole('button', { name: 'Priorities', exact: true }).click(); await page.getByRole('button', { name: 'Edit priority ' + alternate.name, exact: true }).click(); await page.getByLabel('Priority name', { exact: true }).fill('Guard retained priority'); }
  else { await page.getByRole('button', { name: 'Creation defaults', exact: true }).click(); await page.getByRole('combobox', { name: 'Priority', exact: true }).selectOption(alternate.id); }
  let confirmations = 0;
  page.once('dialog', async dialog => { confirmations++; expect(dialog.type()).toBe('confirm'); await dialog.dismiss(); });
  await page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).getByRole('link', { name: 'Project', exact: true }).click();
  await expect.poll(() => confirmations).toBe(1); await expect(page).toHaveURL(new RegExp(`/projects/${project}/settings$`));
  if (family === 'priority') await expect(page.getByLabel('Priority name', { exact: true })).toHaveValue('Guard retained priority');
  else await expect(page.getByRole('combobox', { name: 'Priority', exact: true })).toHaveValue(alternate.id);
  await page.getByRole('button', { name: family === 'priority' ? 'Save priority' : 'Save defaults', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: family === 'priority' ? 'Priority saved.' : 'Creation defaults saved.' })).toBeVisible();
  page.on('dialog', async dialog => { confirmations++; await dialog.accept(); });
  await page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).getByRole('link', { name: 'Project', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${project}$`)); expect(confirmations).toBe(1);
});

test('a rejected save released after leaving settings cannot re-register an obsolete dirty editor', async ({ page, request }) => {
  const project = await coverageProject(request), path = `/projects/${project}/settings`;
  await signIn(page, 'owner', path, /^Issue configuration$/);
  await page.getByRole('button', { name: 'Edit issue type Task', exact: true }).click(); await page.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('subtask');
  let release = () => {}, started = () => {};
  const held = new Promise<void>(resolve => { release = resolve; }), ready = new Promise<void>(resolve => { started = resolve; });
  await page.route(/\/api\/v2\/projects\/[^/]+\/issue-types\/[^/]+$/, async route => { if (route.request().method() !== 'PUT') return route.continue(); const response = await route.fetch(); expect(response.status()).toBe(422); started(); await held; try { await route.fulfill({ response }); } catch { /* Navigation may cancel this already-rejected transport. */ } });
  try {
    await page.getByRole('button', { name: 'Save issue type', exact: true }).click(); await ready;
    let confirmations = 0; page.once('dialog', async dialog => { confirmations++; await dialog.accept(); });
    await page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).getByRole('link', { name: 'Project', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`/projects/${project}$`)); expect(confirmations).toBe(1); release();
    await page.goBack(); await expect(page.getByRole('heading', { name: 'Issue configuration', exact: true })).toBeVisible();
    page.on('dialog', async dialog => { confirmations++; await dialog.accept(); });
    await page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).getByRole('link', { name: 'Project', exact: true }).click(); await expect(page).toHaveURL(new RegExp(`/projects/${project}$`)); expect(confirmations).toBe(1);
  } finally { release(); }
});
