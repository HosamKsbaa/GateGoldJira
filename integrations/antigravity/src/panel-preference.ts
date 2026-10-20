import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { applyEdits, findNodeAtLocation, modify, parseTree, type ParseError } from 'jsonc-parser';
import lockfile from 'proper-lockfile';
import { PrivateStore } from './store.ts';

async function readPreference(path: string): Promise<string | undefined> {
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const info = await file.stat();
      if (!info.isFile() || info.size > 1048576) throw new Error('Invalid preferences');
      return await file.readFile('utf8');
    } finally { await file.close(); }
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

// Native sidecars default to disabled. Register our own missing preference on
// first MCP launch, without overriding an explicit user decision or other keys.
export async function registerPanel(store: PrivateStore, directory = process.env['GATEGOLDJIRA_CONFIG_DIR'] || join(homedir(), '.gemini', 'config')): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Invalid configuration directory');
  const path = join(directory, 'config.json');
  const release = await lockfile.lock(directory, {
    realpath: false, lockfilePath: join(directory, '.gategoldjira-panel.lock'),
    stale: 10000, retries: { retries: 40, minTimeout: 50, maxTimeout: 50 },
  });
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const previous = await readPreference(path);
      const source = previous ?? '{}';
      const errors: ParseError[] = [];
      const tree = parseTree(source, errors, { allowTrailingComma: true });
      if (errors.length || tree?.type !== 'object') throw new Error('Invalid preferences');
      const sidecars = findNodeAtLocation(tree, ['sidecars']);
      if (sidecars && sidecars.type !== 'object') throw new Error('Invalid sidecar preferences');
      if (findNodeAtLocation(tree, ['sidecars', 'gategoldjira/studio'])) return;
      const updated = applyEdits(source, modify(source, ['sidecars', 'gategoldjira/studio'], { enabled: true }, {
        formattingOptions: { insertSpaces: true, tabSize: 2, eol: source.includes('\r\n') ? '\r\n' : '\n' },
      }));
      const temporary = join(directory, '.gategoldjira-' + randomUUID());
      const file = await open(temporary, 'wx', 0o600);
      try {
        await file.writeFile(updated);
        await file.sync();
      } finally { await file.close(); }
      try {
        if (await readPreference(path) !== previous) continue;
        if (previous !== undefined) await store.write('panel-preference-backup-' + randomUUID() + '.json', { path, contents: previous });
        // Recheck after backup I/O as the host does not share this lock.
        if (await readPreference(path) !== previous) continue;
        await rename(temporary, path);
        return;
      } finally { await rm(temporary, { force: true }); }
    }
    throw new Error('Preferences changed concurrently');
  } finally { await release(); }
}
