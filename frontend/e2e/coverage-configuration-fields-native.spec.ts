import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { localFixturesAvailable, signIn } from './support/session';
import { coverageConfiguration, coverageGet, coverageIssue, coverageProject, coverageReadIssue, coverageWrite } from './support/coverage-boards';
import { isolatedProject } from './support/project';
import { coverageFields } from './support/coverage-issues';
import { zPageFieldDefinition, zPageFieldOptionView, zSavedFieldSaved, zSavedFieldOptionSaved } from '../src/app/api/generated/zod.gen';
import type { FieldDefinition } from '../src/app/api/generated/types.gen';

test.skip(!localFixturesAvailable, 'Requires the disposable real Go/PostgreSQL company.');
test.use({ trace: 'off' });
test.describe.configure({ timeout: 90000 });
const web = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
async function fields(request: APIRequestContext, project: string) { return coverageGet(request, `/api/v2/projects/${project}/fields?includeRetired=true&limit=100`, zPageFieldDefinition); }
async function savedField(page: Page, status = 200) {
  const reply = page.waitForResponse(response => response.request().method() === 'PUT' && /\/fields\/[^/]+$/.test(new URL(response.url()).pathname));
  await page.getByRole('button', { name: 'Save field', exact: true }).click();
  const response = await reply; expect(response.status()).toBe(status);
  if (status >= 400) { await expect(page.getByRole('alert')).toBeVisible(); return null; }
  const field = zSavedFieldSaved.parse(await response.json()).result.field;
  await expect(page.getByRole('button', { name: 'Edit ' + field.name, exact: true })).toBeVisible();
  return field;
}
async function newField(page: Page, name: string, key: string, kind: FieldDefinition['kind']) {
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Stable key', { exact: true }).fill(key);
  await page.getByRole('combobox', { name: 'Value type', exact: true }).selectOption(kind);
}

for (const row of [
  { id: 'UC-CFG-0033', name: 'Native text default', key: 'native_text', kind: 'text', raw: 'نص افتراضي', value: { kind: 'text', text: 'نص افتراضي' } },
  { id: 'UC-CFG-0034', name: 'Native decimal default', key: 'native_number', kind: 'number', raw: '123456789.123456789', value: { kind: 'number', number: '123456789.123456789' } },
  { id: 'UC-CFG-0035', name: 'Native date default', key: 'native_date', kind: 'date', raw: '2028-02-29', value: { kind: 'date', date: '2028-02-29' } },
] as const) test('native custom definition retains its typed ' + row.kind + ' creation default', async ({ page, request }) => {
  const project = await coverageProject(request);
  await signIn(page, 'owner', `/projects/${project}/fields`, /^Custom fields$/);
  await web(row.id, async () => {
    await newField(page, row.name, row.key, row.kind); await page.getByLabel('Creation default', { exact: true }).fill(row.raw);
    const field = await savedField(page, 201); expect(field).toMatchObject({ name: row.name, key: row.key, kind: row.kind, defaultValue: row.value });
    await signIn(page, 'owner', `/projects/${project}/fields`, /^Custom fields$/); await expect(page.getByRole('button', { name: 'Edit ' + row.name, exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Edit ' + row.name, exact: true }).click(); await expect(page.getByLabel('Creation default', { exact: true })).toHaveValue(row.raw);
  });
});

test('native person definition chooses an eligible member through the real default picker', async ({ page, request }) => {
  const project = await coverageProject(request);
  await signIn(page, 'owner', `/projects/${project}/fields`, /^Custom fields$/);
  await web('UC-CFG-0037', async () => {
    await newField(page, 'Native person default', 'native_person', 'user');
    await page.getByRole('combobox', { name: 'Creation default', exact: true }).fill('مطور');
    await page.getByRole('option', { name: 'مطور تجريبي', exact: true }).click();
    const field = await savedField(page, 201); expect(field?.defaultValue).toEqual({ kind: 'user', userId: '10000000-0000-4000-8000-000000000002' });
    await page.getByRole('button', { name: 'Edit Native person default', exact: true }).click(); await expect(page.getByRole('button', { name: 'Remove مطور تجريبي', exact: true })).toBeVisible();
  });
});

test('native fields retain identity while names and future defaults change independently of existing work', async ({ page, request }) => {
  const project = await coverageProject(request);
  await signIn(page, 'owner', `/projects/${project}/fields`, /^Custom fields$/);
  await newField(page, 'Native evidence', 'native_evidence', 'text'); await page.getByLabel('Creation default', { exact: true }).fill('First default');
  const field = (await savedField(page, 201))!;
  const before = await coverageIssue(request, project);
  await web('UC-CFG-0031', async () => { const row = page.getByRole('row').filter({ hasText: 'Native evidence' }); await expect(row).toContainText('text'); await expect(row).toContainText('Optional'); await expect(row).toContainText('Active'); });
  await web('UC-CFG-0038', async () => {
    await page.getByRole('button', { name: 'Edit Native evidence', exact: true }).click(); await page.getByLabel('Name', { exact: true }).fill('Native renamed evidence');
    expect(await savedField(page)).toMatchObject({ id: field.id, key: field.key, name: 'Native renamed evidence' });
    await expect(page.getByRole('button', { name: 'Edit Native renamed evidence', exact: true })).toBeVisible();
  });
  await web('UC-CFG-0039', async () => {
    await page.getByRole('button', { name: 'Edit Native renamed evidence', exact: true }).click(); await page.getByLabel('Creation default', { exact: true }).fill('Second default');
    expect((await savedField(page))?.defaultValue).toEqual({ kind: 'text', text: 'Second default' });
    expect((await coverageFields(request, before.summary.id)).values).toContainEqual({ fieldId: field.id, value: { kind: 'text', text: 'First default' } });
    const next = await coverageIssue(request, project); expect((await coverageFields(request, next.summary.id)).values).toContainEqual({ fieldId: field.id, value: { kind: 'text', text: 'Second default' } });
  });
  await web('UC-CFG-0040', async () => {
    await page.getByRole('button', { name: 'Edit Native renamed evidence', exact: true }).click(); await page.getByLabel('Creation default', { exact: true }).clear();
    expect((await savedField(page))?.defaultValue).toBeNull();
    expect((await coverageFields(request, (await coverageIssue(request, project)).summary.id)).values.some(value => value.fieldId === field.id)).toBe(false);
  });
  await web('UC-CFG-0043', async () => {
    await page.getByRole('button', { name: 'Edit Native renamed evidence', exact: true }).click(); await page.getByRole('combobox', { name: 'Value type', exact: true }).selectOption('date');
    await savedField(page, 422); expect((await fields(request, project)).items.find(value => value.id === field.id)?.kind).toBe('text');
  });
});

test('native field preparation backfills bounded batches before enabling and later retiring a required field', async ({ page, request }) => {
  const project = await coverageProject(request);
  for (let index = 0; index < 101; index++) await coverageIssue(request, project, { title: 'Missing field fixture ' + index });
  await signIn(page, 'owner', `/projects/${project}/fields`, /^Custom fields$/);
  await newField(page, 'Native batch evidence', 'native_batch', 'text'); await page.getByLabel('Creation default', { exact: true }).fill('Prepared default');
  const field = (await savedField(page, 201))!;
  const existing = await coverageIssue(request, project, { title: 'Existing explicit value', fieldValues: [{ fieldId: field.id, value: { kind: 'text', text: 'Keep explicit value' } }] });
  await web('UC-CFG-0049', async () => {
    await page.getByRole('button', { name: 'Edit Native batch evidence', exact: true }).click(); await page.getByRole('checkbox', { name: 'Required on every issue', exact: true }).check();
    await savedField(page, 422); await expect(page.getByRole('alert')).toContainText(/fill|backfill|missing/i); expect((await fields(request, project)).items.find(value => value.id === field.id)?.required).toBe(false);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
  await web('UC-CFG-0065', async () => { await page.getByRole('button', { name: 'Fill missing values', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: '100 issues updated; 1 still missing this default.' })).toBeVisible(); });
  await web('UC-CFG-0066', async () => {
    await page.getByRole('button', { name: 'Fill missing values', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: '1 issues updated; 0 still missing this default.' })).toBeVisible();
    expect((await coverageFields(request, existing.summary.id)).values).toContainEqual({ fieldId: field.id, value: { kind: 'text', text: 'Keep explicit value' } });
  });
  await web('UC-CFG-0050', async () => { await page.getByRole('button', { name: 'Edit Native batch evidence', exact: true }).click(); await page.getByRole('checkbox', { name: 'Required on every issue', exact: true }).check(); expect((await savedField(page))?.required).toBe(true); await expect(page.getByRole('row').filter({ hasText: 'Native batch evidence' })).toContainText('Required'); });
  await web('UC-CFG-0052', async () => { await page.getByRole('button', { name: 'Edit Native batch evidence', exact: true }).click(); await page.getByRole('checkbox', { name: 'Retired', exact: true }).check(); await savedField(page, 422); expect((await fields(request, project)).items.find(value => value.id === field.id)).toMatchObject({ required: true, retired: false }); await page.getByRole('button', { name: 'Cancel', exact: true }).click(); });
  await web('UC-CFG-0051', async () => { await page.getByRole('button', { name: 'Edit Native batch evidence', exact: true }).click(); await page.getByRole('checkbox', { name: 'Required on every issue', exact: true }).uncheck(); expect((await savedField(page))?.required).toBe(false); await expect(page.getByRole('row').filter({ hasText: 'Native batch evidence' })).toContainText('Optional'); });
  await web('UC-CFG-0054', async () => { await page.getByRole('button', { name: 'Edit Native batch evidence', exact: true }).click(); await page.getByRole('checkbox', { name: 'Retired', exact: true }).check(); expect((await savedField(page))?.retired).toBe(true); await expect(page.getByRole('row').filter({ hasText: 'Native batch evidence' })).toContainText('Retired'); expect((await coverageFields(request, existing.summary.id)).values).toContainEqual({ fieldId: field.id, value: { kind: 'text', text: 'Keep explicit value' } }); });
});

test('native global requirement validates legacy mode and whitespace required defaults', async ({ page, request }) => {
  const project = await isolatedProject(request);
  await signIn(page, 'owner', `/projects/${project}/fields`, /^Custom fields$/);
  await web('UC-CFG-0048', async () => {
    await newField(page, 'Legacy requirement', 'legacy_required', 'text'); await page.getByLabel('Creation default', { exact: true }).fill('Prepared'); await page.getByRole('checkbox', { name: 'Required on every issue', exact: true }).check();
    await savedField(page, 422); await expect(page.getByRole('alert')).toContainText(/native|new issue|modern/i); expect((await fields(request, project)).items).toHaveLength(0);
  });
});
