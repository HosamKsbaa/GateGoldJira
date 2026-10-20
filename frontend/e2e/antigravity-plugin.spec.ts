import { expect, type Browser, type Page } from '@playwright/test';
import { spawn, execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { test } from './support/browser-test';
import { apiOrigin, configureLocalSignIn, fillCredentials, localFixturesAvailable, token } from './support/session';
import { isolatedProject, useModernIssues } from './support/project';
import { useCase } from './support/use-case';
import { zSavedModernIssueView, zSavedIssueView, zTokenList, zPageProjectView } from '../src/app/api/generated/zod.gen';

const plugin = process.env['GATEGOLD_PLUGIN_PACKAGE'];
const sdk = process.env['GATEGOLD_PLUGIN_SDK'];
test.skip(!localFixturesAvailable || !plugin || !sdk, 'Use scripts/test-antigravity-plugin.sh.');
const responseSchema = z.object({ id: z.number().optional(), result: z.unknown().optional(), error: z.unknown().optional() });
class Bridge {
  readonly child: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private pending = new Map<number, { resolve: (result: unknown) => void; reject: (reason: Error) => void }>();
  constructor(path: string, directory: string) {
    const config = z.object({ mcpServers: z.object({ gategoldjira: z.object({ command: z.literal('node'), args: z.tuple([z.literal('bridge.mjs')]), cwd: z.literal('.') }) }) }).parse(JSON.parse(readFileSync(join(path, 'mcp_config.json'), 'utf8'))).mcpServers.gategoldjira;
    this.child = spawn(config.command, config.args, { cwd: resolve(path, config.cwd), env: { ...process.env, GATEGOLDJIRA_DATA_DIR: directory, GATEGOLDJIRA_CONFIG_DIR: directory + '-host-config' }, stdio: 'pipe' });
    this.child.stderr.resume();
    createInterface({ input: this.child.stdout }).on('line', line => {
      const result = responseSchema.parse(JSON.parse(line));
      if (result.id === undefined) return;
      const waiter = this.pending.get(result.id);
      if (!waiter) return;
      this.pending.delete(result.id);
      if (result.error) waiter.reject(new Error('The plugin bridge returned an MCP protocol error.'));
      else waiter.resolve(result.result);
    });
    this.child.on('close', () => { for (const waiter of this.pending.values()) waiter.reject(new Error('Plugin bridge closed.')); this.pending.clear(); });
    this.child.on('error', () => { for (const waiter of this.pending.values()) waiter.reject(new Error('Plugin bridge failed to start.')); this.pending.clear(); });
  }
  request(method: string, params: unknown = {}) {
    const id = ++this.sequence;
    const pending = new Promise<unknown>((resolve, reject) => this.pending.set(id, { resolve, reject }));
    void pending.catch(() => {});
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return pending;
  }
  async initialize() {
    await this.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'Plugin acceptance', version: '1' } });
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  }
  call(name: string, args: unknown = {}) { return this.request('tools/call', { name, arguments: args }); }
  async close() {
    if (this.child.exitCode !== null || this.child.signalCode !== null) return;
    const closed = once(this.child, 'close'); this.child.kill('SIGTERM'); await closed;
  }
}
async function availablePort(): Promise<number> {
  const server = createServer(); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No local port');
  const port = address.port; await new Promise<void>(resolve => server.close(() => resolve())); return port;
}
async function approve(browser: Browser, panel: Page, username: string): Promise<void> {
  const link = panel.getByRole('link', { name: /Continue sign-in/ });
  const address = await useCase('UC-MCP-0091', async () => {
    await panel.getByRole('button', { name: 'Sign in with browser', exact: true }).click();
    await expect(link).toBeVisible();
    const address = await link.getAttribute('href'); if (!address) throw new Error('No authorization address');
    const target = new URL(address);
    expect(target.origin).toBe(apiOrigin); expect(target.pathname).toBe('/oauth/authorize');
    expect(target.searchParams.get('response_type')).toBe('code');
    expect(target.searchParams.get('resource')).toBe(apiOrigin + '/mcp');
    expect(target.searchParams.get('scope')).toBe('gategoldjira:access');
    expect(target.searchParams.get('code_challenge_method')).toBe('S256');
    expect(target.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(target.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    return address;
  }, 'plugin');
  const context = await browser.newContext({ baseURL: process.env['GATEGOLD_WEB_URL'] });
  try {
    const login = await context.newPage(); await configureLocalSignIn(login);
    await useCase('UC-MCP-0092', async () => {
      await expect(link).toBeVisible();
      await login.goto(address);
      await expect(login.getByRole('heading', { name: 'Welcome to GateGoldJira', exact: true })).toBeVisible();
    }, 'plugin');
    await fillCredentials(login, username);
    await login.getByRole('button', { name: 'Sign in locally', exact: true }).click();
    await expect(login.getByRole('heading', { name: 'Connect Antigravity', exact: true })).toBeVisible();
    await login.getByRole('button', { name: 'Approve connection', exact: true }).click();
    await expect(login.getByRole('heading', { name: 'You are connected', exact: true })).toBeVisible();
    await expect(panel.locator('#connection-badge')).toHaveText('Connected', { timeout: 15000 });
  } finally { await context.close(); }
}
const identity = z.object({ structuredContent: z.object({ ok: z.literal(true), data: z.object({ userId: z.string().uuid() }) }) });
test('native panel and MCP bridge share OAuth, refresh safely, retain links and switch accounts', async ({ page, browser }, info) => {
  test.setTimeout(180000);
  if (!plugin || !sdk || !apiOrigin) throw new Error('Plugin acceptance environment is missing.');
  const preexisting = await page.request.get(apiOrigin + '/api/v1/me/mcp-tokens', { headers: { Authorization: 'Bearer ' + await token('member') } });
  expect(preexisting.status()).toBe(200);
  const preexistingIds = new Set(zTokenList.parse(await preexisting.json()).items.map(item => item.id));
  const projectResponse = await page.request.get(apiOrigin + '/api/v1/projects?limit=100', { headers: { Authorization: 'Bearer ' + await token('member') } });
  expect(projectResponse.status()).toBe(200);
  const projectCount = zPageProjectView.parse(await projectResponse.json()).totalMatching;
  for (let count = projectCount; count < 26; count++) await isolatedProject(page.request);
  const copied = info.outputPath('Copied plugin — portable', 'gategoldjira');
  await cp(plugin, copied, { recursive: true });
  const data = info.outputPath('private-plugin-data'); await mkdir(data, { recursive: true, mode: 0o700 });
  const port = await availablePort(); const uiToken = randomUUID(); const origin = 'http://127.0.0.1:' + port;
  const sidecar = spawn(process.execPath, ['--import', join(sdk, 'register_loader.js'), join(copied, 'sidecar.mjs')], {
    env: { ...process.env, GATEGOLDJIRA_DATA_DIR: data, ANTIGRAVITY_LS_ADDRESS: '127.0.0.1:1', ANTIGRAVITY_CSRF_TOKEN: 'isolated-sidecar-fixture', ANTIGRAVITY_SIDECAR_WEB_PORT: String(port), ANTIGRAVITY_SIDECAR_UI_TOKEN: uiToken }, stdio: 'pipe',
  });
  let diagnostics = ''; sidecar.stderr.on('data', chunk => { diagnostics = (diagnostics + String(chunk)).slice(-4096); }); sidecar.stdout.resume();
  const bridges: Bridge[] = [];
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  try {
    const first = new Bridge(copied, data); bridges.push(first); await first.initialize();
    expect(z.object({ isError: z.literal(true) }).parse(await first.call('get_me')).isError).toBe(true);
    expect(JSON.parse(await readFile(join(data + '-host-config', 'config.json'), 'utf8'))).toEqual({ sidecars: { 'gategoldjira/studio': { enabled: true } } });
    await expect.poll(async () => { try { return (await page.request.get(origin)).status(); } catch { return 0; } }, { timeout: 15000 }).toBe(200);
    expect((await page.request.post(origin + '/api/status', { data: {} })).status()).toBe(401);
    expect((await page.request.get(origin + '/api/status')).status()).toBe(405);
    await page.addInitScript(() => { window.open = () => null; });
    await page.goto(origin + '/?token=' + uiToken);
    await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#connection-badge')).toHaveText('Not connected');
    await expect(page.getByLabel('Server URL', { exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Sign in with browser', exact: true })).toBeDisabled();
    await page.screenshot({ path: join(process.env['GATEGOLD_E2E_EVIDENCE']!, 'antigravity-plugin-first-run.png'), fullPage: true });
    await useCase('UC-MCP-0089', async () => {
      await page.getByLabel('Server URL', { exact: true }).fill('http://company.example.test');
      await page.getByRole('button', { name: 'Save server settings', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('HTTP is only supported on this computer.');
      await expect(page.locator('#connection-badge')).toHaveText('Not connected');
      await expect(stat(join(data, 'settings.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    }, 'plugin');
    await useCase('UC-MCP-0088', async () => {
      await page.getByLabel('Server URL', { exact: true }).fill(apiOrigin!);
      await page.getByRole('button', { name: 'Save server settings', exact: true }).click();
      await expect(page.getByRole('status')).toContainText('Server settings saved');
      expect(JSON.parse(await readFile(join(data, 'settings.json'), 'utf8'))).toEqual({ endpoint: apiOrigin + '/mcp', website: process.env['GATEGOLD_WEB_URL'] });
    }, 'plugin');
    const tools = z.object({ tools: z.array(z.object({ name: z.string() })) }).parse(await first.request('tools/list'));
    expect(tools.tools.some(tool => tool.name === 'create_issue')).toBe(true);
    expect(z.object({ isError: z.literal(true) }).parse(await first.call('get_me')).isError).toBe(true);
    await useCase('UC-MCP-0093', async () => {
      await page.getByRole('button', { name: 'Sign in with browser', exact: true }).click();
      const link = page.getByRole('link', { name: /Continue sign-in/ }); await expect(link).toBeVisible();
      const callback = new URL((await link.getAttribute('href'))!).searchParams.get('redirect_uri');
      expect(callback).toBeTruthy();
      await page.getByRole('button', { name: 'Cancel sign-in', exact: true }).click();
      await expect(page.locator('#connection-badge')).toHaveText('Not connected');
      await expect(link).toBeHidden();
      await expect(stat(join(data, 'credentials.json'))).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(page.request.get(callback!, { timeout: 1000 })).rejects.toThrow(/ECONNREFUSED|socket hang up/);
      expect(z.object({ isError: z.literal(true) }).parse(await first.call('get_me')).isError).toBe(true);
    }, 'plugin');
    await approve(browser, page, 'member');
    await useCase('UC-MCP-0094', async () => {
      await useCase('UC-MCP-0094', async () => {
        expect(identity.parse(await first.call('get_me')).structuredContent.data.userId).toBe('10000000-0000-4000-8000-000000000002');
      }, 'mcp');
      await expect(page.locator('#account-name')).toContainText('مطور تجريبي');
      await expect(page.locator('#account-email')).toContainText('member@example.test');
    }, 'plugin');
    const issued = await page.request.get(apiOrigin + '/api/v1/me/mcp-tokens', { headers: { Authorization: 'Bearer ' + await token('member') } });
    const pluginConnections = zTokenList.parse(await issued.json()).items.filter(item => !preexistingIds.has(item.id) && item.kind === 'oauth');
    expect(pluginConnections).toHaveLength(1);
    const ownConnectionId = pluginConnections[0]!.id;
    await useCase('UC-MCP-0106', async () => {
      await expect(page.getByLabel('Server URL', { exact: true })).toBeDisabled();
      await expect(page.locator('#website')).toBeDisabled();
    }, 'plugin');
    await useCase('UC-MCP-0096', async () => {
      await expect(page.locator('#project-list > article')).toHaveCount(25);
      const projectLink = page.locator('#project-list a').first();
      await expect(projectLink).toHaveAttribute('target', '_blank');
      await expect(projectLink).toHaveAttribute('rel', 'noopener noreferrer');
      const target = new URL((await projectLink.getAttribute('href'))!);
      expect(target.origin).toBe(process.env['GATEGOLD_WEB_URL']); expect(target.pathname).toMatch(/^\/backlog\/[0-9a-f-]{36}$/);
    }, 'plugin');
    await useCase('UC-MCP-0097', async () => {
      const first = await page.locator('#project-list a').evaluateAll(links => links.map(link => link.getAttribute('href')));
      await page.getByRole('button', { name: 'Load more projects', exact: true }).click();
      await expect(page.locator('#project-list > article')).toHaveCount(Math.min(50, Math.max(26, projectCount)));
      const next = await page.locator('#project-list a').evaluateAll(links => links.map(link => link.getAttribute('href')));
      expect(new Set(next).size).toBe(next.length); expect(next.slice(0, first.length)).toEqual(first);
    }, 'plugin');
    await page.screenshot({ path: join(process.env['GATEGOLD_E2E_EVIDENCE']!, 'antigravity-plugin-connected-desktop.png'), fullPage: true });
    const created = z.object({ structuredContent: z.object({ ok: z.literal(true), links: z.array(z.object({ url: z.string() })).min(1) }) }).parse(await first.call('create_issue', { projectId: '20000000-0000-4000-8000-000000000001', retryReference: randomUUID(), title: 'Plugin OAuth acceptance issue', type: 'task', priority: 'medium' }));
    expect(new URL(created.structuredContent.links[0]!.url).origin).toBe(process.env['GATEGOLD_WEB_URL']);
    await useCase('UC-MCP-0098', async () => {
      await page.getByRole('button', { name: 'Issues', exact: true }).click();
      await page.getByLabel('Title, key or issue number', { exact: true }).fill('Plugin OAuth acceptance issue');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(page.locator('#issue-list')).toContainText('Plugin OAuth acceptance issue');
    }, 'plugin');
    const nativeProject = await isolatedProject(page.request); await useModernIssues(nativeProject);
    const marker = 'Plugin canonical ' + randomUUID().slice(0, 8);
    const retained = z.object({ structuredContent: z.object({ ok: z.literal(true), data: zSavedIssueView }) }).parse(await first.call('create_issue', { projectId: '20000000-0000-4000-8000-000000000001', retryReference: randomUUID(), title: marker + ' retained' })).structuredContent.data.result;
    const native: Array<z.infer<typeof zSavedModernIssueView>['result']> = [];
    for (let index = 0; index < 27; index++) native.push(z.object({ structuredContent: z.object({ ok: z.literal(true), data: zSavedModernIssueView }) }).parse(await first.call('create_issue_v2', { projectId: nativeProject, retryReference: randomUUID(), title: marker + ' native ' + String(index).padStart(2, '0') })).structuredContent.data.result);
    await useCase('UC-MCP-0112', async () => {
      await page.getByLabel('Title, key or issue number', { exact: true }).fill(native[0]!.summary.title);
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(page.locator('#issue-list > article')).toHaveCount(1);
      await expect(page.locator('#issue-list')).toContainText(native[0]!.summary.title);
      await expect(page.locator('#issue-list')).toContainText(native[0]!.summary.stage.name);
      await useCase('UC-MCP-0112', async () => {
        const response = await first.call('search_issues_v2', { filters: { query: native[0]!.summary.title, sort: 'updated' }, page: { limit: 25 } });
        const result = z.object({ isError: z.literal(false).optional(), structuredContent: z.object({ ok: z.literal(true), data: z.object({ items: z.array(z.object({ id: z.uuid(), key: z.string(), title: z.string(), stage: z.object({ name: z.string() }) })), nextCursor: z.string().nullable() }) }) }).parse(response).structuredContent.data;
        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toMatchObject({ id: native[0]!.summary.id, key: native[0]!.summary.key, title: native[0]!.summary.title, stage: { name: native[0]!.summary.stage.name } });
        expect(result.nextCursor).toBeNull();
      }, 'mcp');
    }, 'plugin');
    await useCase('UC-MCP-0113', async () => {
      await page.getByLabel('Title, key or issue number', { exact: true }).fill(marker);
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(page.locator('#issue-list > article')).toHaveCount(25);
      await useCase('UC-MCP-0099', async () => {
        await page.getByRole('button', { name: 'Load more issues', exact: true }).click();
        await expect(page.locator('#issue-list > article')).toHaveCount(28);
        await expect(page.getByRole('button', { name: 'Load more issues', exact: true })).toBeHidden();
      }, 'plugin');
      await expect(page.locator('#issue-list')).toContainText(retained.summary.title);
      await expect(page.locator('#issue-list')).toContainText(native[0]!.summary.title);
      await expect(page.locator('#issue-list')).toContainText(retained.summary.key);
      await expect(page.locator('#issue-list')).toContainText(native[0]!.summary.key);
      await useCase('UC-MCP-0113', async () => {
        const items: Array<{ id: string; key: string; title: string; stage: { name: string } }> = [];
        const cursors = new Set<string>(); let cursor: string | undefined; let complete = false;
        for (let index = 0; index < 5; index++) {
          const response = await first.call('search_issues_v2', { filters: { query: marker, sort: 'updated' }, page: { limit: 25, ...(cursor ? { cursor } : {}) } });
          const result = z.object({ isError: z.literal(false).optional(), structuredContent: z.object({ ok: z.literal(true), data: z.object({ items: z.array(z.object({ id: z.uuid(), key: z.string(), title: z.string(), stage: z.object({ name: z.string() }) })), nextCursor: z.string().nullable() }) }) }).parse(response).structuredContent.data;
          items.push(...result.items);
          if (result.nextCursor === null) { complete = true; break; }
          expect(cursors.has(result.nextCursor)).toBe(false); cursors.add(result.nextCursor); cursor = result.nextCursor;
        }
        expect(complete).toBe(true); expect(items).toHaveLength(28); expect(new Set(items.map(item => item.id)).size).toBe(28);
        expect(items).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: retained.summary.id, key: retained.summary.key, title: retained.summary.title }),
          expect.objectContaining({ id: native[0]!.summary.id, key: native[0]!.summary.key, title: native[0]!.summary.title, stage: { name: native[0]!.summary.stage.name } }),
        ]));
      }, 'mcp');
    }, 'plugin');
    const path = join(data, 'credentials.json');
    const credential = z.record(z.string(), z.unknown()).parse(JSON.parse(await readFile(path, 'utf8')));
    await writeFile(path, JSON.stringify({ ...credential, expiresAt: Date.now() - 1 }), { mode: 0o600 });
    const second = new Bridge(copied, data); bridges.push(second); await second.initialize();
    await useCase('UC-MCP-0102', async () => {
      await useCase('UC-MCP-0102', async () => {
        const identities = await Promise.all([first.call('get_me'), second.call('get_me'), page.getByRole('button', { name: 'Refresh', exact: true }).click()]);
        for (const value of identities.slice(0, 2)) expect(identity.parse(value).structuredContent.data.userId).toBe('10000000-0000-4000-8000-000000000002');
      }, 'mcp');
      await expect(page.locator('#connection-badge')).toHaveText('Connected');
    }, 'plugin');
    await useCase('UC-MCP-0101', async () => {
      await page.getByRole('button', { name: 'Refresh', exact: true }).click();
      await expect(page.locator('#connection-badge')).toHaveText('Connected');
      await expect(page.locator('#account-email')).toHaveText('member@example.test');
      await expect(page.locator('#project-list > article')).toHaveCount(25);
    }, 'plugin');
    const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
    if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database)) throw new Error('Server expiry verification requires an isolated database.');
    const sql = async (query: string) => (await promisify(execFile)('docker', ['compose', '-f', resolve('../compose.dev.yaml'), 'exec', '-T', 'postgres', 'psql', '--username=gategoldjira', '--dbname=' + database, '-tAc', query])).stdout.trim();
    if (!/^[0-9a-f-]{36}$/.test(ownConnectionId)) throw new Error('The plugin connection is not a UUID.');
    await sql("UPDATE mcp_oauth_credentials SET access_expires_at=now()-interval '1 second' WHERE access_hash IS NOT NULL AND connection_id='" + ownConnectionId + "';");
    const afterServerExpiry = await Promise.all([first.call('get_me'), second.call('get_me')]);
    for (const value of afterServerExpiry) expect(identity.parse(value).structuredContent.data.userId).toBe('10000000-0000-4000-8000-000000000002');
    expect(await sql("SELECT count(*) FROM mcp_oauth_credentials WHERE refresh_used=true AND connection_id='" + ownConnectionId + "'")).toBe('2');
    expect((await stat(data)).mode & 0o777).toBe(0o700); expect((await stat(path)).mode & 0o777).toBe(0o600);
    await useCase('UC-MCP-0108', async () => {
      expect(await page.locator('body').innerText()).not.toMatch(/gg_(oauth|refresh)_/);
      expect(await page.content()).not.toMatch(/gg_(oauth|refresh)_/);
    }, 'plugin');
    await page.setViewportSize({ width: 320, height: 760 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: join(process.env['GATEGOLD_E2E_EVIDENCE']!, 'antigravity-plugin-connected-narrow.png'), fullPage: true });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.setViewportSize({ width: 680, height: 900 });
    await page.screenshot({ path: join(process.env['GATEGOLD_E2E_EVIDENCE']!, 'antigravity-plugin-connected-dark.png'), fullPage: true });
    await useCase('UC-MCP-0103', async () => {
      await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
      await expect(page.locator('#connection-badge')).toHaveText('Not connected');
      expect(z.object({ isError: z.literal(true) }).parse(await first.call('get_me')).isError).toBe(true);
      const connection = await page.request.get(apiOrigin + '/api/v1/me/mcp-tokens', { headers: { Authorization: 'Bearer ' + await token('member') } });
      expect(zTokenList.parse(await connection.json()).items.find(item => item.id === ownConnectionId)?.revokedAt).not.toBeNull();
    }, 'plugin');
    await useCase('UC-MCP-0105', async () => {
      await approve(browser, page, 'viewer');
      expect(identity.parse(await second.call('get_me')).structuredContent.data.userId).toBe('10000000-0000-4000-8000-000000000003');
      await expect(page.locator('#account-email')).toHaveText('viewer@example.test');
      await expect(page.locator('#issue-list')).not.toContainText(marker);
      await expect(page.locator('#account-email')).not.toContainText('member@example.test');
    }, 'plugin');
    const denied = z.object({ isError: z.literal(true), structuredContent: z.object({ ok: z.literal(false) }) }).parse(await second.call('create_issue', { projectId: '20000000-0000-4000-8000-000000000001', retryReference: randomUUID(), title: 'Viewer cannot create this issue' }));
    expect(denied.structuredContent.ok).toBe(false);
    await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
    await expect(page.locator('#workspace')).toBeHidden();
    const response = await page.request.get(apiOrigin + '/api/v1/me/mcp-tokens', { headers: { Authorization: 'Bearer ' + await token('member') } });
    const connections = z.object({ items: z.array(z.object({ id: z.string(), kind: z.string(), revokedAt: z.string().nullable() })) }).parse(await response.json());
    const own = connections.items.filter(item => item.id === ownConnectionId); expect(own).toHaveLength(1); expect(own[0]!.revokedAt).not.toBeNull();
    const activity = await page.request.get(apiOrigin + '/api/v1/me/mcp-tokens/' + own[0]!.id + '/activity', { headers: { Authorization: 'Bearer ' + await token('member') } });
    expect(JSON.stringify(await activity.json())).toContain('create_issue');
    await useCase('UC-MCP-0110', async () => {
      // Blocking the host preload exercises a missing host API, never fabricated service data.
      await page.route('**/preload.js', route => route.abort('blockedbyclient'));
      await page.reload();
      await expect(page.getByRole('status')).toHaveText('Open this panel in Antigravity to connect your account.');
      await expect(page.locator('#workspace')).toBeHidden();
      expect(await page.evaluate(() => !('sidecar' in window))).toBe(true);
    }, 'plugin');
    expect(errors).toEqual([]);
  } catch (error) {
    await info.attach('sidecar-diagnostics', { body: diagnostics, contentType: 'text/plain' }); throw error;
  } finally {
    for (const bridge of bridges) await bridge.close();
    if (sidecar.exitCode === null && sidecar.signalCode === null) { const closed = once(sidecar, 'close'); sidecar.kill('SIGTERM'); await closed; }
  }
});
