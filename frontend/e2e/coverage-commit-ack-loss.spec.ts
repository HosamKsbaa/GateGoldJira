import { expect } from '@playwright/test';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { OwnedPostgresProxy } from './support/owned-postgres-proxy';
import { LocalAuthServer } from './support/isolated-local-identity';
import { isolatedProject, useModernIssues } from './support/project';
import { localFixturesAvailable } from './support/session';
import { mcpSuccess } from './support/coverage-access';
import { restSuccess } from './support/coverage-rest';
import { zSavedModernIssueView, zModernIssueFailureBody, zPageModernIssueSummary, zPageActivityView, zCreatedToken, zTokenView } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable, 'Requires a captured local Go binary, loopback PostgreSQL and a disposable browser database.');
test.use({ trace: 'off' });
for (const channel of ['rest', 'mcp'] as const)
    test(channel + ' real PostgreSQL commit acknowledgement loss returns safe uncertainty and replays the original durable issue', async ({ request }, info) => {
        test.setTimeout(90000);
        const proxy = new OwnedPostgresProxy(), server = new LocalAuthServer(info);
        let connectionId: string | undefined;
        try {
            await proxy.start();
            await server.prepare();
            await server.start({ postgresProxy: proxy });
            const session = await server.ownerSession(request);
            let bearer = session.accessToken;
            if (channel === 'mcp') {
                const credential = await request.post(server.origin + '/api/v1/me/mcp-tokens', { headers: { Authorization: 'Bearer ' + bearer, 'Idempotency-Key': crypto.randomUUID() }, data: { name: 'Owned commit acknowledgement fixture' } });
                expect(credential.status()).toBe(201);
                const created = zCreatedToken.parse(await credential.json());
                bearer = created.token;
                connectionId = created.details.id;
            }
            const projectId = await isolatedProject(request);
            await useModernIssues(projectId);
            const title = 'Commit accepted before connection loss ' + crypto.randomUUID(), reference = crypto.randomUUID(), args = { projectId, title, retryReference: reference };
            await useCase('UC-SYS-0014', async () => {
                proxy.arm(projectId);
                const response = channel === 'rest' ? await request.post(server.origin + '/api/v2/projects/' + projectId + '/issues', { headers: { Authorization: 'Bearer ' + bearer, 'Idempotency-Key': reference }, data: { title } }) : await request.post(server.origin + '/mcp', { headers: { Authorization: 'Bearer ' + bearer, Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' }, data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_issue_v2', arguments: args } } });
                await expect.poll(() => proxy.progress.cancellations).toBe(1);
                expect(proxy.guardFailure, JSON.stringify(proxy.progress)).toBeUndefined();
                expect(proxy.droppedCommits, JSON.stringify(proxy.progress)).toBe(1);
                let failure: z.infer<typeof zModernIssueFailureBody>;
                if (channel === 'rest') {
                    expect(response.status()).toBe(503);
                    failure = zModernIssueFailureBody.parse(await response.json());
                }
                else {
                    expect(response.status()).toBe(200);
                    const envelope = z.object({ jsonrpc: z.literal('2.0'), id: z.literal(1), result: z.object({ isError: z.literal(true), structuredContent: z.object({ ok: z.literal(false), data: z.null(), error: zModernIssueFailureBody }), content: z.array(z.object({ type: z.literal('text'), text: z.string() })).min(1) }) }).parse(await response.json());
                    failure = envelope.result.structuredContent.error;
                    expect(envelope.result.content.map(value => value.text).join('\n')).toContain(failure.error.message);
                }
                expect(failure.error).toMatchObject({ code: 'temporarily_unavailable', nextAction: 'retry_same_reference', retryable: true, fieldErrors: [] });
                expect(failure.current).toBeNull();
                expect(failure.unfinished).toBeNull();
                expect(failure.error.message).not.toMatch(/postgres|pgx|socket|commit|SQL|EOF|password|127\.0\.0\.1/i);
                const durable = await restSuccess(request, 'search_issues_v2', { filters: { projectIds: [projectId], query: title }, page: { limit: 100 } }, zPageModernIssueSummary);
                expect(durable.totalMatching).toBe(1);
                expect(durable.items[0]?.title).toBe(title);
                const replay = channel === 'rest' ? await restSuccess(request, 'create_issue_v2', args, zSavedModernIssueView) : await mcpSuccess(request, 'create_issue_v2', args, zSavedModernIssueView);
                expect(replay.receipt.replayed).toBe(true);
                expect(replay.receipt.eventId).toBeTruthy();
                expect(replay.result.summary.id).toBe(durable.items[0]!.id);
                expect((await restSuccess(request, 'search_issues_v2', { filters: { projectIds: [projectId], query: title }, page: { limit: 100 } }, zPageModernIssueSummary)).totalMatching).toBe(1);
                const history = await restSuccess(request, 'list_activity', { resourceKind: 'issue', resourceId: replay.result.summary.id }, zPageActivityView);
                expect(history.totalMatching).toBe(1);
                expect(history.items[0]?.id).toBe(replay.receipt.eventId);
                expect(proxy.droppedCommits, JSON.stringify(proxy.progress)).toBe(1);
                expect(proxy.guardFailure, JSON.stringify(proxy.progress)).toBeUndefined();
            }, channel);
        }
        finally {
            try {
                if (connectionId) {
                    const response = await restSuccess(request, 'revokePersonalMcpToken', { tokenId: connectionId, retryReference: crypto.randomUUID() }, zTokenView);
                    expect(response.revokedAt).not.toBeNull();
                }
            }
            finally {
                await server.stop();
                await proxy.stop();
            }
        }
    });
