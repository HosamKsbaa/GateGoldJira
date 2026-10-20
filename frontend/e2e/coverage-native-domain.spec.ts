import { expect, type APIRequestContext } from '@playwright/test';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { coverageCreate, coverageProject, coverageHeaders, coverageComment, coverageDefinition, coverageRead } from './support/coverage-issues';
import { zSavedCommentView, zSavedAssetView, zPageAssetView, zAssetChunk, zSavedModernIssueView, zSavedLabelView, zPageLabelView, zPageCommentView, zConfigurationView, zSavedFieldOptionSaved, zPageMembershipView, zSavedUserView, zCustomFieldsView } from '../src/app/api/generated/zod.gen';
import type { CommentView } from '../src/app/api/generated/types.gen';
import {
  zSavedWorkflowSaved, zSavedStageSaved, zSavedTransitionSaved,
  zPageBoardSummary, zLayoutView, zSavedLayoutView, zSavedConfigurationView,
  zPageIssueTransitionOption, zSavedTransitionPolicyView,
  zApprovalContextView, zSavedApprovalContextView,
} from '../src/app/api/generated/zod.gen';
import { layoutFields } from './support/native-boards';

test.skip(!localFixturesAvailable, 'Requires the isolated real Go/PostgreSQL company.');
test.use({ trace: 'off' });
test.setTimeout(120_000);
const webCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
async function editComment(request: APIRequestContext, comment: CommentView, html: string) {
  const response = await request.put(`${apiOrigin}/api/v1/comments/${comment.id}`, { headers: await coverageHeaders(), data: { expectedRevision: comment.revision, body: { html, mentionUserIds: [], pictureIds: [] } } });
  expect(response.status()).toBe(200); return zSavedCommentView.parse(await response.json()).result;
}
async function discussion(request: APIRequestContext, issueId: string) {
  const response = await request.get(`${apiOrigin}/api/v1/issues/${issueId}/comments`, { headers: await coverageHeaders() }); expect(response.status()).toBe(200); return zPageCommentView.parse(await response.json());
}

test('native own-comment save shows its retained revision and concurrent review keeps the unsent draft', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId);
  let comment = await coverageComment(request, issue.summary.id, '<p>Original native discussion</p>');
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const thread = page.locator('gg-comment-thread'), record = thread.locator('#comment-' + comment.id);
  await webCase('UC-COM-0082', async () => { await record.getByRole('button', { name: 'Edit comment', exact: true }).click(); const editor = record.locator('gg-comment-editor'), input = editor.getByRole('textbox', { name: 'Comment text', exact: true }); await expect(input).toHaveText('Original native discussion'); await expect(input).toBeFocused(); await input.fill('Saved native revision'); await expect(input).toHaveText('Saved native revision'); await editor.getByRole('button', { name: 'Save comment changes', exact: true }).click(); await expect(thread.locator('#comment-' + comment.id)).toContainText('Saved native revision'); await expect(thread.locator('#comment-' + comment.id)).toContainText('Edited · version 2'); comment = (await discussion(request, issue.summary.id)).items[0]!; expect(comment.revision).toBe('2'); });
  const currentRecord = thread.locator('#comment-' + comment.id);
  await currentRecord.getByRole('button', { name: 'Edit comment', exact: true }).click();
  const editor = currentRecord.locator('gg-comment-editor'), input = editor.getByRole('textbox', { name: 'Comment text', exact: true });
  // Inline Tiptap initialization schedules focus on the next frame. Confirm
  // its retained revision and completed focus before replacing its selection.
  await expect(input).toHaveText('Saved native revision'); await expect(input).toBeFocused();
  await input.fill('My private unsent revision'); await expect(input).toHaveText('My private unsent revision');
  comment = await editComment(request, comment, '<p>Concurrent accepted revision</p>');
  await webCase('UC-COM-0088', async () => { await editor.getByRole('button', { name: 'Save comment changes', exact: true }).click(); await expect(thread).toContainText('The comment has a newer version. Your unsent text remains in the editor.'); await expect(input).toHaveText('My private unsent revision'); await expect(thread.getByRole('button', { name: 'Use current revision and keep my draft', exact: true })).toBeVisible(); expect((await discussion(request, issue.summary.id)).items[0]?.safeHtml).toBe(comment.safeHtml); });
});

test('native comment version paging replaces the displayed oldest-first page', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId);
  let comment = await coverageComment(request, issue.summary.id, '<p>Retained native revision 01</p>');
  for (let index = 2; index <= 26; index++) comment = await editComment(request, comment, `<p>Retained native revision ${String(index).padStart(2, '0')}</p>`);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const history = page.getByRole('region', { name: 'Comment version history', exact: true });
  await webCase('UC-COM-0085', async () => { await page.locator('#comment-' + comment.id).getByRole('button', { name: 'Comment history', exact: true }).click(); await expect(history.getByRole('heading', { name: 'Version 1', exact: true })).toBeVisible(); await expect(history.locator('article')).toHaveCount(25); await expect(history).toContainText('Retained native revision 01'); });
  await webCase('UC-COM-0086', async () => { await expect(history.getByRole('heading', { name: 'Version 1', exact: true })).toBeVisible(); await expect(history.locator('article')).toHaveCount(25); await history.getByRole('button', { name: 'Next versions page', exact: true }).click(); await expect(history.locator('article')).toHaveCount(1); await expect(history.getByRole('heading', { name: 'Version 26', exact: true })).toBeVisible(); await expect(history).toContainText('Retained native revision 26'); await expect(history.getByRole('heading', { name: 'Version 1', exact: true })).toHaveCount(0); await expect(history.getByRole('button', { name: 'Next versions page', exact: true })).toHaveCount(0); });
});

for (const mode of ['empty', 'visible_limit', 'html_limit'] as const) test('native comment ' + mode + ' validation keeps the exact unsent content', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const editor = page.locator('gg-comment-editor'), visual = editor.getByRole('textbox', { name: 'Comment text', exact: true });
  let submissions = 0; page.on('request', value => { if (value.method() === 'POST' && value.url().endsWith('/comments')) submissions++; });
  if (mode === 'html_limit') {
    await editor.getByRole('button', { name: 'HTML source', exact: true }).click(); const original = '<p title="' + 'x'.repeat(65537) + '">Retain this source</p>'; await editor.getByLabel('Comment HTML', { exact: true }).fill(original);
    await webCase('UC-COM-0099', async () => { await editor.getByRole('button', { name: 'Post comment', exact: true }).click(); await expect(editor.getByRole('alert')).toContainText(/64|HTML|large/i); await expect(editor.getByLabel('Comment HTML', { exact: true })).toHaveValue(original); expect(submissions).toBe(0); expect((await discussion(request, issue.summary.id)).totalMatching).toBe(0); });
  } else {
    await visual.fill(mode === 'empty' ? '   ' : 'ع'.repeat(5001)); const original = await visual.textContent();
    await webCase(mode === 'empty' ? 'UC-COM-0097' : 'UC-COM-0098', async () => { await editor.getByRole('button', { name: 'Post comment', exact: true }).click(); await expect((mode === 'empty' ? page.locator('gg-comment-thread') : editor).getByRole('alert')).toContainText(mode === 'empty' ? /comment|content|text/i : /5,?000|limit/i); expect(await visual.textContent()).toBe(original); expect(submissions).toBe(mode === 'empty' ? 1 : 0); expect((await discussion(request, issue.summary.id)).totalMatching).toBe(0); });
  }
});

for (const reference of ['person', 'picture', 'file'] as const) test('native source cannot forge an unselected ' + reference + ' reference', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const editor = page.locator('gg-comment-editor'); await editor.getByRole('button', { name: 'HTML source', exact: true }).click();
  const id = crypto.randomUUID(), html = reference === 'person' ? `<p>Forged <span data-user-id="${id}">Person</span></p>` : reference === 'picture' ? `<p>Forged <img data-picture-id="${id}" alt="Picture"></p>` : `<p>Forged <a data-attachment-id="${id}">File</a></p>`;
  await editor.getByLabel('Comment HTML', { exact: true }).fill(html);
  await webCase('UC-COM-0103', async () => { await editor.getByRole('button', { name: 'Post comment', exact: true }).click(); await expect(editor.getByRole('alert')).toBeVisible(); await expect(editor.getByLabel('Comment HTML', { exact: true })).toHaveValue(html); expect((await discussion(request, issue.summary.id)).totalMatching).toBe(0); });
});

test('native newly ineligible mention rejection retains the selected mention and discussion draft', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId), viewerId = '10000000-0000-4000-8000-000000000003';
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const editor = page.locator('gg-comment-editor');
  await editor.getByRole('button', { name: 'Mention a teammate', exact: true }).click();
  const picker = editor.locator('gg-mention-picker'); await picker.getByRole('option', { name: 'Local Viewer', exact: true }).click();
  const visual = editor.getByRole('textbox', { name: 'Comment text', exact: true }); await visual.press('End'); await visual.press('Space'); await page.keyboard.type('Please review the private draft');
  const members = await request.get(`${apiOrigin}/api/v1/projects/${projectId}/memberships`, { headers: await coverageHeaders('owner') }); expect(members.status()).toBe(200); const membership = zPageMembershipView.parse(await members.json()).items.find(value => value.user.id === viewerId)!;
  const removed = await request.post(`${apiOrigin}/api/v1/projects/${projectId}/memberships/${viewerId}/remove`, { headers: await coverageHeaders('owner'), data: { expectedRevision: membership.revision } }); expect(removed.status()).toBe(200);
  await webCase('UC-COM-0114', async () => { const rejected = page.waitForResponse(value => value.request().method() === 'POST' && value.url().endsWith('/comments')); await editor.getByRole('button', { name: 'Post comment', exact: true }).click(); expect((await rejected).status()).toBe(422); await expect(page.locator('gg-comment-thread').getByRole('alert')).toBeVisible(); await expect(visual).toContainText('Please review the private draft'); await expect(visual.locator('span[data-user-id="' + viewerId + '"]')).toContainText('Local Viewer'); expect((await discussion(request, issue.summary.id)).totalMatching).toBe(0); });
});

test('native malformed decimal validation leaves its editable draft intact without a transport write', async ({ page, request }) => {
  const projectId = await coverageProject(request), definition = await coverageDefinition(request, projectId, { kind: 'number', name: 'Exact native amount' }), issue = await coverageCreate(request, projectId, { fieldValues: [{ fieldId: definition.id, value: { kind: 'number', number: '12.5' } }] });
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const custom = page.locator('gg-custom-fields'), input = custom.getByLabel(definition.name, { exact: true });
  let writes = 0;
  page.on('request', value => { if (value.method() === 'PUT' && value.url().endsWith('/custom-fields')) writes++; });
  await input.fill('--1');
  await webCase('UC-FLD-0028', async () => { await custom.getByRole('button', { name: 'Save fields', exact: true }).click(); await expect(custom.getByRole('alert')).toContainText(/number|decimal|valid/i); await expect(input).toBeEnabled(); await expect(input).toHaveValue('--1'); await expect(custom.getByRole('button', { name: 'Retry original save', exact: true })).toHaveCount(0); expect(writes).toBe(0); const response = await request.get(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, { headers: await coverageHeaders() }); expect(response.status()).toBe(200); expect(zCustomFieldsView.parse(await response.json()).values).toEqual([{ fieldId: definition.id, value: { kind: 'number', number: '12.5' } }]); });
});

test('native loaded choice filtering includes appended option pages and retained retired selections stay explained', async ({ page, request }) => {
  const projectId = await coverageProject(request), choice = await coverageDefinition(request, projectId, { kind: 'choice', name: 'Outcome' });
  const root = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/configuration`, { headers: await coverageHeaders('owner') }); expect(root.status()).toBe(200); let configuration = zConfigurationView.parse(await root.json());
  const saveOption = async (optionId: string, name: string, position: string, retired = false) => { const response = await request.put(`${apiOrigin}/api/v2/projects/${projectId}/fields/${choice.id}/options/${optionId}`, { headers: await coverageHeaders('owner'), data: { expectedRevision: configuration.revision, name, position, retired } }); expect([200, 201]).toContain(response.status()); const saved = zSavedFieldOptionSaved.parse(await response.json()).result; configuration = saved.configuration; return saved.option; };
  for (let index = 0; index <= 100; index++) await saveOption(crypto.randomUUID(), 'Option ' + String(index).padStart(3, '0'), String(index + 1));
  const retained = await saveOption(crypto.randomUUID(), 'Retained historical outcome', '999');
  const issue = await coverageCreate(request, projectId, { fieldValues: [{ fieldId: choice.id, value: { kind: 'choice', optionId: retained.id } }] });
  await saveOption(retained.id, retained.name, retained.position, true);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const field = page.locator('gg-field-value-editor').filter({ has: page.getByRole('combobox', { name: choice.name, exact: true }) }), input = field.getByRole('combobox', { name: choice.name, exact: true });
  await webCase('UC-FLD-0036', async () => { await expect(field.getByRole('button', { name: 'Remove ' + retained.name, exact: true })).toBeVisible(); await expect(field).toContainText('Retired'); await expect(field).not.toContainText(retained.id); });
  await input.fill('Option 009');
  await webCase('UC-FLD-0034', async () => { await expect(field.getByRole('option')).toHaveCount(1); await expect(field.getByRole('option', { name: 'Option 009', exact: true })).toBeVisible(); await expect(field.getByRole('option', { name: 'Option 100', exact: true })).toHaveCount(0); });
  await input.fill('');
  await webCase('UC-FLD-0035', async () => { await expect(field.getByRole('option')).toHaveCount(100); await field.getByRole('button', { name: 'Load more outcome choices', exact: true }).click(); await expect(field.getByRole('option')).toHaveCount(101); await input.fill('Option 100'); await expect(field.getByRole('option')).toHaveCount(1); await expect(field.getByRole('option', { name: 'Option 100', exact: true })).toBeVisible(); await input.fill('Option 009'); await expect(field.getByRole('option', { name: 'Option 009', exact: true })).toBeVisible(); });
});

test('native person lookup filters live and appends further scoped people without dropping the first page', async ({ page, request }) => {
  const projectId = await coverageProject(request), definition = await coverageDefinition(request, projectId, { kind: 'user', name: 'Delivery reviewer' }), issue = await coverageCreate(request, projectId), prefix = 'Native reviewer ' + crypto.randomUUID().slice(0, 8);
  for (let index = 0; index < 26; index++) { const response = await request.post(`${apiOrigin}/api/v1/admin/users`, { headers: await coverageHeaders('owner'), data: { email: crypto.randomUUID() + '@example.test', displayName: prefix + ' ' + String(index).padStart(2, '0'), administrator: false } }); expect(response.status()).toBe(201); const person = zSavedUserView.parse(await response.json()).result; const membership = await request.put(`${apiOrigin}/api/v1/projects/${projectId}/memberships/${person.id}`, { headers: await coverageHeaders('owner'), data: { expectedRevision: '0', role: 'viewer' } }); expect(membership.status()).toBe(200); }
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const field = page.locator('gg-field-value-editor').filter({ has: page.getByRole('combobox', { name: definition.name, exact: true }) }), input = field.getByRole('combobox', { name: definition.name, exact: true });
  await webCase('UC-FLD-0039', async () => { await input.fill(prefix + ' 01'); await expect(field.getByRole('option')).toHaveCount(1); await expect(field.getByRole('option', { name: prefix + ' 01', exact: true })).toBeVisible(); await input.fill(prefix + ' 02'); await expect(field.getByRole('option')).toHaveCount(1); await expect(field.getByRole('option', { name: prefix + ' 02', exact: true })).toBeVisible(); await expect(field.getByRole('option', { name: prefix + ' 01', exact: true })).toHaveCount(0); });
  await input.fill(prefix);
  await webCase('UC-FLD-0040', async () => { await expect(field.getByRole('option')).toHaveCount(25); await expect(field.getByRole('option', { name: prefix + ' 25', exact: true })).toHaveCount(0); await field.getByRole('button', { name: 'Load more delivery reviewer choices', exact: true }).click(); await expect(field.getByRole('option')).toHaveCount(26); await expect(field.getByRole('option', { name: prefix + ' 00', exact: true })).toBeVisible(); await expect(field.getByRole('option', { name: prefix + ' 25', exact: true })).toBeVisible(); });
});

test('native retired and viewer custom fields display authorized values without an editor write path', async ({ page, request }) => {
  const projectId = await coverageProject(request), retired = await coverageDefinition(request, projectId, { kind: 'text', name: 'Retired acceptance' }), active = await coverageDefinition(request, projectId, { kind: 'text', name: 'Read-only evidence' }), issue = await coverageCreate(request, projectId, { fieldValues: [{ fieldId: retired.id, value: { kind: 'text', text: 'Retained Arabic دليل' } }, { fieldId: active.id, value: { kind: 'text', text: 'Visible viewer value' } }] });
  await coverageDefinition(request, projectId, { ...retired, retired: true });
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$')); const custom = page.locator('gg-custom-fields');
  await webCase('UC-FLD-0048', async () => { await expect(custom).toContainText('Retired acceptance · Retired: Retained Arabic دليل'); await expect(custom.getByLabel(retired.name, { exact: true })).toHaveCount(0); });
  await signIn(page, 'viewer', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  await webCase('UC-FLD-0065', async () => { await expect(custom.getByLabel(active.name, { exact: true })).toHaveValue('Visible viewer value'); await expect(custom.getByLabel(active.name, { exact: true })).toBeDisabled(); await expect(custom.getByRole('button', { name: 'Save fields', exact: true })).toHaveCount(0); const denied = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, { headers: await coverageHeaders('viewer'), data: { expectedRevision: issue.summary.revision, values: [{ fieldId: active.id, value: { kind: 'text', text: 'Forbidden viewer edit' } }] } }); expect(denied.status()).toBe(403); const current = await request.get(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, { headers: await coverageHeaders('viewer') }); expect(current.status()).toBe(200); expect(zCustomFieldsView.parse(await current.json()).values).toContainEqual({ fieldId: active.id, value: { kind: 'text', text: 'Visible viewer value' } }); });
});

async function save<S extends z.ZodType>(request: APIRequestContext, path: string, body: object, schema: S, method = 'PUT', role = 'owner'): Promise<z.output<S>> {
  const response = await request.fetch(apiOrigin + path, { method, headers: await coverageHeaders(role), data: body }); expect([200, 201]).toContain(response.status()); return schema.parse(await response.json());
}
async function configuredWorkflowPages(request: APIRequestContext) {
  const projectId = await coverageProject(request), workflowId = crypto.randomUUID();
  const root = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/configuration`, { headers: await coverageHeaders('owner') }); expect(root.status()).toBe(200); let configuration = zConfigurationView.parse(await root.json());
  configuration = (await save(request, `/api/v2/projects/${projectId}/workflows/${workflowId}`, { expectedRevision: configuration.revision, name: 'Large review vocabulary', retired: false }, zSavedWorkflowSaved)).result.configuration;
  const identity = (number: number) => number.toString(16).padStart(8, '0') + '-' + projectId.slice(9);
  const stages: { id: string; category: 'todo' | 'review' | 'done'; name: string }[] = [];
  for (let index = 1; index <= 27; index++) { const category = index === 1 ? 'todo' : index === 27 ? 'done' : 'review', name = category === 'todo' ? 'Cursor start' : category === 'done' ? 'Cursor complete' : 'Cursor review ' + String(index - 1).padStart(3, '0'); const saved = await save(request, `/api/v2/projects/${projectId}/workflows/${workflowId}/stages/${identity(index)}`, { expectedRevision: configuration.revision, name, category, position: String(index), initial: index === 1, acceptsEntries: true, retired: false }, zSavedStageSaved); configuration = saved.result.configuration; stages.push({ id: saved.result.stage.id, category, name }); }
  const edge = async (counter: number, fromStageId: string, toStageId: string) => { const saved = await save(request, `/api/v2/projects/${projectId}/workflows/${workflowId}/transitions/${identity(counter)}`, { expectedRevision: configuration.revision, fromStageId, toStageId, requiredPermission: null, retired: false }, zSavedTransitionSaved); configuration = saved.result.configuration; return saved.result.transition; };
  let lateEdge = '';
  for (let index = 0; index < 25; index++) { const saved = await edge(1000 + index, stages[0]!.id, stages[index + 1]!.id); lateEdge = saved.id; }
  await edge(1200, stages[0]!.id, stages[26]!.id);
  for (let index = 0; index < 25; index++) await edge(1300 + index, stages[index + 1]!.id, stages[26]!.id);
  const boards = await request.get(`${apiOrigin}/api/v1/projects/${projectId}/boards`, { headers: await coverageHeaders() }); expect(boards.status()).toBe(200); const boardId = zPageBoardSummary.parse(await boards.json()).items[0]!.id;
  const layoutResponse = await request.get(`${apiOrigin}/api/v2/boards/${boardId}`, { headers: await coverageHeaders() }); expect(layoutResponse.status()).toBe(200); const layout = zLayoutView.parse(await layoutResponse.json()), draft = layoutFields(layout);
  for (const stage of stages) { const column = layout.columns.find(value => value.stages.some(mapping => mapping.stage.category === stage.category))!; draft.columns.find(value => value.id === column.id)!.stageIds.push(stage.id); }
  await save(request, `/api/v2/boards/${boardId}/layout`, draft, zSavedLayoutView);
  const cfg = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/configuration`, { headers: await coverageHeaders('owner') }); expect(cfg.status()).toBe(200); configuration = zConfigurationView.parse(await cfg.json());
  await save(request, `/api/v2/projects/${projectId}/issue-types/${configuration.defaults.standardTypeId}/workflows/${workflowId}`, { expectedRevision: configuration.revision, default: false, acceptsNew: true }, zSavedConfigurationView);
  return { projectId, issue: await coverageCreate(request, projectId, { workflowId }), lateEdge, lateStage: stages[25]! };
}

test('native review move and stage-name pages append without forgetting previously resolved names', async ({ page, request }, testInfo) => {
  testInfo.setTimeout(240_000);
  const f = await configuredWorkflowPages(request);
  await signIn(page, 'member', '/issues/' + f.issue.summary.id, new RegExp('^' + f.issue.summary.title + '$'));
  const review = page.locator('gg-issue-review'), select = review.getByRole('combobox', { name: 'Move to review', exact: true }), late = select.locator('option[value="' + f.lateEdge + '"]');
  await webCase('UC-APR-0004', async () => { await expect(select.locator('option')).toHaveCount(26); await expect(late).toContainText('Stage ' + f.lateStage.id.slice(0, 8)); await review.getByRole('button', { name: 'More stage names', exact: true }).click(); await expect(late).toHaveText('Cursor start → ' + f.lateStage.name); await expect(review.getByRole('button', { name: 'More stage names', exact: true })).toHaveCount(0); });
  await webCase('UC-APR-0003', async () => { await review.getByRole('button', { name: 'More moves', exact: true }).click(); await expect(select.locator('option')).toHaveCount(51); await expect(late).toHaveText('Cursor start → ' + f.lateStage.name); await expect(review.getByRole('button', { name: 'More stage names', exact: true })).toHaveCount(0); await review.getByRole('button', { name: 'More moves', exact: true }).click(); await expect(select.locator('option')).toHaveCount(52); await expect(review.getByRole('button', { name: 'More moves', exact: true })).toHaveCount(0); await expect(late).toHaveText('Cursor start → ' + f.lateStage.name); });
});

async function reviewFixture(request: APIRequestContext) {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId);
  const targets = await request.get(`${apiOrigin}/api/v2/issues/${issue.summary.id}/transitions`, { headers: await coverageHeaders() }); expect(targets.status()).toBe(200); const edge = zPageIssueTransitionOption.parse(await targets.json()).items.find(value => value.stage.category === 'review')!;
  const root = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/configuration`, { headers: await coverageHeaders('owner') }); expect(root.status()).toBe(200); const configuration = zConfigurationView.parse(await root.json());
  await save(request, `/api/v2/projects/${projectId}/workflows/${issue.summary.workflow.id}/transitions/${edge.transitionId}/policy`, { expectedRevision: configuration.revision, policy: { requiredSystemFields: [], requiredFieldIds: [], approvalsRequired: 1, approverRole: 'member', excludeIssueReporter: false } }, zSavedTransitionPolicyView);
  const path = `/api/v2/issues/${issue.summary.id}/transitions/${edge.transitionId}`;
  const context = async () => { const response = await request.get(apiOrigin + path + '/approvals', { headers: await coverageHeaders() }); expect(response.status()).toBe(200); return zApprovalContextView.parse(await response.json()); };
  const revisionFields = async () => { const current = await context(); return { expectedRevision: current.issueRevision, expectedWorkflowRevision: current.workflowRevision, expectedConfigurationRevision: current.configurationRevision }; };
  const vote = async () => save(request, path + '/approvals', { ...await revisionFields(), decision: 'approve' }, zSavedApprovalContextView, 'POST', 'member');
  const resubmit = async () => save(request, path + '/resubmit', await revisionFields(), zSavedApprovalContextView, 'POST', 'member');
  return { projectId, issue, edge, context, vote, resubmit };
}

test('native review history marks current decisions and appends earlier revision contexts', async ({ page, request }) => {
  const f = await reviewFixture(request); await f.vote();
  for (let index = 1; index < 26; index++) { await f.resubmit(); await f.vote(); }
  await signIn(page, 'member', '/issues/' + f.issue.summary.id, new RegExp('^' + f.issue.summary.title + '$'));
  const review = page.locator('gg-issue-review'); await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(f.edge.transitionId);
  await webCase('UC-APR-0048', async () => { await expect(review.locator('.review-votes li')).toHaveCount(25); await expect(review.locator('.review-votes li small').filter({ hasText: 'Current' })).toHaveCount(1); await expect(review.locator('.review-votes li small').filter({ hasText: 'Previous review' })).toHaveCount(24); });
  await webCase('UC-APR-0049', async () => { await review.getByRole('button', { name: 'Earlier decisions', exact: true }).click(); await expect(review.locator('.review-votes li')).toHaveCount(26); await expect(review.locator('.review-votes li').first()).toContainText(/Issue revision\s+26\b/); await expect(review.locator('.review-votes li').last()).toContainText(/Issue revision\s+1\b/); await expect(review.getByRole('button', { name: 'Earlier decisions', exact: true })).toHaveCount(0); });
  await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(''); await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(f.edge.transitionId); await expect(review.locator('.review-votes li')).toHaveCount(25);
  await coverageDefinition(request, f.projectId, { kind: 'text', name: 'Review cursor scope changed' });
  await webCase('UC-APR-0050', async () => { const pending = page.waitForResponse(value => value.request().method() === 'GET' && value.url().includes('/transitions/' + f.edge.transitionId + '/approvals') && new URL(value.url()).searchParams.has('cursor')); await review.getByRole('button', { name: 'Earlier decisions', exact: true }).click(); expect((await pending).status()).toBe(422); await expect(review.getByRole('alert')).toBeVisible(); await expect(review.locator('.review-votes li')).toHaveCount(25); await expect(review.locator('.review-votes li').first()).toContainText(/Issue revision\s+26\b/); });
});

test('native late review context cannot replace the next issue after a same-component route change', async ({ page, request }) => {
  const f = await reviewFixture(request), child = await coverageCreate(request, f.projectId, { title: 'Fresh child review context', parentId: f.issue.summary.id, expectedParentRevision: f.issue.summary.revision }); await f.vote();
  await signIn(page, 'member', '/issues/' + f.issue.summary.id, new RegExp('^' + f.issue.summary.title + '$'));
  const review = page.locator('gg-issue-review'), childLink = page.getByRole('link', { name: child.summary.key + ' · ' + child.summary.title, exact: true }); await expect(childLink).toBeVisible();
  let release!: () => void, completed!: () => void, arrived = false; const held = new Promise<void>(resolve => release = resolve), delivered = new Promise<void>(resolve => completed = resolve);
  await page.route(`**/api/v2/issues/${f.issue.summary.id}/transitions/*/approvals**`, async route => { const response = await route.fetch(); arrived = true; await held; await route.fulfill({ response }).catch(() => {}); completed(); });
  await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(f.edge.transitionId); await expect.poll(() => arrived).toBe(true);
  const marker = crypto.randomUUID(); await page.locator('html').evaluate((node, value) => node.setAttribute('data-review-route-fixture', value), marker);
  await webCase('UC-APR-0053', async () => { await childLink.click(); await expect(page.getByRole('heading', { name: child.summary.title, exact: true })).toBeVisible(); release(); await delivered; await expect(page.locator('html')).toHaveAttribute('data-review-route-fixture', marker); await expect(review.getByRole('combobox', { name: 'Move to review', exact: true })).toHaveValue(''); await expect(review.locator('.review-votes li')).toHaveCount(0); await expect(review).not.toContainText('Review requirements satisfied'); });
});

async function createLabel(request: APIRequestContext, projectId: string, name: string) {
  const response = await request.post(`${apiOrigin}/api/v1/projects/${projectId}/labels`, { headers: await coverageHeaders(), data: { name } });
  expect(response.status()).toBe(201); return zSavedLabelView.parse(await response.json()).result;
}

test('native label creation saves reusable Unicode names but keeps issue selection in the local edit draft until Save', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId), english = 'Native label ' + crypto.randomUUID().slice(0, 8), arabic = 'مراجعة UI ' + crypto.randomUUID().slice(0, 8);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
  const dialog = page.getByRole('dialog'), fields = dialog.locator('gg-date-label-fields'), input = fields.getByLabel('New label name', { exact: true });
  await webCase('UC-LBL-0001', async () => { await input.fill(english); await fields.getByRole('button', { name: 'Create and select label', exact: true }).click(); await expect(fields.getByRole('button', { name: 'Remove ' + english, exact: true })).toBeVisible(); await expect(fields).toContainText('1 / 10 labels selected'); await expect(input).toHaveValue(''); const response = await request.get(`${apiOrigin}/api/v1/projects/${projectId}/labels?query=${encodeURIComponent(english)}`, { headers: await coverageHeaders() }); expect(response.status()).toBe(200); expect(zPageLabelView.parse(await response.json()).items.map(value => value.name)).toEqual([english]); expect((await coverageRead(request, issue.summary.id)).summary.labels).toEqual([]); });
  await webCase('UC-LBL-0002', async () => { await expect(input).toHaveAttribute('dir', 'auto'); await input.fill(arabic); await fields.getByRole('button', { name: 'Create and select label', exact: true }).click(); const selected = fields.getByRole('button', { name: 'Remove ' + arabic, exact: true }); await expect(selected).toBeVisible(); await expect(selected.locator('bdi')).toHaveText(arabic); await dialog.getByRole('button', { name: 'Save issue', exact: true }).click(); await expect(dialog).toHaveCount(0); expect((await coverageRead(request, issue.summary.id)).summary.labels.map(value => value.name).sort()).toEqual([english, arabic].sort()); await expect(page.locator('.label-values')).toContainText(arabic); });
});

test('native label selections outside a loaded search page remain visible and removable', async ({ page, request }) => {
  const projectId = await coverageProject(request), prefix = 'Retained ' + crypto.randomUUID().slice(0, 8), labels = [];
  for (let index = 0; index < 26; index++) labels.push(await createLabel(request, projectId, prefix + ' ' + String(index).padStart(2, '0')));
  const retained = labels[25]!, issue = await coverageCreate(request, projectId, { labelIds: [retained.id] });
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$')); await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
  const dialog = page.getByRole('dialog'), fields = dialog.locator('gg-date-label-fields');
  // A disjoint live lookup has no retained selection in its server result, while
  // the selected chip must survive independently of this loaded result set.
  const lookup = page.waitForResponse(value => { const url = new URL(value.url()); return url.pathname.endsWith('/projects/' + projectId + '/labels') && url.searchParams.get('query') === prefix + ' 00'; });
  await fields.getByRole('combobox', { name: 'Labels', exact: true }).fill(prefix + ' 00'); const response = await lookup; expect(response.status()).toBe(200); expect(zPageLabelView.parse(await response.json()).items.map(value => value.name)).toEqual([prefix + ' 00']); await expect(fields.getByRole('option', { name: prefix + ' 00', exact: true })).toBeVisible();
  await fields.getByRole('button', { name: 'Done choosing', exact: true }).click();
  await webCase('UC-LBL-0014', async () => { const chip = fields.getByRole('button', { name: 'Remove ' + retained.name, exact: true }); await expect(chip).toBeVisible(); await chip.click(); await expect(chip).toHaveCount(0); await expect(fields).toContainText('0 / 10 labels selected'); await dialog.getByRole('button', { name: 'Save issue', exact: true }).click(); await expect(dialog).toHaveCount(0); expect((await coverageRead(request, issue.summary.id)).summary.labels).toEqual([]); });
});

test('native label filters require every selected label and discard former project selections and choices', async ({ page, request }) => {
  const projectId = await coverageProject(request), otherProjectId = await coverageProject(request), a = await createLabel(request, projectId, 'Alpha native filter'), b = await createLabel(request, projectId, 'Beta native filter'), other = await createLabel(request, otherProjectId, 'Gamma other project');
  const both = await coverageCreate(request, projectId, { labelIds: [a.id, b.id] }); await coverageCreate(request, projectId, { labelIds: [a.id] }); await coverageCreate(request, projectId, { labelIds: [b.id] }); const otherIssue = await coverageCreate(request, otherProjectId, { labelIds: [other.id] });
  await signIn(page, 'member', '/issues?projectId=' + projectId, /^Issues$/); const advanced = page.locator('details.advanced-filters'); await advanced.locator('summary').click();
  const fields = advanced.locator('gg-date-label-fields'), query = fields.getByRole('combobox', { name: 'Labels', exact: true }), keys = page.getByRole('list', { name: 'Issue results list', exact: true }).locator('.issue-key');
  await webCase('UC-LBL-0015', async () => { await query.click(); await fields.getByRole('option', { name: a.name, exact: true }).click(); await fields.getByRole('option', { name: b.name, exact: true }).click(); await fields.getByRole('button', { name: 'Done choosing', exact: true }).click(); await expect(keys).toHaveText([both.summary.key]); await expect(fields.getByLabel('New label name', { exact: true })).toHaveCount(0); await expect(fields.getByRole('button', { name: 'Create and select label', exact: true })).toHaveCount(0); await expect(fields).toContainText('Require all selected labels'); });
  const projects = page.getByRole('combobox', { name: 'Project', exact: true });
  for (let index = 0; index < 100 && await projects.locator('option[value="' + otherProjectId + '"]').count() === 0; index++) { const count = await projects.locator('option').count(); await page.getByRole('main').getByRole('button', { name: 'More projects', exact: true }).click(); await expect.poll(() => projects.locator('option').count()).toBeGreaterThan(count); }
  await webCase('UC-LBL-0016', async () => { await projects.selectOption(otherProjectId); await expect(fields).toContainText('0 / 10 labels selected'); await expect(fields.getByRole('button', { name: 'Remove ' + a.name, exact: true })).toHaveCount(0); await expect(fields.getByRole('button', { name: 'Remove ' + b.name, exact: true })).toHaveCount(0); await query.click(); await expect(fields.getByRole('option', { name: other.name, exact: true })).toBeVisible(); await expect(fields.getByRole('option', { name: a.name, exact: true })).toHaveCount(0); await expect(fields.getByRole('option', { name: b.name, exact: true })).toHaveCount(0); await expect(keys).toHaveText([otherIssue.summary.key]); });
});

test('native label lookup ignores a real old response delivered after the latest query', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId), old = await createLabel(request, projectId, 'Earlier label ' + crypto.randomUUID().slice(0, 8)), latest = await createLabel(request, projectId, 'Latest label ' + crypto.randomUUID().slice(0, 8));
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$')); await page.getByRole('button', { name: 'Edit issue', exact: true }).click(); const fields = page.getByRole('dialog').locator('gg-date-label-fields'), query = fields.getByRole('combobox', { name: 'Labels', exact: true });
  let release!: () => void, done!: () => void, arrived = false; const held = new Promise<void>(resolve => release = resolve), delivered = new Promise<void>(resolve => done = resolve);
  await page.route('**/api/v1/projects/' + projectId + '/labels**', async route => { const url = new URL(route.request().url()); if (url.searchParams.get('query') !== old.name) { await route.continue(); return; } const response = await route.fetch(); arrived = true; await held; await route.fulfill({ response }).catch(() => {}); done(); });
  await query.fill(old.name); await expect.poll(() => arrived).toBe(true);
  await webCase('UC-LBL-0019', async () => { await query.fill(latest.name); await expect(fields.getByRole('option', { name: latest.name, exact: true })).toBeVisible(); release(); await delivered; await expect(query).toHaveValue(latest.name); await expect(fields.getByRole('option', { name: latest.name, exact: true })).toBeVisible(); await expect(fields.getByRole('option', { name: old.name, exact: true })).toHaveCount(0); });
});

for (const image of [{ extension: 'png', mime: 'image/png', id: 'UC-AST-0013' }, { extension: 'jpg', mime: 'image/jpeg', id: 'UC-AST-0014' }, { extension: 'webp', mime: 'image/webp', id: 'UC-AST-0015' }]) test('native ' + image.extension + ' upload renders a protected unified thumbnail with exact accepted bytes', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId), filename = 'Native protected picture.' + image.extension;
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const base64 = await page.evaluate(mime => { const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 3; const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas context missing.'); context.fillStyle = '#179b57'; context.fillRect(0, 0, 4, 3); return canvas.toDataURL(mime).split(',')[1]!; }, image.mime);
  const attachments = page.locator('gg-issue-attachments'), queue = attachments.getByRole('group', { name: 'Attach pictures and files', exact: true });
  const chooser = page.waitForEvent('filechooser'); await attachments.getByRole('button', { name: 'Add files', exact: true }).click(); await (await chooser).setFiles({ name: filename, mimeType: image.mime, buffer: Buffer.from(base64, 'base64') });
  await webCase(image.id, async () => { const finalize = page.waitForResponse(value => value.url().endsWith('/finalize') && value.request().method() === 'POST'); await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click(); const reply = await finalize; expect(reply.status()).toBe(201); const asset = zSavedAssetView.parse(await reply.json()).result; expect(asset.kind).toBe('image'); expect(asset.mimeType).toBe(image.mime); expect(asset.state).toBe('published'); const card = attachments.getByRole('article', { name: filename, exact: true }); await expect(card).toBeVisible(); await card.scrollIntoViewIfNeeded(); const thumbnail = card.locator('gg-picture-image img').first(); await expect(thumbnail).toBeVisible(); await expect.poll(() => thumbnail.evaluate(node => { if (!(node instanceof HTMLImageElement)) throw new Error('Missing native image element.'); return { width: node.naturalWidth, height: node.naturalHeight, complete: node.complete }; })).toEqual({ width: 4, height: 3, complete: true }); await expect(thumbnail).toHaveAttribute('src', /^blob:/); const response = await request.get(`${apiOrigin}/api/v1/assets/${asset.id}/chunk?offset=0&count=1048576`, { headers: await coverageHeaders('viewer') }); expect(response.status()).toBe(200); const chunk = zAssetChunk.parse(await response.json()); expect(chunk.terminal).toBe(true); expect(chunk.dataBase64).toBe(base64); });
});

test('native stale detach retains the visible attachment until deliberate revision review and retry', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId), filename = 'Keep until reviewed.txt';
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const attachments = page.locator('gg-issue-attachments'), queue = attachments.getByRole('group', { name: 'Attach pictures and files', exact: true }), chooser = page.waitForEvent('filechooser'); await attachments.getByRole('button', { name: 'Add files', exact: true }).click(); await (await chooser).setFiles({ name: filename, mimeType: 'text/plain', buffer: Buffer.from('Retain this attachment until its latest revision is reviewed.') }); await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click(); const card = attachments.getByRole('article', { name: filename, exact: true }); await expect(card).toBeVisible();
  const current = await coverageRead(request, issue.summary.id), changed = await request.patch(`${apiOrigin}/api/v2/issues/${issue.summary.id}/fields`, { headers: await coverageHeaders(), data: { field: 'dueDate', dueDate: { prior: current.summary.dueDate, value: '2999-03-01' } } }); expect(changed.status()).toBe(200); zSavedModernIssueView.parse(await changed.json());
  await webCase('UC-AST-0037', async () => { const rejected = page.waitForResponse(value => value.request().method() === 'POST' && value.url().endsWith('/detach')); await card.getByRole('button', { name: 'Remove ' + filename, exact: true }).click(); expect((await rejected).status()).toBe(409); await expect(card).toBeVisible(); await expect(attachments).toContainText('Review the current attachments before removing'); const retry = attachments.getByRole('button', { name: 'Use current revision and retry detach', exact: true }); await expect(retry).toBeEnabled(); const before = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders() }); expect(before.status()).toBe(200); expect(zPageAssetView.parse(await before.json()).items.map(value => value.filename)).toEqual([filename]); await retry.click(); await expect(card).toHaveCount(0); await expect(attachments).toContainText(filename + ' removed from attachments'); const after = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders() }); expect(after.status()).toBe(200); expect(zPageAssetView.parse(await after.json()).items).toEqual([]); });
});

test('native HTML comment posting removes executable markup before rendering without invoking it or loading remote images', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId), marker = '__gg_native_executable_' + crypto.randomUUID().replaceAll('-', '');
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  let externalRequests = 0; page.on('request', value => { if (value.url().includes('native-executable.invalid')) externalRequests++; });
  const editor = page.locator('gg-comment-editor'); await editor.getByRole('button', { name: 'HTML source', exact: true }).click();
  await editor.getByLabel('Comment HTML', { exact: true }).fill(`<p>Visible safe <strong>native formatting</strong><script>window.${marker}=true</script><a href="javascript:window.${marker}=true">unsafe link</a><img src="https://native-executable.invalid/pixel" onerror="window.${marker}=true"></p>`);
  await webCase('UC-COM-0059', async () => { await editor.getByRole('button', { name: 'Post comment', exact: true }).click(); const thread = page.getByRole('region', { name: 'Issue discussion', exact: true }); await expect(thread.locator('.comment-body strong')).toHaveText('native formatting'); await expect(thread.locator('.comment-body script,.comment-body [onerror],.comment-body a[href^="javascript:"],.comment-body img[src*="native-executable.invalid"]')).toHaveCount(0); expect(await page.evaluate(key => key in window, marker)).toBe(false); expect(externalRequests).toBe(0); const persisted = (await discussion(request, issue.summary.id)).items; expect(persisted).toHaveLength(1); expect(persisted[0]?.safeHtml).not.toMatch(/script|javascript:|onerror|native-executable\.invalid/i); });
});

test('native subtasks keep their own priority, labels, rich description, discussion and files independently of the parent', async ({ page, request }) => {
  const projectId = await coverageProject(request), parent = await coverageCreate(request, projectId, { title: 'Independent native parent', description: 'Keep parent description' }), child = await coverageCreate(request, projectId, { title: 'Independent native child', parentId: parent.summary.id, expectedParentRevision: parent.summary.revision }), label = await createLabel(request, projectId, 'Child-only classification'), filename = 'Child-only attachment.txt';
  await signIn(page, 'member', '/issues/' + child.summary.id, /^Independent native child$/);
  await webCase('UC-REL-0004', async () => { await page.getByRole('button', { name: 'Edit priority', exact: true }).click(); const field = page.getByRole('group', { name: 'Edit priority', exact: true }); await field.getByRole('option', { name: 'High', exact: true }).click(); await expect(field).toHaveCount(0); await expect(page.locator('.priority-value')).toContainText('High'); expect((await coverageRead(request, child.summary.id)).summary.priority.key).toBe('high'); expect((await coverageRead(request, parent.summary.id)).summary.priority.id).toBe(parent.summary.priority.id); });
  await webCase('UC-REL-0006', async () => { await page.getByRole('button', { name: 'Edit issue', exact: true }).click(); const dialog = page.getByRole('dialog'), fields = dialog.locator('gg-date-label-fields'); await fields.getByRole('combobox', { name: 'Labels', exact: true }).fill(label.name); await fields.getByRole('option', { name: label.name, exact: true }).click(); await fields.getByRole('button', { name: 'Done choosing', exact: true }).click(); await dialog.getByRole('button', { name: 'Save issue', exact: true }).click(); await expect(dialog).toHaveCount(0); await expect(page.locator('.label-values .badge')).toHaveText(label.name); expect((await coverageRead(request, child.summary.id)).summary.labels.map(value => value.id)).toEqual([label.id]); expect((await coverageRead(request, parent.summary.id)).summary.labels).toEqual([]); });
  await webCase('UC-REL-0007', async () => { await page.getByRole('button', { name: 'Edit description', exact: true }).click(); const field = page.getByRole('group', { name: 'Edit description', exact: true }); await field.getByRole('textbox', { name: 'Description', exact: true }).fill('Child-specific rich دليل'); await field.getByRole('button', { name: 'Save', exact: true }).click(); await expect(field).toHaveCount(0); await expect(page.locator('.issue-description gg-comment-content')).toContainText('Child-specific rich دليل'); expect((await coverageRead(request, child.summary.id)).description).toContain('Child-specific rich دليل'); expect((await coverageRead(request, parent.summary.id)).description).toBe('Keep parent description'); });
  await webCase('UC-REL-0008', async () => { const editor = page.locator('gg-comment-editor'); await editor.getByRole('textbox', { name: 'Comment text', exact: true }).fill('Child-only discussion مراجعة'); await editor.getByRole('button', { name: 'Post comment', exact: true }).click(); await expect(page.getByRole('region', { name: 'Issue discussion', exact: true }).locator('.comment-body')).toContainText('Child-only discussion مراجعة'); expect((await discussion(request, child.summary.id)).items.map(value => value.plainText)).toEqual(['Child-only discussion مراجعة']); expect((await discussion(request, parent.summary.id)).totalMatching).toBe(0); });
  await webCase('UC-REL-0009', async () => { const attachments = page.locator('gg-issue-attachments'), chooser = page.waitForEvent('filechooser'); await attachments.getByRole('button', { name: 'Add files', exact: true }).click(); await (await chooser).setFiles({ name: filename, mimeType: 'text/plain', buffer: Buffer.from('This belongs to the child only.') }); await attachments.getByRole('button', { name: 'Upload queued files', exact: true }).click(); await expect(attachments.getByRole('article', { name: filename, exact: true })).toBeVisible(); const response = await request.get(`${apiOrigin}/api/v1/issues/${child.summary.id}/assets`, { headers: await coverageHeaders() }); expect(response.status()).toBe(200); const files = zPageAssetView.parse(await response.json()).items; expect(files.map(value => value.issueId)).toEqual([child.summary.id]); await page.getByRole('link', { name: 'Open parent ' + parent.summary.key, exact: true }).click(); await expect(page.getByRole('heading', { name: parent.summary.title, exact: true })).toBeVisible(); await expect(page.locator('gg-issue-attachments').getByRole('article')).toHaveCount(0); await expect(page.getByRole('region', { name: 'Issue discussion', exact: true }).locator('.comment-body')).toHaveCount(0); const responseParent = await request.get(`${apiOrigin}/api/v1/issues/${parent.summary.id}/assets`, { headers: await coverageHeaders() }); expect(responseParent.status()).toBe(200); expect(zPageAssetView.parse(await responseParent.json()).items).toEqual([]); });
});

test('native review exposes only transition-bound contexts and immutable past votes rather than standalone requests or retraction', async ({ page, request }) => {
  const f = await reviewFixture(request);
  await signIn(page, 'member', '/issues/' + f.issue.summary.id, new RegExp('^' + f.issue.summary.title + '$'));
  const review = page.locator('gg-issue-review'), select = review.getByRole('combobox', { name: 'Move to review', exact: true });
  await webCase('UC-APR-0055', async () => { await expect(review.getByRole('button', { name: /^(Create|Request|New) (independent |standalone )?review( request)?$/i })).toHaveCount(0); await select.selectOption(f.edge.transitionId); await expect(review.getByRole('status').filter({ hasText: '0 / 1 approvals' })).toBeVisible(); const context = await f.context(); expect(context.transitionId).toBe(f.edge.transitionId); expect(context.issueId).toBe(f.issue.summary.id); });
  await review.getByRole('button', { name: 'Approve', exact: true }).click(); await expect(review.getByRole('status').filter({ hasText: 'Review requirements satisfied' })).toBeVisible();
  await webCase('UC-APR-0056', async () => { await expect(review.getByRole('button', { name: /^(Cancel|Withdraw)( review| request| approval)?$/i })).toHaveCount(0); await select.selectOption(''); await expect(review.getByRole('status').filter({ hasText: 'Review requirements satisfied' })).toHaveCount(0); expect((await f.context()).votes).toHaveLength(1); await select.selectOption(f.edge.transitionId); await expect(review.getByRole('status').filter({ hasText: 'Review requirements satisfied' })).toBeVisible(); });
  await webCase('UC-APR-0057', async () => { await expect(review.getByRole('button', { name: /^(Retract|Revoke|Remove|Undo)( my| prior)? (vote|approval)$/i })).toHaveCount(0); await review.getByRole('button', { name: 'Resubmit for review', exact: true }).click(); await expect(review.getByRole('status').filter({ hasText: '0 / 1 approvals' })).toBeVisible(); await expect(review.locator('.review-votes li')).toHaveCount(1); await expect(review.locator('.review-votes li')).toContainText('Previous review'); const context = await f.context(); expect(context.votes).toHaveLength(1); expect(context.votes[0]?.decision).toBe('approve'); expect(context.votes[0]?.current).toBe(false); expect(context.approved).toBe(0); });
});

test('native reusable-label controls expose issue deselection without rename, retirement or project-label deletion', async ({ page, request }) => {
  const projectId = await coverageProject(request), label = await createLabel(request, projectId, 'Retain reusable definition'), issue = await coverageCreate(request, projectId, { labelIds: [label.id] });
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$')); await page.getByRole('button', { name: 'Edit issue', exact: true }).click(); const dialog = page.getByRole('dialog'), fields = dialog.locator('gg-date-label-fields');
  await webCase('UC-LBL-0020', async () => { await expect(fields.getByRole('button', { name: 'Remove ' + label.name, exact: true })).toBeVisible(); await expect(fields.getByLabel('New label name', { exact: true })).toBeVisible(); await expect(fields.getByRole('button', { name: /^Rename( reusable)? label/i })).toHaveCount(0); await expect(fields.getByRole('button', { name: /^Update label/i })).toHaveCount(0); });
  await webCase('UC-LBL-0021', async () => { await expect(fields.getByRole('button', { name: /^(Retire|Archive|Disable)( reusable)? label/i })).toHaveCount(0); await fields.getByRole('combobox', { name: 'Labels', exact: true }).fill(label.name); await expect(fields.getByRole('option', { name: label.name, exact: true })).toBeVisible(); await fields.getByRole('button', { name: 'Done choosing', exact: true }).click(); });
  await webCase('UC-LBL-0022', async () => { await expect(fields.getByRole('button', { name: /^Delete( reusable)? label/i })).toHaveCount(0); await fields.getByRole('button', { name: 'Remove ' + label.name, exact: true }).click(); await dialog.getByRole('button', { name: 'Save issue', exact: true }).click(); await expect(dialog).toHaveCount(0); expect((await coverageRead(request, issue.summary.id)).summary.labels).toEqual([]); const response = await request.get(`${apiOrigin}/api/v1/projects/${projectId}/labels?query=${encodeURIComponent(label.name)}`, { headers: await coverageHeaders() }); expect(response.status()).toBe(200); expect(zPageLabelView.parse(await response.json()).items.map(value => ({ id: value.id, name: value.name }))).toEqual([{ id: label.id, name: label.name }]); });
});

test('mention lookup disables through reactive forms during an uncertain post and resumes the retained query without a late-result leak or Angular warning', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId), warnings: string[] = [];
  page.on('console', value => { if (value.type() === 'warning' && /disabled.*reactive form|reactive form.*disabled/i.test(value.text())) warnings.push(value.text()); });
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const editor = page.locator('gg-comment-editor'), visual = editor.getByRole('textbox', { name: 'Comment text', exact: true }); await visual.fill('Preserve the mention search during this uncertain write.'); await editor.getByRole('button', { name: 'Mention a teammate', exact: true }).click();
  const picker = editor.locator('gg-mention-picker'), query = picker.getByRole('combobox', { name: 'Find a teammate', exact: true });
  let releaseLookup!: () => void, finishLookup!: () => void, releasePost!: () => void, arrived = false, posted = false, lookups = 0;
  const heldLookup = new Promise<void>(resolve => releaseLookup = resolve), deliveredLookup = new Promise<void>(resolve => finishLookup = resolve), heldPost = new Promise<void>(resolve => releasePost = resolve);
  await page.route('**/api/v1/projects/' + projectId + '/mention-candidates**', async route => { const url = new URL(route.request().url()); if (url.searchParams.get('query') !== 'مطور') { await route.continue(); return; } lookups++; const response = await route.fetch(); if (lookups > 1) { await route.fulfill({ response }); return; } arrived = true; await heldLookup; await route.fulfill({ response }).catch(() => {}); finishLookup(); });
  await page.route('**/api/v1/issues/' + issue.summary.id + '/comments', async route => { if (route.request().method() !== 'POST') { await route.continue(); return; } const response = await route.fetch(); expect(response.status()).toBe(201); posted = true; await heldPost; await route.abort('failed').catch(() => {}); });
  try {
    await query.fill('مطور'); await expect.poll(() => arrived).toBe(true); await editor.getByRole('button', { name: 'Post comment', exact: true }).click(); await expect.poll(() => posted).toBe(true); await expect(query).toBeDisabled(); await expect(query).toHaveValue('مطور'); releaseLookup(); await deliveredLookup; await expect(picker.getByRole('option')).toHaveCount(0); await expect(query).toHaveAttribute('aria-busy', 'false'); releasePost(); await expect(page.locator('gg-comment-thread').getByRole('alert')).toBeVisible(); await expect(query).toBeEnabled(); await expect(query).toHaveValue('مطور'); await expect(picker.getByRole('option', { name: 'مطور تجريبي', exact: true })).toBeVisible(); expect(lookups).toBe(2); expect(warnings).toEqual([]); expect((await discussion(request, issue.summary.id)).items).toHaveLength(1);
  } finally { releaseLookup(); releasePost(); }
});
