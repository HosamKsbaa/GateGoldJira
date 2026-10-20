import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { localFixturesAvailable, signIn } from './support/session';
import { coverageConfiguration, coverageGet, coverageProject, coverageWrite } from './support/coverage-boards';
import { nativeWorkflowFixture, mapNativeWorkflow } from './support/native-workflow-fixture';
import { zPageStageView, zPageTransitionView, zPageWorkflowView, zPageBindingView, zSavedStageSaved, zSavedWorkflowSaved, zSavedTypeSaved, zSavedConfigurationView, zSavedMembershipView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires disposable real Go/PostgreSQL fixtures.');
test.use({ trace: 'off' });
const web = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');

test('native initial-stage designation clears the previous initial identity', async ({ page, request }) => {
  const project = await coverageProject(request), f = await nativeWorkflowFixture(request, project, 'Native alternate initial');
  await signIn(page, 'owner', `/projects/${project}/workflows`, /^Workflows$/); await page.getByRole('navigation', { name: 'Workflows', exact: true }).getByRole('button').filter({ hasText: f.workflow.name }).click();
  await web('UC-WFL-0023', async () => { await page.getByRole('button', { name: 'Add stage', exact: true }).click(); await page.getByLabel('Stage name', { exact: true }).fill('Native new initial'); await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('todo'); await page.getByLabel('Position', { exact: true }).fill('4'); await page.getByLabel('Initial stage for new issues', { exact: true }).check(); await page.getByLabel('Accept new entries', { exact: true }).check(); const reply = page.waitForResponse(response => response.request().method() === 'PUT' && /\/stages\/[^/]+$/.test(new URL(response.url()).pathname)); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); const response = await reply; expect(response.status()).toBe(200); const stage = zSavedStageSaved.parse(await response.json()).result.stage; expect(stage.initial).toBe(true); const all = (await coverageGet(request, `${f.root}/workflows/${f.workflow.id}/stages`, zPageStageView)).items; expect(all.filter(value => value.initial).map(value => value.id)).toEqual([stage.id]); expect(all.find(value => value.id === f.first.id)?.initial).toBe(false); await expect(page.locator('.stage-card').filter({ hasText: 'Native new initial' })).toContainText('Initial stage'); });
});

test('native transition retirement cannot remove the last completion path of an active workflow', async ({ page, request }) => {
  const project = await coverageProject(request), f = await nativeWorkflowFixture(request, project, 'Native protected completion'); await mapNativeWorkflow(request, project, f.stages);
  await coverageWrite(request, 'PUT', `${f.root}/issue-types/${(await coverageConfiguration(request, project)).defaults.standardTypeId}/workflows/${f.workflow.id}`, { expectedRevision: await f.revision(), default: true, acceptsNew: true }, zSavedConfigurationView);
  await signIn(page, 'owner', `/projects/${project}/workflows`, /^Workflows$/); await page.getByRole('navigation', { name: 'Workflows', exact: true }).getByRole('button').filter({ hasText: f.workflow.name }).click();
  await web('UC-WFL-0064', async () => { const row = page.getByRole('row').filter({ has: page.getByRole('cell', { name: f.first.name, exact: true }) }).filter({ has: page.getByRole('cell', { name: f.done.name, exact: true }) }); await row.getByRole('button', { name: 'Edit move from ' + f.first.name + ' to ' + f.done.name, exact: true }).click(); await page.getByLabel('Retire this move', { exact: true }).check(); const reply = page.waitForResponse(response => response.request().method() === 'PUT' && /\/transitions\/[^/]+$/.test(new URL(response.url()).pathname)); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); expect((await reply).status()).toBe(422); await expect(page.getByRole('alert')).toBeVisible(); expect((await coverageGet(request, `${f.root}/workflows/${f.workflow.id}/transitions`, zPageTransitionView)).items.find(value => value.fromStageId === f.first.id && value.toStageId === f.done.id)?.retired).toBe(false); });
});

for (const [id, retiredKind] of [['UC-WFL-0068', 'type'], ['UC-WFL-0069', 'workflow']] as const) test('native binding rejects a retained retired ' + retiredKind + ' without adding intake', async ({ page, request }) => {
  const project = await coverageProject(request), f = await nativeWorkflowFixture(request, project, 'Native retired binding process'); let typeId = (await coverageConfiguration(request, project)).defaults.standardTypeId;
  if (retiredKind === 'type') { typeId = crypto.randomUUID(); const body = { key: 'retired_native_type', name: 'Native retired type', behavior: 'standard' as const, retired: false }; await coverageWrite(request, 'PUT', `${f.root}/issue-types/${typeId}`, { ...body, expectedRevision: await f.revision() }, zSavedTypeSaved, 201); await coverageWrite(request, 'PUT', `${f.root}/issue-types/${typeId}`, { ...body, retired: true, expectedRevision: await f.revision() }, zSavedTypeSaved); }
  else await coverageWrite(request, 'PUT', `${f.root}/workflows/${f.workflow.id}`, { expectedRevision: await f.revision(), name: f.workflow.name, retired: true }, zSavedWorkflowSaved);
  await signIn(page, 'owner', `/projects/${project}/workflows`, /^Workflows$/); await page.getByRole('combobox', { name: 'Issue type', exact: true }).selectOption(typeId);
  await web(id, async () => { await page.getByRole('button', { name: 'Add binding', exact: true }).click(); await page.getByRole('combobox', { name: 'Workflow', exact: true }).selectOption(f.workflow.id); const reply = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === `${f.root}/issue-types/${typeId}/workflows/${f.workflow.id}`); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); expect((await reply).status()).toBe(422); await expect(page.getByRole('alert')).toBeVisible(); expect((await coverageGet(request, `${f.root}/issue-types/${typeId}/workflows`, zPageBindingView)).items.some(value => value.workflowId === f.workflow.id && value.acceptsNew)).toBe(false); });
});

test('native workflow submission rechecks a project administrator role revoked after the form opened', async ({ page, request }) => {
  const project = await coverageProject(request), root = `/api/v2/projects/${project}`, membership = `/api/v1/projects/${project}/memberships/10000000-0000-4000-8000-000000000002`;
  const elevated = (await coverageWrite(request, 'PUT', membership, { expectedRevision: '1', role: 'project_admin' }, zSavedMembershipView)).result;
  let revokedRevision = '';
  try {
    await signIn(page, 'member', `/projects/${project}/workflows`, /^Workflows$/); await page.getByRole('button', { name: 'Create workflow', exact: true }).click(); await page.getByLabel('Workflow name', { exact: true }).fill('Rejected after native permission removal'); const before = await coverageConfiguration(request, project);
    await web('UC-WFL-0049', async () => { const revoked = (await coverageWrite(request, 'PUT', membership, { expectedRevision: elevated.revision, role: 'viewer' }, zSavedMembershipView)).result; revokedRevision = revoked.revision; const reply = page.waitForResponse(response => response.request().method() === 'PUT' && /\/workflows\/[^/]+$/.test(new URL(response.url()).pathname)); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); const response = await reply; expect(response.status()).toBe(403); expect(await response.json()).toMatchObject({ error: { code: 'forbidden' } }); expect((await coverageConfiguration(request, project)).revision).toBe(before.revision); expect((await coverageGet(request, root + '/workflows', zPageWorkflowView)).items.some(value => value.name === 'Rejected after native permission removal')).toBe(false); });
  } finally { await coverageWrite(request, 'PUT', membership, { expectedRevision: revokedRevision || elevated.revision, role: 'member' }, zSavedMembershipView); }
});
