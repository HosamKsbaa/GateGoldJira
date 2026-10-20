import type { Node as TiptapNode } from '@tiptap/core';
import * as z from 'zod';
const attributes = z.object({ attachmentId: z.uuid(), label: z.string() });
export function protectedAttachmentExtension(Node: typeof TiptapNode, issueId: string) {
  return Node.create({
    name: 'protectedAttachment',
    group: 'inline',
    inline: true,
    atom: true,
    priority: 1000,
    addAttributes: () => ({
      attachmentId: {
        default: null,
        parseHTML: element => element.getAttribute('data-attachment-id'),
      },
      label: { default: '', parseHTML: element => element.textContent ?? '' },
    }),
    parseHTML: () => [{ tag: 'a[data-attachment-id]' }],
    renderHTML: ({ node }) => {
      const value = attributes.parse(node.attrs);
      return [
        'a',
        {
          'data-attachment-id': value.attachmentId,
          href: `/issues/${issueId}?attachment=${value.attachmentId}`,
        },
        value.label,
      ];
    },
    renderText: ({ node }) => attributes.parse(node.attrs).label,
  });
}
