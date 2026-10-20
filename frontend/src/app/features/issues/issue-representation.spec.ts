import { describe, expect, it } from 'vitest';
import type { IssueSummary, IssueView, ModernIssueSummary, ModernIssueView } from '../../api/generated/types.gen';
import { isModernIssue, issueTypeName, issueTypeKey, issueStageName, issueStageCategory, modernEditable } from './issue-model';
const legacy: IssueSummary = {
    id: '40000000-0000-4000-8000-000000000001', projectId: '20000000-0000-4000-8000-000000000001', key: 'GG-1', number: '1', title: 'Retained issue', type: 'task', priority: 'medium', status: 'todo', assignee: null, dueDate: null, overdue: false, labels: [], blocked: false, unfinishedBlockerCount: 0, parent: null, subtaskProgress: { total: 0, done: 0 }, revision: '9007199254740993', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z',
};
const modern: ModernIssueSummary = {
    ...legacy, type: { id: '50000000-0000-4000-8000-000000000001', key: 'story', name: 'User story', behavior: 'standard', retired: false }, priority: { id: '60000000-0000-4000-8000-000000000001', key: 'urgent', name: 'Urgent', sortOrder: '9007199254740993', retired: false }, workflow: { id: '70000000-0000-4000-8000-000000000001', name: 'Delivery', revision: '2', retired: false }, stage: { id: '80000000-0000-4000-8000-000000000001', name: 'مراجعة التصميم', category: 'review', position: '9007199254740993', initial: false, acceptsEntries: true, retired: false }, archived: false, backlog: false,
};
const reporter = { id: '10000000-0000-4000-8000-000000000002', displayName: 'مطور' };
const modernView = (summary = modern): ModernIssueView => ({ summary, description: '<p dir="rtl">قبول المهمة</p>', descriptionFormat: 'html', graphRevision: '3', reporter, links: [], watching: false, capabilities: ['read', 'edit'] });
describe('shared issue representations preserve legacy and canonical vocabulary', () => {
    it('detects the representation by canonical stage identity rather than a display label or type name', () => {
        const old: IssueView = { summary: legacy, description: 'Legacy', reporter, graphRevision: '1', capabilities: ['read'], orderRevisions: [], sourceOrderRevision: '1' };
        expect(isModernIssue(old)).toBe(false);
        expect(isModernIssue(modernView())).toBe(true);
    });
    it('keeps custom type names and keys distinct from semantic subtask behavior', () => {
        expect(issueTypeName(legacy)).toBe('task');
        expect(issueTypeKey(legacy)).toBe('task');
        expect(issueTypeName(modern)).toBe('User story');
        expect(issueTypeKey(modern)).toBe('story');
        const child: ModernIssueSummary = { ...modern, type: { ...modern.type, key: 'customer_follow_up', name: 'Customer follow-up', behavior: 'subtask' } };
        expect(issueTypeName(child)).toBe('Customer follow-up');
        expect(issueTypeKey(child)).toBe('subtask');
    });
    it('uses custom canonical stage names and categories without interpreting localized names', () => {
        expect(issueStageName(modern)).toBe('مراجعة التصميم');
        expect(issueStageCategory(modern)).toBe('review');
        expect(issueStageName({ ...legacy, status: 'review', statusName: 'Custom verification' })).toBe('Custom verification');
        expect(issueStageName({ ...legacy, status: 'done' })).toBe('Done');
        expect(issueStageCategory({ ...legacy, status: 'in_progress:stage-identity' })).toBe('in_progress');
    });
    it.each(['todo', 'review', 'done'] as const)('retains legacy %s categories while falling back to their friendly stage name', status => {
        const issue = { ...legacy, status };
        expect(issueStageCategory(issue)).toBe(status);
        expect(issueStageName(issue)).toBe(status === 'todo' ? 'To do' : status === 'review' ? 'Review' : 'Done');
    });
});
describe('complete editor projection respects writable fields only', () => {
    it('copies exact selected identities and rich Arabic text without serializing server capability metadata', () => {
        const summary = { ...modern, assignee: reporter, dueDate: '2028-02-29', labels: [{ id: '90000000-0000-4000-8000-000000000001', projectId: modern.projectId, name: 'مراجعة' }] };
        const original = modernView(summary), before = structuredClone(original), editable = modernEditable(original);
        expect(editable).toEqual({ title: summary.title, description: original.description, descriptionFormat: 'html', typeId: summary.type.id, priorityId: summary.priority.id, assigneeId: reporter.id, dueDate: '2028-02-29', labelIds: [summary.labels[0]!.id] });
        expect(editable).not.toHaveProperty('revision');
        expect(editable).not.toHaveProperty('capabilities');
        expect(editable).not.toHaveProperty('parentId');
        expect(editable).not.toHaveProperty('workflowId');
        editable.labelIds.push('90000000-0000-4000-8000-000000000002');
        expect(original).toEqual(before);
    });
    it('represents an unassigned issue and absent due date as explicit null rather than missing fields', () => {
        const editable = modernEditable(modernView());
        expect(editable.assigneeId).toBeNull();
        expect(editable.dueDate).toBeNull();
        expect(editable.labelIds).toEqual([]);
        expect(Object.hasOwn(editable, 'assigneeId')).toBe(true);
        expect(Object.hasOwn(editable, 'dueDate')).toBe(true);
    });
});
