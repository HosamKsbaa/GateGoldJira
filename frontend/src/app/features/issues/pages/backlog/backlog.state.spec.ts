// Public Angular route/effect/selection units with typed service ports. No
// rendering, pointer drag, modal focus, upload or live-service proof is claimed.
import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, provideZonelessChangeDetection, RendererFactory2, runInInjectionContext, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, ActivatedRouteSnapshot, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BacklogPage as BacklogData, IssueSummary, IssueView, Me, ModernIssueSummary, ModernIssueView, ProjectView } from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { ProjectsApi } from '../../../projects/projects.api';
import { BacklogApi } from '../../backlog.api';
import { IssuesApi } from '../../issues.api';
import { ModernIssuesApi } from '../../modern-issues.api';
import { BacklogPage } from './backlog.page';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
const person: Me = { userId: 'member', displayName: 'Member', email: 'member@example.test', administrator: false, companyTimeZone: 'UTC' }, receipt = { eventId: null, replayed: false };
function project(id = 'project', changes: Partial<ProjectView> = {}): ProjectView { return { id, key: 'GG', name: 'Delivery', archived: false, effectiveRole: 'member', description: '', revision: '1', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...changes }; }
function issue(id = 'first'): IssueSummary { return { id, projectId: 'project', key: 'GG-' + id, number: '1', title: 'عمل ' + id, revision: '4', backlog: true, status: 'todo', priority: 'medium', type: 'task', assignee: null, blocked: false, dueDate: null, overdue: false, parent: null, labels: [], subtaskProgress: { done: 0, total: 0 }, unfinishedBlockerCount: 0, createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z' }; }
function modern(id = 'first'): ModernIssueSummary { const { status: _status, priority: _priority, type: _type, ...rest } = issue(id); return { ...rest, archived: false, backlog: true, type: { id: 'task', key: 'task', name: 'Task', behavior: 'standard', retired: false }, priority: { id: 'medium', key: 'medium', name: 'Medium', retired: false, sortOrder: '2' }, workflow: { id: 'flow', name: 'Delivery', revision: '1', retired: false }, stage: { id: 'qa', name: 'قبول الفريق', category: 'todo', position: '1', initial: true, acceptsEntries: true, retired: false } }; }
function record(id = 'first'): IssueView { return { summary: issue(id), capabilities: ['read', 'edit'], description: '', graphRevision: '1', orderRevisions: [], sourceOrderRevision: '1', reporter: { id: person.userId, displayName: person.displayName } }; }
function nativeRecord(id = 'created'): ModernIssueView { return { summary: modern(id), capabilities: ['read', 'edit'], description: '', descriptionFormat: 'plain', graphRevision: '1', links: [], watching: false, reporter: { id: person.userId, displayName: person.displayName } }; }
function data(ids = ['first', 'second'], cursor: string | null = null, orderRevision = '5'): BacklogData { return { items: ids.map(issue), nextCursor: cursor, totalMatching: ids.length, orderRevision }; }
function failure() { return new ApiError({ error: { code: 'conflict', message: 'Backlog changed. Reload current work.', retryable: false, nextAction: 'reload_current_state', fieldErrors: [] }, current: null, unfinished: null }, 409); }
function uncertain() { return new ApiError({ error: { code: 'temporarily_unavailable', message: 'The original change could not be confirmed.', retryable: true, nextAction: 'none', fieldErrors: [] }, current: null, unfinished: null }, 503); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve: (value: T) => resolve(value), reject: (error: unknown) => reject(error) }; }
class ModelInput extends EventTarget { checked = false; }

describe('Backlog public bounded selection, rank and partial activation ownership', () => {
  const me = signal<Me | null>(person), epoch = signal(1), scopes: EnvironmentInjector[] = [];
  const readProject = vi.fn<ProjectsApi['get']>(), list = vi.fn<BacklogApi['list']>(), reorder = vi.fn<BacklogApi['reorder']>(), organize = vi.fn<IssuesApi['organize']>();
  const createIssue = vi.fn<ModernIssuesApi['create']>(), getIssue = vi.fn<ModernIssuesApi['get']>();
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(() => {
    me.set(person); epoch.set(1); params = new BehaviorSubject(convertToParamMap({ projectId: 'project' })); readProject.mockReset().mockImplementation(async id => project(id)); list.mockReset().mockResolvedValue(data()); reorder.mockReset().mockImplementation(async id => ({ result: { issue: record(id), orderRevision: '6' }, receipt })); organize.mockReset().mockImplementation(async id => ({ result: record(id), receipt }));
    createIssue.mockReset().mockResolvedValue({ result: nativeRecord(), receipt }); getIssue.mockReset().mockResolvedValue(nativeRecord());
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('document', { getElementById: () => null }); vi.stubGlobal('HTMLInputElement', ModelInput);
    const snapshot = new ActivatedRouteSnapshot(); snapshot.params = { projectId: 'project' };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('No rendered UI is claimed.'); } } }, { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
      { provide: ActivatedRoute, useValue: { snapshot, paramMap: params.asObservable() } satisfies Pick<ActivatedRoute, 'snapshot' | 'paramMap'> }, { provide: AuthService, useValue: { me, sessionEpoch: epoch } satisfies Pick<AuthService, 'me' | 'sessionEpoch'> },
      { provide: ProjectsApi, useValue: { get: readProject } satisfies Pick<ProjectsApi, 'get'> }, { provide: BacklogApi, useValue: { list, reorder } satisfies Pick<BacklogApi, 'list' | 'reorder'> }, { provide: IssuesApi, useValue: { organize } satisfies Pick<IssuesApi, 'organize'> }, { provide: ModernIssuesApi, useValue: { create: createIssue, get: getIssue } satisfies Pick<ModernIssuesApi, 'create' | 'get'> },
    ] });
  });
  afterEach(() => { for (const scope of scopes.splice(0)) if (!scope.destroyed) scope.destroy(); TestBed.resetTestingModule(); params.complete(); vi.unstubAllGlobals(); });
  async function mount(wait = true) { const scope = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector)); scopes.push(scope); const model = runInInjectionContext(scope, () => new BacklogPage()); TestBed.tick(); if (wait) await vi.waitFor(() => expect(model.state.busy()).toBe(false)); return { model, destroy: () => scope.destroy() }; }
  function checkbox(model: BacklogPage, id: string | null, checked: boolean) { const input = new ModelInput(); input.checked = checked; input.addEventListener('change', event => id === null ? model.selectAll(event) : model.select(id, event)); input.dispatchEvent(new Event('change')); return input; }

  it('loads project/rank state together and does not start without identity or route', async () => {
    const { model } = await mount(); expect(readProject).toHaveBeenCalledExactlyOnceWith('project'); expect(list).toHaveBeenCalledExactlyOnceWith('project'); expect(model.orderRevision()).toBe('5'); expect(model.items().map(item => item.id)).toEqual(['first', 'second']); expect(model.canEdit()).toBe(true);
    me.set(null); TestBed.tick(); expect(model.items()).toEqual([]); expect(model.project()).toBeNull(); expect(list).toHaveBeenCalledTimes(1); me.set(person); params.next(convertToParamMap({})); TestBed.tick(); expect(list).toHaveBeenCalledTimes(1);
  });
  it('uses canonical modern cards and retained stage names while preserving the legacy read fallback', async () => {
    list.mockResolvedValueOnce({ ...data(['first']), modernItems: [modern()] }); const { model } = await mount(); expect(model.items()).toEqual([modern()]); expect(model.stageName(model.items()[0]!)).toBe('قبول الفريق'); await model.load(); expect(model.items()).toEqual(data().items); expect(model.stageName(model.items()[0]!)).toBe('To do');
  });
  it('appends one explicit cursor page without duplicating existing IDs and accepts its current ordering revision', async () => {
    list.mockResolvedValueOnce(data(['first'], 'cursor-next')); const { model } = await mount(); list.mockResolvedValueOnce(data(['first', 'second'], null, '9')); await model.more(); expect(list).toHaveBeenLastCalledWith('project', 'cursor-next'); expect(model.items().map(item => item.id)).toEqual(['first', 'second']); expect(model.cursor()).toBeNull(); expect(model.orderRevision()).toBe('9'); await model.more(); expect(list).toHaveBeenCalledTimes(2);
  });
  it('preserves confirmed rows on failed append and permits an explicit retry', async () => {
    list.mockResolvedValueOnce(data(['first'], 'next')); const { model } = await mount(); list.mockRejectedValueOnce(failure()); await model.more(); expect(model.items()).toEqual([issue()]); expect(model.cursor()).toBe('next'); expect(model.state.failure()?.status).toBe(409); list.mockResolvedValueOnce(data(['second'])); await model.more(); expect(model.items().map(item => item.id)).toEqual(['first', 'second']); expect(model.state.failure()).toBeNull();
  });
  it.each([{ effectiveRole: 'viewer' as const }, { archived: true }])('prevents writer actions for a read-only project %j', async changes => {
    readProject.mockResolvedValueOnce(project('project', changes)); const { model } = await mount(); checkbox(model, 'first', true); checkbox(model, null, true); model.openCreate(); await model.rank(0, 1); await model.activate([issue()]); await model.createModern({ title: 'Unauthorized local intention' }); expect(model.canEdit()).toBe(false); expect(model.selected()).toEqual([]); expect(model.creating()).toBe(false); expect(reorder).not.toHaveBeenCalled(); expect(organize).not.toHaveBeenCalled(); expect(createIssue).not.toHaveBeenCalled();
  });
  it('bounds selection to the loaded hundred, rejects the next checkbox and keeps individual removal independent', async () => {
    list.mockResolvedValueOnce(data(Array.from({ length: 101 }, (_, index) => String(index)))); const { model } = await mount(); checkbox(model, null, true); expect(model.selected()).toHaveLength(100); expect(model.allSelected()).toBe(false); const rejected = checkbox(model, '100', true); expect(rejected.checked).toBe(false); expect(model.state.message()).toBe('Select at most 100 issues per move.'); checkbox(model, '0', false); checkbox(model, '100', true); expect(model.selected()).toHaveLength(100); expect(model.selected()).not.toContain('0'); expect(model.selected()).toContain('100'); checkbox(model, null, false); expect(model.selected()).toEqual([]);
  });
  it('selects each loaded row once and removes missing selection on authoritative reload', async () => {
    const { model } = await mount(); checkbox(model, 'first', true); checkbox(model, 'first', true); expect(model.selected()).toEqual(['first']); checkbox(model, null, true); expect(model.allSelected()).toBe(true); list.mockResolvedValueOnce(data(['second'])); await model.load(); expect(model.selected()).toEqual(['second']); expect(model.allSelected()).toBe(true); model.select('second', new Event('change')); expect(model.selected()).toEqual(['second']);
  });
  it('ignores invalid and unchanged rank requests without issuing server commands', async () => {
    const { model } = await mount(); await model.rank(0, 0); await model.rank(-1, 0); await model.rank(0, 20); expect(reorder).not.toHaveBeenCalled(); expect(list).toHaveBeenCalledTimes(1);
  });
  it('ranks with exact issue/order revisions and adopts only authoritative returned row ordering', async () => {
    const { model } = await mount(); list.mockResolvedValueOnce(data(['second', 'first'], null, '6')); await model.rank(1, 0); expect(reorder.mock.calls[0]?.slice(0, 2)).toEqual(['second', { expectedRevision: '4', expectedOrderRevision: '5', neighborId: 'first', before: true }]); expect(model.items().map(item => item.id)).toEqual(['second', 'first']); expect(model.orderRevision()).toBe('6'); expect(model.notice()).toBe('Backlog order saved.');
    list.mockResolvedValueOnce(data(['first', 'second'], null, '7')); await model.rank(0, 1); expect(reorder.mock.calls[1]?.[1].before).toBe(false); expect(reorder.mock.calls[1]?.[2]).not.toBe(reorder.mock.calls[0]?.[2]);
  });
  it('retains an uncertain rank intention and original request identity until its deliberate replay is confirmed', async () => {
    const { model } = await mount(); reorder.mockRejectedValueOnce(uncertain()); await model.rank(1, 0); const original = reorder.mock.calls[0]; expect(model.items()).toEqual(data().items); expect(model.state.failure()?.status).toBe(503); list.mockResolvedValueOnce(data(['second', 'first'])); await model.rank(1, 0); expect(reorder.mock.calls[1]).toEqual(original); expect(model.state.failure()).toBeNull(); expect(model.notice()).toBe('Backlog order saved.');
  });
  it('blocks a duplicate rank and activation while an accepted order command remains outstanding', async () => {
    const { model } = await mount(), held = deferred<Awaited<ReturnType<BacklogApi['reorder']>>>(); reorder.mockReturnValueOnce(held.promise); const saving = model.rank(1, 0); await model.rank(0, 1); await model.activate([issue()]); expect(reorder).toHaveBeenCalledTimes(1); expect(organize).not.toHaveBeenCalled(); held.resolve({ result: { issue: record('second'), orderRevision: '6' }, receipt }); await saving; expect(model.state.busy()).toBe(false);
  });
  it('retains uncertain partial activation and replays only unconfirmed selected items with their original reference', async () => {
    const { model } = await mount(); checkbox(model, null, true); organize.mockResolvedValueOnce({ result: record('first'), receipt }).mockRejectedValueOnce(uncertain()); await model.activateSelected(); const original = organize.mock.calls[1]; expect(model.items().map(item => item.id)).toEqual(['second']); expect(model.selected()).toEqual(['second']); expect(model.notice()).toBe('1 moved to the board.'); expect(model.state.failure()?.status).toBe(503);
    list.mockResolvedValueOnce(data([])); await model.activateSelected(); expect(organize.mock.calls[2]).toEqual(original); expect(organize.mock.calls.map(call => call[0])).toEqual(['first', 'second', 'second']); expect(model.items()).toEqual([]); expect(model.selected()).toEqual([]); expect(model.state.failure()).toBeNull();
  });
  it('caps direct activation to one hundred commands even when more input records are supplied', async () => {
    const { model } = await mount(); list.mockResolvedValueOnce(data([])); await model.activate(Array.from({ length: 101 }, (_, index) => issue(String(index)))); expect(organize).toHaveBeenCalledTimes(100); expect(organize.mock.calls.at(-1)?.[0]).toBe('99'); expect(model.notice()).toBe('100 moved to the board.');
  });
  it('does not continue a partially acknowledged activation into another route’s rows or selection', async () => {
    const { model } = await mount(), held = deferred<Awaited<ReturnType<IssuesApi['organize']>>>(); checkbox(model, null, true); organize.mockReturnValueOnce(held.promise); const saving = model.activateSelected(); params.next(convertToParamMap({ projectId: 'replacement' })); list.mockResolvedValueOnce(data(['replacement'])); TestBed.tick(); await vi.waitFor(() => expect(model.state.busy()).toBe(false)); held.resolve({ result: record('first'), receipt }); await saving; expect(model.projectId()).toBe('replacement'); expect(model.items().map(item => item.id)).toEqual(['replacement']); expect(model.selected()).toEqual([]); expect(model.notice()).toBe(''); expect(organize).toHaveBeenCalledTimes(1);
  });
  it('does not let an old rejected read release the next route’s active request or publish its private explanation', async () => {
    const old = deferred<BacklogData>(), next = deferred<BacklogData>(); list.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise); const { model } = await mount(false); params.next(convertToParamMap({ projectId: 'next' })); TestBed.tick(); old.reject(new Error('private old-project failure')); await Promise.resolve(); await Promise.resolve(); expect(model.state.busy()).toBe(true); expect(model.state.message()).toBe(''); expect(model.items()).toEqual([]); next.resolve(data(['current'])); await vi.waitFor(() => expect(model.state.busy()).toBe(false)); expect(model.items().map(item => item.id)).toEqual(['current']);
  });
  it('drops an outstanding rank acknowledgement after account change before refresh or success notice', async () => {
    const { model } = await mount(), held = deferred<Awaited<ReturnType<BacklogApi['reorder']>>>(); reorder.mockReturnValueOnce(held.promise); const saving = model.rank(1, 0); epoch.update(value => value + 1); TestBed.tick(); await vi.waitFor(() => expect(model.state.busy()).toBe(false)); const calls = list.mock.calls.length; held.resolve({ result: { issue: record('second'), orderRevision: '99' }, receipt }); await saving; expect(list).toHaveBeenCalledTimes(calls); expect(model.orderRevision()).toBe('5'); expect(model.notice()).toBe('');
  });
  it('ignores a pending page result after model destruction', async () => {
    const f = await mount(), held = deferred<BacklogData>(); list.mockReturnValueOnce(held.promise); const reading = f.model.load(); f.destroy(); held.resolve(data(['late-private'])); await reading; expect(f.model.items()).toEqual(data().items); expect(f.model.notice()).toBe('');
  });
  it('forces planned creation and preserves the original pending payload/reference after an uncertain response', async () => {
    const { model } = await mount(); model.openCreate(); createIssue.mockRejectedValueOnce(new TypeError('private response details')); await model.createModern({ title: 'Original planned work', backlog: false, description: 'Keep this body' }); const original = createIssue.mock.calls[0]!; expect(original.slice(0, 2)).toEqual(['project', { title: 'Original planned work', backlog: true, description: 'Keep this body' }]); expect(model.pendingModern()).toEqual(original[1]); expect(model.creating()).toBe(true); expect(model.state.message()).not.toContain('private response');
    list.mockResolvedValueOnce(data(['created'], null, '9')); await model.createModern({ title: 'Different later input' }); expect(createIssue.mock.calls[1]).toEqual(original); expect(model.pendingModern()).toBeNull(); expect(model.creating()).toBe(false); expect(model.items().map(value => value.id)).toEqual(['created']); expect(model.orderRevision()).toBe('9'); expect(model.notice()).toBe('GG-created created in Backlog.'); expect(getIssue).not.toHaveBeenCalled();
  });
  it('does not replace an in-flight creation intention with a duplicate submission', async () => {
    const { model } = await mount(), held = deferred<Awaited<ReturnType<ModernIssuesApi['create']>>>(); createIssue.mockReturnValueOnce(held.promise); const saving = model.createModern({ title: 'First planned work' }); await model.createModern({ title: 'Duplicate' }); expect(createIssue).toHaveBeenCalledTimes(1); expect(model.pendingModern()?.title).toBe('First planned work'); held.resolve({ result: nativeRecord(), receipt }); await saving; expect(model.pendingModern()).toBeNull(); expect(model.state.busy()).toBe(false);
  });
  it('drops a held creation result after route ownership changes before changing the replacement backlog', async () => {
    const { model } = await mount(), held = deferred<Awaited<ReturnType<ModernIssuesApi['create']>>>(); createIssue.mockReturnValueOnce(held.promise); const saving = model.createModern({ title: 'Old project intention' }); params.next(convertToParamMap({ projectId: 'replacement' })); list.mockResolvedValueOnce(data(['replacement'])); TestBed.tick(); await vi.waitFor(() => expect(model.state.busy()).toBe(false)); const reads = list.mock.calls.length; held.resolve({ result: nativeRecord('old-private'), receipt }); await saving; expect(model.items().map(value => value.id)).toEqual(['replacement']); expect(model.pendingModern()).toBeNull(); expect(model.notice()).toBe(''); expect(list).toHaveBeenCalledTimes(reads);
  });
});
