import { describe, expect, it } from 'vitest';
import { commentChildren, mapCommentChildren, commentNodesHTML, type CommentNode } from './comment-renderer';
const picture: CommentNode = { kind: 'picture', pictureId: '40000000-0000-4000-8000-000000000001', description: 'عرض <script> "آمن"' };
const mention: CommentNode = { kind: 'mention', userId: '10000000-0000-4000-8000-000000000002', label: '@مطور <الفريق>' };
const attachment: CommentNode = { kind: 'attachment', attachmentId: '90000000-0000-4000-8000-000000000001', label: 'ملف <img>.txt' };
const leaves: CommentNode[] = [{ kind: 'text', text: 'قبل & بعد' }, picture, mention, attachment];
function walk(node: CommentNode): CommentNode[] { return [node, ...commentChildren(node).flatMap(walk)]; }
describe('private editor references remain reachable through every rich block', () => {
    it.each([
        { kind: 'format', tag: 'blockquote', direction: 'rtl', children: leaves },
        { kind: 'link', href: 'https://example.test/work', children: leaves },
        { kind: 'table', rows: [[{ header: false, colspan: 2, rowspan: 1, direction: 'rtl', children: leaves }]] },
        { kind: 'checklist', items: [{ checked: false, direction: 'rtl', children: leaves }] },
    ] satisfies CommentNode[])('visits and safely rewrites references within $kind without losing neighboring author text', root => {
        const before = structuredClone(root);
        expect(walk(root).filter(node => ['picture', 'mention', 'attachment'].includes(node.kind))).toEqual([picture, mention, attachment]);
        const stripPrivate = (nodes: CommentNode[]): CommentNode[] => nodes.map(node => node.kind === 'mention' ? { kind: 'text', text: node.label } : node.kind === 'picture' ? { kind: 'text', text: node.description } : node.kind === 'attachment' ? { kind: 'text', text: node.label } : mapCommentChildren(node, stripPrivate));
        const sanitized = stripPrivate([root]), html = commentNodesHTML(sanitized);
        expect(html).toContain('قبل &amp; بعد');
        expect(html).toContain('@مطور &lt;الفريق&gt;');
        expect(html).toContain('ملف &lt;img&gt;.txt');
        expect(html).not.toMatch(/data-(user|picture|attachment)-id/);
        expect(html).not.toContain('<script>');
        expect(root).toEqual(before);
    });
    it.each(leaves)('does not descend into or mutate an atomic $kind value', node => {
        const calls: CommentNode[][] = [];
        expect(commentChildren(node)).toEqual([]);
        expect(mapCommentChildren(node, children => { calls.push(children); return []; })).toBe(node);
        expect(calls).toEqual([]);
    });
    it('serializes a hard break as a line boundary without accepting child markup', () => {
        const html = commentNodesHTML([{ kind: 'format', tag: 'p', direction: 'auto', children: [{ kind: 'text', text: 'First line' }, { kind: 'format', tag: 'br', direction: 'auto', children: [{ kind: 'text', text: 'Ignored break child' }] }, { kind: 'text', text: 'السطر التالي' }] }]);
        expect(html).toBe('<p dir="auto">First line<br>السطر التالي</p>');
    });
    it('preserves distinct mixed table cell spans, headers and checklist completion when escaping content', () => {
        const html = commentNodesHTML([{ kind: 'table', rows: [[{ header: true, colspan: 2, rowspan: 1, direction: 'rtl', children: [{ kind: 'text', text: 'عنوان "الخطة"' }] }, { header: false, colspan: 1, rowspan: 2, direction: 'ltr', children: [{ kind: 'link', href: 'https://example.test/?a=1&b=2', children: [{ kind: 'text', text: 'Open <work>' }] }] }]] }, { kind: 'checklist', items: [{ checked: false, direction: 'auto', children: [attachment] }] }]);
        expect(html).toContain('<th dir="rtl" colspan="2" rowspan="1">عنوان &quot;الخطة&quot;</th>');
        expect(html).toContain('<td dir="ltr" colspan="1" rowspan="2"><a href="https://example.test/?a=1&amp;b=2">Open &lt;work&gt;</a></td>');
        expect(html).toContain('data-checked="false"');
        expect(html).not.toContain('<input');
        expect(html).toContain('ملف &lt;img&gt;.txt');
    });
});
