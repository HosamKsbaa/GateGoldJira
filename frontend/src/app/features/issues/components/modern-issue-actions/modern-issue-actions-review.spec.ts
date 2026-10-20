import '@angular/compiler';
import { computed, signal } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, RetryIntent } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import type { ModernIssueView } from '../../../../api/generated/types.gen';
import type { ModernIssuesApi } from '../../modern-issues.api';
import { ModernIssueActionsComponent } from './modern-issue-actions.component';
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
function issue(): ModernIssueView {
  return { summary: { id: 'issue', projectId: 'project', key: 'GG-1', number: '1', title: 'Current authoritative issue',
    type: { id: 'type', key: 'task', name: 'Task', behavior: 'standard', retired: false }, priority: { id: 'priority', key: 'medium', name: 'Medium', sortOrder: '3', retired: false },
    workflow: { id: 'flow', name: 'Delivery', revision: '1', retired: false }, stage: { id: 'stage', name: 'Ready', category: 'todo', position: '1', initial: true, acceptsEntries: true, retired: false },
    assignee: null, dueDate: null, overdue: false, labels: [], blocked: false, unfinishedBlockerCount: 0, parent: null, subtaskProgress: { done: 0, total: 0 }, revision: '2', archived: false, backlog: false, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' }, description: '', descriptionFormat: 'plain', graphRevision: '1', links: [], reporter: { id: 'owner', displayName: 'Owner' }, watching: false, capabilities: ['read','edit'] };
}
function setup() {
  const read = vi.fn<ModernIssuesApi['get']>(), emit = vi.fn<(issue: ModernIssueView) => void>(), id = signal('issue'), epoch = signal(1), destroyed = { destroyed: false };
  const state = new RequestState(), reviewState = new RequestState(), conflict = signal(true), disabled = signal(false), retry = new RetryIntent<object>();
  const rejected = new ApiError({ error: { code: 'conflict', message: 'Review the changed issue.', retryable: false, nextAction: 'reload_current_state', fieldErrors: [] }, current: { summary: { id: 'issue', revision: '2', type: 'task' } }, unfinished: null }, 409);
  state.failure.set(rejected);
  const component: ModernIssueActionsComponent = Object.create(ModernIssueActionsComponent.prototype);
  Object.assign(component, { state, reviewState, conflict, issueId: id, auth: { sessionEpoch: epoch }, modern: { get: read }, destroyed, changed: { emit }, retry, busy: computed(() => disabled() || state.busy() || reviewState.busy()) });
  return { component, read, emit, id, epoch, destroyed, state, reviewState, conflict, disabled, retry, rejected };
}
describe('explicit modern issue review after a legacy mutation conflict', () => {
  it('reads the authoritative modern issue and clears the failed intention only after successful review', async () => {
    const f = setup(), current = issue(), pending = deferred<ModernIssueView>(); f.read.mockReturnValue(pending.promise);
    const ref = f.retry.reference({ targetId: 'selected-candidate' });
    const reviewing = f.component.review();
    expect(f.read).toHaveBeenCalledExactlyOnceWith('issue'); expect(f.emit).not.toHaveBeenCalled(); expect(f.state.failure()).toBe(f.rejected); expect(f.reviewState.busy()).toBe(true);
    pending.resolve(current); await reviewing;
    expect(f.emit).toHaveBeenCalledExactlyOnceWith(current); expect(f.state.failure()).toBeNull(); expect(f.reviewState.busy()).toBe(false);
    expect(f.retry.reference({ targetId: 'selected-candidate' })).not.toBe(ref);
  });
  it('keeps the conflict and retry identity when the fresh read fails, then supports another explicit review', async () => {
    const f = setup(), reference = f.retry.reference({ targetId: 'selected-candidate' }); f.read.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(issue());
    await f.component.review();
    expect(f.emit).not.toHaveBeenCalled(); expect(f.state.failure()).toBe(f.rejected); expect(f.retry.reference({ targetId: 'selected-candidate' })).toBe(reference);
    expect(f.reviewState.message()).toBe('The request could not be completed. Check your connection and try again.'); expect(f.reviewState.busy()).toBe(false);
    await f.component.review(); expect(f.emit).toHaveBeenCalledTimes(1); expect(f.reviewState.message()).toBe(''); expect(f.state.failure()).toBeNull();
  });
  it.each(['issue','session','destroy'] as const)('cannot emit a held review after %s changes ownership', async owner => {
    const f = setup(), pending = deferred<ModernIssueView>(); f.read.mockReturnValue(pending.promise);
    const reviewing = f.component.review();
    if (owner === 'issue') f.id.set('different-issue');
    if (owner === 'session') f.epoch.set(2);
    if (owner === 'destroy') f.destroyed.destroyed = true;
    pending.resolve(issue()); await reviewing;
    expect(f.emit).not.toHaveBeenCalled(); expect(f.state.failure()).toBe(f.rejected);
  });
  it('does not launch a duplicate review or a review without a current actionable conflict', async () => {
    const f = setup(), pending = deferred<ModernIssueView>(); f.conflict.set(false); await f.component.review(); expect(f.read).not.toHaveBeenCalled();
    f.conflict.set(true); f.disabled.set(true); await f.component.review(); expect(f.read).not.toHaveBeenCalled();
    f.disabled.set(false); f.read.mockReturnValue(pending.promise); const reviewing = f.component.review(); await f.component.review(); expect(f.read).toHaveBeenCalledTimes(1);
    pending.resolve(issue()); await reviewing; expect(f.emit).toHaveBeenCalledTimes(1);
  });
});
