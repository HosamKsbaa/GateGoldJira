import { describe, expect, it, vi } from 'vitest';
import { RequestState } from './request-state';
import { ApiError } from '../../core/api/api-result';

describe('request state ownership and recovery', () => {
  it('ignores duplicate submissions and stale starts without clearing an existing failure', async () => {
    const state = new RequestState();
    state.message.set('Keep this message');
    const action = vi.fn(async () => undefined);
    await state.run(action, () => false);
    expect(action).not.toHaveBeenCalled();
    expect(state.message()).toBe('Keep this message');
    state.busy.set(true);
    await state.run(action);
    expect(action).not.toHaveBeenCalled();
    expect(state.busy()).toBe(true);
    expect(state.message()).toBe('Keep this message');
  });

  it('publishes typed actionable errors, clears them on retry, and releases the accepted request', async () => {
    const state = new RequestState();
    const failure = new ApiError({
      error: { code: 'conflict', message: 'Reload the current issue.', fieldErrors: [], retryable: false, nextAction: 'reload_current_state' },
      current: { revision: '2' }, unfinished: null,
    }, 409);
    await state.run(async () => { throw failure; });
    expect(state.failure()).toBe(failure);
    expect(state.message()).toBe(failure.message);
    expect(state.busy()).toBe(false);
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const retry = state.run(() => pending);
    expect(state.failure()).toBeNull();
    expect(state.message()).toBe('');
    expect(state.busy()).toBe(true);
    release();
    await retry;
    expect(state.busy()).toBe(false);
  });

  it('hides unknown exception details behind a useful retry message', async () => {
    const state = new RequestState();
    await state.run(async () => { throw new Error('Private transport diagnostic'); });
    expect(state.failure()).toBeNull();
    expect(state.message()).toBe('The request could not be completed. Check your connection and try again.');
    expect(state.message()).not.toContain('Private');
    expect(state.busy()).toBe(false);
  });

  it('cannot release a newer route request when earlier work succeeds late', async () => {
    const state = new RequestState();
    let current = true;
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const previous = state.run(() => pending, () => current);
    current = false;
    state.message.set('New route request');
    release();
    await previous;
    expect(state.busy()).toBe(true);
    expect(state.message()).toBe('New route request');
  });
});
