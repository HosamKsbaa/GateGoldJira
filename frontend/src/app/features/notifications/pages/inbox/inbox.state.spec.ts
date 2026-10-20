// Public Angular model/effect units with typed transport/router ports. These
// assertions do not claim rendered notification controls or browser acceptance.
import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, provideZonelessChangeDetection, RendererFactory2, runInInjectionContext, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router } from '@angular/router';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Me, NotificationView } from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { NotificationsApi } from '../../notifications.api';
import { InboxPage } from './inbox.page';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
const person: Me = { userId: 'member', displayName: 'Member', email: 'member@example.test', administrator: false, companyTimeZone: 'Africa/Cairo' };
const receipt = { eventId: null, replayed: false };
function notification(id = 'first', changes: Partial<NotificationView> = {}): NotificationView {
  return { id, issueId: 'issue-' + id, issueKey: 'GG-1', projectId: 'project', actor: { id: 'colleague', displayName: 'زميل الفريق' }, createdAt: '2026-10-20T00:00:00Z', readAt: null, reasons: ['mention'], revision: '2', summary: 'مراجعة العمل', ...changes };
}
function page(items = [notification()], nextCursor: string | null = null) { return { items, nextCursor, totalMatching: items.length }; }
function failure() { return new ApiError({ error: { code: 'temporarily_unavailable', message: 'Inbox change could not be confirmed.', retryable: true, nextAction: 'none', fieldErrors: [] }, current: null, unfinished: null }, 503); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve: (value: T) => resolve(value), reject: (error: unknown) => reject(error) }; }

describe('Inbox public pending changes and owned refreshes', () => {
  const me = signal<Me | null>(person), epoch = signal(1), unreadCount = signal<number | null>(1);
  const list = vi.fn<NotificationsApi['list']>(), get = vi.fn<NotificationsApi['get']>(), setRead = vi.fn<NotificationsApi['setRead']>(), markAll = vi.fn<NotificationsApi['markAll']>(), refreshSummary = vi.fn<NotificationsApi['refreshSummary']>(), navigate = vi.fn<Router['navigate']>();
  const scopes: EnvironmentInjector[] = [];
  beforeEach(() => {
    me.set(person); epoch.set(1); unreadCount.set(1);
    list.mockReset().mockResolvedValue(page()); get.mockReset().mockImplementation(async id => notification(id)); setRead.mockReset().mockImplementation(async (id, body) => ({ result: notification(id, { readAt: body.read ? '2026-10-20T01:00:00Z' : null, revision: '3' }), receipt })); markAll.mockReset().mockResolvedValue({ result: { changedCount: 3, inbox: { unreadCount: 0, companyToday: '2026-10-20' } }, receipt }); refreshSummary.mockReset().mockResolvedValue({ unreadCount: 1, companyToday: '2026-10-20' }); navigate.mockReset().mockResolvedValue(true);
    vi.stubGlobal('window', new EventTarget()); vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'hidden', getElementById: () => null })); vi.stubGlobal('navigator', { onLine: true });
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('No rendered UI is claimed.'); } } }, { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
      { provide: AuthService, useValue: { me, sessionEpoch: epoch } satisfies Pick<AuthService, 'me' | 'sessionEpoch'> },
      { provide: NotificationsApi, useValue: { list, get, setRead, markAll, refreshSummary, unreadCount } satisfies Pick<NotificationsApi, 'list' | 'get' | 'setRead' | 'markAll' | 'refreshSummary' | 'unreadCount'> },
      { provide: Router, useValue: { navigate } satisfies Pick<Router, 'navigate'> },
    ] });
  });
  afterEach(() => { for (const scope of scopes.splice(0)) if (!scope.destroyed) scope.destroy(); TestBed.resetTestingModule(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  async function mount(wait = true) {
    const scope = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector)); scopes.push(scope); const model = runInInjectionContext(scope, () => new InboxPage()); TestBed.tick();
    if (wait) await vi.waitFor(() => expect(model.state.busy()).toBe(false));
    return { model, destroy: () => scope.destroy() };
  }

  it('loads the authenticated inbox and summary together and starts no read without an identity', async () => {
    const { model } = await mount(); expect(list).toHaveBeenCalledExactlyOnceWith(false, undefined); expect(refreshSummary).toHaveBeenCalledTimes(1); expect(model.items()).toEqual([notification()]); expect(model.total()).toBe(1);
    me.set(null); epoch.update(value => value + 1); TestBed.tick(); expect(model.items()).toEqual([]); expect(model.total()).toBe(0); expect(list).toHaveBeenCalledTimes(1);
  });
  it('keeps cursor paging scoped to its accepted unread filter until a fresh first page applies another filter', async () => {
    const { model } = await mount(); model.unreadOnly.setValue(true); list.mockResolvedValueOnce(page([notification('second')], 'third')); await model.load('second-page'); expect(list).toHaveBeenLastCalledWith(false, 'second-page'); expect(model.items().map(item => item.id)).toEqual(['second']); expect(model.cursor()).toBe('third');
    await model.load(); expect(list).toHaveBeenLastCalledWith(true, undefined); expect(model.items()).toEqual([notification()]);
  });
  it('retains an accepted page on a read failure and permits explicit reload without leaking unknown errors', async () => {
    const { model } = await mount(); list.mockRejectedValueOnce(new TypeError('private network details')); await model.load(); expect(model.items()).toEqual([notification()]); expect(model.state.failure()).toBeNull(); expect(model.state.message()).toBe('The request could not be completed. Check your connection and try again.');
    await model.load(); expect(model.state.message()).toBe(''); expect(model.state.busy()).toBe(false);
  });
  it('replays the same uncertain individual intention and reference before adopting the authoritative refreshed inbox', async () => {
    const { model } = await mount(); setRead.mockRejectedValueOnce(failure()); await model.changeRead(notification(), true); const original = setRead.mock.calls[0]!; expect(model.pending()).toEqual({ kind: 'read', notificationId: 'first', body: { expectedRevision: '2', read: true } }); expect(model.state.failure()?.status).toBe(503);
    list.mockResolvedValueOnce(page([notification('first', { readAt: '2026-10-20T01:00:00Z', revision: '3' })])); await model.retryPending(); expect(setRead.mock.calls[1]).toEqual(original); expect(model.pending()).toBeNull(); expect(model.notice()).toBe('Notification marked read.'); expect(model.items()[0]?.revision).toBe('3'); expect(model.state.failure()).toBeNull();
  });
  it('marks an accepted read notification unread with its exact current revision', async () => {
    const { model } = await mount(), item = notification('first', { readAt: '2026-10-20T01:00:00Z', revision: '8' }); await model.changeRead(item, false); expect(setRead.mock.calls[0]?.slice(0, 2)).toEqual(['first', { expectedRevision: '8', read: false }]); expect(model.notice()).toBe('Notification marked unread.'); expect(model.pending()).toBeNull();
  });
  it('replays mark-all independently and sends no command when no intention is pending', async () => {
    const { model } = await mount(); await model.retryPending(); expect(markAll).not.toHaveBeenCalled(); markAll.mockRejectedValueOnce(failure()); await model.markAll(); const original = markAll.mock.calls[0]; expect(model.pending()).toEqual({ kind: 'all' }); await model.retryPending(); expect(markAll.mock.calls[1]).toEqual(original); expect(model.pending()).toBeNull(); expect(model.notice()).toBe('3 notifications marked read.');
  });
  it('does not dispatch a second mutation or open navigation while a change owns RequestState', async () => {
    const { model } = await mount(), held = deferred<Awaited<ReturnType<NotificationsApi['setRead']>>>(); setRead.mockReturnValueOnce(held.promise); const saving = model.changeRead(notification(), true); await model.markAll(); await model.open(notification('other')); expect(setRead).toHaveBeenCalledTimes(1); expect(markAll).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
    held.resolve({ result: notification('first', { readAt: '2026-10-20T01:00:00Z' }), receipt }); await saving; expect(model.state.busy()).toBe(false);
  });
  it('opens a fresh already-read record using its authoritative issue without an unnecessary write', async () => {
    const { model } = await mount(); get.mockResolvedValueOnce(notification('first', { issueId: 'authorized-current-issue', readAt: '2026-10-20T01:00:00Z' })); await model.open(notification()); expect(get).toHaveBeenCalledExactlyOnceWith('first'); expect(setRead).not.toHaveBeenCalled(); expect(navigate).toHaveBeenCalledExactlyOnceWith(['/issues', 'authorized-current-issue']);
  });
  it('checks a fresh unread record revision and navigates only after its accepted mark-read result and reload', async () => {
    const { model } = await mount(); get.mockResolvedValueOnce(notification('first', { revision: '9' })); setRead.mockResolvedValueOnce({ result: notification('first', { issueId: 'accepted-current-issue', readAt: '2026-10-20T01:00:00Z' }), receipt }); await model.open(notification()); expect(setRead.mock.calls[0]?.slice(0, 2)).toEqual(['first', { expectedRevision: '9', read: true }]); expect(list).toHaveBeenCalledTimes(2); expect(navigate).toHaveBeenCalledExactlyOnceWith(['/issues', 'accepted-current-issue']);
  });
  it('opening the same pending mark-read reuses its original intention without replacing it with a new read', async () => {
    const { model } = await mount(); setRead.mockRejectedValueOnce(failure()); await model.open(notification()); const original = setRead.mock.calls[0]; expect(get).toHaveBeenCalledTimes(1); expect(navigate).not.toHaveBeenCalled(); await model.open(notification()); expect(get).toHaveBeenCalledTimes(1); expect(setRead.mock.calls[1]).toEqual(original); expect(navigate).toHaveBeenCalledExactlyOnceWith(['/issues', 'issue-first']);
  });
  it('keeps navigation closed when refreshing a record fails', async () => {
    const { model } = await mount(); get.mockRejectedValueOnce(failure()); await model.open(notification()); expect(setRead).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled(); expect(model.state.failure()?.status).toBe(503); expect(model.pending()).toBeNull();
  });
  it('suppresses an old mutation acknowledgement and follow-up navigation after authentication ownership changes', async () => {
    const { model } = await mount(), held = deferred<Awaited<ReturnType<NotificationsApi['setRead']>>>(); setRead.mockReturnValueOnce(held.promise); const opening = model.open(notification()); await vi.waitFor(() => expect(setRead).toHaveBeenCalledTimes(1)); epoch.update(value => value + 1); me.set({ ...person, userId: 'new-owner' }); TestBed.tick(); await vi.waitFor(() => expect(model.state.busy()).toBe(false)); const reads = list.mock.calls.length;
    held.resolve({ result: notification('private-old', { readAt: '2026-10-20T01:00:00Z' }), receipt }); await opening; expect(model.pending()).toBeNull(); expect(model.notice()).toBe(''); expect(list).toHaveBeenCalledTimes(reads); expect(navigate).not.toHaveBeenCalled();
  });
  it('does not let an old rejected page release the replacement account’s active loading ownership', async () => {
    const old = deferred<Awaited<ReturnType<NotificationsApi['list']>>>(), current = deferred<Awaited<ReturnType<NotificationsApi['list']>>>(); list.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise); const { model } = await mount(false); epoch.update(value => value + 1); TestBed.tick(); old.reject(new Error('private old-account failure')); await Promise.resolve(); await Promise.resolve(); expect(model.state.busy()).toBe(true); expect(model.state.message()).toBe(''); expect(model.items()).toEqual([]);
    current.resolve(page([notification('new-owner')])); await vi.waitFor(() => expect(model.state.busy()).toBe(false)); expect(model.items().map(item => item.id)).toEqual(['new-owner']);
  });
  it('drops an outstanding record read on destruction without dispatching a mutation or navigation', async () => {
    const f = await mount(), held = deferred<NotificationView>(); get.mockReturnValueOnce(held.promise); const opening = f.model.open(notification()); f.destroy(); held.resolve(notification()); await opening; expect(setRead).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
  });
  it('refreshes only when visible and idle and rejects an overlapping foreground reply during a mutation', async () => {
    vi.useFakeTimers(); const { model } = await mount(); const foreground = deferred<Awaited<ReturnType<NotificationsApi['list']>>>(); list.mockReturnValueOnce(foreground.promise); Object.assign(document, { visibilityState: 'visible' }); await vi.advanceTimersByTimeAsync(30000); expect(list).toHaveBeenCalledTimes(2);
    const change = deferred<Awaited<ReturnType<NotificationsApi['setRead']>>>(); setRead.mockReturnValueOnce(change.promise); const saving = model.changeRead(notification(), true); foreground.resolve(page([notification('stale-background')])); await Promise.resolve(); await Promise.resolve(); expect(model.items()).toEqual([notification()]); await vi.advanceTimersByTimeAsync(30000); expect(list).toHaveBeenCalledTimes(2);
    list.mockResolvedValueOnce(page([notification('accepted-after-change')])); change.resolve({ result: notification(), receipt }); await saving; expect(model.items().map(item => item.id)).toEqual(['accepted-after-change']);
  });
  it('formats Unicode initials and the company timezone while retaining all notification reasons', async () => {
    const { model } = await mount(); expect(model.initials('  😀 Dev  Third ')).toBe('😀D'); expect(model.initials('')).toBe(''); const item = notification('reason', { reasons: ['dependency_resolved', 'due_date'] }); expect(model.reasonText(item)).toBe('dependency resolved · due date'); expect(model.reasonIcon(item)).toBe('link'); expect(model.formatDate(item.createdAt)).toBe(new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Cairo' }).format(new Date(item.createdAt)));
    for (const [reasons, expected] of [[['comment', 'assignment'], 'comment'], [['assignment'], 'users'], [['due_date'], 'calendar'], [['watching'], 'activity']] as const) expect(model.reasonIcon(notification('reason', { reasons: [...reasons] }))).toBe(expected);
    me.set(null); expect(model.formatDate(item.createdAt)).toBe(new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(item.createdAt)));
  });
  it('publishes an idle foreground page including its new cursor and matching total without issuing mutations', async () => {
    vi.useFakeTimers(); const { model } = await mount(); list.mockResolvedValueOnce({ ...page([notification('background-current')], 'next-background'), totalMatching: 12 }); Object.assign(document, { visibilityState: 'visible' }); await vi.advanceTimersByTimeAsync(30000); expect(model.items().map(value => value.id)).toEqual(['background-current']); expect(model.cursor()).toBe('next-background'); expect(model.total()).toBe(12); expect(setRead).not.toHaveBeenCalled(); expect(markAll).not.toHaveBeenCalled();
  });
});
