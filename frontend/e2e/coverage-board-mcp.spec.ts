import { expect, type APIRequestContext } from '@playwright/test';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { localFixturesAvailable } from './support/session';
import { mcpSuccess, mcpFailure } from './support/coverage-access';
import { coverageProject, coverageLayoutDraft } from './support/coverage-boards';
import type {
  AutomationRuleFields, DevelopmentLinkFields, IssueFilter, IssuePlanningFields,
  ModernCreateFields, ModernMoveFields, NativeMoveFields, PageRequest, PlanningCreateFields, OrganizeFields, MigrationFields,
  PlanningItemView, PlanningUpdateFields, SaveLayoutFields, SaveStageFields,
  SaveTransitionFields, SaveWorkflowFields, StageView, TransitionPolicy, SetBindingFields,
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
  zSavedIssueView,
  zPageTypeView, zPagePriorityView, zSavedLabelView, zSavedDependencyView, zSavedConfigurationView,
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

test('MCP workflow lifecycle and cursor pages preserve exact stage identities and positions', async ({ request }) => {
  const projectId = await coverageProject(request), workflowId = crypto.randomUUID();
  let savedWorkflow = await mcpCase('UC-WFL-0011', async () => {
    const saved = await workflow(request, projectId, workflowId, 'MCP lifecycle');
    expect(saved).toMatchObject({ id: workflowId, name: 'MCP lifecycle', retired: false });
    return saved;
  });
  savedWorkflow = await mcpCase('UC-WFL-0012', async () => {
    const saved = await workflow(request, projectId, workflowId, 'Renamed MCP lifecycle');
    expect(saved).toMatchObject({ id: workflowId, name: 'Renamed MCP lifecycle' });
    return saved;
  });
  await mcpCase('UC-WFL-0001', async () => {
    const list = await success(request, 'list_workflows', { projectId }, zPageWorkflowView, 'viewer');
    expect(list.items.find(value => value.id === workflowId)).toEqual(savedWorkflow);
  });
  await mcpCase("UC-WFL-0091", async () => {
    const first = await success(request, 'list_workflows', { projectId, page: { limit: 1 } }, zPageWorkflowView);
    expect(first.items).toHaveLength(1); expect(first.nextCursor).not.toBeNull();
    const next = await success(request, 'list_workflows', { projectId, page: { limit: 1, cursor: first.nextCursor! } }, zPageWorkflowView);
    expect(next.items).toHaveLength(1); expect(next.items[0]!.id).not.toBe(first.items[0]!.id);
  });
  for (const [index, category, id] of [[0, 'todo', 'UC-WFL-0018'], [1, 'in_progress', 'UC-WFL-0019'], [2, 'review', 'UC-WFL-0020'], [3, 'done', 'UC-WFL-0021']] as const) {
    await mcpCase(id, async () => {
      const saved = await stage(request, projectId, workflowId, crypto.randomUUID(), { name: category, category, position: String(index + 1), initial: index === 0, acceptsEntries: true, retired: false });
      expect(saved).toMatchObject({ category, initial: index === 0, acceptsEntries: true, retired: false });
    });
  }
  let savedStage = await mcpCase('UC-WFL-0015', async () => {
    const stageId = crypto.randomUUID();
    const saved = await stage(request, projectId, workflowId, stageId, { name: 'Ready for QA', category: 'review', position: '5', initial: false, acceptsEntries: true, retired: false });
    expect(saved).toMatchObject({ id: stageId, workflowId, name: 'Ready for QA' }); return saved;
  });
  savedStage = await mcpCase('UC-WFL-0017', async () => {
    const saved = await stage(request, projectId, workflowId, savedStage.id, { ...stageFields(savedStage), name: 'Renamed QA' });
    expect(saved).toMatchObject({ id: savedStage.id, name: 'Renamed QA' }); return saved;
  });
  savedStage = await mcpCase('UC-WFL-0016', async () => {
    const saved = await stage(request, projectId, workflowId, crypto.randomUUID(), { ...stageFields(savedStage), name: 'جاهز للمراجعة', position: '6' });
    expect(saved.name).toBe('جاهز للمراجعة'); return saved;
  });
  savedStage = await mcpCase('UC-WFL-0022', async () => {
    const saved = await stage(request, projectId, workflowId, savedStage.id, { ...stageFields(savedStage), position: '9007199254740993' });
    const persisted = await success(request, 'list_workflow_stages', { projectId, workflowId }, zPageStageView);
    expect(saved.position).toBe('9007199254740993'); expect(persisted.items.find(value => value.id === saved.id)!.position).toBe(saved.position); return saved;
  });
  await mcpCase('UC-WFL-0003', async () => {
    const list = await success(request, 'list_workflow_stages', { projectId, workflowId }, zPageStageView, 'viewer');
    expect(list.items).toHaveLength(6); expect(list.items.map(value => value.id)).toContain(savedStage.id);
  });
  await mcpCase("UC-WFL-0092", async () => {
    const first = await success(request, 'list_workflow_stages', { projectId, workflowId, page: { limit: 2 } }, zPageStageView);
    expect(first.items).toHaveLength(2); expect(first.nextCursor).not.toBeNull();
    const next = await success(request, 'list_workflow_stages', { projectId, workflowId, page: { limit: 2, cursor: first.nextCursor! } }, zPageStageView);
    expect(next.items).toHaveLength(2); expect(next.items.some(value => first.items.some(prior => prior.id === value.id))).toBe(false);
  });
  for (const [id, acceptsEntries] of [['UC-WFL-0025', false], ['UC-WFL-0024', true]] as const) savedStage = await mcpCase(id, async () => {
    const saved = await stage(request, projectId, workflowId, savedStage.id, { ...stageFields(savedStage), acceptsEntries });
    expect(saved.acceptsEntries).toBe(acceptsEntries); return saved;
  });
  savedStage = await stage(request, projectId, workflowId, savedStage.id, { ...stageFields(savedStage), acceptsEntries: false });
  savedStage = await mcpCase('UC-WFL-0026', async () => {
    const saved = await stage(request, projectId, workflowId, savedStage.id, { ...stageFields(savedStage), retired: true });
    expect(saved).toMatchObject({ retired: true, acceptsEntries: false });
    expect((await success(request, 'list_workflow_stages', { projectId, workflowId }, zPageStageView)).items.some(value => value.id === saved.id)).toBe(false); return saved;
  });
  await mcpCase('UC-WFL-0027', async () => {
    const saved = await stage(request, projectId, workflowId, savedStage.id, { ...stageFields(savedStage), retired: false, acceptsEntries: true });
    expect(saved).toMatchObject({ id: savedStage.id, retired: false, acceptsEntries: true });
  });
  savedWorkflow = await mcpCase('UC-WFL-0013', async () => {
    const saved = await workflow(request, projectId, workflowId, savedWorkflow.name, true); expect(saved.retired).toBe(true); return saved;
  });
  await mcpCase('UC-WFL-0014', async () => {
    const saved = await workflow(request, projectId, workflowId, savedWorkflow.name, false); expect(saved.retired).toBe(false);
  });
});

test('MCP transition direction, permissions and policies retain independent configuration', async ({ request }) => {
  const projectId = await coverageProject(request), fixture = await customWorkflow(request, projectId), workflowId = fixture.workflow.id;
  const typeId = await allowWorkflow(request, projectId, fixture);
  let edge = await mcpCase('UC-WFL-0028', async () => {
    const saved = await transition(request, projectId, workflowId, crypto.randomUUID(), { fromStageId: fixture.first.id, toStageId: fixture.stages[2]!.id, requiredPermission: null, retired: false });
    expect(saved).toMatchObject({ fromStageId: fixture.first.id, toStageId: fixture.stages[2]!.id, retired: false }); return saved;
  });
  await mcpCase('UC-WFL-0005', async () => {
    const list = await success(request, 'list_workflow_transitions', { projectId, workflowId }, zPageTransitionView, 'viewer');
    expect(list.items.map(value => value.id)).toEqual(expect.arrayContaining([fixture.transition.id, edge.id]));
  });
  await mcpCase("UC-WFL-0093", async () => {
    const first = await success(request, 'list_workflow_transitions', { projectId, workflowId, page: { limit: 1 } }, zPageTransitionView);
    expect(first.items).toHaveLength(1); expect(first.nextCursor).not.toBeNull();
    const next = await success(request, 'list_workflow_transitions', { projectId, workflowId, page: { limit: 1, cursor: first.nextCursor! } }, zPageTransitionView);
    expect(next.items).toHaveLength(1); expect(next.items[0]!.id).not.toBe(first.items[0]!.id);
  });
  for (const [id, requiredPermission] of [['UC-WFL-0029', 'member'], ['UC-WFL-0030', 'project_admin'], ['UC-WFL-0031', null]] as const) edge = await mcpCase(id, async () => {
    const saved = await transition(request, projectId, workflowId, edge.id, { fromStageId: edge.fromStageId, toStageId: edge.toStageId, retired: false, requiredPermission });
    expect(saved.requiredPermission).toBe(requiredPermission);
    const fresh = await issue(request, projectId, { title: 'MCP permission probe', workflowId, typeId });
    const args = { issueId: fresh.summary.id, expectedRevision: fresh.summary.revision, targetStageId: saved.toStageId, ...retry() };
    if (requiredPermission === 'project_admin') await rejected(request, 'move_issue_v2', args, 'forbidden', 'member');
    const moved = await success(request, 'move_issue_v2', { ...args, ...retry() }, zSavedModernIssueView, requiredPermission === 'project_admin' ? 'owner' : 'member');
    expect(moved.result.summary.stage.id).toBe(saved.toStageId); return saved;
  });
  for (const [id, retired] of [['UC-WFL-0032', true], ['UC-WFL-0033', false]] as const) edge = await mcpCase(id, async () => {
    const saved = await transition(request, projectId, workflowId, edge.id, { fromStageId: edge.fromStageId, toStageId: edge.toStageId, requiredPermission: null, retired });
    expect(saved.retired).toBe(retired);
    const fresh = await issue(request, projectId, { title: 'MCP edge eligibility probe', workflowId, typeId }), args = { issueId: fresh.summary.id, expectedRevision: fresh.summary.revision, targetStageId: saved.toStageId, ...retry() };
    if (retired) { await rejected(request, 'move_issue_v2', args, 'validation_failed', 'member'); expect((await success(request, 'get_issue_v2', { issueId: fresh.summary.id }, zModernIssueView)).summary.stage.id).toBe(fixture.first.id); }
    else expect((await success(request, 'move_issue_v2', args, zSavedModernIssueView, 'member')).result.summary.stage.id).toBe(saved.toStageId);
    return saved;
  });
  const key = { projectId, workflowId, transitionId: edge.id };
  await mcpCase('UC-WFL-0090', async () => {
    const current = await success(request, 'get_transition_policy', key, zTransitionPolicyView, 'viewer');
    expect(current.transitionId).toBe(edge.id); expect(current.policy).toEqual(emptyPolicy);
  });
  for (const [id, policy] of [
    ['UC-WFL-0040', { ...emptyPolicy, requiredSystemFields: ['assignee'] }],
    ['UC-WFL-0041', { ...emptyPolicy, requiredSystemFields: ['due_date'] }],
    ['UC-WFL-0042', { ...emptyPolicy, requiredSystemFields: ['description'] }],
    ['UC-WFL-0044', emptyPolicy],
    ['UC-WFL-0045', { ...emptyPolicy, approvalsRequired: 1, approverRole: 'member' }],
    ['UC-WFL-0046', { ...emptyPolicy, approvalsRequired: 2, approverRole: 'project_admin' }],
    ['UC-WFL-0047', { ...emptyPolicy, approvalsRequired: 1, approverRole: 'member', excludeIssueReporter: true }],
  ] as const) await mcpCase(id, async () => {
    const saved = await success(request, 'save_transition_policy', { ...key, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, policy: { ...policy, requiredSystemFields: [...policy.requiredSystemFields] } }, zSavedTransitionPolicyView);
    expect(saved.result.policy).toEqual(policy); expect((await success(request, 'get_transition_policy', key, zTransitionPolicyView)).policy).toEqual(policy);
    if (policy.requiredSystemFields.length) {
      const missing = await issue(request, projectId, { title: 'MCP missing transition field', workflowId, typeId });
      await rejected(request, 'move_issue_v2', { issueId: missing.summary.id, expectedRevision: missing.summary.revision, targetStageId: edge.toStageId, ...retry() }, 'validation_failed', 'member');
      expect((await success(request, 'get_issue_v2', { issueId: missing.summary.id }, zModernIssueView, 'member')).summary.stage.id).toBe(fixture.first.id);
      const complete = await issue(request, projectId, { title: 'MCP satisfies transition fields', workflowId, typeId, assigneeId: memberId, dueDate: '2027-02-28', description: 'Required description present' });
      const moved = await success(request, 'move_issue_v2', { issueId: complete.summary.id, expectedRevision: complete.summary.revision, targetStageId: edge.toStageId, ...retry() }, zSavedModernIssueView, 'member');
      expect(moved.result.summary.stage.id).toBe(edge.toStageId);
    }
  });
});

test('MCP invalid workflow and policy commands preserve the current configuration', async ({ request }) => {
  const projectId = await coverageProject(request), f = await customWorkflow(request, projectId), workflowId = f.workflow.id;
  const before = await configuration(request, projectId);
  const base = { projectId, workflowId, expectedRevision: before.revision };
  const invalids: Array<{ id: string; name: keyof ToolInputs; fields: object }> = [
    { id: 'UC-WFL-0050', name: 'save_workflow', fields: { name: '  ', retired: false } },
    { id: 'UC-WFL-0051', name: 'save_workflow', fields: { name: 'w'.repeat(101), retired: false } },
    { id: 'UC-WFL-0052', name: 'save_workflow_stage', fields: { ...stageFields(f.first), stageId: f.first.id, name: '  ' } },
    { id: 'UC-WFL-0053', name: 'save_workflow_stage', fields: { ...stageFields(f.first), stageId: f.first.id, name: 's'.repeat(61) } },
    { id: 'UC-WFL-0054', name: 'save_workflow_stage', fields: { ...stageFields(f.first), stageId: f.first.id, position: '0' } },
    { id: 'UC-WFL-0055', name: 'save_workflow_stage', fields: { ...stageFields(f.first), stageId: f.first.id, category: 'review', initial: false } },
    { id: 'UC-WFL-0056', name: 'save_workflow_stage', fields: { ...stageFields(f.last), stageId: f.last.id, initial: true } },
    { id: 'UC-WFL-0057', name: 'save_workflow_stage', fields: { ...stageFields(f.first), stageId: f.first.id, acceptsEntries: false } },
    { id: 'UC-WFL-0058', name: 'save_workflow_stage', fields: { ...stageFields(f.last), stageId: f.last.id, acceptsEntries: false, retired: true } },
    { id: 'UC-WFL-0061', name: 'save_workflow_transition', fields: { transitionId: crypto.randomUUID(), fromStageId: f.first.id, toStageId: f.first.id, requiredPermission: null, retired: false } },
    { id: 'UC-WFL-0063', name: 'save_workflow_transition', fields: { transitionId: f.transition.id, fromStageId: f.last.id, toStageId: f.first.id, requiredPermission: null, retired: false } },
  ];
  for (const invalid of invalids) await mcpCase(invalid.id, async () => {
    await rejected(request, invalid.name, { ...base, ...retry(), ...invalid.fields });
    expect((await configuration(request, projectId)).revision).toBe(before.revision);
  });
  await mcpCase('UC-WFL-0049', async () => {
    await rejected(request, 'save_workflow', { ...base, ...retry(), name: 'Forbidden member edit', retired: false }, 'forbidden', 'member');
    expect((await configuration(request, projectId)).revision).toBe(before.revision);
  });
  const other = await customWorkflow(request, projectId);
  await mcpCase('UC-WFL-0062', async () => {
    await rejected(request, 'save_workflow_transition', { projectId, workflowId, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, transitionId: crypto.randomUUID(), fromStageId: f.first.id, toStageId: other.last.id, requiredPermission: null, retired: false });
  });
  for (const [id, policy] of [
    ['UC-WFL-0079', { ...emptyPolicy, requiredSystemFields: ['assignee', 'assignee'] }],
    ['UC-WFL-0082', { ...emptyPolicy, approvalsRequired: 101, approverRole: 'member' }],
    ['UC-WFL-0083', { ...emptyPolicy, approvalsRequired: -1, approverRole: 'member' }],
    ['UC-WFL-0084', { ...emptyPolicy, approvalsRequired: 1, approverRole: null }],
  ] as const) await mcpCase(id, async () => {
    const key = { projectId, workflowId, transitionId: f.transition.id };
    await rejected(request, 'save_transition_policy', { ...key, ...retry(), expectedRevision: (await configuration(request, projectId)).revision, policy });
    expect((await success(request, 'get_transition_policy', key, zTransitionPolicyView)).policy).toEqual(emptyPolicy);
  });
});

test('MCP board layout edits, WIP settings and lifecycle persist through fresh reads', async ({ request }) => {
  const projectId = await coverageProject(request);
  let view = await mcpCase('UC-BRD-0003', async () => {
    const saved = await board(request, projectId); expect(saved.columns).toHaveLength(4);
    expect(saved.board).toMatchObject({ projectId, default: false, archived: false, name: 'MCP independent board' }); return saved;
  });
  await mcpCase('UC-BRD-0001', async () => {
    const list = await success(request, 'list_boards', { projectId }, zPageBoardSummary, 'viewer');
    expect(list.items.map(value => value.id)).toContain(view.board.id); expect(list.items.filter(value => value.default)).toHaveLength(1);
  });
  await mcpCase("UC-BRD-0095", async () => {
    const first = await success(request, 'list_boards', { projectId, page: { limit: 1 } }, zPageBoardSummary);
    expect(first.items).toHaveLength(1); expect(first.nextCursor).not.toBeNull();
    const next = await success(request, 'list_boards', { projectId, page: { limit: 1, cursor: first.nextCursor! } }, zPageBoardSummary);
    expect(next.items).toHaveLength(1); expect(next.items[0]!.id).not.toBe(first.items[0]!.id);
  });
  view = await mcpCase('UC-BRD-0005', async () => {
    const saved = (await success(request, 'save_board_layout_v2', { boardId: view.board.id, ...coverageLayoutDraft(view), ...retry(), name: 'MCP renamed board' }, zSavedLayoutView, 'member')).result;
    expect((await success(request, 'get_board_v2', { boardId: view.board.id }, zLayoutView)).board.name).toBe('MCP renamed board'); return saved;
  });
  const extraId = crypto.randomUUID();
  view = await mcpCase('UC-BRD-0006', async () => {
    const draft = coverageLayoutDraft(view); draft.columns.push({ id: extraId, name: 'Optional group', stageIds: [], wipLimit: null, wipMode: 'warn' });
    const saved = (await success(request, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...draft }, zSavedLayoutView, 'member')).result;
    expect(saved.columns).toHaveLength(5); expect(saved.columns[4]!.id).toBe(extraId); return saved;
  });
  view = await mcpCase('UC-BRD-0007', async () => {
    const draft = coverageLayoutDraft(view); draft.columns[4]!.name = 'Renamed optional group';
    const saved = (await success(request, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...draft }, zSavedLayoutView, 'member')).result;
    expect(saved.columns[4]!.name).toBe('Renamed optional group'); expect(saved.columns[0]!.stages[0]!.stage.name).toBe(view.columns[0]!.stages[0]!.stage.name); return saved;
  });
  view = await mcpCase("UC-BRD-0096", async () => {
    const draft = coverageLayoutDraft(view); draft.columns.splice(2, 0, draft.columns.pop()!);
    const saved = (await success(request, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...draft }, zSavedLayoutView, 'member')).result;
    expect((await success(request, 'get_board_v2', { boardId: view.board.id }, zLayoutView)).columns[2]!.id).toBe(extraId); return saved;
  });
  view = await mcpCase('UC-BRD-0097', async () => {
    const expected = [...view.columns.filter(column => column.id !== extraId).map(column => column.id), extraId];
    const laterDraft = coverageLayoutDraft(view); laterDraft.columns.push(laterDraft.columns.splice(2, 1)[0]!);
    const saved = (await success(request, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...laterDraft }, zSavedLayoutView, 'member')).result;
    expect((await success(request, 'get_board_v2', { boardId: view.board.id }, zLayoutView)).columns.map(column => column.id)).toEqual(expected);
    return saved;
  });
  const retainedIssue = await issue(request, projectId, { title: 'MCP retained issue during column removal' });
  view = await mcpCase('UC-BRD-0010', async () => {
    const before = await success(request, 'get_issue_v2', { issueId: retainedIssue.summary.id }, zModernIssueView, 'member');
    const draft = coverageLayoutDraft(view); draft.columns = draft.columns.filter(column => column.id !== extraId);
    const saved = (await success(request, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...draft }, zSavedLayoutView, 'member')).result;
    expect(saved.columns).toHaveLength(4); expect(saved.columns.some(column => column.id === extraId)).toBe(false);
    const fresh = await success(request, 'get_issue_v2', { issueId: retainedIssue.summary.id }, zModernIssueView, 'member');
    expect(fresh.summary.stage).toEqual(before.summary.stage);
    expect(fresh.summary.workflow).toEqual(before.summary.workflow);
    expect(fresh.summary.revision).toBe(before.summary.revision);
    return saved;
  });
  // Retained work is one of the three actual WIP occupants.
  for (let index = 0; index < 2; index++) await issue(request, projectId, { title: 'MCP WIP occupancy ' + index });
  for (const [id, limit, mode] of [['UC-BRD-0014', 2, 'warn'], ['UC-BRD-0015', 3, 'block'], ['UC-BRD-0016', null, 'warn']] as const) view = await mcpCase(id, async () => {
    const draft = coverageLayoutDraft(view); draft.columns[0]!.wipLimit = limit; draft.columns[0]!.wipMode = mode;
    const saved = (await success(request, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...draft }, zSavedLayoutView, 'member')).result;
    expect(saved.columns[0]).toMatchObject({ wipLimit: limit, wipMode: mode, savedMatchCount: 3, limitExceeded: id === 'UC-BRD-0014' });
    if (id === 'UC-BRD-0015') await rejected(request, 'create_issue_v2', { projectId, title: 'MCP capacity overflow', ...retry() }, 'validation_failed', 'member');
    return saved;
  });
  await mcpCase('UC-BRD-0061', async () => {
    const revision = view.board.revision;
    await rejected(request, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...coverageLayoutDraft(view) }, 'forbidden', 'viewer');
    expect((await success(request, 'get_board_v2', { boardId: view.board.id }, zLayoutView)).board.revision).toBe(revision);
  });
  const archived = await mcpCase('UC-BRD-0017', async () => {
    const saved = await success(request, 'archive_board', { boardId: view.board.id, expectedRevision: view.board.revision, ...retry() }, zSavedBoardSummary, 'member');
    expect(saved.result.archived).toBe(true); expect((await success(request, 'get_board_v2', { boardId: view.board.id }, zLayoutView)).board.archived).toBe(true); return saved.result;
  });
  await mcpCase('UC-BRD-0062', async () => {
    const current = await success(request, 'get_board_v2', { boardId: view.board.id }, zLayoutView);
    await rejected(request, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...coverageLayoutDraft(current) }, 'forbidden', 'member');
    const source = current.columns[0]!, target = current.columns.find(column => column.stages.some(value => value.stage.category === 'review'))!, existing = (await success(request, 'list_board_cards_v2', { boardId: view.board.id, columnId: source.id }, zNativeCardPage, 'member')).items[0]!;
    await rejected(request, 'move_board_card_v2', { boardId: view.board.id, ...retry(), issueId: existing.id, expectedIssueRevision: existing.revision, expectedBoardRevision: current.board.revision, sourceColumnId: source.id, expectedSourceOrderRevision: source.orderRevision, targetColumnId: target.id, expectedTargetOrderRevision: target.orderRevision, targetStageId: null, neighborIssueId: null, placement: 'last' }, 'forbidden', 'member');
    expect((await success(request, 'get_issue_v2', { issueId: existing.id }, zModernIssueView, 'member')).summary.stage.category).toBe('todo'); expect((await success(request, 'get_board_v2', { boardId: view.board.id }, zLayoutView)).board.archived).toBe(true);
  });
  await mcpCase('UC-BRD-0018', async () => {
    const saved = await success(request, 'restore_board', { boardId: view.board.id, expectedRevision: archived.revision, ...retry() }, zSavedBoardSummary, 'member');
    expect(saved.result.archived).toBe(false); expect((await success(request, 'list_boards', { projectId }, zPageBoardSummary)).items.some(value => value.id === saved.result.id)).toBe(true);
  });
});

test('MCP planning lifecycle, Unicode, kind filters and revision safety use independent fixtures', async ({ request }) => {
  const projectId = await coverageProject(request), created: PlanningItemView[] = [];
  for (const [kind, ids] of [
    ['epic', ['UC-PLN-0004', 'UC-PLN-0005', 'UC-PLN-0006', "UC-PLN-0083", "UC-PLN-0084", 'UC-PLN-0010', 'UC-PLN-0011', 'UC-PLN-0009']],
    ['release', ['UC-PLN-0012', 'UC-PLN-0013', 'UC-PLN-0014', "UC-PLN-0085", "UC-PLN-0086", 'UC-PLN-0018', 'UC-PLN-0019', 'UC-PLN-0017']],
  ] as const) {
    let item = await mcpCase(ids[0], async () => {
      const saved = await createPlanning(request, projectId, { kind, name: 'MCP ' + kind });
      expect(saved).toMatchObject({ projectId, kind, status: 'planned', issueCount: 0, completedCount: 0 }); return saved;
    });
    for (const [index, fields] of [[1, { name: 'Renamed ' + kind }], [2, { description: 'Detailed MCP ' + kind }], [3, { targetDate: '2027-02-28' }], [4, { targetDate: null }], [5, { status: 'active' }], [6, { status: 'complete' }], [7, { status: 'planned' }]] as const) item = await mcpCase(ids[index], async () => {
      const saved = await updatePlanning(request, item, fields); expect(saved).toMatchObject({ id: item.id, ...fields });
      const listed = await success(request, 'list_planning_items', { projectId }, zPagePlanningItemView);
      expect(listed.items.find(value => value.id === item.id)).toMatchObject({ id: item.id, ...fields }); return saved;
    });
    created.push(item);
  }
  await mcpCase("UC-PLN-0091", async () => {
    const saved = await createPlanning(request, projectId, { name: 'إطلاق البوابة', description: 'خطة التسليم العربية' });
    expect((await success(request, 'list_planning_items', { projectId }, zPagePlanningItemView)).items.find(value => value.id === saved.id)).toMatchObject({ name: 'إطلاق البوابة', description: 'خطة التسليم العربية' });
  });
  await mcpCase('UC-PLN-0001', async () => {
    const list = await success(request, 'list_planning_items', { projectId }, zPagePlanningItemView, 'viewer');
    expect(list.items).toHaveLength(3); expect(list.items[0]).toEqual(expect.objectContaining({ status: expect.any(String), description: expect.any(String), issueCount: 0, completedCount: 0 }));
  });
  await mcpCase("UC-PLN-0080", async () => {
    const first = await success(request, 'list_planning_items', { projectId, page: { limit: 1 } }, zPagePlanningItemView);
    expect(first.items).toHaveLength(1); expect(first.nextCursor).not.toBeNull();
    const next = await success(request, 'list_planning_items', { projectId, page: { limit: 1, cursor: first.nextCursor! } }, zPagePlanningItemView);
    expect(next.items).toHaveLength(1); expect(next.items[0]!.id).not.toBe(first.items[0]!.id);
  });
  for (const [id, kind, count] of [['UC-PLN-0025', 'epic', 2], ['UC-PLN-0026', 'release', 1]] as const) await mcpCase(id, async () => {
    const list = await success(request, 'list_planning_items', { projectId, kind }, zPagePlanningItemView); expect(list.items).toHaveLength(count); expect(list.items.every(value => value.kind === kind)).toBe(true);
  });
  const item = created[0]!;
  await mcpCase('UC-PLN-0072', async () => {
    const saved = await updatePlanning(request, item); expect(saved.revision).toBe(item.revision); expect(saved.updatedAt).toBe(item.updatedAt);
  });
  await mcpCase('UC-PLN-0071', async () => {
    const current = await updatePlanning(request, item, { name: 'Concurrent MCP title' });
    await rejected(request, 'update_planning_item', { projectId, planningId: item.id, ...retry(), expectedRevision: item.revision, name: 'Stale overwrite', description: '', status: item.status, targetDate: null }, 'conflict', 'member');
    expect((await success(request, 'list_planning_items', { projectId }, zPagePlanningItemView)).items.find(value => value.id === item.id)!.name).toBe(current.name);
  });
  for (const [id, fields] of [['UC-PLN-0052', { name: '  ' }], ['UC-PLN-0053', { name: 'n'.repeat(101) }], ['UC-PLN-0054', { description: 'd'.repeat(2001) }], ['UC-PLN-0055', { targetDate: '2027-02-30' }], ['UC-PLN-0056', { status: 'cancelled' }], ['UC-PLN-0057', { kind: 'sprint' }]] as const) await mcpCase(id, async () => {
    await rejected(request, 'create_planning_item', { projectId, ...retry(), kind: 'epic', name: 'Valid', description: '', targetDate: null, status: 'planned', ...fields }, 'validation_failed', 'member');
    expect((await success(request, 'list_planning_items', { projectId }, zPagePlanningItemView)).totalMatching).toBe(3);
  });
  await mcpCase("UC-PLN-0089", async () => {
    expect((await success(request, 'list_planning_items', { projectId }, zPagePlanningItemView, 'viewer')).totalMatching).toBe(3);
    await rejected(request, 'create_planning_item', { projectId, ...retry(), kind: 'epic', name: 'Viewer rejected', description: '', targetDate: null, status: 'planned' }, 'forbidden', 'viewer');
  });
});

test('MCP layout validation rolls back duplicate mappings, unsafe capacity and protected defaults', async ({ request }) => {
  const projectId = await coverageProject(request), view = await board(request, projectId);
  const foreignProject = await coverageProject(request), foreign = await board(request, foreignProject);
  await issue(request, projectId, { title: 'MCP occupied A' }); await issue(request, projectId, { title: 'MCP occupied B' });
  const invalids: Array<[string, (draft: SaveLayoutFields) => void]> = [
    ['UC-BRD-0063', draft => { draft.columns[1]!.id = draft.columns[0]!.id; }],
    ['UC-BRD-0064', draft => { draft.columns[1]!.name = draft.columns[0]!.name.toUpperCase(); }],
    ['UC-BRD-0065', draft => { draft.columns[1]!.stageIds.push(...draft.columns[0]!.stageIds); }],
    ['UC-BRD-0066', draft => { draft.columns[0]!.stageIds = [foreign.columns[0]!.stages[0]!.stage.id]; }],
    ['UC-BRD-0067', draft => { draft.columns = []; }],
    ['UC-BRD-0071', draft => { draft.columns[0]!.wipMode = 'block'; draft.columns[0]!.wipLimit = 1; }],
    ['UC-BRD-0072', draft => { draft.columns[0]!.wipMode = 'block'; draft.columns[0]!.wipLimit = null; }],
    ['UC-BRD-0073', draft => { draft.columns[0]!.wipMode = 'block'; draft.columns[0]!.wipLimit = 3; draft.savedFilters = { assignee: { kind: 'self' } }; }],
    ['UC-BRD-0074', draft => { draft.columns[0]!.wipMode = 'block'; draft.columns[0]!.wipLimit = 3; draft.savedFilters = { blocked: true }; }],
    ['UC-BRD-0075', draft => { draft.columns[0]!.wipLimit = 0; }],
  ];
  for (const [id, mutate] of invalids) await mcpCase(id, async () => {
    const before = await success(request, 'get_board_v2', { boardId: view.board.id }, zLayoutView), draft = coverageLayoutDraft(before); mutate(draft);
    await rejected(request, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...draft }, 'validation_failed', 'member');
    const current = await success(request, 'get_board_v2', { boardId: view.board.id }, zLayoutView);
    expect(current.board.revision).toBe(before.board.revision); expect(current.columns).toEqual(before.columns);
  });
  const directory = await success(request, 'list_boards', { projectId }, zPageBoardSummary), defaultId = directory.items.find(value => value.default)!.id;
  for (const [id, mutate] of [
    ['UC-BRD-0068', (draft: SaveLayoutFields) => { draft.name = 'Rename default'; }],
    ['UC-BRD-0069', (draft: SaveLayoutFields) => { draft.savedFilters = { query: 'hide default work' }; }],
    ['UC-BRD-0070', (draft: SaveLayoutFields) => { draft.columns[0]!.stageIds = []; }],
  ] as const) await mcpCase(id, async () => {
    const before = await success(request, 'get_board_v2', { boardId: defaultId }, zLayoutView), draft = coverageLayoutDraft(before); mutate(draft);
    await rejected(request, 'save_board_layout_v2', { boardId: defaultId, ...retry(), ...draft });
    const current = await success(request, 'get_board_v2', { boardId: defaultId }, zLayoutView);
    expect(current.board.revision).toBe(before.board.revision); expect(current.board.name).toBe(before.board.name); expect(current.board.savedFilters).toEqual(before.board.savedFilters); expect(current.columns).toEqual(before.columns);
  });
  await mcpCase('UC-BRD-0076', async () => {
    const before = await success(request, 'get_board_v2', { boardId: defaultId }, zLayoutView);
    await rejected(request, 'archive_board', { boardId: defaultId, expectedRevision: before.board.revision, ...retry() }, 'forbidden');
    expect((await success(request, 'get_board_v2', { boardId: defaultId }, zLayoutView)).board.archived).toBe(false);
  });
});

test('MCP development links validate every kind, field, revision and replay through the real issue service', async ({ request }) => {
  const projectId = await coverageProject(request), record = await issue(request, projectId), issueId = record.summary.id;
  let linkId = '', revision = '0';
  const fields: DevelopmentLinkFields = { expectedRevision: '0', title: 'MCP development link', url: 'https://example.com/pull/12', kind: 'pull_request', removed: false };
  for (const [id, kind] of [['UC-INT-0004', 'pull_request'], ['UC-INT-0005', 'commit'], ['UC-INT-0006', 'other']] as const) await mcpCase(id, async () => {
    const saved = await success(request, 'save_development_link', { issueId, linkId: crypto.randomUUID(), ...retry(), ...fields, title: 'MCP link ' + kind, kind }, zSavedDevelopmentLinkView, 'member');
    expect(saved.result).toMatchObject({ issueId, kind, removed: false, revision: '1' }); linkId = saved.result.id; revision = saved.result.revision;
  });
  await mcpCase("UC-INT-0061", async () => {
    const list = await success(request, 'list_development_links', { issueId }, zPageDevelopmentLinkView, 'viewer');
    expect(list.totalMatching).toBe(3); expect(list.items.find(value => value.id === linkId)).toMatchObject({ kind: 'other', title: 'MCP link other', url: fields.url });
  });
  await mcpCase("UC-INT-0059", async () => {
    const first = await success(request, 'list_development_links', { issueId, page: { limit: 1 } }, zPageDevelopmentLinkView); expect(first.items).toHaveLength(1); expect(first.nextCursor).not.toBeNull();
    const next = await success(request, 'list_development_links', { issueId, page: { limit: 1, cursor: first.nextCursor! } }, zPageDevelopmentLinkView); expect(next.items).toHaveLength(1); expect(next.items[0]!.id).not.toBe(first.items[0]!.id);
  });
  let current: DevelopmentLinkFields = { ...fields, kind: 'other', title: 'MCP link other' };
  for (const [id, change] of [['UC-INT-0008', { title: 'Edited MCP link' }], ["UC-INT-0062", { url: 'https://example.org/new-path' }], ['UC-INT-0010', { kind: 'commit' }], ["UC-INT-0063", { title: 'رابط التسليم العربي' }]] as const) await mcpCase(id, async () => {
    current = { ...current, ...change, expectedRevision: revision };
    const saved = await success(request, 'save_development_link', { issueId, linkId, ...retry(), ...current }, zSavedDevelopmentLinkView, 'member'); expect(saved.result).toMatchObject({ id: linkId, ...change }); revision = saved.result.revision;
    expect((await success(request, 'list_development_links', { issueId }, zPageDevelopmentLinkView)).items.find(value => value.id === linkId)).toMatchObject(change);
  });
  await mcpCase('UC-INT-0047', async () => {
    await rejected(request, 'save_development_link', { issueId, linkId, ...retry(), ...current, expectedRevision: '1', title: 'Stale MCP overwrite' }, 'conflict', 'member');
    expect((await success(request, 'list_development_links', { issueId }, zPageDevelopmentLinkView)).items.find(value => value.id === linkId)!.title).toBe(current.title);
  });
  await mcpCase('UC-INT-0049', async () => {
    const args = { issueId, linkId: crypto.randomUUID(), ...retry(), ...fields };
    const first = await success(request, 'save_development_link', args, zSavedDevelopmentLinkView, 'member'), replay = await success(request, 'save_development_link', args, zSavedDevelopmentLinkView, 'member');
    expect(replay.result).toEqual(first.result); expect(replay.receipt.replayed).toBe(true); expect(replay.receipt.eventId).toBe(first.receipt.eventId);
    expect((await success(request, 'list_development_links', { issueId }, zPageDevelopmentLinkView)).items.filter(value => value.id === args.linkId)).toHaveLength(1);
  });
  for (const [id, change] of [
    ['UC-INT-0032', { title: ' ' }], ['UC-INT-0033', { title: 'x'.repeat(201) }], ['UC-INT-0034', { url: 'javascript:alert(1)' }],
    ['UC-INT-0035', { url: 'https://user:password@example.com/path' }], ['UC-INT-0036', { url: 'https://' }],
    ['UC-INT-0037', { url: 'https://example.com/' + 'x'.repeat(2000) }], ['UC-INT-0038', { kind: 'branch' }], ['UC-INT-0039', { removed: true }],
  ] as const) await mcpCase(id, async () => {
    await rejected(request, 'save_development_link', { issueId, linkId: crypto.randomUUID(), ...retry(), ...fields, ...change }, 'validation_failed', 'member');
    expect((await success(request, 'list_development_links', { issueId }, zPageDevelopmentLinkView)).totalMatching).toBe(4);
  });
  await mcpCase('UC-INT-0011', async () => {
    const saved = await success(request, 'save_development_link', { issueId, linkId, ...retry(), ...current, expectedRevision: revision, removed: true }, zSavedDevelopmentLinkView, 'member');
    expect(saved.result.removed).toBe(true); expect((await success(request, 'list_development_links', { issueId }, zPageDevelopmentLinkView)).items.some(value => value.id === linkId)).toBe(false);
  });
  await success(request, 'organize_issue', { issueId, ...retry(), expectedRevision: record.summary.revision, archived: true }, zSavedIssueView, 'member');
  await mcpCase('UC-INT-0040', async () => {
    await rejected(request, 'save_development_link', { issueId, linkId: crypto.randomUUID(), ...retry(), ...fields }, 'validation_failed', 'member');
  });
});

test('MCP stage assignment rules apply current configuration and reject unsafe writes', async ({ request }) => {
  const projectId = await coverageProject(request), view = await board(request, projectId), mappings = view.columns.flatMap(column => column.stages);
  const review = mappings.find(value => value.stage.category === 'review')!.stage, doing = mappings.find(value => value.stage.category === 'in_progress')!.stage;
  const ruleId = crypto.randomUUID(); let current: AutomationRuleFields = { expectedRevision: '0', name: 'MCP review owner', stageId: review.id, assigneeId: memberId, enabled: true };
  let rule = await mcpCase('UC-INT-0017', async () => {
    const saved = await success(request, 'save_automation_rule', { projectId, ruleId, ...retry(), ...current }, zSavedAutomationRuleView);
    expect(saved.result).toMatchObject({ id: ruleId, stageId: review.id, enabled: true, assignee: { id: memberId } }); return saved.result;
  });
  for (const [id, change] of [['UC-INT-0019', { name: 'Changed MCP owner' }], ['UC-INT-0020', { stageId: doing.id }], ['UC-INT-0021', { assigneeId: ownerId }], ['UC-INT-0022', { enabled: false }], ['UC-INT-0023', { enabled: true }], ['UC-INT-0054', { name: 'تعيين مطور المراجعة' }]] as const) await mcpCase(id, async () => {
    current = { ...current, ...change, expectedRevision: rule.revision };
    rule = (await success(request, 'save_automation_rule', { projectId, ruleId, ...retry(), ...current }, zSavedAutomationRuleView)).result;
    expect(rule).toMatchObject({ name: current.name, stageId: current.stageId, enabled: current.enabled, assignee: { id: current.assigneeId } });
    const fresh = await issue(request, projectId, { title: 'Probe MCP rule configuration' });
    const moved = await success(request, 'move_issue_v2', { issueId: fresh.summary.id, expectedRevision: fresh.summary.revision, targetStageId: current.stageId!, ...retry() }, zSavedModernIssueView, 'member');
    expect(moved.result.summary.assignee?.id ?? null).toBe(current.enabled ? current.assigneeId : null);
  });
  await mcpCase('UC-INT-0018', async () => {
    const saved = await success(request, 'save_automation_rule', { projectId, ruleId: crypto.randomUUID(), ...retry(), expectedRevision: '0', name: 'Disabled MCP review owner', stageId: review.id, assigneeId: memberId, enabled: false }, zSavedAutomationRuleView);
    expect(saved.result.enabled).toBe(false);
    const fresh = await issue(request, projectId), moved = await success(request, 'move_issue_v2', { issueId: fresh.summary.id, expectedRevision: fresh.summary.revision, targetStageId: review.id, ...retry() }, zSavedModernIssueView, 'member'); expect(moved.result.summary.assignee).toBeNull();
  });
  await mcpCase('UC-INT-0014', async () => {
    const list = await success(request, 'list_automation_rules', { projectId }, zPageAutomationRuleView, 'member'); expect(list.totalMatching).toBe(2); expect(list.items.find(value => value.id === ruleId)).toMatchObject({ stageId: current.stageId, assignee: { id: current.assigneeId }, enabled: true });
  });
  await mcpCase("UC-INT-0060", async () => {
    const first = await success(request, 'list_automation_rules', { projectId, page: { limit: 1 } }, zPageAutomationRuleView); expect(first.items).toHaveLength(1); expect(first.nextCursor).not.toBeNull();
    const next = await success(request, 'list_automation_rules', { projectId, page: { limit: 1, cursor: first.nextCursor! } }, zPageAutomationRuleView); expect(next.items).toHaveLength(1); expect(next.items[0]!.id).not.toBe(first.items[0]!.id);
  });
  await mcpCase('UC-INT-0027', async () => {
    const fresh = await issue(request, projectId, { title: 'MCP automated stage entry' }), moved = await success(request, 'move_issue_v2', { issueId: fresh.summary.id, expectedRevision: fresh.summary.revision, targetStageId: doing.id, ...retry() }, zSavedModernIssueView, 'member');
    expect(moved.result.summary.assignee?.id).toBe(current.assigneeId); expect((await success(request, 'get_issue_v2', { issueId: fresh.summary.id }, zModernIssueView, 'member')).summary.assignee?.id).toBe(current.assigneeId);
  });
  for (const [id, change, role, code] of [
    ['UC-INT-0041', { name: ' ' }, 'owner', 'validation_failed'], ['UC-INT-0042', { name: 'x'.repeat(101) }, 'owner', 'validation_failed'],
    ['UC-INT-0043', { stageId: doing.id }, 'owner', 'validation_failed'], ['UC-INT-0044', { stageId: review.id, assigneeId: viewerId }, 'owner', 'validation_failed'],
    ['UC-INT-0045', { stageId: crypto.randomUUID() }, 'owner', 'unavailable_record'], ['UC-INT-0046', { stageId: review.id, stage: 'done' }, 'owner', 'validation_failed'],
    ['UC-INT-0031', { stageId: review.id }, 'member', 'forbidden'],
  ] as const) await mcpCase(id, async () => {
    await rejected(request, 'save_automation_rule', { projectId, ruleId: crypto.randomUUID(), ...retry(), ...current, expectedRevision: '0', enabled: true, ...change }, code, role);
    expect((await success(request, 'list_automation_rules', { projectId }, zPageAutomationRuleView)).totalMatching).toBe(2);
  });
  await mcpCase('UC-INT-0048', async () => {
    await rejected(request, 'save_automation_rule', { projectId, ruleId, ...retry(), ...current, expectedRevision: '1', name: 'Stale MCP rule' }, 'conflict');
    expect((await success(request, 'list_automation_rules', { projectId }, zPageAutomationRuleView)).items.find(value => value.id === ruleId)!.name).toBe(current.name);
  });
  await mcpCase('UC-INT-0050', async () => {
    const args = { projectId, ruleId: crypto.randomUUID(), ...retry(), expectedRevision: '0', name: 'Replay disabled MCP rule', stageId: review.id, assigneeId: memberId, enabled: false };
    const first = await success(request, 'save_automation_rule', args, zSavedAutomationRuleView), replay = await success(request, 'save_automation_rule', args, zSavedAutomationRuleView);
    expect(replay.result).toEqual(first.result); expect(replay.receipt.replayed).toBe(true); expect(replay.receipt.eventId).toBe(first.receipt.eventId);
  });
});

test('MCP issue planning changes preserve the other relationship and current project boundaries', async ({ request }) => {
  const projectId = await coverageProject(request), record = await issue(request, projectId), issueId = record.summary.id;
  const epicA = await createPlanning(request, projectId, { name: 'MCP Epic A' }), epicB = await createPlanning(request, projectId, { name: 'MCP Epic B' });
  const releaseA = await createPlanning(request, projectId, { name: 'MCP Release A', kind: 'release' }), releaseB = await createPlanning(request, projectId, { name: 'MCP Release B', kind: 'release' });
  let current = await mcpCase('UC-PLN-0027', async () => {
    const value = await success(request, 'get_issue_planning', { issueId }, zIssuePlanningView, 'member'); expect(value).toMatchObject({ issueId, revision: '0', epicId: null, releaseId: null, epicName: null, releaseName: null }); return value;
  });
  const assign = async (epicId: string | null, releaseId: string | null) => {
    const saved = await success(request, 'set_issue_planning', { issueId, ...retry(), expectedRevision: current.revision, epicId, releaseId }, zSavedIssuePlanningView, 'member');
    expect(await success(request, 'get_issue_planning', { issueId }, zIssuePlanningView, 'member')).toEqual(saved.result); current = saved.result;
  };
  // The existing IDs 28/31 include immediate browser autosave; this prepares the MCP relationships only.
  await assign(epicA.id, releaseA.id);
  await mcpCase('UC-PLN-0029', async () => { await assign(epicB.id, releaseA.id); expect(current).toMatchObject({ epicId: epicB.id, epicName: epicB.name, releaseId: releaseA.id, releaseName: releaseA.name }); });
  await mcpCase('UC-PLN-0030', async () => { await assign(null, releaseA.id); expect(current).toMatchObject({ epicId: null, epicName: null, releaseId: releaseA.id, releaseName: releaseA.name }); });
  await assign(epicA.id, releaseA.id);
  await mcpCase('UC-PLN-0032', async () => { await assign(epicA.id, releaseB.id); expect(current).toMatchObject({ epicId: epicA.id, epicName: epicA.name, releaseId: releaseB.id, releaseName: releaseB.name }); });
  await mcpCase('UC-PLN-0033', async () => { await assign(epicA.id, null); expect(current).toMatchObject({ epicId: epicA.id, epicName: epicA.name, releaseId: null, releaseName: null }); });
  for (const [id, epicId, releaseId] of [['UC-PLN-0058', releaseA.id, null], ['UC-PLN-0059', null, epicA.id]] as const) await mcpCase(id, async () => {
    await rejected(request, 'set_issue_planning', { issueId, ...retry(), expectedRevision: current.revision, epicId, releaseId }, 'validation_failed', 'member');
    expect(await success(request, 'get_issue_planning', { issueId }, zIssuePlanningView, 'member')).toEqual(current);
  });
  const otherProject = await coverageProject(request), foreign = await createPlanning(request, otherProject);
  await mcpCase('UC-PLN-0060', async () => {
    await rejected(request, 'set_issue_planning', { issueId, ...retry(), expectedRevision: current.revision, epicId: foreign.id, releaseId: null }, 'unavailable_record', 'member');
    expect(await success(request, 'get_issue_planning', { issueId }, zIssuePlanningView, 'member')).toEqual(current);
  });
  await assign(epicA.id, releaseA.id);
  for (const [id, planningId] of [['UC-PLN-0021', epicA.id], ['UC-PLN-0022', releaseA.id]] as const) await mcpCase(id, async () => {
    const linked = await success(request, 'list_planning_issues', { projectId, planningId }, zPagePlanningIssueSummary, 'viewer'); expect(linked.items.map(value => value.id)).toEqual([issueId]); expect(linked.totalMatching).toBe(1);
  });
  const second = await issue(request, projectId, { title: 'Second MCP linked work' });
  await success(request, 'set_issue_planning', { issueId: second.summary.id, ...retry(), expectedRevision: '0', epicId: epicA.id, releaseId: releaseA.id }, zSavedIssuePlanningView, 'member');
  await mcpCase("UC-PLN-0081", async () => {
    const first = await success(request, 'list_planning_issues', { projectId, planningId: epicA.id, page: { limit: 1 } }, zPagePlanningIssueSummary); expect(first.items).toHaveLength(1); expect(first.nextCursor).not.toBeNull();
    const next = await success(request, 'list_planning_issues', { projectId, planningId: epicA.id, page: { limit: 1, cursor: first.nextCursor! } }, zPagePlanningIssueSummary); expect(next.items).toHaveLength(1); expect(new Set([...first.items, ...next.items].map(value => value.id)).size).toBe(2);
  });
  await mcpCase('UC-PLN-0066', async () => {
    const args = { issueId, ...retry(), expectedRevision: current.revision, epicId: epicB.id, releaseId: releaseA.id };
    const first = await success(request, 'set_issue_planning', args, zSavedIssuePlanningView, 'member'), confirmed = await success(request, 'set_issue_planning', args, zSavedIssuePlanningView, 'member'); expect(confirmed.receipt.replayed).toBe(true); expect(confirmed.result).toEqual(first.result); expect(confirmed.receipt.eventId).toBe(first.receipt.eventId); current = confirmed.result;
  });
  await success(request, 'organize_issue', { issueId, ...retry(), expectedRevision: record.summary.revision, archived: true }, zSavedIssueView, 'member');
  await mcpCase('UC-PLN-0061', async () => {
    await rejected(request, 'set_issue_planning', { issueId, ...retry(), expectedRevision: current.revision, epicId: epicA.id, releaseId: null }, 'validation_failed', 'member'); expect(await success(request, 'get_issue_planning', { issueId }, zIssuePlanningView, 'member')).toEqual(current);
  });
});

test('MCP Kanban reports count actual completion cycles and bounded current work', async ({ request }) => {
  const projectId = await coverageProject(request), view = await board(request, projectId), mappings = view.columns.flatMap(column => column.stages);
  const doing = mappings.find(value => value.stage.category === 'in_progress')!.stage, done = mappings.find(value => value.stage.category === 'done')!.stage, todo = mappings.find(value => value.stage.category === 'todo')!.stage;
  let record = await issue(request, projectId, { title: 'MCP measured cycle' });
  const epic = await createPlanning(request, projectId);
  await success(request, 'set_issue_planning', { issueId: record.summary.id, ...retry(), expectedRevision: '0', epicId: epic.id, releaseId: null }, zSavedIssuePlanningView, 'member');
  async function move(targetStageId: string) { record = (await success(request, 'move_issue_v2', { issueId: record.summary.id, expectedRevision: record.summary.revision, targetStageId, ...retry() }, zSavedModernIssueView, 'member')).result; }
  const today = new Date().toISOString().slice(0, 10), args = { projectId, from: today, through: today };
  await mcpCase('UC-PLN-0046', async () => {
    const report = await success(request, 'get_kanban_report', args, zKanbanReport, 'viewer'); expect(report.activeCount).toBe(1); expect(report.completedCycles).toBe(0); expect(report.work.items.map(value => value.id)).toEqual([record.summary.id]);
  });
  await move(doing.id);
  await mcpCase('UC-PLN-0048', async () => {
    const row = (await success(request, 'get_kanban_report', args, zKanbanReport)).work.items[0]!; expect(row.id).toBe(record.summary.id); expect(row.startedAt).not.toBeNull(); expect(row.cycleAgeDays).toBeGreaterThanOrEqual(0); expect(row.workAgeDays).toBeGreaterThanOrEqual(0); expect(row.unfinishedBlockers).toBe(0);
  });
  await mcpCase('UC-PLN-0045', async () => {
    const startedAt = (await success(request, 'get_kanban_report', args, zKanbanReport)).work.items[0]!.startedAt; expect(startedAt).not.toBeNull(); await move(todo.id); expect((await success(request, 'get_kanban_report', args, zKanbanReport)).work.items[0]!.startedAt).toBe(startedAt); await move(doing.id);
  });
  await move(done.id);
  await mcpCase('UC-PLN-0041', async () => { const report = await success(request, 'get_kanban_report', args, zKanbanReport); expect(report.days).toEqual([{ day: today, completedCycles: 1 }]); expect(report.completedCycles).toBe(1); });
  await mcpCase('UC-PLN-0043', async () => { const report = await success(request, 'get_kanban_report', args, zKanbanReport); expect(report.measuredCycles).toBe(1); expect(report.averageCycleDays).toBeGreaterThanOrEqual(0); });
  await mcpCase('UC-PLN-0036', async () => { expect((await success(request, 'list_planning_items', { projectId }, zPagePlanningItemView)).items.find(value => value.id === epic.id)).toMatchObject({ issueCount: 1, completedCount: 1 }); });
  await move(todo.id);
  await mcpCase('UC-PLN-0037', async () => { expect((await success(request, 'list_planning_items', { projectId }, zPagePlanningItemView)).items.find(value => value.id === epic.id)).toMatchObject({ issueCount: 1, completedCount: 0 }); });
  await move(done.id);
  await mcpCase('UC-PLN-0042', async () => { const report = await success(request, 'get_kanban_report', args, zKanbanReport); expect(report.completedCycles).toBe(2); expect(report.days[0]!.completedCycles).toBe(2); });
  await success(request, 'organize_issue', { issueId: record.summary.id, expectedRevision: record.summary.revision, archived: true, ...retry() }, zSavedIssueView, 'member');
  await mcpCase('UC-PLN-0038', async () => {
    expect((await success(request, 'list_planning_items', { projectId }, zPagePlanningItemView)).items.find(value => value.id === epic.id)).toMatchObject({ issueCount: 0, completedCount: 0 }); expect((await success(request, 'list_planning_issues', { projectId, planningId: epic.id }, zPagePlanningIssueSummary)).items).toEqual([]);
  });
  const unstarted = await issue(request, projectId, { title: 'MCP unstarted completion' });
  await success(request, 'move_issue_v2', { issueId: unstarted.summary.id, expectedRevision: unstarted.summary.revision, targetStageId: done.id, ...retry() }, zSavedModernIssueView, 'member');
  await mcpCase('UC-PLN-0044', async () => { const report = await success(request, 'get_kanban_report', args, zKanbanReport); expect(report.completedCycles).toBe(3); expect(report.measuredCycles).toBe(2); });
  const blocked = await issue(request, projectId, { title: 'MCP blocked reporting work' }), blocker = await issue(request, projectId, { title: 'MCP reporting blocker' });
  await success(request, 'add_dependency', { issueId: blocked.summary.id, blockerId: blocker.summary.id, expectedIssueRevision: blocked.summary.revision, expectedGraphRevision: blocked.graphRevision, ...retry() }, zSavedDependencyView, 'member');
  await mcpCase('UC-PLN-0047', async () => { const report = await success(request, 'get_kanban_report', args, zKanbanReport); expect(report.blockedCount).toBe(1); expect(report.work.items.find(value => value.id === blocked.summary.id)!.unfinishedBlockers).toBe(1); });
  for (let index = 0; index < 3; index++) await issue(request, projectId, { title: 'MCP active page ' + index });
  await mcpCase("UC-PLN-0082", async () => {
    const first = await success(request, 'get_kanban_report', { ...args, page: { limit: 1 } }, zKanbanReport); expect(first.work.items).toHaveLength(1); expect(first.work.nextCursor).not.toBeNull();
    const next = await success(request, 'get_kanban_report', { ...args, page: { limit: 1, cursor: first.work.nextCursor! } }, zKanbanReport); expect(next.work.items).toHaveLength(1); expect(next.work.items[0]!.id).not.toBe(first.work.items[0]!.id);
  });
  await mcpCase('UC-PLN-0076', async () => { const report = await success(request, 'get_kanban_report', { ...args, page: { limit: 1 } }, zKanbanReport); expect(report.work.items).toHaveLength(1); expect(report.work.totalMatching).toBe(5); expect(report.work.nextCursor).not.toBeNull(); });
  for (const [id, from, through] of [['UC-PLN-0062', '2027-02-02', '2027-02-01'], ['UC-PLN-0063', '2025-01-01', '2027-01-01']] as const) await mcpCase(id, async () => { await rejected(request, 'get_kanban_report', { projectId, from, through }); });
});

test('MCP board saved views and business filters return the exact current card identities', async ({ request }) => {
  const projectId = await coverageProject(request); let view = await board(request, projectId);
  const priorities = await success(request, 'list_priorities', { projectId }, zPagePriorityView), types = await success(request, 'list_issue_types', { projectId }, zPageTypeView);
  const high = priorities.items.find(value => value.key === 'high')!, bug = types.items.find(value => value.key === 'bug')!;
  const label = (await success(request, 'create_label', { projectId, name: 'MCP board label', ...retry() }, zSavedLabelView, 'member')).result;
  const a = await issue(request, projectId, { title: 'عطل البوابة المميز', assigneeId: memberId, priorityId: high.id, typeId: bug.id, dueDate: '2000-01-01', labelIds: [label.id] });
  const b = await issue(request, projectId, { title: 'MCP future delivery', dueDate: '2999-12-01' }), c = await issue(request, projectId, { title: 'MCP no date delivery' });
  async function cards(filters: IssueFilter = {}) {
    const items = [];
    for (const column of view.columns) { const page = await success(request, 'list_board_cards_v2', { boardId: view.board.id, columnId: column.id, temporaryFilters: filters, page: { limit: 100 } }, zNativeCardPage, 'member'); items.push(...page.items); }
    return items;
  }
  for (const [id, temporaryFilters, expected] of [
    ['UC-BRD-0023', { assignee: { kind: 'self' } }, [a.summary.id]],
    ['UC-BRD-0024', { statuses: ['todo'] }, [a.summary.id, b.summary.id, c.summary.id]],
    ['UC-BRD-0025', { typeIds: [bug.id] }, [a.summary.id]],
    ['UC-BRD-0026', { priorityIds: [high.id] }, [a.summary.id]],
    ['UC-BRD-0027', { assignee: { kind: 'unassigned' } }, [b.summary.id, c.summary.id]],
    ['UC-BRD-0028', { assignee: { kind: 'user', userId: memberId } }, [a.summary.id]],
    ['UC-BRD-0031', { dueFrom: '2999-01-01', dueTo: '2999-12-31' }, [b.summary.id]],
    ['UC-BRD-0032', { overdue: true }, [a.summary.id]],
    ['UC-BRD-0033', { overdue: false }, [b.summary.id, c.summary.id]],
    ['UC-BRD-0035', { labelIds: [label.id] }, [a.summary.id]],
  ] satisfies Array<[string, IssueFilter, string[]]>) await mcpCase(id, async () => {
    expect((await cards(temporaryFilters)).map(value => value.id).sort()).toEqual([...expected].sort());
  });
  await success(request, 'add_dependency', { issueId: a.summary.id, blockerId: b.summary.id, expectedIssueRevision: a.summary.revision, expectedGraphRevision: a.graphRevision, ...retry() }, zSavedDependencyView, 'member');
  await mcpCase('UC-BRD-0029', async () => { expect((await cards({ blocked: true })).map(value => value.id)).toEqual([a.summary.id]); });
  await mcpCase('UC-BRD-0030', async () => { expect((await cards({ blocked: false })).map(value => value.id).sort()).toEqual([b.summary.id, c.summary.id].sort()); });
  await mcpCase('UC-BRD-0034', async () => {
    const parent = await success(request, 'get_issue_v2', { issueId: c.summary.id }, zModernIssueView, 'member'), child = await issue(request, projectId, { title: 'MCP parent-filter child', parentId: parent.summary.id, expectedParentRevision: parent.summary.revision });
    const matched = await cards({ parentId: parent.summary.id }); expect(matched.map(value => value.id)).toEqual([child.summary.id]); expect(matched[0]!.parent!.id).toBe(parent.summary.id);
  });
  await mcpCase('UC-BRD-0013', async () => {
    const draft = coverageLayoutDraft(view); draft.savedFilters = { query: 'MCP future delivery' };
    view = (await success(request, 'save_board_layout_v2', { boardId: view.board.id, ...retry(), ...draft }, zSavedLayoutView, 'member')).result;
    const fresh = await success(request, 'get_board_v2', { boardId: view.board.id }, zLayoutView, 'member'); expect(fresh.board.savedFilters).toEqual(draft.savedFilters); expect((await cards()).map(value => value.id)).toEqual([b.summary.id]);
    expect((await cards({ query: 'عطل' })).map(value => value.id)).toEqual([]);
  });
});

test('MCP card reorder, original retry and stale compare-and-set preserve independent board order', async ({ request }) => {
  const projectId = await coverageProject(request), created = await board(request, projectId), other = await board(request, projectId, 'MCP other independent order');
  const first = await issue(request, projectId, { title: 'MCP first rank' }), second = await issue(request, projectId, { title: 'MCP second rank' });
  let current = await success(request, 'get_board_v2', { boardId: created.board.id }, zLayoutView);
  const todoId = current.columns.find(column => column.stages.some(value => value.stage.category === 'todo'))!.id, reviewId = current.columns.find(column => column.stages.some(value => value.stage.category === 'review'))!.id;
  async function currentMove(targetColumnId: string): Promise<NativeMoveFields> {
    const record = await success(request, 'get_issue_v2', { issueId: second.summary.id }, zModernIssueView, 'member');
    const source = current.columns.find(column => column.stages.some(value => value.stage.id === record.summary.stage.id))!, target = current.columns.find(column => column.id === targetColumnId)!;
    return { issueId: record.summary.id, expectedIssueRevision: record.summary.revision, expectedBoardRevision: current.board.revision, sourceColumnId: source.id, expectedSourceOrderRevision: source.orderRevision, targetColumnId, expectedTargetOrderRevision: target.orderRevision, targetStageId: null, neighborIssueId: null, placement: 'last' };
  }
  async function order(boardId: string, columnId: string) { return (await success(request, 'list_board_cards_v2', { boardId, columnId }, zNativeCardPage, 'member')).items.map(value => value.id); }
  await mcpCase('UC-BRD-0052', async () => {
    const fields = await currentMove(todoId); fields.neighborIssueId = first.summary.id; fields.placement = 'before';
    const before = await success(request, 'get_issue_v2', { issueId: second.summary.id }, zModernIssueView, 'member');
    current = (await success(request, 'reorder_board_card_v2', { boardId: created.board.id, ...retry(), ...fields }, zSavedNativeMoveResult, 'member')).result.layout;
    expect(await order(created.board.id, todoId)).toEqual([second.summary.id, first.summary.id]); expect(await order(other.board.id, other.columns[0]!.id)).toEqual([first.summary.id, second.summary.id]); expect((await success(request, 'get_issue_v2', { issueId: second.summary.id }, zModernIssueView, 'member')).summary).toEqual(before.summary);
  });
  await mcpCase('UC-BRD-0053', async () => {
    const fields = await currentMove(todoId); fields.neighborIssueId = first.summary.id; fields.placement = 'after';
    current = (await success(request, 'reorder_board_card_v2', { boardId: created.board.id, ...retry(), ...fields }, zSavedNativeMoveResult, 'member')).result.layout;
    expect(await order(created.board.id, todoId)).toEqual([first.summary.id, second.summary.id]); expect(await order(other.board.id, other.columns[0]!.id)).toEqual([first.summary.id, second.summary.id]);
  });
  const staleFields = await currentMove(reviewId);
  await mcpCase('UC-BRD-0080', async () => {
    const args = { boardId: created.board.id, ...retry(), ...await currentMove(reviewId) }, first = await success(request, 'move_board_card_v2', args, zSavedNativeMoveResult, 'member'), confirmed = await success(request, 'move_board_card_v2', args, zSavedNativeMoveResult, 'member');
    expect(confirmed.receipt.replayed).toBe(true); expect(confirmed.receipt.eventId).toBe(first.receipt.eventId); expect(confirmed.result).toEqual(first.result); expect(first.result.issue.summary.stage.category).toBe('review');
  });
  await mcpCase('UC-BRD-0081', async () => {
    await rejected(request, 'move_board_card_v2', { boardId: created.board.id, ...retry(), ...staleFields }, 'conflict', 'member'); expect((await success(request, 'get_issue_v2', { issueId: second.summary.id }, zModernIssueView, 'member')).summary.stage.category).toBe('review');
  });
});
