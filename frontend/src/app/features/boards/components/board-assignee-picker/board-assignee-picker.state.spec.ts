import '@angular/compiler';
import { Injector, signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssigneeFilter, PageUserSummary, UserSummary } from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { IssuesApi } from '../../../issues/issues.api';
import { IssueChoiceCache } from '../../../issues/issue-choice-cache.service';
import { BoardAssigneePickerComponent } from './board-assignee-picker.component';

const scheduling = vi.hoisted(() => ({ effects: [] as Array<() => void> }));
vi.mock('@angular/core', async original => ({
  ...await original<typeof import('@angular/core')>(),
  effect: (body: () => void) => { scheduling.effects.push(body); return { destroy() {} }; },
}));
afterEach(() => { scheduling.effects.length = 0; vi.useRealTimers(); });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  return { promise: new Promise<T>((done, failed) => { resolve = done; reject = failed; }), resolve: (value: T) => resolve(value), reject: (error: unknown) => reject(error) };
}
const page = (items: UserSummary[], nextCursor: string | null = null): PageUserSummary => ({ items, nextCursor, totalMatching: items.length });
function setup() {
  const epoch = signal(1), project = signal('project-a'), value = signal<AssigneeFilter | undefined>(undefined), disabled = signal(false);
  const assignees = vi.fn<IssuesApi['assignees']>().mockResolvedValue(page([])), users = new Map<string, UserSummary>();
  const injector = Injector.create({ providers: [
    { provide: AuthService, useValue: { sessionEpoch: epoch } },
    { provide: IssuesApi, useValue: { assignees } }, { provide: IssueChoiceCache, useValue: { users } },
    { provide: BoardAssigneePickerComponent, useFactory: () => new BoardAssigneePickerComponent() },
  ] });
  const picker = injector.get(BoardAssigneePickerComponent);
  Object.assign(picker, { projectId: project, value, disabled });
  const changed = vi.spyOn(picker.changed, 'emit');
  return { picker, assignees, changed, users, epoch, project, value, disabled, injector, sessionChanged: () => scheduling.effects.at(-1)!() };
}

describe('board assignee choices preserve ownership and explicit selection', () => {
  it('loads on project/session effect and clears previous errors and names', async () => {
    const f = setup(); f.picker.people.set([{ id: 'old', displayName: 'Previous account person' }]); f.picker.state.message.set('Previous failure');
    f.sessionChanged(); await Promise.resolve(); await Promise.resolve();
    expect(f.assignees).toHaveBeenCalledWith('project-a', '', undefined); expect(f.picker.people()).toEqual([]); expect(f.picker.state.message()).toBe('');
    f.project.set(''); f.sessionChanged(); await Promise.resolve(); expect(f.assignees).toHaveBeenCalledTimes(1);
  });
  it('debounces and replaces stale query work instead of issuing every intermediate keystroke', async () => {
    vi.useFakeTimers(); const f = setup(); f.picker.search('  old  '); await vi.advanceTimersByTimeAsync(70); f.picker.search('  بشير  ');
    await vi.advanceTimersByTimeAsync(119); expect(f.assignees).not.toHaveBeenCalled(); expect(f.picker.pending()).toBe(true);
    await vi.advanceTimersByTimeAsync(1); expect(f.assignees).toHaveBeenCalledExactlyOnceWith('project-a', 'بشير', undefined); expect(f.picker.pending()).toBe(false);
  });
  it('counts Unicode code points at the100-character query boundary and never sends oversized input', async () => {
    vi.useFakeTimers(); const f = setup(); f.picker.search('😀'.repeat(101)); await vi.runAllTimersAsync();
    expect(f.assignees).not.toHaveBeenCalled(); expect(f.picker.pending()).toBe(false); expect(f.picker.state.message()).toContain('at most 100');
    f.picker.search('😀'.repeat(100)); await vi.runAllTimersAsync(); expect(f.assignees).toHaveBeenCalledExactlyOnceWith('project-a', '😀'.repeat(100), undefined);
  });
  it('appends cursor pages with stable identities, fresh names and cached off-page selections', async () => {
    const f = setup(); f.assignees.mockResolvedValueOnce(page([{ id: 'a', displayName: 'Old Alice' }], 'next')).mockResolvedValueOnce(page([{ id: 'a', displayName: 'Alice' }, { id: 'b', displayName: 'بشير' }]));
    await f.picker.find(); await f.picker.find(true);
    expect(f.assignees.mock.calls).toEqual([['project-a', '', undefined], ['project-a', '', 'next']]);
    expect(f.picker.people()).toEqual([{ id: 'a', displayName: 'Alice' }, { id: 'b', displayName: 'بشير' }]); expect(f.picker.cursor()).toBeNull();
    f.value.set({ kind: 'user', userId: 'b' }); f.picker.people.set([]); expect(f.picker.selectedOptions()).toEqual([{ id: 'b', label: 'بشير' }]);
    f.value.set({ kind: 'user', userId: 'unknown' }); expect(f.picker.selectedOptions()).toEqual([{ id: 'unknown', label: 'Specific teammate' }]);
  });
  it('never publishes a delayed result for an account epoch or project that no longer owns it', async () => {
    for (const change of ['epoch', 'project'] as const) {
      const f = setup(), delayed = deferred<PageUserSummary>(); f.assignees.mockReturnValueOnce(delayed.promise);
      const loading = f.picker.find(); if (change === 'epoch') f.epoch.set(2); else f.project.set('project-b');
      delayed.resolve(page([{ id: 'private', displayName: 'Old private person' }], 'private-cursor')); await loading;
      expect(f.picker.people()).toEqual([]); expect(f.picker.cursor()).toBeNull(); expect(f.users.size).toBe(0);
    }
  });
  it('an old query cannot overwrite newer search results or release the newer busy state', async () => {
    vi.useFakeTimers(); const f = setup(), old = deferred<PageUserSummary>(), next = deferred<PageUserSummary>();
    f.assignees.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    const loading = f.picker.find(); f.picker.search('new'); await vi.advanceTimersByTimeAsync(120);
    old.resolve(page([{ id: 'old', displayName: 'Old result' }])); await loading;
    expect(f.picker.people()).toEqual([]); expect(f.picker.state.busy()).toBe(true);
    next.resolve(page([{ id: 'current', displayName: 'Current result' }])); await Promise.resolve(); await Promise.resolve();
    expect(f.picker.people()).toEqual([{ id: 'current', displayName: 'Current result' }]); expect(f.picker.state.busy()).toBe(false);
  });
  it('cancels queued search on destruction and refuses late in-flight names', async () => {
    vi.useFakeTimers(); const f = setup(); f.picker.search('queued'); f.injector.destroy(); await vi.runAllTimersAsync();
    expect(f.assignees).not.toHaveBeenCalled(); expect(f.picker.pending()).toBe(false);
    const second = setup(), delayed = deferred<PageUserSummary>(); second.assignees.mockReturnValueOnce(delayed.promise);
    const loading = second.picker.find(); second.injector.destroy(); delayed.resolve(page([{ id: 'private', displayName: 'Destroyed route result' }])); await loading;
    expect(second.picker.people()).toEqual([]); expect(second.picker.state.busy()).toBe(false);
  });
  it('retains typed permission failure for retry and clears it after a successful authorized read', async () => {
    const f = setup(), error = new ApiError({ error: { code: 'forbidden', message: 'Project access is no longer available.', retryable: false, fieldErrors: [], nextAction: 'none' }, current: null, unfinished: null }, 403);
    f.assignees.mockRejectedValueOnce(error); await f.picker.find(); expect(f.picker.state.failure()).toBe(error); expect(f.picker.state.busy()).toBe(false);
    f.assignees.mockResolvedValueOnce(page([{ id: 'allowed', displayName: 'Allowed person' }])); await f.picker.find(); expect(f.picker.state.failure()).toBeNull(); expect(f.picker.people()[0]?.id).toBe('allowed');
  });
  it('hides private transport diagnostics and does not publish stale query failures', async () => {
    const f = setup(); f.assignees.mockRejectedValueOnce(new Error('Private upstream details')); await f.picker.find();
    expect(f.picker.state.message()).toContain('Check your connection'); expect(f.picker.state.message()).not.toContain('Private');
    const delayed = deferred<PageUserSummary>(); f.assignees.mockReturnValueOnce(delayed.promise); const loading = f.picker.find(); f.project.set('other'); delayed.reject(new Error('Old private details')); await loading;
    expect(f.picker.state.message()).not.toContain('Old private'); expect(f.picker.people()).toEqual([]);
  });
  it('permits explicit presets/current people but blocks disabled or arbitrary cached identities', () => {
    const f = setup(); f.picker.people.set([{ id: 'allowed', displayName: 'Allowed' }]); f.users.set('cached', { id: 'cached', displayName: 'Retained off-page' });
    for (const ids of [[], ['any'], ['self'], ['unassigned'], ['allowed'], ['cached']]) f.picker.choose(ids);
    expect(f.changed.mock.calls.map(args => args[0])).toEqual([null, null, { kind: 'self' }, { kind: 'unassigned' }, { kind: 'user', userId: 'allowed' }]);
    f.disabled.set(true); f.picker.choose(['self']); expect(f.changed).toHaveBeenCalledTimes(5);
    f.value.set({ kind: 'user' }); expect(f.picker.selectedIds()).toEqual(['any']); f.value.set({ kind: 'self' }); expect(f.picker.selectedOptions()).toEqual([{ id: 'self', label: 'Assigned to me' }]);
  });
});
