import { describe, expect, it } from 'vitest';
import { ApiError, readResult, RetryIntent } from './api-result';
import { zUserView } from '../../api/generated/zod.gen';

describe('typed API outcomes', () => {
  it('keeps actionable failures and safely rejects malformed failures', async () => {
    const error = {
      error: {
        code: 'conflict',
        message: 'Review current values.',
        fieldErrors: [],
        retryable: false,
        nextAction: 'reload_current_state',
      },
      current: null,
      unfinished: null,
    };
    await expect(
      readResult(Promise.resolve({ error, response: new Response('', { status: 409 }) })),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      readResult(Promise.resolve({ error: { sql: 'private database details' } })),
    ).rejects.toThrow('The service could not complete');
  });
  it('reuses a reference only for the same submitted intention', () => {
    const retry = new RetryIntent<{ name: string }>();
    const reference = retry.reference({ name: 'بوابة' });
    expect(retry.reference({ name: 'بوابة' })).toBe(reference);
    expect(retry.reference({ name: 'ذهب' })).not.toBe(reference);
    retry.finish();
    expect(retry.reference({ name: 'بوابة' })).not.toBe(reference);
  });
  it('counts non-BMP names in Unicode characters without losing revisions', () => {
    const input = {
      id: 'c72bdca7-d7a1-45e4-9454-d95013c1a4be',
      displayName: '😀'.repeat(100),
      email: 'employee@example.com',
      active: true,
      approved: true,
      administrator: false,
      revision: '9007199254740993',
      createdAt: '2026-10-12T00:00:00Z',
      updatedAt: '2026-10-12T00:00:00Z',
    };
    expect(zUserView.parse(input).revision).toBe(input.revision);
    expect(() => zUserView.parse({ ...input, displayName: '😀'.repeat(101) })).toThrow();
  });
});
