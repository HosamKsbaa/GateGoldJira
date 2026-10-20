import { describe, expect, it } from 'vitest';
import { createClient } from './fixture-generated/client';
import { contractFixture } from './fixture-generated/sdk.gen';
import type { Fixture } from './fixture-generated/types.gen';

const request: Fixture = {
  id: 'c72bdca7-d7a1-45e4-9454-d95013c1a4be', title: 'اختبار', status: 'todo',
  revision: '1', dueDate: null, assigneeId: null,
};

describe('generated client failures', () => {
  it.each([401, 403, 409, 413, 503])('keeps HTTP %s as a failed request', async (status) => {
    const client = createClient({
      baseUrl: 'http://fixture.test',
      fetch: async () => Response.json({ detail: 'A safe failure.' }, { status }),
    });
    const result = await contractFixture({ client, body: request });
    expect(result.data).toBeUndefined();
    expect(result.response?.status).toBe(status);
    expect(result.error).toBeDefined();
  });

  it('rejects a success without required nullable fields', async () => {
    const client = createClient({
      baseUrl: 'http://fixture.test',
      fetch: async () => Response.json({ id: request.id, title: request.title, status: 'todo', revision: '1' }),
    });
    await expect(contractFixture({ client, body: request, throwOnError: true })).rejects.toThrow();
  });
});
