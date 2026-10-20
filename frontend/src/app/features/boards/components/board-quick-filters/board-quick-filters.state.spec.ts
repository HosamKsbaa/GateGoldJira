import '@angular/compiler';
import { Injector, signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IssueFilter, SavedSavedSearch, SavedSearch, SavedSearchList } from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { IssuesApi } from '../../../issues/issues.api';
import { BoardQuickFiltersComponent } from './board-quick-filters.component';

// The real Angular form, signals, RequestState and RetryIntent own the rules.
// Only lifecycle scheduling and the typed HTTP port are replaced in this unit.
const scheduled = vi.hoisted(() => ({ effects: [] as Array<() => void> }));
vi.mock('@angular/core', async original => ({
  ...await original<typeof import('@angular/core')>(),
  effect: (body: () => void) => { scheduled.effects.push(body); return { destroy() {} }; },
}));
const projectA = '20000000-0000-4000-8000-000000000001', projectB = '20000000-0000-4000-8000-000000000002';
const searchId = '30000000-0000-4000-8000-000000000001';
const injectors: Array<ReturnType<typeof Injector.create>> = [];
afterEach(() => { for (const injector of injectors.splice(0)) injector.destroy(); scheduled.effects.length = 0; });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  return { promise: new Promise<T>((done, failed) => { resolve = done; reject = failed; }), resolve: (value: T) => resolve(value), reject: (error: unknown) => reject(error) };
}
function item(overrides: Partial<SavedSearch> = {}): SavedSearch {
  return { id: searchId, name: 'Team work', revision: '9007199254740993', removed: false, filters: { projectIds: [projectA], query: 'review' }, ...overrides };
}
function accepted(result: SavedSearch, replayed = false): SavedSavedSearch { return { result, receipt: { eventId: '40000000-0000-4000-8000-000000000001', replayed } }; }
function failure(code: 'conflict' | 'forbidden' | 'temporarily_unavailable') {
  return new ApiError({ error: { code, message: code === 'forbidden' ? 'Project access is unavailable.' : 'Review the accepted command before continuing.', fieldErrors: [], retryable: code === 'temporarily_unavailable', nextAction: code === 'temporarily_unavailable' ? 'retry_same_reference' : code === 'conflict' ? 'reload_current_state' : 'none' }, current: null, unfinished: null }, code === 'conflict' ? 409 : code === 'forbidden' ? 403 : 503);
}
function setup() {
  const project = signal(projectA), filters = signal<IssueFilter>({ query: 'review' }), disabled = signal(false), epoch = signal(1);
  const read = vi.fn<IssuesApi['savedSearches']>().mockResolvedValue({ items: [] });
  const save = vi.fn<IssuesApi['saveSearch']>().mockImplementation(async (id, body) => accepted(item({ id, name: body.name, filters: body.filters, removed: body.removed ?? false, revision: String(BigInt(body.expectedRevision) + 1n) })));
  const injector = Injector.create({ providers: [
    { provide: AuthService, useValue: { sessionEpoch: epoch } }, { provide: IssuesApi, useValue: { savedSearches: read, saveSearch: save } },
    { provide: BoardQuickFiltersComponent, useFactory: () => new BoardQuickFiltersComponent() },
  ] });
  injectors.push(injector);
  const component = injector.get(BoardQuickFiltersComponent); Object.assign(component, { projectId: project, filters, disabled });
  return { component, project, filters, disabled, epoch, read, save, applied: vi.spyOn(component.applied, 'emit'), contextChanged: () => scheduled.effects.at(-1)!(),
    destroy: () => { injectors.splice(injectors.indexOf(injector), 1); injector.destroy(); } };
}
async function settle() { for (let index = 0; index < 6; index++) await Promise.resolve(); }


describe('personal board quick filters preserve command and context ownership', () => {
  it('shows only active personal choices scoped to exactly the current project', () => {
    const f = setup(), own = item();
    f.component.all.set([own, item({ id: 'removed', removed: true }), item({ id: 'foreign', filters: { projectIds: [projectB] } }), item({ id: 'global', filters: {} }), item({ id: 'multiple', filters: { projectIds: [projectA, projectB] } })]);
    expect(f.component.items()).toEqual([own]); f.project.set(projectB); expect(f.component.items().map(value => value.id)).toEqual(['foreign']);
  });
  it('toggles equivalent current criteria off and emits a different saved choice only when enabled', () => {
    const f = setup(), own = item({ filters: { projectIds: [projectA], query: '  review ', statuses: ['review', 'todo'] } });
    f.filters.set({ query: 'review', statuses: ['todo', 'review'] }); expect(f.component.active(own)).toBe(true);
    f.component.choose(own); expect(f.applied).toHaveBeenLastCalledWith({});
    const different = item({ filters: { projectIds: [projectA], assignee: { kind: 'self' } } }); f.component.choose(different); expect(f.applied).toHaveBeenLastCalledWith(different.filters);
    f.disabled.set(true); f.component.choose(different); expect(f.applied).toHaveBeenCalledTimes(2);
  });
  it('saves trimmed Arabic form names with canonical project scope and replaces only the accepted identity', async () => {
    const f = setup(), control = item({ id: 'retained-control', name: 'Other filter' }); f.component.all.set([control]); f.component.name.setValue('  مراجعة الفريق  ');
    f.filters.set({ query: 'مراجعة', projectIds: [projectB], blocked: false }); await f.component.save();
    const [id, body, reference] = f.save.mock.calls[0]!; expect(id).toMatch(/^[0-9a-f-]{36}$/); expect(reference).toMatch(/^[0-9a-f-]{36}$/);
    expect(body).toEqual({ expectedRevision: '0', name: 'مراجعة الفريق', filters: { query: 'مراجعة', projectIds: [projectA], blocked: false } });
    expect(f.component.items()).toHaveLength(2); expect(f.component.items().find(value => value.id === control.id)).toEqual(control); expect(f.component.pending()).toBeNull(); expect(f.component.name.value).toBe(''); expect(f.component.notice()).toBe('Personal quick filter saved.');
  });
  it('updates an existing active same-name identity using its exact large revision', async () => {
    const f = setup(), existing = item(); f.component.all.set([existing]); f.component.name.setValue(existing.name); f.filters.set({ query: 'my changed criteria' });
    await f.component.save(); expect(f.save.mock.calls[0]?.[0]).toBe(existing.id); expect(f.save.mock.calls[0]?.[1].expectedRevision).toBe('9007199254740993');
    expect(f.component.items()).toHaveLength(1); expect(f.component.items()[0]?.revision).toBe('9007199254740994'); expect(f.component.items()[0]?.filters.query).toBe('my changed criteria');
  });
  it('does not resurrect a removed or foreign same-name record when creating a fresh personal choice', async () => {
    const f = setup(), removed = item({ removed: true }), foreign = item({ id: 'foreign', filters: { projectIds: [projectB] } }); f.component.all.set([removed, foreign]); f.component.name.setValue(removed.name);
    await f.component.save(); expect(f.save.mock.calls[0]?.[0]).not.toBe(removed.id); expect(f.save.mock.calls[0]?.[0]).not.toBe(foreign.id); expect(f.save.mock.calls[0]?.[1].expectedRevision).toBe('0');
    expect(f.component.all().find(value => value.id === removed.id)?.removed).toBe(true); expect(f.component.all().find(value => value.id === foreign.id)).toEqual(foreign);
  });
  it('blocks empty, oversized, whitespace-only and disabled saves without sending a mutation', async () => {
    const f = setup(); await f.component.save(); f.component.name.setValue('ع'.repeat(81)); expect(f.component.name.invalid).toBe(true); await f.component.save();
    f.component.name.setValue('   '); await f.component.save(); expect(f.component.state.message()).toContain('1–80');
    f.component.name.setValue('Valid name'); f.disabled.set(true); await f.component.save(); await f.component.send(); await f.component.remove(item()); expect(f.save).not.toHaveBeenCalled();
  });
  it('retains uncertain command bytes and retry reference even when the parent board criteria change', async () => {
    const f = setup(), unavailable = failure('temporarily_unavailable'); f.save.mockRejectedValueOnce(unavailable); f.component.name.setValue('Frozen filter');
    await f.component.save(); expect(f.component.state.failure()).toBe(unavailable); expect(f.component.pending()).not.toBeNull(); const first = structuredClone(f.save.mock.calls[0]!);
    f.filters.set({ query: 'New parent criteria' }); await f.component.save(); await f.component.remove(item()); expect(f.save).toHaveBeenCalledOnce();
    await f.component.send(); expect(f.save.mock.calls[1]).toEqual(first); expect(f.component.pending()).toBeNull(); expect(f.component.items()[0]?.filters.query).toBe('review');
    f.component.name.setValue('Another change'); await f.component.save(); expect(f.save.mock.calls[2]?.[2]).not.toBe(first[2]);
  });
  it('requires explicit review before rebasing a rejected draft onto fresh server state', async () => {
    const f = setup(), prior = item(), latest = item({ revision: '9007199254740997', name: 'Server renamed', filters: { projectIds: [projectA], query: 'server criteria' } });
    f.component.all.set([prior]); f.component.name.setValue(prior.name); f.filters.set({ query: 'my draft criteria' }); f.save.mockRejectedValueOnce(failure('conflict')); await f.component.save();
    const original = structuredClone(f.save.mock.calls[0]!); f.read.mockResolvedValueOnce({ items: [latest] }); await f.component.review();
    expect(f.save).toHaveBeenCalledOnce(); expect(f.component.reviewed()).toBe(true); expect(f.component.reviewing()).toBe(false); expect(f.component.state.failure()).toBeNull();
    expect(f.component.pending()?.body).toEqual({ ...original[1], expectedRevision: latest.revision }); expect(f.component.all()).toEqual([latest]);
    await f.component.send(); expect(f.save.mock.calls[1]?.[0]).toBe(original[0]); expect(f.save.mock.calls[1]?.[1]).toEqual({ ...original[1], expectedRevision: latest.revision }); expect(f.save.mock.calls[1]?.[2]).not.toBe(original[2]);
    expect(f.component.items()[0]?.name).toBe(prior.name); expect(f.component.items()[0]?.filters.query).toBe('my draft criteria');
  });
  it('review of an uncommitted new choice keeps its new identity and explicit zero revision', async () => {
    const f = setup(); f.component.name.setValue('New choice'); f.save.mockRejectedValueOnce(new Error('Connection lost before acknowledgement')); await f.component.save(); const original = structuredClone(f.save.mock.calls[0]!);
    f.read.mockResolvedValueOnce({ items: [] }); await f.component.review(); expect(f.component.pending()?.id).toBe(original[0]); expect(f.component.pending()?.body.expectedRevision).toBe('0'); expect(f.component.reviewed()).toBe(true);
    await f.component.send(); expect(f.save.mock.calls[1]?.[1]).toEqual(original[1]); expect(f.save.mock.calls[1]?.[2]).not.toBe(original[2]);
  });
  it('failed review preserves the original command and safe actionable failure instead of applying automatically', async () => {
    const f = setup(), unavailable = failure('temporarily_unavailable'); f.component.name.setValue('Retry me'); f.save.mockRejectedValueOnce(unavailable); await f.component.save(); const original = structuredClone(f.save.mock.calls[0]!);
    f.read.mockRejectedValueOnce(new Error('Private upstream diagnostics')); await f.component.review();
    expect(f.component.pending()?.body).toEqual(original[1]); expect(f.component.reviewed()).toBe(false); expect(f.component.reviewing()).toBe(false); expect(f.component.state.failure()).toBe(unavailable);
    expect(f.component.notice()).toBe('The latest quick filters could not be loaded. Retry review.'); expect(f.component.notice()).not.toContain('Private'); expect(f.save).toHaveBeenCalledOnce();
    await f.component.send(); expect(f.save.mock.calls[1]).toEqual(original);
  });
  it('coalesces review and blocks discard/review/new mutations while a save is in flight', async () => {
    const f = setup(), pending = deferred<SavedSavedSearch>(); f.component.name.setValue('Pending work'); f.save.mockReturnValueOnce(pending.promise); const saving = f.component.save(); const intent = f.component.pending();
    f.component.discard(); await f.component.review(); await f.component.save(); await f.component.remove(item()); expect(f.component.pending()).toBe(intent); expect(f.read).not.toHaveBeenCalled(); expect(f.save).toHaveBeenCalledOnce();
    pending.reject(failure('conflict')); await saving; const reading = deferred<SavedSearchList>(); f.read.mockReturnValueOnce(reading.promise); const first = f.component.review(); await f.component.review(); expect(f.read).toHaveBeenCalledOnce();
    reading.resolve({ items: [] }); await first; expect(f.component.reviewing()).toBe(false);
  });
  it('discard after rejection clears only the pending change and refreshes current personal choices', async () => {
    const f = setup(); f.component.name.setValue('Discard me'); f.save.mockRejectedValueOnce(failure('forbidden')); await f.component.save(); const control = item({ id: 'current-server-filter' }); f.read.mockResolvedValueOnce({ items: [control] });
    f.component.discard(); await settle(); expect(f.component.pending()).toBeNull(); expect(f.component.reviewed()).toBe(false); expect(f.component.state.failure()).toBeNull(); expect(f.component.notice()).toBe('Filter change discarded.'); expect(f.component.items()).toEqual([control]);
  });
  it('removes only the requested accepted identity and keeps other active filters unchanged', async () => {
    const f = setup(), requested = item(), control = item({ id: 'control', name: 'Other personal filter' }); f.component.all.set([requested, control]); await f.component.remove(requested);
    expect(f.save.mock.calls[0]?.[1]).toEqual({ name: requested.name, filters: requested.filters, expectedRevision: requested.revision, removed: true });
    expect(f.component.items()).toEqual([control]); expect(f.component.all().find(value => value.id === requested.id)?.removed).toBe(true); expect(f.component.notice()).toBe('Personal quick filter removed.');
  });
  it('preserves denied removals for safe retry and never sends them while disabled', async () => {
    const f = setup(), requested = item(), denied = failure('forbidden'); f.component.all.set([requested]); f.save.mockRejectedValueOnce(denied); await f.component.remove(requested);
    const original = structuredClone(f.save.mock.calls[0]!); expect(f.component.pending()?.body.removed).toBe(true); expect(f.component.items()).toEqual([requested]); expect(f.component.state.failure()).toBe(denied);
    f.disabled.set(true); await f.component.send(); expect(f.save).toHaveBeenCalledOnce(); f.disabled.set(false); await f.component.send(); expect(f.save.mock.calls[1]).toEqual(original); expect(f.component.items()).toEqual([]);
  });
  it.each(['project', 'epoch', 'destroy'] as const)('does not publish a late accepted save after %s ownership is lost', async change => {
    const f = setup(), pending = deferred<SavedSavedSearch>(); f.component.name.setValue('Old-context name'); f.save.mockReturnValueOnce(pending.promise); const saving = f.component.save(); const [id, body] = f.save.mock.calls[0]!;
    if (change === 'project') { f.project.set(projectB); f.contextChanged(); } else if (change === 'epoch') { f.epoch.set(2); f.contextChanged(); } else f.destroy();
    pending.resolve(accepted(item({ id, name: body.name, filters: body.filters }))); await saving; await settle();
    expect(f.component.all()).toEqual([]); expect(f.component.notice()).toBe(''); if (change !== 'destroy') { expect(f.component.pending()).toBeNull(); expect(f.component.name.value).toBe(''); }
  });
  it.each(['project', 'epoch'] as const)('rejects a late save immediately after %s changes, before reactive cleanup is delivered', async change => {
    const f = setup(), pending = deferred<SavedSavedSearch>(); f.component.name.setValue('Old owner command'); f.save.mockReturnValueOnce(pending.promise); const saving = f.component.save(); const [id, body] = f.save.mock.calls[0]!;
    if (change === 'project') f.project.set(projectB); else f.epoch.set(2);
    pending.resolve(accepted(item({ id, name: body.name, filters: body.filters }))); await saving;
    expect(f.component.all()).toEqual([]); expect(f.component.notice()).toBe('');
    f.contextChanged(); await settle(); expect(f.component.pending()).toBeNull(); expect(f.component.name.value).toBe('');
  });
  it('does not publish a private late read failure before account-change cleanup runs', async () => {
    const f = setup(), delayed = deferred<SavedSearchList>(); f.read.mockReturnValueOnce(delayed.promise); const loading = f.component.load(); f.epoch.set(2); delayed.reject(new Error('Old private service failure')); await loading;
    expect(f.component.loadState.message()).toBe(''); expect(f.component.all()).toEqual([]);
    f.contextChanged(); await settle(); expect(f.component.loadState.busy()).toBe(false); expect(f.component.loadState.message()).toBe('');
  });
  it('a superseded project round trip cannot overwrite newer data or release a current read', async () => {
    const f = setup(), old = deferred<SavedSearchList>(), latest = deferred<SavedSearchList>(); f.read.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ items: [] }).mockReturnValueOnce(latest.promise);
    const first = f.component.load(); f.project.set(projectB); f.contextChanged(); f.project.set(projectA); f.contextChanged(); old.resolve({ items: [item({ name: 'Old read' })] }); await first;
    expect(f.component.all()).toEqual([]); expect(f.component.loadState.busy()).toBe(true);
    const current = item({ name: 'Fresh read' }); latest.resolve({ items: [current] }); await settle(); expect(f.component.all()).toEqual([current]); expect(f.component.loadState.busy()).toBe(false);
  });
  it('a context change cancels a late review result and starts with no previous account draft', async () => {
    const f = setup(), review = deferred<SavedSearchList>(); f.component.name.setValue('Previous draft'); f.save.mockRejectedValueOnce(failure('conflict')); await f.component.save(); f.read.mockReturnValueOnce(review.promise);
    const reading = f.component.review(); f.epoch.set(2); f.contextChanged(); review.resolve({ items: [item({ name: 'Old private choice' })] }); await reading; await settle();
    expect(f.component.all()).toEqual([]); expect(f.component.pending()).toBeNull(); expect(f.component.reviewing()).toBe(false); expect(f.component.reviewed()).toBe(false); expect(f.component.notice()).toBe(''); expect(f.component.name.value).toBe('');
  });
  it('ignores stale queued retry/review actions after an accepted command clears its controls', async () => {
    const f = setup(); f.component.name.setValue('One accepted change'); f.save.mockRejectedValueOnce(failure('temporarily_unavailable')); await f.component.save(); await f.component.send();
    expect(f.component.pending()).toBeNull(); await f.component.review(); await f.component.send(); expect(f.save).toHaveBeenCalledTimes(2); expect(f.read).not.toHaveBeenCalled(); expect(f.component.notice()).toBe('Personal quick filter saved.');
  });
  it('late rejected review cannot put an old private error into the next account context', async () => {
    const f = setup(), delayed = deferred<SavedSearchList>(); f.component.name.setValue('Old rejected draft'); f.save.mockRejectedValueOnce(failure('conflict')); await f.component.save(); f.read.mockReturnValueOnce(delayed.promise); const reading = f.component.review();
    f.epoch.set(2); f.contextChanged(); delayed.reject(new Error('Old private review error')); await reading; await settle();
    expect(f.component.notice()).toBe(''); expect(f.component.state.failure()).toBeNull(); expect(f.component.pending()).toBeNull(); expect(f.component.reviewing()).toBe(false); expect(f.component.all()).toEqual([]);
  });
  it('restores manager keyboard focus on close and safely tolerates an already removed summary', () => {
    const f = setup(), focus = vi.fn(), manager = { open: true, querySelector: vi.fn().mockReturnValue({ focus }) }, event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    f.component.closeManager(manager as unknown as HTMLDetailsElement, event as unknown as Event); expect(manager.open).toBe(false); expect(focus).toHaveBeenCalledOnce(); expect(event.preventDefault).toHaveBeenCalledOnce(); expect(event.stopPropagation).toHaveBeenCalledOnce();
    manager.querySelector.mockReturnValue(null); expect(() => f.component.closeManager(manager as unknown as HTMLDetailsElement)).not.toThrow();
  });
});
