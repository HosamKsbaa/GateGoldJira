import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { install } from '../src/install.ts';

test('installer preserves other servers and plugins, moves only GateGoldJira, and enables its panel', async () => {
  const root = await mkdtemp(join(tmpdir(), 'gategold-install-'));
  const source = join(root, 'release'); const home = join(root, 'home');
  try {
    for (const name of ['assets', 'sidecars/studio']) await mkdir(join(source, name), { recursive: true });
    for (const name of ['sidecar.mjs', 'bridge.mjs', 'mcp-tools.json', 'README.md', 'THIRD-PARTY-NOTICES.txt']) await writeFile(join(source, name), '{}');
    await writeFile(join(source, 'plugin.json'), JSON.stringify({ name: 'gategoldjira' }));
    await writeFile(join(source, 'connection.json'), JSON.stringify({ endpoint: 'http://localhost:21080/mcp', website: 'http://localhost:4201' }));
    await writeFile(join(source, 'sidecars/studio/sidecar.json'), JSON.stringify({ command: 'node', args: ['main.mjs'], has_web_ui: true }));
    const directory = join(home, '.gemini', 'config'); await mkdir(directory, { recursive: true });
    const other = { command: 'other-server', env: { API_KEY: 'private-test-fixture' } };
    await writeFile(join(directory, 'mcp_config.json'), JSON.stringify({ mcpServers: { other, gategoldjira: { command: 'npx', args: ['-y', 'mcp-remote@0.15.1'], disabledTools: ['approve_user'] } } }));
    await writeFile(join(directory, 'config.json'), JSON.stringify({ theme: 'dark', sidecars: { 'other/panel': { enabled: true } } }));
    const target = await install(source, home);
    const record = z.record(z.string(), z.unknown());
    const global = record.parse(JSON.parse(await readFile(join(directory, 'mcp_config.json'), 'utf8')));
    assert.deepEqual(record.parse(global['mcpServers']), { other });
    const config = record.parse(JSON.parse(await readFile(join(directory, 'config.json'), 'utf8')));
    assert.equal(config['theme'], 'dark');
    assert.deepEqual(config['sidecars'], { 'other/panel': { enabled: true }, 'gategoldjira/studio': { enabled: true } });
    const mcp = z.object({ mcpServers: z.object({ gategoldjira: z.object({ command: z.string(), args: z.array(z.string()), env: z.object({ GATEGOLDJIRA_DATA_DIR: z.string() }), disabledTools: z.array(z.string()) }) }) }).parse(JSON.parse(await readFile(join(target, 'mcp_config.json'), 'utf8')));
    assert.deepEqual(mcp.mcpServers.gategoldjira.disabledTools, ['approve_user']);
    assert.equal(mcp.mcpServers.gategoldjira.command, process.execPath);
    assert.equal(mcp.mcpServers.gategoldjira.args[0], join(target, 'bridge.mjs'));
    assert.ok(!(await readFile(join(target, 'mcp_config.json'), 'utf8')).includes('private-test-fixture'));
    assert.equal((await readdir(join(home, '.gemini', 'gategoldjira-backups'))).length, 1);
    await install(source, home);
    assert.equal((await readdir(join(home, '.gemini', 'gategoldjira-backups'))).length, 2);
    const upgraded = z.object({ mcpServers: z.object({ gategoldjira: z.object({ disabledTools: z.array(z.string()) }) }) }).parse(JSON.parse(await readFile(join(target, 'mcp_config.json'), 'utf8')));
    assert.deepEqual(upgraded.mcpServers.gategoldjira.disabledTools, ['approve_user']);
  } finally { await rm(root, { recursive: true, force: true }); }
});
