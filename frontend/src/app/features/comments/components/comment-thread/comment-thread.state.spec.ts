import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, provideZonelessChangeDetection, RendererFactory2, runInInjectionContext, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommentBody, CommentView, IssueView, PageCommentView } from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { CommentsApi } from '../../comments.api';
import { CommentThreadComponent } from './comment-thread.component';

// Presentation-model units use the real effects, request state and public
// actions. Typed input/API ports do not establish rendered discussion behavior.
const firstIssue = '50000000-0000-4000-8000-000000000001';
const secondIssue = '50000000-0000-4000-8000-000000000002';
const author = { id: '10000000-0000-4000-8000-000000000002', displayName: 'عضو الفريق' };
function issue(id = firstIssue): IssueView {
  return {
    summary: { id, projectId: '20000000-0000-4000-8000-000000000001', number: '1', key: 'GG-1', title: 'Discussion', type: 'task', priority: 'medium',
      status: 'todo', assignee: author, dueDate: null, overdue: false, labels: [], blocked: false, unfinishedBlockerCount: 0, parent: null,
      subtaskProgress: { done: 0, total: 0 }, revision: '1', createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z' },
    description: '', graphRevision: '1', orderRevisions: [], sourceOrderRevision: '1', reporter: author, capabilities: ['read', 'comment'],
  };
}
function comment(number = 1, revision = '1'): CommentView {
  return { id: '60000000-0000-4000-8000-' + String(number).padStart(12, '0'), issueId: firstIssue, author, canEdit: true,
    createdAt: '2026-10-20T00:00:00Z', editedAt: null, revision, safeHtml: '<p>تعليق</p>', plainText: 'تعليق',
    pictureIds: [], attachmentIds: [], mentions: [], sanitationNotices: [] };
}
const page = (items: CommentView[], nextCursor: string | null = null, totalMatching = items.length): PageCommentView => ({ items, nextCursor, totalMatching });
const body: CommentBody = { html: '<p>تعليق جديد</p>', mentionUserIds: [], pictureIds: [], attachmentIds: [] };
const saved = (result = comment()) => ({ result, receipt: { replayed: false, eventId: null } });
function failure(status: number, current: CommentView | null = null) {
  return new ApiError({ error: { code: status === 409 ? 'conflict' : status === 403 ? 'forbidden' : 'temporarily_unavailable',
    message: 'Discussion is unavailable.', fieldErrors: [], retryable: status === 503, nextAction: status === 409 ? 'reload_current_state' : 'none' }, current, unfinished: null }, status);
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve: (value: T) => resolve(value), reject: (reason: Error) => reject(reason) };
}
async function settled() { for (let turn = 0; turn < 8; turn++) await Promise.resolve(); TestBed.tick(); }
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
describe('discussion paging, exact retries and revision ownership', () => {
  const current = signal(issue()), epoch = signal(1);
  const list = vi.fn<CommentsApi['list']>(), create = vi.fn<CommentsApi['create']>(), update = vi.fn<CommentsApi['update']>(), versions = vi.fn<CommentsApi['versions']>();
  const scopes: EnvironmentInjector[] = [];
  beforeEach(() => {
    current.set(issue()); epoch.set(1); list.mockReset().mockResolvedValue(page([comment()]));
    create.mockReset().mockResolvedValue(saved()); update.mockReset().mockResolvedValue(saved()); versions.mockReset().mockResolvedValue({ items: [], nextCursor: null, totalMatching: 0 });
    vi.stubGlobal('window', Object.assign(new EventTarget(), { getSelection: () => null }));
    vi.stubGlobal('document', Object.assign(new EventTarget(), { getElementById: () => null }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('Presentation-model units do not render the discussion template.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
      { provide: AuthService, useValue: { sessionEpoch: epoch } satisfies Pick<AuthService, 'sessionEpoch'> },
      { provide: CommentsApi, useValue: { list, create, update, versions } satisfies Pick<CommentsApi, 'list' | 'create' | 'update' | 'versions'> },
    ] });
  });
  afterEach(() => { for (const scope of scopes.splice(0)) if (!scope.destroyed) scope.destroy(); TestBed.resetTestingModule(); vi.unstubAllGlobals(); });
  function setup() {
    const scope = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector)); scopes.push(scope);
    const component = runInInjectionContext(scope, () => new CommentThreadComponent());
    Object.assign(component, { issue: current });
    const changed = vi.fn(); component.changed.subscribe(changed); TestBed.tick();
    return { component, changed, destroy: () => scope.destroy() };
  }
  it('loads the actual issue, exposes its comment capability and appends a retained opaque cursor', async () => {
    list.mockResolvedValueOnce(page([comment()], 'opaque-next', 2)).mockResolvedValueOnce(page([comment(2)], null, 2));
    const { component } = setup(); await settled();
    expect(list).toHaveBeenCalledExactlyOnceWith(firstIssue, undefined);
    expect(component.writable()).toBe(true); expect(component.comments()).toEqual([comment()]);
    await component.load(component.cursor() ?? undefined);
    expect(list).toHaveBeenLastCalledWith(firstIssue, 'opaque-next'); expect(component.comments()).toEqual([comment(), comment(2)]);
    expect(component.cursor()).toBeNull(); expect(component.total()).toBe(2);
  });
  it('preserves existing records and pagination after a retryable list failure', async () => {
    list.mockResolvedValueOnce(page([comment()], 'keep-cursor', 2)).mockRejectedValueOnce(failure(503));
    const { component } = setup(); await settled(); await component.load('keep-cursor');
    expect(component.comments()).toEqual([comment()]); expect(component.cursor()).toBe('keep-cursor');
    expect(component.state.failure()?.status).toBe(503); expect(component.state.busy()).toBe(false);
  });
  it.each([403, 404])('clears retained discussion/history after access is denied with %s', async status => {
    const { component } = setup(); await settled(); await component.history(comment()); list.mockRejectedValueOnce(failure(status));
    await component.load(); expect(component.comments()).toEqual([]); expect(component.cursor()).toBeNull(); expect(component.total()).toBe(0);
    expect(component.historyComment()).toBeNull(); expect(component.state.failure()?.status).toBe(status);
  });
  it.each(['issue', 'session', 'destroy'] as const)('ignores an old first-page response after %s ownership changes', async kind => {
    const held = deferred<PageCommentView>(); list.mockReturnValueOnce(held.promise).mockResolvedValue(page([comment(2)]));
    const f = setup(); await settled();
    if (kind === 'issue') current.set(issue(secondIssue)); else if (kind === 'session') epoch.update(value => value + 1); else f.destroy();
    TestBed.tick(); await settled(); held.resolve(page([comment(3)])); await settled();
    expect(f.component.comments()).not.toContainEqual(comment(3));
    if (kind !== 'destroy') { expect(f.component.comments()).toEqual([comment(2)]); expect(f.component.state.busy()).toBe(false); }
  });
  it('keeps a newer load busy when an older generation fails', async () => {
    const old = deferred<PageCommentView>(), fresh = deferred<PageCommentView>(); list.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
    const f = setup(); current.set(issue(secondIssue)); TestBed.tick(); await settled(); old.reject(failure(503)); await settled();
    expect(f.component.state.busy()).toBe(true); expect(f.component.state.failure()).toBeNull();
    fresh.resolve(page([comment(2)])); await settled(); expect(f.component.state.busy()).toBe(false); expect(f.component.comments()).toEqual([comment(2)]);
  });
  it('does not reload discussion for an unrelated revision or capability update on the same issue', async () => {
    const f = setup(); await settled(); current.set({ ...issue(), capabilities: ['read'], summary: { ...issue().summary, revision: '2' } }); TestBed.tick(); await settled();
    expect(list).toHaveBeenCalledOnce(); expect(f.component.comments()).toEqual([comment()]); expect(f.component.writable()).toBe(false);
  });
  it('quiet refresh replaces a small first page and preserves the new continuation metadata', async () => {
    const f = setup(); await settled(); list.mockResolvedValueOnce(page([comment(2)], 'new-page', 7)); await f.component.refreshQuiet();
    expect(list).toHaveBeenLastCalledWith(firstIssue); expect(f.component.comments()).toEqual([comment(2)]); expect(f.component.cursor()).toBe('new-page'); expect(f.component.total()).toBe(7);
  });
  it('quiet refresh retains already paged records and announces new activity instead of silently replacing them', async () => {
    const many = Array.from({ length: 26 }, (_, index) => comment(index + 1)); list.mockResolvedValueOnce(page(many, 'retained-next', 26));
    const f = setup(); await settled(); list.mockResolvedValueOnce(page([comment(30)], null, 27)); await f.component.refreshQuiet();
    expect(f.component.comments()).toEqual(many); expect(f.component.cursor()).toBe('retained-next'); expect(f.component.total()).toBe(27); expect(f.component.notice()).toContain('New discussion activity');
  });
  it('does not start quiet refresh while a write is pending', async () => {
    const f = setup(); await settled(); const held = deferred<Awaited<ReturnType<CommentsApi['create']>>>(); create.mockReturnValueOnce(held.promise);
    const writing = f.component.save(body); await f.component.refreshQuiet(); expect(list).toHaveBeenCalledOnce();
    held.resolve(saved()); await writing; expect(f.component.notice()).toBe('Comment posted.');
  });
  it('keeps the exact body and reference across an uncertain create retry, then releases the completed intention', async () => {
    const f = setup(); await settled(); create.mockRejectedValueOnce(new Error('Reply lost'));
    await f.component.save(body); const first = create.mock.calls[0]; expect(first?.[2]).toMatch(/^[0-9a-f-]{36}$/); expect(f.changed).not.toHaveBeenCalled();
    await f.component.save(body); expect(create.mock.calls[1]).toEqual(first); expect(f.changed).toHaveBeenCalledOnce();
    await f.component.save(body); expect(create.mock.calls[2]?.[2]).not.toBe(first?.[2]); expect(f.component.editorReset()).toBeGreaterThan(0);
  });
  it.each(['issue', 'session', 'destroy'] as const)('does not publish a saved comment after %s ownership changes', async kind => {
    const f = setup(); await settled(); const held = deferred<Awaited<ReturnType<CommentsApi['create']>>>(); create.mockReturnValueOnce(held.promise);
    const saving = f.component.save(body);
    if (kind === 'issue') current.set(issue(secondIssue)); else if (kind === 'session') epoch.update(value => value + 1); else f.destroy();
    TestBed.tick(); await settled(); held.resolve(saved()); await saving;
    expect(f.changed).not.toHaveBeenCalled(); expect(f.component.notice()).toBe(''); expect(f.component.sanitationNotices()).toEqual([]);
  });
  it('updates the selected comment with its own revision and publishes sanitation feedback', async () => {
    const f = setup(); await settled(); const selected = comment(2, '8'); f.component.edit(selected);
    update.mockResolvedValueOnce(saved({ ...selected, revision: '9', sanitationNotices: ['Unsupported content was removed.'] }));
    await f.component.save(body); expect(update).toHaveBeenCalledWith(selected.id, '8', body, expect.any(String)); expect(create).not.toHaveBeenCalled();
    expect(f.component.editing()).toBeNull(); expect(f.component.notice()).toBe('Comment changes saved.'); expect(f.component.sanitationNotices()).toEqual(['Unsupported content was removed.']);
  });
  it('uses the reviewed current revision for the same comment and renews its retry reference', async () => {
    const f = setup(); await settled(); f.component.edit(comment()); update.mockRejectedValueOnce(failure(409, comment(1, '4')));
    await f.component.save(body); expect(f.component.conflict()).toEqual(comment(1, '4')); const prior = update.mock.calls[0]?.[3];
    f.component.review(comment(1, '4')); expect(f.component.conflict()).toBeNull(); await f.component.save(body);
    expect(update.mock.calls[1]?.slice(0, 3)).toEqual([comment().id, '4', body]); expect(update.mock.calls[1]?.[3]).not.toBe(prior);
  });
  it('uses the newly opened editor revision after a previously reviewed conflict has saved', async () => {
    const f = setup(); await settled(); f.component.edit(comment()); f.component.review(comment(1, '8')); await f.component.save(body);
    const next = comment(2, '2'); f.component.edit(next);
    // The real child announces its restored/current revision during initialize;
    // the template wires that public output to this public parent signal.
    f.component.draftRevision.set(next.revision); await f.component.save(body);
    expect(update.mock.calls[1]?.slice(0, 3)).toEqual([next.id, '2', body]);
  });
  it('keeps version-page identity and cursor exact, then closes its history explicitly', async () => {
    const version = { commentId: comment().id, revision: '1', createdAt: comment().createdAt, safeHtml: '<p>Old</p>', plainText: 'Old', pictureIds: [], attachmentIds: [] };
    versions.mockResolvedValueOnce({ items: [version], nextCursor: 'older-version', totalMatching: 2 }); const f = setup(); await settled();
    await f.component.history(comment()); expect(f.component.versions()).toEqual([version]); expect(f.component.versionCursor()).toBe('older-version');
    await f.component.history(comment(), 'older-version'); expect(versions).toHaveBeenLastCalledWith(comment().id, 'older-version'); expect(f.component.versions()).toEqual([]);
    f.component.closeHistory(); expect(f.component.historyComment()).toBeNull(); expect(f.component.versionCursor()).toBeNull();
  });
  it('ignores a held history response after moving to another issue', async () => {
    const held = deferred<Awaited<ReturnType<CommentsApi['versions']>>>(); const f = setup(); await settled(); versions.mockReturnValueOnce(held.promise);
    const reading = f.component.history(comment()); current.set(issue(secondIssue)); TestBed.tick(); await settled();
    held.resolve({ items: [], nextCursor: 'old-history', totalMatching: 0 }); await reading; expect(f.component.historyComment()).toBeNull(); expect(f.component.versionCursor()).toBeNull();
  });
  it.each([['  عضو الفريق الثالث  ', 'عا'], ['🧑🏽 Team', '🧑T'], ['', '']])('uses Unicode code points and at most two words for initials of %s', async (name, initials) => {
    const f = setup(); await settled(); expect(f.component.initials(name)).toBe(initials);
  });
});
