import '@angular/compiler';
import { provideZonelessChangeDetection, RendererFactory2, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftsService } from './drafts.service';
import { AuthService } from '../auth/auth.service';
import type { Me } from '../../api/generated/types.gen';

const member: Me = { userId: '10000000-0000-4000-8000-000000000002', email: 'member@example.test', displayName: 'Member', administrator: false, companyTimeZone: 'Africa/Cairo' };
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());

describe('draft ownership and private-session lifetime', () => {
  const epoch = signal(0), me = signal<Me | null>(member);
  let drafts: DraftsService;
  let events: EventTarget;
  const confirm = vi.fn<(message: string) => boolean>();

  beforeEach(() => {
    epoch.set(0); me.set(member); confirm.mockReset().mockReturnValue(true);
    events = Object.assign(new EventTarget(), { confirm }); vi.stubGlobal('window', events);
    TestBed.configureTestingModule({ providers: [
      provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { sessionEpoch: epoch, me } },
      // This is a service test with real Angular effects; no component or DOM
      // renderer is involved. Browser interaction is covered by Playwright.
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('No component should render in this service test.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
    ] });
    drafts = TestBed.inject(DraftsService); TestBed.tick();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it('counts distinct active editors and removes only the editor that releases its guard', () => {
    drafts.activate('issue:A', true); drafts.activate('issue:A', true); drafts.activate('comment:B', true);
    expect(drafts.dirtyCount()).toBe(2);
    drafts.release('unknown'); expect(drafts.dirtyCount()).toBe(2);
    drafts.release('issue:A'); expect(drafts.dirtyCount()).toBe(1);
    drafts.activate('comment:B', false); expect(drafts.dirtyCount()).toBe(0);
  });

  it('does not ask about clean editors or retain a navigation barrier after sign-out', () => {
    expect(drafts.mayLeave()).toBe(true);
    drafts.activate('private draft', true); me.set(null);
    expect(drafts.mayLeave()).toBe(true); expect(confirm).not.toHaveBeenCalled();
  });

  it('respects explicit navigation cancellation without deleting the draft or its retry state', () => {
    drafts.comments.set('comment:A', { html: '<p>Retain عربي</p>', revision: '7' });
    drafts.activate('comment:A', true); confirm.mockReturnValueOnce(false);
    expect(drafts.mayLeave()).toBe(false); expect(drafts.dirtyCount()).toBe(1);
    expect(drafts.comments.get('comment:A')).toEqual({ html: '<p>Retain عربي</p>', revision: '7' });
    expect(confirm).toHaveBeenCalledExactlyOnceWith('Leave this editor? Your unsaved draft stays in this tab until you sign out or reload.');
    expect(drafts.mayLeave()).toBe(true); expect(drafts.comments.has('comment:A')).toBe(true);
  });

  it('warns on browser unload only while an editor owns unsaved work', () => {
    const clean = new Event('beforeunload', { cancelable: true }); events.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    drafts.activate('issue:A', true);
    const dirty = new Event('beforeunload', { cancelable: true }); events.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    drafts.release('issue:A');
    const released = new Event('beforeunload', { cancelable: true }); events.dispatchEvent(released);
    expect(released.defaultPrevented).toBe(false);
  });

  it('clears a completed draft without discarding a different editor', () => {
    drafts.modernIssues.set('issue:A', { fields: { title: 'Draft' }, editable: null, revision: '1', files: [] });
    drafts.comments.set('comment:B', { html: 'Comment', revision: null });
    drafts.planning.set('planning:C', { field: 'epicId', body: { epicId: null, releaseId: null, expectedRevision: '2' }, reference: 'planning-reference', epicName: null, releaseName: null });
    for (const key of ['issue:A', 'comment:B', 'planning:C']) drafts.activate(key, true);
    drafts.clearModernIssue('issue:A'); expect(drafts.modernIssues.has('issue:A')).toBe(false); expect(drafts.dirtyCount()).toBe(2);
    expect(drafts.comments.has('comment:B')).toBe(true); expect(drafts.planning.has('planning:C')).toBe(true);
    drafts.clearComment('comment:B'); expect(drafts.comments.size).toBe(0); expect(drafts.dirtyCount()).toBe(1);
    drafts.clearPlanning('planning:C'); expect(drafts.planning.size).toBe(0); expect(drafts.dirtyCount()).toBe(0);
  });

  it('destroys every category of private draft and retry reference on a real Angular session-epoch effect', () => {
    drafts.modernIssues.set('issue', { fields: { title: 'Private' }, editable: null, revision: '1', files: [] });
    drafts.comments.set('comment', { html: '<p>Private</p>', revision: null });
    drafts.uploads.set('upload', []); drafts.customFields.set('fields', { revision: '1', values: [] });
    drafts.modernBoards.set('board', { columns: [], expectedRevision: '1', name: 'Private', savedFilters: {} });
    drafts.savedSearchDrafts.set('search', { name: 'Private', selectedId: '', pending: null });
    drafts.modernBulk.set('bulk', { selected: [], retries: new Map(), action: 'priority', priorityId: '', assigneeId: '', dueDate: '', stageId: '' });
    drafts.planning.set('planning', { field: 'releaseId', body: { expectedRevision: '1', epicId: null, releaseId: null }, reference: 'private-reference', epicName: null, releaseName: null });
    drafts.activations.set('activation', { body: { confirm: true, expectedBoardId: null, expectedBoardRevision: '1', expectedProjectRevision: '1', expectedRevision: '1' }, reference: 'private-reference' });
    drafts.activate('private', true);
    TestBed.tick(); expect(drafts.comments.size).toBe(1);
    epoch.update(value => value + 1); TestBed.tick();
    for (const collection of [drafts.modernIssues, drafts.comments, drafts.uploads, drafts.customFields, drafts.modernBoards, drafts.savedSearchDrafts, drafts.modernBulk, drafts.planning, drafts.activations]) expect(collection.size).toBe(0);
    expect(drafts.dirtyCount()).toBe(0); expect(drafts.mayLeave()).toBe(true); expect(confirm).not.toHaveBeenCalled();
  });
});
