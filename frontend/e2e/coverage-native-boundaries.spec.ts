// Actual copied package, real SDK and isolated private profiles; hosted acceptance is tracked separately.
import { expect, type Browser, type Page, type TestInfo } from '@playwright/test';
import { spawn,execFile, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import {promisify} from 'node:util';
import { createServer } from 'node:net';
import { createServer as createHTTPServer } from 'node:http';
import { createInterface } from 'node:readline';
import { readFileSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile, stat, readdir,rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { LocalAuthServer, signInOnLocalServer } from './support/isolated-local-identity';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, configureLocalSignIn, fillCredentials, localFixturesAvailable, token } from './support/session';
import { zTokenList } from '../src/app/api/generated/zod.gen';
const plugin = process.env['GATEGOLD_PLUGIN_PACKAGE'];
const sdk = process.env['GATEGOLD_PLUGIN_SDK'];
test.skip(!localFixturesAvailable || !plugin || !sdk, 'Requires actual captured native package and installed host SDK.');
test.use({ trace: 'off' });
const responseSchema = z.object({ id: z.number().optional(), result: z.unknown().optional(), error: z.unknown().optional() });
class Bridge {
    readonly child: ChildProcessWithoutNullStreams;
    private sequence = 0;
    private pending = new Map<number, {
        resolve: (result: unknown) => void;
        reject: (reason: Error) => void;
    }>();
    constructor(path: string, directory: string) {
        const config = z.object({ mcpServers: z.object({ gategoldjira: z.object({ command: z.literal('node'), args: z.tuple([z.literal('bridge.mjs')]), cwd: z.literal('.') }) }) }).parse(JSON.parse(readFileSync(join(path, 'mcp_config.json'), 'utf8'))).mcpServers.gategoldjira;
        this.child = spawn(config.command, config.args, { cwd: resolve(path, config.cwd), env: { ...process.env, GATEGOLDJIRA_DATA_DIR: directory, GATEGOLDJIRA_CONFIG_DIR: directory + '-host-config' }, stdio: 'pipe' });
        this.child.stderr.resume();
        createInterface({ input: this.child.stdout }).on('line', line => {
            const result = responseSchema.parse(JSON.parse(line));
            if (result.id === undefined)
                return;
            const waiter = this.pending.get(result.id);
            if (!waiter)
                return;
            this.pending.delete(result.id);
            if (result.error)
                waiter.reject(new Error('The plugin bridge returned an MCP protocol error.'));
            else
                waiter.resolve(result.result);
        });
        this.child.on('close', () => {
            for (const waiter of this.pending.values())
                waiter.reject(new Error('Plugin bridge closed.'));
            this.pending.clear();
        });
        this.child.on('error', () => {
            for (const waiter of this.pending.values())
                waiter.reject(new Error('Plugin bridge failed to start.'));
            this.pending.clear();
        });
    }
    request(method: string, params: unknown = {}) {
        const id = ++this.sequence;
        const pending = new Promise<unknown>((resolve, reject) => this.pending.set(id, { resolve, reject }));
        void pending.catch(() => {
        });
        this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
        return pending;
    }
    async initialize() {
        await this.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'Plugin acceptance', version: '1' } });
        this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    }
    call(name: string, args: unknown = {}) {
        return this.request('tools/call', { name, arguments: args });
    }
    async close() {
        if (this.child.exitCode !== null || this.child.signalCode !== null)
            return;
        const closed = once(this.child, 'close');
        this.child.kill('SIGTERM');
        await closed;
    }
}
async function copiedPackage(info: TestInfo) {
    if (!plugin)
        throw new Error('A captured real plugin package is required.');
    const directory = info.outputPath('copied-portable-plugin');
    await cp(plugin, directory, { recursive: true });
    return directory;
}
async function privateProfile(info: TestInfo, name: string) {
    const directory = info.outputPath(name);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await mkdir(directory + '-host-config', { recursive: true, mode: 0o700 });
    return directory;
}
async function port() {
    const server = createServer();
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string')
        throw new Error('No local listener port.');
    await new Promise<void>(resolve => server.close(() => resolve()));
    return address.port;
}
async function sidecar(page: Page, copied: string, data: string) {
    if (!sdk)
        throw new Error('The real installed SDK is required.');
    const number = await port(), uiToken = randomUUID(), origin = 'http://127.0.0.1:' + number;
    const child = spawn(process.execPath, ['--import', join(sdk, 'register_loader.js'), join(copied, 'sidecar.mjs')], {
        env: { ...process.env, GATEGOLDJIRA_DATA_DIR: data, GATEGOLDJIRA_CONFIG_DIR: data + '-host-config', ANTIGRAVITY_LS_ADDRESS: '127.0.0.1:1', ANTIGRAVITY_CSRF_TOKEN: 'owned-native-boundary-fixture', ANTIGRAVITY_SIDECAR_WEB_PORT: String(number), ANTIGRAVITY_SIDECAR_UI_TOKEN: uiToken }, stdio: 'pipe',
    });
    child.stderr.resume();
    child.stdout.resume();
    const stop = async () => {
        if (child.exitCode === null && child.signalCode === null) {
            const closed = once(child, 'close');
            child.kill('SIGTERM');
            await closed;
        }
    };
    try {
        await expect.poll(async () => {
            try {
                return (await page.request.get(origin)).status();
            }
            catch {
                return 0;
            }
        }, { timeout: 15000 }).toBe(200);
        await page.addInitScript(() => {
            window.open = () => null;
        });
        await page.goto(origin + '/?token=' + uiToken);
        await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
        return { origin, stop };
    }
    catch (error) {
        await stop();
        throw error;
    }
}
async function saveSettings(page: Page, endpoint = apiOrigin) {
    if (!endpoint)
        throw new Error('The real service origin is required.');
    await page.getByLabel('Server URL', { exact: true }).fill(endpoint);
    await page.getByRole('button', { name: 'Save server settings', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Server settings saved');
}
async function approveActual(browser: Browser, panel: Page) {
    await panel.getByRole('button', { name: 'Sign in with browser', exact: true }).click();
    const link = panel.getByRole('link', { name: /Continue sign-in/ });
    await expect(link).toBeVisible();
    const address = await link.getAttribute('href');
    if (!address)
        throw new Error('The real plugin did not expose its authorization address.');
    const context = await browser.newContext({ baseURL: process.env['GATEGOLD_WEB_URL'] });
    try {
        const login = await context.newPage();
        await configureLocalSignIn(login);
        await login.goto(address);
        await fillCredentials(login, 'member');
        await login.getByRole('button', { name: 'Sign in locally', exact: true }).click();
        await expect(login.getByRole('heading', { name: 'Connect Antigravity', exact: true })).toBeVisible();
        await login.getByRole('button', { name: 'Approve connection', exact: true }).click();
        await expect(login.getByRole('heading', { name: 'You are connected', exact: true })).toBeVisible();
        await expect(panel.locator('#connection-badge')).toHaveText('Connected', { timeout: 15000 });
    }
    finally {
        await context.close();
    }
}
// These run the real public entry point and inspect its owned filesystem effects.
// Supported installed-host discovery/reload remains external acceptance (MCP0085).
test('an explicitly disabled native panel preference remains byte-for-byte intact', async ({}, info) => {
    const copied = await copiedPackage(info), data = await privateProfile(info, 'disabled-private-profile');
    const path = join(data + '-host-config', 'config.json');
    const source = '{\n  // An explicit employee preference must survive discovery.\n  "theme": "night",\n  "sidecars": { "gategoldjira/studio": { "enabled": false }, "other/panel": { "enabled": true } },\n}\n';
    await writeFile(path, source, { mode: 0o600 });
    const bridge = new Bridge(copied, data);
    try {
        await useCase('UC-MCP-0086', async () => {
            await useCase('UC-MCP-0086', async () => {
                // Execute the public CLI entry point against only the owned config/profile.
                await bridge.initialize();
                expect(await readFile(path, 'utf8')).toBe(source);
                expect((await readdir(data)).some(name => name.startsWith('panel-preference-backup-'))).toBe(false);
            }, 'operator');
            const tools = z.object({ tools: z.array(z.object({ name: z.string() })) }).parse(await bridge.request('tools/list'));
            expect(tools.tools.some(tool => tool.name === 'get_me')).toBe(true);
        }, 'plugin');
    }
    finally {
        await bridge.close();
    }
});
test('first native registration adds only its missing preference and backs up the original JSONC', async ({}, info) => {
    const copied = await copiedPackage(info), data = await privateProfile(info, 'missing-private-profile');
    const path = join(data + '-host-config', 'config.json');
    const comment = '// Keep the employee theme and other panels.';
    const source = '{\n  ' + comment + '\n  "theme": "night",\n  "sidecars": { "other/panel": { "enabled": false } },\n}\n';
    await writeFile(path, source, { mode: 0o600 });
    const bridge = new Bridge(copied, data);
    try {
        await useCase('UC-MCP-0087', async () => {
            await bridge.initialize();
            const saved = await readFile(path, 'utf8');
            expect(saved).toContain(comment);
            // Parse only this fixed test fixture's single known comment and optional trailing comma.
            const object = z.object({ theme: z.literal('night'), sidecars: z.object({ 'other/panel': z.object({ enabled: z.literal(false) }), 'gategoldjira/studio': z.object({ enabled: z.literal(true) }) }).strict() }).strict()
                .parse(JSON.parse(saved.replace(comment, '').replace(/,\s*}/g, '}')));
            expect(Object.keys(object.sidecars)).toHaveLength(2);
            const backups = (await readdir(data)).filter(name => name.startsWith('panel-preference-backup-'));
            await useCase('UC-MCP-0087', async () => {
                expect(saved).toContain(comment);
                expect(object.sidecars).toEqual({ 'other/panel': { enabled: false }, 'gategoldjira/studio': { enabled: true } });
                expect(backups).toHaveLength(1);
                expect(JSON.parse(await readFile(join(data, backups[0]!), 'utf8'))).toEqual({ path, contents: source });
            }, 'operator');
            await bridge.close();
            const second = new Bridge(copied, data);
            try {
                await second.initialize();
                expect(await readFile(path, 'utf8')).toBe(saved);
                expect((await readdir(data)).filter(name => name.startsWith('panel-preference-backup-'))).toEqual(backups);
            }
            finally {
                await second.close();
            }
        }, 'plugin');
    }
    finally {
        await bridge.close();
    }
});
test('native OAuth rejects wrong state, issuer, callback path and resource without installing credentials', async ({ page }, info) => {
    const copied = await copiedPackage(info), data = await privateProfile(info, 'callback-private-profile');
    const native = await sidecar(page, copied, data);
    try {
        await saveSettings(page);
        await useCase('UC-MCP-0095', async () => {
            await page.getByRole('button', { name: 'Sign in with browser', exact: true }).click();
            const link = page.getByRole('link', { name: /Continue sign-in/ });
            await expect(link).toBeVisible();
            const authorization = new URL((await link.getAttribute('href'))!);
            const callbackAddress = authorization.searchParams.get('redirect_uri'), state = authorization.searchParams.get('state');
            expect(callbackAddress).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/oauth\/callback$/);
            expect(state).toBeTruthy();
            for (const kind of ['state', 'issuer', 'path', 'duplicate', 'method'] as const) {
                const callback = new URL(callbackAddress!);
                callback.searchParams.set('state', state!);
                callback.searchParams.set('iss', apiOrigin + '/oauth');
                callback.searchParams.set('code', 'x'.repeat(43));
                if (kind === 'state')
                    callback.searchParams.set('state', 'wrong-' + state);
                if (kind === 'issuer')
                    callback.searchParams.set('iss', 'https://untrusted.example.test');
                if (kind === 'path')
                    callback.pathname = '/different/callback';
                if (kind === 'duplicate')
                    callback.searchParams.append('state', state!);
                const rejected = await page.request.fetch(callback.href, { method: kind === 'method' ? 'POST' : 'GET' });
                expect(rejected.status()).toBe(400);
                expect(await rejected.text()).toContain('Invalid authorization callback.');
                await expect(stat(join(data, 'credentials.json'))).rejects.toMatchObject({ code: 'ENOENT' });
                await expect(page.locator('#connection-badge')).toHaveText('Awaiting sign-in');
            }
            const wrongResource = new URL(authorization);
            wrongResource.searchParams.set('resource', apiOrigin + '/different-resource');
            const denied = await page.request.get(wrongResource.href, { maxRedirects: 0 });
            expect(denied.status()).toBe(400);
            expect(z.object({ error: z.literal('invalid_request') }).parse(await denied.json()).error).toBe('invalid_request');
            await expect(stat(join(data, 'credentials.json'))).rejects.toMatchObject({ code: 'ENOENT' });
            await expect(link).toBeVisible();
            await page.getByRole('button', { name: 'Cancel sign-in', exact: true }).click();
            await expect(link).toBeHidden();
        }, 'plugin');
    }
    finally {
        await native.stop();
    }
});
test('two explicit native profiles isolate actual OAuth credentials and settings', async ({ page, browser }, info) => {
    test.setTimeout(90000);
    const copied = await copiedPackage(info), a = await privateProfile(info, 'employee-profile-a'), b = await privateProfile(info, 'employee-profile-b');
    const beforeResponse = await page.request.get(apiOrigin + '/api/v1/me/mcp-tokens', { headers: { Authorization: 'Bearer ' + await token('member') } });
    expect(beforeResponse.status()).toBe(200);
    const before = new Set(zTokenList.parse(await beforeResponse.json()).items.map(item => item.id));
    const first = new Bridge(copied, a), second = new Bridge(copied, b);
    const native = await sidecar(page, copied, a);
    try {
        await first.initialize();
        await second.initialize();
        await saveSettings(page);
        await approveActual(browser, page);
        await useCase('UC-MCP-0109', async () => {
            const identity = z.object({ isError: z.literal(false).optional(), structuredContent: z.object({ ok: z.literal(true), data: z.object({ userId: z.uuid() }) }) }).parse(await first.call('get_me'));
            expect(identity.structuredContent.data.userId).toBe('10000000-0000-4000-8000-000000000002');
            expect(z.object({ isError: z.literal(true) }).parse(await second.call('get_me')).isError).toBe(true);
            await useCase('UC-MCP-0109', async () => {
                expect(a).not.toBe(b); expect(a).not.toBe(copied);
                expect(JSON.parse(await readFile(join(a, 'settings.json'), 'utf8'))).toEqual({ endpoint: apiOrigin + '/mcp', website: process.env['GATEGOLD_WEB_URL'] });
                expect((await stat(join(a, 'credentials.json'))).mode & 0o777).toBe(0o600);
                for (const path of [join(b, 'settings.json'), join(b, 'credentials.json'), join(copied, 'credentials.json')])
                    await expect(stat(path)).rejects.toMatchObject({ code: 'ENOENT' });
                expect((await stat(a)).mode & 0o777).toBe(0o700);
                expect((await stat(b)).mode & 0o777).toBe(0o700);
            }, 'operator');
            await useCase('UC-MCP-0100', async () => {
                const link = page.locator('#project-list a').first();
                await expect(link).toBeVisible();
                await expect(link).toHaveAttribute('target', '_blank');
                await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
                const address = new URL((await link.getAttribute('href'))!);
                expect(address.origin).toBe(process.env['GATEGOLD_WEB_URL']);
                expect(address.pathname).toMatch(/^\/backlog\/[0-9a-f-]{36}$/);
                // The new tab gets only the public local endpoint configuration. Its
                // identity remains a real, initially signed-out application session.
                await page.context().route('**/config.local.json', route => route.fulfill({ json: { mode: 'development', apiBaseUrl: apiOrigin + '/api/v1', issuer: apiOrigin + '/development-identity/', clientId: 'local-development', audience: apiOrigin + '/api', scope: 'openid profile email gategoldjira:access' } }));
                const opened = page.context().waitForEvent('page');
                await link.click();
                const resource = await opened;
                try {
                    await expect(resource).toHaveURL(url => url.origin === address.origin && url.pathname === '/sign-in' && url.searchParams.get('returnTo') === address.pathname);
                    await expect(resource.getByRole('heading', { name: 'Welcome to GateGoldJira', exact: true })).toBeVisible();
                    expect(await resource.evaluate(() => window.opener === null)).toBe(true);
                }
                finally {
                    await resource.close();
                }
            }, 'plugin');
            await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
            await expect(page.locator('#connection-badge')).toHaveText('Not connected');
            await expect(stat(join(a, 'credentials.json'))).rejects.toMatchObject({ code: 'ENOENT' });
            await expect(stat(join(b, 'credentials.json'))).rejects.toMatchObject({ code: 'ENOENT' });
        }, 'plugin');
    }
    finally {
        const cleanup = (label: string, operation: () => Promise<void>) => test.step(label, async () => {
            const started = performance.now();
            console.info('Native profile cleanup started: ' + label);
            await operation();
            console.info('Native profile cleanup completed: ' + label + ' (' + Math.round(performance.now() - started) + 'ms)');
        });
        try {
            await cleanup('Revoke remaining OAuth credentials owned by this story', async () => {
                const connections = await page.request.get(apiOrigin + '/api/v1/me/mcp-tokens', { headers: { Authorization: 'Bearer ' + await token('member') } });
                expect(connections.status()).toBe(200);
                for (const item of zTokenList.parse(await connections.json()).items.filter(item => !before.has(item.id) && item.kind === 'oauth' && item.revokedAt === null)) {
                    const revoked = await page.request.post(apiOrigin + '/api/v1/me/mcp-tokens/' + item.id + '/revoke', { headers: { Authorization: 'Bearer ' + await token('member'), 'Idempotency-Key': randomUUID() }, data: {} });
                    expect(revoked.status()).toBe(200);
                }
            });
        }
        finally {
            await cleanup('Gracefully stop the authenticated first profile bridge', () => first.close());
            await cleanup('Gracefully stop the unauthenticated second profile bridge', () => second.close());
            await cleanup('Gracefully stop the real SDK native panel', () => native.stop());
        }
    }
});
test('advanced website override safely configures a real server whose discovery route is unavailable', async ({ page }, info) => {
    const copied = await copiedPackage(info), data = await privateProfile(info, 'legacy-discovery-profile');
    let missingDiscoveryRequests = 0;
    // Real loopback fault proxy: only discovery is intentionally unavailable;
    // other requests are forwarded to Go without synthesizing a business success.
    const proxy = createHTTPServer((incoming, outgoing) => {
        void (async () => {
            if (incoming.url === '/.well-known/oauth-protected-resource/mcp') {
                missingDiscoveryRequests++;
                outgoing.writeHead(404);
                outgoing.end('Discovery is unavailable on this owned legacy fixture.');
                return;
            }
            const chunks: Buffer[] = [];
            for await (const raw of incoming) {
                const chunk: unknown = raw;
                if (!Buffer.isBuffer(chunk))
                    throw new Error('Unexpected request body chunk.');
                chunks.push(chunk);
            }
            const headers = new Headers();
            for (const key of ['authorization', 'content-type', 'accept', 'mcp-protocol-version']) {
                const value = incoming.headers[key];
                if (typeof value === 'string')
                    headers.set(key, value);
            }
            const target = new URL(incoming.url ?? '/', apiOrigin);
            if (target.origin !== apiOrigin)
                throw new Error('The owned proxy may forward only to the captured Go origin.');
            const response = await fetch(target, { method: incoming.method, headers, redirect: 'manual', ...(!['GET', 'HEAD'].includes(incoming.method ?? '') ? { body: Buffer.concat(chunks) } : {}) });
            outgoing.statusCode = response.status;
            for (const [key, value] of response.headers)
                if (!['content-length', 'content-encoding', 'transfer-encoding', 'connection'].includes(key))
                    outgoing.setHeader(key, value);
            outgoing.end(Buffer.from(await response.arrayBuffer()));
        })().catch(() => {
            outgoing.writeHead(502);
            outgoing.end('The owned legacy fixture could not reach the real Go server.');
        });
    });
    proxy.listen(0, '127.0.0.1');
    await once(proxy, 'listening');
    const address = proxy.address();
    if (!address || typeof address === 'string')
        throw new Error('No owned legacy fault-proxy address.');
    const legacy = 'http://127.0.0.1:' + address.port;
    const native = await sidecar(page, copied, data);
    try {
        await useCase('UC-MCP-0090', async () => {
            await page.getByLabel('Server URL', { exact: true }).fill(legacy);
            await page.getByRole('button', { name: 'Save server settings', exact: true }).click();
            await expect(page.getByRole('status')).toContainText('Could not detect the website.');
            expect(missingDiscoveryRequests).toBe(1);
            await expect(stat(join(data, 'settings.json'))).rejects.toMatchObject({ code: 'ENOENT' });
            await page.getByText('Advanced settings', { exact: true }).click();
            await page.getByLabel('Website URL override', { exact: true }).fill(process.env['GATEGOLD_WEB_URL']!);
            await page.getByRole('button', { name: 'Save server settings', exact: true }).click();
            await expect(page.getByRole('status')).toContainText('Server settings saved');
            expect(JSON.parse(await readFile(join(data, 'settings.json'), 'utf8'))).toEqual({ endpoint: legacy + '/mcp', website: process.env['GATEGOLD_WEB_URL'] });
            expect(missingDiscoveryRequests).toBe(1);
            await expect(page.locator('#all-projects')).toHaveAttribute('href', process.env['GATEGOLD_WEB_URL'] + '/projects');
            await expect(page.locator('#all-projects')).toHaveAttribute('target', '_blank');
            await expect(page.locator('#all-projects')).toHaveAttribute('rel', 'noopener noreferrer');
            await expect(page.locator('#connection-badge')).toHaveText('Not connected');
            await expect(stat(join(data, 'credentials.json'))).rejects.toMatchObject({ code: 'ENOENT' });
        }, 'plugin');
    }
    finally {
        await native.stop();
        proxy.closeAllConnections();
        await new Promise<void>((resolve, reject) => proxy.close(error => error ? reject(error) : resolve()));
    }
});
test('native offline disconnect preserves its actual private credential for recovery or website revocation', async ({ page, browser }, info) => {
    test.setTimeout(90000);
    const copied = await copiedPackage(info), data = await privateProfile(info, 'offline-disconnect-profile'), server = new LocalAuthServer(info);
    let native: Awaited<ReturnType<typeof sidecar>> | undefined, connectionId: string | undefined;
    const beforeResponse = await page.request.get(apiOrigin + '/api/v1/me/mcp-tokens', { headers: { Authorization: 'Bearer ' + await token('owner') } });
    expect(beforeResponse.status()).toBe(200);
    const before = new Set(zTokenList.parse(await beforeResponse.json()).items.map(item => item.id));
    try {
        await server.prepare();
        await server.start({ audiencesForOwnOrigin: true });
        native = await sidecar(page, copied, data);
        await saveSettings(page, server.origin);
        await page.getByRole('button', { name: 'Sign in with browser', exact: true }).click();
        const link = page.getByRole('link', { name: /Continue sign-in/ });
        await expect(link).toBeVisible();
        const address = await link.getAttribute('href');
        if (!address)
            throw new Error('Expected the real native authorization address.');
        const context = await browser.newContext({ baseURL: process.env['GATEGOLD_WEB_URL'] });
        try {
            const login = await context.newPage();
            await signInOnLocalServer(login, server, { username: 'owner', password: server.ownerPassword }, address);
            await expect(login.getByRole('heading', { name: 'Connect Antigravity', exact: true })).toBeVisible();
            await login.getByRole('button', { name: 'Approve connection', exact: true }).click();
            await expect(login.getByRole('heading', { name: 'You are connected', exact: true })).toBeVisible();
            await expect(page.locator('#connection-badge')).toHaveText('Connected', { timeout: 15000 });
        }
        finally {
            await context.close();
        }
        const afterResponse = await page.request.get(apiOrigin + '/api/v1/me/mcp-tokens', { headers: { Authorization: 'Bearer ' + await token('owner') } });
        expect(afterResponse.status()).toBe(200);
        const created = zTokenList.parse(await afterResponse.json()).items.filter(item => !before.has(item.id) && item.kind === 'oauth' && item.revokedAt === null);
        expect(created).toHaveLength(1);
        connectionId = created[0]!.id;
        const fingerprint = async (path: string) => createHash('sha256').update(await readFile(path)).digest('hex');
        const credential = await fingerprint(join(data, 'credentials.json')), settings = await fingerprint(join(data, 'settings.json'));
        await server.stop();
        await useCase('UC-MCP-0104', async () => {
            const reply = page.waitForResponse(response => new URL(response.url()).pathname === '/api/disconnect');
            await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
            const response = await reply;
            expect(response.status()).toBe(400);
            expect(z.object({ error: z.string() }).parse(await response.json()).error).toBe('GateGoldJira could not complete the request. Check the server address and try again.');
            await expect(page.getByRole('status')).toContainText('Check the server address and try again.');
            await expect(page.getByRole('button', { name: 'Disconnect', exact: true })).toBeVisible();
            expect(await fingerprint(join(data, 'credentials.json'))).toBe(credential);
            expect(await fingerprint(join(data, 'settings.json'))).toBe(settings);
            expect((await stat(join(data, 'credentials.json'))).mode & 0o777).toBe(0o600);
            await expect(page.locator('#activity-link')).toHaveAttribute('href', process.env['GATEGOLD_WEB_URL'] + '/account/mcp-tokens');
            const retained = await page.request.get(apiOrigin + '/api/v1/me/mcp-tokens', { headers: { Authorization: 'Bearer ' + await token('owner') } });
            expect(retained.status()).toBe(200);
            expect(zTokenList.parse(await retained.json()).items.find(item => item.id === connectionId)?.revokedAt).toBeNull();
        }, 'plugin');
    }
    finally {
        try {
            if (connectionId) {
                const revoked = await page.request.post(apiOrigin + '/api/v1/me/mcp-tokens/' + connectionId + '/revoke', { headers: { Authorization: 'Bearer ' + await token('owner'), 'Idempotency-Key': randomUUID() }, data: {} });
                expect(revoked.status()).toBe(200);
            }
        }
        finally {
            await native?.stop();
            await server.stop();
        }
    }
});


test('actual public1.0.0 to current plugin upgrade retains separate private settings and OAuth credentials',async({page,browser},info)=>{
 test.setTimeout(90_000);
 const fixture=resolve('../integrations/antigravity/tests/fixtures/releases'),manifest=z.object({version:z.literal('1.0.0'),archive:z.literal('gategoldjira-antigravity-1.0.0.zip'),sha256:z.string().regex(/^[a-f0-9]{64}$/),files:z.array(z.object({path:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/),bytes:z.number().int().positive()})).length(14)}).parse(JSON.parse(await readFile(join(fixture,'gategoldjira-antigravity-1.0.0.manifest.json'),'utf8')));
 const archive=join(fixture,manifest.archive);expect(createHash('sha256').update(await readFile(archive)).digest('hex')).toBe(manifest.sha256);
 const copied=info.outputPath('actual-old-public-plugin');await mkdir(copied,{recursive:true});
 await promisify(execFile)('python3',['-c',`import sys,json,zipfile,stat
from pathlib import Path,PurePosixPath
archive,target,manifest=map(Path,sys.argv[1:]);expected=json.loads(manifest.read_text());allowed={'gategoldjira/'+item['path'] for item in expected['files']}
with zipfile.ZipFile(archive) as source:
 if set(source.namelist())!=allowed:raise RuntimeError('Unexpected public release archive file')
 for item in source.infolist():
  parts=PurePosixPath(item.filename).parts
  if not parts or parts[0]!='gategoldjira' or '..' in parts or stat.S_ISLNK(item.external_attr>>16):raise RuntimeError('Unsafe public release path')
  destination=target.joinpath(*parts[1:]);destination.parent.mkdir(parents=True,exist_ok=True);destination.write_bytes(source.read(item.filename))`,archive,copied,join(fixture,'gategoldjira-antigravity-1.0.0.manifest.json')]);
 for(const file of manifest.files){const bytes=await readFile(join(copied,file.path));expect(bytes.length).toBe(file.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.sha256);}
 expect(await readFile(join(copied,'bridge.mjs'),'utf8')).toContain('version: "1.0.0"');
 const profile=await privateProfile(info,'actual-upgraded-private-profile');let native:Awaited<ReturnType<typeof sidecar>>|undefined,bridge:Bridge|undefined,connectionId:string|undefined;
 const beforeResponse=await page.request.get(apiOrigin+'/api/v1/me/mcp-tokens',{headers:{Authorization:'Bearer '+await token('member')}});expect(beforeResponse.status()).toBe(200);const before=new Set(zTokenList.parse(await beforeResponse.json()).items.map(item=>item.id));
 try{
  native=await sidecar(page,copied,profile);await page.getByLabel('MCP server URL',{exact:true}).fill(apiOrigin+'/mcp');await page.getByLabel('GateGoldJira website',{exact:true}).fill(process.env['GATEGOLD_WEB_URL']!);await page.getByRole('button',{name:'Save server settings',exact:true}).click();await expect(page.getByRole('status')).toContainText('Server settings saved');await approveActual(browser,page);
  const afterResponse=await page.request.get(apiOrigin+'/api/v1/me/mcp-tokens',{headers:{Authorization:'Bearer '+await token('member')}});expect(afterResponse.status()).toBe(200);const created=zTokenList.parse(await afterResponse.json()).items.filter(item=>!before.has(item.id)&&item.kind==='oauth'&&item.revokedAt===null);expect(created).toHaveLength(1);connectionId=created[0]!.id;
  const fingerprint=async(path:string)=>createHash('sha256').update(await readFile(path)).digest('hex'),credential=await fingerprint(join(profile,'credentials.json')),settings=await fingerprint(join(profile,'settings.json')),oldBridge=await fingerprint(join(copied,'bridge.mjs'));
  await native.stop();native=undefined;
  await useCase('UC-MCP-0107',async()=>{
   // Replace only this test-owned public directory with the genuine captured
   // current build. The private profile is a distinct sibling directory.
   await useCase('UC-MCP-0107',async()=>{
    expect(copied).toBe(info.outputPath('actual-old-public-plugin'));expect(copied).not.toBe(profile);await rm(copied,{recursive:true,force:true});await cp(plugin!,copied,{recursive:true});expect(await fingerprint(join(copied,'bridge.mjs'))).not.toBe(oldBridge);
    expect(await fingerprint(join(profile,'credentials.json'))).toBe(credential);expect(await fingerprint(join(profile,'settings.json'))).toBe(settings);for(const filename of['credentials.json','settings.json','pending.json'])await expect(stat(join(copied,filename))).rejects.toMatchObject({code:'ENOENT'});
    expect((await stat(join(profile,'credentials.json'))).mode&0o777).toBe(0o600);
   },'operator');
   bridge=new Bridge(copied,profile);const initialized=z.object({serverInfo:z.object({name:z.literal('GateGoldJira'),version:z.literal('1.1.0')})}).parse(await bridge.request('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'Actual public upgrade acceptance',version:'1'}}));expect(initialized.serverInfo.version).toBe('1.1.0');bridge.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n');
   const me=z.object({isError:z.literal(false).optional(),structuredContent:z.object({ok:z.literal(true),data:z.object({userId:z.uuid()})})}).parse(await bridge.call('get_me'));expect(me.structuredContent.data.userId).toBe('10000000-0000-4000-8000-000000000002');native=await sidecar(page,copied,profile);await expect(page.locator('#connection-badge')).toHaveText('Connected');expect(await fingerprint(join(profile,'credentials.json'))).toBe(credential);expect(await fingerprint(join(profile,'settings.json'))).toBe(settings);expect((await stat(join(profile,'credentials.json'))).mode&0o777).toBe(0o600);
  },'plugin');
 }finally{try{if(connectionId){const revoked=await page.request.post(apiOrigin+'/api/v1/me/mcp-tokens/'+connectionId+'/revoke',{headers:{Authorization:'Bearer '+await token('member'),'Idempotency-Key':randomUUID()},data:{}});expect(revoked.status()).toBe(200);}}finally{await bridge?.close();await native?.stop();}}
});
