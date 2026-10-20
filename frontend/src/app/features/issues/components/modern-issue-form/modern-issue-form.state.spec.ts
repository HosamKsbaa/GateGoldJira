// Public presentation-model units. No template rendering or browser evidence is claimed.
import '@angular/compiler';
import { provideZonelessChangeDetection, RendererFactory2, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetView, BindingView, ConfigurationView, FieldAssignment, ModernCreateFields, ModernEditable, ModernIssueView, SavedModernIssueView, PageBindingView, PageUserSummary, PriorityView, TypeView, WorkflowView } from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService, type ModernIssueDraft } from '../../../../core/drafts/drafts.service';
import { AssetsApi } from '../../../attachments/assets.api';
import { ProjectConfigurationApi } from '../../../projects/project-configuration.api';
import { ProjectWorkflowsApi } from '../../../projects/project-workflows.api';
import { IssueChoiceCache } from '../../issue-choice-cache.service';
import { IssuesApi } from '../../issues.api';
import { ModernIssuesApi } from '../../modern-issues.api';
import { modernEditable } from '../../issue-model';
import { ModernIssueFormComponent } from './modern-issue-form.component';

const projectId = '20000000-0000-4000-8000-000000000001';
const secondProject = '20000000-0000-4000-8000-000000000002';
const standardId = '30000000-0000-4000-8000-000000000001';
const subtaskId = '30000000-0000-4000-8000-000000000002';
const priorityId = '40000000-0000-4000-8000-000000000001';
const workflowId = '80000000-0000-4000-8000-000000000001';
const actor = { id: '10000000-0000-4000-8000-000000000002', displayName: 'Authorized member' };
function configuration(revision = '1', project = projectId): ConfigurationView {
  return { projectId: project, revision, mode: 'modern', canManage: false, defaults: { standardTypeId: standardId, subtaskTypeId: subtaskId, priorityId } };
}
function type(id = standardId, overrides: Partial<TypeView> = {}): TypeView {
  return { id, projectId, key: id === subtaskId ? 'subtask' : 'task', name: id === subtaskId ? 'Subtask' : 'Task', behavior: id === subtaskId ? 'subtask' : 'standard', retired: false, default: true, ...overrides };
}
function priority(id = priorityId, overrides: Partial<PriorityView> = {}): PriorityView {
  return { id, projectId, key: 'medium', name: 'Medium', sortOrder: '1', default: true, retired: false, ...overrides };
}
function workflow(id = workflowId, overrides: Partial<WorkflowView> = {}): WorkflowView {
  return { id, projectId, name: 'Delivery', revision: '1', retired: false, legacyBridge: false, ...overrides };
}
function binding(typeId = standardId, overrides: Partial<BindingView> = {}): BindingView {
  return { projectId, typeId, workflowId, acceptsNew: true, default: true, ...overrides };
}
function issue(): ModernIssueView {
  return { capabilities: ['read', 'edit'], description: '<p>Existing description</p>', descriptionFormat: 'html', graphRevision: '1', links: [], reporter: actor, watching: false,
    summary: { id: '50000000-0000-4000-8000-000000000001', projectId, key: 'GG-1', number: '1', title: 'Existing title', revision: '7',
      archived: false, backlog: false, blocked: false, createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z', dueDate: null, overdue: false,
      assignee: actor, labels: [], parent: null, subtaskProgress: { total: 0, done: 0 }, unfinishedBlockerCount: 0,
      type: type(), priority: priority(), workflow: workflow(),
      stage: { id: '90000000-0000-4000-8000-000000000001', name: 'To do', category: 'todo', initial: true, position: '1', retired: false, acceptsEntries: true } } };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const failure = () => new ApiError({ error: { code: 'temporarily_unavailable', message: 'Retry the same intention.', fieldErrors: [], retryable: true, nextAction: 'retry_same_reference' }, current: null, unfinished: null }, 503);
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
const initialKey = 'issue:' + projectId + ':new:';
function asset(id: string, kind: AssetView['kind'] = 'file'): AssetView {
  return { id, issueId: issue().summary.id, issueRevision: '8', kind, mimeType: kind === 'image' ? 'image/png' : 'text/plain', filename: 'Evidence', description: '', inPanel: true, state: 'published', byteSize: '4', expiresAt: null, uploadedAt: '2026-10-20T00:00:00Z', uploader: actor };
}
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
describe('modern issue form public state, drafts and asynchronous ownership', () => {
  const project = signal(projectId), currentIssue = signal<ModernIssueView | null>(null), epoch = signal(1);
  const subtask = signal(false), scope = signal(''), busy = signal(false), saveAllowed = signal(true), restored = signal<ModernIssueDraft | null>(null);
  const getConfiguration = vi.fn<ProjectConfigurationApi['get']>(), types = vi.fn<ProjectConfigurationApi['types']>(), priorities = vi.fn<ProjectConfigurationApi['priorities']>();
  const workflows = vi.fn<ProjectWorkflowsApi['workflows']>(), bindings = vi.fn<ProjectWorkflowsApi['bindings']>();
  const assignees = vi.fn<IssuesApi['assignees']>(), policy = vi.fn<AssetsApi['policy']>(), upload = vi.fn<AssetsApi['uploadFile']>();
  const getIssue = vi.fn<ModernIssuesApi['get']>(), updateIssue = vi.fn<ModernIssuesApi['update']>();
  const confirm = vi.fn<Window['confirm']>();
  const created: ModernCreateFields[] = [], saved: ModernEditable[] = [], uploadedRevisions: string[] = [];
  let form: ModernIssueFormComponent, drafts: DraftsService, cache: IssueChoiceCache, cancelled: number;
  beforeEach(() => {
    project.set(projectId); currentIssue.set(null); epoch.set(1); subtask.set(false); scope.set(''); busy.set(false); saveAllowed.set(true); restored.set(null);
    created.length = 0; saved.length = 0; uploadedRevisions.length = 0; cancelled = 0; confirm.mockReset().mockReturnValue(true);
    getConfiguration.mockReset().mockResolvedValue(configuration()); types.mockReset().mockResolvedValue({ items: [type(), type(subtaskId)], nextCursor: null, totalMatching: 2 });
    priorities.mockReset().mockResolvedValue({ items: [priority()], nextCursor: null, totalMatching: 1 });
    workflows.mockReset().mockResolvedValue({ items: [workflow()], nextCursor: null, totalMatching: 1 }); bindings.mockReset().mockResolvedValue({ items: [binding()], nextCursor: null, totalMatching: 1 });
    assignees.mockReset().mockResolvedValue({ items: [actor], nextCursor: null, totalMatching: 1 });
    policy.mockReset().mockResolvedValue({ maximumFileBytes: '10485760', maximumImageBytes: '10485760', chunkBytes: '1048576' });
    upload.mockReset(); getIssue.mockReset().mockResolvedValue(issue()); updateIssue.mockReset();
    vi.stubGlobal('window', Object.assign(new EventTarget(), { confirm })); vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'hidden' }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { sessionEpoch: epoch, me: signal({ userId: actor.id }) } },
      { provide: ProjectConfigurationApi, useValue: { get: getConfiguration, types, priorities } satisfies Pick<ProjectConfigurationApi, 'get' | 'types' | 'priorities'> },
      { provide: ProjectWorkflowsApi, useValue: { workflows, bindings } satisfies Pick<ProjectWorkflowsApi, 'workflows' | 'bindings'> },
      { provide: IssuesApi, useValue: { assignees } satisfies Pick<IssuesApi, 'assignees'> },
      { provide: AssetsApi, useValue: { policy, uploadFile: upload } satisfies Pick<AssetsApi, 'policy' | 'uploadFile'> },
      { provide: ModernIssuesApi, useValue: { get: getIssue, update: updateIssue } satisfies Pick<ModernIssuesApi, 'get' | 'update'> },
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('This state model does not render a component.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
    ] });
    drafts = TestBed.inject(DraftsService); cache = TestBed.inject(IssueChoiceCache);
    form = TestBed.runInInjectionContext(() => new ModernIssueFormComponent());
    // Bind public signal ports before the actual Angular constructor effects run.
    // No private component fields, Angular input nodes or child view queries are changed.
    Object.defineProperties(form, { projectId: { value: project.asReadonly() }, current: { value: currentIssue.asReadonly() }, subtask: { value: subtask.asReadonly() }, draftScope: { value: scope.asReadonly() }, busy: { value: busy.asReadonly() }, saveAllowed: { value: saveAllowed.asReadonly() }, restoredDraft: { value: restored.asReadonly() } });
    form.create.subscribe(value => created.push(value)); form.save.subscribe(value => saved.push(value)); form.uploadedRevision.subscribe(value => uploadedRevisions.push(value)); form.cancel.subscribe(() => cancelled++);
    TestBed.tick();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  async function loaded() { await flush(); expect(form.configurationState.busy()).toBe(false); expect(form.bindingState.busy()).toBe(false); }

  it('loads current project defaults and binding choices without materializing a dirty blank draft', async () => {
    await loaded(); expect(getConfiguration).toHaveBeenCalledExactlyOnceWith(projectId); expect(types).toHaveBeenCalledExactlyOnceWith(projectId);
    expect(bindings).toHaveBeenCalledExactlyOnceWith(projectId, standardId, undefined); expect(form.defaultTypeName()).toBe('Task'); expect(form.defaultPriorityName()).toBe('Medium');
    expect(form.workflowName(workflowId)).toBe('Delivery'); expect(form.workflowName('missing')).toBe('Workflow missing');
    expect(form.form.pristine).toBe(true); expect(form.form.invalid).toBe(true); expect(drafts.modernIssues.size).toBe(0); expect(drafts.dirtyCount()).toBe(0);
  });

  it('retains invalid Unicode title and description drafts without pretending an editor is ready to submit', async () => {
    await loaded(); const title = '😀'.repeat(201); form.form.controls.title.setValue(title); form.form.controls.description.setValue('x'.repeat(10001));
    expect(form.titleCount()).toBe(201); expect(form.form.controls.title.invalid).toBe(true); expect(form.form.controls.description.invalid).toBe(true);
    expect(drafts.modernIssues.get(initialKey)?.fields.title).toBe(title); expect(drafts.dirtyCount()).toBe(1);
    expect(form.descriptionReady()).toBe(false); form.submit(); expect(created).toEqual([]); expect(saved).toEqual([]);
  });

  it('preserves default omission while recording explicit workflow, labels, custom values and HTML draft content', async () => {
    await loaded(); form.form.controls.title.setValue('  Draft title  '); form.descriptionChanged('<p>مرحبا <strong>team</strong></p>');
    form.workflow.setValue(workflowId); const labelId = '60000000-0000-4000-8000-000000000001'; form.form.controls.labelIds.setValue([labelId]);
    const custom: FieldAssignment[] = [{ fieldId: '70000000-0000-4000-8000-000000000001', value: { kind: 'number', number: '9007199254740993.125' } }]; form.customChanged(custom);
    const draft = drafts.modernIssues.get(initialKey)!;
    expect(draft.fields).toEqual({ title: 'Draft title', description: '<p>مرحبا <strong>team</strong></p>', descriptionFormat: 'html', assigneeId: null, dueDate: null, labelIds: [labelId], workflowId, fieldValues: custom });
    expect(draft.fields).not.toHaveProperty('typeId'); expect(draft.fields).not.toHaveProperty('priorityId'); expect(draft.editable).toBeNull(); expect(draft.revision).toBe('1');
  });

  it('records explicit type and priority choices and clears a now-incompatible workflow on type change', async () => {
    await loaded(); form.workflow.setValue(workflowId); const replacementType = '30000000-0000-4000-8000-000000000003';
    form.form.controls.typeId.setValue(replacementType); form.form.controls.priorityId.setValue(priorityId); await flush();
    expect(form.workflow.value).toBe(''); expect(bindings).toHaveBeenLastCalledWith(projectId, replacementType, undefined);
    expect(drafts.modernIssues.get(initialKey)?.fields).toMatchObject({ typeId: replacementType, priorityId }); expect(drafts.modernIssues.get(initialKey)?.fields).not.toHaveProperty('workflowId');
  });

  it('restores an explicit rejected edit with its earlier revision and authorized assignee name', async () => {
    await loaded(); const value = issue(); const editable = { ...modernEditable(value), title: 'Rejected unsent title' };
    currentIssue.set(value); restored.set({ fields: editable, editable, revision: '6', files: [] }); TestBed.tick(); await loaded();
    expect(form.restored()).toBe(true); expect(form.form.controls.title.value).toBe('Rejected unsent title'); expect(form.initialDescription()).toBe(value.description);
    expect(form.initialDescriptionFormat()).toBe('html'); expect(uploadedRevisions).toEqual(['6']); expect(form.selectedAssigneeOptions()).toEqual([{ id: actor.id, label: actor.displayName }]);
    expect(drafts.modernIssues.get('issue:' + value.summary.id)?.revision).toBe('6'); expect(drafts.dirtyCount()).toBe(1);
    form.form.controls.title.setValue('Corrected rejected title'); expect(drafts.modernIssues.get('issue:' + value.summary.id)?.revision).toBe('6');
  });

  it('retains only the saved retired identities while excluding unrelated retired or incompatible types', async () => {
    await loaded(); const value = issue(); value.summary.type.retired = true; value.summary.priority.retired = true; currentIssue.set(value);
    types.mockResolvedValueOnce({ items: [type(subtaskId), type('30000000-0000-4000-8000-000000000009', { retired: true })], nextCursor: null, totalMatching: 2 });
    priorities.mockResolvedValueOnce({ items: [priority('40000000-0000-4000-8000-000000000009', { retired: true })], nextCursor: null, totalMatching: 1 }); TestBed.tick(); await loaded();
    expect(form.typeOptions().map(value => value.id)).toEqual([standardId]); expect(form.priorityOptions().map(value => value.id)).toEqual([priorityId]);
    expect(form.typeOptions()[0]?.retired).toBe(true); expect(form.priorityOptions()[0]?.retired).toBe(true); expect(form.currentLabels()).toEqual(value.summary.labels);
  });

  it('selects subtask-specific defaults and excludes standard types when creating a child', async () => {
    await loaded(); subtask.set(true); TestBed.tick(); await loaded();
    expect(form.defaultTypeName()).toBe('Subtask'); expect(form.typeOptions().map(value => value.id)).toEqual([subtaskId]);
    expect(bindings).toHaveBeenLastCalledWith(projectId, subtaskId, undefined);
  });

  it('never discovers creation bindings while editing retained work', async () => {
    await loaded(); bindings.mockClear(); currentIssue.set(issue()); TestBed.tick(); await loaded(); await form.loadBindings();
    expect(bindings).not.toHaveBeenCalled(); expect(form.form.getRawValue()).toEqual({ ...modernEditable(issue()), assigneeId: actor.id, dueDate: '' });
  });

  it('keeps draft scopes isolated while releasing the previous visible dirty editor', async () => {
    await loaded(); form.form.controls.title.setValue('First scope draft'); scope.set('second'); TestBed.tick(); await loaded();
    expect(form.form.controls.title.value).toBe(''); expect(form.restored()).toBe(false); expect(drafts.modernIssues.get(initialKey)?.fields.title).toBe('First scope draft'); expect(drafts.dirtyCount()).toBe(0);
    form.form.controls.title.setValue('Second scope draft'); scope.set(''); TestBed.tick(); await loaded();
    expect(form.form.controls.title.value).toBe('First scope draft'); expect(form.restored()).toBe(true); expect(drafts.modernIssues.get(initialKey + 'second')?.fields.title).toBe('Second scope draft'); expect(drafts.dirtyCount()).toBe(1);
  });

  it('uses real draft navigation confirmation and emits cancel without deleting the retained draft', async () => {
    await loaded(); form.form.controls.title.setValue('Keep unsent draft'); confirm.mockReturnValue(false);
    expect(form.confirmClose()).toBe(false); expect(confirm).toHaveBeenCalledOnce(); form.requestCancel();
    expect(cancelled).toBe(1); expect(drafts.modernIssues.get(initialKey)?.fields.title).toBe('Keep unsent draft');
    confirm.mockReturnValue(true); expect(form.confirmClose()).toBe(true);
  });

  it('clears only the saved form draft and owned queued files', async () => {
    await loaded(); form.form.controls.title.setValue('Saved draft'); form.queueFiles([new File(['body'], 'evidence.txt')]);
    drafts.comments.set('unrelated', { html: 'Keep discussion draft', revision: null }); form.saved();
    expect(form.files()).toEqual([]); expect(drafts.modernIssues.has(initialKey)).toBe(false); expect(drafts.dirtyCount()).toBe(0); expect(drafts.comments.get('unrelated')?.html).toBe('Keep discussion draft');
  });

  it('retains the already-created issue identity when upload retry is needed after further draft edits', async () => {
    await loaded(); form.form.controls.title.setValue('Create once'); form.markCreated(issue().summary.id); form.form.controls.title.setValue('Edited retry intention');
    expect(form.createdIssueId()).toBe(issue().summary.id); expect(drafts.modernIssues.get(initialKey)?.createdIssueId).toBe(issue().summary.id);
  });

  it('contains configuration failure and allows a fresh explicit current-project retry', async () => {
    await loaded(); const failed = failure(); getConfiguration.mockRejectedValueOnce(failed); await form.loadConfiguration();
    expect(form.configuration()).toBeNull(); expect(form.types()).toEqual([]); expect(form.configurationState.failure()).toBe(failed); expect(form.configurationState.busy()).toBe(false);
    expect(form.defaultTypeName()).toBe('Current project default'); expect(form.defaultPriorityName()).toBe('Current project default');
    await form.loadConfiguration(); expect(form.configuration()).toEqual(configuration()); expect(form.configurationState.message()).toBe(''); expect(form.configurationState.failure()).toBeNull();
  });

  it('does not let an older same-project load overwrite a newer successful configuration', async () => {
    await loaded(); const held = deferred<ConfigurationView>(); getConfiguration.mockReturnValueOnce(held.promise).mockResolvedValueOnce(configuration('3'));
    const older = form.loadConfiguration(); await form.loadConfiguration(); held.resolve(configuration('2')); await older;
    expect(form.configuration()?.revision).toBe('3'); expect(form.configurationState.busy()).toBe(false); expect(form.configurationState.message()).toBe('');
  });

  it.each(['project', 'session', 'destroy'] as const)('suppresses old configuration success after %s ownership changes', async context => {
    await loaded(); const held = deferred<ConfigurationView>(); getConfiguration.mockReturnValueOnce(held.promise);
    const old = form.loadConfiguration();
    if (context === 'project') { getConfiguration.mockResolvedValueOnce(configuration('current', secondProject)); project.set(secondProject); TestBed.tick(); await loaded(); }
    if (context === 'session') { getConfiguration.mockResolvedValueOnce(configuration('current')); epoch.update(value => value + 1); TestBed.tick(); await loaded(); }
    if (context === 'destroy') TestBed.resetTestingModule();
    held.resolve(configuration('private-old')); await old;
    expect(form.configuration()?.revision).not.toBe('private-old'); expect(form.configurationState.message()).toBe('');
    if (context !== 'destroy') expect(form.configuration()?.revision).toBe('current');
  });

  it.each(['types', 'priorities', 'workflows'] as const)('uses an explicit opaque %s cursor and retains earlier choices', async kind => {
    await loaded();
    if (kind === 'types') types.mockResolvedValueOnce({ items: [type()], nextCursor: 'opaque-types', totalMatching: 2 });
    if (kind === 'priorities') priorities.mockResolvedValueOnce({ items: [priority()], nextCursor: 'opaque-priorities', totalMatching: 2 });
    if (kind === 'workflows') workflows.mockResolvedValueOnce({ items: [workflow()], nextCursor: 'opaque-workflows', totalMatching: 2 });
    await form.loadConfiguration();
    if (kind === 'types') types.mockResolvedValueOnce({ items: [type('30000000-0000-4000-8000-000000000003', { name: 'Bug' })], nextCursor: null, totalMatching: 2 });
    if (kind === 'priorities') priorities.mockResolvedValueOnce({ items: [priority('40000000-0000-4000-8000-000000000003', { name: 'High' })], nextCursor: null, totalMatching: 2 });
    if (kind === 'workflows') workflows.mockResolvedValueOnce({ items: [workflow('80000000-0000-4000-8000-000000000003', { name: 'Escalation' })], nextCursor: null, totalMatching: 2 });
    await form.moreChoices(kind);
    const port = kind === 'types' ? types : kind === 'priorities' ? priorities : workflows;
    expect(port).toHaveBeenLastCalledWith(projectId, 'opaque-' + kind);
    const values = kind === 'types' ? form.types() : kind === 'priorities' ? form.priorities() : form.workflows(); expect(values).toHaveLength(2);
    expect(kind === 'types' ? form.typeCursor() : kind === 'priorities' ? form.priorityCursor() : form.workflowCursor()).toBeNull();
    const count = port.mock.calls.length; await form.moreChoices(kind); expect(port).toHaveBeenCalledTimes(count);
  });

  it('retains a failed choice page and retries its original cursor instead of resetting the draft', async () => {
    await loaded(); priorities.mockResolvedValueOnce({ items: [priority()], nextCursor: 'priority-next', totalMatching: 2 }); await form.loadConfiguration();
    form.form.controls.title.setValue('Unsent form draft'); priorities.mockRejectedValueOnce(failure()); await form.moreChoices('priorities');
    expect(form.priorityCursor()).toBe('priority-next'); expect(form.priorities()).toEqual([priority()]); expect(form.form.controls.title.value).toBe('Unsent form draft');
    priorities.mockResolvedValueOnce({ items: [priority('40000000-0000-4000-8000-000000000003')], nextCursor: null, totalMatching: 2 }); await form.moreChoices('priorities');
    expect(priorities.mock.calls.at(-1)).toEqual(priorities.mock.calls.at(-2)); expect(form.configurationState.message()).toBe(''); expect(form.priorities()).toHaveLength(2);
  });

  it('suppresses an old type binding page after the selected type changes', async () => {
    await loaded(); const held = deferred<PageBindingView>(); bindings.mockReturnValueOnce(held.promise);
    const old = form.loadBindings(); const nextType = '30000000-0000-4000-8000-000000000003';
    bindings.mockResolvedValueOnce({ items: [binding(nextType)], nextCursor: null, totalMatching: 1 }); form.form.controls.typeId.setValue(nextType); await flush();
    held.resolve({ items: [binding(standardId, { workflowId: 'private-old-workflow' })], nextCursor: 'private-old-cursor', totalMatching: 1 }); await old;
    expect(form.bindings()).toEqual([binding(nextType)]); expect(form.bindingCursor()).toBeNull(); expect(form.bindingState.busy()).toBe(false);
  });

  it('retains an exact binding continuation cursor and earlier process choices on failure', async () => {
    await loaded(); bindings.mockResolvedValueOnce({ items: [binding()], nextCursor: 'bindings-next', totalMatching: 2 }); await form.loadBindings();
    bindings.mockRejectedValueOnce(failure()); await form.loadBindings(true); expect(form.bindings()).toEqual([binding()]); expect(form.bindingCursor()).toBe('bindings-next');
    bindings.mockResolvedValueOnce({ items: [binding(standardId, { workflowId: '80000000-0000-4000-8000-000000000002' })], nextCursor: null, totalMatching: 2 }); await form.loadBindings(true);
    expect(bindings.mock.calls.at(-1)).toEqual([projectId, standardId, 'bindings-next']); expect(bindings.mock.calls.at(-1)).toEqual(bindings.mock.calls.at(-2)); expect(form.bindings()).toHaveLength(2); expect(form.bindingState.failure()).toBeNull();
  });

  it('deduplicates paged assignees and preserves the authorized chosen display name', async () => {
    await loaded(); const other = { id: '10000000-0000-4000-8000-000000000003', displayName: 'Other member' };
    assignees.mockResolvedValueOnce({ items: [actor], nextCursor: 'assignee-next', totalMatching: 2 }).mockResolvedValueOnce({ items: [actor, other], nextCursor: null, totalMatching: 2 });
    await form.findAssignees(); await form.findAssignees(true); expect(assignees).toHaveBeenLastCalledWith(projectId, '', 'assignee-next');
    expect(form.assignees()).toEqual([actor, other]); form.assign([other.id]); expect(form.selectedAssigneeOptions()).toEqual([{ id: other.id, label: other.displayName }]); expect(cache.users.get(other.id)).toEqual(other);
    form.assign([]); expect(form.selectedAssigneeOptions()).toEqual([]); expect(form.form.controls.assigneeId.value).toBe(''); expect(drafts.modernIssues.get(initialKey)?.fields.assigneeId).toBeNull();
  });

  it('debounces current query text and cancels the prior queued request before dispatch', async () => {
    await loaded(); vi.useFakeTimers(); assignees.mockClear(); form.candidateQuery.setValue('Private old query'); form.candidateQuery.setValue('Current query');
    expect(form.candidatePending()).toBe(true); await vi.advanceTimersByTimeAsync(119); expect(assignees).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(assignees).toHaveBeenCalledExactlyOnceWith(projectId, 'Current query', undefined); expect(form.candidatePending()).toBe(false);
  });

  it.each(['invalid', 'busy', 'empty-project'] as const)('does not schedule an assignee query with %s input context', async context => {
    await loaded(); vi.useFakeTimers(); assignees.mockClear();
    if (context === 'busy') busy.set(true); if (context === 'empty-project') project.set('');
    form.candidateQuery.setValue(context === 'invalid' ? 'x'.repeat(101) : 'Query'); await vi.advanceTimersByTimeAsync(120);
    expect(assignees).not.toHaveBeenCalled(); expect(form.candidatePending()).toBe(false);
  });

  it('does not let an old failed query replace a newer successful assignee page or error state', async () => {
    await loaded(); vi.useFakeTimers(); const held = deferred<PageUserSummary>(); assignees.mockReturnValueOnce(held.promise);
    const older = form.findAssignees(); form.candidateQuery.setValue('Current'); await vi.advanceTimersByTimeAsync(120);
    held.reject(failure()); await older; expect(form.assignees()).toEqual([actor]); expect(form.candidatesState.message()).toBe(''); expect(form.candidatesState.busy()).toBe(false);
  });

  it.each(['project', 'session', 'destroy'] as const)('does not repopulate private assignees after %s ownership changes', async context => {
    await loaded(); const held = deferred<PageUserSummary>(); assignees.mockReturnValueOnce(held.promise); const older = form.findAssignees();
    if (context === 'project') { project.set(secondProject); TestBed.tick(); await loaded(); }
    if (context === 'session') { epoch.update(value => value + 1); TestBed.tick(); await loaded(); }
    if (context === 'destroy') TestBed.resetTestingModule();
    held.resolve({ items: [{ id: '10000000-0000-4000-8000-000000000009', displayName: 'Private old person' }], nextCursor: 'private-old-cursor', totalMatching: 1 }); await older;
    expect(form.assignees().some(value => value.displayName === 'Private old person')).toBe(false); expect(form.candidateCursor()).not.toBe('private-old-cursor'); expect(form.candidatesState.message()).toBe('');
  });

  it('clears unsent form text, custom values and files after a real session epoch reset', async () => {
    await loaded(); form.form.controls.title.setValue('Previous account private draft'); form.customChanged([{ fieldId: '70000000-0000-4000-8000-000000000001', value: { kind: 'text', text: 'Private custom draft' } }]); form.queueFiles([new File(['private'], 'private.txt')]);
    epoch.update(value => value + 1); TestBed.tick(); await loaded();
    expect(form.form.controls.title.value).toBe(''); expect(form.customFields()).toEqual([]); expect(form.files()).toEqual([]); expect(form.restored()).toBe(false); expect(drafts.modernIssues.size).toBe(0); expect(drafts.dirtyCount()).toBe(0);
  });

  it('rejects empty and unsafe files while retaining accepted arbitrary file types and their retry identity', async () => {
    await loaded(); form.queueFiles([new File([], 'empty.txt'), new File(['a'], '../unsafe.txt'), new File(['body'], 'archive.custom', { type: 'application/x-custom' })]);
    expect(form.files()).toHaveLength(1); const queued = form.files()[0]!; expect(queued.file.name).toBe('archive.custom'); expect(queued.state).toBe('queued'); expect(queued.reference).toMatch(/^[0-9a-f-]{36}$/);
    expect(form.validationMessage()).toContain('Choose nonempty files'); expect(drafts.modernIssues.get(initialKey)?.files[0]).toBe(queued);
    form.removeFile(queued.id); expect(form.files()).toEqual([]); expect(drafts.modernIssues.get(initialKey)?.files).toEqual([]);
  });

  it('keeps the first twenty selected files and rejects the twenty-first without replacing earlier references', async () => {
    await loaded(); const files = Array.from({ length: 21 }, (_, index) => new File(['body'], 'evidence-' + index + '.txt')); form.queueFiles(files);
    expect(form.files()).toHaveLength(20); expect(form.files().map(value => value.file)).toEqual(files.slice(0, 20)); expect(new Set(form.files().map(value => value.reference)).size).toBe(20);
    expect(form.validationMessage()).toBe('Upload at most 20 files at a time.'); expect(drafts.modernIssues.get(initialKey)?.files).toHaveLength(20);
  });

  it('retries only a failed upload with the exact same resume item, without re-creating the issue or re-uploading accepted files', async () => {
    await loaded(); form.queueFiles([new File(['one'], 'one.txt'), new File(['two'], 'two.txt')]); const [first, second] = form.files();
    upload.mockImplementationOnce(async (_id, _metadata, _item, progress) => { progress(3); return asset('a1'); }).mockRejectedValueOnce(failure()).mockResolvedValueOnce(asset('a2'));
    await expect(form.finishUploads(issue())).rejects.toBeInstanceOf(ApiError);
    expect(first?.state).toBe('uploaded'); expect(first?.receivedBytes).toBe(3); expect(second?.state).toBe('failed'); expect(second?.error).toContain('without creating another issue'); expect(form.createdIssueId()).toBe(issue().summary.id); expect(getIssue).not.toHaveBeenCalled();
    const result = await form.finishUploads(issue()); expect(result).toEqual(issue()); expect(upload).toHaveBeenCalledTimes(3);
    expect(upload.mock.calls[1]?.slice(0, 3)).toEqual(upload.mock.calls[2]?.slice(0, 3)); expect(upload.mock.calls[2]?.[2]).toBe(second); expect(first?.state).toBe('uploaded'); expect(second?.state).toBe('uploaded'); expect(second?.error).toBeUndefined(); expect(getIssue).toHaveBeenCalledExactlyOnceWith(issue().summary.id); expect(updateIssue).not.toHaveBeenCalled();
  });

  it('does not recreate a cleared draft when a previous-session upload finishes late', async () => {
    await loaded(); form.form.controls.title.setValue('Previous account private creation'); form.queueFiles([new File(['private'], 'private.txt')]);
    const held = deferred<AssetView>(); upload.mockReturnValueOnce(held.promise); const completion = form.finishUploads(issue());
    epoch.update(value => value + 1); TestBed.tick(); await loaded();
    expect(drafts.modernIssues.get(initialKey)).toBeUndefined(); expect(drafts.dirtyCount()).toBe(0);
    held.resolve(asset('a0000000-0000-4000-8000-000000000001'));
    await expect(completion).rejects.toThrow('Your session changed.');
    expect(drafts.modernIssues.get(initialKey)).toBeUndefined(); expect(drafts.dirtyCount()).toBe(0);
    expect(getIssue).not.toHaveBeenCalled(); expect(updateIssue).not.toHaveBeenCalled();
  });

  it('retains the rightful retry reference but never resumes a destroyed editor after its upload completes', async () => {
    await loaded(); form.form.controls.title.setValue('Rightful session retry draft'); form.queueFiles([new File(['body'], 'resume.txt')]);
    const held = deferred<AssetView>(); upload.mockReturnValueOnce(held.promise); const item = form.files()[0]!, reference = item.reference;
    const completion = form.finishUploads(issue()); TestBed.resetTestingModule();
    expect(drafts.dirtyCount()).toBe(0); expect(drafts.modernIssues.get(initialKey)?.files[0]?.reference).toBe(reference);
    held.resolve(asset('a0000000-0000-4000-8000-000000000001'));
    await expect(completion).rejects.toThrow('This editor is no longer current.');
    expect(drafts.dirtyCount()).toBe(0); expect(drafts.modernIssues.get(initialKey)?.fields.title).toBe('Rightful session retry draft');
    expect(drafts.modernIssues.get(initialKey)?.files[0]).toMatchObject({ reference, state: 'queued' });
    expect(getIssue).not.toHaveBeenCalled(); expect(updateIssue).not.toHaveBeenCalled();
  });

  it('keeps late upload progress and completion out of a different draft scope in the same session', async () => {
    await loaded(); form.form.controls.title.setValue('Old scope draft'); form.queueFiles([new File(['body'], 'old-scope.txt')]); const original = form.files()[0]!;
    const held = deferred<AssetView>(); let progress!: (received: number) => void;
    upload.mockImplementationOnce((_id, _metadata, _item, changed) => { progress = changed; return held.promise; });
    const completion = form.finishUploads(issue()); scope.set('current'); TestBed.tick(); await loaded(); form.form.controls.title.setValue('Current scope intention');
    progress(4); held.resolve(asset('a0000000-0000-4000-8000-000000000001'));
    await expect(completion).rejects.toThrow('This editor is no longer current.');
    expect(original.receivedBytes).toBeUndefined(); expect(original.state).toBe('queued');
    expect(drafts.modernIssues.get(initialKey)?.files[0]?.reference).toBe(original.reference);
    expect(drafts.modernIssues.get(initialKey + 'current')?.fields.title).toBe('Current scope intention');
    expect(drafts.modernIssues.get(initialKey + 'current')?.files).toEqual([]); expect(drafts.modernIssues.get(initialKey + 'current')?.createdIssueId).toBeUndefined();
    expect(drafts.dirtyCount()).toBe(1); expect(getIssue).not.toHaveBeenCalled();
  });

  it('does not complete old uploads into a newly restored intention with the same draft key', async () => {
    await loaded(); form.queueFiles([new File(['body'], 'old-intention.txt')]); const held = deferred<AssetView>(); upload.mockReturnValueOnce(held.promise);
    const completion = form.finishUploads(issue());
    restored.set({ fields: { title: 'Restored current intention' }, editable: null, revision: '1', files: [] }); TestBed.tick(); await loaded();
    held.resolve(asset('a0000000-0000-4000-8000-000000000001')); await expect(completion).rejects.toThrow('This editor is no longer current.');
    expect(drafts.modernIssues.get(initialKey)?.fields.title).toBe('Restored current intention'); expect(drafts.modernIssues.get(initialKey)?.files).toEqual([]); expect(drafts.modernIssues.get(initialKey)?.createdIssueId).toBeUndefined();
    expect(getIssue).not.toHaveBeenCalled(); expect(drafts.dirtyCount()).toBe(1);
  });

  it('never submits picture-description changes using a refreshed account after a delayed latest-issue read', async () => {
    await loaded(); const pictureId = 'a0000000-0000-4000-8000-000000000001'; form.queueFiles([new File(['png'], 'diagram.png', { type: 'image/png' })]); upload.mockResolvedValueOnce(asset(pictureId, 'image'));
    const held = deferred<ModernIssueView>(); getIssue.mockReturnValueOnce(held.promise); const completion = form.finishUploads(issue()); await flush(); expect(getIssue).toHaveBeenCalledOnce();
    epoch.update(value => value + 1); TestBed.tick(); await loaded(); held.resolve(issue());
    await expect(completion).rejects.toThrow('Your session changed.'); expect(updateIssue).not.toHaveBeenCalled(); expect(drafts.modernIssues.get(initialKey)).toBeUndefined(); expect(drafts.dirtyCount()).toBe(0);
  });

  it('does not publish a late description-save result after the session has changed', async () => {
    await loaded(); const pictureId = 'a0000000-0000-4000-8000-000000000001'; form.queueFiles([new File(['png'], 'diagram.png', { type: 'image/png' })]); upload.mockResolvedValueOnce(asset(pictureId, 'image'));
    const held = deferred<SavedModernIssueView>(); updateIssue.mockReturnValueOnce(held.promise); const completion = form.finishUploads(issue()); await flush(); expect(updateIssue).toHaveBeenCalledOnce();
    epoch.update(value => value + 1); TestBed.tick(); await loaded(); held.resolve({ result: issue(), receipt: { eventId: null, replayed: false } });
    await expect(completion).rejects.toThrow('Your session changed.'); expect(drafts.modernIssues.get(initialKey)).toBeUndefined(); expect(drafts.dirtyCount()).toBe(0);
  });

  it('rebases accepted picture markup onto the latest issue revision while escaping its plain description', async () => {
    await loaded(); const pictureId = 'a0000000-0000-4000-8000-000000000001'; form.queueFiles([new File(['png'], 'diagram.png', { type: 'image/png' })]); upload.mockResolvedValueOnce(asset(pictureId, 'image'));
    const latest = issue(); latest.summary.title = 'Another writer title'; latest.summary.revision = '9'; latest.descriptionFormat = 'plain'; latest.description = '<script>unsafe</script>\nSecond line'; getIssue.mockResolvedValueOnce(latest);
    const final = issue(); final.summary.revision = '10'; updateIssue.mockResolvedValueOnce({ result: final, receipt: { eventId: null, replayed: false } });
    expect(await form.finishUploads(issue())).toEqual(final);
    const [id, revision, editable, reference] = updateIssue.mock.calls[0]!; expect(id).toBe(latest.summary.id); expect(revision).toBe('9'); expect(editable.title).toBe('Another writer title'); expect(editable.descriptionFormat).toBe('html');
    expect(editable.description).toContain('&lt;script&gt;unsafe&lt;/script&gt;'); expect(editable.description).not.toContain('<script>'); expect(editable.description).toContain(`<img data-picture-id="${pictureId}" alt="Attached picture">`); expect(reference).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('does not upload accepted files again or duplicate already-persisted picture references', async () => {
    await loaded(); const pictureId = 'a0000000-0000-4000-8000-000000000001'; form.queueFiles([new File(['png'], 'diagram.png', { type: 'image/png' })]); upload.mockResolvedValueOnce(asset(pictureId, 'image'));
    const latest = issue(); latest.description = `<p><img data-picture-id="${pictureId}" alt="Existing"></p>`; getIssue.mockResolvedValue(latest);
    expect(await form.finishUploads(issue())).toEqual(latest); expect(await form.finishUploads(issue())).toEqual(latest);
    expect(upload).toHaveBeenCalledOnce(); expect(updateIssue).not.toHaveBeenCalled(); expect(form.files()[0]?.state).toBe('uploaded');
  });
});
