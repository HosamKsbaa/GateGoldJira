import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { localFixturesAvailable, signIn } from './support/session';
import { coverageConfiguration, coverageGet, coverageProject, coverageWrite } from './support/coverage-boards';
import { coverageDefinition } from './support/coverage-issues';
import { zPageWorkflowView, zPageStageView, zPageTransitionView, zSavedTransitionPolicyView, zTransitionPolicyView, zSavedStageSaved, zSavedTransitionSaved } from '../src/app/api/generated/zod.gen';
import type { TransitionPolicy } from '../src/app/api/generated/types.gen';

test.skip(!localFixturesAvailable, 'Requires disposable real Go/PostgreSQL fixtures.');
test.use({ trace: 'off' });
const web = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
async function fixture(request: APIRequestContext) {
  const project = await coverageProject(request), root = `/api/v2/projects/${project}`;
  const workflow = (await coverageGet(request, root + '/workflows', zPageWorkflowView)).items[0]!;
  const stages = (await coverageGet(request, root + '/workflows/' + workflow.id + '/stages', zPageStageView)).items;
  const moves = (await coverageGet(request, root + '/workflows/' + workflow.id + '/transitions', zPageTransitionView)).items;
  const from = stages.find(stage => stage.initial)!, to = stages.find(stage => stage.category === 'review')!;
  const move = moves.find(move => move.fromStageId === from.id && move.toStageId === to.id)!;
  expect(move).toBeDefined();
  return { project, root, workflow, stages, from, to, move, policyPath: `${root}/workflows/${workflow.id}/transitions/${move.id}/policy` };
}
async function openPolicy(page: Page, from: string, to: string) {
  await page.getByRole('row').filter({ has: page.getByRole('cell', { name: from, exact: true }) }).filter({ has: page.getByRole('cell', { name: to, exact: true }) }).getByRole('button', { name: 'Requirements for move to ' + to, exact: true }).click();
  await expect(page.locator('gg-transition-policy').getByRole('button', { name: 'Save requirements', exact: true })).toBeEnabled();
}
async function savePolicy(page: Page, path: string) {
  const received = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === path);
  await page.locator('gg-transition-policy').getByRole('button', { name: 'Save requirements', exact: true }).click();
  const response = await received; expect(response.status()).toBe(200);
  const result = zSavedTransitionPolicyView.parse(await response.json()).result;
  await expect(page.locator('gg-transition-policy').getByRole('button', { name: 'Save requirements', exact: true })).toBeEnabled();
  return result;
}

test('native transition rules read and save each system requirement without losing other policy fields', async ({ page, request }) => {
  const f = await fixture(request);
  await signIn(page, 'owner', `/projects/${f.project}/workflows`, /^Workflows$/);
  await web('UC-WFL-0005', async () => {
    const directed = page.getByRole('row').filter({ has: page.getByRole('button', { name: 'Edit move from ' + f.from.name + ' to ' + f.to.name, exact: true }) });
    await expect(directed).toBeVisible();
    await expect(directed.getByRole('cell').nth(0)).toHaveText(f.from.name);
    await expect(directed.getByRole('cell').nth(1)).toHaveText(f.to.name);
  });
  await openPolicy(page, f.from.name, f.to.name);
  await web('UC-WFL-0090', async () => { const current = await coverageGet(request, f.policyPath, zTransitionPolicyView); await expect(page.locator('gg-transition-policy').getByRole('heading', { name: 'Requirements and approvals', exact: true })).toBeVisible(); await expect(page.getByLabel('Approvals needed', { exact: true })).toHaveValue(String(current.policy.approvalsRequired)); expect(current.configuration.projectId).toBe(f.project); });
  const expected: TransitionPolicy['requiredSystemFields'] = [];
  for (const [id, name, field] of [['UC-WFL-0040', 'Assignee', 'assignee'], ['UC-WFL-0041', 'Due date', 'due_date'], ['UC-WFL-0042', 'Description', 'description']] as const) await web(id, async () => {
    await page.locator('gg-transition-policy').getByRole('checkbox', { name, exact: true }).check(); expected.push(field);
    const saved = await savePolicy(page, f.policyPath); expect(saved.policy.requiredSystemFields.slice().sort()).toEqual(expected.slice().sort());
    await expect(page.locator('gg-transition-policy').getByRole('checkbox', { name, exact: true })).toBeChecked();
    expect((await coverageGet(request, f.policyPath, zTransitionPolicyView)).policy.requiredSystemFields.slice().sort()).toEqual(expected.slice().sort());
  });
  await web('UC-WFL-0044', async () => {
    await page.locator('gg-transition-policy').getByRole('checkbox', { name: 'Due date', exact: true }).uncheck();
    const saved = await savePolicy(page, f.policyPath); expect(saved.policy.requiredSystemFields.slice().sort()).toEqual(['assignee', 'description']); await expect(page.locator('gg-transition-policy').getByRole('checkbox', { name: 'Due date', exact: true })).not.toBeChecked(); await expect(page.locator('gg-transition-policy').getByRole('checkbox', { name: 'Assignee', exact: true })).toBeChecked();
  });
});

test('native custom-field requirement and reviewer policies preserve scoped identities across a real reload', async ({ page, request }) => {
  const f = await fixture(request), field = await coverageDefinition(request, f.project, { kind: 'text', name: 'Native release evidence' });
  await signIn(page, 'owner', `/projects/${f.project}/workflows`, /^Workflows$/); await openPolicy(page, f.from.name, f.to.name);
  await web('UC-WFL-0043', async () => {
    await page.getByRole('combobox', { name: 'Required custom fields', exact: true }).fill(field.name); await page.getByRole('option', { name: field.name, exact: true }).click(); await page.getByRole('button', { name: 'Done choosing', exact: true }).click();
    expect((await savePolicy(page, f.policyPath)).policy.requiredFieldIds).toEqual([field.id]); await expect(page.getByRole('button', { name: 'Remove ' + field.name, exact: true })).toBeVisible();
  });
  await web('UC-WFL-0045', async () => { await page.getByLabel('Approvals needed', { exact: true }).fill('2'); await page.getByRole('combobox', { name: 'Reviewers', exact: true }).selectOption('member'); expect((await savePolicy(page, f.policyPath)).policy).toMatchObject({ approvalsRequired: 2, approverRole: 'member', requiredFieldIds: [field.id] }); await expect(page.getByLabel('Approvals needed', { exact: true })).toHaveValue('2'); });
  await web('UC-WFL-0046', async () => { await page.getByRole('combobox', { name: 'Reviewers', exact: true }).selectOption('project_admin'); expect((await savePolicy(page, f.policyPath)).policy).toMatchObject({ approvalsRequired: 2, approverRole: 'project_admin' }); await expect(page.getByRole('combobox', { name: 'Reviewers', exact: true })).toHaveValue('project_admin'); });
  await web('UC-WFL-0047', async () => { await page.getByRole('checkbox', { name: 'Issue reporter cannot approve', exact: true }).check(); expect((await savePolicy(page, f.policyPath)).policy.excludeIssueReporter).toBe(true); await signIn(page, 'owner', `/projects/${f.project}/workflows`, /^Workflows$/); await openPolicy(page, f.from.name, f.to.name); await expect(page.getByRole('checkbox', { name: 'Issue reporter cannot approve', exact: true })).toBeChecked(); await expect(page.getByRole('combobox', { name: 'Reviewers', exact: true })).toHaveValue('project_admin'); await expect(page.getByRole('button', { name: 'Remove ' + field.name, exact: true })).toBeVisible(); });
});

for (const [id, count] of [['UC-WFL-0082', '101'], ['UC-WFL-0083', '-1']] as const) test('native approval count validation prevents out-of-range submission ' + count, async ({ page, request }) => {
  const f = await fixture(request), before = await coverageGet(request, f.policyPath, zTransitionPolicyView);
  await signIn(page, 'owner', `/projects/${f.project}/workflows`, /^Workflows$/); await openPolicy(page, f.from.name, f.to.name);
  await web(id, async () => { await page.getByLabel('Approvals needed', { exact: true }).fill(count); expect(await page.getByLabel('Approvals needed', { exact: true }).evaluate((element: HTMLInputElement) => element.validity.valid)).toBe(false); let writes = 0; page.on('request', response => { if (response.method() === 'PUT' && new URL(response.url()).pathname === f.policyPath) writes++; }); await page.getByRole('button', { name: 'Save requirements', exact: true }).click(); expect(writes).toBe(0); await expect(page.getByLabel('Approvals needed', { exact: true })).toHaveValue(count); expect((await coverageGet(request, f.policyPath, zTransitionPolicyView)).policy).toEqual(before.policy); });
});

test('native stage editor protects the identity category and the only in-use initial stage', async ({ page, request }) => {
  const f = await fixture(request);
  await signIn(page, 'owner', `/projects/${f.project}/workflows`, /^Workflows$/);
  await web('UC-WFL-0055', async () => {
    await page.getByRole('button', { name: 'Edit stage ' + f.from.name, exact: true }).click(); await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('review'); const reply = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith('/stages/' + f.from.id)); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); expect((await reply).status()).toBe(422); await expect(page.getByRole('alert')).toBeVisible(); expect((await coverageGet(request, f.root + '/workflows/' + f.workflow.id + '/stages', zPageStageView)).items.find(value => value.id === f.from.id)?.category).toBe('todo'); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  });
  await web('UC-WFL-0065', async () => {
    await page.getByRole('button', { name: 'Edit stage ' + f.from.name, exact: true }).click(); await page.getByLabel('Initial stage for new issues', { exact: true }).uncheck(); const reply = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname.endsWith('/stages/' + f.from.id)); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); expect((await reply).status()).toBe(422); await expect(page.getByRole('alert')).toBeVisible(); expect((await coverageGet(request, f.root + '/workflows/' + f.workflow.id + '/stages', zPageStageView)).items.find(value => value.id === f.from.id)?.initial).toBe(true);
  });
});
