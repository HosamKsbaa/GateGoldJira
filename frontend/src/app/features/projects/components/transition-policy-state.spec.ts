// Presentation-model units use typed public signal ports before the first real
// Angular effect tick. Vitest does not compile Angular signal-input metadata;
// these tests make no input-binding, rendered-UI, or browser coverage claim.
import '@angular/compiler';
import { provideZonelessChangeDetection, RendererFactory2, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldDefinition, TransitionPolicyView } from '../../../api/generated/types.gen';
import { ApiError } from '../../../core/api/api-result';
import { AuthService } from '../../../core/auth/auth.service';
import { DraftsService } from '../../../core/drafts/drafts.service';
import { ProjectFieldsApi } from '../project-fields.api';
import { TransitionPolicyComponent } from './transition-policy.component';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
const projectId = 'project-a', workflowId = 'workflow-a', transitionId = 'transition-a';
function view(revision = '1', policy: Partial<TransitionPolicyView['policy']> = {}): TransitionPolicyView {
  return { configuration: { projectId, revision, mode: 'modern', canManage: true, defaults: { standardTypeId: 'task', subtaskTypeId: 'subtask', priorityId: 'medium' } }, transitionId, workflowRevision: revision,
    policy: { requiredSystemFields: [], requiredFieldIds: [], approvalsRequired: 0, approverRole: null, excludeIssueReporter: false, ...policy } };
}
function field(id: string, name: string, retired = false): FieldDefinition { return { id, key: id, name, projectId, retired, required: false, kind: 'text', defaultValue: null }; }
function failure(code: 'conflict' | 'validation_failed' | 'temporarily_unavailable', retryable = false) { return new ApiError({ error: { code, message: 'Transition requirements could not be saved.', retryable, nextAction: code === 'conflict' ? 'reload_current_state' : 'none', fieldErrors: [] }, current: null, unfinished: null }, code === 'conflict' ? 409 : code === 'validation_failed' ? 422 : 503); }
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }

describe('transition policy public form state', () => {
  const epoch = signal(1), me = signal(null), project = signal(projectId), workflow = signal(workflowId), transition = signal(transitionId), changed = vi.fn<() => void>();
  const policy = vi.fn<ProjectFieldsApi['policy']>(), fields = vi.fn<ProjectFieldsApi['fields']>(), savePolicy = vi.fn<ProjectFieldsApi['savePolicy']>();
  let component: TransitionPolicyComponent, drafts: DraftsService;
  beforeEach(async () => {
    epoch.set(1); project.set(projectId); workflow.set(workflowId); transition.set(transitionId); changed.mockReset(); policy.mockReset().mockResolvedValue(view()); fields.mockReset().mockResolvedValue({ items: [], nextCursor: null, totalMatching: 0 }); savePolicy.mockReset();
    vi.stubGlobal('window', Object.assign(new EventTarget(), { confirm: () => true })); vi.stubGlobal('document', {});
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('Model units must not render components.'); } } }, { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
      { provide: AuthService, useValue: { sessionEpoch: epoch, me } satisfies Pick<AuthService, 'sessionEpoch' | 'me'> },
      { provide: ProjectFieldsApi, useValue: { policy, fields, savePolicy } satisfies Pick<ProjectFieldsApi, 'policy' | 'fields' | 'savePolicy'> },
    ] });
    drafts = TestBed.inject(DraftsService); component = TestBed.runInInjectionContext(() => new TransitionPolicyComponent());
    Object.assign(component, { projectId: project, workflowId: workflow, transitionId: transition });
    component.changed.subscribe(changed); TestBed.tick();
    await vi.waitFor(() => expect(component.view()?.configuration.revision).toBe('1'));
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });
  it('loads the public transition context and starts pristine', () => {
    expect(policy).toHaveBeenCalledExactlyOnceWith(projectId, workflowId, transitionId); expect(fields).toHaveBeenCalledExactlyOnceWith(projectId);
    expect(component.form.getRawValue()).toEqual({ assignee: false, dueDate: false, description: false, count: 0, role: 'member', excludeReporter: false }); expect(drafts.dirtyCount()).toBe(0);
  });

  it('loads requirements and defaults a disabled approval role to members without marking a draft dirty', async () => {
    policy.mockResolvedValueOnce(view('2', { requiredSystemFields: ['assignee', 'due_date', 'description'], requiredFieldIds: ['risk'], approvalsRequired: 2, approverRole: 'project_admin', excludeIssueReporter: true }));
    await component.load();
    expect(component.form.getRawValue()).toEqual({ assignee: true, dueDate: true, description: true, count: 2, role: 'project_admin', excludeReporter: true }); expect(component.requiredIds()).toEqual(['risk']); expect(drafts.dirtyCount()).toBe(0);
    policy.mockResolvedValueOnce(view('3')); await component.load(); expect(component.form.controls.role.value).toBe('member'); expect(component.form.controls.count.value).toBe(0); expect(component.requiredIds()).toEqual([]);
  });

  it('filters available required fields while preserving labels for an already-required retired field', () => {
    component.fields.set([field('english', 'Release Risk'), field('arabic', 'مراجعة أمنية'), field('retained', 'Retired requirement', true)]);
    component.requiredIds.set(['retained', 'arabic']); component.query.set('RELEASE'); expect(component.choices()).toEqual([{ id: 'english', label: 'Release Risk' }]);
    component.query.set('أمنية'); expect(component.choices()).toEqual([{ id: 'arabic', label: 'مراجعة أمنية' }]);
    component.query.set('retired'); expect(component.choices()).toEqual([]); expect(component.selectedChoices()).toEqual([{ id: 'arabic', label: 'مراجعة أمنية' }, { id: 'retained', label: 'Retired requirement' }]);
  });

  it('uses the explicit field cursor without fetching absent follow-up pages', async () => {
    await component.more(); expect(fields).toHaveBeenCalledTimes(1);
    component.fields.set([field('first', 'First')]); component.cursor.set('next-fields'); fields.mockResolvedValueOnce({ items: [field('next', 'Next')], nextCursor: null, totalMatching: 2 });
    await component.more(); expect(fields).toHaveBeenLastCalledWith(projectId, 'next-fields'); expect(component.fields().map(value => value.id)).toEqual(['first', 'next']); expect(component.cursor()).toBeNull();
  });

  it.each([0, 2])('saves system and custom requirements with %s approvals, applies the authoritative policy, and emits change', async count => {
    component.form.setValue({ assignee: true, dueDate: true, description: true, count, role: 'project_admin', excludeReporter: true }); component.requiredIds.set(['risk']); component.remember(); expect(drafts.dirtyCount()).toBe(1);
    const next = view('2', { requiredSystemFields: ['assignee', 'due_date', 'description'], requiredFieldIds: ['risk'], approvalsRequired: count, approverRole: count ? 'project_admin' : null, excludeIssueReporter: true });
    savePolicy.mockResolvedValueOnce({ result: next, receipt: { eventId: null, replayed: false } }); await component.save();
    expect(savePolicy.mock.calls[0]!.slice(0, 4)).toEqual([projectId, workflowId, transitionId, { expectedRevision: '1', policy: next.policy }]);
    expect(savePolicy.mock.calls[0]![4]).toMatch(/^[0-9a-f-]{36}$/); expect(component.view()).toEqual(next); expect(component.pending()).toBeNull(); expect(component.conflict()).toBe(false); expect(changed).toHaveBeenCalledExactlyOnceWith(undefined); expect(drafts.dirtyCount()).toBe(0);
  });

  it('retains an uncertain original policy and reference until an exact replay succeeds', async () => {
    component.form.controls.description.setValue(true); savePolicy.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await component.save();
    const original = savePolicy.mock.calls[0]!; expect(component.pending()).toEqual(original[3]); expect(component.state.failure()?.status).toBe(503); expect(changed).not.toHaveBeenCalled();
    savePolicy.mockResolvedValueOnce({ result: view('2', { requiredSystemFields: ['description'] }), receipt: { eventId: null, replayed: true } }); await component.save();
    expect(savePolicy.mock.calls[1]).toEqual(original); expect(component.pending()).toBeNull(); expect(component.state.failure()).toBeNull(); expect(changed).toHaveBeenCalledTimes(1);
  });

  it('requires successful explicit conflict review before using the refreshed revision and keeps the local rules', async () => {
    component.form.controls.dueDate.setValue(true); savePolicy.mockRejectedValueOnce(failure('conflict')); await component.save();
    expect(component.conflict()).toBe(true); await component.save(); expect(savePolicy).toHaveBeenCalledTimes(1);
    policy.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await component.review(); expect(component.conflict()).toBe(true); expect(component.form.controls.dueDate.value).toBe(true);
    policy.mockResolvedValueOnce(view('9')); await component.review(); expect(component.conflict()).toBe(false); expect(component.pending()).toBeNull(); expect(component.form.controls.dueDate.value).toBe(true);
    savePolicy.mockResolvedValueOnce({ result: view('10', { requiredSystemFields: ['due_date'] }), receipt: { eventId: null, replayed: false } }); await component.save();
    expect(savePolicy.mock.calls[1]![3]).toEqual({ expectedRevision: '9', policy: { ...view().policy, requiredSystemFields: ['due_date'] } }); expect(savePolicy.mock.calls[1]![4]).not.toBe(savePolicy.mock.calls[0]![4]);
  });

  it('releases a rejected policy intention for correction and clears the previous typed failure after saving', async () => {
    component.form.controls.count.setValue(101); savePolicy.mockRejectedValueOnce(failure('validation_failed')); await component.save();
    expect(component.pending()).toBeNull(); expect(component.state.failure()?.status).toBe(422); component.form.controls.count.setValue(1);
    savePolicy.mockResolvedValueOnce({ result: view('2', { approvalsRequired: 1, approverRole: 'member' }), receipt: { eventId: null, replayed: false } }); await component.save();
    expect(savePolicy.mock.calls[1]![3].policy.approvalsRequired).toBe(1); expect(savePolicy.mock.calls[1]![4]).not.toBe(savePolicy.mock.calls[0]![4]); expect(component.state.failure()).toBeNull(); expect(changed).toHaveBeenCalledTimes(1);
  });

  it('does not publish the previous transition load after the public context changes', async () => {
    const held = deferred<TransitionPolicyView>(); policy.mockReturnValueOnce(held.promise); const loading = component.load();
    transition.set('transition-next'); policy.mockResolvedValueOnce({ ...view('next'), transitionId: 'transition-next' }); TestBed.tick();
    await vi.waitFor(() => expect(component.view()?.transitionId).toBe('transition-next'));
    held.resolve(view('private-old')); await loading; expect(component.view()?.transitionId).toBe('transition-next'); expect(component.view()?.configuration.revision).toBe('next');
  });

  it('does not emit a held previous-session save and releases dirty policy ownership on destruction', async () => {
    component.form.controls.assignee.setValue(true); const held = deferred<Awaited<ReturnType<ProjectFieldsApi['savePolicy']>>>(); savePolicy.mockReturnValueOnce(held.promise); const saving = component.save();
    epoch.set(2); policy.mockResolvedValueOnce(view('next')); TestBed.tick(); await vi.waitFor(() => expect(component.view()?.configuration.revision).toBe('next'));
    held.resolve({ result: view('private-old'), receipt: { eventId: null, replayed: false } }); await saving; expect(changed).not.toHaveBeenCalled(); expect(component.view()?.configuration.revision).toBe('next');
    component.form.controls.description.setValue(true); expect(drafts.dirtyCount()).toBe(1); TestBed.resetTestingModule(); expect(drafts.dirtyCount()).toBe(0);
  });

});
