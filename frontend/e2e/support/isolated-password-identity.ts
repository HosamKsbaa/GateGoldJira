// Local production-mode fixture. It never targets a deployed VM or provider.
import { type TestInfo } from '@playwright/test';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { constants } from 'node:fs';
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createHTTPS, type Server as HTTPSServer } from 'node:https';
import { connect, createServer, type Server, type Socket } from 'node:net';
import { join } from 'node:path';
import type { Duplex } from 'node:stream';
import { createSecureContext, TLSSocket, type SecureContext } from 'node:tls';
import { promisify } from 'node:util';
import { z } from 'zod';

const run = promisify(execFile);
export interface PasswordIdentity { username: string; email: string; password: string }

async function listen(server: Server | HTTPSServer): Promise<number> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The private fixture has no loopback port.');
  return address.port;
}

async function reservePort(): Promise<number> {
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise<void>(resolve => reservation.close(() => resolve()));
  return port;
}

// PostgreSQL requests TLS before its startup packet. Only after the TLS
// handshake and exact database/user validation do we open the local upstream.
// This bridge cannot tunnel an arbitrary startup or PostgreSQL cancel token.
class OwnedTLSPostgres {
  private server: Server | undefined;
  private readonly sockets = new Set<Socket>();
  connections = 0;
  constructor(private readonly database: string, private readonly secureContext: SecureContext) {}

  async start(): Promise<number> {
    this.server = createServer(raw => {
      this.track(raw);
      let prelude = Buffer.alloc(0);
      const sslRequest = (part: Buffer) => {
        prelude = Buffer.concat([prelude, part]);
        if (prelude.length < 8) return;
        raw.off('data', sslRequest);
        if (prelude.length !== 8 || prelude.readInt32BE(0) !== 8 || prelude.readInt32BE(4) !== 80877103) {
          raw.destroy(); return;
        }
        raw.write('S');
        const encrypted = new TLSSocket(raw, { isServer: true, secureContext: this.secureContext });
        this.track(encrypted);
        let startup = Buffer.alloc(0);
        const validate = (part: Buffer) => {
          startup = Buffer.concat([startup, part]);
          if (startup.length < 4) return;
          const size = startup.readInt32BE(0);
          if (size < 9 || size > 65536 || startup.length > 65536) { encrypted.destroy(); return; }
          if (startup.length < size) return;
          encrypted.off('data', validate);
          if (startup.readInt32BE(4) !== 196608 || startup[size - 1] !== 0 || !encrypted.getCipher()) {
            encrypted.destroy(); return;
          }
          const fields = startup.subarray(8, size - 1).toString('utf8').split('\0');
          if (fields.at(-1) !== '') { encrypted.destroy(); return; }
          fields.pop();
          if (fields.length % 2 !== 0) { encrypted.destroy(); return; }
          const values = new Map<string, string>();
          for (let index = 0; index < fields.length; index += 2) {
            const name = fields[index]!, value = fields[index + 1]!;
            if (!name || values.has(name)) { encrypted.destroy(); return; }
            values.set(name, value);
          }
          if (values.get('database') !== this.database || values.get('user') !== 'gategoldjira') {
            encrypted.destroy(); return;
          }
          encrypted.pause();
          const upstream = connect({ host: '127.0.0.1', port: 54329 });
          this.track(upstream);
          upstream.on('error', () => encrypted.destroy());
          encrypted.on('error', () => upstream.destroy());
          encrypted.on('close', () => upstream.destroy());
          upstream.on('close', () => encrypted.destroy());
          upstream.once('connect', () => {
            this.connections++;
            upstream.write(startup);
            encrypted.pipe(upstream);
            upstream.pipe(encrypted);
            encrypted.resume();
          });
        };
        encrypted.on('data', validate);
      };
      raw.on('data', sslRequest);
    });
    return listen(this.server);
  }

  private track(socket: Socket) {
    this.sockets.add(socket);
    socket.setNoDelay(true);
    socket.setTimeout(90_000, () => socket.destroy());
    socket.on('error', () => socket.destroy());
    socket.on('close', () => this.sockets.delete(socket));
  }

  async stop() {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    if (this.server) await new Promise<void>(resolve => this.server!.close(() => resolve()));
    this.server = undefined;
  }
}

export class PasswordModeServer {
  readonly directory: string;
  origin = '';
  private binary = '';
  private databaseURL: URL | undefined;
  private frontend: URL | undefined;
  private bridge: OwnedTLSPostgres | undefined;
  private https: HTTPSServer | undefined;
  private child: ChildProcess | undefined;
  private backendOrigin = '';
  private logs = '';
  private readonly sockets = new Set<Duplex>();

  constructor(private readonly info: TestInfo) { this.directory = info.outputPath('private-production-password'); }
  get encryptedDatabaseConnections(): number { return this.bridge?.connections ?? 0; }

  private environment(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = {};
    for (const key of ['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'GOCOVERDIR', 'GOGC', 'GOMEMLIMIT', 'GOMAXPROCS'] as const) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    return {
      ...env, APP_ENV: 'production', DEPLOYMENT_TARGET: 'vm', AUTH_MODE: 'password',
      DATABASE_URL: this.databaseURL?.href, AUTH_ISSUER: this.origin + '/',
      REST_AUDIENCE: this.origin + '/api', MCP_AUDIENCE: this.origin + '/mcp',
      ALLOWED_ORIGINS: this.origin, AUTH_REQUIRED_SCOPE: 'gategoldjira:access',
      PASSWORD_SIGNING_KEY_FILE: join(this.directory, 'identity-key.pem'),
      PASSWORD_CREDENTIALS_FILE: join(this.directory, 'accounts.json'),
      CURSOR_SECRET_FILE: join(this.directory, 'cursor-secret'),
      STORAGE_MODE: 'local', LOCAL_PICTURE_DIRECTORY: join(this.directory, 'objects'),
      COMPANY_TIMEZONE: 'Africa/Cairo', NOTIFICATION_APP_URL: this.origin,
      NOTIFICATION_WORKER_INTERVAL_SECONDS: '3600', MCP_BROWSER_OAUTH_ENABLED: 'false',
    };
  }

  async prepare() {
    if (process.env['K_SERVICE']) throw new Error('Hosted-mode test fixtures cannot run on Cloud Run.');
    const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
    if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database)) throw new Error('An owning disposable browser database is required.');
    const databaseURL = new URL(process.env['DATABASE_URL'] ?? 'invalid:');
    const password = databaseURL.password;
    if (!['postgres:', 'postgresql:'].includes(databaseURL.protocol) || databaseURL.hostname !== '127.0.0.1' || databaseURL.port !== '54329' || databaseURL.pathname !== '/' + database || databaseURL.username !== 'gategoldjira' || !password || databaseURL.searchParams.get('sslmode') !== 'disable') {
      throw new Error('The production-mode bridge may reach only its owning local fixture database.');
    }
    this.frontend = new URL(process.env['GATEGOLD_WEB_URL'] ?? 'invalid:');
    if (this.frontend.protocol !== 'http:' || this.frontend.hostname !== '127.0.0.1' || !this.frontend.port || this.frontend.pathname !== '/' || this.frontend.username || this.frontend.password || this.frontend.search || this.frontend.hash) {
      throw new Error('Only the owning local Angular server may be proxied.');
    }
    const binary = process.env['GATEGOLD_E2E_SERVER_BINARY'];
    if (!binary || !binary.includes('/' + database.slice('gg_browser_'.length) + '/') || !binary.endsWith('/gategoldjira')) throw new Error('Only this run\u2019s captured Go binary may be launched.');
    await access(binary, constants.X_OK);
    this.binary = binary;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    await writeFile(join(this.directory, 'identity-key.pem'), pair.privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
    await writeFile(join(this.directory, 'cursor-secret'), randomBytes(48), { mode: 0o600 });
    // Fixture-owned certificates are never copied to production trust stores.
    await run('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=Owned browser fixture CA', '-keyout', join(this.directory, 'ca-key.pem'), '-out', join(this.directory, 'ca.pem')]);
    await run('openssl', ['req', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=127.0.0.1', '-keyout', join(this.directory, 'tls-key.pem'), '-out', join(this.directory, 'tls.csr')]);
    await writeFile(join(this.directory, 'tls.ext'), 'subjectAltName=IP:127.0.0.1\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n', { mode: 0o600 });
    await run('openssl', ['x509', '-req', '-in', join(this.directory, 'tls.csr'), '-CA', join(this.directory, 'ca.pem'), '-CAkey', join(this.directory, 'ca-key.pem'), '-CAcreateserial', '-days', '1', '-extfile', join(this.directory, 'tls.ext'), '-out', join(this.directory, 'tls.pem')]);
    await chmod(join(this.directory, 'tls-key.pem'), 0o600);
    await chmod(join(this.directory, 'ca-key.pem'), 0o600);
    const key = await readFile(join(this.directory, 'tls-key.pem')), cert = await readFile(join(this.directory, 'tls.pem'));
    this.bridge = new OwnedTLSPostgres(database, createSecureContext({ key, cert, minVersion: 'TLSv1.2' }));
    databaseURL.port = String(await this.bridge.start());
    databaseURL.search = '';
    databaseURL.searchParams.set('sslmode', 'verify-full');
    databaseURL.searchParams.set('sslrootcert', join(this.directory, 'ca.pem'));
    databaseURL.searchParams.set('connect_timeout', '5');
    this.databaseURL = databaseURL;
    this.https = createHTTPS({ key, cert, minVersion: 'TLSv1.2' }, (request, response) => this.proxy(request, response));
    this.https.on('connection', socket => { this.sockets.add(socket); socket.on('close', () => this.sockets.delete(socket)); });
    this.origin = 'https://127.0.0.1:' + await listen(this.https);
  }

  async provision(identity: PasswordIdentity) {
    if (!this.origin || this.child) throw new Error('Provision only a prepared, stopped, private password server.');
    z.string().regex(/^[a-z][a-z0-9._-]{0,63}$/).parse(identity.username);
    z.email().parse(identity.email);
    const child = spawn(this.binary, ['password-account', '--username', identity.username, '--email', identity.email], { env: this.environment(), stdio: ['pipe', 'pipe', 'pipe'] });
    const closed = once(child, 'close');
    child.stdout?.resume(); child.stderr?.resume();
    child.stdin!.end(identity.password + '\n');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 10_000);
    try {
      await closed;
      if (child.exitCode !== 0 || child.signalCode) throw new Error('The real operator password-account command rejected its private fixture.');
    } finally { clearTimeout(timeout); }
  }

  async start() {
    if (!this.origin || this.child) throw new Error('Start a prepared private password server once.');
    const port = await reservePort();
    this.backendOrigin = 'http://127.0.0.1:' + port;
    this.child = spawn(this.binary, [], { env: { ...this.environment(), PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const stream of [this.child.stdout, this.child.stderr]) stream?.on('data', chunk => { this.logs = (this.logs + String(chunk)).slice(-1024 * 1024); });
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (this.child.exitCode !== null || this.child.signalCode !== null) throw new Error('The real production password server exited before readiness; see its private log.');
      try { if ((await fetch(this.backendOrigin + '/readyz', { signal: AbortSignal.timeout(1000) })).ok) return; } catch { /* Readiness still pending. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('The real production password server did not become ready.');
  }

  private proxy(request: IncomingMessage, response: ServerResponse) {
    const path = request.url ?? '/';
    if (path === '/config.local.json' || path === '/config.production.json') {
      response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ mode: 'production', authentication: 'password', apiBaseUrl: this.origin + '/api/v1', issuer: this.origin + '/', clientId: 'owned-hosted-password-browser', audience: this.origin + '/api', scope: 'openid profile email gategoldjira:access' }));
      return;
    }
    const service = /^\/(?:api(?:\/|$)|oauth(?:\/|$)|mcp(?:\/|$)|\.well-known(?:\/|$)|readyz(?:\?|$)|livez(?:\?|$)|openapi\.json(?:\?|$))/.test(path);
    const target = service ? new URL(this.backendOrigin) : this.frontend;
    if (!target) { response.writeHead(503); response.end(); return; }
    const upstream = httpRequest({ hostname: target.hostname, port: target.port, method: request.method, path, headers: { ...request.headers, host: target.host } }, incoming => {
      response.writeHead(incoming.statusCode ?? 502, incoming.headers);
      incoming.pipe(response);
    });
    upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end(); });
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
  }

  async stop() {
    if (this.child) {
      const child = this.child;
      this.child = undefined;
      if (child.exitCode === null && child.signalCode === null) {
        const closed = once(child, 'close');
        child.kill('SIGTERM');
        const deadline = setTimeout(() => child.kill('SIGKILL'), 12_000);
        try { await closed; } finally { clearTimeout(deadline); }
      }
    }
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    if (this.https) await new Promise<void>(resolve => this.https!.close(() => resolve()));
    this.https = undefined;
    await this.bridge?.stop();
    this.bridge = undefined;
    if (this.binary) await writeFile(this.info.outputPath('production-password-server.private.log'), this.logs, { mode: 0o600 });
  }
}
