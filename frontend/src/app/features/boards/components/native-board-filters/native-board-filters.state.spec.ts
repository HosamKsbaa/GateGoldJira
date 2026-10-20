// Public state units: actual Angular forms/effects and typed configuration ports.
// No template is mounted; these do not claim browser, REST, or MCP coverage.
import '@angular/compiler';
import { provideZonelessChangeDetection, RendererFactory2, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { IssueFilter, Me, PagePriorityView, PageTypeView, PriorityView, TypeView } from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { ProjectConfigurationApi } from '../../../projects/project-configuration.api';
import { NativeBoardFiltersComponent } from './native-board-filters.component';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const projectA = '20000000-0000-4000-8000-000000000001', projectB = '20000000-0000-4000-8000-000000000002';
const typeA = '30000000-0000-4000-8000-000000000001', typeB = '30000000-0000-4000-8000-000000000002';
const priorityA = '40000000-0000-4000-8000-000000000001', priorityB = '40000000-0000-4000-8000-000000000002';
const person = '10000000-0000-4000-8000-000000000002', parent = '50000000-0000-4000-8000-000000000001', label = '60000000-0000-4000-8000-000000000001';
const workflow = '70000000-0000-4000-8000-000000000001', stage = '80000000-0000-4000-8000-000000000001';
const currentUser: Me = { userId: person, displayName: 'Current member', email: 'member@example.test', administrator: false, companyTimeZone: 'Africa/Cairo' };
function type(id = typeA, override: Partial<TypeView> = {}): TypeView { return { id, projectId: projectA, key: 't_' + id.slice(-4), name: 'Task', behavior: 'standard', default: false, retired: false, ...override }; }
function priority(id = priorityA, override: Partial<PriorityView> = {}): PriorityView { return { id, projectId: projectA, key: 'p_' + id.slice(-4), name: 'Urgent', sortOrder: '9007199254740993', default: false, retired: false, ...override }; }
const typePage = (items: TypeView[], nextCursor: string | null = null): PageTypeView => ({ items, nextCursor, totalMatching: items.length });
const priorityPage = (items: PriorityView[], nextCursor: string | null = null): PagePriorityView => ({ items, nextCursor, totalMatching: items.length });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: Error) => void; return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve: (value: T) => resolve(value), reject: (reason: Error) => reject(reason) }; }
function forbidden() { return new ApiError({ error: { code: 'forbidden', message: 'Current project access is unavailable.', fieldErrors: [], retryable: false, nextAction: 'none' }, current: null, unfinished: null }, 403); }
function setup(initialValue: IssueFilter = {}, options: { project?: string; authenticated?: boolean } = {}) {
  const project = signal(options.project ?? projectA), initial = signal(initialValue), disabled = signal(false), epoch = signal(1), me = signal<Me | null>(options.authenticated === false ? null : currentUser);
  const types = vi.fn<ProjectConfigurationApi['types']>().mockResolvedValue(typePage([type()]));
  const priorities = vi.fn<ProjectConfigurationApi['priorities']>().mockResolvedValue(priorityPage([priority()]));
  vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'hidden' }));
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
    { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('State units must not render a template.'); } } },
    { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
    { provide: AuthService, useValue: { sessionEpoch: epoch, me } satisfies Pick<AuthService, 'sessionEpoch' | 'me'> },
    { provide: ProjectConfigurationApi, useValue: { types, priorities } satisfies Pick<ProjectConfigurationApi, 'types' | 'priorities'> },
  ] });
  const component = TestBed.runInInjectionContext(() => new NativeBoardFiltersComponent());
  // Supply public input ports before the real effects run; no private nodes/state.
  Object.assign(component, { projectId: project, initial, disabled });
  const changes: IssueFilter[] = []; component.changed.subscribe(value => changes.push(value)); TestBed.tick();
  return { component, project, initial, disabled, epoch, me, types, priorities, changes };
}
async function settled() { for (let turn = 0; turn < 8; turn++) await Promise.resolve(); TestBed.tick(); }

describe('native board filter public forms and asynchronous ownership', () => {
  it('applies parent criteria silently and retains canonical scope when one field changes', async () => {
    const original: IssueFilter = { projectIds: [projectA], workflowIds: [workflow], stageIds: [stage], prerequisiteFor: parent, archived: true, backlog: false, sort: 'priority', query: 'Existing', statuses: ['review'], typeIds: [typeA], priorityIds: [priorityA], assignee: { kind: 'user', userId: person }, parentId: parent, labelIds: [label], dueFrom: '2030-01-01', dueTo: '2030-01-31', blocked: false, overdue: true };
    const f = setup(original); await settled();
    expect(f.component.form.getRawValue()).toEqual({ query: 'Existing', category: 'review', typeIds: [typeA], priorityIds: [priorityA], assignee: 'user', userId: person, parentId: parent, labelIds: [label], dueFrom: '2030-01-01', dueTo: '2030-01-31', blocked: 'false', overdue: 'true' });
    expect(f.changes).toEqual([]); expect(f.component.form.pristine).toBe(true);
    f.component.form.controls.blocked.setValue('true'); expect(f.changes).toEqual([{ ...original, blocked: true }]); expect(f.initial()).toEqual(original);
  });
  it('preserves legacy multi-category/taxonomy criteria until the corresponding controls deliberately change', async () => {
    const f = setup({ statuses: ['todo', 'review'], types: ['task', 'bug'], priorities: ['low', 'high'] }); await settled();
    expect(f.component.form.controls.category.value).toBe(''); f.component.form.controls.blocked.setValue('false');
    expect(f.changes.at(-1)).toEqual({ statuses: ['todo', 'review'], types: ['task', 'bug'], priorities: ['low', 'high'], blocked: false });
    f.component.form.controls.category.markAsDirty(); f.component.form.controls.category.setValue(''); f.component.chooseIds('types', []); f.component.chooseIds('priorities', []);
    expect(f.changes.at(-1)).toEqual({ blocked: false }); expect(f.component.form.controls.typeIds.dirty).toBe(true); expect(f.component.form.controls.priorityIds.dirty).toBe(true);
  });
  it('keeps a retained custom-stage identity until the category control explicitly replaces it', async () => {
    const status = 'review:' + stage, f = setup({ statuses: [status] }); await settled();
    f.component.form.controls.overdue.setValue('false'); expect(f.changes.at(-1)).toEqual({ statuses: [status], overdue: false });
    f.component.form.controls.category.markAsDirty(); f.component.form.controls.category.setValue('done'); expect(f.changes.at(-1)).toEqual({ statuses: ['done'], overdue: false });
  });
  it('debounces actual Arabic typing and emits only the complete trimmed query after120ms', async () => {
    const f = setup(); await settled(); vi.useFakeTimers(); f.component.form.controls.query.setValue('م'); await vi.advanceTimersByTimeAsync(90);
    f.component.form.controls.query.setValue('  مراجعة المهمة  '); await vi.advanceTimersByTimeAsync(119); expect(f.changes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1); expect(f.changes).toEqual([{ query: 'مراجعة المهمة' }]); expect(f.component.form.controls.query.value).toBe('  مراجعة المهمة  ');
  });
  it('emits non-query changes immediately and cancels duplicate queued query notifications', async () => {
    const f = setup(); await settled(); vi.useFakeTimers(); f.component.form.controls.query.setValue(' pending '); f.component.form.controls.category.setValue('in_progress');
    expect(f.changes).toEqual([{ query: 'pending', statuses: ['in_progress'] }]); await vi.advanceTimersByTimeAsync(120); expect(f.changes).toHaveLength(1);
    f.component.form.controls.blocked.setValue('false'); f.component.form.controls.overdue.setValue('false'); expect(f.changes.at(-1)).toEqual({ query: 'pending', statuses: ['in_progress'], blocked: false, overdue: false });
  });
  it('suppresses disabled form events and a query disabled while its notification is queued', async () => {
    const f = setup(); await settled(); vi.useFakeTimers(); f.component.form.controls.query.setValue('queued'); f.disabled.set(true); TestBed.tick(); await vi.advanceTimersByTimeAsync(120); expect(f.changes).toEqual([]);
    f.component.chooseIds('types', [typeA]); f.component.chooseAssignee({ kind: 'self' }); expect(f.changes).toEqual([]);
    f.disabled.set(false); TestBed.tick(); f.component.form.controls.blocked.setValue('true'); await vi.advanceTimersByTimeAsync(120);
    expect(f.changes.at(-1)).toEqual({ query: 'queued', typeIds: [typeA], assignee: { kind: 'self' }, blocked: true });
  });
  it('a parent criteria replacement cancels pending text and resets previous dirty selections silently', async () => {
    const f = setup(); await settled(); vi.useFakeTimers(); f.component.chooseIds('types', [typeA]); f.changes.length = 0; f.component.form.controls.query.setValue('Old pending text');
    f.initial.set({ query: 'Fresh parent criteria', priorities: ['high'], assignee: { kind: 'unassigned' } }); TestBed.tick(); await vi.advanceTimersByTimeAsync(120);
    expect(f.changes).toEqual([]); expect(f.component.form.pristine).toBe(true); expect(f.component.form.controls.query.value).toBe('Fresh parent criteria');
    f.component.form.controls.blocked.setValue('true'); expect(f.changes).toEqual([{ query: 'Fresh parent criteria', priorities: ['high'], assignee: { kind: 'unassigned' }, blocked: true }]);
  });
  it('enforces the published200-unit query bound and recovers from overlong Arabic input', async () => {
    const f = setup(); await settled(); vi.useFakeTimers(); f.component.form.controls.query.setValue('ع'.repeat(200)); await vi.advanceTimersByTimeAsync(120); expect(f.changes).toEqual([{ query: 'ع'.repeat(200) }]);
    f.component.form.controls.query.setValue('ع'.repeat(201)); await vi.advanceTimersByTimeAsync(120); expect(f.changes).toHaveLength(1); expect(f.component.error()).toContain('Check the filters');
    f.component.form.controls.query.setValue('   '); await vi.advanceTimersByTimeAsync(120); expect(f.changes.at(-1)).toEqual({}); expect(f.component.error()).toBe('');
  });
  it('rejects impossible dates and reversed ranges while retaining the actual form draft', async () => {
    const f = setup(); await settled(); f.component.form.controls.dueFrom.setValue('2031-02-30'); expect(f.changes).toEqual([]); expect(f.component.error()).toContain('valid due range');
    f.component.form.controls.dueFrom.setValue('2031-03-10'); f.changes.length = 0; f.component.form.controls.dueTo.setValue('2031-03-09'); expect(f.changes).toEqual([]); expect(f.component.form.controls.dueTo.value).toBe('2031-03-09');
    f.component.form.controls.dueTo.setValue('2031-03-10'); expect(f.changes).toEqual([{ dueFrom: '2031-03-10', dueTo: '2031-03-10' }]); expect(f.component.error()).toBe('');
  });
  it('refuses malformed identities without dropping other criteria or silently clearing the draft', async () => {
    const f = setup({ query: 'Keep this query', labelIds: [label] }); await settled(); f.component.chooseIds('types', ['invalid-id']);
    expect(f.changes).toEqual([]); expect(f.component.form.controls.typeIds.value).toEqual(['invalid-id']); expect(f.component.error()).toContain('Check the filters');
    f.component.chooseIds('types', [typeA]); expect(f.changes).toEqual([{ query: 'Keep this query', labelIds: [label], typeIds: [typeA] }]); f.component.form.controls.parentId.setValue('invalid-parent'); expect(f.changes).toHaveLength(1); expect(f.component.form.controls.parentId.value).toBe('invalid-parent');
  });
  it('preserves assignment modes, validates a specific teammate and clears that choice deliberately', async () => {
    const f = setup(); await settled(); expect(f.component.selectedAssignee()).toBeUndefined(); f.component.chooseAssignee({ kind: 'user', userId: person });
    expect(f.component.selectedAssignee()).toEqual({ kind: 'user', userId: person }); expect(f.changes.at(-1)).toEqual({ assignee: { kind: 'user', userId: person } });
    f.component.form.controls.userId.setValue(''); expect(f.changes).toHaveLength(1); expect(f.component.error()).not.toBe('');
    f.component.chooseAssignee({ kind: 'self' }); expect(f.changes.at(-1)).toEqual({ assignee: { kind: 'self' } }); f.component.chooseAssignee({ kind: 'unassigned' }); expect(f.changes.at(-1)).toEqual({ assignee: { kind: 'unassigned' } }); f.component.chooseAssignee(null); expect(f.changes.at(-1)).toEqual({}); expect(f.component.selectedAssignee()).toBeUndefined();
  });
  it('offers retained retired choices and preserves selected IDs when a search hides their friendly names', async () => {
    const f = setup({ typeIds: [typeB], priorityIds: [priorityB] }); await settled(); const retiredType = type(typeB, { name: 'مهمة قديمة', retired: true, behavior: 'subtask' }), retiredPriority = priority(priorityB, { name: 'أولوية قديمة', retired: true });
    f.types.mockResolvedValueOnce(typePage([type(), retiredType])); f.priorities.mockResolvedValueOnce(priorityPage([priority(), retiredPriority])); await f.component.load();
    expect(f.component.typeOptions()).toEqual([{ id: typeA, label: 'Task', detail: 'standard' }, { id: typeB, label: 'مهمة قديمة', detail: 'Retired' }]); expect(f.component.priorityOptions()).toEqual([{ id: priorityA, label: 'Urgent', detail: undefined }, { id: priorityB, label: 'أولوية قديمة', detail: 'Retired' }]);
    f.component.typeQuery.set('  قديمة '); f.component.priorityQuery.set(' URGENT '); expect(f.component.typeOptions()).toEqual([{ id: typeB, label: 'مهمة قديمة', detail: 'Retired' }]); expect(f.component.priorityOptions()).toEqual([{ id: priorityA, label: 'Urgent', detail: undefined }]);
    expect(f.component.retained(f.component.priorityOptions(), [priorityB])).toEqual([{ id: priorityB, label: priorityB, detail: 'Retained saved choice' }]); f.component.chooseIds('types', [typeB]); expect(f.changes.at(-1)).toEqual({ typeIds: [typeB], priorityIds: [priorityB] }); expect(f.component.retained(f.component.typeOptions(), [typeB])).toEqual([{ id: typeB, label: 'مهمة قديمة', detail: 'Retired' }]);
  });
  it('requests independent cursors and resolves friendly names without replacing selected identities', async () => {
    const f = setup({ typeIds: [typeB], priorityIds: [priorityB] }); await settled(); f.types.mockResolvedValueOnce(typePage([type()], 'types-next')); f.priorities.mockResolvedValueOnce(priorityPage([priority()], 'priorities-next')); await f.component.load();
    f.types.mockResolvedValueOnce(typePage([type(typeB, { name: 'Later type', behavior: 'subtask' })])); f.priorities.mockResolvedValueOnce(priorityPage([priority(priorityB, { name: 'Later priority' })])); await f.component.more('types');
    expect(f.types).toHaveBeenLastCalledWith(projectA, 'types-next'); expect(f.component.priorityCursor()).toBe('priorities-next'); expect(f.component.retained(f.component.typeOptions(), [typeB])).toEqual([{ id: typeB, label: 'Later type', detail: 'subtask' }]); await f.component.more('priorities'); expect(f.priorities).toHaveBeenLastCalledWith(projectA, 'priorities-next');
    expect(f.component.typeCursor()).toBeNull(); expect(f.component.priorityCursor()).toBeNull(); expect(f.component.form.controls.typeIds.value).toEqual([typeB]); expect(f.component.form.controls.priorityIds.value).toEqual([priorityB]); expect(f.changes).toEqual([]);
    const calls = [f.types.mock.calls.length, f.priorities.mock.calls.length]; await f.component.more('types'); await f.component.more('priorities'); expect([f.types.mock.calls.length, f.priorities.mock.calls.length]).toEqual(calls);
  });
  it('retains visible choices and cursor on forbidden paging and retries the exact cursor explicitly', async () => {
    const f = setup(); await settled(); f.types.mockResolvedValueOnce(typePage([type()], 'retained-cursor')); await f.component.load(); const denied = forbidden(); f.types.mockRejectedValueOnce(denied); await f.component.more('types');
    expect(f.component.state.failure()).toBe(denied); expect(f.component.state.busy()).toBe(false); expect(f.component.types()).toEqual([type()]); expect(f.component.typeCursor()).toBe('retained-cursor');
    f.types.mockResolvedValueOnce(typePage([type(typeB)])); await f.component.more('types'); expect(f.types).toHaveBeenLastCalledWith(projectA, 'retained-cursor'); expect(f.component.types().map(value => value.id)).toEqual([typeA, typeB]); expect(f.component.typeCursor()).toBeNull(); expect(f.component.state.failure()).toBeNull();
  });
  it('keeps each accepted configuration snapshot atomic when one parallel read fails and hides private errors', async () => {
    const f = setup(); await settled(); f.types.mockResolvedValueOnce(typePage([type(typeB)])); f.priorities.mockRejectedValueOnce(new Error('Private upstream details')); await f.component.load();
    expect(f.component.types()).toEqual([type()]); expect(f.component.priorities()).toEqual([priority()]); expect(f.component.state.message()).toContain('Check your connection'); expect(f.component.state.message()).not.toContain('Private'); await f.component.load(); expect(f.component.state.message()).toBe(''); expect(f.component.state.busy()).toBe(false);
  });
  it('does not fetch without both an authenticated account and a project context', async () => {
    const f = setup({}, { project: '', authenticated: false }); await settled(); expect(f.types).not.toHaveBeenCalled(); expect(f.priorities).not.toHaveBeenCalled(); f.project.set(projectB); TestBed.tick(); await settled(); expect(f.types).not.toHaveBeenCalled(); f.me.set(currentUser); f.epoch.set(2); TestBed.tick(); await settled(); expect(f.types).toHaveBeenCalledExactlyOnceWith(projectB); expect(f.priorities).toHaveBeenCalledExactlyOnceWith(projectB);
  });
  it('suppresses private late read failures immediately after an account change', async () => {
    const f = setup(); await settled(); const held = deferred<PageTypeView>(); f.types.mockReturnValueOnce(held.promise); const loading = f.component.load(); f.epoch.set(2); held.reject(new Error('Old account private detail')); await loading; expect(f.component.state.message()).toBe(''); expect(f.component.state.failure()).toBeNull(); expect(f.component.types()).toEqual([type()]);
  });
  it('a new project starts its own read while an older pending load cannot retain the busy lock', async () => {
    const f = setup(); await settled(); const old = deferred<PageTypeView>(), current = deferred<PageTypeView>();
    f.types.mockReturnValueOnce(old.promise); const loading = f.component.load();
    f.types.mockReturnValueOnce(current.promise); f.priorities.mockResolvedValueOnce(priorityPage([priority(priorityB, { projectId: projectB, name: 'Project B current priority' })]));
    f.project.set(projectB); TestBed.tick();
    expect(f.types).toHaveBeenLastCalledWith(projectB); expect(f.priorities).toHaveBeenLastCalledWith(projectB);
    old.resolve(typePage([type(typeA, { name: 'Obsolete project A choice' })], 'private-old-cursor')); await loading; await settled();
    expect(f.component.types()).toEqual([]); expect(f.component.priorities()).toEqual([]); expect(f.component.typeCursor()).toBeNull(); expect(f.component.state.busy()).toBe(true);
    current.resolve(typePage([type(typeB, { projectId: projectB, name: 'Project B current type' })], 'current-project-cursor')); await settled();
    expect(f.component.types().map(value => value.name)).toEqual(['Project B current type']); expect(f.component.priorities().map(value => value.name)).toEqual(['Project B current priority']); expect(f.component.typeCursor()).toBe('current-project-cursor'); expect(f.component.state.busy()).toBe(false);
  });
  it('coalesces duplicate reads and destruction cancels pending query events and form subscriptions', async () => {
    const f = setup(); await settled(); const held = deferred<PageTypeView>(); f.types.mockReturnValueOnce(held.promise); const loading = f.component.load(); await f.component.load(); await f.component.more('types'); expect(f.types).toHaveBeenCalledTimes(2); held.resolve(typePage([type()])); await loading;
    vi.useFakeTimers(); f.component.form.controls.query.setValue('Destroyed pending query'); TestBed.resetTestingModule(); await vi.advanceTimersByTimeAsync(120); expect(f.changes).toEqual([]); f.component.form.controls.blocked.setValue('true'); expect(f.changes).toEqual([]);
  });
});
