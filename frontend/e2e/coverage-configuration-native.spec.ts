import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { isolatedProject } from './support/project';
import { coverageConfiguration, coverageGet, coverageIssue, coverageProject } from './support/coverage-boards';
import { zPageTypeView, zPagePriorityView, zSavedTypeSaved, zSavedPrioritySaved, zSavedConfigurationView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the disposable real Go/PostgreSQL company.');
test.use({ trace: 'off' });
const web = <T>(id: string, action: () => Promise<T>) => useCase(id, action, 'web');
async function submitted(page: Page, button: string, path: RegExp) {
  const received = page.waitForResponse(response => response.request().method() === 'PUT' && path.test(new URL(response.url()).pathname));
  await page.getByRole('button', { name: button, exact: true }).click();
  return received;
}
async function types(request: APIRequestContext, project: string) {
  return coverageGet(request, `/api/v2/projects/${project}/issue-types?includeRetired=true&limit=100`, zPageTypeView);
}
async function priorities(request: APIRequestContext, project: string) {
  return coverageGet(request, `/api/v2/projects/${project}/priorities?includeRetired=true&limit=100`, zPagePriorityView);
}
const typePath = /\/issue-types\/[^/]+$/;
const priorityPath = /\/priorities\/[^/]+$/;

test('native issue taxonomy creates both behaviors and preserves Arabic, stable identity and historical retirement', async ({ page, request }) => {
  const project = await coverageProject(request);
  await signIn(page, 'owner', `/projects/${project}/settings`, /^Issue configuration$/);
  await web('UC-CFG-0001', async () => {
    await expect(page.getByRole('button', { name: 'Add issue type', exact: true })).toBeEnabled();
    await expect(page.getByRole('row').filter({ has: page.getByText('Task', { exact: true }) })).toContainText('Default');
    const current = await coverageConfiguration(request, project);
    expect(current).toMatchObject({ projectId: project, mode: 'modern', canManage: true });
  });
  let standardId = '', standardKey = '';
  await web('UC-CFG-0006', async () => {
    await page.getByRole('button', { name: 'Add issue type', exact: true }).click();
    await page.getByLabel('Type name', { exact: true }).fill('Native story');
    await page.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('standard');
    const response = await submitted(page, 'Save issue type', typePath); expect(response.status()).toBe(201);
    const saved = zSavedTypeSaved.parse(await response.json()).result.type;
    standardId = saved.id; standardKey = saved.key; expect(saved.behavior).toBe('standard');
    await expect(page.getByRole('row').filter({ hasText: 'Native story' })).toContainText('Standard issue');
  });
  await web('UC-CFG-0007', async () => {
    await page.getByRole('button', { name: 'Add issue type', exact: true }).click();
    await page.getByLabel('Type name', { exact: true }).fill('Native child type');
    await page.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('subtask');
    const response = await submitted(page, 'Save issue type', typePath); expect(response.status()).toBe(201);
    expect(zSavedTypeSaved.parse(await response.json()).result.type.behavior).toBe('subtask');
    await expect(page.getByRole('row').filter({ hasText: 'Native child type' })).toContainText('Subtask');
  });
  await web('UC-CFG-0008', async () => {
    await page.getByRole('button', { name: 'Edit issue type Native story', exact: true }).click();
    await page.getByLabel('Type name', { exact: true }).fill('Native renamed story');
    const response = await submitted(page, 'Save issue type', typePath); expect(response.status()).toBe(200);
    expect(zSavedTypeSaved.parse(await response.json()).result.type).toMatchObject({ id: standardId, key: standardKey, name: 'Native renamed story' });
    await expect(page.getByRole('button', { name: 'Edit issue type Native renamed story', exact: true })).toBeVisible();
  });
  await web('UC-CFG-0018', async () => {
    await page.getByRole('button', { name: 'Add issue type', exact: true }).click();
    await page.getByLabel('Type name', { exact: true }).fill('قصة الفريق 😀');
    const response = await submitted(page, 'Save issue type', typePath); expect(response.status()).toBe(201);
    expect(zSavedTypeSaved.parse(await response.json()).result.type.name).toBe('قصة الفريق 😀');
    await expect(page.getByRole('row').filter({ hasText: 'قصة الفريق 😀' }).locator('strong')).toHaveAttribute('dir', 'auto');
    await signIn(page, 'owner', `/projects/${project}/settings`, /^Issue configuration$/); await expect(page.getByRole('button', { name: 'Edit issue type قصة الفريق 😀', exact: true })).toBeVisible();
  });
  await web('UC-CFG-0009', async () => {
    await page.getByRole('button', { name: 'Edit issue type Native renamed story', exact: true }).click();
    await page.getByLabel('Retire this type', { exact: true }).check();
    const response = await submitted(page, 'Save issue type', typePath); expect(response.status()).toBe(200);
    expect(zSavedTypeSaved.parse(await response.json()).result.type).toMatchObject({ id: standardId, retired: true });
    await expect(page.getByRole('row').filter({ hasText: 'Native renamed story' })).toContainText('Retired');
  });
  await web('UC-CFG-0003', async () => {
    await signIn(page, 'owner', `/projects/${project}/settings`, /^Issue configuration$/); await expect(page.getByRole('row').filter({ hasText: 'Native renamed story' })).toContainText('Retired');
    expect((await types(request, project)).items.find(value => value.id === standardId)?.retired).toBe(true);
  });
  await web('UC-CFG-0013', async () => {
    await page.getByRole('button', { name: 'Edit issue type Native renamed story', exact: true }).click();
    await page.getByLabel('Retire this type', { exact: true }).uncheck();
    const response = await submitted(page, 'Save issue type', typePath); expect(response.status()).toBe(200);
    expect(zSavedTypeSaved.parse(await response.json()).result.type).toMatchObject({ id: standardId, key: standardKey, retired: false });
    await expect(page.getByRole('row').filter({ hasText: 'Native renamed story' })).toContainText('Active');
  });
});

test('native taxonomy refuses invalid names and protects current type behavior/default replacement', async ({ page, request }) => {
  const project = await coverageProject(request), before = await coverageConfiguration(request, project);
  await signIn(page, 'owner', `/projects/${project}/settings`, /^Issue configuration$/);
  await web('UC-CFG-0017', async () => {
    await page.getByRole('button', { name: 'Add issue type', exact: true }).click();
    for (const name of ['', 'x'.repeat(61)]) {
      await page.getByLabel('Type name', { exact: true }).fill(name);
      await expect(page.getByRole('button', { name: 'Save issue type', exact: true })).toBeDisabled();
    }
    expect((await coverageConfiguration(request, project)).revision).toBe(before.revision);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
  await web('UC-CFG-0015', async () => {
    await page.getByRole('button', { name: 'Edit issue type Task', exact: true }).click();
    await page.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('subtask');
    const response = await submitted(page, 'Save issue type', typePath); expect(response.status()).toBe(422);
    await expect(page.getByRole('alert')).toBeVisible();
    expect((await types(request, project)).items.find(value => value.id === before.defaults.standardTypeId)?.behavior).toBe('standard');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
  await web('UC-CFG-0011', async () => {
    await page.getByRole('button', { name: 'Edit issue type Task', exact: true }).click();
    await page.getByLabel('Retire this type', { exact: true }).check();
    await expect(page.getByRole('combobox', { name: 'Replacement default', exact: true })).toHaveValue('');
    const response = await submitted(page, 'Save issue type', typePath); expect(response.status()).toBe(422);
    await expect(page.getByRole('alert')).toBeVisible();
    expect((await coverageConfiguration(request, project)).defaults.standardTypeId).toBe(before.defaults.standardTypeId);
    expect((await types(request, project)).items.find(value => value.id === before.defaults.standardTypeId)?.retired).toBe(false);
  });
});

test('native priorities retain exact order and identity through rename retirement and restoration', async ({ page, request }) => {
  const project = await coverageProject(request);
  await signIn(page, 'owner', `/projects/${project}/settings`, /^Issue configuration$/);
  await page.getByRole('button', { name: 'Priorities', exact: true }).click();
  let id = '', key = '';
  await web('UC-CFG-0019', async () => {
    await page.getByRole('button', { name: 'Add priority', exact: true }).click();
    await page.getByLabel('Priority name', { exact: true }).fill('Native urgency');
    await page.getByLabel('Order', { exact: true }).fill('9');
    const response = await submitted(page, 'Save priority', priorityPath); expect(response.status()).toBe(201);
    const saved = zSavedPrioritySaved.parse(await response.json()).result.priority; id = saved.id; key = saved.key;
    expect(saved).toMatchObject({ name: 'Native urgency', sortOrder: '9', retired: false });
    await expect(page.getByRole('row').filter({ hasText: 'Native urgency' })).toContainText('Active');
  });
  await web('UC-CFG-0020', async () => {
    await page.getByRole('button', { name: 'Edit priority Native urgency', exact: true }).click();
    await page.getByLabel('Priority name', { exact: true }).fill('Native renamed urgency');
    const response = await submitted(page, 'Save priority', priorityPath); expect(response.status()).toBe(200);
    expect(zSavedPrioritySaved.parse(await response.json()).result.priority).toMatchObject({ id, key, name: 'Native renamed urgency' });
    await expect(page.getByRole('button', { name: 'Edit priority Native renamed urgency', exact: true })).toBeVisible();
  });
  await web('UC-CFG-0021', async () => {
    await page.getByRole('button', { name: 'Edit priority Native renamed urgency', exact: true }).click();
    await page.getByLabel('Order', { exact: true }).fill('9007199254740993');
    const response = await submitted(page, 'Save priority', priorityPath); expect(response.status()).toBe(200);
    expect(zSavedPrioritySaved.parse(await response.json()).result.priority.sortOrder).toBe('9007199254740993');
    await expect(page.getByRole('row').filter({ hasText: 'Native renamed urgency' })).toContainText('9007199254740993');
  });
  await web('UC-CFG-0022', async () => {
    await page.getByRole('button', { name: 'Edit priority Native renamed urgency', exact: true }).click();
    for (const order of ['0', '-1']) { await page.getByLabel('Order', { exact: true }).fill(order); await expect(page.getByRole('button', { name: 'Save priority', exact: true })).toBeDisabled(); }
    expect((await priorities(request, project)).items.find(value => value.id === id)?.sortOrder).toBe('9007199254740993');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
  await web('UC-CFG-0024', async () => {
    await page.getByRole('button', { name: 'Edit priority Native renamed urgency', exact: true }).click();
    await page.getByLabel('Retire this priority', { exact: true }).check();
    const response = await submitted(page, 'Save priority', priorityPath); expect(response.status()).toBe(200);
    expect(zSavedPrioritySaved.parse(await response.json()).result.priority).toMatchObject({ id, retired: true });
    await expect(page.getByRole('row').filter({ hasText: 'Native renamed urgency' })).toContainText('Retired');
  });
  await web('UC-CFG-0005', async () => { await signIn(page, 'owner', `/projects/${project}/settings`, /^Issue configuration$/); await page.getByRole('button', { name: 'Priorities', exact: true }).click(); await expect(page.getByRole('row').filter({ hasText: 'Native renamed urgency' })).toContainText('Retired'); });
  await web('UC-CFG-0027', async () => {
    await page.getByRole('button', { name: 'Edit priority Native renamed urgency', exact: true }).click();
    await page.getByLabel('Retire this priority', { exact: true }).uncheck();
    const response = await submitted(page, 'Save priority', priorityPath); expect(response.status()).toBe(200);
    expect(zSavedPrioritySaved.parse(await response.json()).result.priority).toMatchObject({ id, key, retired: false });
    await expect(page.getByRole('row').filter({ hasText: 'Native renamed urgency' })).toContainText('Active');
  });
});

test('native creation defaults and their replacements apply atomically to future work', async ({ page, request }) => {
  const project = await coverageProject(request), initial = await coverageConfiguration(request, project);
  await signIn(page, 'owner', `/projects/${project}/settings`, /^Issue configuration$/);
  await page.getByRole('button', { name: 'Add issue type', exact: true }).click(); await page.getByLabel('Type name', { exact: true }).fill('Replacement standard');
  const createdType = zSavedTypeSaved.parse(await (await submitted(page, 'Save issue type', typePath)).json()).result.type;
  await web('UC-CFG-0010', async () => {
    await page.getByRole('button', { name: 'Edit issue type Task', exact: true }).click(); await page.getByLabel('Retire this type', { exact: true }).check();
    await page.getByRole('combobox', { name: 'Replacement default', exact: true }).selectOption(createdType.id);
    const response = await submitted(page, 'Save issue type', typePath); expect(response.status()).toBe(200);
    const saved = zSavedTypeSaved.parse(await response.json()).result; expect(saved.type.retired).toBe(true); expect(saved.configuration.defaults.standardTypeId).toBe(createdType.id);
    await expect(page.getByRole('row').filter({ hasText: 'Replacement standard' })).toContainText('Default');
  });
  await page.getByRole('button', { name: 'Priorities', exact: true }).click(); await page.getByRole('button', { name: 'Add priority', exact: true }).click(); await page.getByLabel('Priority name', { exact: true }).fill('Replacement priority');
  const createdPriority = zSavedPrioritySaved.parse(await (await submitted(page, 'Save priority', priorityPath)).json()).result.priority;
  const old = (await priorities(request, project)).items.find(value => value.id === initial.defaults.priorityId)!;
  await web('UC-CFG-0026', async () => {
    await page.getByRole('button', { name: 'Edit priority ' + old.name, exact: true }).click(); await page.getByLabel('Retire this priority', { exact: true }).check();
    const response = await submitted(page, 'Save priority', priorityPath); expect(response.status()).toBe(422); await expect(page.getByRole('alert')).toBeVisible();
    expect((await coverageConfiguration(request, project)).defaults.priorityId).toBe(old.id);
  });
  await web('UC-CFG-0025', async () => {
    await page.getByRole('combobox', { name: 'Replacement default', exact: true }).selectOption(createdPriority.id);
    const response = await submitted(page, 'Save priority', priorityPath); expect(response.status()).toBe(200);
    const saved = zSavedPrioritySaved.parse(await response.json()).result; expect(saved.priority.retired).toBe(true); expect(saved.configuration.defaults.priorityId).toBe(createdPriority.id);
    await expect(page.getByRole('row').filter({ hasText: 'Replacement priority' })).toContainText('Default');
  });
  await web('UC-CFG-0028', async () => {
    await page.getByRole('button', { name: 'Creation defaults', exact: true }).click();
    await page.getByRole('combobox', { name: 'Standard issue type', exact: true }).selectOption(createdType.id);
    await page.getByRole('combobox', { name: 'Subtask type', exact: true }).selectOption(initial.defaults.subtaskTypeId);
    await page.getByRole('combobox', { name: 'Priority', exact: true }).selectOption(createdPriority.id);
    const response = await submitted(page, 'Save defaults', /\/configuration\/defaults$/); expect(response.status()).toBe(200);
    const defaults = zSavedConfigurationView.parse(await response.json()).result.defaults;
    expect(defaults).toEqual({ standardTypeId: createdType.id, subtaskTypeId: initial.defaults.subtaskTypeId, priorityId: createdPriority.id });
    await expect(page.getByRole('status').filter({ hasText: 'Creation defaults saved.' })).toBeVisible();
    const issue = await coverageIssue(request, project); expect(issue.summary.type.id).toBe(createdType.id); expect(issue.summary.priority.id).toBe(createdPriority.id);
  });
});

test('legacy native-default controls remain disabled before the explicit activation review', async ({ page, request }) => {
  const project = await isolatedProject(request);
  await signIn(page, 'owner', `/projects/${project}/settings`, /^Issue configuration$/);
  await web('UC-CFG-0030', async () => {
    await page.getByRole('button', { name: 'Creation defaults', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Standard issue type', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save defaults', exact: true })).toBeDisabled();
    expect((await coverageConfiguration(request, project)).mode).toBe('legacy');
  });
});
