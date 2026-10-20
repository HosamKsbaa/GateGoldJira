import '@angular/compiler';
import { DestroyRef, Injector, signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayoutView, ModernIssueSummary, ModernIssueView, NativeCardPage, ProjectView, SavedNativeMoveResult } from '../../api/generated/types.gen';
import { ApiError } from '../../core/api/api-result';
import { AuthService } from '../../core/auth/auth.service';
import { ModernIssuesApi } from '../issues/modern-issues.api';
import { BoardsApi } from './boards.api';
import { ModernBoardsApi } from './modern-boards.api';
import { ModernBoardsStore } from './modern-boards.store';

// The store's asynchronous rules are tested directly. Capture only effect
// scheduling, then explicitly deliver session changes instead of running a DOM.
const scheduled = vi.hoisted(() => ({ effects: [] as Array<() => void> }));
vi.mock('@angular/core', async original => ({
  ...await original<typeof import('@angular/core')>(),
  effect: (body: () => void) => { scheduled.effects.push(body); return { destroy() {} }; },
}));
afterEach(() => { scheduled.effects.length = 0; });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  return { promise: new Promise<T>((done, failed) => { resolve = done; reject = failed; }), resolve: (value: T) => resolve(value), reject: (reason: unknown) => reject(reason) };
}
async function settle() { for (let index = 0; index < 15; index++) await Promise.resolve(); }
function issue(index = 0): ModernIssueSummary {
  return { id: 'issue-' + index, projectId: 'project', number: String(index), key: 'GG-' + index, title: 'Work ' + index,
    type: { id: 'type', key: 'task', name: 'Task', behavior: 'standard', retired: false },
    priority: { id: 'priority', key: 'medium', name: 'Medium', sortOrder: '9007199254740993', retired: false },
    workflow: { id: 'flow', name: 'Delivery', revision: '9', retired: false },
    stage: { id: 'stage-0', name: 'Ready', category: 'todo', position: '1', initial: true, acceptsEntries: true, retired: false },
    assignee: null, dueDate: null, overdue: false, labels: [], blocked: false, unfinishedBlockerCount: 0, parent: null,
    subtaskProgress: { total: 0, done: 0 }, revision: '9007199254740993', archived: false, backlog: false,
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
}
function layout(count = 1, id = 'board'): LayoutView {
  return { board: { id, projectId: 'project', name: 'Delivery board', revision: '9007199254740995', default: false, archived: false, canManage: true, creator: { id: 'owner', displayName: 'Owner' }, savedFilters: {} }, companyToday: '2026-10-20',
    columns: Array.from({ length: count }, (_, index) => ({ id: 'column-' + index, name: 'Column ' + index, position: String(index + 1), orderRevision: '9007199254740997', savedMatchCount: 200000, visibleMatchCount: 200000, limitExceeded: false, wipLimit: null, wipMode: 'warn', stages: [{ workflow: issue().workflow, stage: { ...issue().stage, id: 'stage-' + index } }] })) };
}
function cardPage(view: LayoutView, index = 0, items = [issue()], cursor: string | null = null): NativeCardPage {
  return { column: view.columns[index]!, companyToday: view.companyToday, items, nextCursor: cursor, terminal: cursor === null };
}
function setup(view = layout()) {
  const epoch = signal(1), destroyed = { destroyed: false, onDestroy: vi.fn<(callback: () => void) => () => void>().mockReturnValue(() => {}) };
  const project: ProjectView = { id: 'project', key: 'GG', name: 'Project', description: '', archived: false, effectiveRole: 'member', revision: '1', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
  const get = vi.fn<ModernBoardsApi['get']>().mockResolvedValue(view);
  const cards = vi.fn<ModernBoardsApi['cards']>().mockImplementation(async (_board, column) => cardPage(view, view.columns.findIndex(value => value.id === column)));
  const move = vi.fn<ModernBoardsApi['move']>();
  const search = vi.fn<ModernIssuesApi['search']>();
  const readProject = vi.fn<BoardsApi['project']>().mockResolvedValue(project);
  const injector = Injector.create({ providers: [
    { provide: AuthService, useValue: { sessionEpoch: epoch } }, { provide: DestroyRef, useValue: destroyed },
    { provide: ModernBoardsApi, useValue: { get, cards, move } }, { provide: ModernIssuesApi, useValue: { search } },
    { provide: BoardsApi, useValue: { project: readProject } }, { provide: ModernBoardsStore, useFactory: () => new ModernBoardsStore() },
  ] });
  const store = injector.get(ModernBoardsStore);
  const sessionChanged = () => scheduled.effects.at(-1)!();
  sessionChanged();
  return { store, get, cards, move, search, readProject, project, epoch, destroyed, sessionChanged, injector };
}
function savedMove(view: LayoutView, replayed = false): SavedNativeMoveResult {
  const current: ModernIssueView = { summary: issue(), description: '', descriptionFormat: 'plain', graphRevision: '1', reporter: { id: 'owner', displayName: 'Owner' }, links: [], watching: false, capabilities: ['read', 'edit', 'move'] };
  return { receipt: { eventId: null, replayed }, result: { layout: view, issue: current } };
}
function failure(code: 'conflict' | 'prerequisite_unfinished', retryable = false) {
  return new ApiError({ error: { code, message: 'Read current work before trying again.', fieldErrors: [], retryable, nextAction: 'reload_current_state' }, current: null, unfinished: null }, 409);
}

describe('native board reads remain bounded and owned by the current session', () => {
  it('shares three reader reservations with initial and viewport requests without starving later columns', async () => {
    const view = layout(6), f = setup(view), releases = new Map<string, ReturnType<typeof deferred<NativeCardPage>>>();
    let active = 0, peak = 0;
    f.cards.mockImplementation(async (_board, id) => {
      active++; peak = Math.max(peak, active);
      const pending = deferred<NativeCardPage>(); releases.set(id, pending);
      try { return await pending.promise; } finally { active--; }
    });
    const initial = f.store.open('board'); await settle();
    expect([...releases.keys()]).toEqual(['column-0', 'column-1', 'column-2']);
    const visibleLater = f.store.loadColumn('column-5'); await settle();
    expect(releases.has('column-5')).toBe(false);
    releases.get('column-0')!.resolve(cardPage(view)); await settle();
    expect(releases.has('column-5')).toBe(true);
    expect(releases.has('column-3')).toBe(false);
    releases.get('column-1')!.resolve(cardPage(view, 1)); await settle();
    expect(releases.has('column-3')).toBe(true);
    for (const index of [2, 3, 5]) releases.get('column-' + index)!.resolve(cardPage(view, index));
    await Promise.all([initial, visibleLater]);
    expect(peak).toBe(3); expect(active).toBe(0);
    expect(f.store.columns().filter(column => column.loaded).map(column => column.summary.id)).toEqual(['column-0','column-1','column-2','column-3','column-5']);
    expect(f.cards).toHaveBeenCalledTimes(5);
  });

  it('cannot let an older board response replace a newer board or its criteria', async () => {
    const f = setup(), previous = deferred<LayoutView>(), next = layout(1, 'new-board');
    f.get.mockImplementation(async id => id === 'old-board' ? previous.promise : next);
    const oldRead = f.store.open('old-board', { query: 'private old query' }); await settle();
    const oldSignal = f.get.mock.calls[0]![2]!;
    await f.store.open('new-board', { query: 'current query' });
    expect(oldSignal.aborted).toBe(true);
    previous.resolve(layout(1, 'old-board')); await oldRead;
    expect(f.store.view()?.board.id).toBe('new-board'); expect(f.store.filters()).toEqual({ query: 'current query' });
    expect(f.cards.mock.calls.every(args => args[0] === 'new-board')).toBe(true);
    expect(f.store.loading()).toBe(false);
  });

  it.each(['session', 'destroy'] as const)('discards held cards after %s invalidates ownership', async change => {
    const view = layout(), f = setup(view), pending = deferred<NativeCardPage>();
    f.cards.mockReturnValue(pending.promise);
    const reading = f.store.open('board'); await settle();
    if (change === 'session') { f.epoch.set(2); f.sessionChanged(); }
    else f.injector.destroy();
    pending.resolve(cardPage(view, 0, [issue(999)])); await reading;
    expect(f.store.view()).toBeNull(); expect(f.store.columns()).toEqual([]); expect(f.store.project()).toBeNull(); expect(f.store.loading()).toBe(false);
  });

  it('retains at most 200 distinct cards and only their epic metadata while preserving full server counts', async () => {
    const view = layout(), f = setup(view);
    f.cards.mockResolvedValueOnce({ ...cardPage(view, 0, Array.from({ length: 200 }, (_, index) => issue(index)), 'page-2'), epics: [{ issueId: 'issue-0', epicId: 'old', epicName: 'Off-window epic' }, { issueId: 'issue-199', epicId: 'retained', epicName: 'Old name' }] });
    await f.store.open('board');
    f.cards.mockResolvedValueOnce({ ...cardPage(view, 0, [issue(199), ...Array.from({ length: 10 }, (_, index) => issue(index + 200))], 'page-3'), epics: [{ issueId: 'issue-199', epicId: 'retained', epicName: 'Current epic name' }, { issueId: 'issue-209', epicId: 'new', epicName: 'New epic' }] });
    await f.store.loadColumn('column-0', true);
    const current = f.store.columns()[0]!;
    expect(current.items).toHaveLength(200); expect(new Set(current.items.map(item => item.id)).size).toBe(200);
    expect(current.items[0]?.id).toBe('issue-10'); expect(current.items.at(-1)?.id).toBe('issue-209');
    expect(current.skipped).toBe(10); expect(current.summary.savedMatchCount).toBe(200000);
    expect(current.epics).toEqual([{ issueId: 'issue-199', epicId: 'retained', epicName: 'Current epic name' }, { issueId: 'issue-209', epicId: 'new', epicName: 'New epic' }]);
    f.cards.mockResolvedValueOnce(cardPage(view, 0, [issue(210)]));
    await f.store.loadColumn('column-0', true);
    expect(f.store.columns()[0]?.skipped).toBe(11); expect(f.store.columns()[0]?.cursor).toBeNull();
    expect(f.cards.mock.calls[1]?.[3]).toBe('page-2'); expect(f.cards.mock.calls[2]?.[3]).toBe('page-3');
    await f.store.loadColumn('column-0', true); expect(f.cards).toHaveBeenCalledTimes(3);
  });

  it('does not issue queued viewport reads after the session changes while all reader slots are occupied', async () => {
    const view = layout(6), f = setup(view), held = new Map<string, ReturnType<typeof deferred<NativeCardPage>>>();
    f.cards.mockImplementation(async (_board, id) => { const pending = deferred<NativeCardPage>(); held.set(id, pending); return pending.promise; });
    const initial = f.store.open('board'); await settle();
    const queued = f.store.loadColumn('column-5'); await settle();
    expect(f.cards).toHaveBeenCalledTimes(3);
    f.epoch.set(2); f.sessionChanged();
    for (const [id, pending] of held) pending.resolve(cardPage(view, Number(id.slice(-1))));
    await Promise.all([initial, queued]);
    expect(f.cards).toHaveBeenCalledTimes(3); expect(f.store.columns()).toEqual([]);
    // Every old reservation must be released so the new session can load again.
    f.cards.mockImplementation(async (_board, id) => cardPage(view, Number(id.slice(-1))));
    await f.store.open('board');
    expect(f.store.columns().filter(column => column.loaded)).toHaveLength(4);
  });

  it('publishes a typed board read failure and allows an explicit fresh retry', async () => {
    const f = setup(), rejected = failure('conflict'); f.get.mockRejectedValueOnce(rejected);
    await f.store.open('board');
    expect(f.store.state.failure()).toBe(rejected); expect(f.store.state.message()).toBe(rejected.message); expect(f.store.loading()).toBe(false);
    await f.store.open('board'); expect(f.store.state.failure()).toBeNull(); expect(f.store.view()?.board.id).toBe('board');
  });

  it('does not duplicate a concurrent or already completed first-page read', async () => {
    const view = layout(), f = setup(view), pending = deferred<NativeCardPage>();
    f.cards.mockReturnValue(pending.promise);
    const reading = f.store.open('board'); await settle();
    await f.store.loadColumn('column-0'); expect(f.cards).toHaveBeenCalledTimes(1);
    pending.resolve(cardPage(view)); await reading;
    await f.store.loadColumn('column-0'); await f.store.loadColumn('unknown');
    expect(f.cards).toHaveBeenCalledTimes(1);
  });

  it('leaves a failed column retryable and sanitizes transport details', async () => {
    const view = layout(), f = setup(view);
    f.cards.mockRejectedValueOnce(new Error('private upstream diagnostic'));
    await f.store.open('board');
    expect(f.store.columns()[0]).toMatchObject({ loaded: false, loading: false });
    expect(f.store.state.message()).toBe('The board could not be loaded. Check your connection and retry.');
    expect(f.store.state.failure()).toBeNull();
    await f.store.loadColumn('column-0'); expect(f.store.columns()[0]?.loaded).toBe(true);
  });
});

describe('board write intentions preserve authority, precision and uncertain request identity', () => {
  it.each(['administrator','project_admin','member','viewer'] as const)('requires current active project and board authority for %s', role => {
    const view = layout(), f = setup(view);
    expect(f.store.writable()).toBe(false); f.store.view.set(view); f.store.project.set({ ...f.project, effectiveRole: role });
    expect(f.store.writable()).toBe(role !== 'viewer');
    f.store.project.set({ ...f.project, effectiveRole: role, archived: true }); expect(f.store.writable()).toBe(false);
    f.store.project.set({ ...f.project, effectiveRole: role }); f.store.view.set({ ...view, board: { ...view.board, archived: true } }); expect(f.store.writable()).toBe(false);
  });

  it('retries the same frozen same-column order request after a lost response and confirms only once', async () => {
    const view = layout(), f = setup(view), criteria = { query: 'original query' };
    await f.store.open('board', criteria);
    f.move.mockRejectedValueOnce(new TypeError('lost reply')).mockResolvedValueOnce(savedMove(view, true));
    await f.store.place(issue(), 'column-0', 'neighbor', 'before');
    const original = structuredClone(f.store.pending()); expect(original).not.toBeNull();
    expect(original?.body).toMatchObject({ expectedIssueRevision: '9007199254740993', expectedBoardRevision: '9007199254740995', expectedSourceOrderRevision: '9007199254740997', expectedTargetOrderRevision: '9007199254740997', neighborIssueId: 'neighbor', placement: 'before', temporaryFilters: { query: 'original query' } });
    expect(original?.reorder).toBe(true);
    criteria.query = 'changed after dispatch';
    await f.store.open('other-board'); await f.store.place(issue(1), 'column-0', null, 'last');
    expect(f.get).toHaveBeenCalledTimes(1); expect(f.move).toHaveBeenCalledTimes(1);
    await f.store.retry();
    expect(f.move.mock.calls[1]).toEqual(f.move.mock.calls[0]); expect(f.move.mock.calls[1]?.[1]).toEqual(original?.body);
    expect(f.store.pending()).toBeNull(); expect(f.store.notice()).toBe('Original move confirmed.');
    expect(f.get).toHaveBeenCalledTimes(2);
  });

  it('keeps unmapped-source moves distinct from same-column ranking and reveals a previously unloaded destination', async () => {
    const view = layout(6), f = setup(view); await f.store.open('board');
    f.move.mockResolvedValue(savedMove(view));
    const candidate = { ...issue(), stage: { ...issue().stage, id: 'stage-unmapped' } };
    await f.store.place(candidate, 'column-5', null, 'last', 'stage-5');
    expect(f.move).toHaveBeenCalledTimes(1);
    expect(f.move.mock.calls[0]?.[1]).toMatchObject({ sourceColumnId: null, expectedSourceOrderRevision: null, targetColumnId: 'column-5', targetStageId: 'stage-5' });
    expect(f.move.mock.calls[0]?.[3]).toBe(false);
    expect(f.store.columns().find(column => column.summary.id === 'column-5')?.loaded).toBe(true);
    expect(f.store.notice()).toBe('Board updated.');
    expect(f.cards.mock.calls.filter(args => args[1] === 'column-5')).toHaveLength(1);
  });

  it('ignores an obsolete destination and does not refresh while an uncertain write still owns the board', async () => {
    const f = setup(); await f.store.refresh(); expect(f.get).not.toHaveBeenCalled();
    await f.store.open('board'); await f.store.place(issue(), 'removed-column', null, 'last');
    expect(f.move).not.toHaveBeenCalled(); expect(f.store.pending()).toBeNull();
    f.move.mockRejectedValue(new Error('Reply lost')); await f.store.place(issue(), 'column-0', null, 'last');
    await f.store.refresh(); expect(f.get).toHaveBeenCalledTimes(1); expect(f.store.pending()).not.toBeNull();
    f.store.pending.set(null); await f.store.refresh(); expect(f.get).toHaveBeenCalledTimes(2);
  });

  it('discards a held prerequisite page when its account no longer owns the board', async () => {
    const f = setup(), held = deferred<Awaited<ReturnType<ModernIssuesApi['search']>>>();
    await f.store.loadPrerequisites(); expect(f.search).not.toHaveBeenCalled();
    await f.store.open('board'); f.move.mockRejectedValue(failure('prerequisite_unfinished')); f.search.mockReturnValue(held.promise);
    const saving = f.store.place(issue(), 'column-0', null, 'last'); await settle();
    f.epoch.set(2); f.sessionChanged(); held.resolve({ items: [issue(444)], nextCursor: null, totalMatching: 1 }); await saving;
    expect(f.store.unfinished()).toBeNull(); expect(f.store.unfinishedState.busy()).toBe(false); expect(f.store.state.failure()).toBeNull();
  });

  it('clears a definitive conflict without issuing an automatic duplicate write', async () => {
    const f = setup(); await f.store.open('board'); const rejected = failure('conflict'); f.move.mockRejectedValue(rejected);
    await f.store.place(issue(), 'column-0', null, 'last');
    expect(f.store.pending()).toBeNull(); expect(f.store.state.failure()).toBe(rejected);
    await f.store.retry(); expect(f.move).toHaveBeenCalledTimes(1); expect(f.get).toHaveBeenCalledTimes(1);
  });

  it('cannot confirm a held old-session move or refresh its old board into a new account', async () => {
    const view = layout(), f = setup(view), pending = deferred<SavedNativeMoveResult>(); await f.store.open('board'); f.move.mockReturnValue(pending.promise);
    const saving = f.store.place(issue(), 'column-0', null, 'last'); await settle();
    f.epoch.set(2); f.sessionChanged(); pending.resolve(savedMove(view)); await saving;
    expect(f.store.pending()).toBeNull(); expect(f.store.view()).toBeNull(); expect(f.store.state.busy()).toBe(false);
    expect(f.get).toHaveBeenCalledTimes(1); expect(f.store.notice()).not.toBe('Board updated.');
  });

  it('loads unfinished prerequisites in bounded pages using the same dependent issue scope', async () => {
    const f = setup(); await f.store.open('board'); f.move.mockRejectedValue(failure('prerequisite_unfinished'));
    f.search.mockResolvedValueOnce({ items: [issue(1)], nextCursor: 'more-prerequisites', totalMatching: 2 }).mockResolvedValueOnce({ items: [issue(2)], nextCursor: null, totalMatching: 2 });
    await f.store.place(issue(), 'column-0', null, 'last');
    expect(f.store.pending()).toBeNull(); expect(f.store.unfinished()?.items.map(item => item.id)).toEqual(['issue-1']);
    await f.store.loadPrerequisites(true);
    expect(f.search.mock.calls).toEqual([[{ projectIds: ['project'], prerequisiteFor: 'issue-0' }, undefined], [{ projectIds: ['project'], prerequisiteFor: 'issue-0' }, 'more-prerequisites']]);
    expect(f.store.unfinished()?.items.map(item => item.id)).toEqual(['issue-1','issue-2']); expect(f.store.unfinishedState.busy()).toBe(false);
  });
});
