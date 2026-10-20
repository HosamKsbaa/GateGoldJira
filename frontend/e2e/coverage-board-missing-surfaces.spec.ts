import { expect, type APIRequestContext } from '@playwright/test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, token } from './support/session';
import { isolatedProject } from './support/project';
import { mcpSuccess, memberId } from './support/coverage-access';
import { restSuccess, restFailure, restPlan } from './support/coverage-rest';
import { readinessCases, readinessFixture } from './support/configuration-readiness';
import { coverageBoard, coverageIssue, coverageLayoutDraft, coverageProject, coverageSaveLayout } from './support/coverage-boards';
import type { ActivateFields, IssuePlanningFields, ModernCreateFields, PlanningCreateFields, SaveFieldFields, SaveWorkflowFields, SetBindingFields, TransitionPolicy } from '../src/app/api/generated/types.gen';
import { zActivationReadiness, zBacklogPage, zConfigurationFailureBody, zConfigurationView, zIssuePlanningView, zLayoutView, zModernIssueView, zNativeCardPage, zPageBindingView, zPageFieldDefinition, zPageTypeView, zPageWorkflowView, zPageTransitionView, zSavedConfigurationView, zSavedFieldSaved, zSavedIssuePlanningView, zSavedIssueView, zSavedModernIssueView, zSavedPlanningItemView, zSavedTransitionPolicyView, zSavedWorkflowSaved, zTransitionPolicyView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the owning isolated Go/PostgreSQL run and actual published REST/MCP transports.');
test.use({ trace: 'off' });
test.describe.configure({ timeout: 90_000 });
const restCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'rest');
const mcpCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'mcp');
const reference = () => ({ retryReference: crypto.randomUUID() });
const config = (request: APIRequestContext, projectId: string) => restSuccess(request, 'get_project_configuration', { projectId }, zConfigurationView);

async function assertNoBoardCards(request: APIRequestContext, boardId: string) {
  const view = await restSuccess(request, 'get_board_v2', { boardId }, zLayoutView, 'member');
  for (const column of view.columns) {
    expect(column.savedMatchCount).toBe(0); expect(column.visibleMatchCount).toBe(0);
    const cards = await restSuccess(request, 'list_board_cards_v2', { boardId, columnId: column.id }, zNativeCardPage, 'member');
    expect(cards.items).toEqual([]); expect(cards.nextCursor).toBeNull();
  }
}

test('REST planned creation is atomically absent from active board work', async ({ request }) => {
  const projectId = await coverageProject(request), board = await coverageBoard(request, projectId);
  await assertNoBoardCards(request, board.board.id);
  await restCase('UC-BLG-0006', async () => {
    const fields = { title: 'REST directly planned work', backlog: true } satisfies ModernCreateFields;
    const accepted = await restSuccess(request, 'create_issue_v2', { projectId, ...fields, ...reference() }, zSavedModernIssueView, 'member');
    expect(accepted.result.summary.backlog).toBe(true); expect(accepted.receipt.replayed).toBe(false);
    // The first accepted create result is already backlog work. There is no
    // intervening organize command that could briefly expose an active card.
    expect((await restSuccess(request, 'get_issue_v2', { issueId: accepted.result.summary.id }, zModernIssueView, 'member')).summary.backlog).toBe(true);
    const backlog = await restSuccess(request, 'list_backlog', { projectId }, zBacklogPage, 'member');
    expect(backlog.items.map(issue => issue.id)).toEqual([accepted.result.summary.id]);
    await assertNoBoardCards(request, board.board.id);
  });
});

test('REST lost accepted backlog-create response replays one frozen original command', async ({ request }) => {
  const projectId = await coverageProject(request), board = await coverageBoard(request, projectId);
  const args = { projectId, title: 'REST original planned creation after a dropped response', backlog: true, ...reference() };
  const plan = restPlan('create_issue_v2', args), payload = JSON.stringify(plan.body), authorization = 'Bearer ' + await token('member');
  let requests = 0;
  let resolveCommit!: (value: z.output<typeof zSavedModernIssueView>) => void, rejectCommit!: (error: unknown) => void;
  const committed = new Promise<z.output<typeof zSavedModernIssueView>>((resolve, reject) => { resolveCommit = resolve; rejectCommit = reject; });
  // A loopback proxy forwards the actual original REST bytes/reference to Go,
  // then closes its caller socket only after the successful commit is observed.
  const proxy = createServer((incoming, outgoing) => {
    void (async () => {
      requests++;
      expect(incoming.method).toBe(plan.method); expect(incoming.url).toBe(new URL(plan.url).pathname);
      expect(incoming.headers['authorization']).toBe(authorization);
      expect(incoming.headers['idempotency-key']).toBe(args.retryReference);
      const parts: Buffer[] = []; for await (const part of incoming) parts.push(Buffer.from(part));
      const body = Buffer.concat(parts).toString('utf8'); expect(body).toBe(payload);
      const upstream = await fetch(plan.url, { method: plan.method, headers: { Authorization: authorization, ...plan.headers, 'Content-Type': 'application/json' }, body });
      expect(upstream.status).toBe(201);
      const accepted = zSavedModernIssueView.parse(await upstream.json());
      expect(accepted.receipt.replayed).toBe(false); expect(accepted.result.summary.backlog).toBe(true);
      resolveCommit(accepted); outgoing.destroy();
    })().catch(error => { rejectCommit(error); outgoing.destroy(); });
  });
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  const address = proxy.address(); if (!address || typeof address === 'string') throw new Error('The test-owned fault proxy did not allocate a loopback port.');
  try {
    await restCase('UC-BLG-0031', async () => {
      const [lost, first] = await Promise.all([
        request.fetch('http://127.0.0.1:' + address.port + new URL(plan.url).pathname, { method: plan.method, headers: { Authorization: authorization, ...plan.headers, 'Content-Type': 'application/json' }, data: payload, maxRetries: 0 }).then(() => 'unexpected_response', () => 'response_lost'),
        committed,
      ]);
      expect(lost).toBe('response_lost'); expect(requests).toBe(1);
      const replay = await restSuccess(request, 'create_issue_v2', args, zSavedModernIssueView, 'member');
      expect(replay.receipt).toMatchObject({ replayed: true, eventId: first.receipt.eventId });
      expect(replay.result).toEqual(first.result);
      const backlog = await restSuccess(request, 'list_backlog', { projectId }, zBacklogPage, 'member');
      expect(backlog.items.map(issue => issue.id)).toEqual([first.result.summary.id]);
      expect((await restSuccess(request, 'get_issue_v2', { issueId: first.result.summary.id }, zModernIssueView, 'member')).summary.backlog).toBe(true);
      await assertNoBoardCards(request, board.board.id);
    });
  } finally {
    proxy.closeAllConnections(); await new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve()));
  }
});

for (const [id, shape, message] of readinessCases) {
  test('REST readiness diagnoses retained ' + shape + ' before activation', async ({ request }) => {
    const projectId = await isolatedProject(request);
    if (shape === 'canonical_references') await restSuccess(request, 'create_issue', { projectId, title: 'Retained issue awaiting canonical references', ...reference() }, zSavedIssueView, 'member');
    const restore = await readinessFixture(projectId, shape);
    try {
      const review = await restCase(id, async () => {
        const result = await restSuccess(request, 'get_project_activation', { projectId }, zActivationReadiness);
        expect(result.ready).toBe(false); expect(result.problems).toContainEqual({ code: shape, message });
        expect(result.configuration).toMatchObject({ projectId, mode: 'legacy' });
        return result;
      });
      if (shape === 'default_filters') await restCase('UC-CFG-0087', async () => {
        const fields = { expectedRevision: review.configuration.revision, expectedProjectRevision: review.projectRevision, expectedBoardId: review.defaultBoardId, expectedBoardRevision: review.defaultBoardRevision, confirm: true } satisfies ActivateFields;
        const rejected = await restFailure(request, 'activate_project_core', { projectId, ...fields, ...reference() }, zConfigurationFailureBody, 'validation_failed');
        expect([rejected.error.message, ...rejected.error.fieldErrors.map(value => value.message)].join('\n')).toContain('Resolve the readiness problems');
        expect(await config(request, projectId)).toEqual(review.configuration);
        const after = await restSuccess(request, 'get_project_activation', { projectId }, zActivationReadiness);
        expect(after.ready).toBe(false); expect(after.problems).toContainEqual({ code: shape, message });
        expect(after.projectRevision).toBe(review.projectRevision); expect(after.defaultBoardRevision).toBe(review.defaultBoardRevision);
      });
    } finally { await restore(); }
  });
}

test('REST refuses field retirement while an active transition still requires it', async ({ request }) => {
  const projectId = await coverageProject(request), fieldId = crypto.randomUUID();
  const fields = { expectedRevision: (await config(request, projectId)).revision, key: 'required_release_evidence', name: 'Required release evidence', kind: 'text', required: false, retired: false, defaultValue: null } satisfies SaveFieldFields;
  const saved = await restSuccess(request, 'save_field', { projectId, fieldId, ...fields, ...reference() }, zSavedFieldSaved);
  const workflow = (await restSuccess(request, 'list_workflows', { projectId }, zPageWorkflowView)).items[0]!;
  const transition = (await restSuccess(request, 'list_workflow_transitions', { projectId, workflowId: workflow.id }, zPageTransitionView)).items[0]!;
  const policy = { requiredSystemFields: [], requiredFieldIds: [fieldId], approvalsRequired: 0, approverRole: null, excludeIssueReporter: false } satisfies TransitionPolicy;
  const accepted = await restSuccess(request, 'save_transition_policy', { projectId, workflowId: workflow.id, transitionId: transition.id, expectedRevision: saved.result.configuration.revision, policy, ...reference() }, zSavedTransitionPolicyView);
  await restCase('UC-CFG-0053', async () => {
    const denied = await restFailure(request, 'save_field', { projectId, fieldId, ...fields, expectedRevision: accepted.result.configuration.revision, retired: true, ...reference() }, zConfigurationFailureBody, 'validation_failed');
    expect([denied.error.message, ...denied.error.fieldErrors.map(value => value.message)].join('\n')).toContain('Remove active transition requirements before retiring this field.');
    expect(await config(request, projectId)).toEqual(accepted.result.configuration);
    expect((await restSuccess(request, 'list_fields', { projectId, includeRetired: true }, zPageFieldDefinition)).items.find(value => value.id === fieldId)).toEqual(saved.result.field);
    expect((await restSuccess(request, 'get_transition_policy', { projectId, workflowId: workflow.id, transitionId: transition.id }, zTransitionPolicyView)).policy).toEqual(policy);
  });
});

test('REST retained type-workflow bindings expose stable identities and complete cursor state', async ({ request }) => {
  const projectId = await coverageProject(request), type = (await restSuccess(request, 'list_issue_types', { projectId }, zPageTypeView)).items.find(value => value.key === 'task')!;
  const baseline = await restSuccess(request, 'list_type_workflow_bindings', { projectId, typeId: type.id }, zPageBindingView);
  expect(baseline.items).toHaveLength(1);
  const workflowId = crypto.randomUUID();
  const fields = { expectedRevision: (await config(request, projectId)).revision, name: 'Retained closed workflow', retired: false } satisfies SaveWorkflowFields;
  const workflow = await restSuccess(request, 'save_workflow', { projectId, workflowId, ...fields, ...reference() }, zSavedWorkflowSaved);
  const binding = { expectedRevision: workflow.result.configuration.revision, default: false, acceptsNew: false } satisfies SetBindingFields;
  const bound = await restSuccess(request, 'set_type_workflow_binding', { projectId, workflowId, typeId: type.id, ...binding, ...reference() }, zSavedConfigurationView);
  // New workflows must start active. Retire only this nondefault, closed
  // binding's workflow through the ordinary guarded public lifecycle.
  await restSuccess(request, 'save_workflow', { projectId, workflowId, ...fields, expectedRevision: bound.result.revision, retired: true, ...reference() }, zSavedWorkflowSaved);
  await restCase('UC-WFL-0007', async () => {
    const retained = await restSuccess(request, 'list_workflows', { projectId, includeRetired: true }, zPageWorkflowView, 'viewer');
    expect(retained.items.find(value => value.id === workflowId)).toMatchObject({ id: workflowId, retired: true });
    const first = await restSuccess(request, 'list_type_workflow_bindings', { projectId, typeId: type.id, page: { limit: 1 } }, zPageBindingView, 'viewer');
    expect(first.items).toHaveLength(1); expect(first.nextCursor).not.toBeNull();
    const second = await restSuccess(request, 'list_type_workflow_bindings', { projectId, typeId: type.id, page: { limit: 1, cursor: first.nextCursor! } }, zPageBindingView, 'viewer');
    expect(second.items).toHaveLength(1); expect(second.nextCursor).toBeNull();
    const all = [...first.items, ...second.items];
    expect(all).toHaveLength(2); expect(new Set(all.map(value => value.workflowId))).toEqual(new Set([baseline.items[0]!.workflowId, workflowId]));
    expect(all.find(value => value.workflowId === workflowId)).toEqual({ projectId, typeId: type.id, workflowId, default: false, acceptsNew: false });
    expect(all.find(value => value.workflowId === baseline.items[0]!.workflowId)).toEqual(baseline.items[0]);
    const reread = await restSuccess(request, 'list_type_workflow_bindings', { projectId, typeId: type.id, page: { limit: 1 } }, zPageBindingView, 'viewer');
    expect(reread.items).toEqual(first.items); expect(reread.nextCursor).not.toBeNull();
  });
});

test('MCP number key English and Arabic board queries stay inside the permanent authorized view', async ({ request }) => {
  const projectId = await coverageProject(request), board = await coverageBoard(request, projectId);
  const arabic = await coverageIssue(request, projectId, { title: 'عطل البوابة الفريد', assigneeId: memberId });
  const english = await coverageIssue(request, projectId, { title: 'Future delivery', assigneeId: memberId });
  const outside = await coverageIssue(request, projectId, { title: 'Future delivery عطل البوابة الفريد' });
  const foreignProject = await coverageProject(request), foreign = await coverageIssue(request, foreignProject, { title: 'Future delivery عطل البوابة الفريد', assigneeId: memberId });
  expect(foreign.summary.number).toBe(arabic.summary.number);
  const draft = coverageLayoutDraft(board); draft.savedFilters = { assignee: { kind: 'self' } };
  await coverageSaveLayout(request, board.board.id, draft);
  const criteria = [
    ['UC-BRD-0098', arabic.summary.number, arabic.summary.id],
    ['UC-BRD-0099', arabic.summary.key, arabic.summary.id],
    ['UC-BRD-0100', 'Future delivery', english.summary.id],
    ['UC-BRD-0101', 'البوابة', arabic.summary.id],
  ] as const;
  for (const [id, query, expected] of criteria) await mcpCase(id, async () => {
    const layout = await mcpSuccess(request, 'get_board_v2', { boardId: board.board.id, temporaryFilters: { query } }, zLayoutView, 'member');
    expect(layout.board.savedFilters).toEqual({ assignee: { kind: 'self' } });
    expect(layout.columns.reduce((count, column) => count + column.savedMatchCount, 0)).toBe(2);
    expect(layout.columns.reduce((count, column) => count + column.visibleMatchCount, 0)).toBe(1);
    const actual: string[] = [];
    for (const column of layout.columns) {
      const page = await mcpSuccess(request, 'list_board_cards_v2', { boardId: board.board.id, columnId: column.id, temporaryFilters: { query }, page: { limit: 25 } }, zNativeCardPage, 'member');
      expect(page.nextCursor).toBeNull(); expect(page.terminal).toBe(true);
      expect(page.items.every(value => value.projectId === projectId && value.assignee?.id === memberId)).toBe(true);
      actual.push(...page.items.map(value => value.id));
    }
    expect(actual).toEqual([expected]); expect(actual).not.toContain(outside.summary.id); expect(actual).not.toContain(foreign.summary.id);
  });
});

test('MCP epic and release changes preserve the other relationship and separate planning revision', async ({ request }) => {
  const projectId = await coverageProject(request), issue = await coverageIssue(request, projectId);
  const create = async (kind: 'epic' | 'release', name: string) => {
    const fields = { kind, name, description: '', targetDate: null, status: 'planned' } satisfies PlanningCreateFields;
    return (await mcpSuccess(request, 'create_planning_item', { projectId, ...fields, ...reference() }, zSavedPlanningItemView, 'member')).result;
  };
  const epicA = await create('epic', 'Original epic'), epicB = await create('epic', 'Accepted replacement epic');
  const releaseA = await create('release', 'Original release'), releaseB = await create('release', 'Accepted replacement release');
  const read = () => mcpSuccess(request, 'get_issue_planning', { issueId: issue.summary.id }, zIssuePlanningView, 'member');
  let current = await read();
  current = (await mcpSuccess(request, 'set_issue_planning', { issueId: issue.summary.id, expectedRevision: current.revision, epicId: epicA.id, releaseId: releaseA.id, ...reference() }, zSavedIssuePlanningView, 'member')).result;
  await mcpCase('UC-PLN-0087', async () => {
    const prior = current, fields = { expectedRevision: prior.revision, epicId: epicB.id, releaseId: prior.releaseId } satisfies IssuePlanningFields;
    const accepted = await mcpSuccess(request, 'set_issue_planning', { issueId: issue.summary.id, ...fields, ...reference() }, zSavedIssuePlanningView, 'member');
    current = accepted.result;
    expect(current).toMatchObject({ issueId: issue.summary.id, projectId, epicId: epicB.id, epicName: epicB.name, releaseId: releaseA.id, releaseName: releaseA.name });
    expect(current.revision).not.toBe(prior.revision); expect(await read()).toEqual(current);
    expect((await mcpSuccess(request, 'get_issue_v2', { issueId: issue.summary.id }, zModernIssueView, 'member')).summary.revision).toBe(issue.summary.revision);
  });
  await mcpCase('UC-PLN-0088', async () => {
    const prior = current, fields = { expectedRevision: prior.revision, epicId: prior.epicId, releaseId: releaseB.id } satisfies IssuePlanningFields;
    current = (await mcpSuccess(request, 'set_issue_planning', { issueId: issue.summary.id, ...fields, ...reference() }, zSavedIssuePlanningView, 'member')).result;
    expect(current).toMatchObject({ issueId: issue.summary.id, projectId, epicId: epicB.id, epicName: epicB.name, releaseId: releaseB.id, releaseName: releaseB.name });
    expect(current.revision).not.toBe(prior.revision); expect(await read()).toEqual(current);
    expect((await mcpSuccess(request, 'get_issue_v2', { issueId: issue.summary.id }, zModernIssueView, 'member')).summary.revision).toBe(issue.summary.revision);
  });
});
