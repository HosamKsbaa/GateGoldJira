import { describe, expect, it } from 'vitest';
import { createClient } from './fixture-generated/client';
import { contractFixture } from './fixture-generated/sdk.gen';
import type { Fixture } from './fixture-generated/types.gen';
import { zFixture } from './fixture-generated/zod.gen';

const fixture: Fixture = {
  id: 'c72bdca7-d7a1-45e4-9454-d95013c1a4be',
  title: 'مراجعة العمل — GateGold',
  status: 'review',
  dueDate: '2026-10-12',
  assigneeId: null,
  revision: '9007199254740993',
};

describe('generated contract boundaries', () => {
  it('preserves Arabic, explicit null, date strings and exact revisions', () => {
    expect(zFixture.parse(fixture)).toEqual(fixture);
    expect(zFixture.parse({ ...fixture, dueDate: null }).dueDate).toBeNull();
  });

  it('accepts additive response properties', () => {
    expect(zFixture.parse({ ...fixture, futureField: 'compatible' })).toEqual(fixture);
  });

  it.each([
    { ...fixture, revision: 9007199254740993 },
    { ...fixture, revision: '0' },
    { ...fixture, status: 'Blocked' },
    { ...fixture, dueDate: '2026-02-30' },
    { ...fixture, id: 'not-a-uuid' },
    { ...fixture, title: null },
    { ...fixture, assigneeId: undefined },
  ])('rejects malformed external values', (external: unknown) => {
    expect(zFixture.safeParse(external).success).toBe(false);
  });

  it('validates actual fetch SDK responses', async () => {
    const client = createClient({
      baseUrl: 'http://contract.test',
      fetch: async () => Response.json({ ...fixture, futureField: true }),
    });
    const result = await contractFixture({ client, body: fixture, throwOnError: true });
    expect(result.data?.title).toBe(fixture.title);
    expect(result.data?.revision).toBe(fixture.revision);
  });

  it('rejects invalid response shapes through the fetch SDK', async () => {
    const client = createClient({
      baseUrl: 'http://contract.test',
      fetch: async () => Response.json({ ...fixture, revision: 42 }),
    });
    await expect(contractFixture({ client, body: fixture, throwOnError: true })).rejects.toThrow();
  });

  it('rejects invalid response JSON through the fetch SDK', async () => {
    const client = createClient({
      baseUrl: 'http://contract.test',
      fetch: async () =>
        new Response('{broken', { headers: { 'Content-Type': 'application/json' } }),
    });
    await expect(contractFixture({ client, body: fixture, throwOnError: true })).rejects.toThrow();
  });
});
