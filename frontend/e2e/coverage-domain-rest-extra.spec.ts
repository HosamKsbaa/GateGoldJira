import { expect, type APIRequestContext } from '@playwright/test';
import { z } from 'zod';
import { test } from './support/browser-test';
import { memberId, viewerId, ownerId } from './support/coverage-access';
import { restSuccess, restFailure, restCase } from './support/coverage-rest';
import { coverageProject, coverageDefinition, coverageIneligiblePeople, coverageStoredChanges, coverageExpireUpload } from './support/coverage-issues';
import { modernEditable } from '../src/app/features/issues/issue-model';
import { apiOrigin, localFixturesAvailable } from './support/session';
import { isolatedProject } from './support/project';
import { layoutFields } from './support/native-boards';
import type { ModernCreateFields, ModernIssueView, IssueFilter, TransitionPolicy, ApprovalContextView, FieldAssignment } from '../src/app/api/generated/types.gen';
import {
  zConfigurationView, zSavedConfigurationView, zSavedTypeSaved, zSavedPrioritySaved,
  zPageTypeView, zPagePriorityView, zModernIssueView, zSavedModernIssueView,
  zSavedWorkflowSaved, zSavedStageSaved, zSavedTransitionSaved, zPageStageView,
  zPageIssueTransitionOption, zPageTransitionView, zPageModernIssueSummary,
  zSavedIssueView, zPageMembershipView, zSavedMembershipView, zCustomFieldsView,
  zSavedCustomFieldsView, zSavedFieldOptionSaved, zSavedBackfillFieldResult,
  zPageUserSummary, zSavedLabelView, zPageDependencyView, zSavedDependencyView,
  zPageIssueSummary, zSavedCommentView, zPageCommentView, zPageNotificationView,
  zApprovalContextView, zSavedApprovalContextView, zSavedTransitionPolicyView,
  zModernIssueFailureBody, zPageActivityView,
  zIssueView, zIssueFailureBody, zSavedMoveResult,
  zProjectView, zSavedProjectView, zPageBoardSummary, zLayoutView, zSavedLayoutView, zSavedNativeMoveResult,
  zSavedAssetView, zAssetView, zPageAssetView, zAssetChunk, zSavedUploadSessionView,
  zUploadSessionView, zSavedSavedSearch, zSavedSearchList,
  zSavedUserView,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires isolated real PostgreSQL and actual OpenAPI HTTP transport.');
test.use({ trace: 'off' });
test.setTimeout(120_000);
const safeError = z.object({ error: z.object({ code: z.string(), message: z.string().min(1) }) });
const success = <S extends z.ZodType>(request: APIRequestContext, name: string, args: object, schema: S, role = 'member') => restSuccess(request, name, args, schema, role);
const rejected = (request: APIRequestContext, name: string, args: object, code = 'validation_failed', role = 'member') => restFailure(request, name, args, safeError, code, role);
const config = (request: APIRequestContext, projectId: string) => success(request, 'get_project_configuration', { projectId }, zConfigurationView);
const read = (request: APIRequestContext, issueId: string) => success(request, 'get_issue_v2', { issueId }, zModernIssueView);
const fields = (request: APIRequestContext, issueId: string) => success(request, 'get_issue_fields', { issueId }, zCustomFieldsView);
const search = (request: APIRequestContext, filters: IssueFilter, limit = 100, cursor?: string) => success(request, 'search_issues_v2', { filters, page: { limit, ...(cursor ? { cursor } : {}) } }, zPageModernIssueSummary);
async function create(request: APIRequestContext, projectId: string, values: Partial<ModernCreateFields> = {}) {
  return (await success(request, 'create_issue_v2', { projectId, title: 'REST additional ' + crypto.randomUUID().slice(0, 8), ...values, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result;
}
async function priority(request: APIRequestContext, projectId: string, priorityId: string, key: string, sortOrder: string, retired = false) {
  return (await success(request, 'save_priority', { projectId, priorityId, expectedRevision: (await config(request, projectId)).revision, key, name: key, sortOrder, retired, retryReference: crypto.randomUUID() }, zSavedPrioritySaved, 'owner')).result.priority;
}
async function type(request: APIRequestContext, projectId: string, typeId: string, key: string, retired = false) {
  return (await success(request, 'save_issue_type', { projectId, typeId, expectedRevision: (await config(request, projectId)).revision, key, name: key, behavior: 'standard', retired, retryReference: crypto.randomUUID() }, zSavedTypeSaved, 'owner')).result.type;
}
async function target(request: APIRequestContext, issue: ModernIssueView, category: string) {
  const page = await success(request, 'list_workflow_stages', { projectId: issue.summary.projectId, workflowId: issue.summary.workflow.id, page: { limit: 100 } }, zPageStageView);
  return page.items.find(value => value.category === category && !value.retired && value.acceptsEntries)!.id;
}
async function move(request: APIRequestContext, issue: ModernIssueView, category: string, role = 'member') {
  return (await success(request, 'move_issue_v2', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, targetStageId: await target(request, issue, category), retryReference: crypto.randomUUID() }, zSavedModernIssueView, role)).result;
}
async function organize(request: APIRequestContext, issueId: string, flags: { archived?: boolean; backlog?: boolean }) {
  const issue = await read(request, issueId);
  await success(request, 'organize_issue', { issueId, expectedRevision: issue.summary.revision, ...flags, retryReference: crypto.randomUUID() }, zSavedIssueView);
  return read(request, issueId);
}
async function removeMember(request: APIRequestContext, projectId: string, userId: string) {
  const list = await success(request, 'list_memberships', { projectId, page: { limit: 100 } }, zPageMembershipView, 'owner'), member = list.items.find(value => value.user.id === userId)!;
  return success(request, 'remove_membership', { projectId, userId, expectedRevision: member.revision, retryReference: crypto.randomUUID() }, zSavedMembershipView, 'owner');
}

test('REST explicit choice identities and workflow bindings enforce current acceptance while retaining history', async ({ request }) => {
  const projectId = await coverageProject(request), initial = await config(request, projectId);
  const story = await type(request, projectId, crypto.randomUUID(), 'story'), urgent = await priority(request, projectId, crypto.randomUUID(), 'urgent', '9007199254740993');
  const created = await restCase('UC-ISS-0005', async () => { const issue = await create(request, projectId, { typeId: story.id, priorityId: urgent.id }); expect(issue.summary.type).toMatchObject({ id: story.id, key: 'story', name: 'story' }); return issue; });
  await restCase('UC-ISS-0007', async () => { expect(created.summary.priority).toMatchObject({ id: urgent.id, key: 'urgent', name: 'urgent' }); });
  const workflowId = crypto.randomUUID();
  await success(request, 'save_workflow', { projectId, workflowId, expectedRevision: (await config(request, projectId)).revision, name: 'Alternative intake', retired: false, retryReference: crypto.randomUUID() }, zSavedWorkflowSaved, 'owner');
  const stages: string[] = [];
  for (const [index, category] of (['todo', 'done'] as const).entries()) { const stageId = crypto.randomUUID(); await success(request, 'save_workflow_stage', { projectId, workflowId, stageId, expectedRevision: (await config(request, projectId)).revision, name: category, category, position: String(index + 1), initial: index === 0, acceptsEntries: true, retired: false, retryReference: crypto.randomUUID() }, zSavedStageSaved, 'owner'); stages.push(stageId); }
  await success(request, 'save_workflow_transition', { projectId, workflowId, transitionId: crypto.randomUUID(), expectedRevision: (await config(request, projectId)).revision, fromStageId: stages[0], toStageId: stages[1], requiredPermission: null, retired: false, retryReference: crypto.randomUUID() }, zSavedTransitionSaved, 'owner');
  const boards = await success(request, 'list_boards', { projectId }, zPageBoardSummary), boardId = boards.items[0]!.id;
  const layout = await success(request, 'get_board_v2', { boardId }, zLayoutView), draft = layoutFields(layout);
  for (const [index, category] of (['todo', 'done'] as const).entries()) {
    const column = layout.columns.find(value => value.stages.some(mapping => mapping.stage.category === category))!;
    draft.columns.find(value => value.id === column.id)!.stageIds.push(stages[index]!);
  }
  await success(request, 'save_board_layout_v2', { boardId, ...draft, retryReference: crypto.randomUUID() }, zSavedLayoutView, 'owner');
  // The binding compares the current project configuration revision.
  await success(request, 'set_type_workflow_binding', { projectId, typeId: story.id, workflowId, expectedRevision: (await config(request, projectId)).revision, default: false, acceptsNew: true, retryReference: crypto.randomUUID() }, zSavedConfigurationView, 'owner');
  const alternative = await restCase('UC-ISS-0009', async () => { const issue = await create(request, projectId, { typeId: story.id, workflowId }); expect(issue.summary.workflow.id).toBe(workflowId); expect(issue.summary.stage.id).toBe(stages[0]); expect(issue.summary.stage.initial).toBe(true); return issue; });
  const input = { projectId, title: 'Replay original choices', retryReference: crypto.randomUUID() }, first = await success(request, 'create_issue_v2', input, zSavedModernIssueView);
  await restCase('UC-ISS-0023', async () => { await success(request, 'set_project_defaults', { projectId, expectedRevision: (await config(request, projectId)).revision, defaults: { ...initial.defaults, priorityId: urgent.id }, retryReference: crypto.randomUUID() }, zSavedConfigurationView, 'owner'); const replay = await success(request, 'create_issue_v2', input, zSavedModernIssueView); expect(replay.receipt.replayed).toBe(true); expect(replay.result.summary.priority.id).toBe(first.result.summary.priority.id); expect(replay.result.summary.type.id).toBe(first.result.summary.type.id); expect(replay.result.summary.workflow.id).toBe(first.result.summary.workflow.id); expect((await create(request, projectId)).summary.priority.id).toBe(urgent.id); });
  await success(request, 'set_project_defaults', { projectId, expectedRevision: (await config(request, projectId)).revision, defaults: initial.defaults, retryReference: crypto.randomUUID() }, zSavedConfigurationView, 'owner');
  await success(request, 'set_type_workflow_binding', { projectId, typeId: story.id, workflowId, expectedRevision: (await config(request, projectId)).revision, default: false, acceptsNew: false, retryReference: crypto.randomUUID() }, zSavedConfigurationView, 'owner');
  await restCase('UC-ISS-0028', async () => { await rejected(request, 'create_issue_v2', { projectId, title: 'Closed binding', typeId: story.id, workflowId, retryReference: crypto.randomUUID() }); });
  const incompatible = await type(request, projectId, crypto.randomUUID(), 'incompatible');
  await restCase('UC-ISS-0175', async () => { const custom = await read(request, alternative.summary.id); await rejected(request, 'update_issue_v2', { issueId: custom.summary.id, expectedRevision: custom.summary.revision, editable: { ...modernEditable(custom), typeId: incompatible.id }, retryReference: crypto.randomUUID() }); });
  await restCase('UC-ISS-0174', async () => { const current = await read(request, created.summary.id); await rejected(request, 'update_issue_v2', { issueId: current.summary.id, expectedRevision: current.summary.revision, editable: { ...modernEditable(current), typeId: initial.defaults.subtaskTypeId }, retryReference: crypto.randomUUID() }); expect((await read(request, created.summary.id)).summary.type.behavior).toBe('standard'); });
  await type(request, projectId, story.id, story.key, true); await priority(request, projectId, urgent.id, urgent.key, urgent.sortOrder, true);
  await restCase('UC-ISS-0026', async () => { await rejected(request, 'create_issue_v2', { projectId, title: 'Retired type', typeId: story.id, retryReference: crypto.randomUUID() }); });
  await restCase('UC-ISS-0027', async () => { await rejected(request, 'create_issue_v2', { projectId, title: 'Retired priority', priorityId: urgent.id, retryReference: crypto.randomUUID() }); });
  await restCase('UC-ISS-0176', async () => { const issue = await create(request, projectId); await rejected(request, 'patch_issue_field_v2', { issueId: issue.summary.id, field: 'priorityId', priority: { prior: issue.summary.priority.id, value: urgent.id }, retryReference: crypto.randomUUID() }); expect((await read(request, issue.summary.id)).summary.priority.id).toBe(initial.defaults.priorityId); });
  await restCase('UC-ISS-0111', async () => { const current = await read(request, created.summary.id); const saved = await success(request, 'update_issue_v2', { issueId: current.summary.id, expectedRevision: current.summary.revision, editable: { ...modernEditable(current), title: 'Retained historical identities' }, retryReference: crypto.randomUUID() }, zSavedModernIssueView); expect(saved.result.summary.type.id).toBe(story.id); expect(saved.result.summary.priority.id).toBe(urgent.id); expect(saved.result.summary.workflow.id).toBe(created.summary.workflow.id); });
});

test('REST issue organization, exact ordering and custom-choice filters preserve authorized scope', async ({ request }) => {
  const projectId = await coverageProject(request), otherId = await coverageProject(request);
  const cfg = await config(request, projectId), customType = await type(request, projectId, crypto.randomUUID(), 'discovery');
  const p1 = await priority(request, projectId, crypto.randomUUID(), 'precisionone', '9007199254740993'), p2 = await priority(request, projectId, crypto.randomUUID(), 'precisiontwo', '9007199254740994');
  const a = await create(request, projectId, { title: 'Ordering first', dueDate: '2001-01-01', typeId: customType.id, priorityId: p1.id });
  const b = await create(request, projectId, { title: 'Ordering second', dueDate: '2099-01-01', priorityId: p2.id });
  const c = await create(request, projectId, { title: 'Ordering third' });
  const foreign = await create(request, otherId, { title: 'Ordering foreign' });
  for (const row of [
    { id: 'UC-ISS-0035', filters: { query: '', typeIds: [customType.id] }, ids: [a.summary.id] },
    { id: 'UC-ISS-0036', filters: {}, ids: [a.summary.id, b.summary.id, c.summary.id] },
    { id: 'UC-ISS-0048', filters: { typeIds: [customType.id] }, ids: [a.summary.id] },
    { id: 'UC-ISS-0049', filters: { priorityIds: [p2.id] }, ids: [b.summary.id] },
    { id: 'UC-ISS-0053', filters: { overdue: false }, ids: [b.summary.id, c.summary.id] },
    { id: 'UC-ISS-0060', filters: { archived: false, backlog: false }, ids: [a.summary.id, b.summary.id, c.summary.id] },
  ] satisfies { id: string; filters: IssueFilter; ids: string[] }[]) await restCase(row.id, async () => { const page = await search(request, { projectIds: [projectId], ...row.filters }); expect(page.items.map(value => value.id).sort()).toEqual([...row.ids].sort()); expect(page.totalMatching).toBe(row.ids.length); });
  await restCase('UC-ISS-0064', async () => { expect((await search(request, { projectIds: [projectId], sort: 'created' })).items.map(value => value.id)).toEqual([c.summary.id, b.summary.id, a.summary.id]); });
  await restCase('UC-ISS-0065', async () => { expect((await search(request, { projectIds: [projectId], sort: 'due' })).items.map(value => value.id)).toEqual([a.summary.id, b.summary.id, c.summary.id]); });
  await restCase('UC-ISS-0066', async () => { const page = await search(request, { projectIds: [projectId], sort: 'priority' }); expect(page.items.map(value => value.id)).toEqual([b.summary.id, a.summary.id, c.summary.id]); expect(page.items.slice(0, 2).map(value => value.priority.sortOrder)).toEqual(['9007199254740994', '9007199254740993']); });
  await success(request, 'patch_issue_field_v2', { issueId: a.summary.id, field: 'dueDate', dueDate: { prior: a.summary.dueDate, value: '2001-01-02' }, retryReference: crypto.randomUUID() }, zSavedModernIssueView);
  await restCase('UC-ISS-0063', async () => { const page = await search(request, { projectIds: [projectId], sort: 'updated' }); expect(page.items[0]?.id).toBe(a.summary.id); expect(page.items.every((value, index) => !index || value.updatedAt <= page.items[index - 1]!.updatedAt)).toBe(true); });
  const comment = (await success(request, 'create_comment', { issueId: c.summary.id, body: { html: '<p>Retained history</p>', mentionUserIds: [], pictureIds: [] }, retryReference: crypto.randomUUID() }, zSavedCommentView)).result;
  await restCase('UC-ISS-0112', async () => { const archived = await organize(request, c.summary.id, { archived: true }); expect(archived.summary.archived).toBe(true); expect((await search(request, { projectIds: [projectId] })).items.some(value => value.id === c.summary.id)).toBe(false); const discussion = await success(request, 'list_comments', { issueId: c.summary.id }, zPageCommentView); expect(discussion.items.some(value => value.id === comment.id)).toBe(true); });
  await restCase('UC-ISS-0062', async () => { const archived = await search(request, { projectIds: [projectId], archived: true }); expect(archived.items.map(value => value.id)).toEqual([c.summary.id]); });
  await restCase('UC-ISS-0113', async () => { const restored = await organize(request, c.summary.id, { archived: false }); expect(restored.summary.archived).toBe(false); expect(restored.summary.stage.category).toBe('todo'); expect((await search(request, { projectIds: [projectId] })).items.some(value => value.id === c.summary.id)).toBe(true); });
  await restCase('UC-ISS-0114', async () => { const backlog = await organize(request, c.summary.id, { backlog: true }); expect(backlog.summary.backlog).toBe(true); expect((await search(request, { projectIds: [projectId], backlog: false })).items.some(value => value.id === c.summary.id)).toBe(false); });
  await restCase('UC-ISS-0115', async () => { const active = await organize(request, c.summary.id, { backlog: false }); expect(active.summary.backlog).toBe(false); expect((await search(request, { projectIds: [projectId], backlog: false })).items.some(value => value.id === c.summary.id)).toBe(true); });
  await removeMember(request, otherId, memberId);
  await restCase('UC-ISS-0037', async () => { const page = await search(request, { projectIds: [projectId, otherId], query: 'Ordering' }); expect(new Set(page.items.map(value => value.projectId))).toEqual(new Set([projectId])); expect(page.items.some(value => value.id === foreign.summary.id)).toBe(false); });
  await restCase('UC-ISS-0172', async () => { await rejected(request, 'get_issue_v2', { issueId: foreign.summary.id }, 'unavailable_record'); });
});

test('REST single-field, complete-edit and explicit bulk commands retain each independent result', async ({ request }) => {
  const projectId = await coverageProject(request), cfg = await config(request, projectId), customType = await type(request, projectId, crypto.randomUUID(), 'editable');
  const priorities = await success(request, 'list_priorities', { projectId, page: { limit: 100 } }, zPagePriorityView), high = priorities.items.find(value => value.key === 'high')!;
  let issue = await create(request, projectId);
  await restCase('UC-ISS-0101', async () => { issue = (await success(request, 'patch_issue_field_v2', { issueId: issue.summary.id, field: 'priorityId', priority: { prior: cfg.defaults.priorityId, value: high.id }, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result; expect(issue.summary.priority.id).toBe(high.id); });
  await restCase('UC-ISS-0102', async () => { issue = (await success(request, 'patch_issue_field_v2', { issueId: issue.summary.id, field: 'dueDate', dueDate: { prior: null, value: '2028-05-02' }, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result; expect(issue.summary.dueDate).toBe('2028-05-02'); });
  await restCase('UC-ISS-0103', async () => { issue = (await success(request, 'patch_issue_field_v2', { issueId: issue.summary.id, field: 'dueDate', dueDate: { prior: issue.summary.dueDate, value: '2028-05-03' }, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result; expect(issue.summary.dueDate).toBe('2028-05-03'); });
  const label = (await success(request, 'create_label', { projectId, name: 'Full-edit label', retryReference: crypto.randomUUID() }, zSavedLabelView)).result;
  await restCase('UC-ISS-0107', async () => { issue = (await success(request, 'update_issue_v2', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, editable: { ...modernEditable(issue), labelIds: [label.id] }, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result; expect(issue.summary.labels.map(value => value.id)).toEqual([label.id]); });
  await restCase('UC-ISS-0110', async () => { const workflowId = issue.summary.workflow.id; issue = (await success(request, 'update_issue_v2', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, editable: { ...modernEditable(issue), typeId: customType.id }, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result; expect(issue.summary.type.id).toBe(customType.id); expect(issue.summary.workflow.id).toBe(workflowId); });
  await restCase('UC-ISS-0095', async () => { issue = (await success(request, 'update_issue_v2', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, editable: { ...modernEditable(issue), description: '<p>Accepted <strong>description</strong></p>', descriptionFormat: 'html' }, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result; expect(issue.description).toContain('<strong>description</strong>'); expect(issue.descriptionFormat).toBe('html'); });
  await restCase('UC-ISS-0109', async () => { issue = (await success(request, 'update_issue_v2', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, editable: { title: 'Complete REST edit', description: '<p>Complete body</p>', descriptionFormat: 'html', typeId: customType.id, priorityId: high.id, assigneeId: memberId, dueDate: '2028-08-10', labelIds: [label.id] }, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result; expect(issue.summary).toMatchObject({ title: 'Complete REST edit', dueDate: '2028-08-10' }); expect(issue.summary.assignee?.id).toBe(memberId); expect(issue.summary.type.id).toBe(customType.id); expect(issue.summary.priority.id).toBe(high.id); expect(issue.summary.labels.map(value => value.id)).toEqual([label.id]); expect(issue.description).toBe('<p>Complete body</p>'); });
  const bulk = [await create(request, projectId), await create(request, projectId)];
  for (const row of [
    { id: 'UC-ISS-0130', field: 'priorityId', value: high.id },
    { id: 'UC-ISS-0131', field: 'assigneeId', value: memberId },
    { id: 'UC-ISS-0132', field: 'assigneeId', value: null },
    { id: 'UC-ISS-0133', field: 'dueDate', value: '2028-10-11' },
    { id: 'UC-ISS-0134', field: 'dueDate', value: null },
  ] as const) await restCase(row.id, async () => { for (const record of bulk) { const current = await read(request, record.summary.id); const payload = row.field === 'priorityId' ? { priority: { prior: current.summary.priority.id, value: row.value } } : row.field === 'assigneeId' ? { assignee: { prior: current.summary.assignee?.id ?? null, value: row.value } } : { dueDate: { prior: current.summary.dueDate, value: row.value } }; const saved = await success(request, 'patch_issue_field_v2', { issueId: record.summary.id, field: row.field, ...payload, retryReference: crypto.randomUUID() }, zSavedModernIssueView); if (row.field === 'priorityId') expect(saved.result.summary.priority.id).toBe(row.value); else if (row.field === 'assigneeId') expect(saved.result.summary.assignee?.id ?? null).toBe(row.value); else expect(saved.result.summary.dueDate).toBe(row.value); } });
  for (const row of [{ id: 'UC-ISS-0136', flags: { archived: true } }, { id: 'UC-ISS-0137', flags: { archived: false } }, { id: 'UC-ISS-0138', flags: { backlog: true } }, { id: 'UC-ISS-0139', flags: { backlog: false } }]) await restCase(row.id, async () => { const changed = await Promise.all(bulk.map(value => organize(request, value.summary.id, row.flags))); for (const value of changed) expect(value.summary).toMatchObject(row.flags); });
  await restCase('UC-ISS-0135', async () => { const changed = await Promise.all(bulk.map(async value => move(request, await read(request, value.summary.id), 'review'))); expect(changed.map(value => value.summary.stage.category)).toEqual(['review', 'review']); });
});

test('REST custom fields distinguish missing defaults, retained choices, bounded backfill and accepted audit changes', async ({ request }) => {
  const projectId = await coverageProject(request), missing = await create(request, projectId), explicit = await create(request, projectId);
  const definition = await coverageDefinition(request, projectId, { kind: 'text', defaultValue: { kind: 'text', text: 'Late configured default' } });
  await restCase('UC-FLD-0001', async () => { const current = await fields(request, missing.summary.id); expect(current.definitions.map(value => value.id)).toContain(definition.id); expect(current.values).toEqual([]); expect((await read(request, missing.summary.id)).summary.revision).toBe('1'); });
  await restCase('UC-FLD-0061', async () => { const saved = await success(request, 'save_issue_fields', { issueId: explicit.summary.id, expectedRevision: explicit.summary.revision, values: [{ fieldId: definition.id, value: { kind: 'text', text: 'Explicit retained value' } }], retryReference: crypto.randomUUID() }, zSavedCustomFieldsView); expect(saved.result.revision).toBe('2'); expect(saved.receipt.eventId).not.toBeNull(); const events = await success(request, 'list_activity', { projectId, issueKey: explicit.summary.key, page: { limit: 100 } }, zPageActivityView, 'owner'); expect(events.items.some(value => value.id === saved.receipt.eventId)).toBe(true); const retained = await coverageStoredChanges(explicit.summary.id, saved.receipt.eventId!); const change = retained.fields.find(value => value.field === 'customFields.' + definition.id); expect(change?.before).toBe('null'); const after: unknown = JSON.parse(change?.after ?? 'null'); expect(after).toEqual({ kind: 'text', text: 'Explicit retained value' }); });
  await restCase('UC-FLD-0071', async () => { const saved = await success(request, 'backfill_field_defaults', { projectId, fieldId: definition.id, expectedRevision: (await config(request, projectId)).revision, limit: 1, retryReference: crypto.randomUUID() }, zSavedBackfillFieldResult, 'owner'); expect(saved.result.changed).toBe(1); expect(saved.result.remaining).toBe(0n); expect(saved.receipt.eventId).not.toBeNull(); expect((await fields(request, missing.summary.id)).values).toEqual([{ fieldId: definition.id, value: definition.defaultValue }]); expect((await read(request, missing.summary.id)).summary.revision).toBe('2'); });
  await restCase('UC-FLD-0072', async () => { expect((await fields(request, explicit.summary.id)).values).toEqual([{ fieldId: definition.id, value: { kind: 'text', text: 'Explicit retained value' } }]); expect((await read(request, explicit.summary.id)).summary.revision).toBe('2'); });
  const choice = await coverageDefinition(request, projectId, { kind: 'choice' }), foreignChoice = await coverageDefinition(request, projectId, { kind: 'choice' });
  const option = async (fieldId: string, optionId: string, name: string, retired = false) => (await success(request, 'save_field_option', { projectId, fieldId, optionId, expectedRevision: (await config(request, projectId)).revision, name, position: '1', retired, retryReference: crypto.randomUUID() }, zSavedFieldOptionSaved, 'owner')).result.option;
  const old = await option(choice.id, crypto.randomUUID(), 'Retained historic choice'), foreign = await option(foreignChoice.id, crypto.randomUUID(), 'Other field choice');
  const retained = await create(request, projectId, { fieldValues: [{ fieldId: choice.id, value: { kind: 'choice', optionId: old.id } }] });
  await option(choice.id, old.id, old.name, true);
  await restCase('UC-FLD-0077', async () => { const current = await fields(request, retained.summary.id); expect(current.values).toContainEqual({ fieldId: choice.id, value: { kind: 'choice', optionId: old.id } }); expect(current.displayValues).toContainEqual({ fieldId: choice.id, referenceId: old.id, label: old.name, retired: true }); });
  const empty = await create(request, projectId);
  for (const row of [{ id: 'UC-FLD-0037', optionId: old.id }, { id: 'UC-FLD-0038', optionId: foreign.id }]) await restCase(row.id, async () => { await rejected(request, 'save_issue_fields', { issueId: empty.summary.id, expectedRevision: empty.summary.revision, values: [{ fieldId: choice.id, value: { kind: 'choice', optionId: row.optionId } }], retryReference: crypto.randomUUID() }); expect((await fields(request, empty.summary.id)).values).not.toContainEqual(expect.objectContaining({ fieldId: choice.id })); });
  const requiredProjectId = await coverageProject(request);
  await coverageDefinition(request, requiredProjectId, { kind: 'text', required: true });
  await restCase('UC-FLD-0045', async () => { const before = (await search(request, { projectIds: [requiredProjectId] })).totalMatching; await rejected(request, 'create_issue_v2', { projectId: requiredProjectId, title: 'Missing required text', retryReference: crypto.randomUUID() }); expect((await search(request, { projectIds: [requiredProjectId] })).totalMatching).toBe(before); });
});

test('REST person choices enforce current eligibility and preserve retained identities', async ({ request }) => {
  const projectId = await coverageProject(request), person = await coverageDefinition(request, projectId, { kind: 'user' }), people = await coverageIneligiblePeople(projectId), issue = await create(request, projectId);
  const save = async (userId: string) => { const current = await read(request, issue.summary.id); return success(request, 'save_issue_fields', { issueId: issue.summary.id, expectedRevision: current.summary.revision, values: [{ fieldId: person.id, value: { kind: 'user', userId } }], retryReference: crypto.randomUUID() }, zSavedCustomFieldsView); };
  await restCase('UC-FLD-0041', async () => { const saved = await save(viewerId); expect(saved.result.values).toEqual([{ fieldId: person.id, value: { kind: 'user', userId: viewerId } }]); });
  for (const row of [{ id: 'UC-FLD-0042', userId: people.disabled }, { id: 'UC-FLD-0044', userId: people.unapproved }]) await restCase(row.id, async () => { const current = await read(request, issue.summary.id); await rejected(request, 'save_issue_fields', { issueId: issue.summary.id, expectedRevision: current.summary.revision, values: [{ fieldId: person.id, value: { kind: 'user', userId: row.userId } }], retryReference: crypto.randomUUID() }); expect((await read(request, issue.summary.id)).summary.revision).toBe(current.summary.revision); expect((await fields(request, issue.summary.id)).values).toEqual([{ fieldId: person.id, value: { kind: 'user', userId: viewerId } }]); });
  await restCase('UC-FLD-0078', async () => { const first = await success(request, 'list_mention_candidates', { projectId, page: { limit: 1 } }, zPageUserSummary); expect(first.items).toHaveLength(1); expect(first.nextCursor).not.toBeNull(); const second = await success(request, 'list_mention_candidates', { projectId, page: { limit: 1, cursor: first.nextCursor! } }, zPageUserSummary); expect(second.items).toHaveLength(1); expect(second.items[0]?.id).not.toBe(first.items[0]?.id); expect([people.disabled, people.unapproved]).not.toContain(first.items[0]?.id); expect([people.disabled, people.unapproved]).not.toContain(second.items[0]?.id); });
  await removeMember(request, projectId, viewerId);
  await restCase('UC-FLD-0043', async () => { const retained = await save(viewerId); expect(retained.result.values).toEqual([{ fieldId: person.id, value: { kind: 'user', userId: viewerId } }]); const empty = await create(request, projectId); await rejected(request, 'save_issue_fields', { issueId: empty.summary.id, expectedRevision: empty.summary.revision, values: [{ fieldId: person.id, value: { kind: 'user', userId: viewerId } }], retryReference: crypto.randomUUID() }); expect((await fields(request, empty.summary.id)).values).toEqual([]); });
});

test('REST custom-definition and review lookup pages have current scoped cursors', async ({ request }) => {
  const projectId = await coverageProject(request), a = await coverageDefinition(request, projectId, { kind: 'text' }), b = await coverageDefinition(request, projectId, { kind: 'number' }), issue = await create(request, projectId, { fieldValues: [{ fieldId: a.id, value: { kind: 'text', text: 'Text page' } }, { fieldId: b.id, value: { kind: 'number', number: '12.5' } }] });
  let cursor = '';
  await restCase('UC-FLD-0081', async () => { const first = await success(request, 'get_issue_fields', { issueId: issue.summary.id, page: { limit: 1 } }, zCustomFieldsView); expect(first.definitions).toHaveLength(1); expect(first.nextCursor).not.toBeNull(); cursor = first.nextCursor!; const second = await success(request, 'get_issue_fields', { issueId: issue.summary.id, page: { limit: 1, cursor } }, zCustomFieldsView); expect(second.definitions).toHaveLength(1); expect(second.definitions[0]?.id).not.toBe(first.definitions[0]?.id); expect(second.nextCursor).toBeNull(); for (const page of [first, second]) expect(page.values.map(value => value.fieldId)).toEqual(page.definitions.map(value => value.id)); expect(new Set([...first.values, ...second.values].map(value => value.fieldId))).toEqual(new Set([a.id, b.id])); });
  await success(request, 'save_issue_fields', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, values: [{ fieldId: a.id, value: { kind: 'text', text: 'New revision' } }], retryReference: crypto.randomUUID() }, zSavedCustomFieldsView);
  await restCase('UC-FLD-0064', async () => { await rejected(request, 'get_issue_fields', { issueId: issue.summary.id, page: { limit: 1, cursor } }); });
  await restCase('UC-APR-0059', async () => { const first = await success(request, 'list_workflow_stages', { projectId, workflowId: issue.summary.workflow.id, page: { limit: 1 } }, zPageStageView); expect(first.nextCursor).not.toBeNull(); const second = await success(request, 'list_workflow_stages', { projectId, workflowId: issue.summary.workflow.id, page: { limit: 1, cursor: first.nextCursor! } }, zPageStageView); expect(second.items[0]?.id).not.toBe(first.items[0]?.id); expect(second.items[0]?.name).toBeTruthy(); });
  await restCase('UC-APR-0058', async () => { const first = await success(request, 'list_workflow_transitions', { projectId, workflowId: issue.summary.workflow.id, page: { limit: 1 } }, zPageTransitionView); expect(first.nextCursor).not.toBeNull(); const second = await success(request, 'list_workflow_transitions', { projectId, workflowId: issue.summary.workflow.id, page: { limit: 1, cursor: first.nextCursor! } }, zPageTransitionView); expect(second.items[0]?.id).not.toBe(first.items[0]?.id); expect(second.items[0]?.workflowId).toBe(issue.summary.workflow.id); });
  await restCase('UC-ISS-0123', async () => { const first = await success(request, 'list_issue_transitions_v2', { issueId: issue.summary.id, page: { limit: 1 } }, zPageIssueTransitionOption); expect(first.nextCursor).not.toBeNull(); const second = await success(request, 'list_issue_transitions_v2', { issueId: issue.summary.id, page: { limit: 1, cursor: first.nextCursor! } }, zPageIssueTransitionOption); expect(second.items[0]?.stage.id).not.toBe(first.items[0]?.stage.id); expect(second.items[0]?.stage.name).toBeTruthy(); });
  await restCase('UC-ISS-0198', async () => { const stages = await success(request, 'list_workflow_stages', { projectId, workflowId: issue.summary.workflow.id, page: { limit: 100 } }, zPageStageView); const options = await success(request, 'list_issue_transitions_v2', { issueId: issue.summary.id, page: { limit: 100 } }, zPageIssueTransitionOption); expect(options.items.length).toBeGreaterThan(0); for (const option of options.items) { expect(stages.items.map(value => value.id)).toContain(option.stage.id); expect(typeof option.canRequest).toBe('boolean'); expect(typeof option.requiresApproval).toBe('boolean'); expect(typeof option.reviewSatisfied).toBe('boolean'); } });
});

async function review(request: APIRequestContext, policy: Partial<TransitionPolicy> = {}, category = 'review') {
  const projectId = await coverageProject(request), issue = await create(request, projectId);
  const targets = await success(request, 'list_issue_transitions_v2', { issueId: issue.summary.id }, zPageIssueTransitionOption), edge = targets.items.find(value => value.stage.category === category)!;
  const emptyPolicy: TransitionPolicy = { requiredSystemFields: [], requiredFieldIds: [], approvalsRequired: 1, approverRole: 'member', excludeIssueReporter: false, ...policy };
  const setPolicy = async (value: TransitionPolicy) => success(request, 'save_transition_policy', { projectId, workflowId: issue.summary.workflow.id, transitionId: edge.transitionId, expectedRevision: (await config(request, projectId)).revision, policy: value, retryReference: crypto.randomUUID() }, zSavedTransitionPolicyView, 'owner');
  await setPolicy(emptyPolicy);
  const context = (role = 'member', page = {}) => success(request, 'get_issue_approvals', { issueId: issue.summary.id, transitionId: edge.transitionId, page }, zApprovalContextView, role);
  const initial = await context();
  const revisionFields = (value = initial) => ({ issueId: issue.summary.id, transitionId: edge.transitionId, expectedRevision: value.issueRevision, expectedWorkflowRevision: value.workflowRevision, expectedConfigurationRevision: value.configurationRevision });
  const vote = async (role = 'member', value = initial) => success(request, 'vote_issue_approval', { ...revisionFields(value), decision: 'approve', retryReference: crypto.randomUUID() }, zSavedApprovalContextView, role);
  return { projectId, issue, edge, initial, emptyPolicy, setPolicy, context, revisionFields, vote };
}

test('REST approvals preserve reviewer role, reporter exclusion and membership eligibility rules', async ({ request }) => {
  const admin = await review(request, { approverRole: 'project_admin' });
  await restCase('UC-APR-0029', async () => { await rejected(request, 'vote_issue_approval', { ...admin.revisionFields(), decision: 'approve', retryReference: crypto.randomUUID() }, 'forbidden'); expect((await admin.context()).approved).toBe(0); });
  await restCase('UC-APR-0032', async () => { await rejected(request, 'vote_issue_approval', { ...admin.revisionFields(), decision: 'approve', retryReference: crypto.randomUUID() }, 'forbidden', 'viewer'); });
  await restCase('UC-APR-0030', async () => { const saved = await admin.vote('owner'); expect(saved.result.approved).toBe(1); expect(saved.result.reviewSatisfied).toBe(true); });
  const excluded = await review(request, { excludeIssueReporter: true });
  await restCase('UC-APR-0028', async () => { await rejected(request, 'vote_issue_approval', { ...excluded.revisionFields(), decision: 'approve', retryReference: crypto.randomUUID() }, 'forbidden'); expect((await excluded.context()).approved).toBe(0); });
  const member = await review(request);
  await restCase('UC-APR-0031', async () => { expect((await member.vote()).result.approved).toBe(1); });
  for (const change of ['remove', 'demote'] as const) {
    const f = await review(request); await f.vote();
    await restCase(change === 'remove' ? 'UC-APR-0033' : 'UC-APR-0036', async () => { if (change === 'remove') await removeMember(request, f.projectId, memberId); else await success(request, 'set_membership', { projectId: f.projectId, userId: memberId, expectedRevision: '1', role: 'viewer', retryReference: crypto.randomUUID() }, zSavedMembershipView, 'owner'); const current = await f.context('owner'); expect(current.approved).toBe(0); expect(current.reviewSatisfied).toBe(false); expect(current.votes).toHaveLength(1); expect(current.votes[0]?.eligible).toBe(false); const issue = await success(request, 'get_issue_v2', { issueId: f.issue.summary.id }, zModernIssueView, 'owner'); await rejected(request, 'move_issue_v2', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, targetStageId: f.edge.stage.id, retryReference: crypto.randomUUID() }, 'validation_failed', 'owner'); });
  }
});

test('REST approvals cannot bypass required system/custom fields, completion prerequisites or admin moves', async ({ request }) => {
  for (const row of [{ id: 'UC-APR-0022', field: 'assignee' }, { id: 'UC-APR-0023', field: 'due_date' }, { id: 'UC-APR-0024', field: 'description' }]) {
    const f = await review(request, { approvalsRequired: 0, approverRole: null, requiredSystemFields: [row.field] });
    await restCase(row.id, async () => { await rejected(request, 'move_issue_v2', { issueId: f.issue.summary.id, expectedRevision: f.issue.summary.revision, targetStageId: f.edge.stage.id, retryReference: crypto.randomUUID() }); expect((await read(request, f.issue.summary.id)).summary.stage.category).toBe('todo'); });
  }
  const custom = await review(request, { approvalsRequired: 0, approverRole: null }), field = await coverageDefinition(request, custom.projectId, { kind: 'text' });
  await custom.setPolicy({ ...custom.emptyPolicy, requiredFieldIds: [field.id] });
  await restCase('UC-APR-0025', async () => { await rejected(request, 'move_issue_v2', { issueId: custom.issue.summary.id, expectedRevision: custom.issue.summary.revision, targetStageId: custom.edge.stage.id, retryReference: crypto.randomUUID() }); expect((await read(request, custom.issue.summary.id)).summary.stage.category).toBe('todo'); });
  const done = await review(request, {}, 'done');
  await create(request, done.projectId, { parentId: done.issue.summary.id, expectedParentRevision: done.issue.summary.revision });
  await done.vote('member', await done.context());
  await restCase('UC-APR-0026', async () => { expect((await done.context()).reviewSatisfied).toBe(true); const issue = await read(request, done.issue.summary.id); await rejected(request, 'move_issue_v2', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, targetStageId: done.edge.stage.id, retryReference: crypto.randomUUID() }, 'prerequisite_unfinished'); expect((await read(request, issue.summary.id)).summary.stage.category).toBe('todo'); });
  const restricted = await review(request);
  await success(request, 'save_workflow_transition', { projectId: restricted.projectId, workflowId: restricted.issue.summary.workflow.id, transitionId: restricted.edge.transitionId, expectedRevision: (await config(request, restricted.projectId)).revision, fromStageId: restricted.issue.summary.stage.id, toStageId: restricted.edge.stage.id, requiredPermission: 'project_admin', retired: false, retryReference: crypto.randomUUID() }, zSavedTransitionSaved, 'owner');
  await restricted.vote('owner', await restricted.context());
  await restCase('UC-APR-0027', async () => { expect((await restricted.context()).reviewSatisfied).toBe(true); await rejected(request, 'move_issue_v2', { issueId: restricted.issue.summary.id, expectedRevision: restricted.issue.summary.revision, targetStageId: restricted.edge.stage.id, retryReference: crypto.randomUUID() }, 'forbidden'); expect((await move(request, restricted.issue, 'review', 'owner')).summary.stage.id).toBe(restricted.edge.stage.id); });
});

test('REST current review revisions and history cursors invalidate after real configuration changes', async ({ request }) => {
  const f = await review(request); await f.vote();
  await restCase('UC-APR-0039', async () => { await coverageDefinition(request, f.projectId, { kind: 'text' }); const current = await f.context(); expect(current.configurationRevision).not.toBe(f.initial.configurationRevision); expect(current.workflowRevision).toBe(f.initial.workflowRevision); expect(current.approved).toBe(0); expect(current.votes.every(value => !value.current)).toBe(true); });
  let fresh = await f.context(); await f.vote('member', fresh);
  await restCase('UC-APR-0038', async () => { await f.setPolicy({ ...f.emptyPolicy, requiredSystemFields: ['due_date'] }); const current = await f.context(); expect(current.workflowRevision).not.toBe(fresh.workflowRevision); expect(current.approved).toBe(0); expect(current.votes.every(value => !value.current)).toBe(true); });
  let cursor = '';
  await restCase('UC-APR-0065', async () => { const first = await f.context('member', { limit: 1 }); expect(first.votes).toHaveLength(1); expect(first.nextCursor).not.toBeNull(); cursor = first.nextCursor!; const second = await f.context('member', { limit: 1, cursor }); expect(second.votes).toHaveLength(1); expect(second.votes[0]?.configurationRevision).not.toBe(first.votes[0]?.configurationRevision); expect(first.votes[0]!.decidedAt >= second.votes[0]!.decidedAt).toBe(true); });
  fresh = await f.context(); await success(request, 'resubmit_issue_approval', { ...f.revisionFields(fresh), retryReference: crypto.randomUUID() }, zSavedApprovalContextView);
  await restCase('UC-APR-0050', async () => { await rejected(request, 'get_issue_approvals', { issueId: f.issue.summary.id, transitionId: f.edge.transitionId, page: { limit: 1, cursor } }); });
  const none = await review(request, { approvalsRequired: 0, approverRole: null });
  await restCase('UC-APR-0046', async () => { await rejected(request, 'resubmit_issue_approval', { ...none.revisionFields(), retryReference: crypto.randomUUID() }); expect((await read(request, none.issue.summary.id)).summary.revision).toBe(none.issue.summary.revision); });
  const retired = await review(request);
  await success(request, 'save_workflow_transition', { projectId: retired.projectId, workflowId: retired.issue.summary.workflow.id, transitionId: retired.edge.transitionId, expectedRevision: (await config(request, retired.projectId)).revision, fromStageId: retired.issue.summary.stage.id, toStageId: retired.edge.stage.id, requiredPermission: null, retired: true, retryReference: crypto.randomUUID() }, zSavedTransitionSaved, 'owner');
  await restCase('UC-APR-0043', async () => { const current = await retired.context(); await rejected(request, 'vote_issue_approval', { ...retired.revisionFields(current), decision: 'approve', retryReference: crypto.randomUUID() }); await rejected(request, 'resubmit_issue_approval', { ...retired.revisionFields(current), retryReference: crypto.randomUUID() }); });
  const foreign = await review(request);
  await restCase('UC-APR-0044', async () => { await rejected(request, 'vote_issue_approval', { ...f.revisionFields(await f.context()), transitionId: foreign.edge.transitionId, decision: 'approve', retryReference: crypto.randomUUID() }); await rejected(request, 'resubmit_issue_approval', { ...f.revisionFields(await f.context()), transitionId: foreign.edge.transitionId, retryReference: crypto.randomUUID() }); });
});

test('REST child paging, partial completion and immutable parent boundaries retain independent issues', async ({ request }) => {
  const projectId = await coverageProject(request), parent = await create(request, projectId), otherParent = await create(request, projectId);
  const initialRevision = parent.summary.revision;
  const children: ModernIssueView[] = [];
  for (let index = 0; index < 2; index++) { const current = await read(request, parent.summary.id); children.push(await create(request, projectId, { parentId: parent.summary.id, expectedParentRevision: current.summary.revision, title: 'Child paging ' + index })); }
  await restCase('UC-REL-0013', async () => { const first = await success(request, 'list_subtasks', { parentId: parent.summary.id, page: { limit: 1 } }, zPageIssueSummary); expect(first.nextCursor).not.toBeNull(); const second = await success(request, 'list_subtasks', { parentId: parent.summary.id, page: { limit: 1, cursor: first.nextCursor! } }, zPageIssueSummary); expect([first.items[0]?.id, second.items[0]?.id]).toEqual(children.map(value => value.summary.id)); expect(second.nextCursor).toBeNull(); });
  await restCase('UC-REL-0017', async () => { await move(request, children[0]!, 'done'); expect((await read(request, parent.summary.id)).summary.subtaskProgress).toEqual({ total: 2, done: 1 }); expect((await read(request, parent.summary.id)).summary.stage.category).toBe('todo'); });
  await restCase('UC-REL-0026', async () => { const current = await read(request, parent.summary.id); const revised = await success(request, 'patch_issue_field_v2', { issueId: parent.summary.id, field: 'dueDate', dueDate: { prior: current.summary.dueDate, value: '2999-04-01' }, retryReference: crypto.randomUUID() }, zSavedModernIssueView); expect(BigInt(revised.result.summary.revision)).toBeGreaterThan(BigInt(initialRevision)); await rejected(request, 'create_issue_v2', { projectId, parentId: parent.summary.id, expectedParentRevision: initialRevision, title: 'Stale parent context', retryReference: crypto.randomUUID() }, 'conflict'); expect((await read(request, parent.summary.id)).summary.subtaskProgress.total).toBe(2); });
  await restCase('UC-REL-0025', async () => { const published = await request.get(apiOrigin + '/openapi.json'); expect(published.status()).toBe(200); const contract = z.object({ components: z.object({ schemas: z.object({ ModernEditable: z.object({ additionalProperties: z.literal(false), properties: z.record(z.string(), z.unknown()) }) }) }) }).parse(await published.json()); expect(contract.components.schemas.ModernEditable.additionalProperties).toBe(false); expect(Object.hasOwn(contract.components.schemas.ModernEditable.properties, 'parentId')).toBe(false); const child = await read(request, children[1]!.summary.id); await rejected(request, 'update_issue_v2', { issueId: child.summary.id, expectedRevision: child.summary.revision, editable: { ...modernEditable(child), parentId: otherParent.summary.id }, retryReference: crypto.randomUUID() }); expect((await read(request, child.summary.id)).summary.parent?.id).toBe(parent.summary.id); });
  await restCase('UC-REL-0085', async () => { const current = await read(request, parent.summary.id); await rejected(request, 'create_issue_v2', { projectId, parentId: parent.summary.id, expectedParentRevision: current.summary.revision, title: 'Viewer child', retryReference: crypto.randomUUID() }, 'forbidden', 'viewer'); expect((await read(request, parent.summary.id)).summary.subtaskProgress.total).toBe(2); });
  await restCase('UC-ISS-0057', async () => { const page = await success(request, 'search_issues_v2', { filters: { projectIds: [projectId], query: parent.summary.key }, typeBehavior: 'standard', page: { limit: 25 } }, zPageModernIssueSummary); expect(page.items.map(value => value.id)).toEqual([parent.summary.id]); expect(page.items.every(value => value.type.behavior === 'standard')).toBe(true); });
  await restCase('UC-REL-0053', async () => { const child = await read(request, children[1]!.summary.id); await rejected(request, 'add_dependency', { issueId: child.summary.id, blockerId: parent.summary.id, expectedIssueRevision: child.summary.revision, expectedGraphRevision: child.graphRevision, retryReference: crypto.randomUUID() }); });
});

test('REST dependency pages retain both directions and invalidate scoped cursors after graph changes', async ({ request }) => {
  const projectId = await coverageProject(request), dependent = await create(request, projectId), blocker = await create(request, projectId), anotherBlocker = await create(request, projectId), otherDependent = await create(request, projectId);
  const add = async (issueId: string, blockerId: string) => { const current = await read(request, issueId); return (await success(request, 'add_dependency', { issueId, blockerId, expectedIssueRevision: current.summary.revision, expectedGraphRevision: current.graphRevision, retryReference: crypto.randomUUID() }, zSavedDependencyView)).result; };
  await add(dependent.summary.id, blocker.summary.id); await add(dependent.summary.id, anotherBlocker.summary.id); await add(otherDependent.summary.id, blocker.summary.id);
  let stale = '';
  await restCase('UC-REL-0040', async () => { const first = await success(request, 'list_dependencies', { issueId: dependent.summary.id, direction: 'blocked_by', page: { limit: 1 } }, zPageDependencyView); expect(first.nextCursor).not.toBeNull(); stale = first.nextCursor!; const next = await success(request, 'list_dependencies', { issueId: dependent.summary.id, direction: 'blocked_by', page: { limit: 1, cursor: stale } }, zPageDependencyView); expect(new Set([...first.items, ...next.items].map(value => value.blocker.id))).toEqual(new Set([blocker.summary.id, anotherBlocker.summary.id])); expect(next.nextCursor).toBeNull(); });
  await restCase('UC-REL-0041', async () => { const first = await success(request, 'list_dependencies', { issueId: blocker.summary.id, direction: 'blocks', page: { limit: 1 } }, zPageDependencyView); expect(first.nextCursor).not.toBeNull(); const next = await success(request, 'list_dependencies', { issueId: blocker.summary.id, direction: 'blocks', page: { limit: 1, cursor: first.nextCursor! } }, zPageDependencyView); expect(new Set([...first.items, ...next.items].map(value => value.dependent.id))).toEqual(new Set([dependent.summary.id, otherDependent.summary.id])); });
  const before = (await read(request, dependent.summary.id)).graphRevision, third = await create(request, projectId);
  await add(dependent.summary.id, third.summary.id);
  await restCase('UC-REL-0043', async () => { const current = await read(request, dependent.summary.id); expect(BigInt(current.graphRevision)).toBeGreaterThan(BigInt(before)); const forward = await success(request, 'list_dependencies', { issueId: dependent.summary.id, direction: 'blocked_by' }, zPageDependencyView), inverse = await success(request, 'list_dependencies', { issueId: third.summary.id, direction: 'blocks' }, zPageDependencyView); expect(forward.items.map(value => value.blocker.id)).toContain(third.summary.id); expect(inverse.items.map(value => value.dependent.id)).toEqual([dependent.summary.id]); });
  await restCase('UC-REL-0058', async () => { await rejected(request, 'list_dependencies', { issueId: dependent.summary.id, direction: 'blocked_by', page: { limit: 1, cursor: stale } }, 'conflict'); });
  await restCase('UC-ISS-0054', async () => { const page = await search(request, { projectIds: [projectId], blocked: true }); expect(new Set(page.items.map(value => value.id))).toEqual(new Set([dependent.summary.id, otherDependent.summary.id])); });
  await restCase('UC-ISS-0055', async () => { const page = await search(request, { projectIds: [projectId], blocked: false }); expect(new Set(page.items.map(value => value.id))).toEqual(new Set([blocker.summary.id, anotherBlocker.summary.id, third.summary.id])); });
  const keyCandidate = await create(request, projectId);
  await restCase('UC-REL-0031', async () => { const page = await search(request, { projectIds: [projectId], query: keyCandidate.summary.key }); expect(page.items.map(value => value.id)).toEqual([keyCandidate.summary.id]); });
  const finished = await move(request, await create(request, projectId), 'done');
  await restCase('UC-REL-0054', async () => { const current = await read(request, finished.summary.id); await rejected(request, 'add_dependency', { issueId: finished.summary.id, blockerId: third.summary.id, expectedIssueRevision: current.summary.revision, expectedGraphRevision: current.graphRevision, retryReference: crypto.randomUUID() }, 'prerequisite_unfinished'); expect((await read(request, finished.summary.id)).summary.blocked).toBe(false); });
});

test('REST related-link conflicts report current winning state while preserving both endpoints', async ({ request }) => {
  const projectId = await coverageProject(request), a = await create(request, projectId), b = await create(request, projectId);
  await success(request, 'set_issue_link', { issueId: a.summary.id, expectedRevision: a.summary.revision, targetId: b.summary.id, kind: 'relates_to', enabled: true, retryReference: crypto.randomUUID() }, zSavedIssueView);
  await restCase('UC-REL-0081', async () => { const conflict = await restFailure(request, 'set_issue_link', { issueId: a.summary.id, expectedRevision: a.summary.revision, targetId: b.summary.id, kind: 'relates_to', enabled: false, retryReference: crypto.randomUUID() }, zIssueFailureBody, 'conflict', 'member'); const winning = zIssueView.parse(conflict.current); expect(winning.summary.id).toBe(a.summary.id); expect(winning.links).toHaveLength(1); expect((await read(request, a.summary.id)).links).toHaveLength(1); expect((await read(request, b.summary.id)).links).toHaveLength(1); });
});

test('REST legacy subtask compatibility retains independent values and rejects nesting and completed parents', async ({ request }) => {
  const projectId = await isolatedProject(request);
  const parent = (await success(request, 'create_issue', { projectId, title: 'Compatibility parent', retryReference: crypto.randomUUID() }, zSavedIssueView)).result;
  await restCase('UC-REL-0077', async () => {
    const child = (await success(request, 'create_subtask', { parentId: parent.summary.id, expectedParentRevision: parent.summary.revision, title: 'Compatibility child', assigneeId: memberId, dueDate: '2028-02-29', priority: 'high', retryReference: crypto.randomUUID() }, zSavedIssueView)).result;
    expect(child.summary.parent?.id).toBe(parent.summary.id); expect(child.summary.key).not.toBe(parent.summary.key); expect(child.summary.type).toBe('subtask'); expect(child.summary.status).toBe('todo'); expect(child.summary.assignee?.id).toBe(memberId); expect(child.summary.dueDate).toBe('2028-02-29'); expect(child.reporter.id).toBe(memberId);
    await rejected(request, 'create_subtask', { parentId: child.summary.id, expectedParentRevision: child.summary.revision, title: 'Nested compatibility', retryReference: crypto.randomUUID() });
    const complete = async (issueId: string) => { const current = await success(request, 'get_issue', { issueId }, zIssueView); return success(request, 'move_issue', { issueId, expectedRevision: current.summary.revision, targetStatus: 'done', expectedSourceOrderRevision: current.sourceOrderRevision, expectedTargetOrderRevision: current.orderRevisions.find(value => value.status === 'done')!.revision, retryReference: crypto.randomUUID() }, zSavedMoveResult); };
    await complete(child.summary.id); await complete(parent.summary.id);
    const done = await success(request, 'get_issue', { issueId: parent.summary.id }, zIssueView);
    await rejected(request, 'create_subtask', { parentId: parent.summary.id, expectedParentRevision: done.summary.revision, title: 'Done compatibility parent', retryReference: crypto.randomUUID() }, 'prerequisite_unfinished');
  });
  const modernId = await coverageProject(request), modernParent = await create(request, modernId);
  await restCase('UC-REL-0078', async () => { await rejected(request, 'create_subtask', { parentId: modernParent.summary.id, expectedParentRevision: modernParent.summary.revision, title: 'Compatibility in modern mode', retryReference: crypto.randomUUID() }); expect((await read(request, modernParent.summary.id)).summary.subtaskProgress.total).toBe(0); });
});

test('REST scoped teammate and mention queries exclude ineligible people and page without publishing comments', async ({ request }) => {
  const projectId = await coverageProject(request), people = await coverageIneligiblePeople(projectId), issue = await create(request, projectId);
  await restCase('UC-ISS-0197', async () => { const page = await success(request, 'list_assignees', { projectId, query: 'مطور' }, zPageUserSummary); expect(page.items.map(value => value.id)).toEqual([memberId]); });
  await restCase('UC-COM-0136', async () => { const page = await success(request, 'list_mention_candidates', { projectId, page: { limit: 100 } }, zPageUserSummary); expect(new Set(page.items.map(value => value.id))).toEqual(new Set([ownerId, memberId, viewerId])); expect(page.items.map(value => value.id)).not.toContain(people.unapproved); expect(page.items.map(value => value.id)).not.toContain(people.disabled); });
  await restCase('UC-COM-0135', async () => { const ids: string[] = []; let cursor: string | undefined; do { const page = await success(request, 'list_mention_candidates', { projectId, page: { limit: 1, ...(cursor ? { cursor } : {}) } }, zPageUserSummary); expect(page.items).toHaveLength(1); ids.push(page.items[0]!.id); cursor = page.nextCursor ?? undefined; } while (cursor); expect(new Set(ids)).toEqual(new Set([ownerId, memberId, viewerId])); expect(ids).toHaveLength(3); expect((await success(request, 'list_comments', { issueId: issue.summary.id }, zPageCommentView)).totalMatching).toBe(0); });
});

test('REST retained mention snapshots do not notify twice and revoked mentions cannot publish', async ({ request }) => {
  const projectId = await coverageProject(request), issue = await create(request, projectId);
  const html = `<p>Review <span data-user-id="${viewerId}">Forged display label</span></p>`;
  const comment = (await success(request, 'create_comment', { issueId: issue.summary.id, body: { html, pictureIds: [], mentionUserIds: [viewerId] }, retryReference: crypto.randomUUID() }, zSavedCommentView)).result;
  const before = await success(request, 'list_notifications', {}, zPageNotificationView, 'viewer');
  await restCase('UC-COM-0115', async () => { const saved = await success(request, 'update_comment', { commentId: comment.id, expectedRevision: comment.revision, body: { html: html.replace('Review', 'Updated review'), pictureIds: [], mentionUserIds: [viewerId] }, retryReference: crypto.randomUUID() }, zSavedCommentView); expect(saved.result.mentions).toEqual(comment.mentions); expect(saved.result.mentions[0]?.displayLabel).toBe('Local Viewer'); expect(saved.result.safeHtml).not.toContain('Forged display label'); const after = await success(request, 'list_notifications', {}, zPageNotificationView, 'viewer'); expect(after.items.map(value => value.id)).toEqual(before.items.map(value => value.id)); expect(after.totalMatching).toBe(before.totalMatching); });
  await removeMember(request, projectId, viewerId);
  await restCase('UC-COM-0134', async () => { await rejected(request, 'create_comment', { issueId: issue.summary.id, body: { html, pictureIds: [], mentionUserIds: [viewerId] }, retryReference: crypto.randomUUID() }); expect((await success(request, 'list_comments', { issueId: issue.summary.id }, zPageCommentView)).totalMatching).toBe(1); });
  await restCase('UC-COM-0129', async () => { await rejected(request, 'list_comments', { issueId: issue.summary.id }, 'unavailable_record', 'viewer'); });
});

test('REST description round-trips Arabic while rejecting executable stored markup', async ({ request }) => {
  const projectId = await coverageProject(request), issue = await create(request, projectId);
  const safe = await success(request, 'update_issue_v2', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, editable: { ...modernEditable(issue), descriptionFormat: 'html', description: '<p dir="rtl">وصف <strong>عربي</strong><script>alert(1)</script><iframe src="https://bad.invalid"></iframe><svg onload="alert(1)"></svg><span onclick="alert(1)">نص</span></p>' }, retryReference: crypto.randomUUID() }, zSavedModernIssueView);
  await restCase('UC-COM-0027', async () => { expect(safe.result.description).toContain('dir="rtl"'); expect(safe.result.description).toContain('وصف'); expect(safe.result.description).toContain('عربي'); expect((await read(request, issue.summary.id)).description).toBe(safe.result.description); });
  await restCase('UC-COM-0122', async () => { const current = await read(request, issue.summary.id); expect(current.description).not.toMatch(/<script|<iframe|<svg|onload|onclick/i); expect(current.description).toContain('<strong>عربي</strong>'); });
});

test('REST archived project and revoked-write boundaries reject issue and comment mutations', async ({ request }) => {
  const projectId = await coverageProject(request), issue = await create(request, projectId);
  const comment = (await success(request, 'create_comment', { issueId: issue.summary.id, body: { html: '<p>Before archive</p>', pictureIds: [], mentionUserIds: [] }, retryReference: crypto.randomUUID() }, zSavedCommentView)).result;
  const project = await success(request, 'get_project', { projectId }, zProjectView, 'owner');
  await success(request, 'archive_project', { projectId, expectedRevision: project.revision, retryReference: crypto.randomUUID() }, zSavedProjectView, 'owner');
  await restCase('UC-COM-0096', async () => { await rejected(request, 'create_comment', { issueId: issue.summary.id, body: { html: '<p>After archive</p>', pictureIds: [], mentionUserIds: [] }, retryReference: crypto.randomUUID() }, 'forbidden'); await rejected(request, 'update_comment', { commentId: comment.id, expectedRevision: comment.revision, body: { html: '<p>After archive edit</p>', pictureIds: [], mentionUserIds: [] }, retryReference: crypto.randomUUID() }, 'forbidden'); });
  await restCase('UC-ISS-0171', async () => { await rejected(request, 'update_issue_v2', { issueId: issue.summary.id, expectedRevision: issue.summary.revision, editable: { ...modernEditable(issue), title: 'After archive title' }, retryReference: crypto.randomUUID() }, 'forbidden'); });
  const otherId = await coverageProject(request), other = await create(request, otherId);
  await success(request, 'set_membership', { projectId: otherId, userId: memberId, expectedRevision: '1', role: 'viewer', retryReference: crypto.randomUUID() }, zSavedMembershipView, 'owner');
  await restCase('UC-ISS-0196', async () => { await rejected(request, 'update_issue_v2', { issueId: other.summary.id, expectedRevision: other.summary.revision, editable: { ...modernEditable(other), title: 'Revoked full edit' }, retryReference: crypto.randomUUID() }, 'forbidden'); await rejected(request, 'patch_issue_field_v2', { issueId: other.summary.id, field: 'dueDate', dueDate: { prior: null, value: '2028-01-01' }, retryReference: crypto.randomUUID() }, 'forbidden'); expect((await read(request, other.summary.id)).summary.title).toBe(other.summary.title); expect((await read(request, other.summary.id)).summary.dueDate).toBeNull(); });
});

test('REST all-label filtering intersects reusable identities and rejects foreign assignments', async ({ request }) => {
  const projectId = await coverageProject(request), foreignId = await coverageProject(request);
  const label = async (projectId: string, name: string) => (await success(request, 'create_label', { projectId, name, retryReference: crypto.randomUUID() }, zSavedLabelView)).result;
  const a = await label(projectId, 'Alpha'), b = await label(projectId, 'Beta'), foreign = await label(foreignId, 'Foreign');
  const both = await create(request, projectId, { labelIds: [a.id, b.id] }); await create(request, projectId, { labelIds: [a.id] }); await create(request, projectId, { labelIds: [b.id] });
  await restCase('UC-LBL-0027', async () => { const result = await search(request, { projectIds: [projectId], labelIds: [a.id, b.id] }); expect(result.items.map(value => value.id)).toEqual([both.summary.id]); expect(result.totalMatching).toBe(1); expect(new Set(result.items[0]?.labels.map(value => value.id))).toEqual(new Set([a.id, b.id])); });
  await restCase('UC-LBL-0017', async () => { await rejected(request, 'update_issue_v2', { issueId: both.summary.id, expectedRevision: both.summary.revision, editable: { ...modernEditable(both), labelIds: [a.id, foreign.id] }, retryReference: crypto.randomUUID() }); expect(new Set((await read(request, both.summary.id)).summary.labels.map(value => value.id))).toEqual(new Set([a.id, b.id])); });
});

test('REST board and multi-issue moves each enforce approval before accepting an explicit command', async ({ request }) => {
  const f = await review(request), boards = await success(request, 'list_boards', { projectId: f.projectId }, zPageBoardSummary), boardId = boards.items[0]!.id;
  const boardArguments = async () => { const current = await read(request, f.issue.summary.id), layout = await success(request, 'get_board_v2', { boardId }, zLayoutView); const source = layout.columns.find(value => value.stages.some(mapping => mapping.stage.id === current.summary.stage.id))!, target = layout.columns.find(value => value.stages.some(mapping => mapping.stage.id === f.edge.stage.id))!; return { boardId, issueId: current.summary.id, expectedIssueRevision: current.summary.revision, expectedBoardRevision: layout.board.revision, sourceColumnId: source.id, expectedSourceOrderRevision: source.orderRevision, targetColumnId: target.id, expectedTargetOrderRevision: target.orderRevision, targetStageId: f.edge.stage.id, neighborIssueId: null, placement: 'last', retryReference: crypto.randomUUID() }; };
  await restCase('UC-APR-0018', async () => { await rejected(request, 'move_board_card_v2', await boardArguments()); await f.vote(); const moved = await success(request, 'move_board_card_v2', await boardArguments(), zSavedNativeMoveResult); expect(moved.result.issue.summary.stage.id).toBe(f.edge.stage.id); expect((await read(request, f.issue.summary.id)).summary.stage.id).toBe(f.edge.stage.id); });
  const approved = await review(request), pending = await create(request, approved.projectId);
  await approved.vote();
  await restCase('UC-APR-0019', async () => { const moved = await move(request, approved.issue, 'review'); expect(moved.summary.stage.id).toBe(approved.edge.stage.id); await rejected(request, 'move_issue_v2', { issueId: pending.summary.id, expectedRevision: pending.summary.revision, targetStageId: approved.edge.stage.id, retryReference: crypto.randomUUID() }); expect((await read(request, pending.summary.id)).summary.stage.category).toBe('todo'); });
});

test('REST saved-search dimension edits retain all other filters and per-account capacity rejects overflow', async ({ request }) => {
  const projectId = await coverageProject(request), searchId = crypto.randomUUID();
  const first = (await success(request, 'save_issue_search', { searchId, expectedRevision: '0', name: 'Dimension ' + searchId, filters: { projectIds: [projectId], query: 'Original', statuses: ['todo'], dueFrom: '2028-01-01', backlog: true, blocked: false, assignee: { kind: 'self' } }, retryReference: crypto.randomUUID() }, zSavedSavedSearch)).result;
  const owned: string[] = [searchId];
  try {
    await restCase('UC-ISS-0150', async () => { const saved = await success(request, 'save_issue_search', { searchId, expectedRevision: first.revision, name: first.name, filters: { ...first.filters, query: 'Only this changed' }, retryReference: crypto.randomUUID() }, zSavedSavedSearch); expect(saved.result.filters.query).toBe('Only this changed'); const { query: originalQuery, ...oldOther } = first.filters, { query: currentQuery, ...newOther } = saved.result.filters; expect(newOther).toEqual(oldOther); });
    await restCase('UC-ISS-0155', async () => { let current = await success(request, 'list_saved_searches', {}, zSavedSearchList); while (current.items.length < 50) { const id = crypto.randomUUID(); await success(request, 'save_issue_search', { searchId: id, expectedRevision: '0', name: 'Capacity ' + id, filters: { projectIds: [projectId] }, retryReference: crypto.randomUUID() }, zSavedSavedSearch); owned.push(id); current = await success(request, 'list_saved_searches', {}, zSavedSearchList); } expect(current.items).toHaveLength(50); await rejected(request, 'save_issue_search', { searchId: crypto.randomUUID(), expectedRevision: '0', name: 'Overflow ' + crypto.randomUUID(), filters: { projectIds: [projectId] }, retryReference: crypto.randomUUID() }); expect((await success(request, 'list_saved_searches', {}, zSavedSearchList)).items).toHaveLength(50); });
  } finally { const list = await success(request, 'list_saved_searches', {}, zSavedSearchList); for (const row of list.items.filter(value => owned.includes(value.id))) await success(request, 'save_issue_search', { searchId: row.id, expectedRevision: row.revision, name: row.name, filters: row.filters, removed: true, retryReference: crypto.randomUUID() }, zSavedSavedSearch); }
});

test('REST related-link capacity guards both the source and destination at one hundred retained links', async ({ request }, testInfo) => {
  testInfo.setTimeout(240_000);
  const projectId = await coverageProject(request), root = await create(request, projectId);
  let revision = root.summary.revision;
  for (let index = 0; index < 100; index++) { const target = await create(request, projectId); const saved = await success(request, 'set_issue_link', { issueId: root.summary.id, expectedRevision: revision, targetId: target.summary.id, kind: 'relates_to', enabled: true, retryReference: crypto.randomUUID() }, zSavedIssueView); revision = saved.result.summary.revision; }
  const overflow = await create(request, projectId);
  await restCase('UC-REL-0074', async () => { expect((await read(request, root.summary.id)).links).toHaveLength(100); await rejected(request, 'set_issue_link', { issueId: root.summary.id, expectedRevision: revision, targetId: overflow.summary.id, kind: 'relates_to', enabled: true, retryReference: crypto.randomUUID() }); await rejected(request, 'set_issue_link', { issueId: overflow.summary.id, expectedRevision: overflow.summary.revision, targetId: root.summary.id, kind: 'relates_to', enabled: true, retryReference: crypto.randomUUID() }); expect((await read(request, root.summary.id)).links).toHaveLength(100); expect((await read(request, overflow.summary.id)).links).toEqual([]); });
});

const binary = <S extends z.ZodType>(request: APIRequestContext, name: string, args: object, schema: S, role = 'member') => restSuccess(request, name, args, schema, role);

test('REST JPEG and WebP uploads retain accepted encoded bytes and published protected metadata', async ({ request, page }) => {
  const projectId = await coverageProject(request), issue = await create(request, projectId);
  for (const row of [{ id: 'UC-AST-0084', mimeType: 'image/jpeg', extension: 'jpg' }, { id: 'UC-AST-0085', mimeType: 'image/webp', extension: 'webp' }]) await restCase(row.id, async () => { const bytes = Buffer.from(await page.evaluate(mime => { const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 3; const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas unavailable'); context.fillStyle = '#0c66e4'; context.fillRect(0, 0, 4, 3); const data = canvas.toDataURL(mime); if (!data.startsWith('data:' + mime)) throw new Error('Required encoder unavailable'); return data.split(',')[1]!; }, row.mimeType), 'base64'); const asset = (await binary(request, 'upload_asset', { issueId: issue.summary.id, metadata: { kind: 'image', mimeType: row.mimeType, filename: 'encoded.' + row.extension, description: '', publication: 'issue' }, dataBase64: bytes.toString('base64'), retryReference: crypto.randomUUID() }, zSavedAssetView)).result; expect(asset.state).toBe('published'); expect(asset.mimeType).toBe(row.mimeType); expect(asset.byteSize).toBe(String(bytes.length)); const chunk = await binary(request, 'download_asset_chunk', { assetId: asset.id, offset: '0', count: '1048576' }, zAssetChunk, 'viewer'); expect(Buffer.from(chunk.dataBase64, 'base64')).toEqual(bytes); });
});

test('REST description draft references publish atomically and retained IDs do not depend on a stored hostname', async ({ request }) => {
  const projectId = await coverageProject(request), issue = await create(request, projectId), png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGN8tsWNgYGBiYGBgYGBAQAXSgHkeDr16gAAAABJRU5ErkJggg==';
  const draft = (await binary(request, 'upload_asset', { issueId: issue.summary.id, metadata: { kind: 'image', mimeType: 'image/png', filename: 'description.png', description: 'Description reference', publication: 'draft' }, dataBase64: png, retryReference: crypto.randomUUID() }, zSavedAssetView)).result;
  await restCase('UC-AST-0041', async () => { await rejected(request, 'get_asset', { assetId: draft.id }, 'unavailable_record', 'viewer'); expect((await success(request, 'list_assets', { issueId: issue.summary.id }, zPageAssetView, 'viewer')).items.some(value => value.id === draft.id)).toBe(false); });
  await restCase('UC-AST-0042', async () => { const current = await read(request, issue.summary.id); const saved = await success(request, 'update_issue_v2', { issueId: current.summary.id, expectedRevision: current.summary.revision, editable: { ...modernEditable(current), descriptionFormat: 'html', description: `<p>Description image <img data-picture-id="${draft.id}" alt="Description reference" src="https://old-installation.invalid/private-file"></p>` }, retryReference: crypto.randomUUID() }, zSavedModernIssueView); expect(saved.result.description).toContain(draft.id); const published = await success(request, 'get_asset', { assetId: draft.id }, zAssetView, 'viewer'); expect(published.state).toBe('published'); expect((await success(request, 'list_assets', { issueId: current.summary.id }, zPageAssetView, 'viewer')).items.some(value => value.id === draft.id)).toBe(true); });
  await restCase('UC-AST-0043', async () => { const current = await read(request, issue.summary.id); expect(current.description).toContain(`data-picture-id="${draft.id}"`); expect(current.description).not.toContain('old-installation.invalid'); expect(current.description).not.toContain('src='); const bytes = await binary(request, 'download_asset_chunk', { assetId: draft.id, offset: '0', count: '1048576' }, zAssetChunk, 'viewer'); expect(bytes.asset.id).toBe(draft.id); expect(Buffer.from(bytes.dataBase64, 'base64')).toEqual(Buffer.from(png, 'base64')); });
  await restCase('UC-AST-0080', async () => { const unavailable = crypto.randomUUID(); await rejected(request, 'get_asset', { assetId: unavailable }, 'unavailable_record'); await rejected(request, 'download_asset_chunk', { assetId: unavailable, offset: '0', count: '1048576' }, 'unavailable_record'); });
});

test('REST unified asset cursor pages combine files and images without duplicate private records', async ({ request }) => {
  const projectId = await coverageProject(request), issue = await create(request, projectId);
  const inputs = [{ kind: 'image', filename: 'page.png', mimeType: 'image/png', dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGN8tsWNgYGBiYGBgYGBAQAXSgHkeDr16gAAAABJRU5ErkJggg==' }, { kind: 'file', filename: 'page.txt', mimeType: 'text/plain', dataBase64: Buffer.from('File page').toString('base64') }];
  const ids: string[] = [];
  for (const input of inputs) { const asset = await binary(request, 'upload_asset', { issueId: issue.summary.id, metadata: { kind: input.kind, filename: input.filename, mimeType: input.mimeType, description: '', publication: 'issue' }, dataBase64: input.dataBase64, retryReference: crypto.randomUUID() }, zSavedAssetView); ids.push(asset.result.id); }
  await restCase('UC-AST-0079', async () => { const first = await success(request, 'list_assets', { issueId: issue.summary.id, page: { limit: 1 } }, zPageAssetView, 'viewer'); expect(first.totalMatching).toBe(2); expect(first.nextCursor).not.toBeNull(); const second = await success(request, 'list_assets', { issueId: issue.summary.id, page: { limit: 1, cursor: first.nextCursor! } }, zPageAssetView, 'viewer'); expect(second.totalMatching).toBe(2); expect(second.nextCursor).toBeNull(); expect(new Set([...first.items, ...second.items].map(value => value.id))).toEqual(new Set(ids)); expect(new Set([...first.items, ...second.items].map(value => value.kind))).toEqual(new Set(['image', 'file'])); });
});

async function historicalReviewerFixture(projectId: string, issueId: string, reviewerId: string, action: 'seed_vote' | 'unapprove') {
  const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database) || ![projectId, issueId, reviewerId].every(value => uuid.test(value))) throw new Error('Historical reviewer fixtures require a disposable database and owned records.');
  // This creates the retained historical precondition only. It is deliberately not
  // evidence that this owned reviewer submitted a vote through an identity client.
  // The independently tested vote service supplied the matching revision context.
  const sql = action === 'seed_vote'
    ? `INSERT INTO issue_approvals(project_id,issue_id,transition_id,issue_revision,workflow_revision,configuration_revision,approver_id,decision) SELECT project_id,issue_id,transition_id,issue_revision,workflow_revision,configuration_revision,'${reviewerId}','approve' FROM issue_approvals WHERE project_id='${projectId}' AND issue_id='${issueId}' AND approver_id='${memberId}' LIMIT 1;`
    : `UPDATE users SET approved_at=NULL WHERE id='${reviewerId}' AND NOT is_administrator AND EXISTS(SELECT 1 FROM issue_approvals WHERE project_id='${projectId}' AND issue_id='${issueId}' AND approver_id=users.id);`;
  const { execFile } = await import('node:child_process'), { promisify } = await import('node:util'), { resolve } = await import('node:path');
  const result = await promisify(execFile)('docker', ['compose', '-f', resolve('../compose.dev.yaml'), 'exec', '-T', 'postgres', 'psql', '--username=gategoldjira', '--dbname=' + database, '-v', 'ON_ERROR_STOP=1', '-c', sql]);
  expect(result.stdout.trim()).toBe(action === 'seed_vote' ? 'INSERT 0 1' : 'UPDATE 1');
}

for (const state of ['disabled', 'unapproved'] as const) test('REST review reads and moves exclude a retained historical reviewer after the owned account becomes ' + state, async ({ request }) => {
  const f = await review(request, { approvalsRequired: 2 }); await f.vote();
  const reviewer = (await success(request, 'approve_user', { email: crypto.randomUUID() + '@example.test', displayName: 'Owned historical reviewer', administrator: false, retryReference: crypto.randomUUID() }, zSavedUserView, 'owner')).result;
  await success(request, 'set_membership', { projectId: f.projectId, userId: reviewer.id, expectedRevision: '0', role: 'member', retryReference: crypto.randomUUID() }, zSavedMembershipView, 'owner');
  await historicalReviewerFixture(f.projectId, f.issue.summary.id, reviewer.id, 'seed_vote');
  await restCase(state === 'disabled' ? 'UC-APR-0034' : 'UC-APR-0035', async () => {
    const eligible = await f.context('owner'); expect(eligible.approved).toBe(2); expect(eligible.reviewSatisfied).toBe(true);
    if (state === 'disabled') await success(request, 'update_user', { userId: reviewer.id, expectedRevision: reviewer.revision, email: reviewer.email, displayName: reviewer.displayName, administrator: false, active: false, retryReference: crypto.randomUUID() }, zSavedUserView, 'owner');
    else await historicalReviewerFixture(f.projectId, f.issue.summary.id, reviewer.id, 'unapprove');
    const context = await f.context('owner'); expect(context.votes).toHaveLength(2); const retained = context.votes.find(value => value.approver.id === reviewer.id); expect(retained?.decision).toBe('approve'); expect(retained?.current).toBe(true); expect(retained?.eligible).toBe(false); expect(context.approved).toBe(1); expect(context.reviewSatisfied).toBe(false);
    await rejected(request, 'move_issue_v2', { issueId: f.issue.summary.id, expectedRevision: f.issue.summary.revision, targetStageId: f.edge.stage.id, retryReference: crypto.randomUUID() }, 'validation_failed', 'owner'); expect((await read(request, f.issue.summary.id)).summary.stage.category).toBe('todo');
  });
});

test('REST scoped related and blocker lookup pages retain their query and exact numeric intent', async ({ request }) => {
  const projectId = await coverageProject(request), otherProjectId = await coverageProject(request);
  await create(request, projectId, { title: 'Current unrelated issue' });
  const expected: ModernIssueView[] = [];
  for (let index = 0; index < 3; index++) expected.push(await create(request, projectId, { title: 'REST related candidate ' + index }));
  await create(request, otherProjectId, { title: 'REST related candidate foreign' });
  await restCase('UC-REL-0083', async () => { const page = await search(request, { projectIds: [projectId], query: 'REST related candidate' }); expect(new Set(page.items.map(value => value.id))).toEqual(new Set(expected.map(value => value.summary.id))); expect(page.items.every(value => value.projectId === projectId)).toBe(true); });
  await restCase('UC-REL-0082', async () => { let cursor: string | undefined; const ids: string[] = []; do { const page = await search(request, { projectIds: [projectId], query: 'REST related candidate', sort: 'created' }, 1, cursor); expect(page.items).toHaveLength(1); expect(page.totalMatching).toBe(3); ids.push(page.items[0]!.id); cursor = page.nextCursor ?? undefined; } while (cursor); expect(ids).toEqual([...expected].reverse().map(value => value.summary.id)); expect(new Set(ids).size).toBe(3); });
  const blocker = await create(request, projectId, { title: 'مهمة حاجبة مستقلة' }); await create(request, otherProjectId, { title: blocker.summary.title });
  await restCase('UC-REL-0084', async () => { const page = await search(request, { projectIds: [projectId], query: 'حاجبة' }); expect(page.items.map(value => value.id)).toEqual([blocker.summary.id]); expect(page.items[0]?.title).toBe(blocker.summary.title); });
  await restCase('UC-REL-0033', async () => { const page = await search(request, { projectIds: [projectId], query: '0000' + blocker.summary.number }); expect(page.items.map(value => value.id)).toEqual([blocker.summary.id]); expect(page.items[0]?.key).toBe(blocker.summary.key); });
});

test('REST expired upload progress remains readable while append/finalize cannot resume or publish it', async ({ request }) => {
  const projectId = await coverageProject(request), issue = await create(request, projectId);
  const session = (await success(request, 'start_asset_upload', { issueId: issue.summary.id, expectedBytes: '100', checksum: '0'.repeat(64), metadata: { kind: 'file', filename: 'expired.txt', mimeType: 'text/plain', description: '', publication: 'issue' }, retryReference: crypto.randomUUID() }, zSavedUploadSessionView)).result;
  await coverageExpireUpload(projectId, session.assetId);
  await restCase('UC-AST-0082', async () => { const current = await success(request, 'get_asset_upload', { sessionId: session.sessionId }, zUploadSessionView); expect(current.state).toBe('expired'); expect(current.receivedBytes).toBe('0'); await rejected(request, 'append_asset_chunk', { sessionId: session.sessionId, offset: '0', dataBase64: Buffer.from('Must not resume').toString('base64'), retryReference: crypto.randomUUID() }); await rejected(request, 'finalize_asset_upload', { sessionId: session.sessionId, retryReference: crypto.randomUUID() }); expect((await success(request, 'list_assets', { issueId: issue.summary.id }, zPageAssetView)).items).toEqual([]); });
});
