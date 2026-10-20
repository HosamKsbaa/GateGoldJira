import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseJSONC } from 'jsonc-parser';
import { z } from 'zod';
import { registerPanel } from '../src/panel-preference.ts';
import { resolveSettings } from '../src/server-settings.ts';
import { BrowserOAuth } from '../src/oauth.ts';
import { PrivateStore } from '../src/store.ts';

test('first launch registers only its missing panel, preserves JSONC and is idempotent across clients', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gategold-copy-'));
  const config = join(root, 'native config');
  const store = new PrivateStore(join(root, 'private'), null);
  const path = join(config, 'config.json');
  const source = '{\n // Keep this comment\n "theme": "dark", "secret": "private-fixture",\n "sidecars": { "other/panel": { "enabled": false }, },\n}\n';
  try {
    await mkdir(config);
    await writeFile(path, source);
    await Promise.all([registerPanel(store, config), registerPanel(store, config)]);
    const updated = await readFile(path, 'utf8');
    assert.ok(updated.includes('// Keep this comment'));
    const expected: unknown = parseJSONC(source);
    const record = z.object({ theme: z.string(), secret: z.string(), sidecars: z.record(z.string(), z.unknown()) });
    const previous = record.parse(expected);
    assert.deepEqual(parseJSONC(updated), { ...previous, sidecars: { ...previous.sidecars, 'gategoldjira/studio': { enabled: true } } });
    assert.equal((await readdir(store.directory)).length, 1);
    const backup = (await readdir(store.directory))[0];
    assert.ok(backup);
    assert.deepEqual(JSON.parse(await readFile(join(store.directory, backup), 'utf8')), { path, contents: source });
    assert.equal((await stat(join(store.directory, backup))).mode & 0o777, 0o600);
    await registerPanel(store, config);
    assert.equal(await readFile(path, 'utf8'), updated);
    assert.equal((await readdir(store.directory)).length, 1);
    assert.equal((await readdir(config)).length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('panel bootstrap creates fresh preferences but preserves explicit disablement and rejects corrupt files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gategold-copy-'));
  const config = join(root, 'config');
  const store = new PrivateStore(join(root, 'private'), null);
  const path = join(config, 'config.json');
  try {
    await registerPanel(store, config);
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { sidecars: { 'gategoldjira/studio': { enabled: true } } });
    for (const source of ['{"sidecars":{"gategoldjira/studio":{"enabled":false}}}', '{"sidecars":{"gategoldjira/studio":{"enabled":true,"custom":42}}}']) {
      await writeFile(path, source); await registerPanel(store, config);
      assert.equal(await readFile(path, 'utf8'), source);
    }
    for (const source of ['{broken', '{"sidecars":null}', '[]']) {
      await writeFile(path, source); await assert.rejects(() => registerPanel(store, config));
      assert.equal(await readFile(path, 'utf8'), source);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a fresh profile stays unconfigured and cannot sign in or send credentials before a server is saved', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gategold-copy-'));
  try {
    const store = new PrivateStore(root, null);
    let calls = 0;
    const oauth = new BrowserOAuth(store, async () => { calls++; throw new Error('Unexpected network'); });
    assert.equal(await store.settings(), null);
    await assert.rejects(() => oauth.begin(), /Set the server URL/);
    await assert.rejects(() => oauth.authorizedFetch('https://api.team.example/mcp'), /Set the server URL/);
    assert.equal(calls, 0);
    const settings = { endpoint: 'https://api.team.example/mcp', website: 'https://team.example' };
    await oauth.configure(settings);
    assert.deepEqual(await new PrivateStore(root, null).settings(), settings);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('one server URL discovers the website; overrides support older servers and invalid destinations fail closed', async () => {
  const endpoint = 'https://api.team.example/mcp';
  const website = 'https://team.example';
  const requests: string[] = [];
  const request: typeof fetch = async (url, init) => {
    requests.push(String(url));
    assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).has('Authorization'), false);
    return Response.json({ resource: endpoint, gategoldjira_website_url: website });
  };
  for (const server of ['https://api.team.example', endpoint, endpoint + '/']) {
    assert.deepEqual(await resolveSettings({ endpoint: server }, request), { endpoint, website });
  }
  assert.equal(requests.length, 3);
  assert.deepEqual(await resolveSettings({ endpoint, website }, () => { throw new Error('No discovery for override'); }), { endpoint, website });
  for (const bad of ['http://team.example', 'https://u:secret@team.example', 'https://team.example?token=secret', 'https://team.example/other']) {
    await assert.rejects(() => resolveSettings({ endpoint: bad }, request), /Use your HTTPS API/);
  }
  for (const metadata of [{ resource: 'https://other.example/mcp', gategoldjira_website_url: website }, { resource: endpoint, gategoldjira_website_url: 'javascript:alert(1)' }, { resource: endpoint }]) {
    await assert.rejects(() => resolveSettings({ endpoint }, async () => Response.json(metadata)), /Advanced settings/);
  }
  await assert.rejects(() => resolveSettings({ endpoint }, async () => new Response('unavailable', { status: 503 })), /Advanced settings/);
  assert.equal(requests.length, 3);
});
