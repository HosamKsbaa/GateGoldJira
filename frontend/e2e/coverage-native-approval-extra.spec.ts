import { expect, type Page, type APIRequestContext, type Browser } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { coverageProject, coverageCreate, coverageHeaders, coverageRead, coverageDefinition } from './support/coverage-issues';
import { zConfigurationView, zPageIssueTransitionOption, zSavedTransitionPolicyView, zApprovalContextView, zSavedApprovalContextView, zSavedModernIssueView, zPageTransitionView, zSavedTransitionSaved, zSavedStageSaved, zSavedDependencyView } from '../src/app/api/generated/zod.gen';
import { modernEditable } from '../src/app/features/issues/issue-model';
import type { TransitionPolicy, ModernIssueView } from '../src/app/api/generated/types.gen';

test.skip(!localFixturesAvailable, 'Requires native review controls and isolated real services.');
test.use({ trace: 'off' });
test.setTimeout(120_000);
const webCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
async function configuration(request: APIRequestContext, projectId: string) { const reply = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/configuration`, { headers: await coverageHeaders('owner') }); expect(reply.status()).toBe(200); return zConfigurationView.parse(await reply.json()); }
async function fixture(request: APIRequestContext, policy: Partial<TransitionPolicy> = {}, category = 'review') {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId);
  const reply = await request.get(`${apiOrigin}/api/v2/issues/${issue.summary.id}/transitions`, { headers: await coverageHeaders() }); expect(reply.status()).toBe(200); const edge = zPageIssueTransitionOption.parse(await reply.json()).items.find(value => value.stage.category === category)!;
  const saved = await request.put(`${apiOrigin}/api/v2/projects/${projectId}/workflows/${issue.summary.workflow.id}/transitions/${edge.transitionId}/policy`, { headers: await coverageHeaders('owner'), data: { expectedRevision: (await configuration(request, projectId)).revision, policy: { approvalsRequired: 1, approverRole: 'member', excludeIssueReporter: false, requiredSystemFields: [], requiredFieldIds: [], ...policy } } }); expect(saved.status()).toBe(200); zSavedTransitionPolicyView.parse(await saved.json());
  return { projectId, issue, edge, path: `/api/v2/issues/${issue.summary.id}/transitions/${edge.transitionId}` };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function context(request: APIRequestContext, f: Fixture, role = 'member') { const reply = await request.get(apiOrigin + f.path + '/approvals', { headers: await coverageHeaders(role) }); expect(reply.status()).toBe(200); return zApprovalContextView.parse(await reply.json()); }
async function open(page: Page, f: Fixture, role = 'member') { await signIn(page, role, '/issues/' + f.issue.summary.id, new RegExp('^' + f.issue.summary.title + '$')); const review = page.locator('gg-issue-review'); await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(f.edge.transitionId); await expect(review.getByRole('status').filter({ hasText: '0 / ' })).toBeVisible(); return review; }
async function secondPage(browser: Browser) { const browserContext = await browser.newContext(); return { browserContext, page: await browserContext.newPage() }; }

for (const mode of ['identical', 'change'] as const) test('native concurrent same-reviewer ' + mode + ' preserves the immutable single decision', async ({ page, request, browser }) => {
  const f = await fixture(request), a = await open(page, f), other = await secondPage(browser);
  try {
    const b = await open(other.page, f); await a.getByRole('button', { name: 'Approve', exact: true }).click(); await expect(a).toContainText('Review requirements satisfied');
    await webCase(mode === 'identical' ? 'UC-APR-0010' : 'UC-APR-0011', async () => {
      const reply = other.page.waitForResponse(value => value.request().method() === 'POST' && value.url().endsWith(f.path + '/approvals'));
      await b.getByRole('button', { name: mode === 'identical' ? 'Approve' : 'Request changes', exact: true }).click(); const result = await reply; expect(result.status()).toBe(mode === 'identical' ? 200 : 422);
      if (mode === 'identical') { const saved = zSavedApprovalContextView.parse(await result.json()); expect(saved.receipt.eventId).toBeNull(); await expect(b).toContainText('Review requirements satisfied'); }
      else await expect(b.getByRole('alert')).toContainText('Decisions are retained');
      const saved = await context(request, f); expect(saved.votes).toHaveLength(1); expect(saved.votes[0]?.decision).toBe('approve'); expect(saved.approved).toBe(1); expect((await coverageRead(request, f.issue.summary.id)).summary.revision).toBe(f.issue.summary.revision);
    });
  } finally { await other.browserContext.close(); }
});

test('native distinct reviewers satisfy the threshold concurrently without changing issue content and resubmit starts a new context', async ({ page, request, browser }) => {
  const f = await fixture(request, { approvalsRequired: 2 }), a = await open(page, f), other = await secondPage(browser);
  try {
    const b = await open(other.page, f, 'owner');
    await webCase('UC-APR-0012', async () => { await Promise.all([a.getByRole('button', { name: 'Approve', exact: true }).click(), b.getByRole('button', { name: 'Approve', exact: true }).click()]); await expect(a.locator('.review-votes li').filter({ hasText: 'Approved' }).first()).toBeVisible(); await a.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(''); await a.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(f.edge.transitionId); await expect(a.locator('.review-votes li')).toHaveCount(2); const saved = await context(request, f); expect(saved.approved).toBe(2); expect(new Set(saved.votes.map(value => value.approver.id))).toEqual(new Set(['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'])); for (const vote of saved.votes) { expect(vote.current).toBe(true); expect(vote.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); expect(vote.issueRevision).toBe(f.issue.summary.revision); } expect((await coverageRead(request, f.issue.summary.id)).summary.revision).toBe(f.issue.summary.revision); });
    await webCase('UC-APR-0013', async () => { await expect(a.getByRole('status').filter({ hasText: 'Review requirements satisfied' })).toBeVisible(); expect((await context(request, f)).reviewSatisfied).toBe(true); });
    await webCase('UC-APR-0015', async () => { await a.getByRole('button', { name: 'Resubmit for review', exact: true }).click(); await expect(a).toContainText('0 / 2 approvals'); await expect(a.locator('.review-votes li').filter({ hasText: 'Previous review' })).toHaveCount(2); const saved = await context(request, f); expect(saved.issueRevision).toBe(String(BigInt(f.issue.summary.revision)+1n)); expect(saved.approved).toBe(0); expect(saved.votes).toHaveLength(2); expect(saved.votes.every(value => !value.current)).toBe(true); });
    await webCase('UC-APR-0016', async () => { await a.getByRole('button', { name: 'Approve', exact: true }).click(); await expect(a).toContainText('1 / 2 approvals'); await expect(a.locator('.review-votes li')).toHaveCount(3); const saved = await context(request, f); expect(saved.approved).toBe(1); expect(saved.votes.filter(value => value.current)).toHaveLength(1); expect(saved.votes.find(value => value.current)?.issueRevision).toBe(saved.issueRevision); });
  } finally { await other.browserContext.close(); }
});

test('native rejection vetoes an already satisfied approval threshold and prevents the issue move', async ({ page, request, browser }) => {
  const f = await fixture(request), a = await open(page, f), other = await secondPage(browser);
  try {
    const b = await open(other.page, f, 'owner'); await a.getByRole('button', { name: 'Approve', exact: true }).click(); await expect(a).toContainText('Review requirements satisfied'); await b.getByRole('button', { name: 'Request changes', exact: true }).click();
    await webCase('UC-APR-0014', async () => { await expect(b).toContainText('Changes requested'); await expect(b.locator('.review-votes li')).toHaveCount(2); const saved = await context(request, f); expect(saved.approved).toBe(1); expect(saved.rejected).toBe(true); expect(saved.reviewSatisfied).toBe(false); });
    await webCase('UC-APR-0021', async () => { await other.page.getByRole('button', { name: /^Issue status:/ }).click(); await expect(other.page.getByRole('menuitemradio', { name: /^Review/ })).toBeDisabled(); await other.page.keyboard.press('Escape'); expect((await coverageRead(request, f.issue.summary.id)).summary.stage.id).toBe(f.issue.summary.stage.id); });
  } finally { await other.browserContext.close(); }
});

test('native insufficient approvals prevent the move without changing the current stage', async ({ page, request }) => {
  const f = await fixture(request, { approvalsRequired: 2 }), review = await open(page, f);
  await webCase('UC-APR-0020', async () => { await review.getByRole('button', { name: 'Approve', exact: true }).click(); await expect(review).toContainText('1 / 2 approvals'); await page.getByRole('button', { name: /^Issue status:/ }).click(); await expect(page.getByRole('menuitemradio', { name: /^Review/ })).toBeDisabled(); await page.keyboard.press('Escape'); expect((await coverageRead(request, f.issue.summary.id)).summary.stage.id).toBe(f.issue.summary.stage.id); });
});

for (const system of ['assignee','dueDate','description','custom'] as const) test('native approved transition still requires meaningful ' + system, async ({ page, request }) => {
  const f = await fixture(request, { requiredSystemFields: system === 'custom' ? [] : [system === 'dueDate' ? 'due_date' : system] });
  if (system === 'custom') { const field = await coverageDefinition(request, f.projectId, { kind: 'text', name: 'Required review acceptance' }); const reply = await request.put(`${apiOrigin}/api/v2/projects/${f.projectId}/workflows/${f.issue.summary.workflow.id}/transitions/${f.edge.transitionId}/policy`, { headers: await coverageHeaders('owner'), data: { expectedRevision: (await configuration(request, f.projectId)).revision, policy: { approvalsRequired: 1, approverRole: 'member', excludeIssueReporter: false, requiredSystemFields: [], requiredFieldIds: [field.id] } } }); expect(reply.status()).toBe(200); }
  const review = await open(page, f); await review.getByRole('button', { name: 'Approve', exact: true }).click(); await expect(review).toContainText('Review requirements satisfied');
  await webCase(system === 'assignee' ? 'UC-APR-0022' : system === 'dueDate' ? 'UC-APR-0023' : system === 'description' ? 'UC-APR-0024' : 'UC-APR-0025', async () => { await page.getByRole('button', { name: /^Issue status:/ }).click(); const reply = page.waitForResponse(value => value.request().method() === 'POST' && value.url().endsWith('/api/v2/issues/' + f.issue.summary.id + '/move')); await page.getByRole('menuitemradio', { name: 'Review', exact: true }).click(); expect((await reply).status()).toBe(422); await expect(page.locator('gg-modern-issue-actions').getByRole('alert')).toContainText(system === 'assignee' ? 'Assign the issue before this move.' : system === 'dueDate' ? 'Set a due date before this move.' : system === 'description' ? 'Add a meaningful description before this move.' : 'Complete all custom fields required by this transition.'); expect((await coverageRead(request, f.issue.summary.id)).summary.stage.id).toBe(f.issue.summary.stage.id); await expect(page.getByRole('button', { name: 'Issue status: ' + f.issue.summary.stage.name, exact: true })).toBeVisible(); });
});

for (const changed of ['issue','workflow','configuration','retired'] as const) test('native vote refuses a ' + changed + ' context changed after selection', async ({ page, request }) => {
  const f = await fixture(request), review = await open(page, f);
  if (changed === 'issue') { const reply = await request.put(`${apiOrigin}/api/v2/issues/${f.issue.summary.id}`, { headers: await coverageHeaders(), data: { expectedRevision: f.issue.summary.revision, editable: { ...modernEditable(f.issue), title: 'Concurrent content change' } } }); expect(reply.status()).toBe(200); }
  else if (changed === 'configuration') await coverageDefinition(request, f.projectId, { kind: 'text', name: 'Concurrent configuration change' });
  else if (changed === 'workflow') { const stage = f.issue.summary.stage, reply = await request.put(`${apiOrigin}/api/v2/projects/${f.projectId}/workflows/${f.issue.summary.workflow.id}/stages/${stage.id}`, { headers: await coverageHeaders('owner'), data: { expectedRevision: (await configuration(request,f.projectId)).revision, name: stage.name + ' revised', category: stage.category, position: stage.position, initial: stage.initial, acceptsEntries: stage.acceptsEntries, retired: false } }); expect(reply.status()).toBe(200); zSavedStageSaved.parse(await reply.json()); }
  else { const reply = await request.get(`${apiOrigin}/api/v2/projects/${f.projectId}/workflows/${f.issue.summary.workflow.id}/transitions`, { headers: await coverageHeaders('owner') }); expect(reply.status()).toBe(200); const edge = zPageTransitionView.parse(await reply.json()).items.find(value => value.id === f.edge.transitionId)!; const saved = await request.put(`${apiOrigin}/api/v2/projects/${f.projectId}/workflows/${f.issue.summary.workflow.id}/transitions/${edge.id}`, { headers: await coverageHeaders('owner'), data: { expectedRevision: (await configuration(request,f.projectId)).revision, fromStageId: edge.fromStageId, toStageId: edge.toStageId, requiredPermission: edge.requiredPermission, retired: true } }); expect(saved.status()).toBe(200); zSavedTransitionSaved.parse(await saved.json()); }
  await webCase(changed === 'issue' ? 'UC-APR-0040' : changed === 'workflow' ? 'UC-APR-0041' : changed === 'configuration' ? 'UC-APR-0042' : 'UC-APR-0043', async () => { const pending = page.waitForResponse(value => value.request().method() === 'POST' && value.url().endsWith(f.path + '/approvals')); await review.getByRole('button', { name: 'Approve', exact: true }).click(); expect((await pending).status()).toBe(changed === 'retired' ? 422 : 409); await expect(review.getByRole('alert')).toBeVisible(); await expect(review.getByRole('button', { name: 'Retry original review action', exact: true })).toBeVisible(); expect((await context(request, f)).votes).toEqual([]); });
});

for (const action of ['retry','refresh'] as const) test('native uncertain review ' + action + ' keeps ownership of its accepted intention', async ({ page, request }) => {
  const f = await fixture(request), review = await open(page, f), attempts: { reference: string | undefined; body: unknown }[] = [];
  await page.route('**' + f.path + '/approvals', async route => { if (route.request().method() !== 'POST') { await route.continue(); return; } attempts.push({ reference: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() }); const reply = await route.fetch(); expect(reply.status()).toBe(200); if (attempts.length === 1) await route.abort('failed'); else await route.fulfill({ response: reply }); });
  await review.getByRole('button', { name: 'Approve', exact: true }).click(); await expect(review.getByRole('alert')).toBeVisible(); await expect(review.getByRole('button', { name: 'Retry original review action', exact: true })).toBeVisible();
  await webCase(action === 'retry' ? 'UC-APR-0051' : 'UC-APR-0052', async () => { await review.getByRole('button', { name: action === 'retry' ? 'Retry original review action' : 'Review current context', exact: true }).click(); await expect(review.getByRole('button', { name: 'Retry original review action', exact: true })).toHaveCount(0); await expect(review).toContainText('Review requirements satisfied'); if (action === 'retry') { expect(attempts).toHaveLength(2); expect(attempts[1]).toEqual(attempts[0]); } else expect(attempts).toHaveLength(1); expect((await context(request, f)).votes).toHaveLength(1); });
});

for (const changed of ['issue','workflow','configuration'] as const) test('native retained approval becomes previous history after a real ' + changed + ' revision', async ({ page, request }) => {
  const f = await fixture(request), review = await open(page, f); await review.getByRole('button', { name: 'Approve', exact: true }).click(); await expect(review).toContainText('Review requirements satisfied'); const prior = await context(request, f);
  if (changed === 'issue') { await page.getByRole('button', { name: 'Edit title', exact: true }).click(); const edit = page.getByRole('group', { name: 'Edit title', exact: true }); await edit.getByLabel('title', { exact: true }).fill('New native issue content'); await edit.getByRole('button', { name: 'Save', exact: true }).click(); await expect(edit).toHaveCount(0); }
  else if (changed === 'configuration') await coverageDefinition(request, f.projectId, { kind: 'text', name: 'New field invalidates old review' });
  else { const stage = f.issue.summary.stage; const response = await request.put(`${apiOrigin}/api/v2/projects/${f.projectId}/workflows/${f.issue.summary.workflow.id}/stages/${stage.id}`, { headers: await coverageHeaders('owner'), data: { expectedRevision: (await configuration(request,f.projectId)).revision, name: 'Changed workflow stage label', category: stage.category, position: stage.position, initial: stage.initial, acceptsEntries: stage.acceptsEntries, retired: false } }); expect(response.status()).toBe(200); }
  await webCase(changed === 'issue' ? 'UC-APR-0037' : changed === 'workflow' ? 'UC-APR-0038' : 'UC-APR-0039', async () => { await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(''); await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(f.edge.transitionId); await expect(review).toContainText('0 / 1 approvals'); await expect(review.locator('.review-votes li')).toHaveCount(1); await expect(review.locator('.review-votes li')).toContainText('Previous review'); const current = await context(request, f); expect(current.approved).toBe(0); expect(current.votes[0]?.decision).toBe('approve'); expect(current.votes[0]?.current).toBe(false); expect(current.votes[0]?.issueRevision).toBe(prior.issueRevision); if (changed === 'issue') expect(current.issueRevision).not.toBe(prior.issueRevision); else if (changed === 'workflow') expect(current.workflowRevision).not.toBe(prior.workflowRevision); else expect(current.configurationRevision).not.toBe(prior.configurationRevision); });
});

for (const state of ['removed','demoted'] as const) test('native retained reviewer becomes ineligible after membership is ' + state, async ({ page, request }) => {
  const f = await fixture(request, { approverRole: state === 'demoted' ? 'project_admin' : 'member' });
  const memberships = await request.get(`${apiOrigin}/api/v1/projects/${f.projectId}/memberships`, { headers: await coverageHeaders('owner') }); expect(memberships.status()).toBe(200); let membership = (await import('../src/app/api/generated/zod.gen')).zPageMembershipView.parse(await memberships.json()).items.find(value => value.user.id === '10000000-0000-4000-8000-000000000002')!;
  if (state === 'demoted') { const promoted = await request.put(`${apiOrigin}/api/v1/projects/${f.projectId}/memberships/${membership.user.id}`, { headers: await coverageHeaders('owner'), data: { expectedRevision: membership.revision, role: 'project_admin' } }); expect(promoted.status()).toBe(200); membership = (await import('../src/app/api/generated/zod.gen')).zSavedMembershipView.parse(await promoted.json()).result; }
  const review = await open(page, f); await review.getByRole('button', { name: 'Approve', exact: true }).click(); await expect(review).toContainText('Review requirements satisfied');
  await signIn(page, 'owner', '/issues/' + f.issue.summary.id, new RegExp('^' + f.issue.summary.title + '$')); await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(f.edge.transitionId); await expect(review).toContainText('Review requirements satisfied');
  const changed = state === 'removed' ? await request.post(`${apiOrigin}/api/v1/projects/${f.projectId}/memberships/${membership.user.id}/remove`, { headers: await coverageHeaders('owner'), data: { expectedRevision: membership.revision } }) : await request.put(`${apiOrigin}/api/v1/projects/${f.projectId}/memberships/${membership.user.id}`, { headers: await coverageHeaders('owner'), data: { expectedRevision: membership.revision, role: 'member' } }); expect(changed.status()).toBe(200);
  await webCase(state === 'removed' ? 'UC-APR-0033' : 'UC-APR-0036', async () => { await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(''); await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(f.edge.transitionId); await expect(review).toContainText('0 / 1 approvals'); await expect(review.locator('.review-votes li')).toContainText('Previous review'); const current = await context(request,f,'owner'); expect(current.votes).toHaveLength(1); expect(current.votes[0]?.current).toBe(true); expect(current.votes[0]?.eligible).toBe(false); expect(current.approved).toBe(0); });
});

async function retainedOwnedVote(projectId: string, issueId: string, userId: string, unapprove = false) {
  const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
  if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database) || ![projectId,issueId,userId].every(value => /^[0-9a-f-]{36}$/.test(value)) || userId.startsWith('10000000-')) throw new Error('Historical eligibility fixture requires a disposable database and newly created reviewer.');
  // This models a retained historical decision for an owned account. It does
  // not claim that the new account signed in or submitted a vote through UI.
  const sql = unapprove ? `UPDATE users SET approved_at=NULL WHERE id='${userId}' AND NOT is_administrator AND EXISTS(SELECT 1 FROM issue_approvals WHERE project_id='${projectId}' AND issue_id='${issueId}' AND approver_id=users.id);` : `INSERT INTO issue_approvals(project_id,issue_id,transition_id,issue_revision,workflow_revision,configuration_revision,approver_id,decision) SELECT project_id,issue_id,transition_id,issue_revision,workflow_revision,configuration_revision,'${userId}','approve' FROM issue_approvals WHERE project_id='${projectId}' AND issue_id='${issueId}' AND approver_id='10000000-0000-4000-8000-000000000002' LIMIT 1;`;
  const { execFile } = await import('node:child_process'), { promisify } = await import('node:util'), { resolve } = await import('node:path'); const reply = await promisify(execFile)('docker', ['compose','-f',resolve('../compose.dev.yaml'),'exec','-T','postgres','psql','--username=gategoldjira','--dbname='+database,'-v','ON_ERROR_STOP=1','-c',sql]); expect(reply.stdout.trim()).toBe(unapprove ? 'UPDATE 1' : 'INSERT 0 1');
}
for (const state of ['disabled','unapproved'] as const) test('native history excludes an owned retained reviewer after the account becomes ' + state, async ({ page, request }) => {
  const f = await fixture(request, { approvalsRequired: 2 }), review = await open(page,f); await review.getByRole('button',{name:'Approve',exact:true}).click(); await expect(review).toContainText('1 / 2 approvals');
  const created = await request.post(`${apiOrigin}/api/v1/admin/users`, { headers: await coverageHeaders('owner'), data: { email: crypto.randomUUID()+'@example.test', displayName:'Owned native historical reviewer', administrator:false } }); expect(created.status()).toBe(201); const person = (await import('../src/app/api/generated/zod.gen')).zSavedUserView.parse(await created.json()).result;
  const joined = await request.put(`${apiOrigin}/api/v1/projects/${f.projectId}/memberships/${person.id}`, { headers:await coverageHeaders('owner'), data:{expectedRevision:'0',role:'member'} }); expect(joined.status()).toBe(200); await retainedOwnedVote(f.projectId,f.issue.summary.id,person.id);
  await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(''); await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(f.edge.transitionId); await expect(review).toContainText('Review requirements satisfied');
  await webCase(state==='disabled'?'UC-APR-0034':'UC-APR-0035', async()=>{ if(state==='unapproved') await retainedOwnedVote(f.projectId,f.issue.summary.id,person.id,true); else { const changed=await request.put(`${apiOrigin}/api/v1/admin/users/${person.id}`,{headers:await coverageHeaders('owner'),data:{expectedRevision:person.revision,email:person.email,displayName:person.displayName,administrator:false,active:false}});expect(changed.status()).toBe(200); } await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(''); await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(f.edge.transitionId); await expect(review).toContainText('1 / 2 approvals'); await expect(review.locator('.review-votes li').filter({hasText:person.displayName})).toContainText('Previous review'); const current=await context(request,f);expect(current.approved).toBe(1);const retained=current.votes.find(value=>value.approver.id===person.id);expect(retained?.current).toBe(true);expect(retained?.eligible).toBe(false);expect(retained?.decision).toBe('approve');expect(current.reviewSatisfied).toBe(false); });
});

for (const prerequisite of ['child', 'blocker'] as const) test('native approved completion still refuses an unfinished ' + prerequisite, async ({ page, request }) => {
  const f = await fixture(request, {}, 'done');
  const unfinished = await coverageCreate(request, f.projectId, prerequisite === 'child' ? {
    parentId: f.issue.summary.id, expectedParentRevision: f.issue.summary.revision,
  } : { title: 'Unfinished approved completion blocker' });
  if (prerequisite === 'blocker') {
    const current = await coverageRead(request, f.issue.summary.id);
    const linked = await request.post(`${apiOrigin}/api/v1/issues/${f.issue.summary.id}/dependencies`, {
      headers: await coverageHeaders(), data: { blockerId: unfinished.summary.id, expectedIssueRevision: current.summary.revision, expectedGraphRevision: current.graphRevision },
    });
    expect(linked.status()).toBe(200); zSavedDependencyView.parse(await linked.json());
    expect((await coverageRead(request, f.issue.summary.id)).summary.blocked).toBe(true);
  }
  const review = await open(page, f);
  await review.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(review).toContainText('Review requirements satisfied');
  await webCase('UC-APR-0026', async () => {
    await page.getByRole('button', { name: /^Issue status:/ }).click();
    const pending = page.waitForResponse(value => value.request().method() === 'POST' && value.url().endsWith('/api/v2/issues/' + f.issue.summary.id + '/move'));
    await page.getByRole('menuitemradio', { name: 'Done', exact: true }).click();
    expect((await pending).status()).toBe(409);
    await expect(page.locator('gg-modern-issue-actions').getByRole('alert')).toContainText('Finish every direct blocker and subtask');
    expect((await coverageRead(request, f.issue.summary.id)).summary.stage.id).toBe(f.issue.summary.stage.id);
    expect((await coverageRead(request, unfinished.summary.id)).summary.stage.category).toBe('todo');
    expect((await context(request, f)).reviewSatisfied).toBe(true);
    if (prerequisite === 'blocker') expect((await coverageRead(request, f.issue.summary.id)).summary.blocked).toBe(true);
  });
});

test('native sufficient approval cannot bypass the transition administrator permission',async({page,request})=>{
  const f=await fixture(request);const restricted=await request.put(`${apiOrigin}/api/v2/projects/${f.projectId}/workflows/${f.issue.summary.workflow.id}/transitions/${f.edge.transitionId}`,{headers:await coverageHeaders('owner'),data:{expectedRevision:(await configuration(request,f.projectId)).revision,fromStageId:f.issue.summary.stage.id,toStageId:f.edge.stage.id,requiredPermission:'project_admin',retired:false}});expect(restricted.status()).toBe(200);
  const review=await open(page,f);await review.getByRole('button',{name:'Approve',exact:true}).click();await expect(review).toContainText('Review requirements satisfied');
  await webCase('UC-APR-0027',async()=>{await page.getByRole('button',{name:/^Issue status:/}).click();await expect(page.getByRole('menuitemradio',{name:/^Review/})).toBeDisabled();await expect(page.getByRole('menuitemradio',{name:/^Review/})).toContainText('Project administrator required');await page.keyboard.press('Escape');expect((await coverageRead(request,f.issue.summary.id)).summary.stage.id).toBe(f.issue.summary.stage.id);expect((await context(request,f)).reviewSatisfied).toBe(true);});
});

for (const role of ['owner','member'] as const) test('native ' + role + ' reviewer records an eligible current decision',async({page,request})=>{
  const f=await fixture(request,{approverRole:role==='owner'?'project_admin':'member'}),review=await open(page,f,role);
  await webCase(role==='owner'?'UC-APR-0030':'UC-APR-0031',async()=>{await review.getByRole('button',{name:'Approve',exact:true}).click();await expect(review).toContainText('Review requirements satisfied');await expect(review.locator('.review-votes li')).toHaveCount(1);const current=await context(request,f);expect(current.approved).toBe(1);expect(current.votes[0]?.approver.id).toBe(role==='owner'?'10000000-0000-4000-8000-000000000001':'10000000-0000-4000-8000-000000000002');expect(current.votes[0]?.eligible).toBe(true);expect(current.votes[0]?.current).toBe(true);});
});

for(const role of ['member','viewer'] as const)test('native reviewer downgrade to '+role+' rejects a stale visible vote action',async({page,request})=>{
  const f=await fixture(request,{approverRole:role==='member'?'project_admin':'member'});const members=await request.get(`${apiOrigin}/api/v1/projects/${f.projectId}/memberships`,{headers:await coverageHeaders('owner')});expect(members.status()).toBe(200);let membership=(await import('../src/app/api/generated/zod.gen')).zPageMembershipView.parse(await members.json()).items.find(value=>value.user.id==='10000000-0000-4000-8000-000000000002')!;
  if(role==='member'){const promoted=await request.put(`${apiOrigin}/api/v1/projects/${f.projectId}/memberships/${membership.user.id}`,{headers:await coverageHeaders('owner'),data:{expectedRevision:membership.revision,role:'project_admin'}});expect(promoted.status()).toBe(200);membership=(await import('../src/app/api/generated/zod.gen')).zSavedMembershipView.parse(await promoted.json()).result;}
  const review=await open(page,f);const demoted=await request.put(`${apiOrigin}/api/v1/projects/${f.projectId}/memberships/${membership.user.id}`,{headers:await coverageHeaders('owner'),data:{expectedRevision:membership.revision,role}});expect(demoted.status()).toBe(200);
  await webCase(role==='member'?'UC-APR-0029':'UC-APR-0032',async()=>{const pending=page.waitForResponse(value=>value.request().method()==='POST'&&value.url().endsWith(f.path+'/approvals'));await review.getByRole('button',{name:'Approve',exact:true}).click();expect((await pending).status()).toBe(403);await expect(review.getByRole('button',{name:'Approve',exact:true})).toHaveCount(0);await expect(review.getByRole('button',{name:'Request changes',exact:true})).toHaveCount(0);const select=review.getByRole('combobox',{name:'Move to review',exact:true});await expect(select).toHaveValue('');await select.selectOption(f.edge.transitionId);await expect(review).toContainText('0 / 1 approvals');await expect(review.getByRole('button',{name:'Approve',exact:true})).toHaveCount(0);await expect(review.getByRole('button',{name:'Request changes',exact:true})).toHaveCount(0);const current=await context(request,f,'owner');expect(current.votes).toEqual([]);expect(current.approved).toBe(0);});
});

test('native reporter exclusion omits voting and stops counting the retained reporter decision',async({page,request})=>{
  const f=await fixture(request),review=await open(page,f);await review.getByRole('button',{name:'Approve',exact:true}).click();await expect(review).toContainText('Review requirements satisfied');
  const changed=await request.put(`${apiOrigin}/api/v2/projects/${f.projectId}/workflows/${f.issue.summary.workflow.id}/transitions/${f.edge.transitionId}/policy`,{headers:await coverageHeaders('owner'),data:{expectedRevision:(await configuration(request,f.projectId)).revision,policy:{approvalsRequired:1,approverRole:'member',excludeIssueReporter:true,requiredSystemFields:[],requiredFieldIds:[]}}});expect(changed.status()).toBe(200);
  await webCase('UC-APR-0069',async()=>{await review.getByRole('combobox',{name:'Move to review',exact:true}).selectOption('');await review.getByRole('combobox',{name:'Move to review',exact:true}).selectOption(f.edge.transitionId);await expect(review).toContainText('0 / 1 approvals');await expect(review.getByRole('button',{name:'Approve',exact:true})).toHaveCount(0);await expect(review.getByRole('button',{name:'Request changes',exact:true})).toHaveCount(0);await expect(review.locator('.review-votes li')).toContainText('Previous review');const current=await context(request,f);expect(current.canVote).toBe(false);expect(current.approved).toBe(0);expect(current.votes[0]?.approver.id).toBe(f.issue.reporter.id);expect(current.votes[0]?.eligible).toBe(false);});
});
