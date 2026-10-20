import { expect, type APIRequestContext } from '@playwright/test';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { mcpSuccess, mcpFailure, callTool, memberId, viewerId } from './support/coverage-access';
import { coverageProject, coverageDefinition, coverageOfficeFile, coverageIneligiblePeople } from './support/coverage-issues';
import { localFixturesAvailable, token } from './support/session';
import { modernEditable } from '../src/app/features/issues/issue-model';
import type { FieldAssignment, IssueFilter, ModernCreateFields, ModernIssueView, TransitionPolicy, ApprovalContextView } from '../src/app/api/generated/types.gen';
import {
  zModernIssueView, zSavedModernIssueView, zPageModernIssueSummary, zModernIssueFailureBody,
  zConfigurationView, zPageBindingView, zPageStageView, zPagePriorityView,
  zCustomFieldsView, zSavedCustomFieldsView, zSavedFieldOptionSaved, zPageFieldOptionView,
  zSavedLabelView, zPageLabelView, zSavedSavedSearch, zSavedSearchList,
  zSavedCommentView, zPageCommentView, zPageCommentVersionView,
  zSavedAssetView, zAssetView, zAssetChunk, zPageAssetView,
  zAssetPolicy, zSavedUploadSessionView, zUploadSessionView,
  zPageDependencyView, zSavedDependencyView, zSavedIssueView, zPageIssueSummary,
  zPageIssueTransitionOption, zApprovalContextView, zSavedApprovalContextView,
  zSavedTransitionPolicyView,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires isolated real Go/PostgreSQL and authenticated MCP transport.');
test.use({ trace: 'off' });
test.setTimeout(90_000);
const mcpCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'mcp');
const safeError = z.object({ error: z.object({ code: z.string(), message: z.string().min(1) }) });
const binaryTools = new Set(['upload_asset', 'append_asset_chunk', 'finalize_asset_upload', 'download_asset_chunk']);
async function success<S extends z.ZodType>(request: APIRequestContext, name: string, args: object, schema: S, role = 'member'): Promise<z.output<S>> {
  if (!binaryTools.has(name)) return mcpSuccess(request, name, args, schema, role);
  // Binary tools intentionally keep private base64 out of their prose content.
  const response = await callTool(request, name, args, await token(role, 'mcp'));
  expect(response.status(), name).toBe(200);
  const reply = z.object({ result: z.object({ isError: z.literal(false).optional(), structuredContent: z.object({ ok: z.literal(true), data: z.unknown(), error: z.null() }), content: z.array(z.object({ type: z.literal('text'), text: z.literal('GateGoldJira operation completed.') })).length(1) }) }).parse(await response.json());
  expect(reply.result.content).toHaveLength(1);
  return schema.parse(reply.result.structuredContent.data);
}
const failure = (request: APIRequestContext, name: string, args: object, code = 'validation_failed', role = 'member') => mcpFailure(request, name, args, safeError, code, role);
async function create(request: APIRequestContext, projectId: string, fields: Partial<ModernCreateFields> = {}) {
  return (await success(request, 'create_issue_v2', { projectId, title: 'MCP domain ' + crypto.randomUUID().slice(0, 8), ...fields, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result;
}
const read = (request: APIRequestContext, issueId: string) => success(request, 'get_issue_v2', { issueId }, zModernIssueView);
const fields = (request: APIRequestContext, issueId: string) => success(request, 'get_issue_fields', { issueId }, zCustomFieldsView);
const search = (request: APIRequestContext, filters: IssueFilter, limit = 100, cursor?: string) => success(request, 'search_issues_v2', { filters, page: { limit, ...(cursor ? { cursor } : {}) } }, zPageModernIssueSummary);
async function move(request: APIRequestContext, issue: ModernIssueView, category: string) {
  const stages = await success(request, 'list_workflow_stages', { projectId: issue.summary.projectId, workflowId: issue.summary.workflow.id, page: { limit: 100 } }, zPageStageView);
  const target = stages.items.find(value => value.category === category && !value.retired && value.acceptsEntries);
  if (!target) throw new Error('Missing MCP workflow target ' + category);
  return (await success(request, 'move_issue_v2', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, targetStageId: target.id, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result;
}

// Schema validation and service validation share the published typed MCP failure.
async function invalidParameters(request: APIRequestContext, name: string, args: object) {
  await failure(request, name, args, 'validation_failed');
}

test('MCP creates canonical work with exact defaults, typed optional values and replay semantics', async ({ request }) => {
  const projectId = await coverageProject(request);
  const cfg = await success(request, 'get_project_configuration', { projectId }, zConfigurationView);
  const first = await mcpCase('UC-ISS-0003', async () => { const issue = await create(request, projectId, { title: 'MCP title only' }); expect(issue.summary.title).toBe('MCP title only'); expect(issue.summary.key).toMatch(/-1$/); expect(issue.summary.revision).toBe('1'); return issue; });
  await mcpCase('UC-ISS-0004', async () => { expect(first.summary.type.id).toBe(cfg.defaults.standardTypeId); expect(first.summary.type.behavior).toBe('standard'); });
  await mcpCase('UC-ISS-0006', async () => { expect(first.summary.priority.id).toBe(cfg.defaults.priorityId); });
  await mcpCase('UC-ISS-0008', async () => { const bindings = await success(request, 'list_type_workflow_bindings', { projectId, typeId: first.summary.type.id, page: { limit: 100 } }, zPageBindingView); expect(first.summary.workflow.id).toBe(bindings.items.find(value => value.default)?.workflowId); expect(first.summary.stage.initial).toBe(true); });
  for (const scenario of [
    { id: 'UC-ISS-0011', input: { assigneeId: memberId }, key: 'assignee' },
    { id: 'UC-ISS-0012', input: { assigneeId: null }, key: 'unassigned' },
    { id: 'UC-ISS-0013', input: { dueDate: '2028-02-29' }, key: 'date' },
    { id: 'UC-ISS-0015', input: { backlog: true }, key: 'backlog' },
  ] as const) await mcpCase(scenario.id, async () => { const issue = await create(request, projectId, scenario.input); if (scenario.key === 'assignee') expect(issue.summary.assignee?.id).toBe(memberId); if (scenario.key === 'unassigned') expect(issue.summary.assignee).toBeNull(); if (scenario.key === 'date') expect(issue.summary.dueDate).toBe('2028-02-29'); if (scenario.key === 'backlog') expect(issue.summary.backlog).toBe(true); });
  const label = (await success(request, 'create_label', { projectId, name: 'MCP creation label', retryReference: crypto.randomUUID() }, zSavedLabelView)).result;
  await mcpCase('UC-ISS-0014', async () => { const issue = await create(request, projectId, { labelIds: [label.id] }); expect(issue.summary.labels.map(value => value.id)).toEqual([label.id]); });
  const input = { projectId, title: 'Replay MCP create', retryReference: crypto.randomUUID() }, original = await success(request, 'create_issue_v2', input, zSavedModernIssueView);
  await mcpCase('UC-ISS-0022', async () => { const replay = await success(request, 'create_issue_v2', input, zSavedModernIssueView); expect(replay.result.summary.id).toBe(original.result.summary.id); expect(replay.receipt.replayed).toBe(true); expect((await search(request, { projectIds: [projectId], query: input.title })).totalMatching).toBe(1); });
  await mcpCase('UC-ISS-0030', async () => { const source = 'mcp-import-' + crypto.randomUUID(); const issue = await create(request, projectId, { importSourceKey: source, title: 'MCP external source' }); const duplicate = await create(request, projectId, { importSourceKey: source, title: 'Discard duplicate source' }); expect(duplicate.summary.id).toBe(issue.summary.id); expect((await search(request, { projectIds: [projectId], query: 'MCP external source' })).totalMatching).toBe(1); });
  for (const scenario of [{ id: 'UC-ISS-0024', title: ' ' }, { id: 'UC-ISS-0188', title: 'x'.repeat(201) }]) await mcpCase(scenario.id, async () => { const before = (await search(request, { projectIds: [projectId] })).totalMatching; await invalidParameters(request, 'create_issue_v2', { projectId, title: scenario.title, retryReference: crypto.randomUUID() }); expect((await search(request, { projectIds: [projectId] })).totalMatching).toBe(before); });
  await mcpCase('UC-ISS-0029', async () => { const stages = await success(request, 'list_workflow_stages', { projectId, workflowId: first.summary.workflow.id, page: { limit: 100 } }, zPageStageView); const review = stages.items.find(value => value.category === 'review')!; await failure(request, 'create_issue_v2', { projectId, title: 'Skip intake', stageId: review.id, retryReference: crypto.randomUUID() }); });
});

test('MCP issue searches intersect exact identities, categories, dates, ownership, labels and cursor pages', async ({ request }) => {
  const projectId = await coverageProject(request);
  const label = (await success(request, 'create_label', { projectId, name: 'Urgent', retryReference: crypto.randomUUID() }, zSavedLabelView)).result;
  const a = await create(request, projectId, { title: 'MCP needle العربية', assigneeId: memberId, dueDate: '2001-01-01', labelIds: [label.id] });
  const b = await create(request, projectId, { title: 'MCP backlog', backlog: true });
  const c = await move(request, await create(request, projectId, { title: 'MCP complete', dueDate: '2001-01-01' }), 'done');
  const d = await move(request, await create(request, projectId, { title: 'MCP review', dueDate: '2099-01-01' }), 'review');
  const e = await move(request, await create(request, projectId, { title: 'MCP progress' }), 'in_progress');
  const child = await create(request, projectId, { title: 'MCP child', parentId: a.summary.id, expectedParentRevision: a.summary.revision });
  const matrix: { id: string; filters: IssueFilter; ids: string[] }[] = [
    { id: 'UC-ISS-0031', filters: { backlog: false }, ids: [a.summary.id, c.summary.id, d.summary.id, e.summary.id, child.summary.id] },
    { id: 'UC-ISS-0033', filters: { query: a.summary.key }, ids: [a.summary.id] },
    { id: 'UC-ISS-0034', filters: { query: String(a.summary.number) }, ids: [a.summary.id] },
    { id: 'UC-ISS-0189', filters: { query: 'needle' }, ids: [a.summary.id] },
    { id: 'UC-ISS-0038', filters: { statuses: ['todo', 'in_progress', 'review'] }, ids: [a.summary.id, b.summary.id, d.summary.id, e.summary.id, child.summary.id] },
    { id: 'UC-ISS-0039', filters: { statuses: ['todo'], backlog: false }, ids: [a.summary.id, child.summary.id] },
    { id: 'UC-ISS-0040', filters: { statuses: ['in_progress'] }, ids: [e.summary.id] },
    { id: 'UC-ISS-0041', filters: { statuses: ['review'] }, ids: [d.summary.id] },
    { id: 'UC-ISS-0042', filters: { statuses: ['done'] }, ids: [c.summary.id] },
    { id: 'UC-ISS-0043', filters: { assignee: { kind: 'self' } }, ids: [a.summary.id] },
    { id: 'UC-ISS-0045', filters: { assignee: { kind: 'unassigned' } }, ids: [b.summary.id, c.summary.id, d.summary.id, e.summary.id, child.summary.id] },
    { id: 'UC-ISS-0047', filters: { assignee: { kind: 'user', userId: memberId } }, ids: [a.summary.id] },
    { id: 'UC-ISS-0050', filters: { dueFrom: '2099-01-01' }, ids: [d.summary.id] },
    { id: 'UC-ISS-0051', filters: { dueTo: '2001-01-01' }, ids: [a.summary.id, c.summary.id] },
    { id: 'UC-ISS-0052', filters: { overdue: true }, ids: [a.summary.id] },
    { id: 'UC-ISS-0056', filters: { labelIds: [label.id] }, ids: [a.summary.id] },
    { id: 'UC-ISS-0058', filters: { parentId: a.summary.id }, ids: [child.summary.id] },
    { id: 'UC-ISS-0061', filters: { backlog: true }, ids: [b.summary.id] },
    { id: 'UC-ISS-0067', filters: { query: 'needle', overdue: true, assignee: { kind: 'self' }, labelIds: [label.id] }, ids: [a.summary.id] },
    { id: 'UC-ISS-0191', filters: { query: 'Missing MCP title 8924561' }, ids: [] },
    { id: 'UC-ISS-0080', filters: { query: 'العربية' }, ids: [a.summary.id] },
    { id: 'UC-REL-0079', filters: { query: String(a.summary.number) }, ids: [a.summary.id] },
  ];
  for (const row of matrix) await mcpCase(row.id, async () => { const result = await search(request, { projectIds: [projectId], ...row.filters }); expect(result.items.map(value => value.id).sort()).toEqual([...row.ids].sort()); expect(result.totalMatching).toBe(row.ids.length); if (!row.ids.length) expect(result.nextCursor).toBeNull(); });
  await mcpCase('UC-ISS-0190', async () => { const ids: string[] = []; let cursor: string | undefined; do { const page = await search(request, { projectIds: [projectId] }, 2, cursor); expect(page.items.length).toBeLessThanOrEqual(2); ids.push(...page.items.map(value => value.id)); cursor = page.nextCursor ?? undefined; } while (cursor); expect(ids).toHaveLength(6); expect(new Set(ids).size).toBe(6); });
});

test('MCP prior-value patches merge unrelated edits, replay once and expose strict conflicts', async ({ request }) => {
  const projectId = await coverageProject(request); let issue = await create(request, projectId);
  const old = issue, editable = modernEditable(issue);
  await mcpCase('UC-ISS-0092', async () => { issue = (await success(request, 'update_issue_v2', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, editable: { ...editable, title: 'MCP parallel title' }, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result; expect(issue.summary.title).toBe('MCP parallel title'); expect(issue.summary.revision).not.toBe(old.summary.revision); });
  const patch = { issueId: issue.summary.id, field: 'dueDate', dueDate: { prior: null, value: '2028-04-21' }, retryReference: crypto.randomUUID() };
  await mcpCase('UC-ISS-0157', async () => { issue = (await success(request, 'patch_issue_field_v2', patch, zSavedModernIssueView)).result; expect(issue.summary.title).toBe('MCP parallel title'); expect(issue.summary.dueDate).toBe('2028-04-21'); });
  await mcpCase('UC-ISS-0159', async () => { const replay = await success(request, 'patch_issue_field_v2', patch, zSavedModernIssueView); expect(replay.receipt.replayed).toBe(true); expect(replay.result.summary.revision).toBe(issue.summary.revision); });
  await mcpCase('UC-ISS-0193', async () => { const response = await callTool(request, 'patch_issue_field_v2', { ...patch, dueDate: { prior: null, value: '2028-04-22' }, retryReference: crypto.randomUUID() }, await token('member', 'mcp')); const envelope = z.object({ result: z.object({ isError: z.literal(true), structuredContent: z.object({ error: z.object({ error: z.object({ code: z.literal('conflict') }), current: zModernIssueView }) }) }) }).parse(await response.json()); expect(envelope.result.structuredContent.error.current.summary.dueDate).toBe('2028-04-21'); expect((await read(request, issue.summary.id)).summary.revision).toBe(issue.summary.revision); });
  await mcpCase('UC-ISS-0194', async () => { await failure(request, 'update_issue_v2', { issueId: issue.summary.id, expectedRevision: old.summary.revision, editable, retryReference: crypto.randomUUID() }, 'conflict'); expect((await read(request, issue.summary.id)).summary.title).toBe('MCP parallel title'); });
  await mcpCase('UC-ISS-0161', async () => { const noOp = await success(request, 'patch_issue_field_v2', { ...patch, dueDate: { prior: issue.summary.dueDate, value: issue.summary.dueDate }, retryReference: crypto.randomUUID() }, zSavedModernIssueView); expect(noOp.result.summary.revision).toBe(issue.summary.revision); expect(noOp.receipt.eventId).toBeNull(); });
  await mcpCase('UC-ISS-0106', async () => { issue = (await success(request, 'patch_issue_field_v2', { ...patch, dueDate: { prior: issue.summary.dueDate, value: null }, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result; expect(issue.summary.dueDate).toBeNull(); });
  await mcpCase('UC-ISS-0099', async () => { issue = (await success(request, 'patch_issue_field_v2', { issueId: issue.summary.id, field: 'assigneeId', assignee: { prior: null, value: memberId }, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result; expect(issue.summary.assignee?.id).toBe(memberId); });
  await mcpCase('UC-ISS-0100', async () => { issue = (await success(request, 'patch_issue_field_v2', { issueId: issue.summary.id, field: 'assigneeId', assignee: { prior: memberId, value: null }, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result; expect(issue.summary.assignee).toBeNull(); });
  await mcpCase('UC-ISS-0173', async () => { await failure(request, 'patch_issue_field_v2', { issueId: issue.summary.id, field: 'assigneeId', assignee: { prior: null, value: viewerId }, retryReference: crypto.randomUUID() }); expect((await read(request, issue.summary.id)).summary.assignee).toBeNull(); });
  await mcpCase('UC-ISS-0120', async () => { issue = await move(request, issue, 'in_progress'); expect(issue.summary.stage.category).toBe('in_progress'); });
  await mcpCase('UC-ISS-0177', async () => { await failure(request, 'organize_issue', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, backlog: true, retryReference: crypto.randomUUID() }); expect((await read(request, issue.summary.id)).summary.backlog).toBe(false); });
});

test('MCP custom values create, edit and clear every discriminated kind without losing decimal precision', async ({ request }) => {
  const projectId = await coverageProject(request);
  const definitions = ['text', 'number', 'date', 'choice', 'user'] as const;
  const byKind = new Map<string, Awaited<ReturnType<typeof coverageDefinition>>>();
  for (const kind of definitions) byKind.set(kind, await coverageDefinition(request, projectId, { kind }));
  const choice = byKind.get('choice')!, optionIds: string[] = [];
  for (const name of ['Alpha', 'Beta']) { const cfg = await success(request, 'get_project_configuration', { projectId }, zConfigurationView), optionId = crypto.randomUUID(); const saved = await success(request, 'save_field_option', { projectId, fieldId: choice.id, optionId, expectedRevision: cfg.revision, name, position: String(optionIds.length + 1), retired: false, retryReference: crypto.randomUUID() }, zSavedFieldOptionSaved, 'owner'); expect(saved.result.option.id).toBe(optionId); optionIds.push(optionId); }
  const matrix: { kind: string; ids: [string, string, string]; initial: FieldAssignment['value']; next: FieldAssignment['value'] }[] = [
    { kind: 'text', ids: ['UC-FLD-0006', 'UC-FLD-0007', 'UC-FLD-0008'], initial: { kind: 'text', text: 'عربي\nExact initial' }, next: { kind: 'text', text: 'Exact next' } },
    { kind: 'number', ids: ['UC-FLD-0009', 'UC-FLD-0010', 'UC-FLD-0011'], initial: { kind: 'number', number: '9007199254740993.123456789' }, next: { kind: 'number', number: '-12.5' } },
    { kind: 'date', ids: ['UC-FLD-0012', 'UC-FLD-0013', 'UC-FLD-0014'], initial: { kind: 'date', date: '2028-02-29' }, next: { kind: 'date', date: '2028-03-01' } },
    { kind: 'choice', ids: ['UC-FLD-0015', 'UC-FLD-0016', 'UC-FLD-0017'], initial: { kind: 'choice', optionId: optionIds[0]! }, next: { kind: 'choice', optionId: optionIds[1]! } },
    { kind: 'user', ids: ['UC-FLD-0018', 'UC-FLD-0019', 'UC-FLD-0020'], initial: { kind: 'user', userId: memberId }, next: { kind: 'user', userId: viewerId } },
  ];
  for (const row of matrix) {
    const definition = byKind.get(row.kind)!;
    let issue = await mcpCase(row.ids[0], async () => { const value = await create(request, projectId, { fieldValues: [{ fieldId: definition.id, value: row.initial }] }); expect((await fields(request, value.summary.id)).values).toContainEqual({ fieldId: definition.id, value: row.initial }); return value; });
    await mcpCase(row.ids[1], async () => { const saved = await success(request, 'save_issue_fields', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, values: [{ fieldId: definition.id, value: row.next }], retryReference: crypto.randomUUID() }, zSavedCustomFieldsView); expect(saved.result.values).toContainEqual({ fieldId: definition.id, value: row.next }); issue = await read(request, issue.summary.id); });
    await mcpCase(row.ids[2], async () => { await success(request, 'save_issue_fields', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, values: [{ fieldId: definition.id, value: null }], retryReference: crypto.randomUUID() }, zSavedCustomFieldsView); expect((await fields(request, issue.summary.id)).values.some(value => value.fieldId === definition.id)).toBe(false); });
  }
  await mcpCase('UC-FLD-0076', async () => { const first = await success(request, 'list_field_options', { projectId, fieldId: choice.id, page: { limit: 1 } }, zPageFieldOptionView); expect(first.items[0]?.id).toBe(optionIds[0]); expect(first.nextCursor).not.toBeNull(); const second = await success(request, 'list_field_options', { projectId, fieldId: choice.id, page: { limit: 1, cursor: first.nextCursor! } }, zPageFieldOptionView); expect(second.items.map(value => value.id)).toEqual([optionIds[1]]); expect(second.nextCursor).toBeNull(); });
});

test('MCP comments sanitize HTML, retain Arabic direction, replay and page immutable authored history', async ({ request }) => {
  const projectId = await coverageProject(request), issue = await create(request, projectId);
  const list = (page = {}) => success(request, 'list_comments', { issueId: issue.summary.id, page }, zPageCommentView);
  await mcpCase('UC-COM-0076', async () => { const empty = await list(); expect(empty.items).toEqual([]); expect(empty.totalMatching).toBe(0); expect(empty.nextCursor).toBeNull(); });
  const input = { issueId: issue.summary.id, retryReference: crypto.randomUUID(), body: { html: '<p dir="rtl">مراجعة <strong>عربية</strong></p>', mentionUserIds: [], pictureIds: [] } };
  let comment = await mcpCase('UC-COM-0073', async () => { const value = await success(request, 'create_comment', input, zSavedCommentView); expect(value.result.author.id).toBe(memberId); expect(value.result.createdAt).toBeTruthy(); const page = await list(); expect(page.totalMatching).toBe(1); expect(page.items.map(row => row.id)).toEqual([value.result.id]); return value.result; });
  await mcpCase('UC-COM-0057', async () => { expect(comment.safeHtml).toContain('dir="rtl"'); expect(comment.plainText).toContain('مراجعة عربية'); expect((await list()).items[0]?.safeHtml).toBe(comment.safeHtml); });
  await mcpCase('UC-COM-0090', async () => { const replay = await success(request, 'create_comment', input, zSavedCommentView); expect(replay.receipt.replayed).toBe(true); expect(replay.result.id).toBe(comment.id); expect((await list()).totalMatching).toBe(1); });
  const unsafe = await mcpCase('UC-COM-0123', async () => { const saved = await success(request, 'create_comment', { ...input, retryReference: crypto.randomUUID(), body: { ...input.body, html: '<p>Safe<strong>bold</strong><script>alert(1)</script><iframe src="https://bad.invalid"></iframe><svg onload="alert(1)"></svg><a href="javascript:alert(1)">Link</a><span onclick="alert(1)">Text</span></p>' } }, zSavedCommentView); expect(saved.result.safeHtml).toContain('<strong>bold</strong>'); expect(saved.result.safeHtml).not.toMatch(/<script|<iframe|<svg|onload|onclick|javascript:/i); return saved.result; });
  await mcpCase('UC-COM-0105', async () => { expect(unsafe.sanitationNotices.length).toBeGreaterThan(0); expect(unsafe.plainText).toContain('Safe'); });
  await mcpCase('UC-COM-0113', async () => { const plain = await success(request, 'create_comment', { ...input, retryReference: crypto.randomUUID(), body: { ...input.body, html: '<p>Ordinary @name text</p>' } }, zSavedCommentView); expect(plain.result.plainText).toBe('Ordinary @name text'); expect(plain.result.mentions).toEqual([]); });
  const originalRevision = comment.revision, edit = { commentId: comment.id, expectedRevision: comment.revision, retryReference: crypto.randomUUID(), body: { ...input.body, html: '<p dir="rtl">تعديل عربي</p>' } };
  await mcpCase('UC-COM-0094', async () => { await failure(request, 'update_comment', edit, 'forbidden', 'owner'); expect((await list()).items.find(value => value.id === comment.id)?.revision).toBe(originalRevision); });
  await mcpCase('UC-COM-0126', async () => { comment = (await success(request, 'update_comment', edit, zSavedCommentView)).result; expect(comment.revision).toBe('2'); expect(comment.plainText).toBe('تعديل عربي'); expect(comment.editedAt).not.toBeNull(); });
  await mcpCase('UC-COM-0091', async () => { const replay = await success(request, 'update_comment', edit, zSavedCommentView); expect(replay.receipt.replayed).toBe(true); expect(replay.result.revision).toBe(comment.revision); });
  await mcpCase('UC-COM-0128', async () => { await failure(request, 'update_comment', { ...edit, retryReference: crypto.randomUUID(), body: { ...input.body, html: '<p>Stale edit</p>' } }, 'conflict'); const versions = await success(request, 'list_comment_versions', { commentId: comment.id }, zPageCommentVersionView); expect(versions.totalMatching).toBe(2); expect((await list()).items.find(value => value.id === comment.id)?.safeHtml).toBe(comment.safeHtml); });
  await mcpCase('UC-COM-0085', async () => { const versions = await success(request, 'list_comment_versions', { commentId: comment.id }, zPageCommentVersionView); expect(versions.items.map(value => value.revision)).toEqual(['1', '2']); expect(versions.items[0]?.safeHtml).toContain('مراجعة'); expect(versions.items[1]?.safeHtml).toBe(comment.safeHtml); });
  await mcpCase('UC-COM-0127', async () => { const first = await success(request, 'list_comment_versions', { commentId: comment.id, page: { limit: 1 } }, zPageCommentVersionView); expect(first.items.map(value => value.revision)).toEqual(['1']); expect(first.nextCursor).not.toBeNull(); const next = await success(request, 'list_comment_versions', { commentId: comment.id, page: { limit: 1, cursor: first.nextCursor! } }, zPageCommentVersionView); expect(next.items.map(value => value.revision)).toEqual(['2']); expect(next.nextCursor).toBeNull(); });
  await mcpCase('UC-COM-0124', async () => { const current = await list(); expect(current.totalMatching).toBe(3); expect(current.items).toHaveLength(3); expect(current.items[0]?.id).toBe(comment.id); expect(new Set(current.items.map(value => value.id)).size).toBe(3); });
  await mcpCase('UC-COM-0125', async () => { const ids: string[] = []; let cursor: string | undefined; do { const page = await list({ limit: 1, ...(cursor ? { cursor } : {}) }); ids.push(...page.items.map(value => value.id)); cursor = page.nextCursor ?? undefined; } while (cursor); expect(ids).toHaveLength(3); expect(new Set(ids).size).toBe(3); expect(ids[0]).toBe(comment.id); });
});

test('MCP comment validation refuses malformed text and references without retaining a partial post', async ({ request }) => {
  const projectId = await coverageProject(request), issue = await create(request, projectId);
  for (const row of [
    { id: 'UC-COM-0130', body: { html: '<p><br></p>', mentionUserIds: [], pictureIds: [] } },
    { id: 'UC-COM-0131', body: { html: '<p>' + 'ع'.repeat(5001) + '</p>', mentionUserIds: [], pictureIds: [] } },
    { id: 'UC-COM-0132', body: { html: '<p title="' + 'x'.repeat(65537) + '">tiny</p>', mentionUserIds: [], pictureIds: [] } },
    { id: 'UC-COM-0101', body: { html: '<p>Six pictures</p>', mentionUserIds: [], pictureIds: Array.from({ length: 6 }, () => crypto.randomUUID()) } },
    { id: 'UC-COM-0102', body: { html: '<p>Many files</p>', mentionUserIds: [], pictureIds: [], attachmentIds: Array.from({ length: 21 }, () => crypto.randomUUID()) } },
    { id: 'UC-COM-0133', body: { html: '<p><img data-picture-id="' + crypto.randomUUID() + '" src="https://bad.invalid"></p>', mentionUserIds: [], pictureIds: [] } },
  ]) await mcpCase(row.id, async () => { await invalidParameters(request, 'create_comment', { issueId: issue.summary.id, body: row.body, retryReference: crypto.randomUUID() }); const list = await success(request, 'list_comments', { issueId: issue.summary.id }, zPageCommentView); expect(list.totalMatching).toBe(0); expect(list.items).toEqual([]); });
});

test('MCP labels retain reusable Unicode identity, serialize equivalents and enforce scoped names', async ({ request }) => {
  const projectId = await coverageProject(request);
  const label = async (name: string) => (await success(request, 'create_label', { projectId, name, retryReference: crypto.randomUUID() }, zSavedLabelView)).result;
  const first = await mcpCase('UC-LBL-0023', async () => { const value = await label('Release'); expect(value.projectId).toBe(projectId); expect(value.name).toBe('Release'); return value; });
  await mcpCase('UC-LBL-0024', async () => { expect((await label('مراجعة عاجلة')).name).toBe('مراجعة عاجلة'); });
  await mcpCase('UC-LBL-0003', async () => { expect((await label('  Trimmed  ')).name).toBe('Trimmed'); });
  await mcpCase('UC-LBL-0004', async () => { expect((await label('release')).id).toBe(first.id); });
  await mcpCase('UC-LBL-0005', async () => { const pair = await Promise.all([label('Concurrent'), label('CONCURRENT')]); expect(pair[0]!.id).toBe(pair[1]!.id); const list = await success(request, 'list_labels', { projectId, query: 'concurrent' }, zPageLabelView); expect(list.items).toHaveLength(1); });
  for (const row of [{ id: 'UC-LBL-0006', name: '  ' }, { id: 'UC-LBL-0007', name: 'x'.repeat(41) }, { id: 'UC-LBL-0008', name: 'bad\u0000name' }]) await mcpCase(row.id, async () => { await invalidParameters(request, 'create_label', { projectId, name: row.name, retryReference: crypto.randomUUID() }); });
  await mcpCase('UC-LBL-0018', async () => { await failure(request, 'create_label', { projectId, name: 'Viewer denied', retryReference: crypto.randomUUID() }, 'forbidden', 'viewer'); });
  await mcpCase('UC-LBL-0025', async () => { const list = await success(request, 'list_labels', { projectId, query: 'rElEaSe' }, zPageLabelView); expect(list.items.map(value => value.id)).toEqual([first.id]); });
  await mcpCase('UC-LBL-0026', async () => { const one = await success(request, 'list_labels', { projectId, page: { limit: 1 } }, zPageLabelView); expect(one.nextCursor).not.toBeNull(); const two = await success(request, 'list_labels', { projectId, page: { limit: 1, cursor: one.nextCursor! } }, zPageLabelView); expect(two.items).toHaveLength(1); expect(two.items[0]?.id).not.toBe(one.items[0]?.id); });
});

test('MCP subtasks have independent keys while parent completion remains guarded', async ({ request }) => {
  const projectId = await coverageProject(request); let parent = await create(request, projectId);
  const childInput = { projectId, parentId: parent.summary.id, expectedParentRevision: parent.summary.revision, title: 'MCP independent child', retryReference: crypto.randomUUID() };
  let child = await mcpCase('UC-REL-0002', async () => { const value = (await success(request, 'create_issue_v2', childInput, zSavedModernIssueView)).result; expect(value.summary.parent?.id).toBe(parent.summary.id); expect(value.summary.key).not.toBe(parent.summary.key); expect(value.summary.type.behavior).toBe('subtask'); expect(value.reporter.id).toBe(memberId); return value; });
  await mcpCase('UC-REL-0027', async () => { const replay = await success(request, 'create_issue_v2', childInput, zSavedModernIssueView); expect(replay.receipt.replayed).toBe(true); expect(replay.result.summary.id).toBe(child.summary.id); const list = await success(request, 'list_subtasks', { parentId: parent.summary.id }, zPageIssueSummary); expect(list.totalMatching).toBe(1); });
  await mcpCase('UC-REL-0022', async () => { await failure(request, 'create_issue_v2', { projectId, parentId: child.summary.id, expectedParentRevision: child.summary.revision, title: 'Nested child', retryReference: crypto.randomUUID() }); });
  const doneTarget = async (issue: ModernIssueView, category: string) => { const page = await success(request, 'list_workflow_stages', { projectId, workflowId: issue.summary.workflow.id, page: { limit: 100 } }, zPageStageView); return page.items.find(value => value.category === category)!.id; };
  await mcpCase('UC-REL-0021', async () => { parent = await read(request, parent.summary.id); await failure(request, 'move_issue_v2', { issueId: parent.summary.id, expectedRevision: parent.summary.revision, targetStageId: await doneTarget(parent, 'done'), retryReference: crypto.randomUUID() }, 'prerequisite_unfinished'); expect((await read(request, parent.summary.id)).summary.stage.category).toBe('todo'); });
  await mcpCase('UC-REL-0018', async () => { child = await move(request, child, 'done'); parent = await read(request, parent.summary.id); expect(parent.summary.subtaskProgress).toEqual({ total: 1, done: 1 }); expect(parent.summary.stage.category).toBe('todo'); });
  await mcpCase('UC-REL-0020', async () => { parent = await move(request, parent, 'done'); expect(parent.summary.stage.category).toBe('done'); });
  await mcpCase('UC-REL-0023', async () => { await failure(request, 'create_issue_v2', { projectId, parentId: parent.summary.id, expectedParentRevision: parent.summary.revision, title: 'Child of done', retryReference: crypto.randomUUID() }, 'prerequisite_unfinished'); });
  await mcpCase('UC-REL-0024', async () => { await failure(request, 'move_issue_v2', { issueId: child.summary.id, expectedRevision: child.summary.revision, targetStageId: await doneTarget(child, 'todo'), retryReference: crypto.randomUUID() }, 'prerequisite_unfinished'); expect((await read(request, child.summary.id)).summary.stage.category).toBe('done'); });
  parent = await move(request, parent, 'todo');
  await mcpCase('UC-REL-0019', async () => { child = await move(request, child, 'todo'); expect((await read(request, parent.summary.id)).summary.subtaskProgress).toEqual({ total: 1, done: 0 }); });
  await mcpCase('UC-REL-0012', async () => { const list = await success(request, 'list_subtasks', { parentId: parent.summary.id }, zPageIssueSummary); expect(list.items.map(value => value.id)).toEqual([child.summary.id]); expect(list.items[0]?.status).toBe('todo'); });
});

test('MCP dependency graph preserves inverse edges, rejects cycles and guards explicit completion', async ({ request }) => {
  const projectId = await coverageProject(request), a = await create(request, projectId), b = await create(request, projectId), c = await create(request, projectId);
  const addArgs = async (issueId: string, blockerId: string) => { const issue = await read(request, issueId); return { issueId, blockerId, expectedIssueRevision: issue.summary.revision, expectedGraphRevision: issue.graphRevision, retryReference: crypto.randomUUID() }; };
  const add = async (issueId: string, blockerId: string) => (await success(request, 'add_dependency', await addArgs(issueId, blockerId), zSavedDependencyView)).result;
  const edge = await mcpCase('UC-REL-0036', async () => { const value = await add(a.summary.id, b.summary.id); expect(value.dependent.id).toBe(a.summary.id); expect(value.blocker.id).toBe(b.summary.id); expect(value.removed).toBe(false); expect((await read(request, a.summary.id)).summary.unfinishedBlockerCount).toBe(1); return value; });
  await mcpCase('UC-REL-0037', async () => { const inverse = await success(request, 'list_dependencies', { issueId: b.summary.id, direction: 'blocks' }, zPageDependencyView); expect(inverse.items.map(value => value.dependent.id)).toEqual([a.summary.id]); });
  await mcpCase('UC-REL-0050', async () => { await failure(request, 'add_dependency', await addArgs(a.summary.id, a.summary.id)); });
  await mcpCase('UC-REL-0051', async () => { await failure(request, 'add_dependency', await addArgs(b.summary.id, a.summary.id)); });
  await add(b.summary.id, c.summary.id);
  await mcpCase('UC-REL-0052', async () => { await failure(request, 'add_dependency', await addArgs(c.summary.id, a.summary.id)); });
  await mcpCase('UC-REL-0080', async () => { const args = await addArgs(a.summary.id, c.summary.id); await failure(request, 'add_dependency', { ...args, expectedGraphRevision: '1' }, 'conflict'); expect((await success(request, 'list_dependencies', { issueId: a.summary.id, direction: 'blocked_by' }, zPageDependencyView)).items.map(value => value.blocker.id)).toEqual([b.summary.id]); });
  const stages = await success(request, 'list_workflow_stages', { projectId, workflowId: a.summary.workflow.id, page: { limit: 100 } }, zPageStageView), done = stages.items.find(value => value.category === 'done')!;
  await mcpCase('UC-REL-0049', async () => { const current = await read(request, a.summary.id); await failure(request, 'move_issue_v2', { issueId: a.summary.id, expectedRevision: current.summary.revision, targetStageId: done.id, retryReference: crypto.randomUUID() }, 'prerequisite_unfinished'); expect((await read(request, a.summary.id)).summary.stage.category).toBe('todo'); });
  await move(request, await read(request, c.summary.id), 'done');
  await mcpCase('UC-REL-0046', async () => { await move(request, await read(request, b.summary.id), 'done'); expect((await read(request, a.summary.id)).summary.unfinishedBlockerCount).toBe(0); expect((await read(request, a.summary.id)).summary.stage.category).toBe('todo'); });
  await mcpCase('UC-REL-0047', async () => { await move(request, await read(request, b.summary.id), 'todo'); expect((await read(request, a.summary.id)).summary.unfinishedBlockerCount).toBe(1); });
  await move(request, await read(request, b.summary.id), 'done');
  await mcpCase('UC-REL-0048', async () => { const completed = await move(request, await read(request, a.summary.id), 'done'); expect(completed.summary.stage.category).toBe('done'); });
  await mcpCase('UC-REL-0042', async () => { const current = await read(request, a.summary.id); const removed = await success(request, 'remove_dependency', { issueId: a.summary.id, blockerId: b.summary.id, expectedIssueRevision: current.summary.revision, expectedGraphRevision: current.graphRevision, expectedDependencyRevision: edge.revision, retryReference: crypto.randomUUID() }, zSavedDependencyView); expect(removed.result.removed).toBe(true); const page = await success(request, 'list_dependencies', { issueId: a.summary.id, direction: 'blocked_by' }, zPageDependencyView); expect(page.items).toEqual([]); });
  const other = await coverageProject(request), foreign = await create(request, other);
  await mcpCase('UC-REL-0055', async () => { await failure(request, 'add_dependency', await addArgs(a.summary.id, foreign.summary.id), 'unavailable_record'); });
});

test('MCP related links retain symmetric/directional endpoints and reject unsafe targets', async ({ request }) => {
  const projectId = await coverageProject(request), a = await create(request, projectId), b = await create(request, projectId);
  const args = async (targetId: string, kind: string, enabled: boolean) => ({ issueId: a.summary.id, expectedRevision: (await read(request, a.summary.id)).summary.revision, targetId, kind, enabled, retryReference: crypto.randomUUID() });
  for (const row of [{ kind: 'relates_to', add: 'UC-REL-0066', remove: 'UC-REL-0068' }, { kind: 'duplicates', add: 'UC-REL-0067', remove: 'UC-REL-0069' }]) {
    await mcpCase(row.add, async () => { await success(request, 'set_issue_link', await args(b.summary.id, row.kind, true), zSavedIssueView); const left = await read(request, a.summary.id), right = await read(request, b.summary.id); expect(left.links).toHaveLength(1); expect(right.links).toHaveLength(1); const forward = left.links[0]!, inverse = right.links[0]!; expect(new Set([forward.issueId, forward.targetId])).toEqual(new Set([a.summary.id, b.summary.id])); expect({ issueId: inverse.issueId, targetId: inverse.targetId, kind: inverse.kind }).toEqual({ issueId: forward.issueId, targetId: forward.targetId, kind: row.kind }); expect(forward).toMatchObject({ kind: row.kind, key: b.summary.key, title: b.summary.title }); expect(inverse).toMatchObject({ kind: row.kind, key: a.summary.key, title: a.summary.title }); if (row.kind === 'duplicates') expect(forward).toMatchObject({ issueId: a.summary.id, targetId: b.summary.id }); });
    await mcpCase(row.remove, async () => { await success(request, 'set_issue_link', await args(b.summary.id, row.kind, false), zSavedIssueView); expect((await read(request, a.summary.id)).links).toEqual([]); expect((await read(request, b.summary.id)).links).toEqual([]); });
  }
  await mcpCase('UC-REL-0071', async () => { await failure(request, 'set_issue_link', await args(a.summary.id, 'relates_to', true)); });
  await mcpCase('UC-REL-0073', async () => { await invalidParameters(request, 'set_issue_link', await args(b.summary.id, 'blocks', true)); });
  const other = await coverageProject(request), foreign = await create(request, other);
  await mcpCase('UC-REL-0072', async () => { await failure(request, 'set_issue_link', await args(foreign.summary.id, 'relates_to', true)); expect((await read(request, a.summary.id)).links).toEqual([]); });
});

test('MCP asset types preserve original names and exact private bytes through resumable publication', async ({ request }) => {
  const projectId = await coverageProject(request), issue = await create(request, projectId);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGN8tsWNgYGBiYGBgYGBAQAXSgHkeDr16gAAAABJRU5ErkJggg==', 'base64');
  const matrix = [
    { id: 'UC-AST-0083', filename: 'mcp-small.png', kind: 'image', mimeType: 'image/png', bytes: png },
    { id: 'UC-AST-0016', filename: 'mcp-manual.pdf', kind: 'file', mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF') },
    { id: 'UC-AST-0017', filename: 'mcp-notes.txt', kind: 'file', mimeType: 'text/plain', bytes: Buffer.from('Exact MCP notes العربية') },
    { id: 'UC-AST-0018', filename: 'mcp-issues.csv', kind: 'file', mimeType: 'text/csv', bytes: Buffer.from('title,owner\nReview,Developer\n') },
    { id: 'UC-AST-0019', filename: 'mcp-document.docx', kind: 'file', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: await coverageOfficeFile('docx') },
    { id: 'UC-AST-0020', filename: 'mcp-spreadsheet.xlsx', kind: 'file', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: await coverageOfficeFile('xlsx') },
    { id: 'UC-AST-0021', filename: 'mcp-opaque.bin', kind: 'file', mimeType: 'application/octet-stream', bytes: Buffer.from([0, 255, 12, 13, 255]) },
    { id: 'UC-AST-0055', filename: 'متطلبات الفريق.txt', kind: 'file', mimeType: 'text/plain', bytes: Buffer.from('محتوى عربي') },
  ];
  let publishedId = '';
  for (const row of matrix) await mcpCase(row.id, async () => {
    const session = (await success(request, 'start_asset_upload', { issueId: issue.summary.id, expectedBytes: String(row.bytes.length), checksum: createHash('sha256').update(row.bytes).digest('hex'), metadata: { kind: row.kind, mimeType: row.mimeType, filename: row.filename, description: '', publication: 'issue' }, retryReference: crypto.randomUUID() }, zSavedUploadSessionView)).result;
    await success(request, 'append_asset_chunk', { sessionId: session.sessionId, offset: '0', dataBase64: row.bytes.toString('base64'), retryReference: crypto.randomUUID() }, zSavedUploadSessionView);
    const saved = await success(request, 'finalize_asset_upload', { sessionId: session.sessionId, retryReference: crypto.randomUUID() }, zSavedAssetView); publishedId = saved.result.id;
    expect(saved.result.filename).toBe(row.filename); expect(saved.result.byteSize).toBe(String(row.bytes.length)); expect(saved.result.state).toBe('published');
    const chunk = await success(request, 'download_asset_chunk', { assetId: publishedId, offset: '0', count: '1048576' }, zAssetChunk, 'viewer'); expect(Buffer.from(chunk.dataBase64, 'base64')).toEqual(row.bytes); expect(chunk.terminal).toBe(true);
  });
  await mcpCase('UC-AST-0078', async () => { const metadata = await success(request, 'get_asset', { assetId: publishedId }, zAssetView, 'viewer'), chunk = await success(request, 'download_asset_chunk', { assetId: publishedId, offset: '0', count: '1048576' }, zAssetChunk, 'viewer'); expect(metadata.filename).toBe('متطلبات الفريق.txt'); expect(Buffer.from(chunk.dataBase64, 'base64')).toEqual(matrix.at(-1)!.bytes); });
  await mcpCase('UC-AST-0074', async () => { const chunk = await success(request, 'download_asset_chunk', { assetId: publishedId, offset: '0', count: '4' }, zAssetChunk, 'viewer'); expect(chunk.offset).toBe('0'); expect(Buffer.from(chunk.dataBase64, 'base64')).toEqual(matrix.at(-1)!.bytes.subarray(0, 4)); expect(chunk.terminal).toBe(false); });
  await mcpCase('UC-AST-0073', async () => { const saved = await success(request, 'upload_asset', { issueId: issue.summary.id, metadata: { kind: 'file', filename: 'mcp-direct.txt', mimeType: 'text/plain', description: '', publication: 'issue' }, dataBase64: Buffer.from('Direct upload').toString('base64'), retryReference: crypto.randomUUID() }, zSavedAssetView); expect(saved.result.state).toBe('published'); expect(saved.result.byteSize).toBe('13'); });
  for (const row of [{ id: 'UC-AST-0049', kind: 'image', filename: 'invalid.png', mimeType: 'image/png' }, { id: 'UC-AST-0050', kind: 'file', filename: 'invalid.pdf', mimeType: 'application/pdf' }]) await mcpCase(row.id, async () => { const before = await success(request, 'list_assets', { issueId: issue.summary.id }, zPageAssetView); await failure(request, 'upload_asset', { issueId: issue.summary.id, metadata: { kind: row.kind, filename: row.filename, mimeType: row.mimeType, description: '', publication: 'issue' }, dataBase64: Buffer.from('Invalid typed content').toString('base64'), retryReference: crypto.randomUUID() }); expect((await success(request, 'list_assets', { issueId: issue.summary.id }, zPageAssetView)).totalMatching).toBe(before.totalMatching); });
});

test('MCP resumable sessions enforce ownership, offsets, chunk alignment, checksums and once-only publication', async ({ request }) => {
  const projectId = await coverageProject(request), issue = await create(request, projectId), bytes = Buffer.from('MCP resumable bytes العربية');
  const metadata = { kind: 'file', filename: 'resume.txt', mimeType: 'text/plain', description: '', publication: 'issue' };
  const start = (checksum = createHash('sha256').update(bytes).digest('hex'), expectedBytes = String(bytes.length)) => success(request, 'start_asset_upload', { issueId: issue.summary.id, metadata, expectedBytes, checksum, retryReference: crypto.randomUUID() }, zSavedUploadSessionView);
  await mcpCase('UC-AST-0056', async () => { const policy = await success(request, 'get_asset_policy', {}, zAssetPolicy); expect(policy.chunkBytes).toBe('1048576'); expect(BigInt(policy.maximumFileBytes)).toBeGreaterThan(0n); expect(BigInt(policy.maximumImageBytes)).toBeGreaterThan(0n); });
  const session = await mcpCase('UC-AST-0057', async () => { const saved = await start(); expect(saved.result.issueId).toBe(issue.summary.id); expect(saved.result.receivedBytes).toBe('0'); expect(saved.result.state).toBe('uploading'); expect(saved.result.expectedBytes).toBe(String(bytes.length)); return saved.result; });
  await mcpCase('UC-AST-0058', async () => { const current = await success(request, 'get_asset_upload', { sessionId: session.sessionId }, zUploadSessionView); expect(current.sessionId).toBe(session.sessionId); expect(current.receivedBytes).toBe('0'); });
  await mcpCase('UC-AST-0071', async () => { await failure(request, 'get_asset_upload', { sessionId: session.sessionId }, 'unavailable_record', 'owner'); await failure(request, 'append_asset_chunk', { sessionId: session.sessionId, offset: '0', dataBase64: bytes.toString('base64'), retryReference: crypto.randomUUID() }, 'unavailable_record', 'owner'); });
  await mcpCase('UC-AST-0069', async () => { await failure(request, 'finalize_asset_upload', { sessionId: session.sessionId, retryReference: crypto.randomUUID() }); expect((await success(request, 'list_assets', { issueId: issue.summary.id }, zPageAssetView)).items).toEqual([]); });
  await mcpCase('UC-AST-0065', async () => { await failure(request, 'append_asset_chunk', { sessionId: session.sessionId, offset: '1', dataBase64: bytes.toString('base64'), retryReference: crypto.randomUUID() }); expect((await success(request, 'get_asset_upload', { sessionId: session.sessionId }, zUploadSessionView)).receivedBytes).toBe('0'); });
  const chunkInput = { sessionId: session.sessionId, offset: '0', dataBase64: bytes.toString('base64'), retryReference: crypto.randomUUID() };
  await mcpCase('UC-AST-0059', async () => { const saved = await success(request, 'append_asset_chunk', chunkInput, zSavedUploadSessionView); expect(saved.result.receivedBytes).toBe(String(bytes.length)); });
  await mcpCase('UC-AST-0062', async () => { const replay = await success(request, 'append_asset_chunk', chunkInput, zSavedUploadSessionView); expect(replay.receipt.replayed).toBe(true); expect(replay.result.receivedBytes).toBe(String(bytes.length)); });
  const finalize = { sessionId: session.sessionId, retryReference: crypto.randomUUID() };
  const asset = await mcpCase('UC-AST-0060', async () => { const saved = await success(request, 'finalize_asset_upload', finalize, zSavedAssetView); expect(saved.result.byteSize).toBe(String(bytes.length)); expect(saved.result.id).toBe(session.assetId); return saved.result; });
  await mcpCase('UC-AST-0063', async () => { const replay = await success(request, 'finalize_asset_upload', finalize, zSavedAssetView); expect(replay.receipt.replayed).toBe(true); expect(replay.result.id).toBe(asset.id); expect((await success(request, 'list_assets', { issueId: issue.summary.id }, zPageAssetView)).totalMatching).toBe(1); });
  await mcpCase('UC-AST-0064', async () => { const committed = await success(request, 'get_asset_upload', { sessionId: session.sessionId }, zUploadSessionView); expect(committed.state).toBe('committed'); expect(committed.assetId).toBe(asset.id); expect((await success(request, 'get_asset', { assetId: committed.assetId }, zAssetView)).byteSize).toBe(String(bytes.length)); });
  await mcpCase('UC-AST-0072', async () => { await failure(request, 'cancel_asset_upload', { sessionId: session.sessionId, retryReference: crypto.randomUUID() }); expect((await success(request, 'get_asset', { assetId: asset.id }, zAssetView)).state).toBe('published'); });
  const cancelSession = (await start()).result;
  await mcpCase('UC-AST-0061', async () => { const canceled = await success(request, 'cancel_asset_upload', { sessionId: cancelSession.sessionId, retryReference: crypto.randomUUID() }, zSavedUploadSessionView); expect(canceled.result.state).toBe('canceled'); await failure(request, 'finalize_asset_upload', { sessionId: cancelSession.sessionId, retryReference: crypto.randomUUID() }); });
  const bad = (await start('0'.repeat(64))).result;
  await success(request, 'append_asset_chunk', { sessionId: bad.sessionId, offset: '0', dataBase64: bytes.toString('base64'), retryReference: crypto.randomUUID() }, zSavedUploadSessionView);
  await mcpCase('UC-AST-0068', async () => { await failure(request, 'finalize_asset_upload', { sessionId: bad.sessionId, retryReference: crypto.randomUUID() }); expect((await success(request, 'list_assets', { issueId: issue.summary.id }, zPageAssetView)).items.some(value => value.id === bad.assetId)).toBe(false); });
  const unaligned = (await start(createHash('sha256').update(bytes).digest('hex'), '1048576')).result;
  await mcpCase('UC-AST-0067', async () => { await failure(request, 'append_asset_chunk', { sessionId: unaligned.sessionId, offset: '0', dataBase64: Buffer.from('unaligned').toString('base64'), retryReference: crypto.randomUUID() }); expect((await success(request, 'get_asset_upload', { sessionId: unaligned.sessionId }, zUploadSessionView)).receivedBytes).toBe('0'); });
  await mcpCase('UC-AST-0066', async () => { await invalidParameters(request, 'append_asset_chunk', { sessionId: unaligned.sessionId, offset: '0', dataBase64: Buffer.alloc(1048577).toString('base64'), retryReference: crypto.randomUUID() }); expect((await success(request, 'get_asset_upload', { sessionId: unaligned.sessionId }, zUploadSessionView)).receivedBytes).toBe('0'); });
});

test('MCP draft assets publish atomically with comments and remain readable after panel detach', async ({ request }) => {
  const projectId = await coverageProject(request), issue = await create(request, projectId);
  const draft = (await success(request, 'upload_asset', { issueId: issue.summary.id, metadata: { kind: 'file', filename: 'private-draft.txt', mimeType: 'text/plain', description: '', publication: 'draft' }, dataBase64: Buffer.from('Private bytes').toString('base64'), retryReference: crypto.randomUUID() }, zSavedAssetView)).result;
  await mcpCase('UC-AST-0039', async () => { await failure(request, 'get_asset', { assetId: draft.id }, 'unavailable_record', 'viewer'); const list = await success(request, 'list_assets', { issueId: issue.summary.id }, zPageAssetView, 'viewer'); expect(list.items.some(value => value.id === draft.id)).toBe(false); });
  await mcpCase('UC-AST-0040', async () => { const saved = await success(request, 'create_comment', { issueId: issue.summary.id, retryReference: crypto.randomUUID(), body: { html: `<p>Reference <a data-attachment-id="${draft.id}" href="/issues/${issue.summary.id}?attachment=${draft.id}">private-draft.txt</a></p>`, pictureIds: [], mentionUserIds: [], attachmentIds: [draft.id] } }, zSavedCommentView); expect(saved.result.attachmentIds).toEqual([draft.id]); const metadata = await success(request, 'get_asset', { assetId: draft.id }, zAssetView, 'viewer'); expect(metadata.state).toBe('published'); expect((await success(request, 'list_assets', { issueId: issue.summary.id }, zPageAssetView, 'viewer')).items.some(value => value.id === draft.id)).toBe(true); });
  await mcpCase('UC-AST-0081', async () => { await failure(request, 'detach_asset', { assetId: draft.id, expectedIssueRevision: '1', retryReference: crypto.randomUUID() }, 'conflict'); expect((await success(request, 'get_asset', { assetId: draft.id }, zAssetView)).inPanel).toBe(true); });
  await mcpCase('UC-AST-0036', async () => { const current = await read(request, issue.summary.id); const saved = await success(request, 'detach_asset', { assetId: draft.id, expectedIssueRevision: current.summary.revision, retryReference: crypto.randomUUID() }, zSavedAssetView); expect(saved.result.inPanel).toBe(false); expect((await success(request, 'list_assets', { issueId: issue.summary.id }, zPageAssetView)).items.some(value => value.id === draft.id)).toBe(false); });
  await mcpCase('UC-AST-0038', async () => { const metadata = await success(request, 'get_asset', { assetId: draft.id }, zAssetView, 'viewer'), chunk = await success(request, 'download_asset_chunk', { assetId: draft.id, offset: '0', count: '1048576' }, zAssetChunk, 'viewer'); expect(metadata.state).toBe('published'); expect(metadata.inPanel).toBe(false); expect(Buffer.from(chunk.dataBase64, 'base64').toString()).toBe('Private bytes'); });
});

test('MCP saved searches persist exact private filters and reject stale or conflicting edits', async ({ request }) => {
  const projectId = await coverageProject(request), searchId = crypto.randomUUID(), name = 'MCP saved ' + searchId.slice(0, 8);
  const filters: IssueFilter = { projectIds: [projectId], query: 'عربي', statuses: ['todo', 'review'], priorities: ['high', 'low'], assignee: { kind: 'self' }, dueFrom: '2028-01-01', dueTo: '2028-12-31', blocked: false, backlog: true, sort: 'due' };
  const input = { searchId, expectedRevision: '0', name, filters, retryReference: crypto.randomUUID() };
  let saved = await mcpCase('UC-ISS-0144', async () => { const value = await success(request, 'save_issue_search', input, zSavedSavedSearch); expect(value.result.id).toBe(searchId); expect(value.result.name).toBe(name); return value.result; });
  await mcpCase('UC-ISS-0192', async () => { const listed = await success(request, 'list_saved_searches', {}, zSavedSearchList), value = listed.items.find(row => row.id === searchId)!; expect(value.filters.projectIds).toEqual([projectId]); expect(new Set(value.filters.statuses)).toEqual(new Set(filters.statuses)); expect(new Set(value.filters.priorities)).toEqual(new Set(filters.priorities)); expect(value.filters).toMatchObject({ query: filters.query, assignee: filters.assignee, dueFrom: filters.dueFrom, dueTo: filters.dueTo, blocked: false, backlog: true, sort: 'due' }); });
  await mcpCase('UC-ISS-0156', async () => { const other = await success(request, 'list_saved_searches', {}, zSavedSearchList, 'viewer'); expect(other.items.some(row => row.id === searchId)).toBe(false); await failure(request, 'save_issue_search', { ...input, expectedRevision: saved.revision, retryReference: crypto.randomUUID() }, 'validation_failed', 'viewer'); });
  for (const row of [{ id: 'UC-ISS-0152', name: ' ' }, { id: 'UC-ISS-0153', name: 'x'.repeat(81) }]) await mcpCase(row.id, async () => { await invalidParameters(request, 'save_issue_search', { ...input, searchId: crypto.randomUUID(), name: row.name, retryReference: crypto.randomUUID() }); });
  await mcpCase('UC-ISS-0154', async () => { await failure(request, 'save_issue_search', { ...input, searchId: crypto.randomUUID(), retryReference: crypto.randomUUID() }); expect((await success(request, 'list_saved_searches', {}, zSavedSearchList)).items.filter(row => row.id === searchId)).toHaveLength(1); });
  await mcpCase('UC-ISS-0147', async () => { const renamed = await success(request, 'save_issue_search', { ...input, expectedRevision: saved.revision, name: name + ' renamed', retryReference: crypto.randomUUID() }, zSavedSavedSearch); expect(renamed.result.name).toBe(name + ' renamed'); expect(renamed.result.filters).toEqual(saved.filters); saved = renamed.result; });
  await mcpCase('UC-ISS-0146', async () => { const changed = await success(request, 'save_issue_search', { ...input, expectedRevision: saved.revision, name: saved.name, filters: { projectIds: [projectId], query: 'Replacement exact' }, retryReference: crypto.randomUUID() }, zSavedSavedSearch); expect(changed.result.filters.query).toBe('Replacement exact'); expect(changed.result.filters.statuses).toBeUndefined(); saved = changed.result; });
  await mcpCase('UC-ISS-0195', async () => { await failure(request, 'save_issue_search', { ...input, expectedRevision: '1', retryReference: crypto.randomUUID() }); expect((await success(request, 'list_saved_searches', {}, zSavedSearchList)).items.find(row => row.id === searchId)?.filters).toEqual(saved.filters); });
  await mcpCase('UC-ISS-0148', async () => { await success(request, 'save_issue_search', { ...input, expectedRevision: saved.revision, name: saved.name, filters: saved.filters, removed: true, retryReference: crypto.randomUUID() }, zSavedSavedSearch); expect((await success(request, 'list_saved_searches', {}, zSavedSearchList)).items.some(row => row.id === searchId)).toBe(false); });
});

async function reviewFixture(request: APIRequestContext, policy: Partial<TransitionPolicy> = {}) {
  const projectId = await coverageProject(request), issue = await create(request, projectId);
  const targets = await success(request, 'list_issue_transitions_v2', { issueId: issue.summary.id }, zPageIssueTransitionOption), edge = targets.items.find(value => value.stage.category === 'review')!;
  if (!edge.transitionId) throw new Error('Missing current MCP review transition');
  const cfg = await success(request, 'get_project_configuration', { projectId }, zConfigurationView);
  await success(request, 'save_transition_policy', { projectId, workflowId: issue.summary.workflow.id, transitionId: edge.transitionId, expectedRevision: cfg.revision, policy: { requiredSystemFields: [], requiredFieldIds: [], approvalsRequired: 1, approverRole: 'member', excludeIssueReporter: false, ...policy }, retryReference: crypto.randomUUID() }, zSavedTransitionPolicyView, 'owner');
  const context = () => success(request, 'get_issue_approvals', { issueId: issue.summary.id, transitionId: edge.transitionId }, zApprovalContextView);
  const initial = await context();
  const initialTargets = await success(request, 'list_issue_transitions_v2', { issueId: issue.summary.id }, zPageIssueTransitionOption);
  const revisionFields = (value: ApprovalContextView = initial) => ({ expectedRevision: value.issueRevision, expectedWorkflowRevision: value.workflowRevision, expectedConfigurationRevision: value.configurationRevision });
  const vote = (decision: 'approve' | 'reject', role = 'member', value = initial) => success(request, 'vote_issue_approval', { issueId: issue.summary.id, transitionId: edge.transitionId, ...revisionFields(value), decision, retryReference: crypto.randomUUID() }, zSavedApprovalContextView, role);
  return { projectId, issue, edge, initial, initialTargets, context, revisionFields, vote };
}

test('MCP review decisions count distinct reviewers, remain immutable and gate explicit moves', async ({ request }) => {
  const f = await reviewFixture(request, { approvalsRequired: 2 });
  const action = { issueId: f.issue.summary.id, transitionId: f.edge.transitionId, ...f.revisionFields() };
  await mcpCase('UC-APR-0060', async () => { expect(f.initial.required).toBe(2); expect(f.initial.approved).toBe(0); expect(f.initial.reviewSatisfied).toBe(false); });
  await mcpCase('UC-APR-0002', async () => { const current = await f.context(); expect(current.currentContext).toBe(true); expect(current.canVote).toBe(true); expect(current.votes).toEqual([]); expect((await read(request, f.issue.summary.id)).summary.stage.category).toBe('todo'); });
  await mcpCase('UC-APR-0020', async () => { await failure(request, 'move_issue_v2', { issueId: f.issue.summary.id, expectedRevision: f.issue.summary.revision, targetStageId: f.edge.stage.id, retryReference: crypto.randomUUID() }); expect((await read(request, f.issue.summary.id)).summary.stage.category).toBe('todo'); });
  await mcpCase('UC-APR-0012', async () => { await Promise.all([f.vote('approve'), f.vote('approve', 'owner')]); const current = await f.context(); expect(current.approved).toBe(2); expect(new Set(current.votes.map(value => value.approver.id)).size).toBe(2); expect((await read(request, f.issue.summary.id)).summary.revision).toBe(f.issue.summary.revision); });
  await mcpCase('UC-APR-0007', async () => { const current = await f.context(); expect(current.votes).toHaveLength(2); for (const vote of current.votes) { expect(vote.decision).toBe('approve'); expect(vote.decidedAt).toBeTruthy(); expect(vote.issueRevision).toBe(f.initial.issueRevision); expect(vote.workflowRevision).toBe(f.initial.workflowRevision); expect(vote.configurationRevision).toBe(f.initial.configurationRevision); } });
  await mcpCase('UC-APR-0013', async () => { const current = await f.context(); expect(current.reviewSatisfied).toBe(true); expect(current.rejected).toBe(false); });
  await mcpCase('UC-APR-0010', async () => { const repeated = await f.vote('approve'); expect(repeated.receipt.eventId).toBeNull(); expect(repeated.result.approved).toBe(2); expect(repeated.result.votes).toHaveLength(2); expect((await read(request, f.issue.summary.id)).summary.revision).toBe(f.issue.summary.revision); });
  await mcpCase('UC-APR-0011', async () => { await failure(request, 'vote_issue_approval', { ...action, decision: 'reject', retryReference: crypto.randomUUID() }); expect((await f.context()).rejected).toBe(false); });
  for (const row of [{ id: 'UC-APR-0040', override: { expectedRevision: '999999' } }, { id: 'UC-APR-0041', override: { expectedWorkflowRevision: '999999' } }, { id: 'UC-APR-0042', override: { expectedConfigurationRevision: '999999' } }]) await mcpCase(row.id, async () => { await failure(request, 'vote_issue_approval', { ...action, ...row.override, decision: 'approve', retryReference: crypto.randomUUID() }, 'conflict'); expect((await f.context()).approved).toBe(2); });
  await mcpCase('UC-APR-0066', async () => { const before = f.initialTargets.items.find(value => value.transitionId === f.edge.transitionId)!; expect(before.requiresApproval).toBe(true); expect(before.reviewSatisfied).toBe(false); const targets = await success(request, 'list_issue_transitions_v2', { issueId: f.issue.summary.id }, zPageIssueTransitionOption); const current = targets.items.find(value => value.transitionId === f.edge.transitionId)!; expect(current.canRequest).toBe(true); expect(current.reviewSatisfied).toBe(true); });
  await mcpCase('UC-APR-0062', async () => { const prior = await read(request, f.issue.summary.id); expect(prior.summary.stage.category).toBe('todo'); const moved = await move(request, prior, 'review'); expect(moved.summary.stage.id).toBe(f.edge.stage.id); });
  await mcpCase('UC-APR-0063', async () => { const old = await f.context(); expect(old.currentContext).toBe(false); expect(old.canVote).toBe(false); expect(old.votes).toHaveLength(2); });
  await mcpCase('UC-APR-0045', async () => { const current = await f.context(); const body = { ...action, ...f.revisionFields(current), retryReference: crypto.randomUUID() }; await failure(request, 'vote_issue_approval', { ...body, decision: 'approve' }); await failure(request, 'resubmit_issue_approval', { ...body, retryReference: crypto.randomUUID() }); expect((await f.context()).votes).toHaveLength(2); });
});

test('MCP rejection veto, resubmission and content revisions preserve immutable review history', async ({ request }) => {
  const f = await reviewFixture(request), action = { issueId: f.issue.summary.id, transitionId: f.edge.transitionId, ...f.revisionFields() };
  const input = { ...action, decision: 'reject', retryReference: crypto.randomUUID() };
  await mcpCase('UC-APR-0061', async () => { const rejected = await success(request, 'vote_issue_approval', input, zSavedApprovalContextView); expect(rejected.result.rejected).toBe(true); expect(rejected.result.reviewSatisfied).toBe(false); expect(rejected.result.votes[0]?.decision).toBe('reject'); });
  await mcpCase('UC-APR-0067', async () => { const replay = await success(request, 'vote_issue_approval', input, zSavedApprovalContextView); expect(replay.receipt.replayed).toBe(true); expect(replay.result.votes).toHaveLength(1); });
  await mcpCase('UC-APR-0014', async () => { await f.vote('approve', 'owner'); const current = await f.context(); expect(current.approved).toBe(1); expect(current.rejected).toBe(true); expect(current.reviewSatisfied).toBe(false); });
  await mcpCase('UC-APR-0021', async () => { await failure(request, 'move_issue_v2', { issueId: f.issue.summary.id, expectedRevision: f.issue.summary.revision, targetStageId: f.edge.stage.id, retryReference: crypto.randomUUID() }); expect((await read(request, f.issue.summary.id)).summary.stage.category).toBe('todo'); });
  await mcpCase('UC-APR-0015', async () => { const fresh = await success(request, 'resubmit_issue_approval', { ...action, retryReference: crypto.randomUUID() }, zSavedApprovalContextView); expect(BigInt(fresh.result.issueRevision)).toBe(BigInt(f.initial.issueRevision) + 1n); expect(fresh.result.approved).toBe(0); expect(fresh.result.rejected).toBe(false); expect(fresh.result.votes).toHaveLength(2); expect(fresh.result.votes.every(value => !value.current)).toBe(true); });
  await mcpCase('UC-APR-0016', async () => { const current = await f.context(); const accepted = await f.vote('approve', 'member', current); expect(accepted.result.reviewSatisfied).toBe(true); expect(accepted.result.votes.filter(value => value.current)).toHaveLength(1); expect(accepted.result.votes.find(value => value.current)?.issueRevision).toBe(current.issueRevision); });
  await mcpCase('UC-APR-0064', async () => { const current = await f.context(); expect(current.votes.filter(value => value.current && value.eligible)).toHaveLength(1); expect(current.votes.filter(value => !value.current)).toHaveLength(2); });
  await mcpCase('UC-APR-0037', async () => { const issue = await read(request, f.issue.summary.id); await success(request, 'patch_issue_field_v2', { issueId: issue.summary.id, field: 'dueDate', dueDate: { prior: issue.summary.dueDate, value: '2028-04-01' }, retryReference: crypto.randomUUID() }, zSavedModernIssueView); const current = await f.context(); expect(current.approved).toBe(0); expect(current.reviewSatisfied).toBe(false); expect(current.votes.every(value => !value.current)).toBe(true); });
});

test('MCP custom-value validation rejects malformed batches atomically and canonicalizes exact decimals', async ({ request }) => {
  const projectId = await coverageProject(request);
  const number = await coverageDefinition(request, projectId, { kind: 'number' });
  const text = await coverageDefinition(request, projectId, { kind: 'text' });
  const date = await coverageDefinition(request, projectId, { kind: 'date' });
  const marker = await coverageDefinition(request, projectId, { kind: 'text' });
  const issue = await create(request, projectId);
  const invalid = [
    { id: 'UC-FLD-0024', fieldId: number.id, value: { kind: 'number', number: 123 } },
    { id: 'UC-FLD-0025', fieldId: number.id, value: { kind: 'number', number: '1'.repeat(29) } },
    { id: 'UC-FLD-0026', fieldId: number.id, value: { kind: 'number', number: '0.12345678901' } },
    { id: 'UC-FLD-0027', fieldId: number.id, value: { kind: 'number', number: '1e3' } },
    { id: 'UC-FLD-0075', fieldId: number.id, value: { kind: 'number', number: '--1' } },
    { id: 'UC-FLD-0029', fieldId: text.id, value: { kind: 'text', text: 'x'.repeat(5001) } },
    { id: 'UC-FLD-0030', fieldId: date.id, value: { kind: 'date', date: '2027-02-29' } },
    { id: 'UC-FLD-0031', fieldId: text.id, value: { kind: 'number', number: '1' } },
    { id: 'UC-FLD-0032', fieldId: text.id, value: { kind: 'text', text: 'bad', number: '1' } },
    { id: 'UC-FLD-0033', fieldId: text.id, value: { kind: 'boolean', boolean: true } },
    { id: 'UC-FLD-0067', fieldId: '00000000-0000-0000-0000-000000000000', value: null },
  ];
  for (const row of invalid) await mcpCase(row.id, async () => { await invalidParameters(request, 'save_issue_fields', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, values: [{ fieldId: marker.id, value: { kind: 'text', text: 'Must roll back' } }, { fieldId: row.fieldId, value: row.value }], retryReference: crypto.randomUUID() }); const after = await fields(request, issue.summary.id); expect(after.revision).toBe(issue.summary.revision); expect(after.values).toEqual([]); });
  for (const row of [
    { id: 'UC-FLD-0068', values: [{ fieldId: text.id, value: null }, { fieldId: text.id, value: null }] },
    { id: 'UC-FLD-0069', values: [] },
    { id: 'UC-FLD-0070', values: Array.from({ length: 101 }, () => ({ fieldId: crypto.randomUUID(), value: null })) },
  ]) await mcpCase(row.id, async () => { await invalidParameters(request, 'save_issue_fields', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, values: row.values, retryReference: crypto.randomUUID() }); expect((await fields(request, issue.summary.id)).values).toEqual([]); });
  for (const row of [
    { id: 'UC-FLD-0021', value: '9999999999999999999999999999.1234567890', canonical: '9999999999999999999999999999.123456789' },
    { id: 'UC-FLD-0022', value: '123.4500000000', canonical: '123.45' },
    { id: 'UC-FLD-0023', value: '-0.0000000000', canonical: '0' },
  ]) await mcpCase(row.id, async () => { const current = await read(request, issue.summary.id); const saved = await success(request, 'save_issue_fields', { issueId: issue.summary.id, expectedRevision: current.summary.revision, values: [{ fieldId: number.id, value: { kind: 'number', number: row.value } }], retryReference: crypto.randomUUID() }, zSavedCustomFieldsView); expect(saved.result.values).toContainEqual({ fieldId: number.id, value: { kind: 'number', number: row.canonical } }); });
});

test('MCP defaults, required fields, historical retirement, replay and scope remain independent', async ({ request }) => {
  const projectId = await coverageProject(request);
  let definition = await coverageDefinition(request, projectId, { kind: 'text', defaultValue: { kind: 'text', text: 'MCP default' } });
  for (const row of [
    { id: 'UC-FLD-0003', fieldValues: undefined, expected: [{ fieldId: definition.id, value: definition.defaultValue }] },
    { id: 'UC-FLD-0004', fieldValues: [{ fieldId: definition.id, value: { kind: 'text' as const, text: 'MCP override' } }], expected: [{ fieldId: definition.id, value: { kind: 'text', text: 'MCP override' } }] },
    { id: 'UC-FLD-0005', fieldValues: [{ fieldId: definition.id, value: null }], expected: [] },
  ]) await mcpCase(row.id, async () => { const issue = await create(request, projectId, row.fieldValues ? { fieldValues: row.fieldValues } : {}); expect((await fields(request, issue.summary.id)).values).toEqual(row.expected); });
  let issue = await create(request, projectId);
  const input = { issueId: issue.summary.id, expectedRevision: issue.summary.revision, values: [{ fieldId: definition.id, value: { kind: 'text', text: 'MCP changed' } }], retryReference: crypto.randomUUID() };
  const accepted = await success(request, 'save_issue_fields', input, zSavedCustomFieldsView);
  await mcpCase('UC-FLD-0057', async () => { const replay = await success(request, 'save_issue_fields', input, zSavedCustomFieldsView); expect(replay.receipt.replayed).toBe(true); expect(replay.result.revision).toBe(accepted.result.revision); expect(replay.receipt.eventId).toBe(accepted.receipt.eventId); });
  await mcpCase('UC-FLD-0080', async () => { const conflict = await mcpFailure(request, 'save_issue_fields', { ...input, values: [{ fieldId: definition.id, value: null }], retryReference: crypto.randomUUID() }, zModernIssueFailureBody, 'conflict', 'member'); expect(conflict.current?.summary.id).toBe(issue.summary.id); expect(conflict.current?.summary.revision).toBe(accepted.result.revision); expect((await fields(request, issue.summary.id)).values).toContainEqual(input.values[0]); });
  issue = await read(request, issue.summary.id);
  await mcpCase('UC-FLD-0060', async () => { const saved = await success(request, 'save_issue_fields', { ...input, expectedRevision: issue.summary.revision, retryReference: crypto.randomUUID() }, zSavedCustomFieldsView); expect(saved.result.revision).toBe(issue.summary.revision); expect(saved.receipt.eventId).toBeNull(); });
  definition = await coverageDefinition(request, projectId, { ...definition, retired: true });
  await mcpCase('UC-FLD-0079', async () => { const current = await fields(request, issue.summary.id); expect(current.definitions.find(value => value.id === definition.id)?.retired).toBe(true); expect(current.values).toContainEqual(input.values[0]); });
  await mcpCase('UC-FLD-0049', async () => { const retained = await success(request, 'save_issue_fields', { ...input, expectedRevision: issue.summary.revision, retryReference: crypto.randomUUID() }, zSavedCustomFieldsView); expect(retained.result.revision).toBe(issue.summary.revision); expect(retained.result.values).toContainEqual(input.values[0]); });
  for (const row of [{ id: 'UC-FLD-0050', value: { kind: 'text', text: 'Replacement' } }, { id: 'UC-FLD-0051', value: null }]) await mcpCase(row.id, async () => { await failure(request, 'save_issue_fields', { ...input, expectedRevision: issue.summary.revision, values: [{ fieldId: definition.id, value: row.value }], retryReference: crypto.randomUUID() }); expect((await fields(request, issue.summary.id)).values).toContainEqual(input.values[0]); });
  const requiredProjectId = await coverageProject(request);
  const required = await coverageDefinition(request, requiredProjectId, { kind: 'text', required: true, defaultValue: { kind: 'text', text: 'Required baseline' } });
  const marker = await coverageDefinition(request, requiredProjectId, { kind: 'text' }); issue = await create(request, requiredProjectId);
  for (const row of [{ id: 'UC-FLD-0046', value: null }, { id: 'UC-FLD-0047', value: { kind: 'text', text: '  ' } }]) await mcpCase(row.id, async () => { await failure(request, 'save_issue_fields', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, values: [{ fieldId: required.id, value: row.value }], retryReference: crypto.randomUUID() }); expect((await fields(request, issue.summary.id)).values).toContainEqual({ fieldId: required.id, value: required.defaultValue }); });
  await mcpCase('UC-FLD-0052', async () => { await failure(request, 'save_issue_fields', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, values: [{ fieldId: marker.id, value: { kind: 'text', text: 'Must roll back' } }, { fieldId: required.id, value: null }], retryReference: crypto.randomUUID() }); expect((await fields(request, issue.summary.id)).values.some(value => value.fieldId === marker.id)).toBe(false); });
  const foreignProject = await coverageProject(request), foreign = await coverageDefinition(request, foreignProject, { kind: 'text' });
  await mcpCase('UC-FLD-0066', async () => { await failure(request, 'save_issue_fields', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, values: [{ fieldId: foreign.id, value: { kind: 'text', text: 'Foreign' } }], retryReference: crypto.randomUUID() }, 'unavailable_record'); expect((await fields(request, issue.summary.id)).values.some(value => value.fieldId === foreign.id)).toBe(false); });
  await mcpCase('UC-FLD-0082', async () => { const viewed = await success(request, 'get_issue_fields', { issueId: issue.summary.id }, zCustomFieldsView, 'viewer'); expect(viewed.values).toContainEqual({ fieldId: required.id, value: required.defaultValue }); await failure(request, 'save_issue_fields', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, values: [{ fieldId: marker.id, value: null }], retryReference: crypto.randomUUID() }, 'forbidden', 'viewer'); });
});
