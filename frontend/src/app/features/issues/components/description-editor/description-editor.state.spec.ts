// Unit-only public controller contracts: revision acknowledgements, file queue
// delegation and pre-render validation. Actual rich-text rendering stays in E2E.
import '@angular/compiler';
import { Injector, provideZonelessChangeDetection, RendererFactory2, signal, type DestroyableInjector } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetView } from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { AssetsApi } from '../../../attachments/assets.api';
import { FileQueueComponent } from '../../../attachments/components/file-queue/file-queue.component';
import { PicturesApi } from '../../../pictures/pictures.api';
import { DescriptionEditorComponent } from './description-editor.component';

const issueId = '50000000-0000-4000-8000-000000000001';
const actor = { id: '10000000-0000-4000-8000-000000000001', displayName: 'Authorized author' };
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(yes => { resolve = yes; }); return { promise, resolve }; }
function asset(): AssetView { return { id: crypto.randomUUID(), issueId, issueRevision: '2', filename: 'evidence.txt', description: '', kind: 'file', mimeType: 'text/plain', byteSize: '4', state: 'published', inPanel: true, expiresAt: null, uploader: actor, uploadedAt: '2026-10-20T00:00:00Z' }; }
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
describe('description editor public revision and attachment contracts', () => {
  const issue = signal(issueId), disabled = signal(false), epoch = signal(1);
  const policy = vi.fn<AssetsApi['policy']>(), uploadFile = vi.fn<AssetsApi['uploadFile']>(), content = vi.fn<PicturesApi['content']>();
  const changed: string[] = [], revisions: string[] = [];
  let editor: DescriptionEditorComponent, queue: FileQueueComponent, controller: DestroyableInjector, drafts: DraftsService;
  beforeEach(async () => {
    issue.set(issueId); disabled.set(false); epoch.set(1); changed.length = 0; revisions.length = 0;
    policy.mockReset().mockResolvedValue({ maximumFileBytes: '10485760', maximumImageBytes: '10485760', chunkBytes: '1048576' }); uploadFile.mockReset(); content.mockReset();
    vi.stubGlobal('window', Object.assign(new EventTarget(), { confirm: vi.fn(() => true) }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { sessionEpoch: epoch, me: signal({ userId: actor.id }) } },
      { provide: AssetsApi, useValue: { policy, uploadFile } satisfies Pick<AssetsApi, 'policy' | 'uploadFile'> },
      { provide: PicturesApi, useValue: { content } satisfies Pick<PicturesApi, 'content'> },
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('These units do not render templates.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
    ] });
    drafts = TestBed.inject(DraftsService);
    controller = Injector.create({ parent: TestBed.inject(Injector), providers: [{ provide: DescriptionEditorComponent, useFactory: () => new DescriptionEditorComponent() }, { provide: FileQueueComponent, useFactory: () => new FileQueueComponent() }] });
    editor = controller.get(DescriptionEditorComponent); queue = controller.get(FileQueueComponent);
    Object.defineProperties(editor, { issueId: { value: issue.asReadonly() }, disabled: { value: disabled.asReadonly() } });
    Object.defineProperties(queue, { issueId: { value: issue.asReadonly() }, disabled: { value: disabled.asReadonly() }, queueScope: { value: signal('description').asReadonly() } });
    vi.spyOn(editor, 'fileQueue').mockReturnValue(queue); editor.changed.subscribe(value => changed.push(value)); editor.uploadedRevision.subscribe(value => revisions.push(value));
    TestBed.tick(); await flush();
  });
  afterEach(() => { controller.destroy(); TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it('requires a loaded rich-text view before a description can be committed', () => {
    editor.source.setValue('<p>Unsent description: مرحبا</p>'); expect(editor.commit()).toBe(false); expect(editor.ready()).toBe(false); expect(changed).toEqual([]); expect(editor.source.value).toContain('مرحبا');
  });
  it('does not emit source text merely because its inactive source control changed', () => {
    editor.source.setValue('<p>Edited before initialization</p>'); expect(changed).toEqual([]); expect(editor.sourceMode()).toBe(false);
  });
  it('advances upload acknowledgements only through adjacent issue revisions', () => {
    editor.advanceRevision('1'); editor.advanceRevision('3'); expect(revisions).toEqual([]);
    editor.advanceRevision('2'); editor.advanceRevision('2'); editor.advanceRevision('1'); expect(revisions).toEqual(['2']);
    editor.advanceRevision('3'); expect(revisions).toEqual(['2', '3']); expect(changed).toEqual([]);
  });
  it('does not round a distant exact revision into the next expected acknowledgement', () => {
    editor.advanceRevision('9007199254740993'); expect(revisions).toEqual([]); editor.advanceRevision('2'); expect(revisions).toEqual(['2']);
  });
  it('opens an existing issue attachment queue without starting an upload', () => {
    const choose = vi.spyOn(queue, 'chooseFiles'); editor.attachFiles(); expect(choose).toHaveBeenCalledOnce(); expect(editor.attachmentsOpen()).toBe(true); expect(uploadFile).not.toHaveBeenCalled();
  });
  it('keeps read-only attachment controls closed', () => {
    const choose = vi.spyOn(queue, 'chooseFiles'); disabled.set(true); editor.attachFiles(); expect(editor.attachmentsOpen()).toBe(false); expect(choose).not.toHaveBeenCalled();
  });
  it('does not open an issue attachment queue for an issue which has not been created', () => {
    const choose = vi.spyOn(queue, 'chooseFiles'); issue.set(''); TestBed.tick(); editor.attachFiles(); expect(editor.attachmentsOpen()).toBe(false); expect(choose).not.toHaveBeenCalled(); expect(uploadFile).not.toHaveBeenCalled();
  });
  it('reports actual queued, in-flight and completed transfer state through the child boundary', async () => {
    expect(editor.uploadPending()).toBe(false); queue.choose([new File(['data'], 'evidence.txt', { type: 'text/plain' })]); expect(editor.uploadPending()).toBe(true);
    const pending = deferred<AssetView>(); uploadFile.mockReturnValueOnce(pending.promise); const transfer = queue.upload(); expect(queue.busy()).toBe(true); expect(editor.uploadPending()).toBe(true);
    pending.resolve(asset()); await transfer; expect(editor.uploadPending()).toBe(false); expect(queue.files()[0]?.state).toBe('uploaded');
  });
  it('handles an absent child queue without pretending a file transfer exists', () => {
    vi.mocked(editor.fileQueue).mockReturnValue(undefined); expect(editor.uploadPending()).toBe(false); expect(() => editor.saved()).not.toThrow(); expect(editor.attachmentsOpen()).toBe(false);
  });
  it('dismisses completed files after save while retaining an unuploaded retry intent', async () => {
    uploadFile.mockResolvedValueOnce(asset()); queue.choose([new File(['data'], 'done.txt', { type: 'text/plain' })]); await queue.upload(); queue.choose([new File(['later'], 'pending.txt', { type: 'text/plain' })]); const retained = queue.files()[1]!;
    editor.attachFiles(); editor.saved(); expect(queue.files()).toEqual([retained]); expect(editor.uploadPending()).toBe(true); expect(editor.attachmentsOpen()).toBe(false); expect(drafts.dirtyCount()).toBe(1); expect(changed).toEqual([]);
  });
  for (const href of ['javascript:alert(1)', 'data:text/html,unsafe', '//example.test/path', 'https://name:password@example.test']) {
    it('retains unsafe link input and source while giving the specific validation message: ' + href.split(':')[0], () => {
      editor.source.setValue('<p>Retained original</p>'); editor.link.setValue(href); editor.addLink();
      expect(editor.error()).toBe('Enter an HTTP or HTTPS link address.'); expect(editor.link.value).toBe(href); expect(editor.source.value).toBe('<p>Retained original</p>'); expect(changed).toEqual([]);
    });
  }
  it('clears link validation feedback for a safe normalized URL without claiming a rendered insertion', () => {
    editor.link.setValue('javascript:invalid'); editor.addLink(); editor.link.setValue('  https://example.test/docs  '); editor.addLink(); expect(editor.error()).toBe(''); expect(editor.ready()).toBe(false); expect(changed).toEqual([]);
  });
});
