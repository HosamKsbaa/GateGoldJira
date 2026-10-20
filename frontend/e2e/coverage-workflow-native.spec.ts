import { expect, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { localFixturesAvailable, signIn } from './support/session';
import { coverageConfiguration, coverageGet, coverageProject, coverageWrite } from './support/coverage-boards';
import { zPageWorkflowView, zPageStageView, zPageTransitionView, zSavedWorkflowSaved, zSavedStageSaved, zSavedTransitionSaved, zTransitionPolicyView, zSavedTransitionPolicyView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires disposable real Go/PostgreSQL fixtures.');
test.use({ trace: 'off' });
const web = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
async function save(page: Page, suffix: RegExp, status = 200) {
  const reply = page.waitForResponse(response => response.request().method() === 'PUT' && suffix.test(new URL(response.url()).pathname));
  await page.getByRole('button', { name: 'Save changes', exact: true }).click(); const response = await reply;
  expect(response.status()).toBe(status);
  if (status >= 400) await expect(page.getByRole('alert')).toBeVisible();
  else await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0);
  return response;
}
const workflowPath = /\/workflows\/[^/]+$/, stagePath = /\/stages\/[^/]+$/, transitionPath = /\/transitions\/[^/]+$/;

test('native workflows create rename inspect and retire a separate unused process', async ({ page, request }) => {
  const project = await coverageProject(request), root = `/api/v2/projects/${project}`;
  await signIn(page, 'owner', `/projects/${project}/workflows`, /^Workflows$/);
  let id = '';
  await web('UC-WFL-0011', async () => { await page.getByRole('button', { name: 'Create workflow', exact: true }).click(); await page.getByLabel('Workflow name', { exact: true }).fill('Native process'); const response = await save(page, workflowPath); const flow = zSavedWorkflowSaved.parse(await response.json()).result.workflow; id = flow.id; expect(flow.retired).toBe(false); await expect(page.getByRole('heading', { name: 'Native process', exact: true })).toBeVisible(); });
  await web('UC-WFL-0001', async () => { await signIn(page, 'owner', `/projects/${project}/workflows`, /^Workflows$/); await page.getByRole('navigation', { name: 'Workflows', exact: true }).getByRole('button').filter({ hasText: 'Native process' }).click(); await expect(page.getByRole('heading', { name: 'Native process', exact: true })).toBeVisible(); expect((await coverageGet(request, root + '/workflows', zPageWorkflowView)).items.find(value => value.id === id)?.name).toBe('Native process'); });
  await web('UC-WFL-0012', async () => { await page.getByRole('button', { name: 'Edit workflow', exact: true }).click(); await page.getByLabel('Workflow name', { exact: true }).fill('Native renamed process'); expect(zSavedWorkflowSaved.parse(await (await save(page, workflowPath)).json()).result.workflow).toMatchObject({ id, name: 'Native renamed process' }); await expect(page.getByRole('heading', { name: 'Native renamed process', exact: true })).toBeVisible(); });
  await web('UC-WFL-0013', async () => { await page.getByRole('button', { name: 'Edit workflow', exact: true }).click(); await page.getByLabel('Retire this workflow', { exact: true }).check(); expect(zSavedWorkflowSaved.parse(await (await save(page, workflowPath)).json()).result.workflow).toMatchObject({ id, retired: true }); await expect(page.getByRole('navigation', { name: 'Workflows', exact: true }).getByRole('button').filter({ hasText: 'Native renamed process' })).toContainText('Retired'); });
});

test('native stage categories names exact order initial designation and intake remain independent', async ({ page, request }) => {
  const project = await coverageProject(request), root = `/api/v2/projects/${project}`, workflowId = crypto.randomUUID();
  await coverageWrite(request, 'PUT', root + '/workflows/' + workflowId, { expectedRevision: (await coverageConfiguration(request, project)).revision, name: 'Native stage process', retired: false }, zSavedWorkflowSaved);
  await signIn(page, 'owner', `/projects/${project}/workflows`, /^Workflows$/);
  await page.getByRole('navigation', { name: 'Workflows', exact: true }).getByRole('button').filter({ hasText: 'Native stage process' }).click();
  const stages: Array<{ id: string; name: string }> = [];
  for (const [category, id] of [['todo', 'UC-WFL-0018'], ['in_progress', 'UC-WFL-0019'], ['review', 'UC-WFL-0020'], ['done', 'UC-WFL-0021']] as const) await web(id, async () => {
    await page.getByRole('button', { name: 'Add stage', exact: true }).click(); const name = 'Native ' + category;
    await page.getByLabel('Stage name', { exact: true }).fill(name); await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption(category); await page.getByLabel('Position', { exact: true }).fill(String(stages.length + 1)); await page.getByLabel('Accept new entries', { exact: true }).check();
    if (category === 'todo') await page.getByLabel('Initial stage for new issues', { exact: true }).check();
    const stage = zSavedStageSaved.parse(await (await save(page, stagePath)).json()).result.stage; expect(stage.category).toBe(category); stages.push({ id: stage.id, name }); await expect(page.locator('.stage-card').filter({ hasText: name })).toContainText('Open to new entries');
  });
  await web('UC-WFL-0015', async () => { await page.getByRole('button', { name: 'Add stage', exact: true }).click(); await page.getByLabel('Stage name', { exact: true }).fill('Native QA'); await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('review'); const stage = zSavedStageSaved.parse(await (await save(page, stagePath)).json()).result.stage; expect(stage).toMatchObject({ name: 'Native QA', projectId: project, workflowId }); await expect(page.getByRole('heading', { name: 'Native QA', exact: true })).toBeVisible(); });
  await web('UC-WFL-0003', async () => { await expect(page.locator('.stage-card')).toHaveCount(5); expect((await coverageGet(request, root + '/workflows/' + workflowId + '/stages', zPageStageView)).items).toHaveLength(5); });
  await web('UC-WFL-0017', async () => { await page.getByRole('button', { name: 'Edit stage Native QA', exact: true }).click(); await page.getByLabel('Stage name', { exact: true }).fill('Renamed QA'); const stage = zSavedStageSaved.parse(await (await save(page, stagePath)).json()).result.stage; expect(stage.name).toBe('Renamed QA'); await expect(page.getByRole('button', { name: 'Edit stage Renamed QA', exact: true })).toBeVisible(); });
  await web('UC-WFL-0016', async () => { await page.getByRole('button', { name: 'Edit stage Renamed QA', exact: true }).click(); await page.getByLabel('Stage name', { exact: true }).fill('جاهز للمراجعة'); expect(zSavedStageSaved.parse(await (await save(page, stagePath)).json()).result.stage.name).toBe('جاهز للمراجعة'); await expect(page.getByRole('heading', { name: 'جاهز للمراجعة', exact: true })).toHaveAttribute('dir', 'auto'); });
  await web('UC-WFL-0022', async () => { await page.getByRole('button', { name: 'Edit stage جاهز للمراجعة', exact: true }).click(); await page.getByLabel('Position', { exact: true }).fill('9007199254740993'); expect(zSavedStageSaved.parse(await (await save(page, stagePath)).json()).result.stage.position).toBe('9007199254740993'); await expect(page.locator('.stage-card').filter({ hasText: 'جاهز للمراجعة' })).toContainText('9007199254740993'); });
  await web('UC-WFL-0024', async () => { await page.getByRole('button', { name: 'Edit stage جاهز للمراجعة', exact: true }).click(); await page.getByLabel('Accept new entries', { exact: true }).check(); expect(zSavedStageSaved.parse(await (await save(page, stagePath)).json()).result.stage.acceptsEntries).toBe(true); await expect(page.locator('.stage-card').filter({ hasText: 'جاهز للمراجعة' })).toContainText('Open to new entries'); });
  await web('UC-WFL-0025', async () => { await page.getByRole('button', { name: 'Edit stage جاهز للمراجعة', exact: true }).click(); await page.getByLabel('Accept new entries', { exact: true }).uncheck(); expect(zSavedStageSaved.parse(await (await save(page, stagePath)).json()).result.stage.acceptsEntries).toBe(false); await expect(page.locator('.stage-card').filter({ hasText: 'جاهز للمراجعة' })).toContainText('Intake closed'); });
  await web('UC-WFL-0026', async () => { await page.getByRole('button', { name: 'Edit stage جاهز للمراجعة', exact: true }).click(); await page.getByLabel('Retire this empty stage', { exact: true }).check(); expect(zSavedStageSaved.parse(await (await save(page, stagePath)).json()).result.stage.retired).toBe(true); await expect(page.locator('.stage-card').filter({ hasText: 'جاهز للمراجعة' })).toContainText('Retired'); });
  await web('UC-WFL-0027', async () => { await page.getByRole('button', { name: 'Edit stage جاهز للمراجعة', exact: true }).click(); await page.getByLabel('Retire this empty stage', { exact: true }).uncheck(); expect(zSavedStageSaved.parse(await (await save(page, stagePath)).json()).result.stage).toMatchObject({ retired: false, acceptsEntries: false }); await expect(page.locator('.stage-card').filter({ hasText: 'جاهز للمراجعة' })).toContainText('Intake closed'); });
});

for (const row of [
  { id: 'UC-WFL-0050', name: 'Workflow name', value: '', button: 'Create workflow' },
  { id: 'UC-WFL-0051', name: 'Workflow name', value: 'w'.repeat(101), button: 'Create workflow' },
  { id: 'UC-WFL-0052', name: 'Stage name', value: '', button: 'Add stage' },
  { id: 'UC-WFL-0053', name: 'Stage name', value: 's'.repeat(61), button: 'Add stage' },
  { id: 'UC-WFL-0054', name: 'Position', value: '0', button: 'Add stage' },
] as const) test('native workflow validation prevents invalid ' + row.id + ' before persistence', async ({ page, request }) => {
  const project = await coverageProject(request), before = await coverageConfiguration(request, project);
  await signIn(page, 'owner', `/projects/${project}/workflows`, /^Workflows$/);
  await web(row.id, async () => {
    await page.getByRole('button', { name: row.button, exact: true }).click();
    if (row.name === 'Position') await page.getByLabel('Stage name', { exact: true }).fill('Invalid position stage');
    await page.getByLabel(row.name, { exact: true }).fill(row.value); await expect(page.getByLabel(row.name, { exact: true })).toHaveClass(/ng-invalid/);
    let writes = 0; page.on('request', response => { if (response.method() === 'PUT') writes++; });
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByLabel(row.name, { exact: true })).toBeVisible(); expect(writes).toBe(0); expect((await coverageConfiguration(request, project)).revision).toBe(before.revision);
  });
});

for (const row of [
  { id: 'UC-WFL-0056', category: 'review', initial: true, accepts: true, retired: false },
  { id: 'UC-WFL-0057', category: 'todo', initial: true, accepts: false, retired: false },
  { id: 'UC-WFL-0058', category: 'review', initial: false, accepts: true, retired: true },
] as const) test('native stage editor rejects incompatible initial/intake/retirement state ' + row.id, async ({ page, request }) => {
  const project = await coverageProject(request), before = await coverageConfiguration(request, project);
  await signIn(page, 'owner', `/projects/${project}/workflows`, /^Workflows$/);
  await web(row.id, async () => {
    await page.getByRole('button', { name: 'Add stage', exact: true }).click(); await page.getByLabel('Stage name', { exact: true }).fill('Rejected stage'); await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption(row.category);
    await page.getByLabel('Initial stage for new issues', { exact: true }).setChecked(row.initial); await page.getByLabel('Accept new entries', { exact: true }).setChecked(row.accepts); await page.getByLabel('Retire this empty stage', { exact: true }).setChecked(row.retired);
    await save(page, stagePath, 422); expect((await coverageConfiguration(request, project)).revision).toBe(before.revision); await expect(page.getByLabel('Stage name', { exact: true })).toHaveValue('Rejected stage');
  });
});
