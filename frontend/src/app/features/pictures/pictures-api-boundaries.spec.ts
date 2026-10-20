import '@angular/compiler';
import { Injector } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { PicturesApi } from './pictures.api';
import { AuthService } from '../../core/auth/auth.service';
import { createApiClient } from '../../core/api/client';
import { ApiError } from '../../core/api/api-result';

const pictureId = '70000000-0000-4000-8000-000000000001';
function api(fetch: typeof globalThis.fetch) {
  const client = createApiClient({ baseUrl: 'https://private.example.test', fetch });
  return Injector.create({ providers: [
    { provide: AuthService, useValue: { client } },
    { provide: PicturesApi, useFactory: () => new PicturesApi() },
  ] }).get(PicturesApi);
}

function requestAt(fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>) {
  const request = fetch.mock.calls[0]?.[0];
  expect(request).toBeInstanceOf(Request);
  if (!(request instanceof Request)) throw new Error('Expected the real generated Fetch request.');
  return request;
}

describe('private picture SDK transport boundary', () => {
  it.each([
    { cursor: undefined, ownDrafts: false },
    { cursor: '', ownDrafts: false },
    { cursor: 'opaque-owned-cursor', ownDrafts: true },
  ])('uses a bounded issue-scoped gallery query with explicit draft visibility $ownDrafts and cursor $cursor', async ({ cursor, ownDrafts }) => {
    const page = { items: [], nextCursor: null, totalMatching: 0 };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(page));
    const result = await api(fetch).list(pictureId, cursor, ownDrafts);
    expect(result).toEqual(page);
    const request = requestAt(fetch), url = new URL(request.url);
    expect(url.pathname).toBe('/api/v1/issues/' + pictureId + '/pictures');
    expect(url.searchParams.get('limit')).toBe('25');
    expect(url.searchParams.get('includeOwnDrafts')).toBe(String(ownDrafts));
    expect(url.searchParams.get('cursor')).toBe(cursor || null);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('returns private binary bytes as a Blob through the validated generated download request', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 255]);
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(bytes, {
      headers: { 'Content-Type': 'image/png' },
    }));
    const blob = await api(fetch).content(pictureId);
    expect(blob).toBeInstanceOf(Blob);
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([...bytes]);
    expect(blob.type).toBe('image/png');
    expect(fetch).toHaveBeenCalledOnce();
    const request = requestAt(fetch);
    expect(request.method).toBe('GET');
    expect(request.url).toBe('https://private.example.test/api/v1/pictures/' + pictureId + '/content');
  });

  it('preserves a typed authorization denial rather than treating JSON failure bytes as an image', async () => {
    const payload = { error: { code: 'unavailable_record', message: 'Picture unavailable.', fieldErrors: [], retryable: false, nextAction: 'none' }, current: null, unfinished: null };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(Response.json(payload, { status: 404 }));
    const outcome = api(fetch).content(pictureId);
    await expect(outcome).rejects.toBeInstanceOf(ApiError);
    await expect(outcome).rejects.toMatchObject({ status: 404, payload });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('propagates cancellation to the actual Fetch request without returning private content', async () => {
    let ready!: () => void;
    const dispatched = new Promise<void>(resolve => { ready = resolve; });
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async input => {
      if (!(input instanceof Request)) throw new Error('Expected Fetch Request.');
      const aborted = new Promise<never>((_, reject) => {
        input.signal.addEventListener('abort', () => reject(new DOMException('Request aborted', 'AbortError')), { once: true });
      });
      ready();
      return aborted;
    });
    const scope = new AbortController(), outcome = api(fetch).content(pictureId, scope.signal);
    await dispatched;
    const request = requestAt(fetch);
    expect(request.signal.aborted).toBe(false);
    scope.abort();
    expect(request.signal.aborted).toBe(true);
    await expect(outcome).rejects.toThrow('The service could not complete this request. Try again.');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('rejects a malformed picture identity before making any HTTP request', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    await expect(api(fetch).content('../private/other-object')).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
