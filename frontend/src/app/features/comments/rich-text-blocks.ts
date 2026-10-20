import type { Editor } from '@tiptap/core';

/** Shared blocks keep description and comment HTML compatible without loading editors at startup. */
export async function loadRichTextBlocks() {
  const [{ TableKit, TableCell, TableHeader }, { TaskList, TaskItem }] = await Promise.all([
    import('@tiptap/extension-table'),
    import('@tiptap/extension-list'),
  ]);
  const cellAttributes = () => ({
    colspan: {
      default: 1,
      parseHTML: (element: HTMLElement) => boundedSpan(element.getAttribute('colspan')),
    },
    rowspan: {
      default: 1,
      parseHTML: (element: HTMLElement) => boundedSpan(element.getAttribute('rowspan')),
    },
    colwidth: { default: null, rendered: false, parseHTML: () => null },
  });
  const ChecklistItem = TaskItem.extend({
    parseHTML() {
      return [
        {
          tag: `li[data-type="${this.name}"]`,
          priority: 51,
          contentElement: checklistContentElement,
        },
      ];
    },
    // The editor's node view supplies checkboxes. Stored HTML carries only the checked state.
    renderHTML({ HTMLAttributes }) {
      return ['li', { ...HTMLAttributes, 'data-type': 'taskItem' }, 0];
    },
  });
  return [
    TableKit.configure({
      table: { resizable: false, renderWrapper: true },
      tableCell: false,
      tableHeader: false,
    }),
    TableCell.extend({ addAttributes: cellAttributes }),
    TableHeader.extend({ addAttributes: cellAttributes }),
    TaskList,
    ChecklistItem.configure({
      nested: true,
      a11y: {
        checkboxLabel: node =>
          'Checklist item: ' + (node.textContent.slice(0, 100) || 'Empty item'),
      },
    }),
  ];
}

/** Accept Tiptap's legacy checkbox wrapper without mistaking a nested table for the item's content. */
export function checklistContentElement(element: HTMLElement): HTMLElement {
  const checkboxLabel = Array.from(element.children).find(
    child => child.tagName === 'LABEL' && child.querySelector('input[type="checkbox"]'),
  );
  const legacyContent = checkboxLabel?.nextElementSibling;
  return legacyContent?.tagName === 'DIV' ? (legacyContent as HTMLElement) : element;
}

function boundedSpan(value: string | null): number {
  return value && /^(?:[1-9]|1[0-9]|20)$/.test(value) ? Number(value) : 1;
}

export type TableAction = 'insert' | 'row' | 'column' | 'removeRow' | 'removeColumn' | 'remove';
export const tableActions: { action: TableAction; label: string }[] = [
  { action: 'insert', label: 'Insert table' },
  { action: 'row', label: 'Add row below' },
  { action: 'column', label: 'Add column after' },
  { action: 'removeRow', label: 'Delete row' },
  { action: 'removeColumn', label: 'Delete column' },
  { action: 'remove', label: 'Delete table' },
];
export function editTable(editor: Editor, action: TableAction): void {
  editor.view.focus();
  const chain = editor.chain().focus();
  switch (action) {
    case 'insert':
      chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
      break;
    case 'row':
      chain.addRowAfter().run();
      break;
    case 'column':
      chain.addColumnAfter().run();
      break;
    case 'removeRow':
      chain.deleteRow().run();
      break;
    case 'removeColumn':
      chain.deleteColumn().run();
      break;
    case 'remove':
      chain.deleteTable().run();
      break;
  }
}
