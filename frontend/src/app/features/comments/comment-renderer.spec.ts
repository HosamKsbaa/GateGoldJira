import { describe, expect, it } from 'vitest';
import {
  commentChildren,
  commentNodesHTML,
  mapCommentChildren,
  plainTextHTML,
  safeLink,
  type CommentNode,
} from './comment-renderer';
describe('comment link safety boundary', () => {
  it.each([
    'javascript:alert(1)',
    ' \tJavaScript:\nalert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    '//example.test/path',
    'https://user:password@example.test/private',
    'https://user@example.test/private',
    '',
  ])('rejects executable, credentialed or ambiguous link %s', value => {
    expect(safeLink(value)).toBeNull();
  });
  it.each([
    'https://example.test/عمل?issue=GG-12',
    'http://localhost:8080/work',
    'https://example.test/path#comment',
  ])('preserves a supported absolute link %s', value => {
    expect(safeLink(value)).toBe(value);
  });
});
describe('HTML editing serialization', () => {
  it('preserves Arabic formatting while encoding text as content', () => {
    expect(
      commentNodesHTML([
        {
          kind: 'format',
          tag: 'p',
          direction: 'rtl',
          children: [
            { kind: 'text', text: 'مرحبا <script> & الفريق' },
            {
              kind: 'format',
              tag: 'strong',
              direction: 'auto',
              children: [{ kind: 'text', text: 'غامق' }],
            },
          ],
        },
      ]),
    ).toBe('<p dir="rtl">مرحبا &lt;script&gt; &amp; الفريق<strong dir="auto">غامق</strong></p>');
  });
  it('encodes attributes and retains only explicit private reference fields', () => {
    expect(
      commentNodesHTML([
        {
          kind: 'picture',
          pictureId: '40000000-0000-4000-8000-000000000001',
          description: 'صورة " عربية <',
        },
        { kind: 'mention', userId: '10000000-0000-4000-8000-000000000001', label: '<Admin>' },
      ]),
    ).toBe(
      '<img data-picture-id="40000000-0000-4000-8000-000000000001" alt="صورة &quot; عربية &lt;"><span data-user-id="10000000-0000-4000-8000-000000000001">&lt;Admin&gt;</span>',
    );
  });
  it('opens legacy plain text as literal text, including line breaks', () => {
    expect(plainTextHTML('<h2>literal</h2>\nعربي')).toBe(
      '<p dir="auto">&lt;h2&gt;literal&lt;/h2&gt;<br>عربي</p>',
    );
  });
  it('serializes tables and checklist completion with encoded content and bounded semantic attributes', () => {
    const nodes: CommentNode[] = [
      {
        kind: 'table',
        rows: [
          [
            {
              header: true,
              colspan: 2,
              rowspan: 1,
              direction: 'rtl',
              children: [{ kind: 'text', text: 'عنوان <script>' }],
            },
          ],
        ],
      },
      {
        kind: 'checklist',
        items: [
          { checked: true, direction: 'rtl', children: [{ kind: 'text', text: 'راجع & اختبر' }] },
        ],
      },
      {
        kind: 'format',
        tag: 'pre',
        direction: 'ltr',
        children: [
          {
            kind: 'format',
            tag: 'code',
            direction: 'auto',
            children: [{ kind: 'text', text: 'if (a < b) {\n  مرحبا();\n}' }],
          },
        ],
      },
    ];
    const html = commentNodesHTML(nodes);
    expect(html).toContain(
      '<table><tbody><tr><th dir="rtl" colspan="2" rowspan="1">عنوان &lt;script&gt;</th></tr></tbody></table>',
    );
    expect(html).toContain(
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true" dir="rtl">راجع &amp; اختبر</li></ul>',
    );
    expect(html).toContain('if (a &lt; b) {\n  مرحبا();\n}');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<input');
  });
  it('visits private references inside tables and nested checklists rather than bypassing reference checks', () => {
    const picture: CommentNode = {
      kind: 'picture',
      pictureId: '40000000-0000-4000-8000-000000000001',
      description: 'private',
    };
    const mention: CommentNode = {
      kind: 'mention',
      userId: '10000000-0000-4000-8000-000000000001',
      label: 'مطور',
    };
    const nested: CommentNode = {
      kind: 'table',
      rows: [
        [
          {
            header: false,
            colspan: 1,
            rowspan: 1,
            direction: 'auto',
            children: [
              {
                kind: 'checklist',
                items: [{ checked: false, direction: 'rtl', children: [picture, mention] }],
              },
            ],
          },
        ],
      ],
    };
    const visit = (node: CommentNode): CommentNode[] => [
      node,
      ...commentChildren(node).flatMap(visit),
    ];
    expect(
      visit(nested).filter(node => node.kind === 'picture' || node.kind === 'mention'),
    ).toEqual([picture, mention]);
    const replaceMentions = (nodes: CommentNode[]): CommentNode[] =>
      nodes.map(node =>
        node.kind === 'mention'
          ? { kind: 'text', text: node.label }
          : mapCommentChildren(node, replaceMentions),
      );
    const transformed = replaceMentions([nested]);
    expect(commentNodesHTML(transformed)).toContain('مطور');
    expect(commentNodesHTML(transformed)).not.toContain('data-user-id');
    expect(commentNodesHTML(transformed)).toContain('data-picture-id');
  });
});

it('serializes protected file labels without executable markup', () => {
  const id = '90000000-0000-4000-8000-000000000001';
  const nodes: CommentNode[] = [
    { kind: 'attachment', attachmentId: id, label: 'مراجعة <script>.txt' },
  ];
  expect(commentNodesHTML(nodes)).toBe(
    '<a data-attachment-id="' + id + '">مراجعة &lt;script&gt;.txt</a>',
  );
});
