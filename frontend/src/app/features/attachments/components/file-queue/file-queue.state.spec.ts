// Public controller units with real Angular effects and draft ownership.
// API transfers are typed ports; no rendered DOM or browser evidence is claimed.
import '@angular/compiler';
import { Injector, provideZonelessChangeDetection, RendererFactory2, signal, type DestroyableInjector } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetPolicy, AssetView, AttachmentView, PictureView, SavedUploadSessionView } from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService, type DraftFile } from '../../../../core/drafts/drafts.service';
import { AssetsApi } from '../../assets.api';
import { FileQueueComponent } from './file-queue.component';

const issueA = '50000000-0000-4000-8000-000000000001';
const issueB = '50000000-0000-4000-8000-000000000002';
const actor = { id: '10000000-0000-4000-8000-000000000001', displayName: 'Current owner' };
const initialPolicy: AssetPolicy = { maximumFileBytes: '10485760', maximumImageBytes: '10485760', chunkBytes: '1048576' };
const flush = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function asset(overrides: Partial<AssetView> = {}): AssetView {
  return { id: crypto.randomUUID(), issueId: issueA, issueRevision: '8', filename: 'report.txt', description: '', kind: 'file', mimeType: 'text/plain', byteSize: '4', state: 'published', inPanel: true, expiresAt: null, uploader: actor, uploadedAt: '2026-10-20T00:00:00Z', ...overrides };
}
function cancelled(sessionId = '60000000-0000-4000-8000-000000000001'): SavedUploadSessionView {
  return { receipt: { replayed: false, eventId: null }, result: { sessionId, assetId: crypto.randomUUID(), issueId: issueA, expectedBytes: '4', receivedBytes: '0', maximumBytes: '10485760', chunkBytes: '1048576', expiresAt: '2026-10-21T00:00:00Z', state: 'canceled', metadata: { filename: 'report.txt', description: '', kind: 'file', mimeType: 'text/plain', publication: 'issue' } } };
}
function file(name = 'report.txt', type = 'text/plain', bytes = 4): File {
  return new File([new Uint8Array(bytes)], name, { type });
}
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());

describe('attachment queue public state and transfer ownership', () => {
  const issue = signal(issueA), epoch = signal(1), disabled = signal(false), scope = signal('attachments');
  const publication = signal<'gallery' | 'comment_draft'>('gallery'), pictureLimit = signal(20), trackRevision = signal(false);
  const policy = vi.fn<AssetsApi['policy']>(), uploadFile = vi.fn<AssetsApi['uploadFile']>(), cancel = vi.fn<AssetsApi['cancel']>();
  const pictures: PictureView[] = [], documents: AttachmentView[] = [], revisions: string[] = [];
  let queue: FileQueueComponent, drafts: DraftsService, changed: number, controller: DestroyableInjector, controllerAlive: boolean;
  const key = () => 'uploads:' + issue() + ':' + scope();
  function destroyController() { if (controllerAlive) { controllerAlive = false; controller.destroy(); } }
  beforeEach(async () => {
    issue.set(issueA); epoch.set(1); disabled.set(false); scope.set('attachments'); publication.set('gallery'); pictureLimit.set(20); trackRevision.set(false);
    pictures.length = 0; documents.length = 0; revisions.length = 0; changed = 0;
    policy.mockReset().mockResolvedValue(initialPolicy); uploadFile.mockReset(); cancel.mockReset().mockResolvedValue(cancelled());
    vi.stubGlobal('window', Object.assign(new EventTarget(), { confirm: vi.fn(() => true) }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { sessionEpoch: epoch, me: signal({ userId: actor.id }) } },
      { provide: AssetsApi, useValue: { policy, uploadFile, cancel } satisfies Pick<AssetsApi, 'policy' | 'uploadFile' | 'cancel'> },
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('Controller units do not render templates.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
    ] });
    drafts = TestBed.inject(DraftsService);
    controller = Injector.create({ parent: TestBed.inject(Injector), providers: [{ provide: FileQueueComponent, useFactory: () => new FileQueueComponent() }] });
    controllerAlive = true; queue = controller.get(FileQueueComponent);
    Object.defineProperties(queue, { issueId: { value: issue.asReadonly() }, disabled: { value: disabled.asReadonly() }, queueScope: { value: scope.asReadonly() }, publication: { value: publication.asReadonly() }, pictureLimit: { value: pictureLimit.asReadonly() }, trackIssueRevision: { value: trackRevision.asReadonly() } });
    queue.pictureUploaded.subscribe(value => pictures.push(value)); queue.documentUploaded.subscribe(value => documents.push(value)); queue.uploadedRevision.subscribe(value => revisions.push(value)); queue.changed.subscribe(() => changed++);
    TestBed.tick(); await flush();
  });
  afterEach(() => { destroyController(); TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it('loads a typed policy without treating an empty queue as dirty work', () => {
    expect(policy).toHaveBeenCalledOnce(); expect(queue.maximumBytes()).toBe(10485760); expect(queue.pending()).toBe(false); expect(drafts.dirtyCount()).toBe(0);
  });
  it('keeps the conservative limit when policy loading is unavailable', async () => {
    policy.mockRejectedValueOnce(new Error('policy offline')); scope.set('comment'); TestBed.tick(); await flush();
    expect(queue.maximumBytes()).toBe(10485760); expect(queue.error()).toBe(''); expect(queue.busy()).toBe(false);
  });
  it('ignores an old issue policy after a newer scope has loaded', async () => {
    const old = deferred<AssetPolicy>(); policy.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ ...initialPolicy, maximumFileBytes: '20971520' });
    issue.set(issueB); TestBed.tick(); scope.set('new-scope'); TestBed.tick(); await flush();
    expect(queue.maximumBytes()).toBe(20971520); old.resolve({ ...initialPolicy, maximumFileBytes: '1024' }); await flush(); expect(queue.maximumBytes()).toBe(20971520);
  });
  it('restores only the chosen issue and queue scope, releasing the previous active editor', () => {
    const privateFile = file('first-scope.txt'); queue.choose([privateFile]); const first = queue.files()[0]!;
    expect(drafts.uploads.get(key())).toEqual([first]); expect(drafts.dirtyCount()).toBe(1);
    scope.set('comment'); TestBed.tick(); expect(queue.files()).toEqual([]); expect(drafts.dirtyCount()).toBe(0);
    queue.choose([file('comment.txt')]); scope.set('attachments'); TestBed.tick(); expect(queue.files()).toEqual([first]); expect(queue.files()[0]?.file).toBe(privateFile); expect(drafts.dirtyCount()).toBe(1);
  });
  it('validates each selected file without dropping valid neighboring files', () => {
    queue.choose([file(''), file('valid.txt'), file('zero.txt', 'text/plain', 0)]);
    expect(queue.files().map(item => item.file.name)).toEqual(['valid.txt']); expect(queue.error()).toContain('valid filename'); expect(drafts.dirtyCount()).toBe(1);
  });
  it('applies the advertised document limit while retaining the separate 10 MiB picture limit', async () => {
    policy.mockResolvedValueOnce({ ...initialPolicy, maximumFileBytes: '20971520' }); scope.set('larger-policy'); TestBed.tick(); await flush();
    queue.choose([file('document.pdf', 'application/pdf', 11 * 1024 * 1024), file('picture.png', 'image/png', 11 * 1024 * 1024)]);
    expect(queue.files().map(item => item.file.name)).toEqual(['document.pdf']); expect(queue.error()).toContain('displayed upload limit');
  });
  it('bounds a queue at twenty files and keeps the accepted retry references stable', () => {
    queue.choose(Array.from({ length: 21 }, (_, index) => file('file-' + index + '.txt')));
    expect(queue.files()).toHaveLength(20); expect(queue.error()).toContain('20 files'); expect(new Set(queue.files().map(item => item.reference)).size).toBe(20);
    const references = queue.files().map(item => item.reference); queue.choose([file('extra.txt')]); expect(queue.files().map(item => item.reference)).toEqual(references);
  });
  it('bounds pending pictures without consuming the allowance for documents', () => {
    pictureLimit.set(1); queue.choose([file('one.png', 'image/png'), file('two.webp', 'image/webp'), file('notes.txt')]);
    expect(queue.files().map(item => item.file.name)).toEqual(['one.png', 'notes.txt']); expect(queue.error()).toContain('Remove a picture');
  });
  it('does not count an already completed picture against newly queued picture capacity', async () => {
    pictureLimit.set(1); uploadFile.mockResolvedValueOnce(asset({ kind: 'image', mimeType: 'image/png', filename: 'one.png' }));
    queue.choose([file('one.png', 'image/png')]); await queue.upload(); queue.choose([file('two.png', 'image/png')]);
    expect(queue.files().map(item => item.state)).toEqual(['uploaded', 'queued']); expect(queue.error()).toBe('');
  });
  it('blocks selection, removal and clearing while the caller is read-only', () => {
    queue.choose([file()]); const retained = queue.files()[0]!; disabled.set(true);
    queue.choose([file('other.txt')]); queue.remove(retained.id); queue.clear();
    expect(queue.files()).toEqual([retained]); expect(drafts.dirtyCount()).toBe(1);
  });
  it('dismisses completed rows after a confirmed save even when its parent is disabled', async () => {
    uploadFile.mockResolvedValueOnce(asset()); queue.choose([file()]); await queue.upload(); queue.choose([file('still-pending.txt')]); disabled.set(true); queue.clearCompleted();
    expect(queue.files().map(item => item.file.name)).toEqual(['still-pending.txt']); expect(drafts.dirtyCount()).toBe(1);
  });
  it('clears the queue and active dirty registration without touching another editor scope', () => {
    queue.choose([file()]); scope.set('comment'); TestBed.tick(); queue.choose([file('comment.txt')]); const commentKey = key(); scope.set('attachments'); TestBed.tick(); queue.error.set('prior failure'); queue.clear();
    expect(queue.files()).toEqual([]); expect(queue.error()).toBe(''); expect(drafts.uploads.has(key())).toBe(false); expect(drafts.uploads.get(commentKey)?.[0]?.file.name).toBe('comment.txt'); expect(drafts.dirtyCount()).toBe(0);
  });
  it('removes an unstarted upload locally without dispatching cancellation', async () => {
    queue.choose([file(), file('retained.txt')]); const first = queue.files()[0]!; await queue.cancelUpload(first);
    expect(cancel).not.toHaveBeenCalled(); expect(queue.files().map(item => item.file.name)).toEqual(['retained.txt']); expect(drafts.uploads.get(key())).toEqual(queue.files());
  });
  it('keeps exact cancellation intent across an unconfirmed response and a later successful retry', async () => {
    queue.choose([file()]); const item = queue.files()[0]!; item.sessionId = '60000000-0000-4000-8000-000000000001';
    cancel.mockRejectedValueOnce(new Error('Cancellation acknowledgement unavailable')); await queue.cancelUpload(item); const reference = item.cancelReference;
    expect(reference).toMatch(/^[0-9a-f-]{36}$/); expect(item.error).toBe('Cancellation acknowledgement unavailable'); expect(queue.files()).toEqual([item]);
    await queue.cancelUpload(item); expect(cancel.mock.calls).toEqual([[item.sessionId, reference], [item.sessionId, reference]]); expect(queue.files()).toEqual([]); expect(drafts.dirtyCount()).toBe(0);
  });
  it('exposes the bounded cancellation message when the transport rejects without an Error object', async () => {
    queue.choose([file()]); const item = queue.files()[0]!; item.sessionId = crypto.randomUUID(); cancel.mockRejectedValueOnce('lost acknowledgement'); await queue.cancelUpload(item);
    expect(item.error).toBe('Cancellation could not be confirmed. Retry cancel.'); expect(queue.files()[0]).toBe(item);
  });
  it('uploads a document with its exact metadata and publishes one typed result event', async () => {
    const result = asset(); uploadFile.mockResolvedValueOnce(result); const selected = file(); queue.choose([selected]); const item = queue.files()[0]!; await queue.upload();
    const [id, metadata, submitted, progress, signal] = uploadFile.mock.calls[0]!;
    expect(id).toBe(issueA); expect(metadata).toEqual({ filename: selected.name, description: '', mimeType: 'text/plain', kind: 'file', publication: 'issue' }); expect(submitted).toBe(item); expect(typeof progress).toBe('function'); expect(signal?.aborted).toBe(false);
    expect(documents).toEqual([{ id: result.id, issueId: issueA, filename: result.filename, mimeType: 'text/plain', byteSize: 4, uploader: actor, uploadedAt: result.uploadedAt, attached: true }]); expect(pictures).toEqual([]); expect(changed).toBe(1); expect(queue.pending()).toBe(false); expect(drafts.dirtyCount()).toBe(0);
  });
  it('uploads comment pictures as private drafts without claiming an issue revision change', async () => {
    publication.set('comment_draft'); trackRevision.set(true); const result = asset({ kind: 'image', mimeType: 'image/webp', filename: 'صورة.webp', description: 'صورة', state: 'draft', inPanel: false, expiresAt: '2026-10-21T00:00:00Z' }); uploadFile.mockResolvedValueOnce(result);
    await queue.pasteAndUpload(file('صورة.webp', 'image/webp'));
    expect(uploadFile.mock.calls[0]?.[1]).toMatchObject({ kind: 'image', mimeType: 'image/webp', description: 'صورة.webp', publication: 'draft' });
    expect(pictures).toEqual([{ id: result.id, issueId: issueA, filename: result.filename, description: result.description, mimeType: 'image/webp', byteSize: 4, uploader: actor, uploadedAt: result.uploadedAt, state: 'draft', inGallery: false, expiresAt: result.expiresAt }]); expect(revisions).toEqual([]); expect(changed).toBe(1);
  });
  it('advances the issue revision only when explicitly tracking a published asset', async () => {
    trackRevision.set(true); uploadFile.mockResolvedValueOnce(asset({ issueRevision: '9007199254740993' })); queue.choose([file()]); await queue.upload(); expect(revisions).toEqual(['9007199254740993']);
  });
  it('retains upload failure and stable resume identity while still accepting later files', async () => {
    uploadFile.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce(asset({ filename: 'second.txt' })); queue.choose([file(), file('second.txt')]); const failed = queue.files()[0]!, reference = failed.reference;
    await queue.upload(); expect(queue.files().map(item => item.state)).toEqual(['failed', 'uploaded']); expect(failed.error).toBe('Connection interrupted'); expect(failed.reference).toBe(reference); expect(queue.pending()).toBe(true); expect(changed).toBe(1);
    uploadFile.mockResolvedValueOnce(asset()); await queue.upload(); expect(uploadFile).toHaveBeenCalledTimes(3); expect(uploadFile.mock.calls[2]?.[2]).toBe(failed); expect(failed.reference).toBe(reference); expect(failed.error).toBeUndefined(); expect(queue.pending()).toBe(false); expect(changed).toBe(2);
  });
  it('does not dispatch an empty or disabled queue', async () => {
    await queue.upload(); queue.choose([file()]); disabled.set(true); await queue.upload(); expect(uploadFile).not.toHaveBeenCalled(); expect(queue.busy()).toBe(false); expect(queue.pending()).toBe(true);
  });
  it('retains a useful fallback upload error for non-Error rejection', async () => {
    uploadFile.mockRejectedValueOnce(null); queue.choose([file()]); await queue.upload(); expect(queue.files()[0]?.error).toBe('Upload failed. Retry this queue.'); expect(queue.busy()).toBe(false);
  });
  it('records real progress while refusing edits and completed-row dismissal during a transfer', async () => {
    const pending = deferred<AssetView>(); uploadFile.mockReturnValueOnce(pending.promise); queue.choose([file()]); const first = queue.files()[0]!; const operation = queue.upload();
    expect(queue.busy()).toBe(true); uploadFile.mock.calls[0]![3](3); expect(first.receivedBytes).toBe(3); expect(queue.progress(first)).toBe(75); expect(drafts.uploads.get(key())?.[0]?.receivedBytes).toBe(3);
    queue.choose([file('replacement.txt')]); queue.remove(first.id); queue.clear(); queue.clearCompleted(); expect(queue.files()).toEqual([first]);
    pending.resolve(asset()); await operation; expect(queue.busy()).toBe(false); expect(first.state).toBe('uploaded'); expect(queue.progress({ ...first, receivedBytes: 100 })).toBe(100);
  });
  it('aborts an unstarted active transfer without dropping its resumable queue entry while busy', async () => {
    const pending = deferred<AssetView>(); uploadFile.mockReturnValueOnce(pending.promise); queue.choose([file()]); const item = queue.files()[0]!, operation = queue.upload(), signal = uploadFile.mock.calls[0]![4];
    await queue.cancelUpload(item); expect(signal?.aborted).toBe(true); expect(cancel).not.toHaveBeenCalled(); expect(queue.files()).toEqual([item]);
    pending.reject(new DOMException('Canceled', 'AbortError')); await operation; expect(item.state).toBe('failed'); expect(queue.busy()).toBe(false);
  });
  for (const boundary of ['issue', 'scope', 'epoch', 'destroy'] as const) {
    it('ignores pending upload progress, success and events after ' + boundary + ' ownership changes', async () => {
      const pending = deferred<AssetView>(); uploadFile.mockReturnValueOnce(pending.promise); queue.choose([file('old-private.txt')]); const previousKey = key(), original = queue.files()[0]!, operation = queue.upload(); const [, , , progress, signal] = uploadFile.mock.calls[0]!;
      if (boundary === 'issue') issue.set(issueB);
      else if (boundary === 'scope') scope.set('comment');
      else if (boundary === 'epoch') epoch.set(2);
      else destroyController();
      if (boundary !== 'destroy') TestBed.tick();
      expect(signal?.aborted).toBe(true); progress(4); pending.resolve(asset()); await operation;
      expect(original.receivedBytes).toBeUndefined(); expect(original.state).toBe('queued'); expect(pictures).toEqual([]); expect(documents).toEqual([]); expect(revisions).toEqual([]); expect(changed).toBe(0); expect(drafts.dirtyCount()).toBe(0);
      if (boundary === 'epoch') expect(drafts.uploads.get(previousKey)).toEqual([]);
      else expect(drafts.uploads.get(previousKey)?.[0]).toBe(original);
    });
  }
  it('does not replace the current account queue with an old transfer failure', async () => {
    const pending = deferred<AssetView>(); uploadFile.mockReturnValueOnce(pending.promise); queue.choose([file('private-old.txt')]); const old = queue.files()[0]!, operation = queue.upload();
    epoch.set(2); TestBed.tick(); queue.choose([file('current-owner.txt')]); const current = queue.files()[0]!; pending.reject(new Error('Old private failure')); await operation;
    expect(queue.files()).toEqual([current]); expect(current.state).toBe('queued'); expect(current.error).toBeUndefined(); expect(old.state).toBe('queued'); expect(drafts.uploads.get(key())).toEqual([current]); expect(queue.busy()).toBe(false); expect(changed).toBe(0);
  });
  it('ignores a late policy response after destruction', async () => {
    const pending = deferred<AssetPolicy>(); policy.mockReturnValueOnce(pending.promise); scope.set('late-policy'); TestBed.tick(); destroyController(); pending.resolve({ ...initialPolicy, maximumFileBytes: '1024' }); await flush(); expect(queue.maximumBytes()).toBe(10485760);
  });
  for (const boundary of ['issue', 'scope', 'epoch', 'destroy'] as const) for (const outcome of ['success', 'failure'] as const) {
    it('ignores an old cancellation ' + outcome + ' after ' + boundary + ' ownership changes', async () => {
      const pending = deferred<SavedUploadSessionView>(); cancel.mockReturnValueOnce(pending.promise);
      queue.choose([file('old-cancel.txt'), file('old-retained.txt')]); const previousKey = key(), original = queue.files()[0]!; original.sessionId = crypto.randomUUID();
      const operation = queue.cancelUpload(original);
      if (boundary === 'issue') issue.set(issueB);
      else if (boundary === 'scope') scope.set('comment');
      else if (boundary === 'epoch') epoch.set(2);
      else destroyController();
      if (boundary !== 'destroy') { TestBed.tick(); queue.choose([file('current-owner.txt')]); }
      const expectedFiles = queue.files(), expectedDraft = drafts.uploads.get(key()), expectedDirty = drafts.dirtyCount();
      if (outcome === 'success') pending.resolve(cancelled(original.sessionId));
      else pending.reject(new Error('Previous owner cancellation failed'));
      await operation;
      expect(queue.files()).toEqual(expectedFiles); expect(drafts.uploads.get(key())).toEqual(expectedDraft); expect(drafts.dirtyCount()).toBe(expectedDirty); expect(original.error).toBeUndefined();
      if (boundary === 'epoch') expect(queue.files().map(item => item.file.name)).toEqual(['current-owner.txt']);
      else expect(drafts.uploads.get(previousKey)?.map(item => item.file.name)).toEqual(['old-cancel.txt', 'old-retained.txt']);
    });
  }
  it('does not resurrect an unmounted previous account queue when cancellation finishes after a session change', async () => {
    const pending = deferred<SavedUploadSessionView>(); cancel.mockReturnValueOnce(pending.promise);
    queue.choose([file('canceled-old.txt'), file('other-private-old.txt')]); const previousKey = key(), item = queue.files()[0]!; item.sessionId = crypto.randomUUID();
    const operation = queue.cancelUpload(item); destroyController(); expect(drafts.dirtyCount()).toBe(0);
    epoch.set(2); TestBed.tick(); expect(drafts.uploads.has(previousKey)).toBe(false);
    pending.resolve(cancelled(item.sessionId)); await operation;
    expect(drafts.uploads.has(previousKey)).toBe(false); expect(drafts.dirtyCount()).toBe(0);
  });
});
