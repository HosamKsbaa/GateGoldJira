import { expect } from '@playwright/test';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import * as z from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { read, save, expireFixtureOAuth } from './support/coverage-access';
import { zTokenList, zTokenView } from '../src/app/api/generated/zod.gen';

const proxyPath = process.env['GATEGOLD_MCP_REMOTE_PROXY'];
test.skip(!localFixturesAvailable || !proxyPath, 'Use scripts/test-mcp-remote.sh.');
const configSchema = z.object({
  mcpServers: z.object({
    gategoldjira: z.object({ command: z.literal('npx'), args: z.array(z.string()) }),
  }),
});
const responseSchema = z.object({
  id: z.number().optional(),
  result: z.unknown().optional(),
  error: z.unknown().optional(),
});
const identitySchema = z.object({
  structuredContent: z.object({
    ok: z.literal(true),
    data: z.object({ userId: z.literal('10000000-0000-4000-8000-000000000002') }),
  }),
});

class ProxyClient {
  readonly process: ChildProcessWithoutNullStreams;
  stderr = '';
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: Error) => void }
  >();
  constructor(path: string, args: string[], cache: string) {
    this.process = spawn(process.execPath, [path, ...args], {
      env: {
        ...process.env,
        MCP_REMOTE_CONFIG_DIR: cache,
        BROWSER: '/bin/true',
        XDG_CURRENT_DESKTOP: 'X-Generic',
        DISPLAY: '',
        WAYLAND_DISPLAY: '',
        DBUS_SESSION_BUS_ADDRESS: '',
      },
      stdio: 'pipe',
    });
    this.process.stderr.on('data', chunk => {
      this.stderr = (this.stderr + String(chunk)).slice(-64 * 1024);
    });
    createInterface({ input: this.process.stdout }).on('line', line => {
      const parsed = responseSchema.safeParse(JSON.parse(line));
      if (!parsed.success || parsed.data.id === undefined) return;
      const pending = this.pending.get(parsed.data.id);
      if (!pending) return;
      this.pending.delete(parsed.data.id);
      if (parsed.data.error !== undefined)
        pending.reject(new Error('The MCP proxy returned a protocol error.'));
      else pending.resolve(parsed.data.result);
    });
    this.process.on('error', () => this.failPending());
    this.process.on('close', () => this.failPending());
  }
  private failPending() {
    for (const pending of this.pending.values())
      pending.reject(new Error('The MCP proxy closed before responding.'));
    this.pending.clear();
  }
  request(method: string, params: unknown) {
    const id = ++this.nextId;
    const response = new Promise<unknown>((resolve, reject) =>
      this.pending.set(id, { resolve, reject }),
    );
    // A response may wait for browser approval; attach a handler immediately.
    void response.catch(() => {});
    this.process.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return response;
  }
  initialized() {
    this.process.stdin.write(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n',
    );
  }
  authorizationURL() {
    const match = this.stderr.match(/https?:\/\/[^\s]+\/oauth\/authorize\?[^\s]+/);
    if (!match) return undefined;
    const address = new URL(match[0]);
    return address.origin === apiOrigin ? address.href : undefined;
  }
  async close() {
    if (this.process.exitCode !== null || this.process.signalCode !== null) return;
    const closed = once(this.process, 'close');
    this.process.kill('SIGTERM');
    await closed;
  }
}

test('the copied OAuth proxy config signs in, caches credentials, refreshes, and logs calls', async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  if (!proxyPath) throw new Error('Install the proxy with scripts/test-mcp-remote.sh.');
  const preexistingIds = new Set((await read(page.request, '/api/v1/me/mcp-tokens', zTokenList, 'member')).items.map(connection => connection.id));
  let ownConnectionId: string | undefined;
  await signIn(page, 'member', '/account/mcp-tokens', /MCP connections/);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy OAuth configuration', exact: true }).click();
  const config = configSchema.parse(
    JSON.parse(await page.evaluate(() => navigator.clipboard.readText())),
  );
  const args = config.mcpServers.gategoldjira.args;
  expect(args.slice(0, 3)).toEqual(['-y', 'mcp-remote@0.15.1', apiOrigin + '/mcp']);
  await expect(page.getByRole('status')).toContainText('reload the server');
  const cache = testInfo.outputPath('private-oauth-cache');
  await mkdir(cache, { recursive: true, mode: 0o700 });
  let proxy = new ProxyClient(proxyPath, args.slice(2), cache);
  try {
    const initialized = proxy.request('initialize', {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'GateGoldJira proxy acceptance', version: '1' },
    });
    const address = await useCase('UC-MCP-0039', async () => {
      // A real mcp-remote initialize consumes the live protected-resource and
      // authorization-server metadata before exposing this OAuth handoff.
      await expect.poll(() => proxy.authorizationURL(), { timeout: 30_000 }).toBeTruthy();
      const address = proxy.authorizationURL();
      if (!address) throw new Error('Proxy did not request browser authorization.');
      const target = new URL(address);
      expect(target.origin + target.pathname).toBe(apiOrigin + '/oauth/authorize');
      expect(target.searchParams.get('code_challenge_method')).toBe('S256');
      expect(target.searchParams.get('scope')).toBe('gategoldjira:access');
      expect(target.searchParams.get('resource')).toBe(apiOrigin + '/mcp');
      return address;
    }, 'mcp');
    const destination = await useCase('UC-MCP-0042', async () => {
      const response = await page.request.get(address, { maxRedirects: 0 });
      expect(response.status()).toBe(302);
      const destination = new URL(response.headers()['location']!);
      expect(destination.origin).toBe(process.env['GATEGOLD_WEB_URL']);
      expect(destination.pathname).toBe('/account/mcp-authorize');
      expect(destination.searchParams.get('request')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      return destination;
    }, 'mcp');
    await signIn(page, 'member', destination.pathname + destination.search, /Connect Antigravity/);
    await expect(
      page.getByRole('heading', { name: 'Connect Antigravity', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Approve connection', exact: true }).click();
    // The click dispatches approval asynchronously. A completed real initialize
    // proves the proxy exchanged that approval before reading its new connection.
    await useCase('UC-MCP-0039', async () => {
      const result = z.object({ protocolVersion: z.literal('2025-11-25'), serverInfo: z.object({ name: z.literal('GateGoldJira') }) }).parse(await initialized);
      expect(result.serverInfo.name).toBe('GateGoldJira');
    }, 'mcp');
    const created = (await read(page.request, '/api/v1/me/mcp-tokens', zTokenList, 'member')).items.filter(connection => !preexistingIds.has(connection.id) && connection.kind === 'oauth');
    expect(created).toHaveLength(1); ownConnectionId = created[0]!.id;
    proxy.initialized();
    identitySchema.parse(await proxy.request('tools/call', { name: 'get_me', arguments: {} }));
    await proxy.close();
    await expireFixtureOAuth(ownConnectionId, 'access');
    proxy = new ProxyClient(proxyPath, args.slice(2), cache);
    await useCase('UC-MCP-0039', async () => {
      await proxy.request('initialize', {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: { name: 'GateGoldJira proxy cache acceptance', version: '1' },
      });
      proxy.initialized();
      expect(identitySchema.parse(await proxy.request('tools/call', { name: 'get_me', arguments: {} })).structuredContent.data.userId).toBe('10000000-0000-4000-8000-000000000002');
      expect(proxy.authorizationURL()).toBeUndefined();
    }, 'mcp');
    await proxy.close();
    await signIn(page, 'member', '/account/mcp-tokens', /MCP connections/);
    const row = page.locator('[data-token-id="' + ownConnectionId + '"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Active');
    await row
      .getByRole('button', { name: 'View activity for Antigravity (browser login)', exact: true })
      .click();
    await expect(
      page
        .getByRole('region', { name: 'Token activity', exact: true })
        .getByRole('row')
        .filter({ hasText: 'get_me' }),
    ).toHaveCount(2);
    await row
      .getByRole('button', { name: 'Revoke Antigravity (browser login)', exact: true })
      .click();
    await row
      .getByRole('button', { name: 'Confirm revoke Antigravity (browser login)', exact: true })
      .click();
    await expect(row).toContainText('Revoked');
  } finally {
    await writeFile(testInfo.outputPath('proxy.stderr.private.log'), proxy.stderr, { mode: 0o600 });
    await proxy.close();
    if (ownConnectionId) await save(page.request, '/api/v1/me/mcp-tokens/' + ownConnectionId + '/revoke', {}, zTokenView, { method: 'POST', role: 'member' });
  }
});
