import { expect, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { localFixturesAvailable, signIn } from './support/session';
import { coverageConfiguration, coverageGet, coverageIssue, coverageProject, coverageReadIssue, coverageWrite } from './support/coverage-boards';
import { nativeStageFields, nativeWorkflowFixture, mapNativeWorkflow } from './support/native-workflow-fixture';
import { zPageWorkflowView, zPageStageView, zPageTransitionView, zPageBindingView, zSavedStageSaved, zSavedTransitionSaved, zSavedConfigurationView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires disposable real Go/PostgreSQL fixtures.');
test.use({ trace: 'off' });
const web = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
async function save(page: Page, path: RegExp, status = 200) {
  const reply = page.waitForResponse(response => response.request().method() === 'PUT' && path.test(new URL(response.url()).pathname));
  await page.getByRole('button', { name: 'Save changes', exact: true }).click(); const response = await reply; expect(response.status()).toBe(status);
  if (status >= 400) await expect(page.getByRole('alert')).toBeVisible();
  else { await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Add move', exact: true })).toBeEnabled(); }
  return response;
}

test('native directed moves retain endpoints permissions retirement and symmetric-looking reverse distinctions', async ({ page, request }) => {
  const project = await coverageProject(request), f = await nativeWorkflowFixture(request, project, 'Native directed process');
  await signIn(page, 'owner', `/projects/${project}/workflows`, /^Workflows$/); await page.getByRole('navigation', { name: 'Workflows', exact: true }).getByRole('button').filter({ hasText: f.workflow.name }).click();
  const path = /\/transitions\/[^/]+$/; let transitionId = '';
  const row = () => page.getByRole('row').filter({ has: page.getByRole('cell', { name: f.first.name, exact: true }) }).filter({ has: page.getByRole('cell', { name: f.review.name, exact: true }) });
  await web('UC-WFL-0028', async () => {
    await page.getByRole('button', { name: 'Add move', exact: true }).click(); await page.getByRole('combobox', { name: 'From stage', exact: true }).selectOption(f.first.id); await page.getByRole('combobox', { name: 'To stage', exact: true }).selectOption(f.review.id);
    const transition = zSavedTransitionSaved.parse(await (await save(page, path)).json()).result.transition; transitionId = transition.id; expect(transition).toMatchObject({ fromStageId: f.first.id, toStageId: f.review.id, retired: false }); await expect(row()).toContainText('Active');
  });
  for (const [id, permission] of [['UC-WFL-0029', 'member'], ['UC-WFL-0030', 'project_admin'], ['UC-WFL-0031', '']] as const) await web(id, async () => {
    await row().getByRole('button', { name: 'Edit move from ' + f.first.name + ' to ' + f.review.name, exact: true }).click(); await page.getByRole('combobox', { name: 'Permission', exact: true }).selectOption(permission);
    expect(zSavedTransitionSaved.parse(await (await save(page, path)).json()).result.transition).toMatchObject({ id: transitionId, requiredPermission: permission || null }); await expect(row()).toContainText(permission === 'project_admin' ? 'Project administrators' : 'Project members');
  });
  for (const [id, retired] of [['UC-WFL-0032', true], ['UC-WFL-0033', false]] as const) await web(id, async () => { await row().getByRole('button', { name: 'Edit move from ' + f.first.name + ' to ' + f.review.name, exact: true }).click(); await page.getByLabel('Retire this move', { exact: true }).setChecked(retired); expect(zSavedTransitionSaved.parse(await (await save(page, path)).json()).result.transition).toMatchObject({ id: transitionId, retired }); await expect(row()).toContainText(retired ? 'Retired' : 'Active'); });
  await web('UC-WFL-0063', async () => {
    await row().getByRole('button', { name: 'Edit move from ' + f.first.name + ' to ' + f.review.name, exact: true }).click(); await page.getByRole('combobox', { name: 'To stage', exact: true }).selectOption(f.done.id); await save(page, path, 422);
    expect((await coverageGet(request, `${f.root}/workflows/${f.workflow.id}/transitions`, zPageTransitionView)).items.find(value => value.id === transitionId)).toMatchObject({ fromStageId: f.first.id, toStageId: f.review.id }); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
  await web('UC-WFL-0061', async () => {
    const before = await f.revision(); await page.getByRole('button', { name: 'Add move', exact: true }).click(); await page.getByRole('combobox', { name: 'From stage', exact: true }).selectOption(f.first.id); await page.getByRole('combobox', { name: 'To stage', exact: true }).selectOption(f.first.id); await save(page, path, 422); expect(await f.revision()).toBe(before);
  });
});

test('native workflow bindings require mapped intake and replace defaults without migrating prior work', async ({ page, request }) => {
  const project = await coverageProject(request), f = await nativeWorkflowFixture(request, project, 'Native bound process');
  const cfg = await coverageConfiguration(request, project), typeId = cfg.defaults.standardTypeId, bindingsPath = `${f.root}/issue-types/${typeId}/workflows`;
  const prior = (await coverageGet(request, bindingsPath, zPageBindingView)).items.find(value => value.default)!;
  const priorName = (await coverageGet(request, f.root + '/workflows', zPageWorkflowView)).items.find(value => value.id === prior.workflowId)!.name;
  const existing = await coverageIssue(request, project);
  await signIn(page, 'owner', `/projects/${project}/workflows`, /^Workflows$/);
  await page.getByRole('combobox', { name: 'Issue type', exact: true }).selectOption(typeId);
  const open = async () => { await page.getByRole('button', { name: 'Add binding', exact: true }).click(); await page.getByRole('combobox', { name: 'Workflow', exact: true }).selectOption(f.workflow.id); };
  await web('UC-WFL-0070', async () => { await open(); await save(page, /\/issue-types\/[^/]+\/workflows\/[^/]+$/, 422); expect((await coverageGet(request, bindingsPath, zPageBindingView)).items.some(value => value.workflowId === f.workflow.id)).toBe(false); await page.getByRole('button', { name: 'Cancel', exact: true }).click(); });
  await mapNativeWorkflow(request, project, f.stages);
  await web('UC-WFL-0034', async () => { await open(); expect(zSavedConfigurationView.parse(await (await save(page, /\/issue-types\/[^/]+\/workflows\/[^/]+$/)).json()).result.projectId).toBe(project); await expect(page.locator('.binding-list li').filter({ hasText: f.workflow.name })).toContainText('Accepts new issues'); expect((await coverageGet(request, bindingsPath, zPageBindingView)).items.find(value => value.workflowId === f.workflow.id)).toMatchObject({ default: false, acceptsNew: true }); });
  await web('UC-WFL-0066', async () => { await page.locator('.binding-list li').filter({ hasText: f.workflow.name }).getByRole('button', { name: 'Edit binding', exact: true }).click(); await page.getByLabel('Default for new issues of this type', { exact: true }).check(); await page.getByLabel('Accept new assignments', { exact: true }).uncheck(); await save(page, /\/issue-types\/[^/]+\/workflows\/[^/]+$/, 422); expect((await coverageGet(request, bindingsPath, zPageBindingView)).items.find(value => value.workflowId === f.workflow.id)?.default).toBe(false); await page.getByRole('button', { name: 'Cancel', exact: true }).click(); });
  await web('UC-WFL-0035', async () => { await page.locator('.binding-list li').filter({ hasText: f.workflow.name }).getByRole('button', { name: 'Edit binding', exact: true }).click(); await page.getByLabel('Default for new issues of this type', { exact: true }).check(); await save(page, /\/issue-types\/[^/]+\/workflows\/[^/]+$/); await expect(page.locator('.binding-list li').filter({ hasText: f.workflow.name })).toContainText('Creation default'); expect((await coverageIssue(request, project)).summary.workflow.id).toBe(f.workflow.id); expect((await coverageReadIssue(request, existing.summary.id)).summary.workflow.id).toBe(existing.summary.workflow.id); });
  await web('UC-WFL-0067', async () => { await page.locator('.binding-list li').filter({ hasText: f.workflow.name }).getByRole('button', { name: 'Edit binding', exact: true }).click(); await page.getByLabel('Default for new issues of this type', { exact: true }).uncheck(); await page.getByLabel('Accept new assignments', { exact: true }).uncheck(); await save(page, /\/issue-types\/[^/]+\/workflows\/[^/]+$/, 422); expect((await coverageGet(request, bindingsPath, zPageBindingView)).items.find(value => value.workflowId === f.workflow.id)).toMatchObject({ default: true, acceptsNew: true }); await page.getByRole('button', { name: 'Cancel', exact: true }).click(); });
  const previousRow = page.locator('.binding-list li').filter({ has: page.locator('strong').filter({ hasText: new RegExp('^' + priorName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) });
  await web('UC-WFL-0036', async () => { await previousRow.getByRole('button', { name: 'Edit binding', exact: true }).click(); await page.getByLabel('Accept new assignments', { exact: true }).uncheck(); await save(page, /\/issue-types\/[^/]+\/workflows\/[^/]+$/); expect((await coverageGet(request, bindingsPath, zPageBindingView)).items.find(value => value.workflowId === prior.workflowId)).toMatchObject({ default: false, acceptsNew: false }); await expect(previousRow).toContainText('Existing issues only'); });
  await page.getByRole('navigation', { name: 'Workflows', exact: true }).getByRole('button').filter({ hasText: f.workflow.name }).click();
  await web('UC-WFL-0071', async () => { await page.getByRole('button', { name: 'Edit workflow', exact: true }).click(); await page.getByLabel('Retire this workflow', { exact: true }).check(); await save(page, /\/workflows\/[^/]+$/, 422); expect((await coverageGet(request, bindingsPath, zPageBindingView)).items.find(value => value.workflowId === f.workflow.id)?.default).toBe(true); });
});
