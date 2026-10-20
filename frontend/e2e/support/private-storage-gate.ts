import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { z } from 'zod';

const execute = promisify(execFile);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const memberId = '10000000-0000-4000-8000-000000000002';
const rowSchema = z.object({
  publishedKey: z.string().regex(/^[a-z0-9][a-z0-9/_-]{0,249}$/),
  checksum: z.string().regex(/^[0-9a-f]{64}$/),
  generation: z.number().int().positive(),
  byteSize: z.number().int().positive().max(4096),
});
const recordSchema = z.object({
  exists: z.literal(true),
  info: z.object({
    generation: z.number().int().positive(),
    size: z.number().int().positive(),
    contentType: z.literal('text/plain'),
    sha256: z.string(),
  }),
});

/** Pause only a fresh owned regular-file open; never mutate the object or its metadata. */
export async function gatePrivateTextRead(owned: {
  projectId: string;
  issueId: string;
  assetId: string;
  bytes: Buffer;
}) {
  const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
  const pictureDirectory = process.env['LOCAL_PICTURE_DIRECTORY'];
  if (process.platform !== 'linux' || process.env['K_SERVICE'] ||
    process.env['APP_ENV'] !== 'development' || process.env['AUTH_MODE'] !== 'development' ||
    process.env['STORAGE_MODE'] !== 'local' || !database || !/^gg_browser_[0-9a-f]{32}$/.test(database) ||
    !pictureDirectory || !isAbsolute(pictureDirectory) ||
    ![owned.projectId, owned.issueId, owned.assetId].every(value => uuid.test(value)) ||
    owned.bytes.length < 1 || owned.bytes.length > 4096) {
    throw new Error('Private I/O fixture requires an owned tiny text asset in the isolated local browser run.');
  }
  const storageRoot = await realpath(pictureDirectory);
  const runRoot = dirname(storageRoot);
  const runId = database.slice('gg_browser_'.length);
  const sourceRoot = await realpath(resolve('..'));
  if (storageRoot !== pictureDirectory || basename(storageRoot) !== 'pictures' ||
    basename(runRoot) !== runId || basename(dirname(runRoot)) !== 'browser-tests' ||
    basename(dirname(dirname(runRoot))) !== '.local' ||
    sourceRoot !== join(runRoot, 'source') ||
    process.env['GATEGOLD_E2E_TOKENS'] !== join(runRoot, 'identity', 'tokens') ||
    process.env['GATEGOLD_USE_CASE_REPORT'] !== join(runRoot, 'use-case-results.json')) {
    throw new Error('Private object directory does not belong to the active isolated source/database run.');
  }
  for (const privatePath of [runRoot, storageRoot]) {
    const stat = await lstat(privatePath);
    if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.() || (stat.mode & 0o077) !== 0)
      throw new Error('Private I/O fixture directory permissions or ownership are unexpected.');
  }
  const row = await execute('docker', ['compose', '-f', resolve('../compose.dev.yaml'), 'exec', '-T',
    'postgres', 'psql', '--username=gategoldjira', '--dbname=' + database,
    '-v', 'ON_ERROR_STOP=1', '-At', '-c',
    `SELECT json_build_object('publishedKey',published_key,'checksum',checksum,'generation',published_generation,'byteSize',byte_size) FROM attachments WHERE id='${owned.assetId}' AND project_id='${owned.projectId}' AND issue_id='${owned.issueId}' AND uploaded_by='${memberId}' AND kind='file' AND mime_type='text/plain' AND state='published' AND in_panel AND published_key IS NOT NULL AND uploaded_at>now()-interval '5 minutes';`]);
  const metadata = rowSchema.parse(JSON.parse(row.stdout.trim()) as unknown);
  const checksum = createHash('sha256').update(owned.bytes).digest('hex');
  if (metadata.checksum !== checksum || metadata.byteSize !== owned.bytes.length)
    throw new Error('Owned object bytes do not match its committed database checksum.');
  const published = join(storageRoot, 'published');
  if (await realpath(published) !== published) throw new Error('Published object directory must not be a symlink.');
  const publishedStat = await lstat(published);
  if (!publishedStat.isDirectory() || publishedStat.uid !== process.getuid?.() || (publishedStat.mode & 0o077) !== 0)
    throw new Error('Published object directory is not private to this run.');
  const hash = createHash('sha256').update(metadata.publishedKey).digest('hex');
  const path = join(published, hash + '.data');
  const original = await lstat(path);
  const record = recordSchema.parse(JSON.parse(await readFile(join(published, hash + '.json'), 'utf8')) as unknown);
  if (!original.isFile() || original.isSymbolicLink() || original.nlink !== 1 ||
    original.uid !== process.getuid?.() || (original.mode & 0o777) !== 0o600 ||
    original.size !== owned.bytes.length || await realpath(path) !== path ||
    !owned.bytes.equals(await readFile(path)) || record.info.sha256 !== checksum ||
    record.info.size !== metadata.byteSize || record.info.generation !== metadata.generation) {
    throw new Error('Only the exact committed fresh private object may be temporarily gated.');
  }

  // The child validates the same inode and content before taking a Linux
  // write lease. SIGIO is emitted by the kernel only when another process
  // actually attempts a conflicting open. No byte or metadata is changed.
  const leaseScript = `
import fcntl, hashlib, os, signal, stat, sys
fd = None
waiting = False
leased = False
def reader_waiting(*_):
    global waiting
    if not waiting:
        waiting = True
        print("reader_waiting", flush=True)
def stop(*_):
    raise SystemExit(0)
try:
    path, device, inode, size, checksum = sys.argv[1:]
    fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
    value = os.fstat(fd)
    if (not stat.S_ISREG(value.st_mode) or value.st_dev != int(device) or
        value.st_ino != int(inode) or value.st_size != int(size) or
        value.st_uid != os.getuid() or value.st_nlink != 1 or
        stat.S_IMODE(value.st_mode) != 0o600):
        raise RuntimeError("owned_inode_changed")
    data = os.read(fd, 4097)
    if len(data) != int(size) or hashlib.sha256(data).hexdigest() != checksum:
        raise RuntimeError("owned_checksum_changed")
    signal.signal(signal.SIGIO, reader_waiting)
    signal.signal(signal.SIGTERM, stop)
    fcntl.fcntl(fd, fcntl.F_SETOWN, os.getpid())
    fcntl.fcntl(fd, fcntl.F_SETLEASE, fcntl.F_WRLCK)
    leased = True
    print("lease_ready", flush=True)
    command = sys.stdin.readline()
    if command not in ("release\\n", ""):
        raise RuntimeError("unexpected_release_command")
except OSError as error:
    print("lease_os_error_" + str(error.errno), file=sys.stderr, flush=True)
    raise SystemExit(1)
except RuntimeError as error:
    print(str(error), file=sys.stderr, flush=True)
    raise SystemExit(1)
finally:
    if fd is not None:
        if leased:
            fcntl.fcntl(fd, fcntl.F_SETLEASE, fcntl.F_UNLCK)
        os.close(fd)
        print("lease_released", flush=True)
`;
  const child = spawn('python3', ['-u', '-c', leaseScript, path, String(original.dev), String(original.ino),
    String(original.size), checksum], { stdio: ['pipe', 'pipe', 'pipe'] });
  let ready = false, readerWaiting = false, released = false, exited = false;
  let exitCode: number | null = null, protocol = '', failure = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    protocol += chunk;
    let newline: number;
    while ((newline = protocol.indexOf('\n')) >= 0) {
      const line = protocol.slice(0, newline); protocol = protocol.slice(newline + 1);
      if (line === 'lease_ready') ready = true;
      else if (line === 'reader_waiting') readerWaiting = true;
      else if (line === 'lease_released') released = true;
      else failure = 'Unexpected private storage lease protocol.';
    }
  });
  child.stderr.on('data', (chunk: string) => { failure = (failure + chunk).slice(0, 1024); });
  child.on('error', () => { failure = 'Could not start the owned private storage lease process.'; });
  child.stdin.on('error', () => { failure = 'The owned lease release pipe closed unexpectedly.'; });
  child.on('close', code => { exitCode = code; exited = true; });
  async function waitUntil(predicate: () => boolean, timeout: number, message: string) {
    const deadline = Date.now() + timeout;
    while (!predicate()) {
      if (failure || exited) throw new Error(message + ' ' + (failure || 'Lease process exited early.'));
      if (Date.now() >= deadline) throw new Error(message);
      await new Promise<void>(resolve => setTimeout(resolve, 20));
    }
  }
  async function stopChild() {
    if (!exited && !child.stdin.destroyed && child.stdin.writable) child.stdin.end('release\n');
    const deadline = Date.now() + 5_000;
    while (!exited && Date.now() < deadline) await new Promise<void>(resolve => setTimeout(resolve, 20));
    if (!exited) {
      child.kill('SIGTERM');
      const termination = Date.now() + 2_000;
      while (!exited && Date.now() < termination) await new Promise<void>(resolve => setTimeout(resolve, 20));
      if (!exited) child.kill('SIGKILL');
      throw new Error('Owned private storage lease required emergency process cleanup.');
    }
  }
  try { await waitUntil(() => ready, 5_000, 'An owned regular-file write lease is required; this case cannot be skipped.'); }
  catch (error) { await stopChild().catch(() => {}); throw error; }
  async function release() {
    await stopChild();
    if (exitCode !== 0 || !released || failure)
      throw new Error('Owned private storage lease did not release cleanly. ' + failure);
  }
  return {
    get readerWaiting() { return readerWaiting; },
    async waitForReader() {
      await waitUntil(() => readerWaiting, 15_000, 'The native download did not reach the owned regular-file open.');
      if (released || exited) throw new Error('The private storage lease ended before authorization could be revoked.');
    },
    release,
    async restore() {
      await release();
      const current = await lstat(path);
      if (!current.isFile() || current.dev !== original.dev || current.ino !== original.ino ||
        current.size !== original.size || current.nlink !== 1 || current.mode !== original.mode ||
        !owned.bytes.equals(await readFile(path)))
        throw new Error('The private storage fixture changed the original committed object.');
    },
  };
}
