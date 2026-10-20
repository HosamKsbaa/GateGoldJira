import { constants } from 'node:fs';
import { chmod, lstat, mkdir, open, rename, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import lockfile from 'proper-lockfile';
import { z } from 'zod';
import { credentialSchema, pendingSchema, settingsSchema, UserError, type Credential, type Settings } from './models.ts';

export class PrivateStore {
  constructor(readonly directory: string, readonly defaults: Settings | null) {}
  static userDirectory(): string {
    return process.env['GATEGOLDJIRA_DATA_DIR'] || join(homedir(), '.gemini', 'gategoldjira');
  }
  async prepare(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const info = await lstat(this.directory);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new UserError('Choose a private user data directory.');
    await chmod(this.directory, 0o700);
  }
  async read<T>(name: string, schema: z.ZodType<T>): Promise<T | undefined> {
    await this.prepare();
    try {
      const handle = await open(join(this.directory, name), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if ((await handle.stat()).size > 65536) throw new Error('Oversized private state');
        return schema.parse(JSON.parse(await handle.readFile('utf8')));
      } finally { await handle.close(); }
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
      throw new UserError('The private connection data is unreadable. Disconnect or restore the user data directory.');
    }
  }
  async write(name: string, value: unknown): Promise<void> {
    await this.prepare();
    const temporary = join(this.directory, '.' + randomUUID());
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(value));
      await handle.sync();
    } finally { await handle.close(); }
    try { await rename(temporary, join(this.directory, name)); }
    finally { await rm(temporary, { force: true }); }
  }
  async remove(name: string): Promise<void> { await rm(join(this.directory, name), { force: true }); }
  async settings(): Promise<Settings | null> { return await this.read('settings.json', settingsSchema) ?? this.defaults; }
  async requireSettings(): Promise<Settings> {
    const settings = await this.settings();
    if (!settings) throw new UserError('Set the server URL in the GateGoldJira side panel first.');
    return settings;
  }
  async credential(): Promise<Credential | undefined> { return this.read('credentials.json', credentialSchema); }
  async pending() { return this.read('pending.json', pendingSchema); }
  async locked<T>(action: () => Promise<T>): Promise<T> {
    await this.prepare();
    const release = await lockfile.lock(this.directory, {
      realpath: false, lockfilePath: join(this.directory, 'connection.lock'),
      stale: 120000, update: 10000,
      retries: { retries: 240, minTimeout: 50, maxTimeout: 50 },
    }).catch(() => { throw new UserError('Another connection change is running. Try again shortly.'); });
    try { return await action(); }
    finally { await release(); }
  }
}
