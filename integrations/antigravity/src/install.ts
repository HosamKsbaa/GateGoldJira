import { cp, mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { settingsSchema } from './models.ts';

const objectSchema = z.record(z.string(), z.unknown());
export async function install(source: string, home: string, overrides: { endpoint?: string; website?: string } = {}): Promise<string> {
  const defaults = settingsSchema.parse({ ...JSON.parse(await readFile(join(source, 'connection.json'), 'utf8')), ...overrides });
  const root = join(home, '.gemini');
  const destination = join(root, 'config', 'plugins', 'gategoldjira');
  const data = join(root, 'gategoldjira');
  const backup = join(root, 'gategoldjira-backups', new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID());
  const modifications: { path: string; value: Record<string, unknown>; original?: string }[] = [];
  let inherited: Record<string, unknown> = {};
  try {
    const previous = z.object({ mcpServers: z.object({ gategoldjira: z.object({ disabledTools: z.array(z.string()).optional() }) }) })
      .parse(JSON.parse(await readFile(join(destination, 'mcp_config.json'), 'utf8')));
    if (previous.mcpServers.gategoldjira.disabledTools) inherited['disabledTools'] = previous.mcpServers.gategoldjira.disabledTools;
  } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
  const visited = new Set<string>();
  for (const filename of ['config/mcp_config.json', 'antigravity-ide/mcp_config.json', 'antigravity/mcp_config.json']) {
    const path = join(root, filename);
    let original: string;
    let actual: string;
    try {
      actual = await realpath(path);
      if (visited.has(actual)) continue;
      visited.add(actual);
      original = await readFile(path, 'utf8');
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
      throw error;
    }
    const value = objectSchema.parse(JSON.parse(original));
    const servers = objectSchema.parse(value['mcpServers'] ?? {});
    if (servers['gategoldjira'] === undefined) continue;
    const existing = objectSchema.parse(servers['gategoldjira']);
    const args = z.array(z.string()).catch([]).parse(existing['args']);
    if (!(typeof existing['serverUrl'] === 'string' && existing['serverUrl'].endsWith('/mcp'))
      && !args.some(arg => arg.includes('mcp-remote') || arg.endsWith('bridge.mjs'))) {
      throw new Error('The existing gategoldjira MCP entry is unfamiliar. Rename it before installing this plugin.');
    }
    if (existing['disabledTools'] !== undefined) inherited['disabledTools'] = [...new Set([...z.array(z.string()).parse(inherited['disabledTools'] ?? []), ...z.array(z.string()).parse(existing['disabledTools'])])];
    delete servers['gategoldjira'];
    modifications.push({ path: actual, value: { ...value, mcpServers: servers }, original });
  }
  const configPath = join(root, 'config', 'config.json');
  let originalConfig: string | undefined;
  try { originalConfig = await readFile(configPath, 'utf8'); }
  catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
  const config = objectSchema.parse(originalConfig ? JSON.parse(originalConfig) : {});
  const sidecars = objectSchema.parse(config['sidecars'] ?? {});
  sidecars['gategoldjira/studio'] = { ...objectSchema.parse(sidecars['gategoldjira/studio'] ?? {}), enabled: true };
  modifications.push({ path: configPath, value: { ...config, sidecars }, original: originalConfig });
  try {
    const existing = objectSchema.parse(JSON.parse(await readFile(join(destination, 'plugin.json'), 'utf8')));
    if (existing['name'] !== 'gategoldjira') throw new Error('The target plugin directory belongs to another plugin.');
  } catch (error) { if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error; }
  await mkdir(backup, { recursive: true, mode: 0o700 });
  await mkdir(dirname(destination), { recursive: true });
  const staging = destination + '.install-' + randomUUID();
  await mkdir(staging, { mode: 0o700 });
  let replaced = false;
  let previousMoved = false;
  const written: typeof modifications = [];
  const files = ['plugin.json', 'connection.json', 'assets', 'sidecars', 'sidecar.mjs', 'bridge.mjs', 'mcp-tools.json', 'README.md', 'THIRD-PARTY-NOTICES.txt'];
  try {
    for (const name of files) await cp(join(source, name), join(staging, name), { recursive: true });
    await writeFile(join(staging, 'connection.json'), JSON.stringify(defaults, null, 2) + '\n');
    await writeFile(join(staging, 'mcp_config.json'), JSON.stringify({ mcpServers: { gategoldjira: {
      command: process.execPath, args: [join(destination, 'bridge.mjs')], env: { GATEGOLDJIRA_DATA_DIR: data }, ...inherited,
    } } }, null, 2) + '\n');
    const sidecarPath = join(staging, 'sidecars', 'studio', 'sidecar.json');
    const sidecar = objectSchema.parse(JSON.parse(await readFile(sidecarPath, 'utf8')));
    await writeFile(sidecarPath, JSON.stringify({ ...sidecar, command: process.execPath, env: { GATEGOLDJIRA_DATA_DIR: data } }, null, 2) + '\n');
    for (let index = 0; index < modifications.length; index++) {
      const change = modifications[index]!;
      if (change.original !== undefined) await writeFile(join(backup, 'config-' + index + '.json'), change.original, { mode: 0o600 });
    }
    await writeFile(join(backup, 'restore.json'), JSON.stringify(modifications.map((change, index) => ({ path: change.path, backup: change.original === undefined ? null : 'config-' + index + '.json' })), null, 2), { mode: 0o600 });
    if (await stat(destination).catch(() => undefined)) { await rename(destination, join(backup, 'plugin')); previousMoved = true; }
    await rename(staging, destination);
    replaced = true;
    for (const change of modifications) {
      await mkdir(dirname(change.path), { recursive: true });
      const temporary = change.path + '.install-' + randomUUID();
      await writeFile(temporary, JSON.stringify(change.value, null, 2) + '\n', { mode: 0o600 });
      await rename(temporary, change.path);
      written.push(change);
    }
    return destination;
  } catch (error) {
    for (const change of written.reverse()) {
      if (change.original === undefined) await rm(change.path, { force: true });
      else {
        const temporary = change.path + '.restore-' + randomUUID();
        await writeFile(temporary, change.original, { mode: 0o600 });
        await rename(temporary, change.path);
      }
    }
    if (replaced) await rm(destination, { recursive: true, force: true });
    if (previousMoved) await rename(join(backup, 'plugin'), destination);
    throw error;
  } finally { await rm(staging, { recursive: true, force: true }); }
}
async function main(): Promise<void> {
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major === undefined || major < 22 || major === 22 && (minor ?? 0) < 18) throw new Error('Node.js 22.18 or newer is required.');
  const flags = new Map<string, string>();
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]; const value = args[index + 1];
    if (!key || !['--home', '--endpoint', '--website'].includes(key) || !value || flags.has(key)) throw new Error('Usage: node install.mjs [--endpoint https://api.example.com/mcp --website https://jira.example.com]');
    flags.set(key, value);
  }
  const source = dirname(fileURLToPath(import.meta.url));
  const path = await install(source, resolve(flags.get('--home') ?? homedir()), {
    ...(flags.has('--endpoint') ? { endpoint: flags.get('--endpoint') } : {}),
    ...(flags.has('--website') ? { website: flags.get('--website') } : {}),
  });
  console.log('Installed GateGoldJira: ' + path);
  console.log('Reload Antigravity, open GateGoldJira in the side panel, and select Sign in with browser.');
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch(() => { console.error('Installation could not complete. Check the arguments, existing configuration and directory permissions.'); process.exitCode = 1; });
}
