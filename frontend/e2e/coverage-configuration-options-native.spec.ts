import { expect, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { localFixturesAvailable, signIn } from './support/session';
import { coverageConfiguration, coverageGet, coverageProject, coverageWrite } from './support/coverage-boards';
import { coverageDefinition } from './support/coverage-issues';
import { zPageFieldOptionView, zSavedFieldOptionSaved, zSavedFieldSaved, zPageFieldDefinition } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires disposable real Go/PostgreSQL fixtures.');
test.use({ trace: 'off' });
const web = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
async function saveOption(page: Page, status = 200) {
  const received = page.waitForResponse(response => response.request().method() === 'PUT' && /\/options\/[^/]+$/.test(new URL(response.url()).pathname));
  await page.getByRole('button', { name: 'Save option', exact: true }).click();
  const response = await received; expect(response.status()).toBe(status);
  if (status >= 400) { await expect(page.getByRole('alert')).toBeVisible(); return null; }
  const option = zSavedFieldOptionSaved.parse(await response.json()).result.option;
  await expect(page.locator('section.editor li').filter({ hasText: option.name })).toBeVisible();
  await expect(page.getByLabel('Option name', { exact: true })).toHaveValue('');
  return option;
}

test('native choice definitions and their options retain exact identity order defaults and retirement history', async ({ page, request }) => {
  const project = await coverageProject(request), root = `/api/v2/projects/${project}`;
  await signIn(page, 'owner', `/projects/${project}/fields`, /^Custom fields$/);
  let fieldId = '', optionId = '';
  await web('UC-CFG-0036', async () => {
    await page.getByRole('button', { name: 'Add field', exact: true }).click(); await page.getByLabel('Name', { exact: true }).fill('Native choices'); await page.getByLabel('Stable key', { exact: true }).fill('native_choices'); await page.getByRole('combobox', { name: 'Value type', exact: true }).selectOption('choice');
    await expect(page.getByRole('combobox', { name: 'Creation default', exact: true })).toBeDisabled();
    const received = page.waitForResponse(response => response.request().method() === 'PUT' && /\/fields\/[^/]+$/.test(new URL(response.url()).pathname)); await page.getByRole('button', { name: 'Save field', exact: true }).click(); const response = await received; expect(response.status()).toBe(201); const field = zSavedFieldSaved.parse(await response.json()).result.field; fieldId = field.id; expect(field).toMatchObject({ kind: 'choice', defaultValue: null });
    await expect(page.getByRole('row').filter({ hasText: 'Native choices' }).getByRole('button', { name: 'Options', exact: true })).toBeVisible();
  });
  await page.getByRole('row').filter({ hasText: 'Native choices' }).getByRole('button', { name: 'Options', exact: true }).click();
  await web('UC-CFG-0057', async () => { await page.getByLabel('Option name', { exact: true }).fill('Native option'); await page.getByLabel('Position', { exact: true }).fill('2'); const option = (await saveOption(page, 201))!; optionId = option.id; expect(option).toMatchObject({ fieldId, name: 'Native option', position: '2', retired: false }); });
  await web('UC-CFG-0055', async () => { await expect(page.locator('section.editor li').filter({ hasText: 'Native option' })).toContainText('Active'); const values = await coverageGet(request, root + `/fields/${fieldId}/options?includeRetired=true`, zPageFieldOptionView); expect(values.items.map(value => value.id)).toEqual([optionId]); });
  await web('UC-CFG-0058', async () => { await page.locator('section.editor li').filter({ hasText: 'Native option' }).getByRole('button', { name: 'Edit option', exact: true }).click(); await page.getByLabel('Option name', { exact: true }).fill('خيار المراجعة'); expect(await saveOption(page)).toMatchObject({ id: optionId, name: 'خيار المراجعة' }); await expect(page.locator('section.editor li bdi')).toHaveText('خيار المراجعة'); });
  await web('UC-CFG-0059', async () => { await page.locator('section.editor li').filter({ hasText: 'خيار المراجعة' }).getByRole('button', { name: 'Edit option', exact: true }).click(); await page.getByLabel('Position', { exact: true }).fill('9007199254740993'); expect((await saveOption(page))?.position).toBe('9007199254740993'); await expect(page.locator('section.editor li').filter({ hasText: 'خيار المراجعة' })).toContainText('9007199254740993'); });
  await page.getByRole('button', { name: 'Close options', exact: true }).click(); await page.getByRole('button', { name: 'Edit Native choices', exact: true }).click(); await page.getByRole('combobox', { name: 'Creation default', exact: true }).fill('خيار'); await page.getByRole('option', { name: 'خيار المراجعة', exact: true }).click();
  const fieldSaved = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === root + '/fields/' + fieldId); await page.getByRole('button', { name: 'Save field', exact: true }).click(); expect((await fieldSaved).status()).toBe(200);
  await page.getByRole('row').filter({ hasText: 'Native choices' }).getByRole('button', { name: 'Options', exact: true }).click();
  await web('UC-CFG-0061', async () => { await page.locator('section.editor li').filter({ hasText: 'خيار المراجعة' }).getByRole('button', { name: 'Edit option', exact: true }).click(); await page.getByRole('checkbox', { name: 'Retired', exact: true }).check(); await saveOption(page, 422); expect((await coverageGet(request, root + `/fields/${fieldId}/options?includeRetired=true`, zPageFieldOptionView)).items[0]?.retired).toBe(false); });
  await page.getByRole('button', { name: 'Close options', exact: true }).click(); await page.getByRole('button', { name: 'Edit Native choices', exact: true }).click(); await page.getByRole('button', { name: 'Remove خيار المراجعة', exact: true }).click();
  const cleared = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === root + '/fields/' + fieldId); await page.getByRole('button', { name: 'Save field', exact: true }).click(); expect((await cleared).status()).toBe(200);
  await page.getByRole('row').filter({ hasText: 'Native choices' }).getByRole('button', { name: 'Options', exact: true }).click();
  await web('UC-CFG-0060', async () => { await page.locator('section.editor li').filter({ hasText: 'خيار المراجعة' }).getByRole('button', { name: 'Edit option', exact: true }).click(); await page.getByRole('checkbox', { name: 'Retired', exact: true }).check(); expect(await saveOption(page)).toMatchObject({ id: optionId, retired: true }); await expect(page.locator('section.editor li').filter({ hasText: 'خيار المراجعة' })).toContainText('Retired'); });
  await web('UC-CFG-0062', async () => { await page.locator('section.editor li').filter({ hasText: 'خيار المراجعة' }).getByRole('button', { name: 'Edit option', exact: true }).click(); await page.getByRole('checkbox', { name: 'Retired', exact: true }).uncheck(); expect(await saveOption(page)).toMatchObject({ id: optionId, retired: false }); await expect(page.locator('section.editor li').filter({ hasText: 'خيار المراجعة' })).toContainText('Active'); });
});

test('native definition and option pages append actual scoped cursor results', async ({ page, request }) => {
  const project = await coverageProject(request), root = `/api/v2/projects/${project}`;
  const field = await coverageDefinition(request, project, { kind: 'choice', name: 'Paged native choice' }); await coverageDefinition(request, project, { kind: 'text', name: 'Paged native text' });
  for (let index = 0; index < 2; index++) await coverageWrite(request, 'PUT', root + `/fields/${field.id}/options/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, project)).revision, name: 'Paged option ' + index, position: String(index + 1), retired: false }, zSavedFieldOptionSaved, 201);
  await page.route(url => url.pathname === root + '/fields' || url.pathname === root + `/fields/${field.id}/options`, async route => { if (route.request().method() !== 'GET') return route.continue(); const target = new URL(route.request().url()); target.searchParams.set('limit', '1'); const response = await route.fetch({ url: target.href }); expect(response.status()).toBe(200); await route.fulfill({ response }); });
  await signIn(page, 'owner', `/projects/${project}/fields`, /^Custom fields$/);
  await web('UC-CFG-0032', async () => { const actual = await coverageGet(request, root + '/fields?includeRetired=true&limit=100', zPageFieldDefinition); await expect(page.getByRole('button', { name: 'More fields', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'More fields', exact: true }).click(); for (const value of actual.items) await expect(page.getByRole('button', { name: 'Edit ' + value.name, exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: 'More fields', exact: true })).toHaveCount(0); });
  await page.getByRole('row').filter({ hasText: field.name }).getByRole('button', { name: 'Options', exact: true }).click();
  await web('UC-CFG-0056', async () => { await expect(page.locator('section.editor li')).toHaveCount(1); await page.getByRole('button', { name: 'More options', exact: true }).click(); await expect(page.locator('section.editor li')).toHaveCount(2); await expect(page.locator('section.editor li bdi')).toHaveText(['Paged option 0', 'Paged option 1']); await expect(page.getByRole('button', { name: 'More options', exact: true })).toHaveCount(0); });
});
