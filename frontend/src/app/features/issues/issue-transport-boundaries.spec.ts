import '@angular/compiler';
import { Injector } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from '../../core/api/client';
import { ApiError } from '../../core/api/api-result';
import { AuthService } from '../../core/auth/auth.service';
import { ModernIssuesApi } from './modern-issues.api';
import { IssuesApi } from './issues.api';
import { IssueFieldsApi } from './issue-fields.api';
import { CommentsApi } from '../comments/comments.api';
const issueId = '40000000-0000-4000-8000-000000000001', projectId = '20000000-0000-4000-8000-000000000001', transitionId = '80000000-0000-4000-8000-000000000001', commentId = '90000000-0000-4000-8000-000000000001', reference = 'a0000000-0000-4000-8000-000000000001', revision = '9007199254740993';
const emptyPage = { items: [], nextCursor: null, totalMatching: 0 };
const context = { expectedRevision: revision, expectedWorkflowRevision: '9007199254740994', expectedConfigurationRevision: '9007199254740995' };
const failure = { error: { code: 'conflict', message: 'Review the current issue before saving.', fieldErrors: [], nextAction: 'reload_current_state', retryable: false }, current: null, unfinished: null };
function setup(response: unknown = emptyPage, status = 200) {
    const requests: Request[] = [];
    const fetch = vi.fn(async (input: RequestInfo | URL) => { expect(input).toBeInstanceOf(Request); requests.push(input as Request); return Response.json(response, { status }); });
    const client = createApiClient({ baseUrl: 'https://unit.example.test', auth: async () => 'unit-only-token', fetch });
    const injector = Injector.create({ providers: [{ provide: AuthService, useValue: { client } }, { provide: ModernIssuesApi, useFactory: () => new ModernIssuesApi() }, { provide: IssuesApi, useFactory: () => new IssuesApi() }, { provide: IssueFieldsApi, useFactory: () => new IssueFieldsApi() }, { provide: CommentsApi, useFactory: () => new CommentsApi() }] });
    return { modern: injector.get(ModernIssuesApi), issues: injector.get(IssuesApi), fields: injector.get(IssueFieldsApi), comments: injector.get(CommentsApi), requests, fetch };
}
type Services = ReturnType<typeof setup>;
describe('typed read transports keep scope and cursor ownership', () => {
    for (const cursor of [undefined, 'opaque+cursor/=='])
        for (const read of [
            { name: 'comments', path: `/api/v1/issues/${issueId}/comments`, call: (api: Services) => api.comments.list(issueId, cursor) },
            { name: 'comment history', path: `/api/v1/comments/${commentId}/versions`, call: (api: Services) => api.comments.versions(commentId, cursor) },
            { name: 'mention candidates', path: `/api/v1/projects/${projectId}/mention-candidates`, query: 'مطور & فريق', call: (api: Services) => api.comments.mentionCandidates(projectId, 'مطور & فريق', cursor) },
            { name: 'transition targets', path: `/api/v2/issues/${issueId}/transitions`, call: (api: Services) => api.modern.transitions(issueId, cursor) },
            { name: 'label choices', path: `/api/v1/projects/${projectId}/labels`, query: 'مراجعة & فريق', call: (api: Services) => api.issues.labels(projectId, 'مراجعة & فريق', cursor) },
            { name: 'assignee choices', path: `/api/v1/projects/${projectId}/assignees`, query: 'مطور & فريق', call: (api: Services) => api.issues.assignees(projectId, 'مطور & فريق', cursor) },
            { name: 'blocker direction', path: `/api/v1/issues/${issueId}/dependencies`, direction: 'blocked_by', call: (api: Services) => api.issues.dependencies(issueId, 'blocked_by', cursor) },
            { name: 'dependent direction', path: `/api/v1/issues/${issueId}/dependencies`, direction: 'blocks', call: (api: Services) => api.issues.dependencies(issueId, 'blocks', cursor) },
            { name: 'issue activity', path: '/api/v1/admin/activity', resource: true, call: (api: Services) => api.issues.history(issueId, cursor) },
        ])
            it(read.name + ' ' + (cursor ? 'continuation' : 'first page') + ' encodes its exact authorized query', async () => {
                const api = setup();
                expect(await read.call(api)).toEqual(emptyPage);
                expect(api.fetch).toHaveBeenCalledTimes(1);
                const request = api.requests[0]!, url = new URL(request.url);
                expect(request.method).toBe('GET');
                expect(url.pathname).toBe(read.path);
                expect(url.searchParams.get('limit')).toBe('25');
                expect(url.searchParams.get('cursor')).toBe(cursor ?? null);
                expect(request.headers.get('Authorization')).toBe('Bearer unit-only-token');
                if ('query' in read)
                    expect(url.searchParams.get('query')).toBe(read.query);
                if ('direction' in read)
                    expect(url.searchParams.get('direction')).toBe(read.direction);
                if ('resource' in read) {
                    expect(url.searchParams.get('resourceKind')).toBe('issue');
                    expect(url.searchParams.get('resourceId')).toBe(issueId);
                }
            });
    it('keeps modern search-only parent behavior distinct from persisted filters and nested POST paging', async () => {
        const api = setup();
        const filters = { projectIds: [projectId], query: 'عمل 12' }, before = structuredClone(filters);
        await api.modern.search(filters, 'private+cursor', undefined, 'standard');
        const request = api.requests[0]!;
        expect(request.method).toBe('POST');
        expect(new URL(request.url).pathname).toBe('/api/v2/issues/search');
        expect(new URL(request.url).search).toBe('');
        expect(await request.json()).toEqual({ filters, page: { limit: 25, cursor: 'private+cursor' }, typeBehavior: 'standard' });
        expect(filters).toEqual(before);
        await api.modern.search(filters);
        expect(await api.requests[1]!.json()).toEqual({ filters, page: { limit: 25 } });
    });
    it('passes abort ownership to mention lookup rather than creating an unowned request', async () => {
        const api = setup(), controller = new AbortController();
        await api.comments.mentionCandidates(projectId, 'مطور', undefined, controller.signal);
        const request = api.requests[0]!;
        expect(request.signal.aborted).toBe(false);
        controller.abort();
        expect(request.signal.aborted).toBe(true);
    });
});
describe('review and field transports preserve exact revisions and actionable failures', () => {
    it('reads each field page with its bounded limit and exact opaque cursor', async () => {
        const values = { issueId, revision, definitions: [], values: [], nextCursor: null };
        const api = setup(values);
        expect(await api.fields.fields(issueId)).toEqual(values);
        await api.fields.fields(issueId, 'fields+cursor==');
        expect(new URL(api.requests[0]!.url).searchParams.has('cursor')).toBe(false);
        const url = new URL(api.requests[1]!.url);
        expect(url.pathname).toBe(`/api/v2/issues/${issueId}/custom-fields`);
        expect(url.searchParams.get('limit')).toBe('100');
        expect(url.searchParams.get('cursor')).toBe('fields+cursor==');
    });
    for (const action of ['approve', 'reject', 'resubmit'] as const)
        it('binds ' + action + ' to all three exact revision tokens and its original retry reference', async () => {
            const api = setup(failure, 409);
            const pending = action === 'resubmit' ? api.fields.resubmit(issueId, transitionId, context, reference) : api.fields.vote(issueId, transitionId, context, action, reference);
            let caught: unknown;
            try {
                await pending;
            }
            catch (error) {
                caught = error;
            }
            expect(caught).toBeInstanceOf(ApiError);
            if (!(caught instanceof ApiError))
                throw new Error('Expected an actionable service conflict.');
            expect(caught.status).toBe(409);
            expect(caught.payload.error.nextAction).toBe('reload_current_state');
            const request = api.requests[0]!;
            expect(request.method).toBe('POST');
            expect(new URL(request.url).pathname).toBe(`/api/v2/issues/${issueId}/transitions/${transitionId}/${action === 'resubmit' ? 'resubmit' : 'approvals'}`);
            expect(request.headers.get('Idempotency-Key')).toBe(reference);
            expect(await request.json()).toEqual(action === 'resubmit' ? context : { ...context, decision: action });
        });
    it('keeps exact decimal draft strings on a failed write and exposes field errors for correction', async () => {
        const payload = { ...failure, error: { ...failure.error, code: 'validation_failed', nextAction: 'review_fields', fieldErrors: [{ field: 'acceptance', message: 'Provide current acceptance.' }] } };
        const api = setup(payload, 422), body = { expectedRevision: revision, values: [{ fieldId: transitionId, value: { kind: 'number' as const, number: '9007199254740993.1234567890' } }] }, before = structuredClone(body);
        await expect(api.fields.save(issueId, body, reference)).rejects.toMatchObject({ status: 422, payload: { error: { fieldErrors: payload.error.fieldErrors } } });
        expect(await api.requests[0]!.json()).toEqual(body);
        expect(body).toEqual(before);
        expect(api.requests[0]!.headers.get('Idempotency-Key')).toBe(reference);
    });
    it('reads a review history continuation scoped to the same issue and transition', async () => {
        const view = { issueId, transitionId, issueRevision: revision, workflowRevision: '2', configurationRevision: '3', required: 1, approved: 0, rejected: false, currentContext: true, canVote: true, reviewSatisfied: false, votes: [], nextCursor: null };
        const api = setup(view);
        expect(await api.fields.approvals(issueId, transitionId)).toEqual(view);
        await api.fields.approvals(issueId, transitionId, 'review+cursor==');
        const url = new URL(api.requests[1]!.url);
        expect(url.pathname).toBe(`/api/v2/issues/${issueId}/transitions/${transitionId}/approvals`);
        expect(url.searchParams.get('limit')).toBe('25');
        expect(url.searchParams.get('cursor')).toBe('review+cursor==');
    });
});
describe('editable writes and discussion intentions do not lose identity or private error boundaries', () => {
    for (const write of [
        { name: 'create issue', method: 'POST', path: `/api/v2/projects/${projectId}/issues`, body: { title: 'قبول جديد' }, call: (api: Services) => api.modern.create(projectId, { title: 'قبول جديد' }, reference) },
        { name: 'complete edit', method: 'PUT', path: `/api/v2/issues/${issueId}`, body: { expectedRevision: revision, editable: { title: 'قبول', description: '<p>عربي</p>', descriptionFormat: 'html', typeId: transitionId, priorityId: commentId, assigneeId: null, dueDate: null, labelIds: [] } }, call: (api: Services) => api.modern.update(issueId, revision, { title: 'قبول', description: '<p>عربي</p>', descriptionFormat: 'html', typeId: transitionId, priorityId: commentId, assigneeId: null, dueDate: null, labelIds: [] }, reference) },
        { name: 'compare-field priority', method: 'PATCH', path: `/api/v2/issues/${issueId}/fields`, body: { field: 'priorityId', priority: { prior: transitionId, value: commentId } }, call: (api: Services) => api.modern.patch(issueId, { field: 'priorityId', priority: { prior: transitionId, value: commentId } }, reference) },
        { name: 'explicit stage move', method: 'POST', path: `/api/v2/issues/${issueId}/move`, body: { expectedRevision: revision, targetStageId: transitionId }, call: (api: Services) => api.modern.move(issueId, { expectedRevision: revision, targetStageId: transitionId }, reference) },
        { name: 'comment post', method: 'POST', path: `/api/v1/issues/${issueId}/comments`, body: { body: { html: '<p>نقاش</p>', mentionUserIds: [], pictureIds: [], attachmentIds: [] } }, call: (api: Services) => api.comments.create(issueId, { html: '<p>نقاش</p>', mentionUserIds: [], pictureIds: [], attachmentIds: [] }, reference) },
        { name: 'comment edit', method: 'PUT', path: `/api/v1/comments/${commentId}`, body: { expectedRevision: revision, body: { html: '<p>نقاش</p>', mentionUserIds: [], pictureIds: [] } }, call: (api: Services) => api.comments.update(commentId, revision, { html: '<p>نقاش</p>', mentionUserIds: [], pictureIds: [] }, reference) },
        { name: 'organize', method: 'POST', path: `/api/v1/issues/${issueId}/organize`, body: { expectedRevision: revision, archived: true }, call: (api: Services) => api.issues.organize(issueId, { expectedRevision: revision, archived: true }, reference) },
        { name: 'watch state', method: 'POST', path: `/api/v1/issues/${issueId}/watch`, body: { watching: true }, call: (api: Services) => api.issues.watch(issueId, true, reference) },
        { name: 'related link', method: 'POST', path: `/api/v1/issues/${issueId}/links`, body: { expectedRevision: revision, kind: 'duplicates', targetId: commentId, enabled: true }, call: (api: Services) => api.issues.link(issueId, { expectedRevision: revision, kind: 'duplicates', targetId: commentId, enabled: true }, reference) },
        { name: 'saved search', method: 'PUT', path: `/api/v1/issue-searches/${commentId}`, body: { expectedRevision: '0', name: 'My private search', filters: { projectIds: [projectId] } }, call: (api: Services) => api.issues.saveSearch(commentId, { expectedRevision: '0', name: 'My private search', filters: { projectIds: [projectId] } }, reference) },
        { name: 'label creation', method: 'POST', path: `/api/v1/projects/${projectId}/labels`, body: { name: 'عاجل' }, call: (api: Services) => api.issues.createLabel(projectId, 'عاجل', reference) },
        { name: 'blocker add', method: 'POST', path: `/api/v1/issues/${issueId}/dependencies`, body: { blockerId: commentId, expectedIssueRevision: revision, expectedGraphRevision: '4' }, call: (api: Services) => api.issues.addDependency(issueId, { blockerId: commentId, expectedIssueRevision: revision, expectedGraphRevision: '4' }, reference) },
        { name: 'blocker remove', method: 'POST', path: `/api/v1/issues/${issueId}/dependencies/${commentId}/remove`, body: { expectedDependencyRevision: '2', expectedIssueRevision: revision, expectedGraphRevision: '4' }, call: (api: Services) => api.issues.removeDependency(issueId, commentId, { expectedDependencyRevision: '2', expectedIssueRevision: revision, expectedGraphRevision: '4' }, reference) },
    ])
        it(write.name + ' sends a single explicit intention and preserves the domain conflict', async () => {
            const api = setup(failure, 409);
            await expect(write.call(api)).rejects.toMatchObject({ status: 409, payload: failure });
            expect(api.fetch).toHaveBeenCalledTimes(1);
            const request = api.requests[0]!;
            expect(request.method).toBe(write.method);
            expect(new URL(request.url).pathname).toBe(write.path);
            expect(request.headers.get('Idempotency-Key')).toBe(reference);
            expect(await request.json()).toEqual(write.body);
        });
    it('rejects malformed failure details instead of exposing an internal database payload', async () => {
        const api = setup({ sql: 'private SQL and relation names' }, 503);
        await expect(api.issues.labels(projectId, '')).rejects.toThrow('The service could not complete this request. Try again.');
    });
});
it('reads private saved searches without inventing a project or page scope', async () => {
    const api = setup({ items: [] });
    expect(await api.issues.savedSearches()).toEqual({ items: [] });
    expect(api.requests).toHaveLength(1);
    const url = new URL(api.requests[0]!.url);
    expect(url.pathname).toBe('/api/v1/issue-searches');
    expect(url.search).toBe('');
    expect(api.requests[0]!.headers.get('Authorization')).toBe('Bearer unit-only-token');
});
it('keeps issue read cancellation attached to the generated request and returns its actionable failure', async () => {
    const api = setup(failure, 409), controller = new AbortController();
    await expect(api.modern.get(issueId, controller.signal)).rejects.toMatchObject({ status: 409, payload: failure });
    const request = api.requests[0]!;
    expect(new URL(request.url).pathname).toBe(`/api/v2/issues/${issueId}`);
    expect(request.signal.aborted).toBe(false);
    controller.abort();
    expect(request.signal.aborted).toBe(true);
});
