// Public controller boundaries before a rich-text view is mounted. These units
// do not replace the real Tiptap/browser formatting and HTML acceptance tests.
import '@angular/compiler';
import { Injector, provideZonelessChangeDetection, RendererFactory2, signal, type DestroyableInjector } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetView, CommentBody } from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { AssetsApi } from '../../../attachments/assets.api';
import { FileQueueComponent } from '../../../attachments/components/file-queue/file-queue.component';
import { PicturesApi } from '../../../pictures/pictures.api';
import { CommentEditorComponent } from './comment-editor.component';

const issueId = '50000000-0000-4000-8000-000000000001';
const projectId = '20000000-0000-4000-8000-000000000001';
const actor = { id: '10000000-0000-4000-8000-000000000001', displayName: 'Authorized author' };
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
describe('comment editor public validation and file handoff boundaries', () => {
  const epoch = signal(1), busy = signal(false), approved = signal<{ userId: string } | null>({ userId: actor.id });
  const policy = vi.fn<AssetsApi['policy']>(), uploadFile = vi.fn<AssetsApi['uploadFile']>(), content = vi.fn<PicturesApi['content']>(), confirm = vi.fn<Window['confirm']>();
  let editor: CommentEditorComponent, queue: FileQueueComponent, drafts: DraftsService, controller: DestroyableInjector;
  const saved: CommentBody[] = [];
  beforeEach(async () => {
    epoch.set(1); busy.set(false); approved.set({ userId: actor.id }); saved.length = 0;
    policy.mockReset().mockResolvedValue({ maximumFileBytes: '10485760', maximumImageBytes: '10485760', chunkBytes: '1048576' }); uploadFile.mockReset(); content.mockReset(); confirm.mockReset().mockReturnValue(true);
    vi.stubGlobal('window', Object.assign(new EventTarget(), { confirm }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { sessionEpoch: epoch, me: approved } },
      { provide: AssetsApi, useValue: { policy, uploadFile } satisfies Pick<AssetsApi, 'policy' | 'uploadFile'> },
      { provide: PicturesApi, useValue: { content } satisfies Pick<PicturesApi, 'content'> },
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('No template is rendered in these controller units.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
    ] });
    drafts = TestBed.inject(DraftsService);
    controller = Injector.create({ parent: TestBed.inject(Injector), providers: [{ provide: CommentEditorComponent, useFactory: () => new CommentEditorComponent() }, { provide: FileQueueComponent, useFactory: () => new FileQueueComponent() }] });
    editor = controller.get(CommentEditorComponent); queue = controller.get(FileQueueComponent);
    Object.defineProperties(editor, { issueId: { value: signal(issueId).asReadonly() }, projectId: { value: signal(projectId).asReadonly() }, busy: { value: busy.asReadonly() } });
    Object.defineProperties(queue, { issueId: { value: signal(issueId).asReadonly() }, queueScope: { value: signal('comment:new').asReadonly() } });
    // A real child controller supplies this public child-query boundary. No
    // private editor/query state is changed or rich-text view fabricated.
    vi.spyOn(editor, 'fileQueue').mockReturnValue(queue); editor.save.subscribe(body => saved.push(body));
    TestBed.tick(); await flush();
  });
  afterEach(() => { controller.destroy(); TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it('does not publish or discard selected files while its rich-text view has not loaded', () => {
    queue.choose([new File(['private'], 'draft.txt', { type: 'text/plain' })]); const selected = queue.files()[0]!;
    editor.source.setValue('<p>Unsent Arabic: مرحبا</p>'); editor.submit();
    expect(editor.ready()).toBe(false); expect(saved).toEqual([]); expect(uploadFile).not.toHaveBeenCalled(); expect(queue.files()).toEqual([selected]); expect(editor.source.value).toContain('مرحبا');
  });
  it('hands attachment selection to the real queue without implicitly uploading or publishing', () => {
    const choose = vi.spyOn(queue, 'chooseFiles'); editor.attachFiles();
    expect(editor.attachmentsOpen()).toBe(true); expect(choose).toHaveBeenCalledOnce(); expect(uploadFile).not.toHaveBeenCalled(); expect(saved).toEqual([]);
  });
  it('does not open a new attachment picker while the parent is saving', () => {
    const choose = vi.spyOn(queue, 'chooseFiles'); busy.set(true); editor.attachFiles();
    expect(editor.attachmentsOpen()).toBe(false); expect(choose).not.toHaveBeenCalled();
  });
  it('can safely open attachment controls even before the child queue exists', () => {
    vi.mocked(editor.fileQueue).mockReturnValue(undefined); expect(() => editor.attachFiles()).not.toThrow(); expect(editor.attachmentsOpen()).toBe(true);
  });
  it('dismisses only completed file rows after a confirmed save, preserving pending retry identity', async () => {
    const result: AssetView = { id: crypto.randomUUID(), issueId, issueRevision: '2', filename: 'done.txt', description: '', kind: 'file', mimeType: 'text/plain', byteSize: '4', inPanel: true, state: 'published', expiresAt: null, uploadedAt: '2026-10-20T00:00:00Z', uploader: actor };
    uploadFile.mockResolvedValueOnce(result); queue.choose([new File(['done'], 'done.txt', { type: 'text/plain' })]); await queue.upload(); queue.choose([new File(['later'], 'later.txt', { type: 'text/plain' })]); const retained = queue.files()[1]!;
    editor.attachFiles(); busy.set(true); editor.saved();
    expect(queue.files()).toEqual([retained]); expect(editor.attachmentsOpen()).toBe(false); expect(drafts.dirtyCount()).toBe(1); expect(saved).toEqual([]);
  });
  it('uses the real unsaved-draft confirmation rather than silently dismissing pending work', () => {
    queue.choose([new File(['draft'], 'pending.txt', { type: 'text/plain' })]); confirm.mockReturnValueOnce(false).mockReturnValueOnce(true);
    expect(editor.confirmClose()).toBe(false); expect(editor.confirmClose()).toBe(true); expect(confirm).toHaveBeenCalledTimes(2); expect(queue.pending()).toBe(true);
  });
  it('does not ask to retain another account draft after actual global epoch clearing', () => {
    queue.choose([new File(['private'], 'old.txt', { type: 'text/plain' })]); epoch.set(2); TestBed.tick();
    expect(editor.confirmClose()).toBe(true); expect(confirm).not.toHaveBeenCalled(); expect(drafts.dirtyCount()).toBe(0); expect(queue.files()).toEqual([]);
  });
  for (const href of ['javascript:alert(1)', 'data:text/html,private', '//external.example/path', 'https://user:secret@example.test']) {
    it('rejects an unsafe link address without losing the entered draft: ' + href.split(':')[0], () => {
      editor.source.setValue('<p>Retained draft</p>'); editor.link.setValue(href); editor.addLink();
      expect(editor.error()).toBe('Enter an HTTP or HTTPS link address.'); expect(editor.link.value).toBe(href); expect(editor.source.value).toBe('<p>Retained draft</p>'); expect(saved).toEqual([]);
    });
  }
  it('validates and normalizes a safe link without claiming insertion into an absent rich-text view', () => {
    editor.link.setValue('javascript:bad'); editor.addLink(); expect(editor.error()).not.toBe(''); editor.link.setValue('  https://example.test/path  '); editor.addLink();
    expect(editor.error()).toBe(''); expect(editor.ready()).toBe(false); expect(saved).toEqual([]); expect(content).not.toHaveBeenCalled();
  });
  it('does not invent an active mention or HTML-mode transition before the editor is ready', () => {
    editor.beginMention(); expect(editor.mentionQuery()).toBeNull(); editor.showSource(); expect(editor.sourceMode()).toBe(false); editor.focusEditor();
    expect(editor.ready()).toBe(false); expect(editor.source.value).toBe(''); expect(saved).toEqual([]);
  });
});
