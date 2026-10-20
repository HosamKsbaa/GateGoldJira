// Presentation-model units with real Angular forms/effects, typed API ports,
// and public editor actions. No browser or live-service coverage is claimed.
import '@angular/compiler';
import { provideZonelessChangeDetection, RendererFactory2, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BindingView, ConfigurationView, StageView, TransitionView, TypeView, WorkflowView } from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { ProjectConfigurationApi } from '../../project-configuration.api';
import { ProjectWorkflowsApi } from '../../project-workflows.api';
import { ProjectWorkflowsPage } from './project-workflows.page';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
const projectId = '20000000-0000-4000-8000-000000000001';
const receipt = { eventId: null, replayed: false };
function configuration(revision = '1', overrides: Partial<ConfigurationView> = {}): ConfigurationView {
  return { projectId, revision, canManage: true, mode: 'modern', defaults: { standardTypeId: 'task', subtaskTypeId: 'subtask', priorityId: 'medium' }, ...overrides };
}
function workflow(id = 'delivery', overrides: Partial<WorkflowView> = {}): WorkflowView {
  return { id, projectId, revision: '1', name: id, legacyBridge: false, retired: false, ...overrides };
}
function stage(id = 'todo', overrides: Partial<StageView> = {}): StageView {
  return { id, projectId, workflowId: 'delivery', name: id, category: 'todo', position: '1', acceptsEntries: true, initial: true, retired: false, ...overrides };
}
function transition(id = 'start', overrides: Partial<TransitionView> = {}): TransitionView {
  return { id, projectId, workflowId: 'delivery', fromStageId: 'todo', toStageId: 'done', requiredPermission: null, retired: false, ...overrides };
}
function type(id = 'task'): TypeView { return { id, projectId, name: id, key: id, retired: false, default: true, behavior: 'standard' }; }
function binding(workflowId = 'delivery'): BindingView { return { projectId, workflowId, typeId: 'task', acceptsNew: true, default: true }; }
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
function failure(code: 'conflict' | 'validation_failed' | 'temporarily_unavailable', retryable = false) {
  return new ApiError({ error: { code, message: 'Workflow configuration could not be saved.', retryable, nextAction: code === 'conflict' ? 'reload_current_state' : 'none', fieldErrors: [] }, current: null, unfinished: null }, code === 'conflict' ? 409 : code === 'validation_failed' ? 422 : 503);
}

describe('workflow editor owns drafts, retries, and explicit review', () => {
  const epoch = signal(1), me = signal(null), confirm = vi.fn<Window['confirm']>();
  const get = vi.fn<ProjectConfigurationApi['get']>(), types = vi.fn<ProjectConfigurationApi['types']>();
  const workflows = vi.fn<ProjectWorkflowsApi['workflows']>(), stages = vi.fn<ProjectWorkflowsApi['stages']>(), transitions = vi.fn<ProjectWorkflowsApi['transitions']>(), bindings = vi.fn<ProjectWorkflowsApi['bindings']>();
  const saveWorkflow = vi.fn<ProjectWorkflowsApi['saveWorkflow']>(), saveStage = vi.fn<ProjectWorkflowsApi['saveStage']>(), saveTransition = vi.fn<ProjectWorkflowsApi['saveTransition']>(), saveBinding = vi.fn<ProjectWorkflowsApi['saveBinding']>(), migrate = vi.fn<ProjectWorkflowsApi['migrate']>();
  let page: ProjectWorkflowsPage, drafts: DraftsService;
  beforeEach(() => {
    epoch.set(1); confirm.mockReset().mockReturnValue(true);
    for (const port of [get, types, workflows, stages, transitions, bindings, saveWorkflow, saveStage, saveTransition, saveBinding, migrate]) port.mockReset();
    get.mockResolvedValue(configuration()); types.mockResolvedValue({ items: [type()], nextCursor: null, totalMatching: 1 });
    workflows.mockResolvedValue({ items: [workflow('retained', { retired: true }), workflow()], nextCursor: null, totalMatching: 2 });
    stages.mockResolvedValue({ items: [stage(), stage('done', { category: 'done', position: '2', initial: false })], nextCursor: null, totalMatching: 2 });
    transitions.mockResolvedValue({ items: [transition()], nextCursor: null, totalMatching: 1 });
    bindings.mockResolvedValue({ items: [binding()], nextCursor: null, totalMatching: 1 });
    vi.stubGlobal('window', Object.assign(new EventTarget(), { confirm }));
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'hidden' }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('Model units must not render components.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
      { provide: AuthService, useValue: { sessionEpoch: epoch, me } satisfies Pick<AuthService, 'sessionEpoch' | 'me'> },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ projectId }) } } },
      { provide: ProjectConfigurationApi, useValue: { get, types } satisfies Pick<ProjectConfigurationApi, 'get' | 'types'> },
      { provide: ProjectWorkflowsApi, useValue: { workflows, stages, transitions, bindings, saveWorkflow, saveStage, saveTransition, saveBinding, migrate } satisfies Pick<ProjectWorkflowsApi, 'workflows' | 'stages' | 'transitions' | 'bindings' | 'saveWorkflow' | 'saveStage' | 'saveTransition' | 'saveBinding' | 'migrate'> },
    ] });
    drafts = TestBed.inject(DraftsService); page = TestBed.runInInjectionContext(() => new ProjectWorkflowsPage()); TestBed.tick();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });
  async function loaded() { await vi.waitFor(() => expect(page.state.busy()).toBe(false)); expect(page.configuration()?.revision).toBe('1'); }

  it('initially chooses an active workflow and keeps retired choices visible without granting editor access', async () => {
    await loaded(); expect(page.selectedFlow()).toBe('delivery'); expect(page.selectedType()).toBe('task');
    expect(stages).toHaveBeenCalledExactlyOnceWith(projectId, 'delivery'); expect(bindings).toHaveBeenCalledExactlyOnceWith(projectId, 'task');
    expect(page.workflows().map(v => v.id)).toEqual(['retained', 'delivery']); expect(page.editableFlow()).toBe(true);
    await page.selectFlow('retained'); expect(page.editableFlow()).toBe(false); expect(page.flowName('retained')).toBe('retained');
    page.workflows.set([workflow('retained', { legacyBridge: true })]); page.configuration.set(configuration('1', { mode: 'legacy' })); expect(page.editableFlow()).toBe(false);
    page.configuration.set(configuration('1', { mode: 'modern' })); expect(page.editableFlow()).toBe(true);
    page.configuration.set(configuration('1', { canManage: false })); expect(page.writable()).toBe(false); expect(page.editableFlow()).toBe(false);
    expect(page.stageName('off-page')).toBe('Retained stage'); expect(page.flowName('off-page')).toBe('Retained workflow');
  });

  it('does not request stage or binding details when a fresh project has no selectable workflow or type', async () => {
    await loaded(); page.selectedFlow.set(''); page.selectedType.set(''); workflows.mockResolvedValueOnce({ items: [], nextCursor: null, totalMatching: 0 }); types.mockResolvedValueOnce({ items: [], nextCursor: null, totalMatching: 0 });
    await page.reload(); expect(page.selectedFlow()).toBe(''); expect(page.selectedType()).toBe(''); expect(stages).toHaveBeenCalledTimes(1); expect(bindings).toHaveBeenCalledTimes(1);
  });

  it('requires confirmation before abandoning local or child-policy drafts and removes its unload listener on destruction', async () => {
    await loaded(); expect(page.mayLeave()).toBe(true); expect(confirm).not.toHaveBeenCalled();
    page.openWorkflow(); page.workflowForm.controls.name.setValue('Unsaved workflow'); confirm.mockReturnValue(false);
    await page.selectFlow('retained'); await page.selectType('different'); page.openStage();
    expect(page.panel()).toBe('workflow'); expect(page.selectedFlow()).toBe('delivery'); expect(page.selectedType()).toBe('task');
    const unload = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    confirm.mockReturnValue(true); await page.selectFlow('retained'); expect(page.panel()).toBeNull(); expect(page.dirty()).toBe(false);
    drafts.activate('transition-policy:owned', true); confirm.mockReturnValue(false); expect(page.mayLeave()).toBe(false);
    page.openWorkflow(); page.workflowForm.controls.name.setValue('Another draft'); TestBed.resetTestingModule();
    const afterDestroy = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(afterDestroy); expect(afterDestroy.defaultPrevented).toBe(true);
    // The shared DraftsService still owns its independent dirty policy marker;
    // clear it so the remaining assertion isolates this page's removed listener.
    drafts.release('transition-policy:owned');
    const isolated = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(isolated); expect(isolated.defaultPrevented).toBe(false);
  });

  it('keeps an uncertain workflow intent and reference frozen until the exact retry succeeds', async () => {
    await loaded(); page.openWorkflow(); page.workflowForm.controls.name.setValue('Customer delivery'); saveWorkflow.mockRejectedValueOnce(failure('temporarily_unavailable', true));
    await page.save(); const sent = saveWorkflow.mock.calls[0]!;
    expect(sent[2]).toEqual({ expectedRevision: '1', name: 'Customer delivery', retired: false }); expect(page.frozen()).toBe(true); expect(page.state.failure()?.status).toBe(503);
    await page.selectFlow('retained'); page.openStage(); expect(page.panel()).toBe('workflow'); expect(page.selectedFlow()).toBe('delivery');
    saveWorkflow.mockResolvedValueOnce({ receipt: { eventId: null, replayed: true }, result: { configuration: configuration('2'), workflow: workflow(sent[1], { name: 'Customer delivery' }) } }); await page.save();
    expect(saveWorkflow.mock.calls[1]).toEqual(sent); expect(page.selectedFlow()).toBe(sent[1]); expect(page.pending()).toBeNull(); expect(page.dirty()).toBe(false); expect(page.panel()).toBeNull();
    expect(page.workflows().filter(v => v.id === sent[1])).toHaveLength(1); expect(page.notice()).toContain('Existing issues keep their assigned workflow');
  });

  it('preserves a conflict draft through failed review, then submits only after reviewing the latest revision', async () => {
    await loaded(); page.openWorkflow(true); page.workflowForm.controls.name.setValue('My workflow draft'); saveWorkflow.mockRejectedValueOnce(failure('conflict'));
    await page.save(); expect(page.reviewRequired()).toBe(true); expect(page.pending()).toBeNull(); await page.save(); expect(saveWorkflow).toHaveBeenCalledTimes(1);
    get.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await page.review(); expect(page.reviewRequired()).toBe(true); expect(page.workflowForm.controls.name.value).toBe('My workflow draft');
    get.mockResolvedValueOnce(configuration('9')); await page.review(); expect(page.reviewRequired()).toBe(false); expect(page.workflowForm.controls.name.value).toBe('My workflow draft'); expect(page.notice()).toContain('Your draft is preserved');
    saveWorkflow.mockResolvedValueOnce({ receipt, result: { configuration: configuration('10'), workflow: workflow('delivery', { name: 'My workflow draft' }) } }); await page.save();
    expect(saveWorkflow.mock.calls[1]![1]).toBe('delivery'); expect(saveWorkflow.mock.calls[1]![2].expectedRevision).toBe('9'); expect(saveWorkflow.mock.calls[1]![3]).not.toBe(saveWorkflow.mock.calls[0]![3]);
  });

  it('discards a terminal validation intent and safely cancels an uncertain replacement', async () => {
    await loaded(); page.openWorkflow(true); page.workflowForm.controls.name.setValue('Rejected'); saveWorkflow.mockRejectedValueOnce(failure('validation_failed')); await page.save();
    expect(page.pending()).toBeNull(); expect(page.panel()).toBe('workflow'); expect(page.reviewRequired()).toBe(false);
    page.workflowForm.controls.name.setValue('Corrected'); saveWorkflow.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await page.save();
    expect(saveWorkflow.mock.calls[1]![2].name).toBe('Corrected'); expect(saveWorkflow.mock.calls[1]![3]).not.toBe(saveWorkflow.mock.calls[0]![3]);
    page.cancel(); expect(page.pending()).toBeNull(); expect(page.panel()).toBeNull(); expect(page.dirty()).toBe(false); expect(page.reviewRequired()).toBe(false);
  });

  it('adds a stage after the exact largest decimal position and retains selected stage identity when editing', async () => {
    await loaded(); page.stages.set([stage('earlier', { position: '9007199254740992' }), stage('last', { position: '9007199254740993' })]); page.openStage();
    expect(page.stageForm.controls.position.value).toBe('9007199254740994'); expect(page.activeForm()).toBe(page.stageForm);
    page.stageForm.patchValue({ name: 'QA', category: 'review', acceptsEntries: true });
    saveStage.mockResolvedValueOnce({ receipt, result: { configuration: configuration('2'), stage: stage('qa', { name: 'QA', category: 'review' }) } }); await page.save();
    expect(saveStage.mock.calls[0]![1]).toBe('delivery'); expect(saveStage.mock.calls[0]![3]).toEqual({ expectedRevision: '1', name: 'QA', category: 'review', position: '9007199254740994', initial: false, acceptsEntries: true, retired: false });
    const old = stage('retained-stage', { retired: true, acceptsEntries: false, initial: false, category: 'done', position: '8' }); page.stages.set([old]); page.openStage(old);
    expect(page.stageForm.getRawValue()).toEqual({ name: 'retained-stage', category: 'done', position: '8', initial: false, acceptsEntries: false, retired: true }); expect(page.activeStages()).toEqual([]); expect(page.closedStages()).toEqual([old]);
    page.stageForm.controls.name.setValue('Historic done'); saveStage.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await page.save(); expect(saveStage.mock.calls[1]![2]).toBe('retained-stage');
  });

  it.each(['', 'project_admin'] as const)('saves transition endpoints and normalizes the explicit %s permission choice', async permission => {
    await loaded(); page.openTransition(transition('retained-move', { retired: true })); page.transitionForm.patchValue({ from: 'review', to: 'done', permission, retired: false });
    saveTransition.mockResolvedValueOnce({ receipt, result: { configuration: configuration('2'), transition: transition('retained-move', { fromStageId: 'review', requiredPermission: permission || null }) } }); await page.save();
    expect(saveTransition.mock.calls[0]!.slice(0, 4)).toEqual([projectId, 'delivery', 'retained-move', { expectedRevision: '1', fromStageId: 'review', toStageId: 'done', requiredPermission: permission || null, retired: false }]);
    expect(page.pending()).toBeNull(); expect(page.panel()).toBeNull();
  });

  it('writes the selected type binding independently from the displayed workflow', async () => {
    await loaded(); page.openBinding({ ...binding('retained'), acceptsNew: false, default: false }); expect(page.activeForm()).toBe(page.bindingForm);
    page.bindingForm.patchValue({ flow: 'other-workflow', default: true, acceptsNew: false }); saveBinding.mockResolvedValueOnce({ receipt, result: configuration('2') }); await page.save();
    expect(saveBinding.mock.calls[0]!.slice(0, 4)).toEqual([projectId, 'task', 'other-workflow', { expectedRevision: '1', default: true, acceptsNew: false }]); expect(page.configuration()?.revision).toBe('2'); expect(page.bindings()).toEqual([binding()]);
  });

  it('validates a bounded migration and reports the actual moved and remaining totals', async () => {
    await loaded(); page.openMigration(); await vi.waitFor(() => expect(page.state.busy()).toBe(false)); expect(page.activeForm()).toBe(page.migrationForm);
    page.migrationForm.patchValue({ source: 'retired-source', targetStage: 'done', limit: 101 }); await page.save(); expect(migrate).not.toHaveBeenCalled();
    page.migrationForm.controls.limit.setValue(25); migrate.mockResolvedValueOnce({ receipt, result: { configuration: configuration('2'), moved: 25, remaining: 7 } }); await page.save();
    expect(migrate.mock.calls[0]!.slice(0, 2)).toEqual([projectId, { expectedRevision: '1', sourceStageId: 'retired-source', targetStageId: 'done', limit: 25 }]); expect(page.notice()).toBe('Moved 25 issues. 7 remain in the source stage.'); expect(page.pending()).toBeNull(); expect(page.dirty()).toBe(false);
  });

  it('refuses a late migration-target page after the public target workflow selection changes', async () => {
    await loaded(); page.migrationForm.controls.targetFlow.setValue('old-target');
    const held = deferred<Awaited<ReturnType<ProjectWorkflowsApi['stages']>>>(); stages.mockReturnValueOnce(held.promise); const loading = page.loadTargets();
    page.migrationForm.controls.targetFlow.setValue('new-target'); held.resolve({ items: [stage('old-private')], nextCursor: 'old-cursor', totalMatching: 1 }); await loading;
    expect(page.targetStages()).toEqual([]); expect(page.targetCursor()).toBeNull();
    stages.mockResolvedValueOnce({ items: [stage('current-target')], nextCursor: null, totalMatching: 1 }); await page.loadTargets(); expect(page.targetStages().map(v => v.id)).toEqual(['current-target']);
  });

  it('does not send invalid, read-only, busy, or absent-configuration workflow writes', async () => {
    await loaded(); page.openWorkflow(); await page.save(); page.openTransition(); await page.save(); page.openBinding(); page.bindingForm.controls.flow.setValue(''); await page.save();
    page.openStage(); page.stageForm.controls.position.setValue('0'); await page.save();
    page.openWorkflow(); page.workflowForm.controls.name.setValue('Valid'); page.configuration.set(configuration('1', { canManage: false })); await page.save();
    page.configuration.set(configuration()); page.state.busy.set(true); page.cancel(); expect(page.panel()).toBe('workflow'); await page.save(); page.state.busy.set(false); page.configuration.set(null); await page.save();
    for (const port of [saveWorkflow, saveStage, saveTransition, saveBinding, migrate]) expect(port).not.toHaveBeenCalled();
  });

  it('clears private editor state on a session change and refuses a held previous-account save result', async () => {
    await loaded(); page.openWorkflow(true); page.workflowForm.controls.name.setValue('Previous account');
    const held = deferred<Awaited<ReturnType<ProjectWorkflowsApi['saveWorkflow']>>>(); saveWorkflow.mockReturnValueOnce(held.promise); const saving = page.save();
    epoch.set(2); TestBed.tick(); expect(page.configuration()).toBeNull(); expect(page.workflows()).toEqual([]); expect(page.stages()).toEqual([]); expect(page.bindings()).toEqual([]); expect(page.selectedFlow()).toBe(''); expect(page.panel()).toBeNull(); expect(page.pending()).toBeNull();
    held.resolve({ receipt, result: { configuration: configuration('private'), workflow: workflow('private') } }); await saving;
    expect(page.configuration()).toBeNull(); expect(page.workflows()).toEqual([]); expect(page.notice()).toBe(''); expect(page.state.busy()).toBe(false);
  });

  it('loads each explicit cursor through its owning workflow, type, or migration target', async () => {
    await loaded();
    for (const kind of ['workflows', 'stages', 'transitions', 'types', 'bindings', 'targets'] as const) await page.more(kind);
    expect(workflows).toHaveBeenCalledTimes(1); expect(stages).toHaveBeenCalledTimes(1); expect(transitions).toHaveBeenCalledTimes(1); expect(types).toHaveBeenCalledTimes(1); expect(bindings).toHaveBeenCalledTimes(1);
    page.workflowCursor.set('flow-page'); page.stageCursor.set('stage-page'); page.transitionCursor.set('move-page'); page.typeCursor.set('type-page'); page.bindingCursor.set('binding-page'); page.targetCursor.set('target-page'); page.migrationForm.controls.targetFlow.setValue('migration-target');
    workflows.mockResolvedValueOnce({ items: [workflow('next-flow')], nextCursor: null, totalMatching: 3 });
    stages.mockResolvedValueOnce({ items: [stage('next-stage')], nextCursor: null, totalMatching: 3 }).mockResolvedValueOnce({ items: [stage('next-target')], nextCursor: null, totalMatching: 1 });
    transitions.mockResolvedValueOnce({ items: [transition('next-move')], nextCursor: null, totalMatching: 2 });
    types.mockResolvedValueOnce({ items: [type('next-type')], nextCursor: null, totalMatching: 2 });
    bindings.mockResolvedValueOnce({ items: [binding('next-binding')], nextCursor: null, totalMatching: 2 });
    for (const kind of ['workflows', 'stages', 'transitions', 'types', 'bindings', 'targets'] as const) await page.more(kind);
    expect(workflows).toHaveBeenLastCalledWith(projectId, 'flow-page'); expect(stages.mock.calls.slice(1)).toEqual([[projectId, 'delivery', 'stage-page'], [projectId, 'migration-target', 'target-page']]);
    expect(transitions).toHaveBeenLastCalledWith(projectId, 'delivery', 'move-page'); expect(types).toHaveBeenLastCalledWith(projectId, 'type-page'); expect(bindings).toHaveBeenLastCalledWith(projectId, 'task', 'binding-page');
    expect(page.workflows().at(-1)?.id).toBe('next-flow'); expect(page.stages().at(-1)?.id).toBe('next-stage'); expect(page.transitions().at(-1)?.id).toBe('next-move'); expect(page.types().at(-1)?.id).toBe('next-type'); expect(page.bindings().at(-1)?.workflowId).toBe('next-binding'); expect(page.targetStages().map(v => v.id)).toEqual(['next-target']);
    for (const cursor of [page.workflowCursor, page.stageCursor, page.transitionCursor, page.typeCursor, page.bindingCursor, page.targetCursor]) expect(cursor()).toBeNull();
  });

  it('refuses a previous-account follow-up page even when its request completes successfully', async () => {
    await loaded(); page.stageCursor.set('old-page'); const held = deferred<Awaited<ReturnType<ProjectWorkflowsApi['stages']>>>(); stages.mockReturnValueOnce(held.promise);
    const loading = page.more('stages'); epoch.set(2); TestBed.tick(); held.resolve({ items: [stage('private-old')], nextCursor: 'private-next', totalMatching: 1 }); await loading;
    expect(page.stages()).toEqual([]); expect(page.configuration()).toBeNull(); expect(page.state.busy()).toBe(false); expect(page.notice()).toBe('');
  });

  it('contains a private transport diagnostic without losing the uncertain original intention', async () => {
    await loaded(); page.openWorkflow(); page.workflowForm.controls.name.setValue('Draft'); saveWorkflow.mockRejectedValueOnce(new Error('Private upstream internals'));
    await page.save(); const original = page.pending(); expect(original).not.toBeNull(); expect(page.state.failure()).toBeNull(); expect(page.state.message()).toBe('The request could not be completed. Check your connection and try again.'); expect(page.state.message()).not.toContain('Private'); expect(page.state.busy()).toBe(false);
    expect(page.workflowForm.controls.name.value).toBe('Draft'); expect(page.panel()).toBe('workflow'); page.cancel(); expect(page.pending()).toBeNull(); expect(page.mayLeave()).toBe(true);
  });

});
