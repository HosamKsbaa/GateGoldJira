// Public presentation-model units: real Angular route/effects/forms and draft
// guards, with typed store/API ports. No rendered DOM, drag gesture, dialog focus,
// creation transport or live-service/browser acceptance is claimed here.
import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, provideZonelessChangeDetection, RendererFactory2, runInInjectionContext, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, ActivatedRouteSnapshot, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IssueFilter, IssueTransitionOption, LayoutView, Me, ModernIssueSummary, StageChoice } from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { RequestState } from '../../../../shared/ui/request-state';
import { ModernIssuesApi } from '../../../issues/modern-issues.api';
import { ModernBoardsStore, type NativeBoardColumn } from '../../modern-boards.store';
import { ModernKanbanPage } from './modern-kanban.page';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
const boardId = 'board-a';
const account: Me = { userId: 'member', displayName: 'Developer', email: 'member@example.test', administrator: false, companyTimeZone: 'Africa/Cairo' };
const workflow = { id: 'delivery', name: 'Delivery', revision: '3', retired: false };
function stage(id: string, changes: Partial<StageChoice> = {}): StageChoice {
  return { id, name: id, category: id === 'todo' ? 'todo' : 'review', position: '1', initial: id === 'todo', acceptsEntries: true, retired: false, ...changes };
}
function issue(id = 'issue-a', changes: Partial<ModernIssueSummary> = {}): ModernIssueSummary {
  return { id, projectId: 'project-a', key: 'GG-1', number: '1', title: id, revision: '4', archived: false, backlog: false, blocked: false, createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z', dueDate: null, overdue: false, assignee: null, labels: [], parent: null, subtaskProgress: { total: 0, done: 0 }, unfinishedBlockerCount: 0,
    type: { id: 'task', key: 'task', name: 'Task', behavior: 'standard', retired: false }, priority: { id: 'medium', key: 'medium', name: 'Medium', retired: false, sortOrder: '1' }, workflow, stage: stage('todo'), ...changes };
}
function column(id: string, stages: StageChoice[], items: ModernIssueSummary[] = []): NativeBoardColumn {
  return { summary: { id, name: id, position: '1', orderRevision: '2', savedMatchCount: items.length, visibleMatchCount: items.length, limitExceeded: false, wipLimit: null, wipMode: 'warn', stages: stages.map(stage => ({ stage, workflow })) }, items, epics: [], cursor: null, loaded: true, loading: false, skipped: 0 };
}
function layout(columns: NativeBoardColumn[]): LayoutView {
  return { board: { id: boardId, projectId: 'project-a', revision: '5', name: 'Team board', archived: false, default: false, canManage: true, creator: { id: account.userId, displayName: account.displayName }, savedFilters: {} }, companyToday: '2026-10-20', columns: columns.map(column => column.summary) };
}
function option(id: string, changes: Partial<IssueTransitionOption> = {}): IssueTransitionOption {
  return { transitionId: 'to-' + id, stage: stage(id), canRequest: true, requiresApproval: false, reviewSatisfied: true, requiredPermission: 'member', ...changes };
}
function unavailable(): ApiError {
  return new ApiError({ error: { code: 'temporarily_unavailable', message: 'Transitions could not be loaded.', retryable: true, nextAction: 'none', fieldErrors: [] }, current: null, unfinished: null }, 503);
}
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
class ModelSelect extends EventTarget { value = ''; }

describe('modern Kanban public controller state and request ownership', () => {
  const epoch = signal(1), me = signal<Me | null>(account);
  const columns = signal<NativeBoardColumn[]>([]), filters = signal<IssueFilter>({}), loading = signal(false), writable = signal(true);
  const pending = signal<ReturnType<ModernBoardsStore['pending']>>(null), view = signal<LayoutView | null>(null);
  const open = vi.fn<ModernBoardsStore['open']>(), refresh = vi.fn<ModernBoardsStore['refresh']>(), place = vi.fn<ModernBoardsStore['place']>(), loadColumn = vi.fn<ModernBoardsStore['loadColumn']>();
  const transitions = vi.fn<ModernIssuesApi['transitions']>();
  const confirm = vi.fn<(message: string) => boolean>();
  const scopes: EnvironmentInjector[] = [];
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>, drafts: DraftsService, storeState: RequestState;
  beforeEach(() => {
    epoch.set(1); me.set(account); filters.set({}); loading.set(false); writable.set(true); pending.set(null);
    columns.set([column('intake', [stage('todo')], [issue()]), column('review', [stage('review'), stage('qa')])]); view.set(layout(columns()));
    open.mockReset().mockResolvedValue(); refresh.mockReset().mockResolvedValue(); place.mockReset().mockResolvedValue(); loadColumn.mockReset().mockResolvedValue(); transitions.mockReset().mockResolvedValue({ items: [option('review')], nextCursor: null, totalMatching: 1 }); confirm.mockReset().mockReturnValue(true);
    vi.stubGlobal('window', Object.assign(new EventTarget(), { confirm })); vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'hidden' })); vi.stubGlobal('navigator', { onLine: true }); vi.stubGlobal('HTMLSelectElement', ModelSelect);
    params = new BehaviorSubject(convertToParamMap({ boardId })); const snapshot = new ActivatedRouteSnapshot(); snapshot.params = { boardId }; storeState = new RequestState();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('Model units must not render.'); } } }, { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
      { provide: ActivatedRoute, useValue: { snapshot, paramMap: params.asObservable() } satisfies Pick<ActivatedRoute, 'snapshot' | 'paramMap'> },
      { provide: AuthService, useValue: { sessionEpoch: epoch, me } satisfies Pick<AuthService, 'sessionEpoch' | 'me'> },
      { provide: ModernIssuesApi, useValue: { transitions } satisfies Pick<ModernIssuesApi, 'transitions'> },
      { provide: ModernBoardsStore, useValue: { columns, filters, loading, writable, pending, view, state: storeState, open, refresh, place, loadColumn } satisfies Pick<ModernBoardsStore, 'columns' | 'filters' | 'loading' | 'writable' | 'pending' | 'view' | 'state' | 'open' | 'refresh' | 'place' | 'loadColumn'> },
    ] }); drafts = TestBed.inject(DraftsService);
  });
  afterEach(() => { for (const scope of scopes.splice(0)) if (!scope.destroyed) scope.destroy(); TestBed.resetTestingModule(); params.complete(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  function mount() {
    const scope = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector)); scopes.push(scope);
    const page = runInInjectionContext(scope, () => new ModernKanbanPage()); TestBed.tick();
    return { page, destroy: () => scope.destroy() };
  }
  function group(page: ModernKanbanPage, value: string) {
    const select = new ModelSelect(); select.value = value; select.addEventListener('change', event => page.groupChanged(event)); select.dispatchEvent(new Event('change'));
  }

  it('opens only an authenticated nonempty route and resets local editor state for the next board', () => {
    const { page } = mount(); expect(open).toHaveBeenCalledExactlyOnceWith(boardId);
    page.openCreate(); page.openPreview('old-issue'); group(page, 'assignee'); page.toggleLane('unassigned'); page.activeColumn.set('review');
    params.next(convertToParamMap({ boardId: 'board-next' })); TestBed.tick();
    expect(open).toHaveBeenLastCalledWith('board-next'); expect(page.boardId()).toBe('board-next'); expect(page.creating()).toBe(false); expect(page.previewId()).toBeNull(); expect(page.grouping()).toBe('none'); expect(page.collapsed().size).toBe(0); expect(page.activeColumn()).toBe('');
    me.set(null); params.next(convertToParamMap({ boardId: 'unreadable' })); TestBed.tick(); expect(open).toHaveBeenCalledTimes(2);
    me.set(account); params.next(convertToParamMap({})); TestBed.tick(); expect(open).toHaveBeenCalledTimes(2);
  });

  it('debounces the latest Arabic query, trims it and preserves every other temporary criterion', () => {
    vi.useFakeTimers(); filters.set({ query: 'old', blocked: true, labelIds: ['release'], assignee: { kind: 'self' } }); const { page } = mount(); open.mockClear();
    page.query.setValue('مر'); TestBed.tick(); vi.advanceTimersByTime(70); page.query.setValue('  مراجعة  '); TestBed.tick(); vi.advanceTimersByTime(119); expect(open).not.toHaveBeenCalled(); expect(page.searchPending()).toBe(true);
    vi.advanceTimersByTime(1); TestBed.tick(); expect(open).toHaveBeenCalledExactlyOnceWith(boardId, { query: 'مراجعة', blocked: true, labelIds: ['release'], assignee: { kind: 'self' } }, true); expect(page.searchPending()).toBe(false);
  });

  it('retains a search while a mutation owns the board and sends only the latest input after it finishes', () => {
    vi.useFakeTimers(); const { page } = mount(); open.mockClear(); storeState.busy.set(true); page.query.setValue('old'); page.query.setValue('latest'); TestBed.tick(); vi.advanceTimersByTime(120); TestBed.tick(); expect(open).not.toHaveBeenCalled(); expect(page.searchPending()).toBe(true);
    storeState.busy.set(false); TestBed.tick(); expect(open).toHaveBeenCalledExactlyOnceWith(boardId, { query: 'latest' }, true); expect(page.searchPending()).toBe(false);
  });

  it('does not send an oversized query and removes only query when the input is cleared', () => {
    const { page } = mount(); open.mockClear(); filters.set({ query: 'old', blocked: false, priorityIds: ['medium'] }); page.query.setValue('x'.repeat(201), { emitEvent: false }); page.search(); expect(open).not.toHaveBeenCalled(); expect(page.searchPending()).toBe(false);
    page.query.setValue('  ', { emitEvent: false }); page.search(); expect(open).toHaveBeenCalledExactlyOnceWith(boardId, { blocked: false, priorityIds: ['medium'] }, true);
  });

  it('replacing filter criteria cancels the pending query timer rather than restoring stale search text', () => {
    vi.useFakeTimers(); const { page } = mount(); open.mockClear(); page.query.setValue('stale'); page.filtersChanged({ query: 'مهمة', blocked: true }); vi.advanceTimersByTime(200); TestBed.tick();
    expect(open).toHaveBeenCalledExactlyOnceWith(boardId, { query: 'مهمة', blocked: true }, true); expect(page.query.value).toBe('مهمة'); expect(page.searchPending()).toBe(false);
  });

  it('busy filters update their public text without dispatch and Mine toggles only assignee ownership', () => {
    const { page } = mount(); open.mockClear(); storeState.busy.set(true); page.filtersChanged({ query: 'held' }); page.toggleMine(); expect(page.query.value).toBe('held'); expect(open).not.toHaveBeenCalled();
    storeState.busy.set(false); filters.set({ blocked: true, assignee: { kind: 'unassigned' } }); page.toggleMine(); expect(open).toHaveBeenLastCalledWith(boardId, { blocked: true, assignee: { kind: 'self' } }, true);
    filters.set({ blocked: true, assignee: { kind: 'self' } }); page.toggleMine(); expect(open).toHaveBeenLastCalledWith(boardId, { blocked: true }, true);
    page.clearFilters(); expect(page.query.value).toBe(''); expect(open).toHaveBeenLastCalledWith(boardId, {}, true);
  });

  it('partitions existing windows by assignee and epic without fetching or duplicating loaded issues', () => {
    const alice = { id: 'alice', displayName: 'Alice' }, first = issue('a', { assignee: alice }), second = issue('b'), third = issue('c', { assignee: alice, stage: stage('review') });
    const intake = column('intake', [stage('todo')], [first, second]), review = column('review', [stage('review')], [third]); intake.epics = [{ issueId: first.id, epicId: 'launch', epicName: 'Launch' }]; review.epics = [{ issueId: third.id, epicId: 'launch', epicName: 'Launch' }]; columns.set([intake, review]);
    const { page } = mount(); group(page, 'assignee'); expect(page.lanes().map(lane => [lane.id, lane.count])).toEqual([['assignee-alice', 2], ['unassigned', 1]]); expect(page.lanes()[0]?.cells.map(cell => cell.target.items.map(item => item.id))).toEqual([['a'], ['c']]);
    page.toggleLane('assignee-alice'); group(page, 'epic'); expect(page.collapsed().size).toBe(0); expect(page.lanes().map(lane => [lane.name, lane.count])).toEqual([['Launch', 2], ['No epic', 1]]); expect(page.epics().get('c')?.epicId).toBe('launch'); expect(loadColumn).not.toHaveBeenCalled(); expect(open).toHaveBeenCalledTimes(1);
  });

  it('rejects unsupported grouping events and toggles independent collapsed-lane state without mutating its prior snapshot', () => {
    const { page } = mount(); group(page, 'assignee'); page.toggleLane('unassigned'); const previous = page.collapsed(); page.toggleLane('alice'); expect(previous).toEqual(new Set(['unassigned'])); expect(page.collapsed()).toEqual(new Set(['unassigned', 'alice']));
    group(page, 'forged'); page.groupChanged(new Event('change')); expect(page.grouping()).toBe('assignee'); expect(page.collapsed().size).toBe(2); page.toggleLane('unassigned'); expect(page.collapsed()).toEqual(new Set(['alice']));
  });

  it('does not resolve transitions for a read-only, busy or missing destination', async () => {
    const { page } = mount(); writable.set(false); await page.chooseDestination(issue(), 'review'); writable.set(true); storeState.busy.set(true); await page.chooseDestination(issue(), 'review'); storeState.busy.set(false); await page.chooseDestination(issue(), 'missing'); expect(transitions).not.toHaveBeenCalled(); expect(place).not.toHaveBeenCalled(); expect(page.destination()).toBeNull();
  });

  it('reorders within a mapped current stage using the exact neighboring card without an unnecessary transition read', async () => {
    const { page } = mount(), value = issue(); await page.chooseDestination(value, 'intake', 'next-card', 'before'); expect(transitions).not.toHaveBeenCalled(); expect(place).toHaveBeenCalledExactlyOnceWith(value, 'intake', 'next-card', 'before');
  });

  it('follows the complete transition cursor before choosing the sole permitted mapped destination', async () => {
    const { page } = mount(), value = issue(); transitions.mockResolvedValueOnce({ items: [option('review', { canRequest: false }), option('unmapped')], nextCursor: 'next-page', totalMatching: 3 }).mockResolvedValueOnce({ items: [option('qa')], nextCursor: null, totalMatching: 3 });
    await page.chooseDestination(value, 'review', 'preceding-card', 'after'); expect(transitions.mock.calls).toEqual([[value.id, undefined], [value.id, 'next-page']]); expect(place).toHaveBeenCalledExactlyOnceWith(value, 'review', 'preceding-card', 'after', 'qa'); expect(page.destination()).toBeNull(); expect(page.actionState.busy()).toBe(false);
  });

  it('retains an approval-gated destination for explicit review instead of applying the move', async () => {
    const { page } = mount(), value = issue(); const gated = option('review', { requiresApproval: true, reviewSatisfied: false }); transitions.mockResolvedValueOnce({ items: [gated], nextCursor: null, totalMatching: 1 }); await page.chooseDestination(value, 'review');
    expect(place).not.toHaveBeenCalled(); expect(page.destination()).toEqual({ issue: value, columnId: 'review', neighbor: null, placement: 'last', choices: [gated] }); page.closeDestination(); expect(page.destination()).toBeNull(); await page.selectStage('review'); expect(place).not.toHaveBeenCalled();
  });

  it('requires a stage selection for ambiguous mapped destinations and clears the controller before dispatch', async () => {
    const { page } = mount(), value = issue(); transitions.mockResolvedValueOnce({ items: [option('review'), option('qa')], nextCursor: null, totalMatching: 2 }); await page.chooseDestination(value, 'review', 'neighbor', 'before'); expect(page.destination()?.choices.map(value => value.stage.id)).toEqual(['review', 'qa']); expect(place).not.toHaveBeenCalled();
    const held = deferred<void>(); place.mockReturnValueOnce(held.promise); const selecting = page.selectStage('qa'); expect(page.destination()).toBeNull(); expect(place).toHaveBeenCalledExactlyOnceWith(value, 'review', 'neighbor', 'before', 'qa'); held.resolve(); await selecting;
  });

  it('explains an unavailable column move without sending a place command', async () => {
    const { page } = mount(); transitions.mockResolvedValueOnce({ items: [option('review', { canRequest: false }), option('unmapped')], nextCursor: null, totalMatching: 2 }); await page.chooseDestination(issue(), 'review'); expect(page.actionState.message()).toBe('This workflow has no eligible move to that column.'); expect(place).not.toHaveBeenCalled(); expect(page.destination()).toBeNull();
  });

  it('retains a typed transition-read failure and permits an explicit fresh retry of the exact intended move', async () => {
    const { page } = mount(), value = issue(), error = unavailable(); transitions.mockRejectedValueOnce(error); await page.chooseDestination(value, 'review', 'neighbor', 'before'); expect(page.actionState.failure()).toBe(error); expect(page.actionState.busy()).toBe(false); expect(place).not.toHaveBeenCalled();
    await page.chooseDestination(value, 'review', 'neighbor', 'before'); expect(transitions.mock.calls).toEqual([[value.id, undefined], [value.id, undefined]]); expect(place).toHaveBeenCalledExactlyOnceWith(value, 'review', 'neighbor', 'before', 'review'); expect(page.actionState.failure()).toBeNull(); expect(page.actionState.message()).toBe('');
  });

  it('does not expose unknown transport details and permits another attempt', async () => {
    const { page } = mount(); transitions.mockRejectedValueOnce(new TypeError('private transport diagnostic')); await page.chooseDestination(issue(), 'review'); expect(page.actionState.failure()).toBeNull(); expect(page.actionState.message()).toBe('The request could not be completed. Check your connection and try again.'); await page.chooseDestination(issue(), 'review'); expect(place).toHaveBeenCalledTimes(1); expect(page.actionState.message()).toBe('');
  });

  it('ignores an old board reply without releasing a new destination request or following the old cursor', async () => {
    const { page } = mount(), old = deferred<Awaited<ReturnType<ModernIssuesApi['transitions']>>>(), replacement = deferred<Awaited<ReturnType<ModernIssuesApi['transitions']>>>(); transitions.mockReturnValueOnce(old.promise).mockReturnValueOnce(replacement.promise);
    const first = page.chooseDestination(issue('old-private'), 'review'); expect(page.actionState.busy()).toBe(true); params.next(convertToParamMap({ boardId: 'board-next' })); TestBed.tick(); const second = page.chooseDestination(issue('current'), 'review');
    old.resolve({ items: [option('qa')], nextCursor: 'old-cursor', totalMatching: 2 }); await first; expect(transitions).toHaveBeenCalledTimes(2); expect(page.actionState.busy()).toBe(true); expect(page.destination()).toBeNull(); expect(place).not.toHaveBeenCalled();
    replacement.resolve({ items: [option('review')], nextCursor: null, totalMatching: 1 }); await second; expect(place).toHaveBeenCalledExactlyOnceWith(issue('current'), 'review', null, 'last', 'review'); expect(page.actionState.busy()).toBe(false);
  });

  it('discards a held transition result after the public authentication epoch changes', async () => {
    const { page } = mount(), held = deferred<Awaited<ReturnType<ModernIssuesApi['transitions']>>>(); transitions.mockReturnValueOnce(held.promise); const moving = page.chooseDestination(issue(), 'review'); epoch.update(value => value + 1); TestBed.tick(); expect(page.actionState.busy()).toBe(false); expect(open).toHaveBeenCalledTimes(2);
    held.resolve({ items: [option('review')], nextCursor: null, totalMatching: 1 }); await moving; expect(place).not.toHaveBeenCalled(); expect(page.destination()).toBeNull(); expect(page.actionState.failure()).toBeNull();
  });

  it('ignores preview activation while dragging and honors a real dirty-draft leave decision before refreshing', async () => {
    const { page } = mount(); page.draggingId.set('dragging'); page.openPreview('issue-a'); expect(page.previewId()).toBeNull(); page.draggingId.set(null); page.openPreview('issue-a'); drafts.activate('comment', true); confirm.mockReturnValueOnce(false); await page.closePreview(); expect(page.previewId()).toBe('issue-a'); expect(refresh).not.toHaveBeenCalled();
    confirm.mockReturnValueOnce(true); await page.closePreview(); expect(page.previewId()).toBeNull(); expect(refresh).toHaveBeenCalledExactlyOnceWith(); expect(drafts.dirtyCount()).toBe(1); expect(confirm).toHaveBeenCalledTimes(2);
  });

  it('guards creation by permission and pending mutation, retaining a dirty editor when Cancel is declined', () => {
    const { page } = mount(); writable.set(false); page.openCreate(); expect(page.creating()).toBe(false); writable.set(true); storeState.busy.set(true); page.openCreate(); expect(page.creating()).toBe(false); storeState.busy.set(false); page.openCreate(); expect(page.creating()).toBe(true);
    drafts.activate('create', true); page.createState.busy.set(true); page.cancelCreate(); expect(confirm).not.toHaveBeenCalled(); expect(page.creating()).toBe(true); page.createState.busy.set(false); confirm.mockReturnValueOnce(false); page.cancelCreate(); expect(page.creating()).toBe(true); confirm.mockReturnValueOnce(true); page.cancelCreate(); expect(page.creating()).toBe(false); expect(drafts.dirtyCount()).toBe(1);
  });

  it('clears controller-owned busy/errors and open editor state when authentication ownership changes', () => {
    const { page } = mount(); page.openCreate(); page.openPreview('private'); page.actionState.failure.set(unavailable()); page.actionState.message.set('Old failure'); page.actionState.busy.set(true); page.createState.busy.set(true); epoch.update(value => value + 1); TestBed.tick(); expect(page.creating()).toBe(false); expect(page.previewId()).toBeNull(); expect(page.busy()).toBe(false); expect(page.actionState.failure()).toBeNull(); expect(page.actionState.message()).toBe('');
  });

  it('cancels a pending debounced search at destruction and removes the actual form subscription', () => {
    vi.useFakeTimers(); const f = mount(); open.mockClear(); f.page.query.setValue('private pending'); f.destroy(); vi.advanceTimersByTime(120); f.page.query.setValue('after destroy'); vi.advanceTimersByTime(120); expect(open).not.toHaveBeenCalled();
  });
});
