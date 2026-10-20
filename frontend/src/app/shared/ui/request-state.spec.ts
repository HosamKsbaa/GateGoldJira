import { expect, it } from 'vitest';
import { RequestState } from './request-state';
import { ApiError } from '../../core/api/api-result';

it('does not publish a previous identity or route failure into a newer request state', async () => {
  const state = new RequestState();
  let generation = 1;
  let fail: (error: Error) => void = () => {
    throw new Error('Deferred request was not initialized.');
  };
  const request = new Promise<void>((_, reject) => {
    fail = reject;
  });
  const previous = state.run(
    () => request,
    () => generation === 1,
  );
  expect(state.busy()).toBe(true);
  generation = 2;
  state.clear();
  state.busy.set(true);
  fail(
    new ApiError(
      {
        error: {
          code: 'conflict',
          message: 'A prior issue changed.',
          fieldErrors: [],
          retryable: false,
          nextAction: 'reload_current_state',
        },
        current: { title: 'Previous account data' },
        unfinished: null,
      },
      409,
    ),
  );
  await previous;
  expect(state.message()).toBe('');
  expect(state.failure()).toBeNull();
  expect(state.busy()).toBe(true);
});
