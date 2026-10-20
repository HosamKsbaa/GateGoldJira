import { expect, type APIRequestContext } from '@playwright/test';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable } from './support/session';
import { mcpSuccess, mcpFailure, callTool } from './support/coverage-access';
import { coverageProject, coverageLayoutDraft, coverageGet, coverageWrite, coverageHeaders, coverageFailure, coverageDenseBacklog, coverageRetireHistoricalStage } from './support/coverage-boards';
import type {
  AutomationRuleFields, DevelopmentLinkFields, IssueFilter, IssuePlanningFields,
  ModernCreateFields, ModernMoveFields, NativeMoveFields, PageRequest, PlanningCreateFields, OrganizeFields, MigrationFields, BacklogReorderFields,
  PlanningItemView, PlanningUpdateFields, SaveLayoutFields, SaveStageFields,
  SaveTransitionFields, SaveWorkflowFields, StageView, TransitionPolicy, SetBindingFields, SaveFieldFields, SaveTypeFields,
} from '../src/app/api/generated/types.gen';
import {
  zConfigurationView, zLayoutView, zModernIssueView, zNativeCardPage,
  zPageBoardSummary, zSavedBoardSummary, zSavedLayoutView, zSavedModernIssueView,
  zPageWorkflowView, zPageStageView, zPageTransitionView, zPageBindingView,
  zSavedWorkflowSaved, zSavedStageSaved, zSavedTransitionSaved,
  zTransitionPolicyView, zSavedTransitionPolicyView,
  zPagePlanningItemView, zSavedPlanningItemView, zIssuePlanningView,
  zSavedIssuePlanningView, zPagePlanningIssueSummary, zKanbanReport,
  zPageDevelopmentLinkView, zSavedDevelopmentLinkView,
  zPageAutomationRuleView, zSavedAutomationRuleView, zSavedNativeMoveResult,
  zSavedIssueView, zFailure, zConfigurationFailureBody, zPlanningFailureBody, zBacklogPage, zSavedBacklogChange, zPageUserSummary, zSavedMigrationResult, zSavedTypeSaved, zSavedMembershipView,
  zPageTypeView, zPagePriorityView, zSavedLabelView, zSavedDependencyView, zSavedConfigurationView, zSavedFieldSaved,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated PostgreSQL company and real MCP transport.');
test.use({ trace: 'off' });
test.describe.configure({ timeout: 120000 });

type Retry = { retryReference: string };
type Project = { projectId: string };
type Workflow = Project & { workflowId: string };
type Transition = Workflow & { transitionId: string };
type Paged = { page?: PageRequest };
type ToolInputs = {
  get_project_configuration: Project;
  list_workflows: Project & Paged & { includeRetired?: boolean };
  save_workflow: Workflow & Retry & SaveWorkflowFields;
  list_workflow_stages: Workflow & Paged & { includeRetired?: boolean };
  save_workflow_stage: Workflow & Retry & SaveStageFields & { stageId: string };
  list_workflow_transitions: Workflow & Paged & { includeRetired?: boolean };
  save_workflow_transition: Transition & Retry & SaveTransitionFields;
  get_transition_policy: Transition;
  save_transition_policy: Transition & Retry & { expectedRevision: string; policy: TransitionPolicy };
  list_type_workflow_bindings: Project & Paged & { typeId: string };
  set_type_workflow_binding: Workflow & Retry & SetBindingFields & { typeId: string };
  list_issue_types: Project & Paged & { includeRetired?: boolean };
  save_issue_type: Project & Retry & SaveTypeFields & { typeId: string };
  save_field: Project & Retry & SaveFieldFields & { fieldId: string };
  list_priorities: Project & Paged & { includeRetired?: boolean };
  create_label: Project & Retry & { name: string };
  add_dependency: Retry & { issueId: string; blockerId: string; expectedIssueRevision: string; expectedGraphRevision: string };
  list_boards: Project & Paged & { includeArchived?: boolean };
  create_board_v2: Project & Retry & { name: string; savedFilters: IssueFilter };
  get_board_v2: { boardId: string; temporaryFilters?: IssueFilter };
  save_board_layout_v2: Retry & SaveLayoutFields & { boardId: string };
  archive_board: Retry & { boardId: string; expectedRevision: string };
  restore_board: Retry & { boardId: string; expectedRevision: string };
  list_board_cards_v2: Paged & { boardId: string; columnId: string; temporaryFilters?: IssueFilter };
  move_board_card_v2: Retry & NativeMoveFields & { boardId: string };
  reorder_board_card_v2: Retry & NativeMoveFields & { boardId: string };
  create_issue_v2: Project & Retry & ModernCreateFields;
  get_issue_v2: { issueId: string };
  move_issue_v2: Retry & ModernMoveFields & { issueId: string };
  organize_issue: Retry & OrganizeFields & { issueId: string };
  list_backlog: Project & Paged;
  reorder_backlog: Retry & BacklogReorderFields & { issueId: string };
  list_assignees: Project & Paged & { query?: string };
  migrate_workflow_issues: Project & Retry & MigrationFields;
  create_planning_item: Project & Retry & PlanningCreateFields;
  update_planning_item: Project & Retry & PlanningUpdateFields & { planningId: string };
  list_planning_items: Project & Paged & { kind?: 'epic' | 'release' };
  list_planning_issues: Project & Paged & { planningId: string };
  get_issue_planning: { issueId: string };
  set_issue_planning: Retry & IssuePlanningFields & { issueId: string };
  get_kanban_report: Project & Paged & { from: string; through: string };
  list_development_links: Paged & { issueId: string };
  save_development_link: Retry & DevelopmentLinkFields & { issueId: string; linkId: string };
  list_automation_rules: Project & Paged;
  save_automation_rule: Project & Retry & AutomationRuleFields & { ruleId: string };
};

function success<N extends keyof ToolInputs, S extends z.ZodType>(
  request: APIRequestContext, name: N, args: ToolInputs[N], schema: S, role = 'owner',
): Promise<z.output<S>> {
  // This validates both MCP text and structuredContent, including JSON-RPC identity.
  return mcpSuccess(request, name, args, schema, role);
}

const errorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
function rejected(request: APIRequestContext, name: keyof ToolInputs, deliberatelyInvalid: object, code = 'validation_failed', role = 'owner') {
  // Deliberately malformed inputs cannot satisfy ToolInputs; only failure calls accept object.
  return mcpFailure(request, name, deliberatelyInvalid, errorBody, code, role);
}
const mcpCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'mcp');
const retry = (): Retry => ({ retryReference: crypto.randomUUID() });
const memberId = '10000000-0000-4000-8000-000000000002';
const ownerId = '10000000-0000-4000-8000-000000000001';
const viewerId = '10000000-0000-4000-8000-000000000003';
const emptyPolicy: TransitionPolicy = { requiredSystemFields: [], requiredFieldIds: [], approvalsRequired: 0, approverRole: null, excludeIssueReporter: false };
async function configuration(request: APIRequestContext, projectId: string) {
  return success(request, 'get_project_configuration', { projectId }, zConfigurationView);
}
async function workflow(request: APIRequestContext, projectId: string, workflowId: string, name: string, retired = false) {
  return (await success(request, 'save_workflow', { projectId, workflowId, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, name, retired }, zSavedWorkflowSaved)).result.workflow;
}
function stageFields(stage: StageView): Omit<SaveStageFields, 'expectedRevision'> {
  return { name: stage.name, category: stage.category, position: stage.position, initial: stage.initial, acceptsEntries: stage.acceptsEntries, retired: stage.retired };
}
async function stage(request: APIRequestContext, projectId: string, workflowId: string, stageId: string, fields: Omit<SaveStageFields, 'expectedRevision'>) {
  return (await success(request, 'save_workflow_stage', { projectId, workflowId, stageId, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, ...fields }, zSavedStageSaved)).result.stage;
}
async function transition(request: APIRequestContext, projectId: string, workflowId: string, transitionId: string, fields: Omit<SaveTransitionFields, 'expectedRevision'>) {
  return (await success(request, 'save_workflow_transition', { projectId, workflowId, transitionId, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, ...fields }, zSavedTransitionSaved)).result.transition;
}
async function customWorkflow(request: APIRequestContext, projectId: string) {
  const savedWorkflow = await workflow(request, projectId, crypto.randomUUID(), 'MCP workflow ' + crypto.randomUUID().slice(0, 6));
  const stages: StageView[] = [];
  for (const [index, category] of (['todo', 'in_progress', 'review', 'done'] as const).entries()) {
    stages.push(await stage(request, projectId, savedWorkflow.id, crypto.randomUUID(), { name: 'MCP ' + category, category, position: String(index + 1), initial: index === 0, acceptsEntries: true, retired: false }));
  }
  const first = stages[0]!, last = stages[3]!;
  const edge = await transition(request, projectId, savedWorkflow.id, crypto.randomUUID(), { fromStageId: first.id, toStageId: last.id, requiredPermission: null, retired: false });
  return { workflow: savedWorkflow, stages, first, last, transition: edge };
}
async function allowWorkflow(request: APIRequestContext, projectId: string, fixture: Awaited<ReturnType<typeof customWorkflow>>) {
  for (const choice of fixture.stages.slice(1, 3)) await transition(request, projectId, fixture.workflow.id, crypto.randomUUID(), { fromStageId: choice.id, toStageId: fixture.last.id, requiredPermission: null, retired: false });
  const directory = await success(request, 'list_boards', { projectId }, zPageBoardSummary), boardId = directory.items.find(value => value.default)!.id;
  const view = await success(request, 'get_board_v2', { boardId }, zLayoutView), draft = coverageLayoutDraft(view);
  for (const choice of fixture.stages) draft.columns.find(column => view.columns.find(value => value.id === column.id)!.stages.some(mapping => mapping.stage.category === choice.category))!.stageIds.push(choice.id);
  await success(request, 'save_board_layout_v2', { boardId, ...retry(), ...draft }, zSavedLayoutView);
  const typeId = (await success(request, 'list_issue_types', { projectId }, zPageTypeView)).items.find(value => value.key === 'task')!.id;
  await success(request, 'set_type_workflow_binding', { projectId, workflowId: fixture.workflow.id, typeId, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, default: false, acceptsNew: true }, zSavedConfigurationView);
  return typeId;
}
async function board(request: APIRequestContext, projectId: string, name = 'MCP independent board') {
  return (await success(request, 'create_board_v2', { projectId, name, savedFilters: {}, ...retry() }, zSavedLayoutView, 'member')).result;
}
async function issue(request: APIRequestContext, projectId: string, fields: ModernCreateFields = { title: 'MCP issue' }) {
  return (await success(request, 'create_issue_v2', { projectId, ...fields, ...retry() }, zSavedModernIssueView, 'member')).result;
}
async function createPlanning(request: APIRequestContext, projectId: string, fields: Partial<PlanningCreateFields> = {}) {
  return (await success(request, 'create_planning_item', { projectId, ...retry(), kind: 'epic', name: 'MCP epic', description: '', targetDate: null, status: 'planned', ...fields }, zSavedPlanningItemView, 'member')).result;
}
async function updatePlanning(request: APIRequestContext, item: PlanningItemView, fields: Partial<PlanningUpdateFields> = {}) {
  return (await success(request, 'update_planning_item', { projectId: item.projectId, planningId: item.id, ...retry(), expectedRevision: item.revision, name: item.name, description: item.description, targetDate: item.targetDate, status: item.status, ...fields }, zSavedPlanningItemView, 'member')).result;
}


type Channel = 'rest' | 'mcp';
type RestCall = { method: 'GET' | 'POST' | 'PUT'; path: string; body?: object; status?: number };
async function contract<N extends keyof ToolInputs, S extends z.ZodType>(request: APIRequestContext, channel: Channel, name: N, args: ToolInputs[N], schema: S, rest: RestCall, role = 'member'): Promise<z.output<S>> {
  if (channel === 'mcp') return success(request, name, args, schema, role);
  const headers: Record<string, string> = await coverageHeaders(role); if (argsHasRetry(args)) headers['Idempotency-Key'] = args.retryReference;
  const response = await request.fetch(apiOrigin + rest.path, { method: rest.method, data: rest.body, headers }); expect(response.status(), name).toBe(rest.status ?? 200); return schema.parse(await response.json());
}
function argsHasRetry(args: object): args is Retry { return 'retryReference' in args && typeof args.retryReference === 'string'; }
const typedFailure = z.object({ error: zFailure, current: z.unknown().optional() }).passthrough();
async function contractFailure(request: APIRequestContext, channel: Channel, name: keyof ToolInputs, args: object, rest: RestCall, code = 'validation_failed', role = 'member') {
  if (channel === 'mcp') return mcpFailure(request, name, args, typedFailure, code, role);
  const status = code === 'conflict' ? 409 : code === 'forbidden' ? 403 : code === 'unavailable_record' ? 404 : 422;
  const response = await request.fetch(apiOrigin + rest.path, { method: rest.method, data: rest.body, headers: await coverageHeaders(role) }); await coverageFailure(response, status, code); return typedFailure.parse(await response.json());
}
const surfaceCase = <T>(channel: Channel, id: string, body: () => Promise<T>) => useCase(id, body, channel);

for (const channel of ['rest', 'mcp'] as const) test(channel + ' atomic board moves, ambiguous destinations and stale layouts have distinct service assertions', async ({ request }) => {
  const projectId = await coverageProject(request); let view = await board(request, projectId);
  let record = await issue(request, projectId, { title: channel + ' atomic board command' });
  const getBoard = () => contract(request, channel, 'get_board_v2', { boardId: view.board.id }, zLayoutView, { method: 'GET', path: `/api/v2/boards/${view.board.id}` });
  const getIssue = () => contract(request, channel, 'get_issue_v2', { issueId: record.summary.id }, zModernIssueView, { method: 'GET', path: `/api/v2/issues/${record.summary.id}` });
  const fields = (targetId: string): NativeMoveFields => {
    const source = view.columns.find(column => column.stages.some(value => value.stage.id === record.summary.stage.id))!, target = view.columns.find(column => column.id === targetId)!;
    return { issueId: record.summary.id, expectedIssueRevision: record.summary.revision, expectedBoardRevision: view.board.revision, sourceColumnId: source.id, expectedSourceOrderRevision: source.orderRevision, targetColumnId: target.id, expectedTargetOrderRevision: target.orderRevision, targetStageId: null, neighborIssueId: null, placement: 'last' };
  };
  view = await getBoard();
  await surfaceCase(channel, 'UC-BRD-0102', async () => {
    const target = view.columns.find(column => column.stages.some(value => value.stage.category === 'in_progress'))!, body = fields(target.id);
    const saved = await contract(request, channel, 'move_board_card_v2', { boardId: view.board.id, ...retry(), ...body }, zSavedNativeMoveResult, { method: 'POST', path: `/api/v2/boards/${view.board.id}/cards/move`, body }); record = saved.result.issue; view = saved.result.layout;
    expect(record.summary.stage.category).toBe('in_progress'); expect((await getIssue()).summary.stage.id).toBe(record.summary.stage.id);
    const fresh = await getBoard(), targetPage = await contract(request, channel, 'list_board_cards_v2', { boardId: view.board.id, columnId: target.id }, zNativeCardPage, { method: 'POST', path: `/api/v2/boards/${view.board.id}/columns/${target.id}/search`, body: { temporaryFilters: {} } }); expect(fresh.columns.find(value => value.id === target.id)!.savedMatchCount).toBe(1); expect(targetPage.items.map(value => value.id)).toEqual([record.summary.id]);
  });
  // Fresh independent issue keeps both grouped destination stages eligible from To do.
  record = await issue(request, projectId, { title: channel + ' ambiguous move probe' }); view = await getBoard();
  const draft = coverageLayoutDraft(view), doing = draft.columns.find(column => view.columns.find(value => value.id === column.id)!.stages.some(value => value.stage.category === 'in_progress'))!, review = draft.columns.find(column => view.columns.find(value => value.id === column.id)!.stages.some(value => value.stage.category === 'review'))!;
  const explicitStage = review.stageIds[0]!; doing.stageIds.push(...review.stageIds); draft.columns = draft.columns.filter(column => column.id !== review.id);
  view = (await contract(request, channel, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...draft }, zSavedLayoutView, { method: 'PUT', path: `/api/v2/boards/${view.board.id}/layout`, body: draft })).result;
  await surfaceCase(channel, 'UC-BRD-0103', async () => {
    const body = fields(doing.id), before = await getIssue();
    await contractFailure(request, channel, 'move_board_card_v2', { boardId: view.board.id, ...retry(), ...body }, { method: 'POST', path: `/api/v2/boards/${view.board.id}/cards/move`, body }); expect((await getIssue()).summary).toEqual(before.summary);
    const explicit = { ...body, targetStageId: explicitStage }, saved = await contract(request, channel, 'move_board_card_v2', { boardId: view.board.id, ...retry(), ...explicit }, zSavedNativeMoveResult, { method: 'POST', path: `/api/v2/boards/${view.board.id}/cards/move`, body: explicit }); record = saved.result.issue; view = saved.result.layout; expect(record.summary.stage.id).toBe(explicitStage);
  });
  const empty = crypto.randomUUID(), layout = coverageLayoutDraft(view); layout.columns.push({ id: empty, name: 'No eligible stage', stageIds: [], wipLimit: null, wipMode: 'warn' });
  view = (await contract(request, channel, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...layout }, zSavedLayoutView, { method: 'PUT', path: `/api/v2/boards/${view.board.id}/layout`, body: layout })).result;
  await surfaceCase(channel, 'UC-BRD-0105', async () => {
    const before = await getIssue(), beforeLayout = await getBoard(), body = fields(empty);
    await contractFailure(request, channel, 'move_board_card_v2', { boardId: view.board.id, ...retry(), ...body }, { method: 'POST', path: `/api/v2/boards/${view.board.id}/cards/move`, body }); expect((await getIssue()).summary).toEqual(before.summary); expect((await getBoard()).columns.map(column => [column.id, column.orderRevision])).toEqual(beforeLayout.columns.map(column => [column.id, column.orderRevision]));
  });
  await surfaceCase(channel, 'UC-BRD-0106', async () => {
    const stale = coverageLayoutDraft(view), accepted = { ...stale, name: 'Current accepted ' + channel + ' layout' };
    const saved = await contract(request, channel, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...accepted }, zSavedLayoutView, { method: 'PUT', path: `/api/v2/boards/${view.board.id}/layout`, body: accepted });
    const conflict = await contractFailure(request, channel, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...stale, name: 'Stale rejected layout' }, { method: 'PUT', path: `/api/v2/boards/${view.board.id}/layout`, body: { ...stale, name: 'Stale rejected layout' } }, 'conflict'); expect(conflict.error.nextAction).toBe('reload_current_state'); expect(conflict.current).toBeNull(); const current = await getBoard(); expect(current.board.name).toBe(accepted.name); expect(current.board.revision).toBe(saved.result.board.revision);
  });
  await surfaceCase(channel, 'UC-BRD-0104', async () => {
    const read = await contract(request, channel, 'get_board_v2', { boardId: view.board.id }, zLayoutView, { method: 'GET', path: `/api/v2/boards/${view.board.id}` }, 'viewer'); expect(read.board.canManage).toBe(false);
    const column = read.columns.find(column => column.stages.some(value => value.stage.id === record.summary.stage.id))!, cards = await contract(request, channel, 'list_board_cards_v2', { boardId: view.board.id, columnId: column.id }, zNativeCardPage, { method: 'POST', path: `/api/v2/boards/${view.board.id}/columns/${column.id}/search`, body: { temporaryFilters: {} } }, 'viewer'); expect(cards.items.map(value => value.id)).toContain(record.summary.id);
    const current = await getBoard(); view = current; const body = fields(current.columns.find(value => value.stages.some(mapping => mapping.stage.category === 'done'))!.id);
    await contractFailure(request, channel, 'move_board_card_v2', { boardId: view.board.id, ...retry(), ...body }, { method: 'POST', path: `/api/v2/boards/${view.board.id}/cards/move`, body }, 'forbidden', 'viewer'); expect((await getIssue()).summary.stage.id).toBe(record.summary.stage.id);
  });
});

for (const channel of ['rest', 'mcp'] as const) test(channel + ' configuration receipts and conflicts retain exact accepted workflow state', async ({ request }) => {
  const projectId = await coverageProject(request), workflowId = crypto.randomUUID(), before = await configuration(request, projectId), body = { expectedRevision: before.revision, name: channel + ' workflow retry', retired: false }, args = { projectId, workflowId, ...retry(), ...body };
  await surfaceCase(channel, 'UC-WFL-0096', async () => {
    const rest = { method: 'PUT' as const, path: `/api/v2/projects/${projectId}/workflows/${workflowId}`, body };
    const first = await contract(request, channel, 'save_workflow', args, zSavedWorkflowSaved, rest, 'owner'), confirmed = await contract(request, channel, 'save_workflow', args, zSavedWorkflowSaved, rest, 'owner'); expect(confirmed.result).toEqual(first.result); expect(confirmed.receipt.replayed).toBe(true); expect(confirmed.receipt.eventId).toBe(first.receipt.eventId); expect((await configuration(request, projectId)).revision).toBe(first.result.configuration.revision);
  });
  await surfaceCase(channel, 'UC-WFL-0097', async () => {
    const accepted = await workflow(request, projectId, workflowId, channel + ' current workflow');
    const stale = { ...body, name: 'Stale workflow overwrite' };
    const conflict = zConfigurationFailureBody.parse(await contractFailure(request, channel, 'save_workflow', { projectId, workflowId, ...retry(), ...stale }, { method: 'PUT', path: `/api/v2/projects/${projectId}/workflows/${workflowId}`, body: stale }, 'conflict', 'owner')); expect(conflict.current!.revision).toBe((await configuration(request, projectId)).revision);
    const listed = await contract(request, channel, 'list_workflows', { projectId }, zPageWorkflowView, { method: 'GET', path: `/api/v2/projects/${projectId}/workflows` }); expect(listed.items.find(value => value.id === workflowId)!.name).toBe(accepted.name); expect((await configuration(request, projectId)).revision).not.toBe(body.expectedRevision);
  });
});

for (const channel of ['rest', 'mcp'] as const) test(channel + ' backlog relative order commands preserve issue content and deny current viewers', async ({ request }) => {
  const projectId = await coverageProject(request), a = await issue(request, projectId, { title: channel + ' planned A', backlog: true }), b = await issue(request, projectId, { title: channel + ' planned B', backlog: true }), active = await issue(request, projectId, { title: channel + ' independent active board work' }), view = await board(request, projectId);
  const read = (role = 'member') => contract(request, channel, 'list_backlog', { projectId }, zBacklogPage, { method: 'GET', path: `/api/v1/projects/${projectId}/backlog` }, role);
  const activeColumn = view.columns.find(column => column.stages.some(value => value.stage.category === 'todo'))!;
  const activeOrder = async () => (await contract(request, channel, 'list_board_cards_v2', { boardId: view.board.id, columnId: activeColumn.id }, zNativeCardPage, { method: 'POST', path: `/api/v2/boards/${view.board.id}/columns/${activeColumn.id}/search`, body: { temporaryFilters: {} } })).items.map(value => value.id);
  for (const [id, before, expected] of [['UC-BLG-0038', true, [b.summary.id, a.summary.id]], ['UC-BLG-0039', false, [a.summary.id, b.summary.id]]] as const) await surfaceCase(channel, id, async () => {
    const latest = await read(), prior = await success(request, 'get_issue_v2', { issueId: b.summary.id }, zModernIssueView, 'member'), body = { expectedRevision: prior.summary.revision, expectedOrderRevision: latest.orderRevision, neighborId: a.summary.id, before };
    await contract(request, channel, 'reorder_backlog', { issueId: b.summary.id, ...retry(), ...body }, zSavedBacklogChange, { method: 'POST', path: `/api/v1/issues/${b.summary.id}/backlog-order`, body });
    expect((await read()).items.map(value => value.id)).toEqual(expected);
    const after = await success(request, 'get_issue_v2', { issueId: b.summary.id }, zModernIssueView, 'member');
    const { revision: priorRevision, updatedAt: priorUpdatedAt, ...priorContent } = prior.summary;
    const { revision, updatedAt, ...content } = after.summary;
    expect({ ...after, summary: content }).toEqual({ ...prior, summary: priorContent });
    expect(BigInt(revision)).toBe(BigInt(priorRevision) + 1n);
    expect(Date.parse(updatedAt)).toBeGreaterThanOrEqual(Date.parse(priorUpdatedAt));
    expect(await activeOrder()).toEqual([active.summary.id]);
  });
  await surfaceCase(channel, 'UC-BLG-0040', async () => {
    expect((await read('viewer')).items.map(value => value.id)).toEqual([a.summary.id, b.summary.id]);
    const create = { title: 'Denied viewer planned issue', backlog: true }; await contractFailure(request, channel, 'create_issue_v2', { projectId, ...retry(), ...create }, { method: 'POST', path: `/api/v2/projects/${projectId}/issues`, body: create }, 'forbidden', 'viewer');
    const activate = { expectedRevision: a.summary.revision, backlog: false }; await contractFailure(request, channel, 'organize_issue', { issueId: a.summary.id, ...retry(), ...activate }, { method: 'POST', path: `/api/v1/issues/${a.summary.id}/organize`, body: activate }, 'forbidden', 'viewer'); expect((await read()).items.map(value => value.id)).toEqual([a.summary.id, b.summary.id]);
  });
});

for (const channel of ['rest', 'mcp'] as const) test(channel + ' stale issue-planning revisions preserve both accepted relationships', async ({ request }) => {
  const projectId = await coverageProject(request), record = await issue(request, projectId), epicA = await createPlanning(request, projectId, { name: 'Current service epic' }), epicB = await createPlanning(request, projectId, { name: 'Rejected stale epic' }), release = await createPlanning(request, projectId, { name: 'Current service release', kind: 'release' });
  await surfaceCase(channel, 'UC-PLN-0090', async () => {
    const body = { expectedRevision: '0', epicId: epicA.id, releaseId: release.id }, accepted = await contract(request, channel, 'set_issue_planning', { issueId: record.summary.id, ...retry(), ...body }, zSavedIssuePlanningView, { method: 'PUT', path: `/api/v1/issues/${record.summary.id}/planning`, body });
    const stale = { ...body, epicId: epicB.id, releaseId: null }; const conflict = await contractFailure(request, channel, 'set_issue_planning', { issueId: record.summary.id, ...retry(), ...stale }, { method: 'PUT', path: `/api/v1/issues/${record.summary.id}/planning`, body: stale }, 'conflict'); expect(conflict.error.nextAction).toBe('reload_current_state'); expect(conflict.current).toBeNull(); const current = await contract(request, channel, 'get_issue_planning', { issueId: record.summary.id }, zIssuePlanningView, { method: 'GET', path: `/api/v1/issues/${record.summary.id}/planning` }); expect(current).toEqual(accepted.result); expect(current).toMatchObject({ epicId: epicA.id, releaseId: release.id, revision: accepted.result.revision });
  });
});

for (const channel of ['rest', 'mcp'] as const) test(channel + ' eligible-assignee cursor scopes and viewer development permissions use real service data', async ({ request }) => {
  const projectId = await coverageProject(request), record = await issue(request, projectId), linkId = crypto.randomUUID(), fields: DevelopmentLinkFields = { expectedRevision: '0', url: 'https://example.com/current', title: 'Visible protected link', kind: 'other', removed: false };
  await success(request, 'save_development_link', { issueId: record.summary.id, linkId, ...retry(), ...fields }, zSavedDevelopmentLinkView, 'member');
  await surfaceCase(channel, 'UC-INT-0064', async () => {
    const first = await contract(request, channel, 'list_assignees', { projectId, page: { limit: 1 } }, zPageUserSummary, { method: 'GET', path: `/api/v1/projects/${projectId}/assignees?limit=1` }); expect(first.items).toHaveLength(1); expect(first.nextCursor).not.toBeNull(); const next = await contract(request, channel, 'list_assignees', { projectId, page: { limit: 1, cursor: first.nextCursor! } }, zPageUserSummary, { method: 'GET', path: `/api/v1/projects/${projectId}/assignees?limit=1&cursor=${encodeURIComponent(first.nextCursor!)}` }); expect(next.items).toHaveLength(1); expect(next.items[0]!.id).not.toBe(first.items[0]!.id); expect([first.items[0]!.id, next.items[0]!.id].sort()).toEqual([memberId, ownerId].sort());
  });
  await surfaceCase(channel, 'UC-INT-0065', async () => {
    const list = await contract(request, channel, 'list_development_links', { issueId: record.summary.id }, zPageDevelopmentLinkView, { method: 'GET', path: `/api/v1/issues/${record.summary.id}/development-links` }, 'viewer'); expect(list.items.find(value => value.id === linkId)).toMatchObject({ title: fields.title, url: fields.url });
    await contractFailure(request, channel, 'save_development_link', { issueId: record.summary.id, linkId: crypto.randomUUID(), ...retry(), ...fields }, { method: 'PUT', path: `/api/v1/issues/${record.summary.id}/development-links/${crypto.randomUUID()}`, body: fields }, 'forbidden', 'viewer'); expect((await success(request, 'list_development_links', { issueId: record.summary.id }, zPageDevelopmentLinkView, 'member')).totalMatching).toBe(1);
  });
});

test('MCP type bindings preserve default coverage, existing issues and bounded same-category migration', async ({ request }) => {
  const projectId = await coverageProject(request), f = await customWorkflow(request, projectId), workflowId = f.workflow.id;
  const typeId = (await success(request, 'list_issue_types', { projectId }, zPageTypeView)).items.find(value => value.key === 'task')!.id;
  const bindings = await success(request, 'list_type_workflow_bindings', { projectId, typeId }, zPageBindingView), priorDefault = bindings.items.find(value => value.default)!;
  const original = await issue(request, projectId, { title: 'MCP retained original workflow', typeId });
  const retainedWorkflow = await workflow(request, projectId, crypto.randomUUID(), 'MCP retained closed binding');
  await success(request, 'set_type_workflow_binding', { projectId, typeId, workflowId: retainedWorkflow.id, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, default: false, acceptsNew: false }, zSavedConfigurationView);
  await workflow(request, projectId, retainedWorkflow.id, retainedWorkflow.name, true);
  await mcpCase('UC-WFL-0007', async () => {
    const first = await success(request, 'list_type_workflow_bindings', { projectId, typeId, page: { limit: 1 } }, zPageBindingView, 'viewer');
    expect(first.items).toHaveLength(1); expect(first.nextCursor).not.toBeNull();
    const second = await success(request, 'list_type_workflow_bindings', { projectId, typeId, page: { limit: 1, cursor: first.nextCursor! } }, zPageBindingView, 'viewer');
    expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeNull();
    const actual = [...first.items, ...second.items];
    expect(new Set(actual.map(value => value.workflowId))).toEqual(new Set([priorDefault.workflowId, retainedWorkflow.id]));
    expect(actual.find(value => value.workflowId === priorDefault.workflowId)).toEqual(priorDefault);
    expect(actual.find(value => value.workflowId === retainedWorkflow.id)).toEqual({ projectId, typeId, workflowId: retainedWorkflow.id, default: false, acceptsNew: false });
    const reread = await success(request, 'list_type_workflow_bindings', { projectId, typeId, page: { limit: 1 } }, zPageBindingView, 'viewer');
    expect(reread.items).toEqual(first.items); expect(reread.nextCursor).not.toBeNull();
    expect((await success(request, 'list_workflows', { projectId, includeRetired: true }, zPageWorkflowView, 'viewer')).items.find(value => value.id === retainedWorkflow.id)).toMatchObject({ id: retainedWorkflow.id, retired: true });
    expect((await success(request, 'get_issue_v2', { issueId: original.summary.id }, zModernIssueView, 'viewer')).summary.workflow).toEqual(original.summary.workflow);
  });
  for (const choice of f.stages.slice(1, 3)) await transition(request, projectId, workflowId, crypto.randomUUID(), { fromStageId: choice.id, toStageId: f.last.id, requiredPermission: null, retired: false });
  const nextInitial = await stage(request, projectId, workflowId, crypto.randomUUID(), { name: 'MCP new initial', category: 'todo', position: '5', initial: false, acceptsEntries: true, retired: false });
  await transition(request, projectId, workflowId, crypto.randomUUID(), { fromStageId: nextInitial.id, toStageId: f.last.id, requiredPermission: null, retired: false });
  await transition(request, projectId, workflowId, crypto.randomUUID(), { fromStageId: nextInitial.id, toStageId: f.stages[2]!.id, requiredPermission: null, retired: false });
  await mcpCase('UC-WFL-0023', async () => { const saved = await stage(request, projectId, workflowId, nextInitial.id, { ...stageFields(nextInitial), initial: true }); expect(saved.initial).toBe(true); const current = await success(request, 'list_workflow_stages', { projectId, workflowId }, zPageStageView); expect(current.items.filter(value => value.initial).map(value => value.id)).toEqual([nextInitial.id]); expect(current.items.find(value => value.id === f.first.id)!.initial).toBe(false); });
  const bind = async (targetWorkflow: string, defaultValue: boolean, acceptsNew: boolean) => success(request, 'set_type_workflow_binding', { projectId, typeId, workflowId: targetWorkflow, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, default: defaultValue, acceptsNew }, zSavedConfigurationView);
  await mcpCase('UC-WFL-0070', async () => {
    await rejected(request, 'set_type_workflow_binding', { projectId, typeId, workflowId, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, default: false, acceptsNew: true }); expect((await success(request, 'list_type_workflow_bindings', { projectId, typeId }, zPageBindingView)).items.some(value => value.workflowId === workflowId)).toBe(false);
  });
  const defaultBoardId = (await success(request, 'list_boards', { projectId }, zPageBoardSummary)).items.find(value => value.default)!.id;
  let layout = await success(request, 'get_board_v2', { boardId: defaultBoardId }, zLayoutView); const draft = coverageLayoutDraft(layout);
  for (const choice of [...f.stages, nextInitial]) draft.columns.find(column => layout.columns.find(value => value.id === column.id)!.stages.some(value => value.stage.category === choice.category))!.stageIds.push(choice.id);
  await mcpCase('UC-BRD-0012', async () => {
    const saved = await success(request, 'save_board_layout_v2', { boardId: defaultBoardId, ...retry(), ...draft }, zSavedLayoutView); expect(new Set(saved.result.columns.flatMap(column => column.stages.map(value => value.workflow.id))).size).toBe(2); expect((await success(request, 'get_issue_v2', { issueId: original.summary.id }, zModernIssueView, 'member')).summary.workflow.id).toBe(priorDefault.workflowId); layout = saved.result;
  });
  await mcpCase('UC-WFL-0034', async () => {
    await bind(workflowId, false, true); const created = await issue(request, projectId, { title: 'MCP explicit bound workflow', typeId, workflowId }); expect(created.summary.workflow.id).toBe(workflowId); expect(created.summary.stage.id).toBe(nextInitial.id);
  });
  await mcpCase('UC-WFL-0094', async () => { const first = await success(request, 'list_type_workflow_bindings', { projectId, typeId, page: { limit: 1 } }, zPageBindingView); expect(first.items).toHaveLength(1); expect(first.nextCursor).not.toBeNull(); const next = await success(request, 'list_type_workflow_bindings', { projectId, typeId, page: { limit: 1, cursor: first.nextCursor! } }, zPageBindingView); expect(next.items).toHaveLength(1); expect(next.items[0]!.workflowId).not.toBe(first.items[0]!.workflowId); });
  await mcpCase('UC-WFL-0066', async () => { await rejected(request, 'set_type_workflow_binding', { projectId, typeId, workflowId, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, default: true, acceptsNew: false }); });
  await mcpCase('UC-WFL-0035', async () => { await bind(workflowId, true, true); const created = await issue(request, projectId, { title: 'MCP default binding creation', typeId }); expect(created.summary.workflow.id).toBe(workflowId); expect(created.summary.stage.id).toBe(nextInitial.id); expect((await success(request, 'get_issue_v2', { issueId: original.summary.id }, zModernIssueView, 'member')).summary.workflow.id).toBe(priorDefault.workflowId); });
  await mcpCase('UC-WFL-0067', async () => { await rejected(request, 'set_type_workflow_binding', { projectId, typeId, workflowId, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, default: false, acceptsNew: false }); });
  await mcpCase('UC-WFL-0071', async () => { await rejected(request, 'save_workflow', { projectId, workflowId, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, name: f.workflow.name, retired: true }); });
  await mcpCase('UC-WFL-0065', async () => { const current = (await success(request, 'list_workflow_stages', { projectId, workflowId }, zPageStageView)).items.find(value => value.initial)!; await rejected(request, 'save_workflow_stage', { projectId, workflowId, stageId: current.id, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, ...stageFields(current), initial: false, acceptsEntries: false }); });
  await mcpCase('UC-WFL-0064', async () => { await rejected(request, 'save_workflow_transition', { projectId, workflowId, transitionId: f.transition.id, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, fromStageId: f.transition.fromStageId, toStageId: f.transition.toStageId, requiredPermission: null, retired: true }); expect((await success(request, 'list_workflow_transitions', { projectId, workflowId }, zPageTransitionView)).items.some(value => value.id === f.transition.id && !value.retired)).toBe(true); });
  await mcpCase('UC-WFL-0036', async () => {
    await bind(priorDefault.workflowId, false, false); expect((await success(request, 'get_issue_v2', { issueId: original.summary.id }, zModernIssueView, 'member')).summary.workflow.id).toBe(priorDefault.workflowId); await rejected(request, 'create_issue_v2', { projectId, title: 'Closed old binding', typeId, workflowId: priorDefault.workflowId, ...retry() }, 'validation_failed', 'member');
  });
  const source = f.stages[2]!, issues = [await issue(request, projectId, { title: 'MCP migration A', typeId }), await issue(request, projectId, { title: 'MCP migration B', typeId })];
  for (const record of issues) await success(request, 'move_issue_v2', { issueId: record.summary.id, expectedRevision: record.summary.revision, targetStageId: source.id, ...retry() }, zSavedModernIssueView, 'member');
  const target = await stage(request, projectId, priorDefault.workflowId, crypto.randomUUID(), { name: 'MCP retained target', category: 'review', position: '10', initial: false, acceptsEntries: false, retired: false });
  const oldDone = (await success(request, 'list_workflow_stages', { projectId, workflowId: priorDefault.workflowId }, zPageStageView)).items.find(value => value.category === 'done')!;
  await transition(request, projectId, priorDefault.workflowId, crypto.randomUUID(), { fromStageId: target.id, toStageId: oldDone.id, requiredPermission: null, retired: false });
  layout = await success(request, 'get_board_v2', { boardId: defaultBoardId }, zLayoutView); const mapped = coverageLayoutDraft(layout); mapped.columns.find(column => layout.columns.find(value => value.id === column.id)!.stages.some(value => value.stage.category === 'review'))!.stageIds.push(target.id); await success(request, 'save_board_layout_v2', { boardId: defaultBoardId, ...retry(), ...mapped }, zSavedLayoutView);
  await stage(request, projectId, priorDefault.workflowId, target.id, { ...stageFields(target), acceptsEntries: true }); await stage(request, projectId, workflowId, source.id, { ...stageFields(source), acceptsEntries: false });
  await mcpCase('UC-WFL-0059', async () => { await rejected(request, 'save_workflow_stage', { projectId, workflowId, stageId: source.id, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, ...stageFields(source), acceptsEntries: false, retired: true }); });
  await mcpCase('UC-WFL-0074', async () => { await rejected(request, 'migrate_workflow_issues', { projectId, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, sourceStageId: source.id, targetStageId: f.last.id, limit: 1 }); });
  const incompatible = await customWorkflow(request, projectId);
  await mcpCase('UC-WFL-0076', async () => { await rejected(request, 'migrate_workflow_issues', { projectId, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, sourceStageId: source.id, targetStageId: incompatible.stages[2]!.id, limit: 1 }); });
  await bind(priorDefault.workflowId, false, true);
  for (const [id, remaining] of [['UC-WFL-0038', 1], ['UC-WFL-0039', 0]] as const) await mcpCase(id, async () => {
    const args = { projectId, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, sourceStageId: source.id, targetStageId: target.id, limit: 1 }, migrated = await success(request, 'migrate_workflow_issues', args, zSavedMigrationResult); expect(migrated.result).toMatchObject({ moved: 1n, remaining: BigInt(remaining) });
    const current = await Promise.all(issues.map(record => success(request, 'get_issue_v2', { issueId: record.summary.id }, zModernIssueView, 'member'))); expect(current.filter(value => value.summary.stage.id === target.id)).toHaveLength(2 - remaining); expect(current.filter(value => value.summary.stage.id === source.id)).toHaveLength(remaining);
  });
});

test('MCP remaining workflow guards refuse incompatible retained and malformed configuration', async ({ request }) => {
  const projectId = await coverageProject(request), f = await customWorkflow(request, projectId), other = await customWorkflow(request, projectId);
  for (const [id, fields] of [
    ['UC-WFL-0072', { sourceStageId: f.first.id, targetStageId: other.first.id, limit: 1 }],
    ['UC-WFL-0073', { sourceStageId: f.first.id, targetStageId: f.first.id, limit: 1 }],
    ['UC-WFL-0077', { sourceStageId: f.first.id, targetStageId: other.first.id, limit: 101 }],
    ['UC-WFL-0078', { sourceStageId: f.first.id, targetStageId: other.first.id, limit: 0 }],
  ] as const) await mcpCase(id, async () => { const before = await configuration(request, projectId); await rejected(request, 'migrate_workflow_issues', { projectId, ...retry(), expectedRevision: before.revision, ...fields }); expect((await configuration(request, projectId)).revision).toBe(before.revision); });
  const closed = await stage(request, projectId, f.workflow.id, f.stages[2]!.id, { ...stageFields(f.stages[2]!), acceptsEntries: false });
  await success(request, 'save_automation_rule', { projectId, ruleId: crypto.randomUUID(), ...retry(), expectedRevision: '0', name: 'MCP retained disabled reference', stageId: closed.id, assigneeId: memberId, enabled: false }, zSavedAutomationRuleView);
  await mcpCase('UC-WFL-0060', async () => { await rejected(request, 'save_workflow_stage', { projectId, workflowId: f.workflow.id, stageId: closed.id, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, ...stageFields(closed), retired: true }); expect((await success(request, 'list_workflow_stages', { projectId, workflowId: f.workflow.id }, zPageStageView)).items.find(value => value.id === closed.id)!.retired).toBe(false); });
  const target = other.stages[2]!; await stage(request, projectId, other.workflow.id, target.id, { ...stageFields(target), acceptsEntries: false }); await stage(request, projectId, other.workflow.id, target.id, { ...stageFields(target), acceptsEntries: false, retired: true });
  await mcpCase('UC-WFL-0075', async () => { await rejected(request, 'migrate_workflow_issues', { projectId, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, sourceStageId: closed.id, targetStageId: target.id, limit: 1 }); });
});

test('MCP custom-field transition requirements enforce actual issue values and scoped active definitions', async ({ request }) => {
  const projectId = await coverageProject(request), foreignProject = await coverageProject(request), f = await customWorkflow(request, projectId), typeId = await allowWorkflow(request, projectId, f);
  async function field(project: string, key: string) { return (await success(request, 'save_field', { projectId: project, fieldId: crypto.randomUUID(), ...retry(), expectedRevision: (await configuration(request, project)).revision, key, name: key, kind: 'text', required: false, retired: false, defaultValue: null }, zSavedFieldSaved)).result.field; }
  const own = await field(projectId, 'mcp_required_evidence'), foreign = await field(foreignProject, 'mcp_foreign_evidence'), key = { projectId, workflowId: f.workflow.id, transitionId: f.transition.id };
  await mcpCase('UC-WFL-0043', async () => {
    const policy = { ...emptyPolicy, requiredFieldIds: [own.id] }, saved = await success(request, 'save_transition_policy', { ...key, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, policy }, zSavedTransitionPolicyView); expect(saved.result.policy.requiredFieldIds).toEqual([own.id]);
    const missing = await issue(request, projectId, { title: 'MCP missing required evidence', workflowId: f.workflow.id, typeId }); await rejected(request, 'move_issue_v2', { issueId: missing.summary.id, expectedRevision: missing.summary.revision, targetStageId: f.last.id, ...retry() }, 'validation_failed', 'member'); expect((await success(request, 'get_issue_v2', { issueId: missing.summary.id }, zModernIssueView, 'member')).summary.stage.id).toBe(f.first.id);
    const completed = await issue(request, projectId, { title: 'MCP evidence provided', workflowId: f.workflow.id, typeId, fieldValues: [{ fieldId: own.id, value: { kind: 'text', text: 'Verified implementation evidence' } }] }); expect((await success(request, 'move_issue_v2', { issueId: completed.summary.id, expectedRevision: completed.summary.revision, targetStageId: f.last.id, ...retry() }, zSavedModernIssueView, 'member')).result.summary.stage.id).toBe(f.last.id);
  });
  await mcpCase('UC-WFL-0080', async () => { await rejected(request, 'save_transition_policy', { ...key, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, policy: { ...emptyPolicy, requiredFieldIds: [foreign.id] } }); expect((await success(request, 'get_transition_policy', key, zTransitionPolicyView)).policy.requiredFieldIds).toEqual([own.id]); });
  await success(request, 'save_transition_policy', { ...key, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, policy: emptyPolicy }, zSavedTransitionPolicyView);
  await success(request, 'save_field', { projectId, fieldId: own.id, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, key: own.key, name: own.name, kind: 'text', required: false, retired: true, defaultValue: null }, zSavedFieldSaved);
  await mcpCase('UC-WFL-0081', async () => { await rejected(request, 'save_transition_policy', { ...key, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, policy: { ...emptyPolicy, requiredFieldIds: [own.id] } }); expect((await success(request, 'get_transition_policy', key, zTransitionPolicyView)).policy.requiredFieldIds).toEqual([]); });
  await mcpCase('UC-WFL-0095', async () => {
    const requiring = { ...emptyPolicy, requiredSystemFields: ['description' as const], approvalsRequired: 1, approverRole: 'member' as const };
    await success(request, 'save_transition_policy', { ...key, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, policy: requiring }, zSavedTransitionPolicyView);
    const noApprovals = { ...requiring, approvalsRequired: 0, approverRole: null }, saved = await success(request, 'save_transition_policy', { ...key, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, policy: noApprovals }, zSavedTransitionPolicyView); expect(saved.result.policy).toEqual(noApprovals); expect((await success(request, 'get_transition_policy', key, zTransitionPolicyView)).policy).toEqual(noApprovals);
    const current = await issue(request, projectId, { title: 'MCP no approval needed with description retained', description: 'Present evidence', workflowId: f.workflow.id, typeId }); expect((await success(request, 'move_issue_v2', { issueId: current.summary.id, expectedRevision: current.summary.revision, targetStageId: f.last.id, ...retry() }, zSavedModernIssueView, 'member')).result.summary.stage.id).toBe(f.last.id);
    const missing = await issue(request, projectId, { title: 'MCP description remains required', workflowId: f.workflow.id, typeId }); await rejected(request, 'move_issue_v2', { issueId: missing.summary.id, expectedRevision: missing.summary.revision, targetStageId: f.last.id, ...retry() }, 'validation_failed', 'member');
  });
});

test('MCP retired type and workflow bindings cannot be reopened even with valid stage coverage', async ({ request }) => {
  const projectId = await coverageProject(request), f = await customWorkflow(request, projectId); await allowWorkflow(request, projectId, f);
  const typeId = crypto.randomUUID(), typeFields = { key: 'mcp_retained_type', name: 'MCP retained type', behavior: 'standard' as const, retired: false };
  await success(request, 'save_issue_type', { projectId, typeId, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, ...typeFields }, zSavedTypeSaved);
  await success(request, 'save_issue_type', { projectId, typeId, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, ...typeFields, retired: true }, zSavedTypeSaved);
  await mcpCase('UC-WFL-0068', async () => { await rejected(request, 'set_type_workflow_binding', { projectId, typeId, workflowId: f.workflow.id, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, default: false, acceptsNew: true }); expect((await success(request, 'list_type_workflow_bindings', { projectId, typeId }, zPageBindingView)).items.some(value => value.workflowId === f.workflow.id)).toBe(false); });
  const other = await customWorkflow(request, projectId); for (const choice of other.stages.slice(1, 3)) await transition(request, projectId, other.workflow.id, crypto.randomUUID(), { fromStageId: choice.id, toStageId: other.last.id, requiredPermission: null, retired: false });
  const boardId = (await success(request, 'list_boards', { projectId }, zPageBoardSummary)).items.find(value => value.default)!.id, layout = await success(request, 'get_board_v2', { boardId }, zLayoutView), draft = coverageLayoutDraft(layout);
  for (const choice of other.stages) draft.columns.find(column => layout.columns.find(value => value.id === column.id)!.stages.some(value => value.stage.category === choice.category))!.stageIds.push(choice.id); await success(request, 'save_board_layout_v2', { boardId, ...retry(), ...draft }, zSavedLayoutView);
  await workflow(request, projectId, other.workflow.id, other.workflow.name, true);
  const taskId = (await success(request, 'list_issue_types', { projectId }, zPageTypeView)).items.find(value => value.key === 'task')!.id;
  await mcpCase('UC-WFL-0069', async () => { await rejected(request, 'set_type_workflow_binding', { projectId, typeId: taskId, workflowId: other.workflow.id, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, default: false, acceptsNew: true }); expect((await success(request, 'list_type_workflow_bindings', { projectId, typeId: taskId }, zPageBindingView)).items.some(value => value.workflowId === other.workflow.id)).toBe(false); });
});

test('MCP backlog reads, cursor invalidation, rank guards, activation and original create replay are authoritative', async ({ request }) => {
  const projectId = await coverageProject(request), view = await board(request, projectId);
  const a = await mcpCase('UC-BLG-0006', async () => { const created = await issue(request, projectId, { title: 'خطة عربية', backlog: true }); expect(created.summary.backlog).toBe(true); const cards = await success(request, 'list_board_cards_v2', { boardId: view.board.id, columnId: view.columns[0]!.id }, zNativeCardPage, 'member'); expect(cards.items).toEqual([]); expect(cards.column.savedMatchCount).toBe(0); return created; });
  const b = await issue(request, projectId, { title: 'MCP planned B', backlog: true }), c = await issue(request, projectId, { title: 'MCP planned C', backlog: true }), active = await issue(request, projectId, { title: 'MCP active anchor' });
  const read = (role = 'member') => success(request, 'list_backlog', { projectId }, zBacklogPage, role), initial = await read();
  await mcpCase('UC-BLG-0001', async () => { const current = await read('viewer'); expect(current.items.map(value => value.id)).toEqual([a.summary.id, b.summary.id, c.summary.id]); expect(current.totalMatching).toBe(3); });
  await mcpCase('UC-BLG-0041', async () => { expect((await read()).modernItems!.find(value => value.id === a.summary.id)!.title).toBe('خطة عربية'); });
  const first = await success(request, 'list_backlog', { projectId, page: { limit: 1 } }, zBacklogPage, 'member');
  await mcpCase('UC-BLG-0037', async () => { expect(first.items).toHaveLength(1); expect(first.nextCursor).not.toBeNull(); const next = await success(request, 'list_backlog', { projectId, page: { limit: 1, cursor: first.nextCursor! } }, zBacklogPage, 'member'); expect(next.items.map(value => value.id)).toEqual([b.summary.id]); expect(next.totalMatching).toBe(3); expect(next.orderRevision).toBe(first.orderRevision); });
  const originalOrder = { expectedRevision: c.summary.revision, expectedOrderRevision: initial.orderRevision, neighborId: a.summary.id, before: true }; await success(request, 'reorder_backlog', { issueId: c.summary.id, ...retry(), ...originalOrder }, zSavedBacklogChange, 'member');
  await mcpCase('UC-BLG-0029', async () => { await rejected(request, 'reorder_backlog', { issueId: b.summary.id, ...retry(), ...originalOrder, expectedRevision: b.summary.revision }, 'conflict', 'member'); expect((await read()).items.map(value => value.id)).toEqual([c.summary.id, a.summary.id, b.summary.id]); });
  await mcpCase('UC-BLG-0030', async () => { await rejected(request, 'list_backlog', { projectId, page: { limit: 1, cursor: first.nextCursor! } }, 'validation_failed', 'member'); });
  const latest = await read();
  for (const [id, record, neighborId, role, code] of [
    ['UC-BLG-0022', b, a.summary.id, 'viewer', 'forbidden'], ['UC-BLG-0024', b, b.summary.id, 'member', 'validation_failed'],
    ['UC-BLG-0025', active, a.summary.id, 'member', 'validation_failed'], ['UC-BLG-0027', b, active.summary.id, 'member', 'validation_failed'],
  ] as const) await mcpCase(id, async () => { await rejected(request, 'reorder_backlog', { issueId: record.summary.id, ...retry(), expectedRevision: record.summary.revision, expectedOrderRevision: latest.orderRevision, neighborId, before: true }, code, role); expect((await read()).items.map(value => value.id)).toEqual([c.summary.id, a.summary.id, b.summary.id]); });
  const foreignProject = await coverageProject(request), foreign = await issue(request, foreignProject, { title: 'MCP foreign planned anchor', backlog: true });
  await mcpCase('UC-BLG-0028', async () => { await rejected(request, 'reorder_backlog', { issueId: b.summary.id, ...retry(), expectedRevision: b.summary.revision, expectedOrderRevision: latest.orderRevision, neighborId: foreign.summary.id, before: true }, 'unavailable_record', 'member'); });
  await mcpCase('UC-BLG-0017', async () => { await success(request, 'organize_issue', { issueId: a.summary.id, ...retry(), expectedRevision: a.summary.revision, backlog: false }, zSavedIssueView, 'member'); expect((await success(request, 'get_issue_v2', { issueId: a.summary.id }, zModernIssueView, 'member')).summary.backlog).toBe(false); expect((await read()).items.some(value => value.id === a.summary.id)).toBe(false); });
  await mcpCase('UC-BLG-0026', async () => { await success(request, 'organize_issue', { issueId: b.summary.id, ...retry(), expectedRevision: b.summary.revision, archived: true }, zSavedIssueView, 'member'); const current = await success(request, 'get_issue_v2', { issueId: b.summary.id }, zModernIssueView, 'member'), list = await read(); await rejected(request, 'reorder_backlog', { issueId: b.summary.id, ...retry(), expectedRevision: current.summary.revision, expectedOrderRevision: list.orderRevision, neighborId: c.summary.id, before: true }, 'validation_failed', 'member'); });
  await mcpCase('UC-BLG-0031', async () => { const args = { projectId, title: 'MCP original planned creation', backlog: true, ...retry() }, first = await success(request, 'create_issue_v2', args, zSavedModernIssueView, 'member'), confirmed = await success(request, 'create_issue_v2', args, zSavedModernIssueView, 'member'); expect(confirmed.receipt.replayed).toBe(true); expect(confirmed.result.summary.id).toBe(first.result.summary.id); expect((await read()).items.filter(value => value.id === first.result.summary.id)).toHaveLength(1); });
});

test('MCP workflow renames, intake closure and retirement retain real existing issue identities', async ({ request }) => {
  const projectId = await coverageProject(request), retained = await issue(request, projectId, { title: 'MCP retained original work' });
  const f = await mcpCase('UC-WFL-0011', async () => { const created = await customWorkflow(request, projectId); expect(created.workflow.retired).toBe(false); const current = await success(request, 'get_issue_v2', { issueId: retained.summary.id }, zModernIssueView, 'member'); expect(current.summary.workflow.id).toBe(retained.summary.workflow.id); expect(current.summary.stage.id).toBe(retained.summary.stage.id); return created; });
  const typeId = await allowWorkflow(request, projectId, f), review = f.stages[2]!; await transition(request, projectId, f.workflow.id, crypto.randomUUID(), { fromStageId: f.first.id, toStageId: review.id, requiredPermission: null, retired: false });
  let current = await issue(request, projectId, { title: 'MCP existing named workflow work', workflowId: f.workflow.id, typeId }); current = (await success(request, 'move_issue_v2', { issueId: current.summary.id, expectedRevision: current.summary.revision, targetStageId: review.id, ...retry() }, zSavedModernIssueView, 'member')).result;
  const renamed = await mcpCase('UC-WFL-0012', async () => { const saved = await workflow(request, projectId, f.workflow.id, 'MCP renamed retained workflow'); const read = await success(request, 'get_issue_v2', { issueId: current.summary.id }, zModernIssueView, 'member'); expect(read.summary.workflow).toMatchObject({ id: f.workflow.id, name: saved.name }); expect(read.summary.stage.id).toBe(review.id); expect(read.summary.revision).toBe(current.summary.revision); return saved; });
  let changedStage = await mcpCase('UC-WFL-0017', async () => { const saved = await stage(request, projectId, f.workflow.id, review.id, { ...stageFields(review), name: 'مراجعة محتفظة بالهوية' }); const read = await success(request, 'get_issue_v2', { issueId: current.summary.id }, zModernIssueView, 'member'); expect(read.summary.stage).toMatchObject({ id: review.id, name: saved.name }); expect(read.summary.revision).toBe(current.summary.revision); return saved; });
  const waiting = await issue(request, projectId, { title: 'MCP waiting for stage intake', workflowId: f.workflow.id, typeId });
  changedStage = await mcpCase('UC-WFL-0025', async () => { const closed = await stage(request, projectId, f.workflow.id, review.id, { ...stageFields(changedStage), acceptsEntries: false }); expect((await success(request, 'get_issue_v2', { issueId: current.summary.id }, zModernIssueView, 'member')).summary.stage.id).toBe(review.id); await rejected(request, 'move_issue_v2', { issueId: waiting.summary.id, expectedRevision: waiting.summary.revision, targetStageId: review.id, ...retry() }, 'validation_failed', 'member'); expect((await success(request, 'get_issue_v2', { issueId: waiting.summary.id }, zModernIssueView, 'member')).summary.stage.id).toBe(f.first.id); return closed; });
  await mcpCase('UC-WFL-0024', async () => { const opened = await stage(request, projectId, f.workflow.id, review.id, { ...stageFields(changedStage), acceptsEntries: true }); const moved = await success(request, 'move_issue_v2', { issueId: waiting.summary.id, expectedRevision: waiting.summary.revision, targetStageId: opened.id, ...retry() }, zSavedModernIssueView, 'member'); expect(moved.result.summary.stage.id).toBe(review.id); expect((await success(request, 'get_issue_v2', { issueId: current.summary.id }, zModernIssueView, 'member')).summary.stage.id).toBe(review.id); });
  await mcpCase('UC-WFL-0013', async () => { const saved = await workflow(request, projectId, f.workflow.id, renamed.name, true); expect(saved.retired).toBe(true); const binding = (await success(request, 'list_type_workflow_bindings', { projectId, typeId }, zPageBindingView)).items.find(value => value.workflowId === f.workflow.id)!; expect(binding.acceptsNew).toBe(false); expect((await success(request, 'get_issue_v2', { issueId: current.summary.id }, zModernIssueView, 'member')).summary.workflow.id).toBe(f.workflow.id); await rejected(request, 'create_issue_v2', { projectId, title: 'Cannot use retired workflow', typeId, workflowId: f.workflow.id, ...retry() }, 'validation_failed', 'member'); });
  await mcpCase('UC-WFL-0014', async () => { const saved = await workflow(request, projectId, f.workflow.id, renamed.name, false); expect(saved.retired).toBe(false); expect((await success(request, 'list_type_workflow_bindings', { projectId, typeId }, zPageBindingView)).items.find(value => value.workflowId === f.workflow.id)!.acceptsNew).toBe(false); await rejected(request, 'create_issue_v2', { projectId, title: 'Restored workflow still needs explicit binding', typeId, workflowId: f.workflow.id, ...retry() }, 'validation_failed', 'member'); });
});

test('MCP stage assignment applies during backlog activation but ignores revoked and historical retired targets', async ({ request }) => {
  for (const scenario of ['activation', 'revoked', 'historical_retired'] as const) {
    const projectId = await coverageProject(request), view = await board(request, projectId), choice = view.columns.flatMap(column => column.stages).find(value => value.stage.category === (scenario === 'revoked' ? 'review' : 'todo'))!.stage;
    await success(request, 'save_automation_rule', { projectId, ruleId: crypto.randomUUID(), ...retry(), expectedRevision: '0', name: 'MCP current eligibility rule', stageId: choice.id, assigneeId: memberId, enabled: true }, zSavedAutomationRuleView);
    const record = await issue(request, projectId, { title: 'MCP rule eligibility ' + scenario, backlog: scenario !== 'revoked' }); expect(record.summary.assignee).toBeNull();
    if (scenario === 'activation') await mcpCase('UC-BLG-0020', async () => {
      const saved = await success(request, 'organize_issue', { issueId: record.summary.id, ...retry(), expectedRevision: record.summary.revision, backlog: false }, zSavedIssueView, 'member'); expect(saved.result.summary.assignee?.id).toBe(memberId); const current = await success(request, 'get_issue_v2', { issueId: record.summary.id }, zModernIssueView, 'member'); expect(current.summary.backlog).toBe(false); expect(current.summary.assignee?.id).toBe(memberId);
    });
    if (scenario === 'revoked') await mcpCase('UC-INT-0028', async () => {
      await coverageWrite(request, 'PUT', `/api/v1/projects/${projectId}/memberships/${memberId}`, { expectedRevision: '1', role: 'viewer' }, zSavedMembershipView);
      const moved = await success(request, 'move_issue_v2', { issueId: record.summary.id, ...retry(), expectedRevision: record.summary.revision, targetStageId: choice.id }, zSavedModernIssueView, 'owner'); expect(moved.result.summary.stage.id).toBe(choice.id); expect(moved.result.summary.assignee).toBeNull(); expect((await success(request, 'get_issue_v2', { issueId: record.summary.id }, zModernIssueView, 'owner')).summary.assignee).toBeNull();
    });
    if (scenario === 'historical_retired') await mcpCase('UC-INT-0029', async () => {
      await coverageRetireHistoricalStage(projectId, choice.id); const saved = await success(request, 'organize_issue', { issueId: record.summary.id, ...retry(), expectedRevision: record.summary.revision, backlog: false }, zSavedIssueView, 'member'); expect(saved.result.summary.assignee).toBeNull(); const current = await success(request, 'get_issue_v2', { issueId: record.summary.id }, zModernIssueView, 'member'); expect(current.summary.backlog).toBe(false); expect(current.summary.assignee).toBeNull();
    });
  }
});

test('MCP backlog refuses a dense fixture beyond the bounded rank-maintenance limit', async ({ request }) => {
  const projectId = await coverageProject(request), template = await issue(request, projectId, { title: 'MCP dense retained tail', backlog: true }); await coverageDenseBacklog(projectId, template.summary.id);
  await mcpCase('UC-BLG-0035', async () => {
    const first = await success(request, 'list_backlog', { projectId, page: { limit: 1 } }, zBacklogPage, 'member'); expect(first.totalMatching).toBe(2001); const neighbor = first.items[0]!;
    await rejected(request, 'reorder_backlog', { issueId: template.summary.id, expectedRevision: template.summary.revision, expectedOrderRevision: first.orderRevision, neighborId: neighbor.id, before: true, ...retry() }, 'validation_failed', 'member'); const after = await success(request, 'list_backlog', { projectId, page: { limit: 1 } }, zBacklogPage, 'member'); expect(after.orderRevision).toBe(first.orderRevision); expect(after.items[0]!.id).toBe(neighbor.id); expect(after.totalMatching).toBe(2001);
  });
});

test('MCP grouped stages expose both underlying stage identities in one authoritative card page', async ({ request }) => {
  const projectId = await coverageProject(request); let view = await board(request, projectId);
  const a = await issue(request, projectId, { title: 'MCP in-progress group member' }), b = await issue(request, projectId, { title: 'MCP review group member' });
  const doing = view.columns.find(column => column.stages.some(value => value.stage.category === 'in_progress'))!, review = view.columns.find(column => column.stages.some(value => value.stage.category === 'review'))!;
  await success(request, 'move_issue_v2', { issueId: a.summary.id, expectedRevision: a.summary.revision, targetStageId: doing.stages[0]!.stage.id, ...retry() }, zSavedModernIssueView, 'member'); await success(request, 'move_issue_v2', { issueId: b.summary.id, expectedRevision: b.summary.revision, targetStageId: review.stages[0]!.stage.id, ...retry() }, zSavedModernIssueView, 'member');
  await mcpCase('UC-BRD-0011', async () => {
    view = await success(request, 'get_board_v2', { boardId: view.board.id }, zLayoutView); const draft = coverageLayoutDraft(view); draft.columns.find(column => column.id === doing.id)!.stageIds.push(review.stages[0]!.stage.id); draft.columns = draft.columns.filter(column => column.id !== review.id);
    const saved = await success(request, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...draft }, zSavedLayoutView, 'member'); expect(saved.result.columns.find(value => value.id === doing.id)!.stages).toHaveLength(2); const cards = await success(request, 'list_board_cards_v2', { boardId: view.board.id, columnId: doing.id }, zNativeCardPage, 'member'); expect(cards.items.map(value => value.id).sort()).toEqual([a.summary.id, b.summary.id].sort()); expect(cards.items.find(value => value.id === a.summary.id)!.stage.id).toBe(doing.stages[0]!.stage.id); expect(cards.items.find(value => value.id === b.summary.id)!.stage.id).toBe(review.stages[0]!.stage.id);
  });
});

for (const channel of ['rest', 'mcp'] as const) test(channel + ' concurrent creation serializes the final hard-capacity slot', async ({ request }) => {
  const projectId = await coverageProject(request), view = await board(request, projectId), draft = coverageLayoutDraft(view), column = draft.columns[0]!; column.wipMode = 'block'; column.wipLimit = 1;
  await success(request, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...draft }, zSavedLayoutView, 'member');
  await surfaceCase(channel, 'UC-BRD-0083', async () => {
    const inputs = [0, 1].map(index => ({ projectId, title: channel + ' competing final slot ' + index, ...retry() }));
    if (channel === 'mcp') {
      const responses = await Promise.all(inputs.map(args => callTool(request, 'create_issue_v2', args)));
      const results = [];
      const envelope = z.union([z.object({ ok: z.literal(true), data: zSavedModernIssueView, error: z.null() }), z.object({ ok: z.literal(false), data: z.null(), error: z.object({ error: zFailure }) })]);
      for (const response of responses) { expect(response.status()).toBe(200); const body = z.object({ jsonrpc: z.literal('2.0'), id: z.literal(1), result: z.object({ isError: z.boolean().optional(), structuredContent: envelope, content: z.array(z.object({ type: z.literal('text'), text: z.string() })).min(1) }) }).parse(await response.json()); const result = body.result.structuredContent; if (result.ok) expect(envelope.parse(JSON.parse(body.result.content[0]!.text))).toEqual(result); else expect(body.result.content.map(value => value.text).join('\n')).toContain(result.error.error.message); expect(body.result.isError ?? false).toBe(!result.ok); results.push(result); }
      expect(results.filter(value => value.ok)).toHaveLength(1); const failed = results.filter(value => !value.ok); expect(failed).toHaveLength(1); expect(failed[0]!.error!.error.code).toBe('validation_failed');
    } else {
      const responses = await Promise.all(inputs.map(async args => request.post(apiOrigin + `/api/v2/projects/${projectId}/issues`, { headers: { ...await coverageHeaders('member'), 'Idempotency-Key': args.retryReference }, data: { title: args.title } })));
      expect(responses.map(value => value.status()).sort()).toEqual([201, 422]); for (const response of responses) { if (response.status() === 201) expect(zSavedModernIssueView.parse(await response.json()).result.summary.projectId).toBe(projectId); else await coverageFailure(response, 422, 'validation_failed'); }
    }
    const current = await contract(request, channel, 'get_board_v2', { boardId: view.board.id }, zLayoutView, { method: 'GET', path: `/api/v2/boards/${view.board.id}` }); expect(current.columns[0]).toMatchObject({ wipLimit: 1, wipMode: 'block', savedMatchCount: 1 }); const cards = await contract(request, channel, 'list_board_cards_v2', { boardId: view.board.id, columnId: column.id }, zNativeCardPage, { method: 'POST', path: `/api/v2/boards/${view.board.id}/columns/${column.id}/search`, body: { temporaryFilters: {} } }); expect(cards.items).toHaveLength(1);
  });
});

for (const channel of ['rest', 'mcp'] as const) test(channel + ' a different project writer cannot manage a creator-owned board but a scoped administrator can', async ({ request }) => {
  const projectId = await coverageProject(request), view = await board(request, projectId);
  await coverageWrite(request, 'PUT', `/api/v1/projects/${projectId}/memberships/${viewerId}`, { expectedRevision: '1', role: 'member' }, zSavedMembershipView);
  await surfaceCase(channel, 'UC-BRD-0061', async () => {
    const readable = await contract(request, channel, 'get_board_v2', { boardId: view.board.id }, zLayoutView, { method: 'GET', path: `/api/v2/boards/${view.board.id}` }, 'viewer'); expect(readable.board.canManage).toBe(false);
    const body = { ...coverageLayoutDraft(readable), name: 'Forbidden other writer layout' }; await contractFailure(request, channel, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...body }, { method: 'PUT', path: `/api/v2/boards/${view.board.id}/layout`, body }, 'forbidden', 'viewer'); const current = await success(request, 'get_board_v2', { boardId: view.board.id }, zLayoutView, 'member'); expect(current.board.revision).toBe(view.board.revision); expect(current.board.name).toBe(view.board.name);
    await coverageWrite(request, 'PUT', `/api/v1/projects/${projectId}/memberships/${viewerId}`, { expectedRevision: '2', role: 'project_admin' }, zSavedMembershipView);
    const manageable = await contract(request, channel, 'get_board_v2', { boardId: view.board.id }, zLayoutView, { method: 'GET', path: `/api/v2/boards/${view.board.id}` }, 'viewer'); expect(manageable.board.canManage).toBe(true); const permitted = { ...coverageLayoutDraft(manageable), name: 'Accepted scoped administrator layout' }; const saved = await contract(request, channel, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...permitted }, zSavedLayoutView, { method: 'PUT', path: `/api/v2/boards/${view.board.id}/layout`, body: permitted }, 'viewer'); expect(saved.result.board.name).toBe(permitted.name);
  });
});
