import type { Node as TiptapNode } from '@tiptap/core';
import * as z from 'zod';
import type { PicturesApi } from './pictures.api';
const attributes = z.object({ pictureId: z.uuid(), description: z.string() });
export function protectedPictureExtension(
  Node: typeof TiptapNode,
  pictures: PicturesApi,
  scope: AbortSignal,
) {
  return Node.create({
    name: 'protectedPicture',
    group: 'inline',
    inline: true,
    atom: true,
    addAttributes: () => ({
      pictureId: { default: null, parseHTML: element => element.getAttribute('data-picture-id') },
      description: {
        default: 'Uploaded picture',
        parseHTML: element => element.getAttribute('alt') ?? 'Uploaded picture',
      },
    }),
    parseHTML: () => [{ tag: 'img[data-picture-id]' }],
    renderHTML: ({ node }) => {
      const attrs = attributes.parse(node.attrs);
      return ['img', { 'data-picture-id': attrs.pictureId, alt: attrs.description }];
    },
    addNodeView:
      () =>
      ({ node }) => {
        const attrs = attributes.parse(node.attrs),
          dom = document.createElement('span');
        dom.className = 'editor-picture';
        dom.contentEditable = 'false';
        const caption = document.createElement('span');
        caption.textContent = attrs.description;
        dom.append(caption);
        const controller = new AbortController();
        const abort = () => controller.abort();
        if (scope.aborted) abort();
        else scope.addEventListener('abort', abort);
        let source: string | null = null,
          removed = false;
        void pictures
          .content(attrs.pictureId, controller.signal)
          .then(blob => {
            if (removed || scope.aborted) return;
            source = URL.createObjectURL(blob);
            const image = document.createElement('img');
            image.src = source;
            image.alt = attrs.description;
            dom.prepend(image);
          })
          .catch(() => {
            if (!removed) caption.textContent = 'Picture unavailable: ' + attrs.description;
          });
        return {
          dom,
          ignoreMutation: () => true,
          destroy: () => {
            removed = true;
            controller.abort();
            scope.removeEventListener('abort', abort);
            if (source) URL.revokeObjectURL(source);
          },
        };
      },
  });
}
