import '@angular/compiler';
import { provideZonelessChangeDetection, RendererFactory2, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRouteSnapshot, Router, UrlTree, type RouterStateSnapshot } from '@angular/router';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceApi } from './workspace-api.service';
import { AuthService } from '../auth/auth.service';
import { projectAdminGuard } from '../auth/auth.guards';
import { createApiClient } from '../api/client';
import { ApiError } from '../api/api-result';
import type { Me } from '../../api/generated/types.gen';

// Real Angular effects and generated SDK validation, with Fetch as the unit port.
// These units make no browser or live-service use-case coverage claims.
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
const member: Me = { userId: '10000000-0000-4000-8000-000000000002', displayName: 'Member', email: 'member@example.test', administrator: false, companyTimeZone: 'Africa/Cairo' };
const replacement: Me = { ...member, userId: '10000000-0000-4000-8000-000000000003', displayName: 'Replacement', email: 'replacement@example.test' };
const summary = (unreadCount: number) => Response.json({ companyToday: '2026-10-20', unreadCount });
const unavailable = () => Response.json({ error: { code: 'temporarily_unavailable', message: 'Summary unavailable.', fieldErrors: [], retryable: true, nextAction: 'none' }, current: null, unfinished: null }, { status: 503 });
function deferredResponse() {
  let resolve!: (value: Response) => void;
  return { promise: new Promise<Response>(finish => { resolve = finish; }), resolve: (value: Response) => resolve(value) };
}

describe('workspace reads keep ownership across identity changes and cancellation', () => {
  const me = signal<Me | null>(null), epoch = signal(0);
  const fetch = vi.fn<typeof globalThis.fetch>();
  const createUrlTree = vi.fn<Router['createUrlTree']>();
  const refresh = vi.fn<() => Promise<Me | null>>();
  let api: WorkspaceApi;

  beforeEach(() => {
    me.set(null); epoch.set(0); fetch.mockReset(); createUrlTree.mockReset(); refresh.mockReset();
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'hidden' }));
    vi.stubGlobal('window', Object.assign(new EventTarget(), { location: { origin: 'http://localhost:4200' } }));
    vi.stubGlobal('navigator', { onLine: true });
    TestBed.configureTestingModule({ providers: [
      provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { me, sessionEpoch: epoch, refresh, client: createApiClient({ baseUrl: 'http://localhost:21080', fetch }) } satisfies Pick<AuthService, 'me' | 'sessionEpoch' | 'refresh' | 'client'> },
      { provide: Router, useValue: { createUrlTree } },
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('This service unit must not render a component.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
    ] });
    api = TestBed.inject(WorkspaceApi); TestBed.tick();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  async function enter(user: Me, count: number) {
    fetch.mockResolvedValueOnce(summary(count));
    me.set(user); epoch.update(value => value + 1); TestBed.tick();
    await vi.waitFor(() => expect(api.unreadCount()).toBe(count));
  }

  it('makes no unsigned private read and loads the current badge only after an identity is installed', async () => {
    expect(api.unreadCount()).toBeNull(); expect(fetch).not.toHaveBeenCalled();
    await enter(member, 7);
    expect(fetch).toHaveBeenCalledTimes(1);
    const request = fetch.mock.calls[0]![0]; expect(request).toBeInstanceOf(Request);
    expect((request as Request).url).toBe('http://localhost:21080/api/v1/notifications/summary');
    expect((request as Request).method).toBe('GET');
  });

  it('contains an automatic summary failure and retries foreground work only after sign-in', async () => {
    const documentState = document as unknown as EventTarget & { visibilityState: string };
    documentState.visibilityState = 'visible'; window.dispatchEvent(new Event('online'));
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValueOnce(unavailable());
    me.set(member); epoch.update(value => value + 1); TestBed.tick();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    // Drain the actual promise chain, including the constructor's containment,
    // before triggering a distinct foreground retry. No clock delay determines success.
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(api.unreadCount()).toBeNull(); expect(me()).toEqual(member);
    fetch.mockResolvedValueOnce(summary(4)); window.dispatchEvent(new Event('online'));
    await vi.waitFor(() => expect(api.unreadCount()).toBe(4));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  for (const outcome of ['success', 'failure'] as const) it('ignores an old account summary ' + outcome + ' after replacement account content has loaded', async () => {
    await enter(member, 7);
    const old = deferredResponse(); fetch.mockReturnValueOnce(old.promise);
    const previous = api.refreshSummary().then(value => ({ value }), error => ({ error }));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await enter(replacement, 3);
    old.resolve(outcome === 'success' ? summary(99) : unavailable());
    const result = await previous;
    if (outcome === 'success') expect(result).toEqual({ value: { companyToday: '2026-10-20', unreadCount: 99 } });
    else { expect('error' in result && result.error).toBeInstanceOf(ApiError); }
    expect(api.unreadCount()).toBe(3);
  });

  it('does not restore a private badge when a read finishes after sign-out', async () => {
    await enter(member, 7);
    const old = deferredResponse(); fetch.mockReturnValueOnce(old.promise);
    const previous = api.refreshSummary();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    me.set(null); epoch.update(value => value + 1); TestBed.tick();
    expect(api.unreadCount()).toBeNull();
    old.resolve(summary(99)); await previous;
    expect(api.unreadCount()).toBeNull(); expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('clears an unconfirmed current badge, retains the typed failure and can recover on a later read', async () => {
    await enter(member, 7);
    fetch.mockResolvedValueOnce(unavailable());
    const failure: unknown = await api.refreshSummary().catch(error => error);
    expect(failure).toBeInstanceOf(ApiError);
    if (!(failure instanceof ApiError)) throw new Error('Expected the generated typed failure.');
    expect(failure.status).toBe(503); expect(failure.payload.error.code).toBe('temporarily_unavailable');
    expect(api.unreadCount()).toBeNull();
    fetch.mockResolvedValueOnce(summary(2));
    expect(await api.refreshSummary()).toEqual({ companyToday: '2026-10-20', unreadCount: 2 });
    expect(api.unreadCount()).toBe(2);
  });

  it('propagates native search cancellation and permits the replacement query with a fresh signal', async () => {
    fetch.mockImplementationOnce(input => {
      if (!(input instanceof Request)) throw new Error('The generated SDK must create the real Fetch request.');
      return new Promise<Response>((_resolve, reject) => {
        input.signal.addEventListener('abort', () => reject(new DOMException('The query was canceled.', 'AbortError')), { once: true });
      });
    });
    const controller = new AbortController();
    const previous = api.search('old query', controller.signal).catch((error: unknown) => error);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const request = fetch.mock.calls[0]![0];
    if (!(request instanceof Request)) throw new Error('A Fetch request is required.');
    expect(request.signal.aborted).toBe(false); controller.abort(); expect(request.signal.aborted).toBe(true);
    const failure = await previous;
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('The service could not complete this request. Try again.');
    const next = new AbortController(); fetch.mockResolvedValueOnce(Response.json({ items: [], nextCursor: null, totalMatching: 0 }));
    expect(await api.search('replacement query', next.signal)).toEqual({ items: [], nextCursor: null, totalMatching: 0 });
    const replacementRequest = fetch.mock.calls[1]![0];
    if (!(replacementRequest instanceof Request)) throw new Error('A replacement Fetch request is required.');
    expect(replacementRequest.signal.aborted).toBe(false);
    expect(await replacementRequest.json()).toEqual({ filters: { query: 'replacement query' }, page: { limit: 25 } });
    expect(api.unreadCount()).toBeNull();
  });

  it('fails a malformed project route closed at the generated UUID boundary without sending a private project request', async () => {
    await enter(member, 1); refresh.mockResolvedValue(member);
    const redirect = new UrlTree(); createUrlTree.mockReturnValue(redirect);
    const route = new ActivatedRouteSnapshot(); route.params = {};
    const state = { url: '/projects/missing/settings' } as RouterStateSnapshot;
    expect(await TestBed.runInInjectionContext(() => projectAdminGuard(route, state))).toBe(redirect);
    expect(createUrlTree).toHaveBeenCalledExactlyOnceWith(['/']);
    expect(refresh).toHaveBeenCalledTimes(1); expect(fetch).toHaveBeenCalledTimes(1);
    expect(api.unreadCount()).toBe(1);
  });
});
