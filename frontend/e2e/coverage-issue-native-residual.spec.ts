import { modernEditable } from '../src/app/features/issues/issue-model';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { coverageConfiguration, coverageGet, coverageHeaders, coverageIssue, coverageProject, coverageReadIssue, coverageSwitchAccount, coverageWrite } from './support/coverage-boards';
import { zModernSearchInput, zPageAssetView, zPageModernIssueSummary, zPagePriorityView, zPageTypeView, zPageTransitionView, zPageStageView, zPageWorkflowView, zSavedConfigurationView, zSavedLabelView, zSavedMembershipView, zSavedModernIssueView, zSavedPrioritySaved, zSavedTransitionPolicyView, zSavedTransitionSaved, zSavedTypeSaved, zProjectView, zSavedProjectView } from '../src/app/api/generated/zod.gen';
import type { ModernIssueView } from '../src/app/api/generated/types.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated real Go/PostgreSQL browser environment.');
test.use({ trace: 'off' });
test.describe.configure({ timeout: 120000 });
const webCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
const memberId = '10000000-0000-4000-8000-000000000002';
async function fullEditor(page: Page, issue: ModernIssueView) {
  await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit ' + issue.summary.key, exact: true });
  await expect(dialog).toBeVisible(); return dialog;
}
function deferred() { let resolve = () => {}; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function priority(request: APIRequestContext, projectId: string, key: string, name: string) {
  return (await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/priorities/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, key, name, sortOrder: '10', retired: false }, zSavedPrioritySaved, 201)).result.priority;
}

test('native creation resumes only the remaining post-create upload on the same issue', async ({ request, page }) => {
  const projectId = await coverageProject(request), title = 'Resume native created issue ' + crypto.randomUUID().slice(0, 8);
  await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/);
  await page.getByRole('button', { name: 'New issue', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
  await dialog.getByLabel('Issue title', { exact: true }).fill(title);
  const chooser = page.waitForEvent('filechooser'); await dialog.getByRole('button', { name: 'Attach files or pictures', exact: true }).click();
  await (await chooser).setFiles([{ name: 'already-uploaded.txt', mimeType: 'text/plain', buffer: Buffer.from('First real upload') }, { name: 'remaining-upload.txt', mimeType: 'text/plain', buffer: Buffer.from('Second real upload') }]);
  await expect(dialog.getByRole('list', { name: 'Queued attachments', exact: true }).locator('li')).toHaveCount(2);
  const creates: string[] = [], finalizations: string[] = [];
  page.on('request', outgoing => { if (outgoing.method() === 'POST' && new URL(outgoing.url()).pathname === `/api/v2/projects/${projectId}/issues`) creates.push(outgoing.url()); });
  await page.route('**/api/v1/asset-uploads/*/finalize', async route => {
    finalizations.push(new URL(route.request().url()).pathname);
    if (finalizations.length === 2) return route.abort('failed');
    const response = await route.fetch(); expect(response.status()).toBe(201); await route.fulfill({ response });
  });
  await webCase('UC-ISS-0021', async () => {
    await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Retry original create', exact: true })).toBeVisible();
    await expect(dialog.locator('.creation-files li').filter({ hasText: 'already-uploaded.txt' })).toContainText('Uploaded');
    await expect(dialog.locator('.creation-files li').filter({ hasText: 'remaining-upload.txt' })).toContainText('Upload failed');
    const before = await coverageWrite(request, 'POST', '/api/v2/issues/search', { filters: { projectIds: [projectId], query: title } }, zPageModernIssueSummary, 200, 'member'); expect(before.totalMatching).toBe(1); const id = before.items[0]!.id;
    await dialog.getByRole('button', { name: 'Retry original create', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/issues/${id}$`)); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    expect(creates).toHaveLength(1); expect(finalizations).toHaveLength(3); expect(finalizations[2]).toBe(finalizations[1]); expect(finalizations[0]).not.toBe(finalizations[1]);
    const after = await coverageWrite(request, 'POST', '/api/v2/issues/search', { filters: { projectIds: [projectId], query: title } }, zPageModernIssueSummary, 200, 'member'); expect(after.items.map(value => value.id)).toEqual([id]);
    const files = await coverageGet(request, `/api/v1/issues/${id}/assets`, zPageAssetView, 'member'); expect(files.items.map(value => value.filename).sort()).toEqual(['already-uploaded.txt', 'remaining-upload.txt']);
  });
});

test('native title validation keeps an over-limit Unicode draft and a completed no-match search is explicit', async ({ request, page }) => {
  const projectId = await coverageProject(request); await coverageIssue(request, projectId, { title: 'Native existing issue' });
  await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/);
  await webCase('UC-ISS-0071', async () => {
    const query = page.getByRole('searchbox', { name: 'Search by title or issue key', exact: true }); await query.fill('no native match ' + crypto.randomUUID());
    await expect(query).toHaveAttribute('aria-busy', 'false'); await expect(page.getByText('No issues match these filters.', { exact: true })).toBeVisible(); await expect(page.getByRole('list', { name: 'Issue results list', exact: true }).locator('.issue-key')).toHaveCount(0);
  });
  await page.getByRole('button', { name: 'New issue', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
  await webCase('UC-ISS-0025', async () => {
    const title = '😀'.repeat(201), input = dialog.getByLabel('Issue title', { exact: true }); const attempts: string[] = [];
    page.on('request', outgoing => { if (outgoing.method() === 'POST' && new URL(outgoing.url()).pathname === `/api/v2/projects/${projectId}/issues`) attempts.push(outgoing.url()); });
    await input.fill(title); await expect(input).toHaveClass(/\bng-invalid\b/); await expect(input).toHaveAttribute('aria-describedby', 'issue-title-count'); await expect(dialog.locator('#issue-title-count')).toHaveText('201 / 200 characters'); await expect(dialog.getByRole('button', { name: 'Create issue', exact: true })).toBeDisabled();
    await input.press('Enter'); await expect(dialog).toBeVisible(); await expect(input).toHaveValue(title); expect(attempts).toEqual([]);
  });
});

test('native full editing populates every field and a stale save retains its draft for deliberate review', async ({ request, page }) => {
  const projectId = await coverageProject(request), label = (await coverageWrite(request, 'POST', `/api/v1/projects/${projectId}/labels`, { name: 'Native edit label' }, zSavedLabelView, 201, 'member')).result;
  const issue = await coverageIssue(request, projectId, { title: 'Native full edit source', description: '<p>Saved full edit description</p>', descriptionFormat: 'html', assigneeId: memberId, dueDate: '2027-04-16', labelIds: [label.id] });
  await signIn(page, 'member', `/issues/${issue.summary.id}`, /^Native full edit source$/);
  const dialog = await webCase('UC-ISS-0108', async () => {
    const editor = await fullEditor(page, issue); await expect(editor.getByLabel('Issue title', { exact: true })).toHaveValue(issue.summary.title); await expect(editor.getByRole('combobox', { name: 'Issue type', exact: true })).toHaveValue(issue.summary.type.id); await expect(editor.getByRole('combobox', { name: 'Priority', exact: true })).toHaveValue(issue.summary.priority.id); await expect(editor.getByRole('button', { name: 'Remove مطور تجريبي', exact: true })).toBeVisible(); await expect(editor.getByLabel('Due date', { exact: true })).toHaveValue('2027-04-16'); await expect(editor.getByRole('button', { name: 'Remove Native edit label', exact: true })).toBeVisible(); await expect(editor.getByRole('textbox', { name: 'Description', exact: true })).toContainText('Saved full edit description'); return editor;
  });
  await webCase('UC-ISS-0199', async () => { const types = (await coverageGet(request, `/api/v2/projects/${projectId}/issue-types`, zPageTypeView)).items; const options = dialog.getByRole('combobox', { name: 'Issue type', exact: true }).locator('option'); await expect(options).toHaveCount(types.filter(value => value.behavior === 'standard' && !value.retired).length); const offered = await options.evaluateAll(elements => elements.map(element => (element as HTMLOptionElement).value)); expect(offered).toContain(issue.summary.type.id); for (const type of types.filter(value => value.behavior === 'subtask')) expect(offered).not.toContain(type.id); await expect(dialog.getByRole('combobox', { name: /parent/i })).toHaveCount(0); expect((await coverageReadIssue(request, issue.summary.id)).summary.parent).toEqual(issue.summary.parent); });
  await webCase('UC-ISS-0162', async () => {
    await dialog.getByLabel('Issue title', { exact: true }).fill('Native stale full form draft');
    const latest = (await coverageWrite(request, 'PUT', `/api/v2/issues/${issue.summary.id}`, { expectedRevision: issue.summary.revision, editable: { ...modernEditable(issue), title: 'Concurrent full form title' } }, zSavedModernIssueView, 200, 'owner')).result;
    const response = page.waitForResponse(value => value.request().method() === 'PUT' && new URL(value.url()).pathname === `/api/v2/issues/${issue.summary.id}`);
    await dialog.getByRole('button', { name: 'Save issue', exact: true }).click(); expect((await response).status()).toBe(409);
    await expect(dialog.getByRole('button', { name: 'Review current issue', exact: true })).toBeVisible(); await expect(dialog).toContainText('Concurrent full form title'); await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue('Native stale full form draft'); expect((await coverageReadIssue(request, issue.summary.id)).summary.revision).toBe(latest.summary.revision);
  });
});

test('native complete typed date commits when focus leaves and a revoked writer keeps their rejected form draft', async ({ request, page }) => {
  const projectId = await coverageProject(request), issue = await coverageIssue(request, projectId, { title: 'Native blur and access', dueDate: '2027-04-16' });
  await signIn(page, 'member', `/issues/${issue.summary.id}`, /^Native blur and access$/);
  await webCase('UC-ISS-0104', async () => {
    await page.getByRole('button', { name: 'Edit due date', exact: true }).click(); const field = page.getByRole('group', { name: 'Edit due date', exact: true }), date = field.getByLabel('due date', { exact: true });
    await expect(date).toBeFocused(); await date.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Backspace'); for (const digit of ['2', '0', '3', '3']) await page.keyboard.press(digit);
    await expect(date).toHaveValue('2033-04-16'); await expect(field).toBeVisible(); expect((await coverageReadIssue(request, issue.summary.id)).summary.dueDate).toBe('2027-04-16');
    await page.getByRole('heading', { name: 'Description', exact: true }).click(); await expect(field).toHaveCount(0); await expect(page.locator('.due-value')).toContainText('2033-04-16'); expect((await coverageReadIssue(request, issue.summary.id)).summary.dueDate).toBe('2033-04-16');
  });
  const dialog = await fullEditor(page, issue); await dialog.getByLabel('Issue title', { exact: true }).fill('Revoked writer retained draft');
  const before = await coverageReadIssue(request, issue.summary.id);
  await coverageWrite(request, 'PUT', `/api/v1/projects/${projectId}/memberships/${memberId}`, { expectedRevision: '1', role: 'viewer' }, zSavedMembershipView);
  await webCase('UC-ISS-0170', async () => {
    const rejected = page.waitForResponse(value => value.request().method() === 'PUT' && new URL(value.url()).pathname === `/api/v2/issues/${issue.summary.id}`);
    await dialog.getByRole('button', { name: 'Save issue', exact: true }).click(); const response = await rejected; expect(response.status()).toBe(403); expect(await response.json()).toMatchObject({ error: { code: 'forbidden' } }); await expect(dialog.getByRole('alert')).toBeVisible(); await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue('Revoked writer retained draft'); expect((await coverageReadIssue(request, issue.summary.id)).summary).toEqual(before.summary);
  });
});

test('native clone of a subtask uses the current standard default and keeps the original parent immutable', async ({ request, page }) => {
  const projectId = await coverageProject(request), kind = (await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/issue-types/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, key: 'native_clone_default', name: 'Native clone standard', behavior: 'standard', retired: false }, zSavedTypeSaved, 201)).result.type;
  const config = await coverageConfiguration(request, projectId); await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/configuration/defaults`, { expectedRevision: config.revision, defaults: { ...config.defaults, standardTypeId: kind.id } }, zSavedConfigurationView);
  const parent = await coverageIssue(request, projectId, { title: 'Native clone parent' }), child = await coverageIssue(request, projectId, { title: 'Native clone child', parentId: parent.summary.id, expectedParentRevision: parent.summary.revision });
  await signIn(page, 'member', `/issues/${child.summary.id}`, /^Native clone child$/);
  await webCase('UC-REL-0076', async () => {
    const dialog = await fullEditor(page, child); await expect(dialog.getByText(/Parent stays fixed\./)).toBeVisible(); await expect(dialog.getByRole('combobox', { name: /parent/i })).toHaveCount(0); await expect(dialog.getByRole('button', { name: /reparent|change parent/i })).toHaveCount(0);
    await dialog.getByLabel('Issue title', { exact: true }).fill('Native immutable child parent'); await dialog.getByRole('button', { name: 'Save issue', exact: true }).click(); await expect(dialog).not.toBeVisible(); expect((await coverageReadIssue(request, child.summary.id)).summary.parent?.id).toBe(parent.summary.id);
  });
  await webCase('UC-ISS-0118', async () => {
    await page.locator('gg-modern-issue-actions .more-actions > summary').click(); await page.getByRole('button', { name: 'Clone issue', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Copy of Native immutable child parent', exact: true })).toBeVisible(); const id = new URL(page.url()).pathname.split('/').at(-1)!; expect(id).not.toBe(child.summary.id); const clone = await coverageReadIssue(request, id); expect(clone.summary.parent).toBeNull(); expect(clone.summary.type).toMatchObject({ id: kind.id, behavior: 'standard', name: kind.name }); expect((await coverageReadIssue(request, child.summary.id)).summary.parent?.id).toBe(parent.summary.id);
  });
});

test('native stage retry, current value and every keyboard direction preserve exact move intent', async ({ request, page }) => {
  const projectId = await coverageProject(request), issue = await coverageIssue(request, projectId, { title: 'Native status navigation' });
  await signIn(page, 'member', `/issues/${issue.summary.id}`, /^Native status navigation$/);
  const trigger = page.getByRole('button', { name: /^Issue status:/ }), menu = page.getByRole('menu', { name: 'Issue status', exact: true }), writes: string[] = [];
  page.on('request', outgoing => { if (outgoing.method() === 'POST' && new URL(outgoing.url()).pathname === `/api/v2/issues/${issue.summary.id}/move`) writes.push(outgoing.url()); });
  await page.route(`**/api/v2/issues/${issue.summary.id}/transitions*`, route => route.abort('failed'), { times: 1 });
  await trigger.click();
  await webCase('UC-ISS-0124', async () => {
    const retry = page.getByRole('button', { name: 'Retry stages', exact: true }); await expect(retry).toBeVisible(); await expect(menu.getByRole('menuitemradio', { name: 'In progress', exact: true })).toHaveCount(0); await retry.click(); await expect(menu.getByRole('menuitemradio', { name: 'In progress', exact: true })).toBeVisible(); await expect(retry).toHaveCount(0);
  });
  await webCase('UC-ISS-0121', async () => { await menu.getByRole('menuitemradio', { name: 'To do', exact: true }).click(); await expect(menu).toHaveCount(0); expect(writes).toEqual([]); expect((await coverageReadIssue(request, issue.summary.id)).summary.revision).toBe(issue.summary.revision); });
  await webCase('UC-ISS-0178', async () => {
    await trigger.focus(); await trigger.press('ArrowDown'); await expect(menu.getByRole('menuitemradio')).toHaveCount(4); await expect(menu.getByRole('menuitemradio', { name: 'To do', exact: true })).toBeFocused();
    await page.keyboard.press('End'); await expect(menu.getByRole('menuitemradio', { name: 'Done', exact: true })).toBeFocused(); await page.keyboard.press('ArrowUp'); await expect(menu.getByRole('menuitemradio', { name: 'Review', exact: true })).toBeFocused(); await page.keyboard.press('Home'); await expect(menu.getByRole('menuitemradio', { name: 'To do', exact: true })).toBeFocused(); await page.keyboard.press('ArrowDown'); await expect(menu.getByRole('menuitemradio', { name: 'In progress', exact: true })).toBeFocused(); await page.keyboard.press('Enter'); await expect(trigger).toHaveAccessibleName('Issue status: In progress'); await expect(menu).toHaveCount(0); expect((await coverageReadIssue(request, issue.summary.id)).summary.stage.category).toBe('in_progress');
    await trigger.press('ArrowUp'); await expect(menu.getByRole('menuitemradio', { name: 'Done', exact: true })).toBeFocused(); await page.keyboard.press('Escape'); await expect(menu).toHaveCount(0); await expect(trigger).toBeFocused(); expect(writes).toHaveLength(1);
  });
});

test('native restricted stages explain both administrator and unsatisfied approval requirements', async ({ request, page }) => {
  const projectId = await coverageProject(request), issue = await coverageIssue(request, projectId, { title: 'Native restricted status' }), root = `/api/v2/projects/${projectId}`, workflow = (await coverageGet(request, root + '/workflows', zPageWorkflowView)).items[0]!, transitions = (await coverageGet(request, `${root}/workflows/${workflow.id}/transitions`, zPageTransitionView)).items;
  const stages = (await coverageGet(request, `${root}/workflows/${workflow.id}/stages`, zPageStageView)).items, reviewStage = stages.find(value => value.category === 'review')!, doneStage = stages.find(value => value.category === 'done')!;
  const review = transitions.find(value => value.fromStageId === issue.summary.stage.id && value.toStageId === reviewStage.id), done = transitions.find(value => value.fromStageId === issue.summary.stage.id && value.toStageId === doneStage.id);
  if (!review || !done) throw new Error('Missing default native transition targets.');
  await coverageWrite(request, 'PUT', `${root}/workflows/${workflow.id}/transitions/${review.id}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, fromStageId: review.fromStageId, toStageId: review.toStageId, requiredPermission: 'project_admin', retired: false }, zSavedTransitionSaved);
  await coverageWrite(request, 'PUT', `${root}/workflows/${workflow.id}/transitions/${done.id}/policy`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, policy: { requiredSystemFields: [], requiredFieldIds: [], approvalsRequired: 1, approverRole: 'member', excludeIssueReporter: false } }, zSavedTransitionPolicyView);
  await signIn(page, 'member', `/issues/${issue.summary.id}`, /^Native restricted status$/);
  await webCase('UC-ISS-0122', async () => {
    await page.getByRole('button', { name: /^Issue status:/ }).click(); const menu = page.getByRole('menu', { name: 'Issue status', exact: true });
    const admin = menu.getByRole('menuitemradio', { name: /^Review/ }), approval = menu.getByRole('menuitemradio', { name: /^Done/ });
    await expect(admin).toBeDisabled(); await expect(admin).toContainText('Project administrator required'); await expect(approval).toBeDisabled(); await expect(approval).toContainText('Approval required'); await expect(menu.getByRole('menuitemradio', { name: 'In progress', exact: true })).toBeEnabled(); expect((await coverageReadIssue(request, issue.summary.id)).summary.stage.id).toBe(issue.summary.stage.id);
  });
});

test('native dirty full form asks before browser-back navigation and keeps its draft when cancelled', async ({ request, page }) => {
  const projectId = await coverageProject(request), issue = await coverageIssue(request, projectId, { title: 'Native guarded route' });
  await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/); await page.getByRole('list', { name: 'Issue results list', exact: true }).getByRole('link').filter({ hasText: issue.summary.key }).click(); await expect(page).toHaveURL(new RegExp(`/issues/${issue.summary.id}$`));
  const dialog = await fullEditor(page, issue); await dialog.getByLabel('Issue title', { exact: true }).fill('Native route draft remains');
  await webCase('UC-ISS-0184', async () => {
    let prompted = false; page.once('dialog', async value => { prompted = true; expect(value.type()).toBe('confirm'); await value.dismiss(); }); await page.goBack(); await expect.poll(() => prompted).toBe(true); await expect(page).toHaveURL(new RegExp(`/issues/${issue.summary.id}$`)); await expect(dialog).toBeVisible(); await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue('Native route draft remains'); expect((await coverageReadIssue(request, issue.summary.id)).summary.title).toBe(issue.summary.title);
  });
});

test('native prior-session issue reads and priority choices cannot populate the replacement account screen', async ({ request, page }) => {
  const a = await coverageProject(request), b = await coverageProject(request), pa = await priority(request, a, 'private_a_priority', 'Previous account choices A'), pb = await priority(request, b, 'new_b_priority', 'Replacement account choices B');
  const source = await coverageIssue(request, a, { title: 'Prior session source issue', priorityId: pa.id }), destination = await coverageIssue(request, b, { title: 'Replacement session issue', priorityId: pb.id });
  await signIn(page, 'member', `/issues/${source.summary.id}`, /^Prior session source issue$/);
  const releaseChoices = deferred(), choicesRequested = deferred(), releaseIssue = deferred(), issueRequested = deferred(); let issueReturned = false, choicesReturned = false;
  await page.route(`**/api/v2/projects/${a}/priorities*`, async route => { const response = await route.fetch(); expect(response.status()).toBe(200); choicesRequested.resolve(); await releaseChoices.promise; await route.fulfill({ response }); choicesReturned = true; }, { times: 1 });
  await page.getByRole('button', { name: 'Edit priority', exact: true }).click(); await choicesRequested.promise; await page.keyboard.press('Escape');
  await page.route(url => url.pathname === `/api/v2/issues/${source.summary.id}`, async route => { const response = await route.fetch(); expect(response.status()).toBe(200); issueRequested.resolve(); await releaseIssue.promise; await route.fulfill({ response }); issueReturned = true; }, { times: 1 });
  await page.getByRole('button', { name: 'Edit issue', exact: true }).click(); await issueRequested.promise;
  try {
    await webCase('UC-ISS-0185', async () => {
      await coverageSwitchAccount(page, 'owner', `/issues/${destination.summary.id}`); await expect(page.getByRole('heading', { name: destination.summary.title, exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Edit priority', exact: true }).click(); const popup = page.getByRole('group', { name: 'Edit priority', exact: true }); await expect(popup.getByRole('option', { name: pb.name, exact: true })).toBeVisible();
      releaseChoices.resolve(); releaseIssue.resolve(); await expect.poll(() => choicesReturned && issueReturned).toBe(true); await expect(page).toHaveURL(new RegExp(`/issues/${destination.summary.id}$`)); await expect(page.getByRole('heading', { name: destination.summary.title, exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: source.summary.title, exact: true })).toHaveCount(0); await expect(page.getByRole('dialog', { name: 'Edit ' + source.summary.key, exact: true })).toHaveCount(0); await expect(popup.getByRole('option', { name: pa.name, exact: true })).toHaveCount(0); await expect(popup.getByRole('option', { name: pb.name, exact: true })).toBeVisible();
    });
  } finally { releaseChoices.resolve(); releaseIssue.resolve(); }
});

test('native blocker lookup stays closed after cancellation and related-link conflicts require deliberate current-issue review', async ({ request, page }) => {
  const projectId = await coverageProject(request), issue = await coverageIssue(request, projectId, { title: 'Native relationship review' }), target = await coverageIssue(request, projectId, { title: 'Native relationship candidate' });
  await signIn(page, 'member', `/issues/${issue.summary.id}`, /^Native relationship review$/);
  const dependencies = page.getByRole('region', { name: 'Dependencies', exact: true }), held = deferred(), release = deferred(); let returned = false;
  await page.route('**/api/v2/issues/search', async route => { const body = zModernSearchInput.parse(route.request().postDataJSON()); if (body.filters.query !== target.summary.key) return route.continue(); const response = await route.fetch(); expect(response.status()).toBe(200); held.resolve(); await release.promise; await route.fulfill({ response }); returned = true; });
  try {
    await webCase('UC-REL-0060', async () => {
      await dependencies.getByRole('button', { name: 'Add blocker', exact: true }).click(); const query = dependencies.getByRole('combobox', { name: 'Find a same-project issue', exact: true }); await query.fill(target.summary.key); await held.promise; await dependencies.getByRole('button', { name: 'Cancel adding blocker', exact: true }).click(); await expect(query).toHaveCount(0); release.resolve(); await expect.poll(() => returned).toBe(true); await expect(query).toHaveCount(0); await expect(dependencies.getByRole('button', { name: 'Add blocker', exact: true })).toBeVisible(); await expect(dependencies.getByRole('listbox', { name: 'Blocker candidates', exact: true })).toHaveCount(0); expect((await coverageReadIssue(request, issue.summary.id)).summary.unfinishedBlockerCount).toBe(0);
    });
  } finally { release.resolve(); }
  await page.unroute('**/api/v2/issues/search');
  const actions = page.getByRole('region', { name: 'Issue actions', exact: true }), related = actions.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Related issues (' }) }); await related.locator('summary').click(); await related.getByRole('searchbox', { name: 'Related issue search', exact: true }).fill(target.summary.key); await expect(related.locator('.related-results li')).toHaveCount(1);
  await coverageWrite(request, 'PUT', `/api/v2/issues/${issue.summary.id}`, { expectedRevision: issue.summary.revision, editable: { ...modernEditable(issue), title: 'Native concurrent relationship title' } }, zSavedModernIssueView, 200, 'owner');
  await webCase('UC-REL-0075', async () => {
    await related.locator('.related-results li').getByRole('button', { name: 'Link issue', exact: true }).click(); const review = actions.getByRole('button', { name: 'Review latest issue details', exact: true }); await expect(review).toBeVisible(); await expect(page.getByRole('heading', { name: issue.summary.title, exact: true })).toBeVisible(); expect((await coverageReadIssue(request, issue.summary.id)).links).toEqual([]);
    await page.route(url => url.pathname === `/api/v2/issues/${issue.summary.id}`, route => route.abort('failed'), { times: 1 });
    await review.click();
    await expect(actions.getByRole('alert').filter({ hasText: 'Check your connection and try again.' })).toBeVisible();
    await expect(review).toBeEnabled(); await expect(page.getByRole('heading', { name: issue.summary.title, exact: true })).toBeVisible();
    await expect(related.locator('.related-results li')).toContainText(target.summary.key);
    await review.click(); await expect(page.getByRole('heading', { name: 'Native concurrent relationship title', exact: true })).toBeVisible(); await related.locator('.related-results li').getByRole('button', { name: 'Link issue', exact: true }).click(); await expect(related.locator('.related-links')).toContainText(target.summary.key); expect((await coverageReadIssue(request, issue.summary.id)).links.some(value => value.kind === 'relates_to' && new Set([value.issueId, value.targetId]).size === 2 && [value.issueId, value.targetId].includes(issue.summary.id) && [value.issueId, value.targetId].includes(target.summary.id))).toBe(true);
  });
});


test('native project paging contains the retained current project exactly once when its real cursor page arrives', async ({ request, page }) => {
  const selected = await coverageProject(request), preceding = await coverageProject(request), suffix = crypto.randomUUID().slice(0, 8);
  for (const [id, name] of [[preceding, '! 000 native predecessor ' + suffix], [selected, '! 001 native retained ' + suffix]] as const) {
    const current = await coverageGet(request, `/api/v1/projects/${id}`, zProjectView);
    await coverageWrite(request, 'PUT', `/api/v1/projects/${id}`, { expectedRevision: current.revision, name, description: current.description }, zSavedProjectView);
  }
  let nextPageReturned = false;
  await page.route(url => url.pathname === '/api/v1/projects' && url.searchParams.get('includeArchived') === 'true', async route => {
    const url = new URL(route.request().url()); url.searchParams.set('limit', '1');
    const response = await route.fetch({ url: url.toString() }); expect(response.status()).toBe(200);
    await route.fulfill({ response }); if (url.searchParams.has('cursor')) nextPageReturned = true;
  });
  await signIn(page, 'member', `/issues?projectId=${selected}`, /^Issues$/);
  const picker = page.getByRole('combobox', { name: 'Project', exact: true });
  await expect(picker.locator(`option[value="${preceding}"]`)).toHaveCount(1);
  await expect(picker.locator(`option[value="${selected}"]`)).toHaveCount(1);
  await expect(picker).toHaveValue(selected);
  await page.getByRole('main').getByRole('button', { name: 'More projects', exact: true }).click();
  await expect.poll(() => nextPageReturned).toBe(true);
  await expect(picker.locator(`option[value="${selected}"]`)).toHaveCount(1);
  await expect(picker.locator(`option[value="${preceding}"]`)).toHaveCount(1);
  await expect(picker).toHaveValue(selected);
  const values = await picker.locator('option').evaluateAll(options => options.map(option => option.getAttribute('value')).filter(value => value));
  expect(new Set(values).size).toBe(values.length);
});
