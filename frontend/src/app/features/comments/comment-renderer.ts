const formatTags = [
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'em',
  'u',
  'ul',
  'ol',
  'li',
  'blockquote',
  'br',
  'pre',
  'code',
] as const;
export type FormatTag = (typeof formatTags)[number];
export type TextDirection = 'auto' | 'rtl' | 'ltr';
export interface TableCell {
  header: boolean;
  colspan: number;
  rowspan: number;
  direction: TextDirection;
  children: CommentNode[];
}
export interface ChecklistItem {
  checked: boolean;
  direction: TextDirection;
  children: CommentNode[];
}
export type CommentNode =
  | { kind: 'text'; text: string }
  | { kind: 'format'; tag: FormatTag; direction: TextDirection; children: CommentNode[] }
  | { kind: 'link'; href: string; children: CommentNode[] }
  | { kind: 'attachment'; attachmentId: string; label: string }
  | { kind: 'mention'; userId: string; label: string }
  | { kind: 'picture'; pictureId: string; description: string }
  | { kind: 'table'; rows: TableCell[][] }
  | { kind: 'checklist'; items: ChecklistItem[] };
const identifier = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function safeId(value: string | null): value is string {
  return (
    value !== null && identifier.test(value) && value !== '00000000-0000-0000-0000-000000000000'
  );
}
export function safeLink(value: string): string | null {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password
      ? value
      : null;
  } catch {
    return null;
  }
}
function children(parent: ParentNode): CommentNode[] {
  return Array.from(parent.childNodes).flatMap(readNode);
}
function direction(node: HTMLElement): TextDirection {
  const value = node.getAttribute('dir');
  return value === 'rtl' || value === 'ltr' ? value : 'auto';
}
function span(value: string | null): number {
  return value && /^(?:[1-9]|1[0-9]|20)$/.test(value) ? Number(value) : 1;
}
/** Traverse every rich block when checking private references or transforming descriptions. */
export function mapCommentChildren(
  node: CommentNode,
  transform: (children: CommentNode[]) => CommentNode[],
): CommentNode {
  if (node.kind === 'format' || node.kind === 'link')
    return { ...node, children: transform(node.children) };
  if (node.kind === 'table')
    return {
      ...node,
      rows: node.rows.map(row =>
        row.map(cell => ({ ...cell, children: transform(cell.children) })),
      ),
    };
  if (node.kind === 'checklist')
    return {
      ...node,
      items: node.items.map(item => ({ ...item, children: transform(item.children) })),
    };
  return node;
}
export function commentChildren(node: CommentNode): CommentNode[] {
  if (node.kind === 'format' || node.kind === 'link') return node.children;
  if (node.kind === 'table') return node.rows.flatMap(row => row.flatMap(cell => cell.children));
  if (node.kind === 'checklist') return node.items.flatMap(item => item.children);
  return [];
}
function readNode(node: Node): CommentNode[] {
  if (node.nodeType === Node.TEXT_NODE) return [{ kind: 'text', text: node.textContent ?? '' }];
  if (!(node instanceof HTMLElement)) return [];
  const originalTag = node.tagName.toLowerCase();
  const tag = originalTag === 'b' ? 'strong' : originalTag === 'i' ? 'em' : originalTag;
  if (['script', 'style', 'iframe', 'svg', 'math', 'object', 'embed', 'template'].includes(tag))
    return [];
  if (tag === 'img') {
    const id = node.getAttribute('data-picture-id');
    return safeId(id)
      ? [
          {
            kind: 'picture',
            pictureId: id,
            description: node.getAttribute('alt') ?? 'Uploaded picture',
          },
        ]
      : [];
  }
  if (tag === 'span') {
    const id = node.getAttribute('data-user-id');
    return safeId(id)
      ? [{ kind: 'mention', userId: id, label: node.textContent ?? '' }]
      : children(node);
  }
  if (tag === 'a' && safeId(node.getAttribute('data-attachment-id')))
    return [
      {
        kind: 'attachment',
        attachmentId: node.getAttribute('data-attachment-id') ?? '',
        label: node.textContent ?? '',
      },
    ];
  if (tag === 'a') {
    const href = safeLink(node.getAttribute('href') ?? '');
    return href ? [{ kind: 'link', href, children: children(node) }] : children(node);
  }
  if (tag === 'table') {
    const rows = Array.from(node.querySelectorAll('tr'))
      .filter(row => row.closest('table') === node)
      .map(row =>
        Array.from(row.children)
          .filter((cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement)
          .map(cell => ({
            header: cell.tagName === 'TH',
            colspan: span(cell.getAttribute('colspan')),
            rowspan: span(cell.getAttribute('rowspan')),
            direction: direction(cell),
            children: children(cell),
          })),
      );
    return [{ kind: 'table', rows }];
  }
  if (tag === 'ul' && node.getAttribute('data-type') === 'taskList') {
    return [
      {
        kind: 'checklist',
        items: Array.from(node.children)
          .filter(item => item.tagName === 'LI')
          .map(item => ({
            checked: item.getAttribute('data-checked') === 'true',
            direction: direction(item as HTMLElement),
            children: Array.from(item.childNodes)
              .filter(child => !(child instanceof HTMLElement && child.tagName === 'LABEL'))
              .flatMap(readNode),
          })),
      },
    ];
  }
  const allowed = formatTags.find(value => value === tag);
  if (!allowed) return children(node);
  return [{ kind: 'format', tag: allowed, direction: direction(node), children: children(node) }];
}
// An inert template is read at the HTML boundary only. Renderers create typed
// Angular nodes; no HTML from this parser is inserted into the live document.
export function parseCommentNodes(html: string): CommentNode[] {
  if (new TextEncoder().encode(html).length > 65536) return [];
  const template = document.createElement('template');
  template.innerHTML = html;
  return children(template.content);
}

function escapeHTML(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

// Serialize only typed allowed nodes; source HTML never enters the live DOM.
export function commentNodesHTML(nodes: CommentNode[]): string {
  return nodes
    .map(node => {
      switch (node.kind) {
        case 'text':
          return escapeHTML(node.text);
        case 'format':
          return node.tag === 'br'
            ? '<br>'
            : `<${node.tag} dir="${node.direction}">${commentNodesHTML(node.children)}</${node.tag}>`;
        case 'link':
          return `<a href="${escapeHTML(node.href)}">${commentNodesHTML(node.children)}</a>`;
        case 'attachment':
          return `<a data-attachment-id="${node.attachmentId}">${escapeHTML(node.label)}</a>`;
        case 'mention':
          return `<span data-user-id="${node.userId}">${escapeHTML(node.label)}</span>`;
        case 'picture':
          return `<img data-picture-id="${node.pictureId}" alt="${escapeHTML(node.description)}">`;
        case 'table':
          return (
            '<table><tbody>' +
            node.rows
              .map(
                row =>
                  '<tr>' +
                  row
                    .map(cell => {
                      const tag = cell.header ? 'th' : 'td';
                      return `<${tag} dir="${cell.direction}" colspan="${cell.colspan}" rowspan="${cell.rowspan}">${commentNodesHTML(cell.children)}</${tag}>`;
                    })
                    .join('') +
                  '</tr>',
              )
              .join('') +
            '</tbody></table>'
          );
        case 'checklist':
          return (
            '<ul data-type="taskList">' +
            node.items
              .map(
                item =>
                  `<li data-type="taskItem" data-checked="${item.checked}" dir="${item.direction}">${commentNodesHTML(item.children)}</li>`,
              )
              .join('') +
            '</ul>'
          );
      }
    })
    .join('');
}

export function plainTextHTML(value: string): string {
  return '<p dir="auto">' + escapeHTML(value).replaceAll('\n', '<br>') + '</p>';
}
