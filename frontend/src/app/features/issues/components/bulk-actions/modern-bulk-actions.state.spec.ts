// These presentation-model units exercise real Angular effects, output events and
// DraftsService. Typed public signal ports replace only inputs before the first
// effect tick because Vitest does not transform Angular signal-input metadata.
// The component uses public ngModel values, not a reactive FormGroup or
// RequestState; these tests do not claim template bindings or browser behavior.
import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, provideZonelessChangeDetection, RendererFactory2, runInInjectionContext, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IssueView, Me, ModernIssueSummary, ModernIssueView, PageStageView, PriorityView, StageView } from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { ProjectWorkflowsApi } from '../../../projects/project-workflows.api';
import { IssuesApi } from '../../issues.api';
import { ModernIssuesApi } from '../../modern-issues.api';
import { ModernBulkActionsComponent } from './modern-bulk-actions.component';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
const projectId = 'project-a', workflowId = 'delivery';
const originalPriority: PriorityView = { id: 'medium', key: 'medium', name: 'Medium', sortOrder: '2', retired: false, projectId, default: true };
const targetPriority: PriorityView = { id: 'high', key: 'high', name: 'High', sortOrder: '1', retired: false, projectId, default: false };
const account: Me = { userId: 'member', displayName: 'Member', email: 'member@example.test', administrator: false, companyTimeZone: 'Africa/Cairo' };
function issue(id = 'issue-a', overrides: Partial<ModernIssueSummary> = {}): ModernIssueSummary {
  return { id, projectId, key: `GG-${id}`, number: '1', title: `Work ${id}`,
    type: { id: 'task', key: 'task', name: 'Task', behavior: 'standard', retired: false }, priority: originalPriority,
    workflow: { id: workflowId, name: 'Delivery', revision: '1', retired: false },
    stage: { id: 'ready', name: 'Ready', category: 'todo', position: '1', initial: true, acceptsEntries: true, retired: false },
    assignee: null, dueDate: null, overdue: false, labels: [], blocked: false, unfinishedBlockerCount: 0, parent: null,
    subtaskProgress: { done: 0, total: 0 }, revision: '7', archived: false, backlog: false,
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...overrides };
}
function view(summary = issue()): ModernIssueView {
  return { summary, description: '', descriptionFormat: 'plain', graphRevision: '1', links: [], reporter: { id: account.userId, displayName: account.displayName }, watching: false, capabilities: ['read', 'edit', 'move'] };
}
function legacyView(): IssueView {
  const summary = issue();
  return { summary: { ...summary, type: 'task', priority: 'medium', status: 'todo' }, description: '', graphRevision: '1', orderRevisions: [], sourceOrderRevision: '1', reporter: { id: account.userId, displayName: account.displayName }, capabilities: ['read', 'edit'] };
}
function stage(id: string, overrides: Partial<StageView> = {}): StageView {
  return { id, name: id, projectId, workflowId, category: 'review', position: '2', initial: false, acceptsEntries: true, retired: false, ...overrides };
}
function page(items: StageView[], nextCursor: string | null = null): PageStageView { return { items, nextCursor, totalMatching: items.length }; }
function failure(code: 'conflict' | 'forbidden' | 'temporarily_unavailable', retryable = false) {
  return new ApiError({ error: { code, message: code === 'forbidden' ? 'Your project role cannot change this issue.' : 'The issue could not be changed.', retryable, nextAction: code === 'conflict' ? 'reload_current_state' : 'none', fieldErrors: [] }, current: null, unfinished: null }, code === 'conflict' ? 409 : code === 'forbidden' ? 403 : 503);
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  return { promise: new Promise<T>((done, fail) => { resolve = done; reject = fail; }), resolve: (value: T) => resolve(value), reject: (reason: unknown) => reject(reason) };
}

describe('modern bulk actions public state', () => {
  const epoch = signal(1), me = signal<Me | null>(account);
  const patch = vi.fn<ModernIssuesApi['patch']>(), move = vi.fn<ModernIssuesApi['move']>(), get = vi.fn<ModernIssuesApi['get']>();
  const organize = vi.fn<IssuesApi['organize']>(), stages = vi.fn<ProjectWorkflowsApi['stages']>();
  let drafts: DraftsService;
  const scopes: EnvironmentInjector[] = [];
  beforeEach(() => {
    epoch.set(1); me.set(account);
    patch.mockReset().mockResolvedValue({ result: view(), receipt: { eventId: null, replayed: false } });
    move.mockReset().mockResolvedValue({ result: view(), receipt: { eventId: null, replayed: false } });
    get.mockReset().mockResolvedValue(view());
    organize.mockReset().mockResolvedValue({ result: legacyView(), receipt: { eventId: null, replayed: false } });
    stages.mockReset().mockResolvedValue(page([]));
    vi.stubGlobal('window', Object.assign(new EventTarget(), { confirm: () => true }));
    vi.stubGlobal('document', {});
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('Model units must not render components.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
      { provide: AuthService, useValue: { sessionEpoch: epoch, me } satisfies Pick<AuthService, 'sessionEpoch' | 'me'> },
      { provide: ModernIssuesApi, useValue: { patch, move, get } satisfies Pick<ModernIssuesApi, 'patch' | 'move' | 'get'> },
      { provide: IssuesApi, useValue: { organize } satisfies Pick<IssuesApi, 'organize'> },
      { provide: ProjectWorkflowsApi, useValue: { stages } satisfies Pick<ProjectWorkflowsApi, 'stages'> },
    ] });
    drafts = TestBed.inject(DraftsService);
  });
  afterEach(() => { for (const scope of scopes.splice(0)) if (!scope.destroyed) scope.destroy(); TestBed.resetTestingModule(); vi.unstubAllGlobals(); });
  function mount(initial = [issue()]) {
    const project = signal(projectId), selected = signal(initial), priorities = signal([originalPriority, targetPriority]);
    const selectionChange = vi.fn<(items: ModernIssueSummary[]) => void>(), changed = vi.fn<() => void>();
    const scope = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector)); scopes.push(scope);
    const component = runInInjectionContext(scope, () => new ModernBulkActionsComponent());
    Object.assign(component, { projectId: project, selected, priorities });
    component.selectionChange.subscribe(selectionChange); component.changed.subscribe(changed); TestBed.tick();
    return { component, selected, project, priorities, selectionChange, changed, destroy: () => scope.destroy() };
  }

  it('requires a current selectable priority and clears a target that becomes retired', async () => {
    const f = mount(); expect(f.component.validAction()).toBe(false); await f.component.apply(); expect(patch).not.toHaveBeenCalled(); expect(drafts.dirtyCount()).toBe(0);
    f.component.priorityId = 'unknown'; expect(f.component.validAction()).toBe(false);
    f.component.priorityId = targetPriority.id; expect(f.component.validAction()).toBe(true);
    f.priorities.set([originalPriority, { ...targetPriority, retired: true }]); TestBed.tick();
    expect(f.component.priorityId).toBe(''); expect(f.component.validAction()).toBe(false); await f.component.apply(); expect(patch).not.toHaveBeenCalled();
  });

  it('patches each selected priority using its own prior value, emits only after completion, and clears the draft', async () => {
    const first = issue('first'), second = issue('second', { priority: { ...originalPriority, id: 'low', key: 'low' } });
    const f = mount([first, second]); f.component.priorityId = targetPriority.id;
    await f.component.apply();
    expect(patch.mock.calls.map(call => call.slice(0, 2))).toEqual([
      [first.id, { field: 'priorityId', priority: { prior: first.priority.id, value: targetPriority.id } }],
      [second.id, { field: 'priorityId', priority: { prior: second.priority.id, value: targetPriority.id } }],
    ]);
    const references = patch.mock.calls.map(call => call[2]); expect(new Set(references).size).toBe(2); for (const reference of references) expect(reference).toMatch(/^[0-9a-f-]{36}$/);
    expect(f.selectionChange).toHaveBeenCalledExactlyOnceWith([]); expect(f.changed).toHaveBeenCalledExactlyOnceWith(undefined);
    expect(f.component.report()).toBe('2 issue(s) saved; 0 need attention.'); expect(f.component.failures()).toEqual([]); expect(f.component.frozen()).toBe(false); expect(drafts.modernBulk.size).toBe(0); expect(drafts.dirtyCount()).toBe(0);
  });

  it.each([
    { target: 'teammate', previous: null },
    { target: '', previous: { id: 'previous', displayName: 'Previous assignee' } },
  ])('sends an explicit assignee prior value and supports assignment or clearing ($target)', async ({ target, previous }) => {
    const f = mount([issue('assigned', { assignee: previous })]); f.component.action = 'assignee'; f.component.assigneeId = target;
    await f.component.apply();
    expect(patch.mock.calls[0]!.slice(0, 2)).toEqual(['assigned', { field: 'assigneeId', assignee: { prior: previous?.id ?? null, value: target || null } }]);
    expect(move).not.toHaveBeenCalled(); expect(organize).not.toHaveBeenCalled();
  });

  it.each([
    { target: '2026-11-01', previous: null },
    { target: '', previous: '2026-10-25' },
  ])('sends an explicit due-date prior value and supports setting or clearing ($target)', async ({ target, previous }) => {
    const f = mount([issue('dated', { dueDate: previous })]); f.component.action = 'due'; f.component.dueDate = target; await f.component.apply();
    expect(patch.mock.calls[0]!.slice(0, 2)).toEqual(['dated', { field: 'dueDate', dueDate: { prior: previous, value: target || null } }]);
  });

  it.each([
    { action: 'archive', changes: { archived: true } }, { action: 'restore', changes: { archived: false } },
    { action: 'backlog', changes: { backlog: true } }, { action: 'board', changes: { backlog: false } },
  ] as const)('uses the issue revision for the $action organization intention', async ({ action, changes }) => {
    const f = mount(); f.component.action = action; await f.component.apply();
    expect(organize.mock.calls[0]!.slice(0, 2)).toEqual(['issue-a', { expectedRevision: '7', ...changes }]); expect(patch).not.toHaveBeenCalled(); expect(move).not.toHaveBeenCalled();
  });

  it('keeps only rejected issues selected and requires an explicit authoritative review before a fresh intention', async () => {
    const first = issue('allowed'), second = issue('forbidden'), f = mount([first, second]); f.component.priorityId = targetPriority.id;
    patch.mockResolvedValueOnce({ result: view(first), receipt: { eventId: null, replayed: false } }).mockRejectedValueOnce(failure('forbidden'));
    await f.component.apply();
    expect(f.selectionChange).toHaveBeenLastCalledWith([second]); expect(f.component.report()).toBe('1 issue(s) saved; 1 need attention.');
    expect(f.component.failures()).toEqual([{ id: second.id, key: second.key, message: 'Your project role cannot change this issue.', uncertain: false }]); expect(f.component.hasPending()).toBe(false); expect(drafts.dirtyCount()).toBe(0);
    const oldReference = patch.mock.calls[1]![2], current = issue(second.id, { priority: { ...originalPriority, id: 'urgent', key: 'urgent' }, revision: '12' });
    f.selected.set([second]); get.mockResolvedValueOnce(view(current)); await f.component.review(second.id);
    expect(get).toHaveBeenCalledExactlyOnceWith(second.id); expect(f.selectionChange).toHaveBeenLastCalledWith([current]); expect(f.component.failures()).toEqual([]);
    expect(f.component.report()).toBe('Latest issue loaded. Review its values before applying again.');
    f.selected.set([current]); await f.component.apply();
    expect(patch.mock.calls[2]!.slice(0, 2)).toEqual([second.id, { field: 'priorityId', priority: { prior: 'urgent', value: targetPriority.id } }]); expect(patch.mock.calls[2]![2]).not.toBe(oldReference);
  });

  it('retains the exact uncertain intention and reference while controls and review are frozen, then clears them on replay', async () => {
    const original = issue(), f = mount([original]); f.component.priorityId = targetPriority.id;
    patch.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await f.component.apply();
    const firstCall = patch.mock.calls[0]!; expect(f.component.hasPending()).toBe(true); expect(f.component.frozen()).toBe(true); expect(f.component.failures()[0]?.uncertain).toBe(true); expect(drafts.dirtyCount()).toBe(1);
    expect(drafts.modernBulk.get(projectId)?.retries.get(original.id)).toEqual({ reference: firstCall[2], intent: { kind: 'patch', body: firstCall[1] } });
    f.component.clear(); f.component.clearReport(); await f.component.review(original.id);
    expect(f.selectionChange).toHaveBeenCalledTimes(1); expect(get).not.toHaveBeenCalled(); expect(f.component.report()).toBe('0 issue(s) saved; 1 need attention.');
    f.priorities.set([{ ...targetPriority, retired: true }]); TestBed.tick(); expect(f.component.priorityId).toBe(targetPriority.id); expect(f.component.validAction()).toBe(true);
    patch.mockResolvedValueOnce({ result: view({ ...original, priority: targetPriority }), receipt: { eventId: null, replayed: true } }); await f.component.apply();
    expect(patch.mock.calls[1]).toEqual(firstCall); expect(f.selectionChange).toHaveBeenLastCalledWith([]); expect(f.component.hasPending()).toBe(false); expect(f.component.failures()).toEqual([]); expect(drafts.modernBulk.has(projectId)).toBe(false); expect(drafts.dirtyCount()).toBe(0);
  });

  it('treats an unknown transport rejection as uncertain with a safe fallback message', async () => {
    const f = mount(); f.component.action = 'due'; patch.mockRejectedValueOnce({ socket: 'private transport detail' }); await f.component.apply();
    expect(f.component.failures()).toEqual([{ id: 'issue-a', key: 'GG-issue-a', message: 'Could not save this issue.', uncertain: true }]);
    expect(f.component.hasPending()).toBe(true); expect(drafts.modernBulk.get(projectId)?.retries.size).toBe(1);
  });

  it('preserves selection and the rejected issue after review fails, and permits a later successful review', async () => {
    const f = mount(); f.component.action = 'due'; patch.mockRejectedValueOnce(failure('conflict')); await f.component.apply();
    const before = f.component.failures(); get.mockRejectedValueOnce(new TypeError('offline')); await f.component.review('issue-a');
    expect(f.component.failures()).toEqual(before); expect(f.selectionChange).toHaveBeenCalledTimes(1); expect(f.component.report()).toBe('Could not review this issue. Your selection is preserved.'); expect(f.component.busy()).toBe(false);
    await f.component.review('issue-a'); expect(f.component.failures()).toEqual([]); expect(f.selectionChange).toHaveBeenLastCalledWith([issue()]);
    f.component.clearReport(); f.component.clear(); expect(f.component.report()).toBe(''); expect(f.selectionChange).toHaveBeenLastCalledWith([]);
  });

  it('prevents duplicate apply, clear and review while a save is in flight', async () => {
    const f = mount(), held = deferred<Awaited<ReturnType<ModernIssuesApi['patch']>>>(); f.component.action = 'due'; patch.mockReturnValueOnce(held.promise);
    const applying = f.component.apply(); expect(f.component.busy()).toBe(true); expect(drafts.dirtyCount()).toBe(1);
    await f.component.apply(); await f.component.review('issue-a'); f.component.clear(); f.component.clearReport();
    expect(patch).toHaveBeenCalledTimes(1); expect(get).not.toHaveBeenCalled(); expect(f.selectionChange).not.toHaveBeenCalled();
    held.resolve({ result: view(), receipt: { eventId: null, replayed: false } }); await applying; expect(f.component.busy()).toBe(false); expect(drafts.dirtyCount()).toBe(0);
  });

  it('refuses cross-project selection without dispatching a write or retaining a retry intention', async () => {
    const foreign = issue('foreign', { projectId: 'other-project' }), f = mount([foreign]); f.component.action = 'due'; await f.component.apply();
    expect(patch).not.toHaveBeenCalled(); expect(organize).not.toHaveBeenCalled(); expect(move).not.toHaveBeenCalled();
    expect(f.component.failures()).toEqual([{ id: foreign.id, key: foreign.key, message: 'Choose issues from this project only.', uncertain: false }]); expect(f.selectionChange).toHaveBeenCalledExactlyOnceWith([foreign]); expect(f.component.hasPending()).toBe(false); expect(drafts.modernBulk.size).toBe(0);
  });

  it('limits one bulk request to one hundred independently referenced issues', async () => {
    const selected = Array.from({ length: 101 }, (_, index) => issue(String(index))), f = mount(selected); f.component.action = 'due'; await f.component.apply();
    expect(patch).toHaveBeenCalledTimes(100); expect(patch.mock.calls.map(call => call[0])).toEqual(selected.slice(0, 100).map(value => value.id)); expect(new Set(patch.mock.calls.map(call => call[2])).size).toBe(100); expect(f.component.report()).toBe('100 issue(s) saved; 0 need attention.');
  });

  it('loads only entry-accepting active stages, follows the explicit cursor, and uses the selected revision to move', async () => {
    const f = mount(); f.component.action = 'status'; stages.mockResolvedValueOnce(page([stage('review'), stage('retired', { retired: true }), stage('closed', { acceptsEntries: false })], 'next-stage'));
    await f.component.loadStages(); expect(stages).toHaveBeenLastCalledWith(projectId, workflowId, undefined); expect(f.component.stages().map(value => value.id)).toEqual(['review']); expect(f.component.stageCursor()).toBe('next-stage');
    await f.component.loadStages(); expect(stages).toHaveBeenCalledTimes(1);
    stages.mockResolvedValueOnce(page([stage('deploy')])); await f.component.loadStages(true); expect(stages).toHaveBeenLastCalledWith(projectId, workflowId, 'next-stage'); expect(f.component.stages().map(value => value.id)).toEqual(['review', 'deploy']); expect(f.component.stageCursor()).toBeNull();
    f.component.stageId = 'closed'; expect(f.component.validAction()).toBe(false); await f.component.apply(); expect(move).not.toHaveBeenCalled();
    f.component.stageId = 'deploy'; expect(f.component.validAction()).toBe(true); await f.component.apply(); expect(move.mock.calls[0]!.slice(0, 2)).toEqual(['issue-a', { expectedRevision: '7', targetStageId: 'deploy' }]); expect(patch).not.toHaveBeenCalled();
  });

  it('shows the mixed-workflow guard instead of requesting stages or moving issues', async () => {
    const f = mount([issue(), issue('other', { workflow: { id: 'other-workflow', name: 'Other', retired: false, revision: '1' } })]); f.component.action = 'status'; await f.component.loadStages();
    expect(stages).not.toHaveBeenCalled(); expect(f.component.stageMessage()).toBe('Select issues from one workflow to move them together.'); expect(f.component.validAction()).toBe(false); await f.component.apply(); expect(move).not.toHaveBeenCalled();
  });

  it('allows retrying a failed stage read without leaving loading stuck', async () => {
    const f = mount(); f.component.action = 'status'; stages.mockRejectedValueOnce(new TypeError('offline')); await f.component.loadStages();
    expect(f.component.loadingStages()).toBe(false); expect(f.component.stageMessage()).toBe('Could not load stages. Choose the action again to retry.');
    stages.mockResolvedValueOnce(page([stage('review')])); await f.component.loadStages(); expect(f.component.stageMessage()).toBe(''); expect(f.component.stages().map(value => value.id)).toEqual(['review']);
  });

  it('does not replace stages with an old workflow response after selection changes context', async () => {
    const f = mount(), held = deferred<PageStageView>(); f.component.action = 'status'; stages.mockReturnValueOnce(held.promise); const loading = f.component.loadStages();
    expect(f.component.loadingStages()).toBe(true); expect(f.component.validAction()).toBe(false);
    f.selected.set([issue('new-workflow', { workflow: { id: 'new-workflow', name: 'New workflow', revision: '1', retired: false } })]); stages.mockResolvedValueOnce(page([stage('new-stage', { workflowId: 'new-workflow' })])); TestBed.tick();
    await vi.waitFor(() => expect(f.component.stages().map(value => value.id)).toEqual(['new-stage']));
    held.resolve(page([stage('old-private-stage')], 'old-cursor')); await loading; expect(f.component.stages().map(value => value.id)).toEqual(['new-stage']); expect(f.component.stageCursor()).toBeNull(); expect(f.component.loadingStages()).toBe(false);
  });

  it.each(['success', 'failure'] as const)('does not publish a held %s save or start the next issue after the account epoch changes', async outcome => {
    const f = mount([issue(), issue('next')]), held = deferred<Awaited<ReturnType<ModernIssuesApi['patch']>>>(); f.component.action = 'due'; patch.mockReturnValueOnce(held.promise); const applying = f.component.apply();
    epoch.set(2); TestBed.tick(); expect(drafts.dirtyCount()).toBe(0); expect(f.component.failures()).toEqual([]);
    if (outcome === 'success') held.resolve({ result: view(), receipt: { eventId: null, replayed: false } }); else held.reject(failure('forbidden'));
    await applying; expect(patch).toHaveBeenCalledTimes(1); expect(f.selectionChange).not.toHaveBeenCalled(); expect(f.changed).not.toHaveBeenCalled(); expect(f.component.report()).toBe(''); expect(f.component.hasPending()).toBe(false); expect(drafts.modernBulk.size).toBe(0); expect(drafts.dirtyCount()).toBe(0);
  });

  it('does not publish a stage read or authoritative review from the previous account', async () => {
    const f = mount(), stageRead = deferred<PageStageView>(), reviewRead = deferred<ModernIssueView>(); f.component.action = 'status'; stages.mockReturnValueOnce(stageRead.promise); const loading = f.component.loadStages();
    get.mockReturnValueOnce(reviewRead.promise); const reviewing = f.component.review('issue-a');
    epoch.set(2); TestBed.tick(); stageRead.resolve(page([stage('private-stage')])); reviewRead.resolve(view(issue('private-issue'))); await Promise.all([loading, reviewing]);
    expect(f.component.stages()).toEqual([]); expect(f.selectionChange).not.toHaveBeenCalled(); expect(f.component.report()).toBe(''); expect(f.component.busy()).toBe(false);
  });

  it('restores an owned unresolved draft and replays its original body and reference without rebuilding the intention', async () => {
    const retained = issue('retained'), reference = '10000000-0000-4000-8000-000000000001', body = { field: 'dueDate', dueDate: { prior: null, value: '2026-11-01' } } as const;
    drafts.modernBulk.set(projectId, { selected: [retained], retries: new Map([[retained.id, { reference, intent: { kind: 'patch', body } }]]), action: 'due', dueDate: '2026-11-01', priorityId: '', assigneeId: '', stageId: '' });
    const f = mount([retained]); expect(f.selectionChange).toHaveBeenCalledExactlyOnceWith([retained]); expect(f.component.action).toBe('due'); expect(f.component.dueDate).toBe('2026-11-01'); expect(f.component.frozen()).toBe(true); expect(drafts.dirtyCount()).toBe(1);
    await f.component.apply(); expect(patch).toHaveBeenCalledExactlyOnceWith(retained.id, body, reference); expect(drafts.modernBulk.has(projectId)).toBe(false); expect(drafts.dirtyCount()).toBe(0);
  });

  it('retains an unresolved same-account draft while releasing the settled editor on navigation away', async () => {
    const f = mount(); f.component.action = 'due'; f.component.dueDate = '2026-11-01'; patch.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await f.component.apply();
    const original = patch.mock.calls[0]!; expect(drafts.dirtyCount()).toBe(1); expect(f.component.hasPending()).toBe(true);
    f.destroy(); expect(drafts.dirtyCount()).toBe(0); expect(drafts.modernBulk.get(projectId)).toMatchObject({ selected: [issue()], action: 'due', dueDate: '2026-11-01' });
    expect(drafts.modernBulk.get(projectId)?.retries.get('issue-a')).toEqual({ reference: original[2], intent: { kind: 'patch', body: original[1] } });
  });

  it.each(['pending', 'replayed'] as const)('does not overwrite a reopened %s editor when its destroyed predecessor finishes late', async outcome => {
    const first = mount(), held = deferred<Awaited<ReturnType<ModernIssuesApi['patch']>>>(); first.component.action = 'due'; first.component.dueDate = '2026-11-01'; patch.mockReturnValueOnce(held.promise); const applying = first.component.apply();
    first.destroy(); expect(drafts.dirtyCount()).toBe(0);
    const reopened = mount(); expect(reopened.component.hasPending()).toBe(true); expect(reopened.component.dueDate).toBe('2026-11-01'); expect(drafts.dirtyCount()).toBe(1);
    const replay = async () => { await reopened.component.apply(); expect(patch.mock.calls[1]).toEqual(patch.mock.calls[0]); expect(drafts.dirtyCount()).toBe(0); expect(reopened.component.hasPending()).toBe(false); expect(drafts.modernBulk.has(projectId)).toBe(false); };
    if (outcome === 'replayed') await replay();
    held.resolve({ result: view(), receipt: { eventId: null, replayed: false } }); await applying;
    expect(first.selectionChange).not.toHaveBeenCalled(); expect(first.changed).not.toHaveBeenCalled();
    if (outcome === 'pending') {
      expect(drafts.dirtyCount()).toBe(1); expect(reopened.component.hasPending()).toBe(true); expect(drafts.modernBulk.get(projectId)?.retries.get('issue-a')?.reference).toBe(patch.mock.calls[0]![2]); await replay();
    } else { expect(drafts.dirtyCount()).toBe(0); expect(drafts.modernBulk.has(projectId)).toBe(false); }
  });

  it('keeps an uncertain draft on destruction but does not publish the held response or process later issues', async () => {
    const f = mount([issue(), issue('next')]), held = deferred<Awaited<ReturnType<ModernIssuesApi['patch']>>>(); f.component.action = 'due'; patch.mockReturnValueOnce(held.promise); const applying = f.component.apply();
    f.destroy(); expect(drafts.modernBulk.get(projectId)?.retries.size).toBe(1); expect(drafts.dirtyCount()).toBe(0);
    held.resolve({ result: view(), receipt: { eventId: null, replayed: false } }); await applying;
    expect(patch).toHaveBeenCalledTimes(1); expect(f.selectionChange).not.toHaveBeenCalled(); expect(f.changed).not.toHaveBeenCalled(); expect(drafts.modernBulk.get(projectId)?.retries.get('issue-a')).toEqual({ reference: patch.mock.calls[0]![2], intent: { kind: 'patch', body: patch.mock.calls[0]![1] } });
    expect(drafts.dirtyCount()).toBe(0);
  });
});
