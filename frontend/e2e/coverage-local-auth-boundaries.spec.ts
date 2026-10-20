// Draft only. Real private local identity fixture, captured Go binary and disposable PostgreSQL.
import { expect, type APIRequestContext, type TestInfo } from '@playwright/test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { z } from 'zod';
import { test } from './support/browser-test';
import { LocalAuthServer, signInOnLocalServer } from './support/isolated-local-identity';
import { useCase } from './support/use-case';
import { isolatedProject } from './support/project';
import { localFixturesAvailable, signIn } from './support/session';
import { ownerId, save, read, callTool } from './support/coverage-access';
import { zFailure, zFailureBody, zMe, zTokenList, zTokenView, zOAuthConsent, zOAuthRedirect, zCreatedToken, zTokenActivityPage, zProjectView } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable || !process.env['GATEGOLD_E2E_SERVER_BINARY'], 'Requires the captured server binary and isolated development database.');
test.use({ trace: 'off' });
test('local password verification preserves significant leading and trailing spaces', async ({ request }, info) => {
    const server = new LocalAuthServer(info);
    await server.prepare();
    try {
        await server.start();
        await useCase('UC-ACC-0004', async () => {
            const session = await server.ownerSession(request);
            const identity = await request.get(server.origin + '/api/v1/me', { headers: { Authorization: 'Bearer ' + session.accessToken } });
            expect(identity.status()).toBe(200);
            expect(zMe.parse(await identity.json()).userId).toBe(ownerId);
            const trimmed = await request.post(server.origin + '/api/v1/auth/local-sign-in', { data: { username: 'owner', password: server.ownerPassword.trim() } });
            expect(trimmed.status()).toBe(401);
            expect(zFailureBody.parse(await trimmed.json()).error.code).toBe('authentication_required');
        }, 'rest');
    }
    finally {
        await server.stop();
    }
});
test('a cryptographically valid but unapproved local identity cannot enter either API channel', async ({ request }, info) => {
    const server = new LocalAuthServer(info);
    await server.prepare();
    try {
        await server.start();
        for (const channel of ['rest', 'mcp'] as const)
            await useCase('UC-ACC-0014', async () => {
                const headers = { Authorization: 'Bearer ' + await server.signedUnapproved(channel), Accept: 'application/json, text/event-stream' };
                const response = channel === 'rest' ? await request.get(server.origin + '/api/v1/me', { headers }) : await request.post(server.origin + '/mcp', { headers, data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_me', arguments: {} } } });
                expect(response.status()).toBe(403);
                const denied = z.object({ error: zFailure }).parse(await response.json());
                expect(denied.error.code).toBe('account_inactive');
            }, channel);
    }
    finally {
        await server.stop();
    }
});
for (const [id, count, hashCost] of [['UC-ACC-0016', 60, 10], ['UC-ACC-0017', 8, 14]] as const) {
    test(id + ' local authentication bounds actual burst work', async ({ request }, info) => {
        test.setTimeout(90000);
        const server = new LocalAuthServer(info);
        await server.prepare(hashCost);
        try {
            await server.start();
            await useCase(id, async () => {
                // Eight is below the fresh rate limiter's 20-token burst, so the 8-call case
                // independently exercises the two-slot bcrypt capacity boundary.
                const replies = await Promise.all(Array.from({ length: count }, () => request.post(server.origin + '/api/v1/auth/local-sign-in', { data: { username: 'owner', password: 'incorrect-password' } })));
                const statuses = replies.map(response => response.status());
                expect(statuses.filter(status => status === 503).length).toBeGreaterThan(0);
                expect(statuses.filter(status => status === 401).length).toBeGreaterThan(0);
                expect(statuses.every(status => status === 401 || status === 503)).toBe(true);
                for (const response of replies) {
                    const failure = z.object({ error: zFailure }).parse(await response.json()).error;
                    if (response.status() === 503) {
                        expect(failure.code).toBe('temporarily_unavailable');
                        expect(failure.retryable).toBe(true);
                        expect(failure.nextAction).toBe('sign_in');
                    }
                    else
                        expect(failure.code).toBe('authentication_required');
                }
                // Current process remains usable; perform this only after the burst has drained.
                await expect.poll(async () => (await request.post(server.origin + '/api/v1/auth/local-sign-in', { data: { username: 'owner', password: server.ownerPassword } })).status(), { timeout: 20000 }).toBe(200);
            }, 'rest');
        }
        finally {
            await server.stop();
        }
    });
}
const credentialsSchema = z.object({ access_token: z.string().regex(/^gg_oauth_[A-Za-z0-9_-]{43}$/), refresh_token: z.string().regex(/^gg_refresh_[A-Za-z0-9_-]{43}$/), token_type: z.literal('Bearer'), expires_in: z.number().int().positive(), scope: z.literal('gategoldjira:access') }).strict();
async function mcpIdentity(request: APIRequestContext, server: LocalAuthServer, credential: string) {
    const reply = await request.post(server.origin + '/mcp', { headers: { Authorization: 'Bearer ' + credential, Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' }, data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_me', arguments: {} } } });
    expect(reply.status()).toBe(200);
    const result = z.object({ jsonrpc: z.literal('2.0'), id: z.literal(1), result: z.object({ isError: z.literal(false).optional(), content: z.array(z.object({ type: z.literal('text'), text: z.string() })), structuredContent: z.object({ ok: z.literal(true), data: zMe, error: z.null() }) }) }).parse(await reply.json());
    expect(result.result.structuredContent.data.userId).toBe(ownerId);
    expect(result.result.content).toHaveLength(1);
    expect(JSON.parse(result.result.content[0]!.text)).toEqual(result.result.structuredContent);
}
test('actual persisted OAuth access and refresh credentials survive an owned Go service restart', async ({ request }, info) => {
    test.setTimeout(90000);
    const server = new LocalAuthServer(info);
    await server.prepare();
    let connectionId: string | undefined;
    try {
        await server.start();
        const session = await server.ownerSession(request);
        const headers = { Authorization: 'Bearer ' + session.accessToken };
        const beforeReply = await request.get(server.origin + '/api/v1/me/mcp-tokens', { headers });
        expect(beforeReply.status()).toBe(200);
        const before = new Set(zTokenList.parse(await beforeReply.json()).items.map(item => item.id));
        const resource = z.url().parse(process.env['MCP_AUDIENCE']), redirect = 'http://127.0.0.1:49001/oauth/callback';
        const verifier = randomBytes(32).toString('base64url'), state = randomBytes(24).toString('base64url');
        const parameters = new URLSearchParams({ client_id: 'gategoldjira-antigravity', response_type: 'code', scope: 'gategoldjira:access', resource, redirect_uri: redirect, state, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') });
        const start = await request.get(server.origin + '/oauth/authorize?' + parameters, { maxRedirects: 0 });
        expect(start.status()).toBe(302);
        const consentRequest = new URL(start.headers()['location']!).searchParams.get('request');
        expect(consentRequest).toMatch(/^[A-Za-z0-9_-]{43}$/);
        const path = '/api/v1/me/mcp-authorizations/' + consentRequest;
        const consent = await request.get(server.origin + path, { headers });
        expect(consent.status()).toBe(200);
        expect(zOAuthConsent.parse(await consent.json())).toEqual({ clientName: 'Antigravity', redirectUri: redirect, scope: 'gategoldjira:access' });
        const approved = await request.post(server.origin + path, { headers, data: { allow: true } });
        expect(approved.status()).toBe(200);
        const approvedRedirect = new URL(zOAuthRedirect.parse(await approved.json()).redirectUrl);
        expect(approvedRedirect.searchParams.get('state')).toBe(state);
        const exchange = await request.post(server.origin + '/oauth/token', { form: { grant_type: 'authorization_code', client_id: 'gategoldjira-antigravity', resource, redirect_uri: redirect, code: approvedRedirect.searchParams.get('code')!, code_verifier: verifier } });
        expect(exchange.status()).toBe(200);
        const original = credentialsSchema.parse(await exchange.json());
        const afterReply = await request.get(server.origin + '/api/v1/me/mcp-tokens', { headers });
        expect(afterReply.status()).toBe(200);
        const owned = zTokenList.parse(await afterReply.json()).items.filter(item => !before.has(item.id) && item.kind === 'oauth');
        expect(owned).toHaveLength(1);
        connectionId = owned[0]!.id;
        await mcpIdentity(request, server, original.access_token);
        await server.stop();
        await useCase('UC-MCP-0069', async () => {
            await server.start();
            await mcpIdentity(request, server, original.access_token);
        }, 'mcp');
        const renewed = await useCase('UC-MCP-0069', async () => {
            const refresh = await request.post(server.origin + '/oauth/token', { form: { grant_type: 'refresh_token', client_id: 'gategoldjira-antigravity', resource, refresh_token: original.refresh_token } });
            expect(refresh.status()).toBe(200);
            const credentials = credentialsSchema.parse(await refresh.json());
            expect(credentials.access_token === original.access_token).toBe(false);
            expect(credentials.refresh_token === original.refresh_token).toBe(false);
            const currentReply = await request.get(server.origin + '/api/v1/me/mcp-tokens', { headers });
            expect(currentReply.status()).toBe(200);
            expect(zTokenList.parse(await currentReply.json()).items.find(item => item.id === connectionId)?.revokedAt).toBeNull();
            return credentials;
        }, 'rest');
        await useCase('UC-MCP-0069', async () => {
            await mcpIdentity(request, server, renewed.access_token);
        }, 'mcp');
    }
    finally {
        try {
            if (connectionId) {
                const session = await server.ownerSession(request);
                const revoked = await request.post(server.origin + '/api/v1/me/mcp-tokens/' + connectionId + '/revoke', { headers: { Authorization: 'Bearer ' + session.accessToken, 'Idempotency-Key': crypto.randomUUID() }, data: {} });
                expect(revoked.status()).toBe(200);
                expect(zTokenView.parse(await revoked.json()).revokedAt).not.toBeNull();
            }
        }
        finally {
            await server.stop();
        }
    }
});
// Rate and capacity deliberately have the same published busy response. The
// 8-request case above isolates capacity below a fresh 20-token login burst;
// these cheap malformed OAuth requests exercise its separate 30-token broker burst.
test('a fresh OAuth broker bounds authorization, token and revoke request bursts', async ({ request }, info) => {
    const server = new LocalAuthServer(info);
    await server.prepare();
    try {
        await server.start();
        await useCase('UC-MCP-0074', async () => {
            const replies = await Promise.all(Array.from({ length: 90 }, async (_, index) => {
                const endpoint = (['authorize', 'token', 'revoke'] as const)[index % 3]!;
                const response = endpoint === 'authorize' ? await request.get(server.origin + '/oauth/' + endpoint, { maxRedirects: 0 }) : await request.post(server.origin + '/oauth/' + endpoint, { form: {} });
                return { endpoint, response };
            }));
            for (const endpoint of ['authorize', 'token', 'revoke'] as const)
                expect(replies.filter(item => item.endpoint === endpoint && item.response.status() === 429).length).toBeGreaterThan(0);
            for (const { endpoint, response } of replies) {
                if (response.status() === 429)
                    expect(z.object({ error: z.literal('temporarily_unavailable') }).strict().parse(await response.json()).error).toBe('temporarily_unavailable');
                else {
                    expect(response.status()).toBe(endpoint === 'authorize' ? 400 : 401);
                    expect(z.object({ error: z.literal(endpoint === 'authorize' ? 'invalid_request' : 'invalid_client') }).strict().parse(await response.json()).error).toBe(endpoint === 'authorize' ? 'invalid_request' : 'invalid_client');
                }
            }
        }, 'rest');
    }
    finally {
        await server.stop();
    }
});
// Hold only the newly created project's lifecycle guard. No activity row or
// outcome is fabricated; the call must start through the real MCP middleware.
async function holdOwnedProject(projectId: string) {
    const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
    if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database))
        throw new Error('An isolated browser database is required for the owned lock.');
    z.uuid().parse(projectId);
    const child = spawn('docker', ['compose', '-f', resolve('../compose.dev.yaml'), 'exec', '-T', 'postgres', 'psql', '--username=gategoldjira', '--dbname=' + database, '-v', 'ON_ERROR_STOP=1', '-q', '-A', '-t'], { stdio: 'pipe' });
    let output = '';
    child.stdout.on('data', chunk => {
        output += String(chunk);
    });
    child.stderr.resume();
    child.on('error', () => {
    });
    child.stdin.write("BEGIN; SELECT pg_advisory_xact_lock(hashtextextended('gategoldjira:project-lifecycle:" + projectId + "',0)); SELECT 'owned_project_guard_ready';\n");
    try {
        await expect.poll(() => output.includes('owned_project_guard_ready'), { timeout: 20000 }).toBe(true);
    }
    catch (error) {
        child.stdin.end('ROLLBACK;\n');
        if (child.exitCode === null) {
            const closed = once(child, 'close');
            child.kill('SIGTERM');
            await closed;
        }
        throw error;
    }
    return async () => {
        if (child.exitCode !== null || child.signalCode !== null)
            return;
        const closed = once(child, 'close');
        child.stdin.end('ROLLBACK;\n');
        await closed;
        expect(child.exitCode).toBe(0);
    };
}
test('a real started MCP call whose owned server crashes remains visibly unconfirmed', async ({ page, request }, info) => {
    test.setTimeout(90000);
    const server = new LocalAuthServer(info);
    await server.prepare();
    const projectId = await isolatedProject(request);
    const name = 'Unconfirmed actual call ' + crypto.randomUUID();
    const credential = await save(request, '/api/v1/me/mcp-tokens', { name }, zCreatedToken, { method: 'POST', status: 201 });
    let release: (() => Promise<void>) | undefined;
    let pending: Promise<void> | undefined;
    try {
        await server.start();
        release = await holdOwnedProject(projectId);
        let finished = false, transportClosed = false;
        const raw = request.post(server.origin + '/mcp', { headers: { Authorization: 'Bearer ' + credential.token, Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' }, data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'get_project', arguments: { projectId } } } });
        pending = raw.then(() => {
            finished = true;
        }, () => {
            finished = true;
            transportClosed = true;
        });
        await expect.poll(async () => (await read(request, '/api/v1/me/mcp-tokens/' + credential.details.id + '/activity', zTokenActivityPage)).items.map(item => item.outcome), { timeout: 4000, intervals: [50, 100, 150] }).toEqual(['started']);
        expect(finished).toBe(false);
        await server.crash();
        await pending;
        expect(transportClosed).toBe(true);
        await release();
        release = undefined;
        const retained = await read(request, '/api/v1/me/mcp-tokens/' + credential.details.id + '/activity', zTokenActivityPage);
        expect(retained.items).toHaveLength(1);
        expect(retained.items[0]).toMatchObject({ toolName: 'get_project', outcome: 'started', durationMs: null, errorCode: null, resourceUrl: null });
        // Independent primary-server access proves the owned project lock is released.
        expect((await read(request, '/api/v1/projects/' + projectId, zProjectView)).id).toBe(projectId);
        await signIn(page, 'owner', '/account/mcp-tokens', /MCP connections/);
        await useCase('UC-MCP-0082', async () => {
            const row = page.locator('[data-token-id="' + credential.details.id + '"]');
            await expect(row).toContainText(name);
            await row.getByRole('button', { name: 'View activity for ' + name, exact: true }).click();
            const activity = page.getByRole('region', { name: 'Token activity', exact: true });
            await expect(activity.locator('tbody tr')).toHaveCount(1);
            await expect(activity).toContainText('get_project');
            await expect(activity.getByRole('cell', { name: 'Completion unconfirmed', exact: true })).toBeVisible();
            await expect(activity.getByRole('cell', { name: 'Succeeded', exact: true })).toHaveCount(0);
            await expect(activity.getByRole('cell', { name: 'Failed', exact: true })).toHaveCount(0);
            await expect(page.getByText('Completion unconfirmed means a call is still running or its final result could not be recorded.', { exact: false })).toBeVisible();
        }, 'web');
    }
    finally {
        try {
            if (release)
                await release();
            if (pending)
                await pending;
        }
        finally {
            try {
                await server.stop();
            }
            finally {
                await save(request, '/api/v1/me/mcp-tokens/' + credential.details.id + '/revoke', {}, zTokenView, { method: 'POST' });
            }
        }
    }
});
