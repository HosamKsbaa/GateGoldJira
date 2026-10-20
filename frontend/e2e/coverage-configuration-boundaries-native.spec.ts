import { expect, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { localFixturesAvailable, signIn } from './support/session';
import { isolatedProject } from './support/project';
import { coverageConfiguration, coverageGet, coverageProject, coverageWrite } from './support/coverage-boards';
import { coverageDefinition } from './support/coverage-issues';
import { allCompanyUsers, memberId, save as saveAccess } from './support/coverage-access';
import { zActivationReadiness, zPageTypeView, zPagePriorityView, zSavedPrioritySaved, zSavedConfigurationView, zSavedFieldSaved, zPageFieldDefinition, zPageActivityView, zSavedUserView, zSaveFieldFields } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires disposable real Go/PostgreSQL fixtures.');
test.use({ trace: 'off' });
const web = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
async function fieldSave(page: Page, status: number) { const reply = page.waitForResponse(response => response.request().method() === 'PUT' && /\/fields\/[^/]+$/.test(new URL(response.url()).pathname)); await page.getByRole('button', { name: 'Save field', exact: true }).click(); const response = await reply; expect(response.status()).toBe(status); if (status >= 400) await expect(page.getByRole('alert')).toBeVisible(); return response; }

test('native person default rechecks an actually disabled selected account before saving', async ({ page, request }) => {
  const project = await coverageProject(request), field = await coverageDefinition(request, project, { kind: 'user', name: 'Rechecked person default' });
  const original = (await allCompanyUsers(request)).find(user => user.id === memberId)!; expect(original.active).toBe(true);
  const active = async (value: boolean) => { const current = (await allCompanyUsers(request)).find(user => user.id === memberId)!; return saveAccess(request, '/api/v1/admin/users/' + memberId, { expectedRevision: current.revision, email: current.email, displayName: current.displayName, administrator: current.administrator, active: value }, zSavedUserView); };
  await signIn(page, 'owner', `/projects/${project}/fields`, /^Custom fields$/);
  try {
    await web('UC-CFG-0046', async () => {
      await page.getByRole('button', { name: 'Edit ' + field.name, exact: true }).click(); await page.getByRole('combobox', { name: 'Creation default', exact: true }).fill(original.displayName); await page.getByRole('option', { name: original.displayName, exact: true }).click();
      expect((await active(false)).result.active).toBe(false); const rejected = await fieldSave(page, 422);
      expect(zSaveFieldFields.parse(rejected.request().postDataJSON()).defaultValue).toEqual({ kind: 'user', userId: original.id });
      await expect(page.getByRole('button', { name: 'Remove Unavailable person', exact: true })).toBeVisible();
      expect((await coverageGet(request, `/api/v2/projects/${project}/fields`, zPageFieldDefinition)).items.find(value => value.id === field.id)?.defaultValue).toBeNull();
    });
  } finally { expect((await active(original.active)).result.active).toBe(original.active); }
});

test('native taxonomy lists append exact real type and priority cursor pages', async ({ page, request }) => {
  const project = await coverageProject(request), root = `/api/v2/projects/${project}`;
  await page.route(url => url.pathname === root + '/issue-types' || url.pathname === root + '/priorities', async route => { if (route.request().method() !== 'GET') return route.continue(); const url = new URL(route.request().url()); url.searchParams.set('limit', '1'); const response = await route.fetch({ url: url.href }); expect(response.status()).toBe(200); await route.fulfill({ response }); });
  await signIn(page, 'owner', `/projects/${project}/settings`, /^Issue configuration$/);
  async function appendAll(family: 'issue-types' | 'priorities') {
    const type = family === 'issue-types';
    const schema = type ? zPageTypeView : zPagePriorityView;
    const endpoint = root + '/' + family + '?includeRetired=true&limit=100';
    const all = type ? await coverageGet(request, endpoint, zPageTypeView) : await coverageGet(request, endpoint, zPagePriorityView);
    const rows = page.locator('.settings-content tbody tr');
    const more = page.getByRole('button', { name: type ? 'More issue types' : 'More priorities', exact: true });
    await expect(rows).toHaveCount(1);
    let count = 1, pages = 0;
    while (await more.count()) {
      expect(pages++).toBeLessThan(10);
      const reply = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === root + '/' + family && new URL(response.url()).searchParams.has('cursor'));
      await more.click();
      const response = await reply;
      expect(response.status()).toBe(200);
      const next = schema.parse(await response.json());
      count += next.items.length;
      await expect(rows).toHaveCount(count);
      if (!next.nextCursor) await expect(more).toHaveCount(0);
    }
    expect(count).toBe(all.items.length);
    for (const item of all.items) await expect(page.getByRole('button', { name: (type ? 'Edit issue type ' : 'Edit priority ') + item.name, exact: true })).toHaveCount(1);
    expect(all.items.length).toBeGreaterThan(1);
  }
  await web('UC-CFG-0002', () => appendAll('issue-types'));
  await page.getByRole('button', { name: 'Priorities', exact: true }).click();
  await web('UC-CFG-0004', () => appendAll('priorities'));
});

test('native taxonomy conflicts retain the visible draft while fresh review preserves unrelated choices', async ({ page, request }) => {
  const project = await coverageProject(request), root = `/api/v2/projects/${project}`;
  await signIn(page, 'owner', `/projects/${project}/settings`, /^Issue configuration$/);
  await page.getByRole('button', { name: 'Edit issue type Task', exact: true }).click(); await page.getByLabel('Type name', { exact: true }).fill('Native reviewed task');
  await coverageWrite(request, 'PUT', root + '/priorities/' + crypto.randomUUID(), { expectedRevision: (await coverageConfiguration(request, project)).revision, key: 'peer_review', name: 'Unrelated peer priority', sortOrder: '9', retired: false }, zSavedPrioritySaved, 201);
  await web('UC-CFG-0069', async () => {
    const reply = page.waitForResponse(response => response.request().method() === 'PUT' && /\/issue-types\/[^/]+$/.test(new URL(response.url()).pathname)); await page.getByRole('button', { name: 'Save issue type', exact: true }).click(); expect((await reply).status()).toBe(409);
    await expect(page.getByLabel('Type name', { exact: true })).toHaveValue('Native reviewed task'); await expect(page.getByRole('button', { name: 'Save issue type', exact: true })).toBeDisabled(); await page.getByRole('button', { name: 'Review latest configuration', exact: true }).click(); await expect(page.getByLabel('Type name', { exact: true })).toHaveValue('Native reviewed task');
    await page.getByRole('button', { name: 'Save issue type', exact: true }).click(); await expect(page.getByRole('button', { name: 'Edit issue type Native reviewed task', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Priorities', exact: true }).click(); await expect(page.getByRole('button', { name: 'Edit priority Unrelated peer priority', exact: true })).toBeVisible();
  });
});

test('native unused field kind changes retain a compatible typed default while blank required text is refused', async ({ page, request }) => {
  const project = await coverageProject(request), field = await coverageDefinition(request, project, { kind: 'text', name: 'Unused native definition' });
  await signIn(page, 'owner', `/projects/${project}/fields`, /^Custom fields$/);
  await web('UC-CFG-0042', async () => { await page.getByRole('button', { name: 'Edit ' + field.name, exact: true }).click(); await page.getByRole('combobox', { name: 'Value type', exact: true }).selectOption('date'); await page.getByLabel('Creation default', { exact: true }).fill('2028-02-29'); const saved = zSavedFieldSaved.parse(await (await fieldSave(page, 200)).json()).result.field; expect(saved).toMatchObject({ id: field.id, key: field.key, kind: 'date', defaultValue: { kind: 'date', date: '2028-02-29' } }); await expect(page.getByRole('row').filter({ hasText: field.name })).toContainText('date'); });
  await web('UC-CFG-0047', async () => { await page.getByRole('button', { name: 'Add field', exact: true }).click(); await page.getByLabel('Name', { exact: true }).fill('Rejected whitespace requirement'); await page.getByLabel('Stable key', { exact: true }).fill('required_whitespace'); await page.getByRole('checkbox', { name: 'Required on every issue', exact: true }).check(); await page.getByLabel('Creation default', { exact: true }).fill('   '); await fieldSave(page, 422); expect((await coverageGet(request, `/api/v2/projects/${project}/fields`, zPageFieldDefinition)).items.some(value => value.key === 'required_whitespace')).toBe(false); });
});

test('native retained choice options and backfill actions reject unavailable legacy configuration safely', async ({ page, request }) => {
  const project = await isolatedProject(request), root = `/api/v2/projects/${project}`;
  const retired = await coverageDefinition(request, project, { kind: 'choice', name: 'Retired native choices', retired: true });
  const defaulted = await coverageDefinition(request, project, { kind: 'text', name: 'Legacy native default', defaultValue: { kind: 'text', text: 'Prepared' } });
  await signIn(page, 'owner', `/projects/${project}/fields`, /^Custom fields$/);
  await web('UC-CFG-0063', async () => { await page.getByRole('row').filter({ hasText: retired.name }).getByRole('button', { name: 'Options', exact: true }).click(); await page.getByLabel('Option name', { exact: true }).fill('Rejected new option'); const received = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname.includes('/fields/' + retired.id + '/options/')); await page.getByRole('button', { name: 'Save option', exact: true }).click(); expect((await received).status()).toBe(422); await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByLabel('Option name', { exact: true })).toHaveValue('Rejected new option'); await page.getByRole('button', { name: 'Close options', exact: true }).click(); });
  await web('UC-CFG-0068', async () => { const received = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.includes('/fields/' + defaulted.id + '/')); await page.getByRole('row').filter({ hasText: defaulted.name }).getByRole('button', { name: 'Fill missing values', exact: true }).click(); expect((await received).status()).toBe(422); await expect(page.getByRole('alert')).toContainText(/native|modern|new issue/i); expect((await coverageConfiguration(request, project)).mode).toBe('legacy'); });
});

test('native activation reviews exact revisions rejects a stale snapshot and accepts fresh explicit confirmation', async ({ page, request }) => {
  const project = await isolatedProject(request), root = `/api/v2/projects/${project}`, path = root + '/configuration/activation';
  await signIn(page, 'owner', `/projects/${project}/settings`, /^Issue configuration$/); const section = page.locator('gg-project-activation');
  const review = async () => { const response = page.waitForResponse(reply => reply.request().method() === 'GET' && new URL(reply.url()).pathname === path); await section.getByRole('button', { name: 'Review activation', exact: true }).click(); const received = await response; expect(received.status()).toBe(200); return zActivationReadiness.parse(await received.json()); };
  const initial = await web('UC-CFG-0076', async () => { const result = await review(); expect(result).toMatchObject({ ready: true, issueCount: '0' }); expect(result.configuration.revision).toBe((await coverageConfiguration(request, project)).revision); expect(result.defaultBoardId).not.toBeNull(); expect(result.defaultBoardRevision).not.toBeNull(); expect(result.projectRevision).toMatch(/^[1-9][0-9]*$/); await expect(section.getByRole('status').filter({ hasText: 'are ready' })).toBeVisible(); await expect(section.getByRole('button', { name: 'Activate new issue mode', exact: true })).toBeDisabled(); return result; });
  await coverageWrite(request, 'PUT', root + '/priorities/' + crypto.randomUUID(), { expectedRevision: initial.configuration.revision, key: 'peer_activation', name: 'Concurrent activation prerequisite', sortOrder: '5', retired: false }, zSavedPrioritySaved, 201);
  await web('UC-CFG-0086', async () => { await section.getByRole('checkbox', { name: 'Confirm new issue mode', exact: true }).check(); const reply = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === path); await section.getByRole('button', { name: 'Activate new issue mode', exact: true }).click(); expect((await reply).status()).toBe(409); await expect(section.getByRole('alert')).toBeVisible(); await expect(section.getByRole('checkbox', { name: 'Confirm new issue mode', exact: true })).toHaveCount(0); expect((await coverageConfiguration(request, project)).mode).toBe('legacy'); });
  await web('UC-CFG-0084', async () => { const fresh = await review(); expect(fresh.ready).toBe(true); expect(fresh.configuration.revision).not.toBe(initial.configuration.revision); await section.getByRole('checkbox', { name: 'Confirm new issue mode', exact: true }).check(); const reply = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === path); await section.getByRole('button', { name: 'Activate new issue mode', exact: true }).click(); const response = await reply; expect(response.status()).toBe(200); const saved = zSavedConfigurationView.parse(await response.json()); expect(saved.result.mode).toBe('modern'); expect(saved.receipt.eventId).not.toBeNull(); await expect(section.getByRole('status')).toContainText('New issue mode is active.'); const history = await coverageGet(request, `/api/v1/admin/activity?resourceKind=project&resourceId=${project}`, zPageActivityView); expect(history.items.some(event => event.id === saved.receipt.eventId)).toBe(true); });
});
