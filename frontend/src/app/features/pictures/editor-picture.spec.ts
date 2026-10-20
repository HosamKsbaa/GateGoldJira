import { Node, type NodeViewRenderer } from '@tiptap/core';
import { Schema } from '@tiptap/pm/model';
import type { NodeView } from '@tiptap/pm/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { protectedPictureExtension } from './editor-picture';
import type { PicturesApi } from './pictures.api';

const pictureId = '70000000-0000-4000-8000-000000000001';
const description = 'مراجعة التصميم';
const schema = new Schema({ nodes: {
  doc: { content: 'protectedPicture*' }, text: {},
  protectedPicture: { atom: true, attrs: { pictureId: {}, description: {} } },
} });

// The default unit environment has no browser DOM. This small output adapter
// records DOM operations; the real extension, schema node, abort signals and
// promises are exercised without mounting an unrelated editor or renderer.
class OutputElement {
  className = '';
  contentEditable = '';
  textContent = '';
  src = '';
  alt = '';
  readonly children: OutputElement[] = [];
  constructor(readonly tagName: string) {}
  append(child: OutputElement) { this.children.push(child); }
  prepend(child: OutputElement) { this.children.unshift(child); }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function mount(scope: AbortSignal) {
  const pending = deferred<Blob>();
  const content = vi.fn<Pick<PicturesApi, 'content'>['content']>().mockReturnValue(pending.promise);
  const extension = protectedPictureExtension(Node, { content } as unknown as PicturesApi, scope);
  const factory = extension.config.addNodeView;
  if (!factory) throw new Error('The protected picture extension must provide a node view.');
  const render = Reflect.apply(factory, undefined, []) as NodeViewRenderer;
  const node = schema.node('protectedPicture', { pictureId, description });
  // This atomic node view consumes only the real ProseMirror node, and has no
  // dependency on an editor/view. Avoid manufacturing browser/editor internals.
  const view = Reflect.apply(render, undefined, [{ node }]) as NodeView;
  return { content, pending, view, dom: view.dom as unknown as OutputElement };
}

async function settle() { await Promise.resolve(); await Promise.resolve(); }

describe('protected editor picture resource ownership', () => {
  const createObjectURL = vi.fn<(blob: Blob | MediaSource) => string>();
  const revokeObjectURL = vi.fn<(url: string) => void>();

  beforeEach(() => {
    createObjectURL.mockReset().mockReturnValue('blob:private-editor-picture');
    revokeObjectURL.mockReset();
    vi.stubGlobal('document', { createElement: (tag: string) => new OutputElement(tag) });
    vi.spyOn(URL, 'createObjectURL').mockImplementation(createObjectURL);
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revokeObjectURL);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('loads a private blob through a separately owned signal and revokes its URL when removed', async () => {
    const scope = new AbortController(), { content, pending, view, dom } = mount(scope.signal);
    const requestSignal = content.mock.calls[0]![1];
    expect(content).toHaveBeenCalledOnce();
    expect(content.mock.calls[0]![0]).toBe(pictureId);
    expect(requestSignal).not.toBe(scope.signal);
    expect(requestSignal?.aborted).toBe(false);
    expect(dom.className).toBe('editor-picture'); expect(dom.contentEditable).toBe('false');
    expect(dom.children.map(child => child.textContent)).toEqual([description]);
    const blob = new Blob(['private image'], { type: 'image/png' });
    pending.resolve(blob); await settle();
    expect(createObjectURL).toHaveBeenCalledExactlyOnceWith(blob);
    expect(dom.children.map(child => child.tagName)).toEqual(['img', 'span']);
    expect(dom.children[0]).toMatchObject({ src: 'blob:private-editor-picture', alt: description });
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(view.ignoreMutation?.({ type: 'selection', target: view.dom })).toBe(true);
    view.destroy?.();
    expect(requestSignal?.aborted).toBe(true);
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:private-editor-picture');
  });

  it('aborts a destroyed pending view, unregisters its scope listener and ignores a late successful load', async () => {
    const scope = new AbortController(), removeListener = vi.spyOn(scope.signal, 'removeEventListener');
    const { content, pending, view, dom } = mount(scope.signal);
    const requestSignal = content.mock.calls[0]![1];
    view.destroy?.();
    expect(requestSignal?.aborted).toBe(true);
    expect(removeListener).toHaveBeenCalledOnce();
    expect(removeListener.mock.calls[0]?.[0]).toBe('abort');
    pending.resolve(new Blob(['late private bytes'])); await settle();
    expect(createObjectURL).not.toHaveBeenCalled(); expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(dom.children.map(child => child.textContent)).toEqual([description]);
  });

  it('propagates editor scope cancellation and prevents a late load from entering the editor', async () => {
    const scope = new AbortController(), { content, pending, view, dom } = mount(scope.signal);
    scope.abort();
    expect(content.mock.calls[0]![1]?.aborted).toBe(true);
    pending.resolve(new Blob(['reply after account/editor cancellation'])); await settle();
    expect(createObjectURL).not.toHaveBeenCalled(); expect(dom.children).toHaveLength(1);
    expect(dom.children[0]?.textContent).toBe(description);
    view.destroy?.(); expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('does not render a delayed picture when its editor scope was already canceled', async () => {
    const scope = new AbortController(); scope.abort();
    const { content, pending, view, dom } = mount(scope.signal);
    expect(content.mock.calls[0]![1]?.aborted).toBe(true);
    pending.resolve(new Blob(['stale private reply'])); await settle();
    expect(createObjectURL).not.toHaveBeenCalled(); expect(dom.children).toHaveLength(1);
    view.destroy?.(); expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('shows an actionable description when a current content request fails', async () => {
    const scope = new AbortController(), { pending, view, dom } = mount(scope.signal);
    pending.reject(new Error('offline')); await settle();
    expect(dom.children.map(child => child.textContent)).toEqual(['Picture unavailable: ' + description]);
    expect(createObjectURL).not.toHaveBeenCalled();
    view.destroy?.(); expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('does not let a rejected stale request overwrite a destroyed view caption', async () => {
    const scope = new AbortController(), { pending, view, dom } = mount(scope.signal);
    view.destroy?.(); pending.reject(new Error('request canceled')); await settle();
    expect(dom.children.map(child => child.textContent)).toEqual([description]);
    expect(createObjectURL).not.toHaveBeenCalled(); expect(revokeObjectURL).not.toHaveBeenCalled();
  });

  it('keeps simultaneous picture views independent when one is removed', async () => {
    const scope = new AbortController(), first = mount(scope.signal), second = mount(scope.signal);
    first.view.destroy?.();
    expect(first.content.mock.calls[0]![1]?.aborted).toBe(true);
    expect(second.content.mock.calls[0]![1]?.aborted).toBe(false);
    second.pending.resolve(new Blob(['still current'])); await settle();
    expect(first.dom.children).toHaveLength(1); expect(second.dom.children).toHaveLength(2);
    scope.abort(); expect(second.content.mock.calls[0]![1]?.aborted).toBe(true);
    second.view.destroy?.();
    expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:private-editor-picture');
    first.pending.resolve(new Blob(['removed'])); await settle(); expect(createObjectURL).toHaveBeenCalledOnce();
  });
});
