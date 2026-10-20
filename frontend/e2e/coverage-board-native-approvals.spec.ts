import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { localFixturesAvailable, signIn } from './support/session';
import { coverageBoard, coverageConfiguration, coverageGet, coverageIssue, coverageProject, coverageReadIssue, coverageWrite } from './support/coverage-boards';
import { zApprovalContextView, zPageIssueTransitionOption, zSavedApprovalContextView, zSavedTransitionPolicyView, zSavedNativeMoveResult } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable, 'Requires isolated real Go/PostgreSQL browser environment.');
test.use({ trace: 'off' });
async function fixture(request: APIRequestContext) {
  const projectId = await coverageProject(request), board = await coverageBoard(request, projectId, 'Native approved board'), first = await coverageIssue(request, projectId, { title: 'Native approved work' }), pending = await coverageIssue(request, projectId, { title: 'Native pending review work' });
  const edge = (await coverageGet(request, `/api/v2/issues/${first.summary.id}/transitions`, zPageIssueTransitionOption)).items.find(value => value.stage.category === 'review')!;
  await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/workflows/${first.summary.workflow.id}/transitions/${edge.transitionId}/policy`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, policy: { approvalsRequired: 1, approverRole: 'member', excludeIssueReporter: false, requiredSystemFields: [], requiredFieldIds: [] } }, zSavedTransitionPolicyView);
  const approve = async (id: string) => { const path = `/api/v2/issues/${id}/transitions/${edge.transitionId}/approvals`, context = await coverageGet(request, path, zApprovalContextView, 'member'); const saved = await coverageWrite(request, 'POST', path, { expectedRevision: context.issueRevision, expectedWorkflowRevision: context.workflowRevision, expectedConfigurationRevision: context.configurationRevision, decision: 'approve' }, zSavedApprovalContextView, 200, 'member'); expect(saved.result.reviewSatisfied).toBe(true); };
  return { projectId, board, first, pending, edge, approve };
}
async function chooseReview(page: Page, board: Awaited<ReturnType<typeof coverageBoard>>, issueId: string) { const card = page.locator(`gg-native-issue-card[data-issue-id="${issueId}"]`); if (!await card.locator('details').evaluate(element => (element as HTMLDetailsElement).open)) await card.locator('summary').click(); await card.getByRole('combobox', { name: 'Destination column', exact: true }).selectOption(board.columns.find(column => column.stages.some(mapping => mapping.stage.category === 'review'))!.id); await card.getByRole('button', { name: 'Choose destination', exact: true }).click(); }

test('native board card review guard requires a current approval before the actual board move commits', async ({ request, page }) => {
  const f = await fixture(request), attempts: string[] = [];
  await signIn(page, 'member', `/boards/${f.board.board.id}`, /^Native approved board$/);
  page.on('request', value => { if (value.method() === 'POST' && new URL(value.url()).pathname === `/api/v2/boards/${f.board.board.id}/cards/move`) attempts.push(value.url()); });
  await useCase('UC-APR-0018', async () => {
    await chooseReview(page, f.board, f.first.summary.id);
    const chooser = page.getByRole('dialog', { name: 'Choose destination stage', exact: true }); await expect(chooser).toBeVisible(); await expect(chooser.getByRole('button', { name: 'Review · Review required', exact: true })).toBeDisabled(); expect(attempts).toEqual([]); expect((await coverageReadIssue(request, f.first.summary.id)).summary.stage.category).toBe('todo'); await chooser.getByRole('button', { name: 'Cancel move', exact: true }).click();
    await f.approve(f.first.summary.id);
    const accepted = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === `/api/v2/boards/${f.board.board.id}/cards/move`);
    await chooseReview(page, f.board, f.first.summary.id); const response = await accepted; expect(response.status()).toBe(200); const saved = zSavedNativeMoveResult.parse(await response.json()); expect(saved.result.issue.summary.stage.id).toBe(f.edge.stage.id);
    const review = page.locator('.kanban-column').filter({ has: page.getByRole('heading', { name: /^Review/ }) }); await expect(review.locator(`gg-native-issue-card[data-issue-id="${f.first.summary.id}"]`)).toBeVisible(); expect(attempts).toHaveLength(1); expect((await coverageReadIssue(request, f.first.summary.id)).summary.stage.id).toBe(f.edge.stage.id); expect((await coverageReadIssue(request, f.pending.summary.id)).summary.stage.category).toBe('todo');
  }, 'web');
});

test('native bulk stage change checks approval separately and retains only the unapproved row for attention', async ({ request, page }) => {
  const f = await fixture(request); await f.approve(f.first.summary.id); await signIn(page, 'member', `/issues?projectId=${f.projectId}`, /^Issues$/);
  await page.getByRole('checkbox', { name: 'Select issue ' + f.first.summary.key, exact: true }).check(); await page.getByRole('checkbox', { name: 'Select issue ' + f.pending.summary.key, exact: true }).check(); const panel = page.getByRole('region', { name: 'Bulk issue actions', exact: true });
  await panel.getByRole('combobox', { name: 'Bulk action', exact: true }).selectOption('status'); await panel.getByRole('combobox', { name: 'Bulk target stage', exact: true }).selectOption(f.edge.stage.id);
  await useCase('UC-APR-0019', async () => {
    await panel.getByRole('button', { name: 'Apply to selected', exact: true }).click(); await expect(panel.getByRole('status')).toHaveText('1 issue(s) saved; 1 need attention.'); await expect(panel).toContainText(f.pending.summary.key); await expect(panel.getByRole('button', { name: 'Review ' + f.pending.summary.key, exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select issue ' + f.first.summary.key, exact: true })).not.toBeChecked(); await expect(page.getByRole('checkbox', { name: 'Select issue ' + f.pending.summary.key, exact: true })).toBeChecked(); expect((await coverageReadIssue(request, f.first.summary.id)).summary.stage.id).toBe(f.edge.stage.id); expect((await coverageReadIssue(request, f.pending.summary.id)).summary.stage.category).toBe('todo');
    await f.approve(f.pending.summary.id); await panel.getByRole('button', { name: 'Apply to selected', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: '1 issue(s) saved; 0 need attention.' })).toBeVisible(); await expect(panel).toHaveCount(0); expect((await coverageReadIssue(request, f.pending.summary.id)).summary.stage.id).toBe(f.edge.stage.id);
  }, 'web');
});
