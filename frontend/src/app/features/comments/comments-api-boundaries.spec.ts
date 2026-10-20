import '@angular/compiler';
import { Injector } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { CommentsApi } from './comments.api';
import { AuthService } from '../../core/auth/auth.service';
import { createApiClient } from '../../core/api/client';
import { ApiError } from '../../core/api/api-result';
import type { CommentBody, CommentView, SavedCommentView } from '../../api/generated/types.gen';

const issueId = '50000000-0000-4000-8000-000000000001';
const commentId = '60000000-0000-4000-8000-000000000001';
const memberId = '10000000-0000-4000-8000-000000000002';
const pictureId = '70000000-0000-4000-8000-000000000001';
const attachmentId = '90000000-0000-4000-8000-000000000001';
const retryReference = '80000000-0000-4000-8000-000000000001';
const body: CommentBody = {
  html: '<p dir="rtl">مراجعة الفريق</p>', pictureIds: [pictureId],
  mentionUserIds: [memberId], attachmentIds: [attachmentId],
};
const comment: CommentView = {
  id: commentId, issueId, author: { id: memberId, displayName: 'مطور الفريق' },
  canEdit: true, createdAt: '2026-10-20T00:00:00Z', editedAt: null,
  revision: '9007199254740993', safeHtml: body.html, plainText: 'مراجعة الفريق',
  pictureIds: [pictureId], mentions: [], attachmentIds: [attachmentId], sanitationNotices: [],
};
const saved: SavedCommentView = { result: comment, receipt: { eventId: null, replayed: false } };
function api(fetch: typeof globalThis.fetch) {
  const client = createApiClient({ baseUrl: 'https://private.example.test', fetch });
  return Injector.create({ providers: [
    { provide: AuthService, useValue: { client } },
    { provide: CommentsApi, useFactory: () => new CommentsApi() },
  ] }).get(CommentsApi);
}
function requestAt(fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>) {
  const request = fetch.mock.calls[0]?.[0];
  expect(request).toBeInstanceOf(Request);
  if (!(request instanceof Request)) throw new Error('Expected generated Fetch Request.');
  return request;
}

describe('comment and mention generated transport boundaries', () => {
  for (const kind of ['discussion', 'versions', 'mentions'] as const) {
    it.each([undefined, '', 'opaque-comment-cursor'])('keeps '+kind+' pagination scoped and bounded for cursor %s', async cursor => {
      const page = { items: [], nextCursor: null, totalMatching: 0 };
      const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(page));
      const service = api(fetch);
      const result = kind === 'discussion' ? await service.list(issueId, cursor)
        : kind === 'versions' ? await service.versions(commentId, cursor)
        : await service.mentionCandidates(issueId, 'اسم عربي & الفريق', cursor);
      expect(result).toEqual(page);
      const request = requestAt(fetch), url = new URL(request.url);
      expect(request.method).toBe('GET'); expect(url.searchParams.get('limit')).toBe('25');
      expect(url.searchParams.get('cursor')).toBe(cursor || null);
      expect(url.pathname).toBe(kind === 'discussion' ? `/api/v1/issues/${issueId}/comments`
        : kind === 'versions' ? `/api/v1/comments/${commentId}/versions`
        : `/api/v1/projects/${issueId}/mention-candidates`);
      if (kind === 'mentions') expect(url.searchParams.get('query')).toBe('اسم عربي & الفريق');
      else expect(url.searchParams.has('query')).toBe(false);
      expect(fetch).toHaveBeenCalledOnce();
    });
  }

  it.each(['create', 'update'] as const)('preserves protected references and exact retry identity for %s', async operation => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(saved, { status: operation === 'create' ? 201 : 200 }));
    const service = api(fetch), result = operation === 'create'
      ? await service.create(issueId, body, retryReference)
      : await service.update(commentId, comment.revision, body, retryReference);
    expect(result).toEqual(saved);
    const request = requestAt(fetch);
    expect(request.method).toBe(operation === 'create' ? 'POST' : 'PUT');
    expect(new URL(request.url).pathname).toBe(operation === 'create' ? `/api/v1/issues/${issueId}/comments` : `/api/v1/comments/${commentId}`);
    expect(request.headers.get('Idempotency-Key')).toBe(retryReference);
    expect(await request.json()).toEqual(operation === 'create' ? { body } : { body, expectedRevision: '9007199254740993' });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('retains a real conflict snapshot and exact revision for explicit caller review', async () => {
    const payload = { error: { code: 'conflict', message: 'Review the current comment.', fieldErrors: [], retryable: false, nextAction: 'reload_current_state' }, current: comment, unfinished: null };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(payload, { status: 409 }));
    const result = api(fetch).update(commentId, '1', body, retryReference);
    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({ status: 409, payload });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('cancels an outstanding mention request through its actual Request signal', async () => {
    let started!: () => void;
    const dispatched = new Promise<void>(resolve => { started = resolve; });
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async input => {
      if (!(input instanceof Request)) throw new Error('Expected Fetch Request.');
      const pending = new Promise<never>((_, reject) => input.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true }));
      started(); return pending;
    });
    const scope = new AbortController(), result = api(fetch).mentionCandidates(issueId, 'private old query', undefined, scope.signal);
    await dispatched; const request = requestAt(fetch); expect(request.signal.aborted).toBe(false);
    scope.abort(); expect(request.signal.aborted).toBe(true);
    await expect(result).rejects.toThrow('The service could not complete this request. Try again.');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([
    { label: 'unbound mention identity', body: { ...body, mentionUserIds: ['not-an-identity'] } },
    { label: 'excess picture references', body: { ...body, pictureIds: Array.from({ length: 6 }, () => pictureId) } },
    { label: 'excess attachment references', body: { ...body, attachmentIds: Array.from({ length: 21 }, () => attachmentId) } },
    { label: 'oversized HTML source', body: { ...body, html: 'x'.repeat(65537) } },
  ])('rejects $label before dispatching a mutation', async candidate => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(api(fetch).create(issueId, candidate.body, retryReference)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a missing mutation retry reference before any HTTP request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(api(fetch).update(commentId, comment.revision, body, '')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not expose an untyped server error as trusted comment or teammate content', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json({ error: '<script>untrusted diagnostic</script>' }, { status: 503 }));
    await expect(api(fetch).list(issueId)).rejects.toThrow('The service could not complete this request. Try again.');
    expect(fetch).toHaveBeenCalledOnce();
  });
});
