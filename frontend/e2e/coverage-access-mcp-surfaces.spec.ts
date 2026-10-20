import { expect, type APIRequestContext, type TestInfo } from '@playwright/test';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { LocalAuthServer, signInOnLocalServer } from './support/isolated-local-identity';
import { apiOrigin, account, localFixturesAvailable, token, signIn } from './support/session';
import { authorization, read, save, rejected } from './support/coverage-access';
import { isolatedProject } from './support/project';
import { zCreatedToken, zFailureBody, zMe, zOAuthConsent, zOAuthRedirect, zSavedUserView, zSavedMembershipView, zTokenActivityPage, zTokenList, zTokenView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable || !process.env['GATEGOLD_E2E_SERVER_BINARY'], 'Requires captured Go, private identities and isolated PostgreSQL.');
test.use({ trace: 'off' });

async function ownedAccount(request: APIRequestContext, info: TestInfo) {
  const marker = crypto.randomUUID().replaceAll('-', '');
  const user = (await save(request, '/api/v1/admin/users', { email: 'surface-' + marker + '@example.test', displayName: 'Owned protocol account ' + marker, administrator: false }, zSavedUserView, { method: 'POST', status: 201 })).result;
  const server = new LocalAuthServer(info);
  const deactivate = () => save(request, '/api/v1/admin/users/' + user.id, { expectedRevision: user.revision, email: user.email, displayName: user.displayName, active: false, administrator: false }, zSavedUserView);
  try {
    await server.prepare();
    const credentials = await server.addIdentity('surface' + marker, user.email);
    await server.start();
    const response = await request.post(server.origin + '/api/v1/auth/local-sign-in', { data: credentials });
    expect(response.status()).toBe(200);
    const session = z.object({ accessToken: z.string().min(1), expiresAt: z.iso.datetime() }).strict().parse(await response.json());
    const headers = { Authorization: 'Bearer ' + session.accessToken };
    const list = async () => {
      const reply = await request.get(server.origin + '/api/v1/me/mcp-tokens', { headers });
      expect(reply.status()).toBe(200);
      return zTokenList.parse(await reply.json());
    };
    const create = async (name: string) => {
      const reply = await request.post(server.origin + '/api/v1/me/mcp-tokens', { headers, data: { name } });
      expect(reply.status()).toBe(201);
      expect(reply.headers()['cache-control']).toBe('no-store');
      return zCreatedToken.parse(await reply.json());
    };
    const revoke = async (id: string) => {
      const reply = await request.post(server.origin + '/api/v1/me/mcp-tokens/' + id + '/revoke', { headers, data: {} });
      expect(reply.status()).toBe(200);
      return zTokenView.parse(await reply.json());
    };
    return { server, user, credentials, headers, list, create, revoke, async stop() {
      try { for (const item of (await list()).items) if (!item.revokedAt) await revoke(item.id); }
      finally {
        await server.stop();
        await deactivate();
      }
    } };
  } catch (error) {
    try { await server.stop(); } finally { await deactivate(); }
    throw error;
  }
}

async function mcp(request: APIRequestContext, origin: string, bearer: string, name: string, args: Record<string, unknown> = {}) {
  return request.post(origin + '/mcp', { headers: { Authorization: 'Bearer ' + bearer, Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' }, data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } } });
}

test('local REST credentials reject overlength values and a correctly authenticated inactive account', async ({ request }) => {
  for (const [id, values] of [
    ['UC-ACC-0009', { username: 'x'.repeat(65), password: 'nonempty' }],
    ['UC-ACC-0010', { username: 'owner', password: 'x'.repeat(73) }],
  ] as const) await useCase(id, async () => {
    const response = await request.post(apiOrigin + '/api/v1/auth/local-sign-in', { data: values });
    expect(response.status()).toBe(422);
    const failure = zFailureBody.parse(await response.json()).error;
    expect(failure.code).toBe('validation_failed');
    expect(failure.retryable).toBe(false);
    expect('accessToken' in await response.json()).toBe(false);
  }, 'rest');
  await useCase('UC-ACC-0013', async () => {
    const credentials = await account('disabled');
    const response = await request.post(apiOrigin + '/api/v1/auth/local-sign-in', { data: { username: credentials.username, password: credentials.password } });
    expect(response.status()).toBe(403);
    const failure = zFailureBody.parse(await response.json()).error;
    expect(failure.code).toBe('account_inactive');
    expect(failure.nextAction).toBe('contact_administrator');
    expect('accessToken' in await response.json()).toBe(false);
  }, 'rest');
});

test('the actual captured server refuses password fixtures with a non-loopback service audience', async ({}, info) => {
  const server = new LocalAuthServer(info);
  await server.prepare();
  await useCase('UC-ACC-0035', async () => { await server.rejectUnsafeLocalDeployment(); }, 'operator');
});

test('personal credential REST creation, reload, metadata-only recovery and revocation retain their boundaries', async ({ request }, info) => {
  const fixture = await ownedAccount(request, info);
  try {
    await useCase('UC-MCP-0003', async () => {
      const empty = await fixture.list();
      expect(empty.items).toEqual([]); expect(empty.endpoint).toBe(process.env['MCP_AUDIENCE']); expect(empty.activeLimit).toBe(10n); expect(empty.oauthClientId).toBe('gategoldjira-antigravity');
    }, 'rest');
    await useCase('UC-MCP-0005', async () => {
      for (const name of ['', '   ']) {
        const response = await request.post(fixture.server.origin + '/api/v1/me/mcp-tokens', { headers: fixture.headers, data: { name } });
        await rejected(response, 422, /name|validation|1 to 80/i);
      }
      expect((await fixture.list()).items).toEqual([]);
    }, 'rest');
    const created = await useCase('UC-MCP-0004', async () => {
      const value = await fixture.create('REST owned credential');
      expect(/^gg_mcp_[A-Za-z0-9_-]{43}$/.test(value.token)).toBe(true);
      expect(value.details).toMatchObject({ name: 'REST owned credential', kind: 'personal', expiresAt: null, revokedAt: null, lastUsedAt: null });
      const listed = await fixture.list();
      expect(listed.items).toEqual([value.details]);
      const metadata = await request.get(fixture.server.origin + '/api/v1/me/mcp-tokens', { headers: fixture.headers });
      expect(metadata.status()).toBe(200);
      const wire = await metadata.text();
      expect(wire.includes(value.token)).toBe(false);
      const publicMetadata = zTokenList.extend({ items: z.array(zTokenView.strict()).max(100) }).strict().parse(JSON.parse(wire) as unknown);
      expect(publicMetadata.items).toEqual([value.details]);
      return value;
    }, 'rest');
    await useCase('UC-MCP-0031', async () => {
      const response = await mcp(request, fixture.server.origin, created.token, 'get_me');
      expect(response.status()).toBe(200);
      expect(z.object({ result: z.object({ structuredContent: z.object({ ok: z.literal(true), data: zMe }) }) }).parse(await response.json()).result.structuredContent.data.userId).toBe(fixture.user.id);
    }, 'mcp');
    await useCase('UC-MCP-0031', async () => {
      const denied = await request.get(fixture.server.origin + '/api/v1/me', { headers: { Authorization: 'Bearer ' + created.token } });
      expect(denied.status()).toBe(401);
      expect(zFailureBody.strict().parse(await denied.json()).error.code).toBe('authentication_required');
    }, 'rest');
    await useCase('UC-MCP-0002', async () => {
      const before = await fixture.list();
      expect(before.items[0]?.id).toBe(created.details.id);
      const call = await mcp(request, fixture.server.origin, created.token, 'get_me');
      expect(call.status()).toBe(200);
      expect(z.object({ result: z.object({ structuredContent: z.object({ ok: z.literal(true), data: zMe }) }) }).parse(await call.json()).result.structuredContent.data.userId).toBe(fixture.user.id);
      const current = await fixture.list();
      expect(current.items[0]?.lastUsedAt).not.toBeNull();
      expect(current.items[0]?.revokedAt).toBeNull();
    }, 'rest');
    await useCase('UC-MCP-0022', async () => {
      const revoked = await fixture.revoke(created.details.id);
      expect(revoked.revokedAt).not.toBeNull();
      expect((await fixture.list()).items.find(item => item.id === revoked.id)?.revokedAt).toBe(revoked.revokedAt);
      expect((await mcp(request, fixture.server.origin, created.token, 'get_me')).status()).toBe(401);
    }, 'rest');
    await useCase('UC-MCP-0019', async () => {
      const response = await request.post(fixture.server.origin + '/api/v1/me/mcp-tokens', { headers: fixture.headers, data: { name: 'Lost secret response' } });
      expect(response.status()).toBe(201);
      // Deliberately discard the one-time response body; recovery uses only public metadata.
      await response.dispose();
      const listed = await fixture.list();
      const lost = listed.items.filter(item => item.name === 'Lost secret response');
      expect(lost).toHaveLength(1);
      expect(Object.keys(lost[0]!).sort()).toEqual(['createdAt', 'expiresAt', 'id', 'kind', 'lastUsedAt', 'name', 'prefix', 'revokedAt']);
      expect((await fixture.revoke(lost[0]!.id)).revokedAt).not.toBeNull();
      const replacement = await fixture.create('Replacement after lost response');
      expect(replacement.details.id).not.toBe(lost[0]!.id);
      expect((await mcp(request, fixture.server.origin, replacement.token, 'get_me')).status()).toBe(200);
    }, 'rest');
    await useCase('UC-MCP-0027', async () => {
      for (const value of ['gg_mcp_short', 'gg_mcp_' + '!'.repeat(43), 'gg_oauth_invalid']) {
        const response = await request.get(fixture.server.origin + '/api/v1/me', { headers: { Authorization: 'Bearer ' + value } });
        expect(response.status()).toBe(401);
        expect(zFailureBody.strict().parse(await response.json()).error.code).toBe('authentication_required');
        expect(Object.keys(await response.json()).sort()).toEqual(['current', 'error', 'unfinished']);
      }
    }, 'rest');
  } finally { await fixture.stop(); }
});

test('connection browser fields, Arabic names, own-only metadata and active capacity use real owned state', async ({ page, request }, info) => {
  const fixture = await ownedAccount(request, info);
  try {
    await signInOnLocalServer(page, fixture.server, fixture.credentials, '/account/mcp-tokens');
    await expect(page.getByRole('heading', { name: 'MCP connections', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh tokens', exact: true })).toBeEnabled();
    await useCase('UC-MCP-0006', async () => {
      const name = page.getByLabel('Token name', { exact: true });
      await expect(name).toHaveAttribute('maxlength', '80');
      await name.fill('x'.repeat(81));
      await expect(name).toHaveValue('x'.repeat(80));
      expect((await fixture.list()).items).toEqual([]);
    }, 'web');
    const name = 'اتصال عربي تجريبي ' + crypto.randomUUID().slice(0, 8);
    let created: z.infer<typeof zCreatedToken>;
    await useCase('UC-MCP-0007', async () => {
      await page.getByLabel('Token name', { exact: true }).fill(name);
      const createdResponse = page.waitForResponse(response => response.url() === fixture.server.origin + '/api/v1/me/mcp-tokens' && response.request().method() === 'POST');
      await page.getByRole('button', { name: 'Generate token', exact: true }).click();
      const response = await createdResponse; expect(response.status()).toBe(201);
      created = zCreatedToken.parse(await response.json());
      expect(created.details.name).toBe(name);
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      const text = page.locator('[data-token-id="' + created.details.id + '"] strong');
      await expect(text).toHaveText(name); await expect(text).toHaveAttribute('dir', 'auto');
    }, 'web');
    const current = (await fixture.list()).items;
    expect(current).toHaveLength(1);
    const owned = current[0]!;
    await useCase('UC-MCP-0001', async () => {
      await expect(page.getByRole('region', { name: 'Your MCP tokens', exact: true }).locator('tbody tr')).toHaveCount(1);
      await expect(page.locator('[data-token-id="' + owned.id + '"]')).toContainText(name);
      await expect(page.getByText('1 of 10 active tokens.', { exact: false })).toBeVisible();
      await expect(page.getByText('MCP server URL:', { exact: false })).toContainText(process.env['MCP_AUDIENCE']!);
    }, 'web');
    await useCase('UC-MCP-0024', async () => {
      await page.reload();
      await page.getByLabel('Username', { exact: true }).fill(fixture.credentials.username);
      await page.getByLabel('Password', { exact: true }).fill(fixture.credentials.password);
      await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
      await expect(page.locator('[data-token-id="' + owned.id + '"]')).toBeVisible();
      await expect(page.getByLabel('Your new MCP token')).toHaveCount(0);
      expect((await page.locator('body').innerText()).includes(created!.token)).toBe(false);
      await expect(page.locator('[data-token-id="' + owned.id + '"]')).toContainText(owned.prefix + '…');
    }, 'web');
    for (let count = 1; count < 10; count++) await fixture.create('Owned capacity ' + count);
    await useCase('UC-MCP-0017', async () => {
      await page.getByRole('button', { name: 'Refresh tokens', exact: true }).click();
      await expect(page.getByText('10 of 10 active tokens.', { exact: false })).toBeVisible();
      await page.getByLabel('Token name', { exact: true }).fill('Extra connection');
      await expect(page.getByRole('button', { name: 'Generate token', exact: true })).toBeDisabled();
      expect((await fixture.list()).items.filter(item => !item.revokedAt)).toHaveLength(10);
      await fixture.revoke(owned.id);
      await page.getByRole('button', { name: 'Refresh tokens', exact: true }).click();
      await expect(page.getByText('9 of 10 active tokens.', { exact: false })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Generate token', exact: true })).toBeEnabled();
    }, 'web');
  } finally { await fixture.stop(); }
});

test('connection activity REST pages and browser results expose outcomes while retaining content privacy', async ({ page, request }, info) => {
  const fixture = await ownedAccount(request, info);
  try {
    const projectId = await isolatedProject(request);
    await save(request, '/api/v1/projects/' + projectId + '/memberships/' + fixture.user.id, { expectedRevision: '0', role: 'member' }, zSavedMembershipView);
    const created = await fixture.create('Owned audited credential');
    const activity = async (before?: string) => {
      const response = await request.get(fixture.server.origin + '/api/v1/me/mcp-tokens/' + created.details.id + '/activity' + (before ? '?before=' + encodeURIComponent(before) : ''), { headers: fixture.headers });
      expect(response.status()).toBe(200);
      return zTokenActivityPage.parse(await response.json());
    };
    for (let n = 0; n < 26; n++) expect((await mcp(request, fixture.server.origin, created.token, 'get_project', { projectId })).status()).toBe(200);
    await useCase('UC-MCP-0076', async () => {
      const log = await activity();
      expect(log.items).toHaveLength(25);
      expect(log.items.every(item => item.toolName === 'get_project' && item.outcome === 'succeeded' && item.completedAt !== null && item.durationMs !== null && item.durationMs >= 0n && item.resourceUrl?.endsWith('/projects/' + projectId))).toBe(true);
    }, 'rest');
    await useCase('UC-MCP-0077', async () => {
      const previous = new Set((await activity()).items.map(item => item.id));
      expect((await mcp(request, fixture.server.origin, created.token, 'get_me')).status()).toBe(200);
      const log = await activity();
      const newer = log.items.filter(item => !previous.has(item.id));
      expect(newer).toHaveLength(1); expect(newer[0]?.toolName).toBe('get_me'); expect(newer[0]?.outcome).toBe('succeeded');
    }, 'rest');
    await useCase('UC-MCP-0078', async () => {
      const first = await activity(); expect(first.items).toHaveLength(25); expect(first.nextCursor).toBeTruthy();
      const next = await activity(first.nextCursor!); expect(next.items).toHaveLength(2); expect(next.nextCursor).toBeNull();
      expect(new Set([...first.items, ...next.items].map(item => item.id)).size).toBe(27);
    }, 'rest');
    const privateValue = 'private-content-' + crypto.randomUUID();
    const failed = await mcp(request, fixture.server.origin, created.token, 'create_issue', { projectId, title: privateValue, type: 'task', assigneeId: crypto.randomUUID(), retryReference: crypto.randomUUID() });
    expect(failed.status()).toBe(200);
    const failure = z.object({ result: z.object({ isError: z.literal(true), structuredContent: z.object({ ok: z.literal(false), error: z.object({ error: z.object({ code: z.literal('validation_failed'), fieldErrors: z.array(z.object({ field: z.string(), message: z.string() })) }) }).passthrough() }) }) }).parse(await failed.json());
    expect(failure.result.structuredContent.error.error.code).toBe('validation_failed');
    expect(failure.result.structuredContent.error.error.fieldErrors.some(item => item.field === 'assigneeId')).toBe(true);
    await signInOnLocalServer(page, fixture.server, fixture.credentials, '/account/mcp-tokens');
    await page.getByRole('button', { name: 'View activity for ' + created.details.name, exact: true }).click();
    const region = page.getByRole('region', { name: 'Token activity', exact: true });
    await useCase('UC-MCP-0080', async () => {
      const row = region.locator('tbody tr').filter({ has: page.locator('td code').filter({ hasText: /^get_project$/ }) }).first();
      await expect(row).toContainText('Succeeded'); await expect(row).toContainText(/\d+ ms/);
      await expect(row.getByRole('link', { name: 'Open resource', exact: true })).toHaveAttribute('href', new URL('/projects/' + projectId, process.env['GATEGOLD_WEB_URL']).href);
    }, 'web');
    await useCase('UC-MCP-0081', async () => {
      const row = region.locator('tbody tr').filter({ has: page.locator('td code').filter({ hasText: /^create_issue$/ }) });
      await expect(row).toHaveCount(1); await expect(row).toContainText('Failed'); await expect(row).toContainText('validation_failed');
    }, 'web');
    await useCase('UC-MCP-0083', async () => {
      await expect(region).not.toContainText(privateValue);
      expect((await region.innerText()).includes(created.token)).toBe(false);
      await expect(region).not.toContainText('arguments'); await expect(region).not.toContainText('response');
      const response = await request.get(fixture.server.origin + '/api/v1/me/mcp-tokens/' + created.details.id + '/activity', { headers: fixture.headers });
      expect(response.status()).toBe(200);
      const wire = await response.text(); expect(wire.includes(privateValue)).toBe(false); expect(wire.includes(created.token)).toBe(false);
    }, 'web');
  } finally { await fixture.stop(); }
});

test('protected MCP resource discovery returns the exact advertised HTTP contract', async ({ request }) => {
  await useCase('UC-MCP-0032', async () => {
    const response = await request.get(apiOrigin + '/.well-known/oauth-protected-resource/mcp');
    expect(response.status()).toBe(200);
    const result = z.object({ resource: z.url(), authorization_servers: z.array(z.url()), scopes_supported: z.array(z.string()), bearer_methods_supported: z.array(z.string()), gategoldjira_website_url: z.url() }).strict().parse(await response.json());
    expect(result).toEqual({ resource: apiOrigin + '/mcp', authorization_servers: [apiOrigin + '/oauth'], scopes_supported: ['gategoldjira:access'], bearer_methods_supported: ['header'], gategoldjira_website_url: process.env['GATEGOLD_WEB_URL'] });
  }, 'rest');
});

test('MCP catalog and direct attempts cannot mint or manage browser-only credentials', async ({ request }) => {
  const origin = apiOrigin;
  if (!origin) throw new Error('The isolated Go API origin is required.');
  const bearer = await token('owner', 'mcp');
  const headers = { Authorization: 'Bearer ' + bearer, Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' };
  const forbiddenNames = ['create_personal_mcp_token', 'list_personal_mcp_tokens', 'revoke_personal_mcp_token'];
  await useCase('UC-MCP-0025', async () => {
    let cursor: string | undefined;
    const cursors = new Set<string>(); const names: string[] = []; let complete = false;
    for (let index = 0; index < 10; index++) {
      const response = await request.post(apiOrigin + '/mcp', { headers, data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: cursor ? { cursor } : {} } });
      expect(response.status()).toBe(200);
      const list = z.object({ jsonrpc: z.literal('2.0'), id: z.literal(1), result: z.object({ tools: z.array(z.object({ name: z.string() })), nextCursor: z.string().optional() }) }).parse(await response.json()).result;
      names.push(...list.tools.map(item => item.name));
      if (!list.nextCursor) { complete = true; break; }
      expect(cursors.has(list.nextCursor)).toBe(false); cursors.add(list.nextCursor); cursor = list.nextCursor;
    }
    expect(complete).toBe(true); expect(names.length).toBeGreaterThan(100); expect(new Set(names).size).toBe(names.length);
    for (const name of forbiddenNames) {
      expect(names).not.toContain(name);
      const denied = await mcp(request, origin, bearer, name, {});
      expect(denied.status()).toBe(200);
      const protocol = z.object({ jsonrpc: z.literal('2.0'), id: z.literal(1), error: z.object({ code: z.number().int(), message: z.string().min(1) }) }).strict().parse(await denied.json());
      expect(protocol.error.code).toBe(-32602);
    }
  }, 'mcp');
  await useCase('UC-MCP-0025', async () => {
    const browser = await request.get(apiOrigin + '/api/v1/me/mcp-tokens', { headers: await authorization() });
    expect(browser.status()).toBe(200); zTokenList.parse(await browser.json());
    for (const [method, path, data] of [
      ['GET', '/api/v1/me/mcp-tokens', undefined],
      ['POST', '/api/v1/me/mcp-tokens', { name: 'Assistant denied' }],
      ['POST', '/api/v1/me/mcp-tokens/' + crypto.randomUUID() + '/revoke', {}],
    ] as const) {
      const denied = await request.fetch(apiOrigin + path, { method, headers: { Authorization: 'Bearer ' + bearer }, ...(data ? { data } : {}) });
      expect(denied.status()).toBe(401);
      expect(zFailureBody.strict().parse(await denied.json()).error.code).toBe('authentication_required');
    }
  }, 'rest');
});

test('OAuth consent REST decisions retain original state and completed requests cannot be reused in the browser', async ({ page, request }) => {
  const callback = apiOrigin + '/oauth/callback';
  const verifier = 'abcdefghijklmnopqrstuvwxyz0123456789-._~ABCDE';
  const initial = new Set((await read(request, '/api/v1/me/mcp-tokens', zTokenList, 'member')).items.map(item => item.id));
  const begin = async () => {
    const state = crypto.randomUUID();
    const query = new URLSearchParams({ client_id: 'gategoldjira-antigravity', response_type: 'code', scope: 'gategoldjira:access', resource: apiOrigin + '/mcp', redirect_uri: callback, state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    const reply = await request.get(apiOrigin + '/oauth/authorize?' + query, { maxRedirects: 0 }); expect(reply.status()).toBe(302);
    const destination = new URL(reply.headers()['location']!); const id = destination.searchParams.get('request'); expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    return { id: id!, state, route: destination.pathname + destination.search };
  };
  try {
    const denied = await begin();
    await useCase('UC-MCP-0052', async () => {
      const response = await request.get(apiOrigin + '/api/v1/me/mcp-authorizations/' + denied.id, { headers: await authorization('member') });
      expect(response.status()).toBe(200); expect(response.headers()['cache-control']).toBe('no-store');
      expect(zOAuthConsent.parse(await response.json())).toEqual({ clientName: 'Antigravity', redirectUri: callback, scope: 'gategoldjira:access' });
    }, 'rest');
    await useCase('UC-MCP-0054', async () => {
      const response = await request.post(apiOrigin + '/api/v1/me/mcp-authorizations/' + denied.id, { headers: await authorization('member'), data: { allow: false } });
      expect(response.status()).toBe(200);
      const target = new URL(zOAuthRedirect.parse(await response.json()).redirectUrl);
      expect(target.origin + target.pathname).toBe(callback); expect(target.searchParams.get('state')).toBe(denied.state); expect(target.searchParams.get('error')).toBe('access_denied'); expect(target.searchParams.get('code')).toBeNull();
      expect((await read(request, '/api/v1/me/mcp-tokens', zTokenList, 'member')).items.filter(item => !initial.has(item.id))).toEqual([]);
    }, 'rest');
    await useCase('UC-MCP-0056', async () => {
      await signIn(page, 'member', denied.route, /^Connect Antigravity$/);
      await expect(page.getByRole('alert')).toContainText('This connection request has expired or was already completed. Start again from Antigravity.');
      await expect(page.getByRole('button', { name: 'Approve connection', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Cancel connection', exact: true })).toHaveCount(0);
    }, 'web');
    const approved = await begin();
    await useCase('UC-MCP-0053', async () => {
      const response = await request.post(apiOrigin + '/api/v1/me/mcp-authorizations/' + approved.id, { headers: await authorization('member'), data: { allow: true } });
      expect(response.status()).toBe(200); expect(response.headers()['cache-control']).toBe('no-store');
      const target = new URL(zOAuthRedirect.parse(await response.json()).redirectUrl);
      expect(target.origin + target.pathname).toBe(callback); expect(target.searchParams.get('state')).toBe(approved.state); expect(target.searchParams.get('iss')).toBe(apiOrigin + '/oauth'); expect(target.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(target.searchParams.get('error')).toBeNull();
      const second = await request.post(apiOrigin + '/api/v1/me/mcp-authorizations/' + approved.id, { headers: await authorization('member'), data: { allow: true } });
      expect(second.status()).toBe(404);
    }, 'rest');
  } finally {
    for (const item of (await read(request, '/api/v1/me/mcp-tokens', zTokenList, 'member')).items.filter(item => !initial.has(item.id)))
      await save(request, '/api/v1/me/mcp-tokens/' + item.id + '/revoke', {}, zTokenView, { method: 'POST', role: 'member' });
  }
});
