import { describe, expect, it, vi } from 'vitest';
import { approveUser, patchIssueField } from '../../api/generated/sdk.gen';
import { zIssueEditable } from '../../api/generated/zod.gen';
import { createApiClient } from './client';

describe('generated mutation request integration', () => {
  it('counts Unicode characters consistently with Go and PostgreSQL', () => {
    const fields = {
      title: '😀'.repeat(200),
      description: 'وصف عربي',
      type: 'task',
      priority: 'medium',
      assigneeId: null,
      dueDate: null,
      labelIds: [],
    };
    expect(zIssueEditable.safeParse(fields).success).toBe(true);
    expect(zIssueEditable.safeParse({ ...fields, title: '😀'.repeat(201) }).success).toBe(false);
  });
  it('validates generated bodies and sends the UUID header as real Fetch Headers', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    const user = {
      id,
      email: 'new@example.test',
      displayName: 'مطور 😀',
      active: true,
      approved: true,
      administrator: false,
      revision: '1',
      createdAt: '2026-10-12T00:00:00Z',
      updatedAt: '2026-10-12T00:00:00Z',
    };
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(
        Response.json({ result: user, receipt: { eventId: id, replayed: false } }, { status: 201 }),
      );
    const client = createApiClient({ baseUrl: 'http://fixture.test', auth: 'access-token', fetch });
    const result = await approveUser({
      client,
      body: { email: user.email, displayName: user.displayName, administrator: false },
      headers: { 'Idempotency-Key': id },
    });
    expect(result.error).toBeUndefined();
    expect(result.data?.result.id).toBe(id);
    expect(fetch).toHaveBeenCalledOnce();
    const request = fetch.mock.calls[0]?.[0];
    expect(request instanceof Request ? request.headers.get('Idempotency-Key') : null).toBe(id);
    expect(request instanceof Request ? request.headers.get('Authorization') : null).toBe(
      'Bearer access-token',
    );
  });
  it('rejects invalid retry references before sending the request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = createApiClient({ baseUrl: 'http://fixture.test', fetch });
    const result = await approveUser({
      client,
      body: { email: 'new@example.test', displayName: 'New', administrator: false },
      headers: { 'Idempotency-Key': 'not-a-uuid' },
    });
    expect(result.data).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('validates PATCH headers and sends only the selected field', async () => {
    const id = '10000000-0000-4000-8000-000000000001';
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValue(new Error('Fixture network unavailable'));
    const client = createApiClient({ baseUrl: 'http://fixture.test', fetch });
    const body = { field: 'priority', priority: { prior: 'medium', value: 'high' } } as const;
    await patchIssueField({
      client,
      path: { issueId: id },
      body,
      headers: { 'Idempotency-Key': id },
    });
    expect(fetch).toHaveBeenCalledOnce();
    const request = fetch.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    if (!(request instanceof Request)) throw new Error('Expected a Fetch request');
    expect(request.method).toBe('PATCH');
    expect(request.headers.get('Idempotency-Key')).toBe(id);
    expect(await request.clone().json()).toEqual(body);
    await patchIssueField({
      client,
      path: { issueId: id },
      body,
      headers: { 'Idempotency-Key': 'invalid' },
    });
    expect(fetch).toHaveBeenCalledOnce();
  });
});
