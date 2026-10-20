import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { BrowserOAuth } from '../src/oauth.ts';
import { PrivateStore } from '../src/store.ts';
import { settingsSchema, SignInRequired } from '../src/models.ts';
import { restoreLegacySettings } from '../src/server-settings.ts';

async function fixture() {
  let origin = '';
  let challenge = '';
  let refreshes = 0;
  let revoked = false;
  let foreignIssuer = false;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', origin);
    response.setHeader('Content-Type', 'application/json');
    if (url.pathname === '/.well-known/oauth-protected-resource/mcp') return response.end(JSON.stringify({ resource: origin + '/mcp', authorization_servers: [foreignIssuer ? 'https://untrusted.test/oauth' : origin + '/oauth'] }));
    if (url.pathname === '/.well-known/oauth-authorization-server/oauth') return response.end(JSON.stringify({ issuer: origin + '/oauth', authorization_endpoint: origin + '/oauth/authorize', token_endpoint: origin + '/oauth/token', revocation_endpoint: origin + '/oauth/revoke', code_challenge_methods_supported: ['S256'], scopes_supported: ['gategoldjira:access'] }));
    let body = ''; for await (const chunk of request) body += String(chunk);
    const form = new URLSearchParams(body);
    if (url.pathname === '/oauth/revoke') { revoked = true; return response.end('{}'); }
    if (url.pathname === '/oauth/token') {
      assert.equal(form.get('client_id'), 'gategoldjira-antigravity');
      assert.equal(form.get('resource'), origin + '/mcp');
      if (form.get('grant_type') === 'authorization_code') {
        assert.equal(createHash('sha256').update(form.get('code_verifier') ?? '').digest('base64url'), challenge);
      } else {
        refreshes++;
        await new Promise(resolve => setTimeout(resolve, 50));
        if (revoked) { response.statusCode = 400; return response.end('{"error":"invalid_grant"}'); }
      }
      return response.end(JSON.stringify({ access_token: 'gg_oauth_' + String(refreshes + 1).repeat(43), refresh_token: 'gg_refresh_' + String(refreshes + 1).repeat(43), token_type: 'Bearer', scope: 'gategoldjira:access', expires_in: 900 }));
    }
    response.statusCode = 404; response.end('{}');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No listener');
  origin = 'http://127.0.0.1:' + address.port;
  const directory = await mkdtemp(join(tmpdir(), 'gategold-plugin-'));
  const defaults = settingsSchema.parse({ endpoint: origin + '/mcp', website: origin });
  const store = new PrivateStore(directory, defaults);
  const oauth = new BrowserOAuth(store);
  return { origin, directory, store, oauth, defaults,
    get refreshes() { return refreshes; }, get revoked() { return revoked; },
    untrusted() { foreignIssuer = true; },
    async begin() { const url = new URL(await oauth.begin()); challenge = url.searchParams.get('code_challenge') ?? ''; return url; },
    async approve(url: URL, overrides: Record<string, string> = {}) {
      const callback = new URL(url.searchParams.get('redirect_uri')!);
      callback.search = new URLSearchParams({ state: url.searchParams.get('state')!, iss: origin + '/oauth', code: 'A'.repeat(43), ...overrides }).toString();
      return fetch(callback);
    },
    async close() { await oauth.cancel(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await rm(directory, { recursive: true, force: true }); },
  };
}

test('PKCE callback rejects wrong state and issuer, then saves private credentials once', async () => {
  const f = await fixture();
  try {
    const url = await f.begin();
    assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(url.searchParams.get('resource'), f.defaults.endpoint);
    assert.equal((await f.approve(url, { state: 'wrong' })).status, 400);
    assert.equal((await f.approve(url, { state: 'é'.repeat(43) })).status, 400);
    assert.equal((await f.approve(url, { iss: 'https://other.test/oauth' })).status, 400);
    assert.equal(await f.store.credential(), undefined);
    assert.equal((await f.approve(url)).status, 200);
    assert.equal((await f.store.credential())?.endpoint, f.defaults.endpoint);
    assert.equal((await stat(f.directory)).mode & 0o777, 0o700);
    assert.equal((await stat(join(f.directory, 'credentials.json'))).mode & 0o777, 0o600);
    assert.ok(!(await readFile(join(f.directory, 'credentials.json'), 'utf8')).includes('code_verifier'));
    await assert.rejects(() => f.oauth.begin(), /Disconnect/);
  } finally { await f.close(); }
});
test('independent clients serialize refresh and re-read the rotated credential', async () => {
  const f = await fixture();
  try {
    await f.approve(await f.begin());
    const credential = (await f.store.credential())!;
    await f.store.write('credentials.json', { ...credential, expiresAt: Date.now() - 1 });
    const second = new BrowserOAuth(new PrivateStore(f.directory, f.defaults));
    const [firstToken, secondToken] = await Promise.all([f.oauth.access(), second.access()]);
    assert.equal(firstToken, secondToken); assert.equal(f.refreshes, 1);
    // A stale process's HTTP 401 must use the new credential, not rotate again.
    assert.equal(await second.access(credential.accessToken), firstToken);
    assert.equal(f.refreshes, 1);
    await f.oauth.disconnect(); assert.equal(f.revoked, true);
    assert.equal(await f.store.credential(), undefined);
    await assert.rejects(() => second.access(), SignInRequired);
  } finally { await f.close(); }
});
test('denial, cancellation and foreign discovery never create an account credential', async () => {
  const f = await fixture();
  try {
    const url = await f.begin();
    await f.approve(url, { error: 'access_denied' });
    assert.equal(await f.store.credential(), undefined);
    await f.oauth.cancel();
    const next = await f.begin();
    await f.oauth.cancel();
    await assert.rejects(() => f.approve(next));
    f.untrusted();
    await assert.rejects(() => f.oauth.begin(), /Enable GateGoldJira browser OAuth/);
    assert.equal(await f.store.credential(), undefined);
  } finally { await f.close(); }
});
test('shared URLs require HTTPS and reject credentials, query strings and wrong paths', () => {
  for (const endpoint of ['http://team.example/mcp', 'https://u:secret@team.example/mcp', 'https://team.example/mcp?token=secret', 'https://team.example/other', 'https://team.example/mcp#secret']) {
    assert.equal(settingsSchema.safeParse({ endpoint, website: 'https://team.example' }).success, false);
  }
  assert.equal(settingsSchema.safeParse({ endpoint: 'https://api.team.example/mcp', website: 'https://team.example' }).success, true);
});
test('an in-flight request cannot retry using a newly signed-in account', async () => {
  const f = await fixture();
  try {
    await f.approve(await f.begin());
    const original = (await f.store.credential())!;
    const replacement = { ...original, sessionId: randomUUID(), accessToken: 'gg_oauth_' + 'B'.repeat(43) };
    let requests = 0;
    const oauth = new BrowserOAuth(f.store, async () => {
      requests++;
      await f.store.write('credentials.json', replacement);
      return new Response('', { status: 401 });
    });
    await assert.rejects(() => oauth.authorizedFetch(f.defaults.endpoint), SignInRequired);
    assert.equal(requests, 1);
    assert.equal((await f.store.credential())?.sessionId, replacement.sessionId);
  } finally { await f.close(); }
});

test('copy upgrade restores an existing default-server connection without replacing its credentials', async () => {
  const f = await fixture();
  try {
    await f.approve(await f.begin());
    const credential = await f.store.credential();
    const store = new PrivateStore(f.directory, null);
    assert.equal(await store.settings(), null);
    await restoreLegacySettings(store, async () => Response.json({ resource: f.defaults.endpoint, gategoldjira_website_url: f.defaults.website }));
    assert.deepEqual(await store.settings(), f.defaults);
    assert.deepEqual(await store.credential(), credential);
    await restoreLegacySettings(store, () => { throw new Error('Do not rediscover saved settings'); });
    assert.deepEqual(await store.credential(), credential);
  } finally { await f.close(); }
});
