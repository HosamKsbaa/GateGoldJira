// Real captured Go server and private development identities; never resets shared fixtures.
import { expect, type APIRequestContext, type Page, type TestInfo } from '@playwright/test';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { createServer } from 'node:net';
import { createSign, randomBytes } from 'node:crypto';
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import {OwnedPostgresProxy} from './owned-postgres-proxy';
const run = promisify(execFile);
const sessionSchema = z.object({ accessToken: z.string().min(1), expiresAt: z.iso.datetime() }).strict();
async function reservePort() {
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const address = reservation.address();
    if (!address || typeof address === 'string')
        throw new Error('No private local server port.');
    await new Promise<void>(resolve => reservation.close(() => resolve()));
    return address.port;
}
export class LocalAuthServer {
    readonly ownerPassword = '   Significant password ' + randomBytes(16).toString('base64url') + '   ';
    readonly directory: string;
    private readonly key: string;
    private child: ChildProcess | undefined;
    private logs = '';
    private sequence = 0;
    origin = '';
    restAudience = process.env['REST_AUDIENCE'] ?? '';
    private binary = '';
    constructor(private readonly info: TestInfo) {
        this.directory = info.outputPath('private-local-auth');
        this.key = join(this.directory, 'signing-key.pem');
    }
    private environment(): NodeJS.ProcessEnv {
        // Pass only public canonical fixture settings and the local tool/coverage paths.
        // Production provider credentials and the primary identity/storage paths are
        // never copied to this test-owned process.
        const allowed = ['PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'GOCACHE', 'GOMODCACHE', 'GOPATH', 'GOCOVERDIR', 'GOGC', 'GOMEMLIMIT', 'GOMAXPROCS', 'DATABASE_URL', 'AUTH_ISSUER', 'REST_AUDIENCE', 'MCP_AUDIENCE', 'ALLOWED_ORIGINS', 'COMPANY_TIMEZONE'] as const;
        const env: NodeJS.ProcessEnv = {};
        for (const key of allowed)
            if (process.env[key] !== undefined)
                env[key] = process.env[key];
        return { ...env, APP_ENV: 'development', AUTH_MODE: 'development', STORAGE_MODE: 'local', AUTH_REQUIRED_SCOPE: 'gategoldjira:access', DEV_SIGNING_KEY_FILE: this.key, CURSOR_SECRET_FILE: join(this.directory, 'cursor-secret'), LOCAL_PICTURE_DIRECTORY: join(this.directory, 'private-objects'), SMTP_ADDRESS: '', SMTP_FROM: '', SMTP_USERNAME: '', SMTP_PASSWORD: '', SMTP_ALLOW_LOCAL_PLAINTEXT: 'false', NOTIFICATION_WORKER_INTERVAL_SECONDS: '3600' };
    }
    async prepare(hashCost: 10 | 14 = 10) {
        if (process.env['K_SERVICE'])
            throw new Error('Private password fixtures are forbidden on Cloud Run.');
        const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
        if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database))
            throw new Error('The private identity server requires an isolated browser database.');
        let databaseURL: URL;
        try {
            databaseURL = new URL(process.env['DATABASE_URL'] ?? 'invalid:');
        }
        catch {
            throw new Error('An explicit disposable local database is required.');
        }
        if (!['postgres:', 'postgresql:'].includes(databaseURL.protocol) || databaseURL.hostname !== '127.0.0.1' || databaseURL.port !== '54329' || databaseURL.pathname !== '/' + database)
            throw new Error('Only the owning browser fixture database may be used.');
        const binary = process.env['GATEGOLD_E2E_SERVER_BINARY'];
        if (!binary || !binary.includes('/' + database.slice('gg_browser_'.length) + '/') || !binary.endsWith('/gategoldjira'))
            throw new Error('Only this run’s captured server binary may be launched.');
        await access(binary, constants.X_OK);
        this.binary = binary;
        await mkdir(this.directory, { recursive: true, mode: 0o700 });
        const accounts = ['owner', 'member', 'viewer', 'disabled'].map(username => ({ username, password: username === 'owner' ? this.ownerPassword : randomBytes(24).toString('base64url') }));
        await writeFile(join(this.directory, 'accounts.json'), JSON.stringify({ accounts }), { mode: 0o600 });
        // dev-tokens writes new keys/password fixtures only. dev-init is deliberately not invoked.
        await run(binary, ['dev-tokens'], { env: this.environment() });
        if (hashCost === 14) {
            // Use the already pinned Go bcrypt dependency; no tool, package or credentials are downloaded.
            const helper = join(this.directory, 'owned-hash-fixture.go');
            await writeFile(helper, `package main
import("encoding/json";"os";"path/filepath";"golang.org/x/crypto/bcrypt")
func main(){ root:=os.Getenv("GATEGOLD_OWNED_HASH_PROFILE"); if root==""{panic("private fixture required")};
var handout struct{Accounts []struct{Username,Password string}}; raw,err:=os.ReadFile(filepath.Join(root,"accounts.json"));if err!=nil{panic("private handout unavailable")};if json.Unmarshal(raw,&handout)!=nil{panic("invalid private handout")};
var credentials struct{Accounts []struct{Username string \x60json:"username"\x60; PasswordHash string \x60json:"passwordHash"\x60; Subject string \x60json:"subject"\x60;Email string \x60json:"email"\x60}};
raw,err=os.ReadFile(filepath.Join(root,"credentials.json"));if err!=nil{panic("private hash unavailable")};if json.Unmarshal(raw,&credentials)!=nil{panic("invalid private hash")};
for i:=range credentials.Accounts{if credentials.Accounts[i].Username!="owner"{continue};for _,account:=range handout.Accounts{if account.Username=="owner"{hash,e:=bcrypt.GenerateFromPassword([]byte(account.Password),14);if e!=nil{panic("fixture hash failed")};credentials.Accounts[i].PasswordHash=string(hash)}}};
raw,err=json.Marshal(credentials);if err!=nil{panic("fixture encode failed")};if os.WriteFile(filepath.Join(root,"credentials.json"),raw,0600)!=nil{panic("fixture write failed")}}
`, { mode: 0o600 });
            await run('go', ['run', helper], { cwd: resolve('../backend'), env: { ...this.environment(), GATEGOLD_OWNED_HASH_PROFILE: this.directory, GOPROXY: 'off', GOSUMDB: 'off', GOTOOLCHAIN: 'local', GOWORK: 'off' } });
        }
    }
    async start(options: {
        audiencesForOwnOrigin?: true;
        maintenanceWithoutCredentialProbe?: true; postgresProxy?:OwnedPostgresProxy;
    } = {}) {
        if (this.child)
            throw new Error('Stop this owned server before restarting it.');
        const number = await reservePort();
        this.origin = 'http://127.0.0.1:' + number;
        const ownAudiences = options.audiencesForOwnOrigin || options.maintenanceWithoutCredentialProbe;
        this.restAudience = ownAudiences ? this.origin + '/api' : process.env['REST_AUDIENCE'] ?? '';
        if(options.postgresProxy&&!(options.postgresProxy instanceof OwnedPostgresProxy))throw new Error('An active owned PostgreSQL proxy capability is required.');
        const proxyDatabase=options.postgresProxy?.databaseUrlFor(process.env['GATEGOLD_E2E_DATABASE_NAME']??'');
        const child = spawn(this.binary, [], { env: { ...this.environment(), ...(proxyDatabase?{DATABASE_URL:proxyDatabase}:{}), PORT: String(number), ...(ownAudiences ? { REST_AUDIENCE: this.restAudience, MCP_AUDIENCE: this.origin + '/mcp' } : {}), ...(options.maintenanceWithoutCredentialProbe ? { MAINTENANCE_AUDIENCE: this.origin + '/internal/maintenance/pictures', MAINTENANCE_SERVICE_EMAILS: 'owned-browser-fixture@owned-test.iam.gserviceaccount.com' } : {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
        this.child = child;
        child.on('error', () => {
        });
        for (const stream of [child.stdout, child.stderr])
            stream?.on('data', chunk => {
                this.logs += String(chunk);
            });
        await expect.poll(async () => {
            if (child.exitCode !== null || child.signalCode !== null)
                throw new Error('The owned local identity server exited; inspect its private log.');
            try {
                return (await fetch(this.origin + '/readyz')).status;
            }
            catch {
                return 0;
            }
        }, { timeout: 20000 }).toBe(200);
    }
    async rejectUnsafeLocalDeployment() {
        if (this.child || !this.binary)
            throw new Error('Prepare a stopped test-owned local identity server first.');
        const number = await reservePort();
        const child = spawn(this.binary, [], { env: { ...this.environment(), PORT: String(number), REST_AUDIENCE: 'https://owned-unsafe-fixture.example.invalid/api', MCP_AUDIENCE: 'https://owned-unsafe-fixture.example.invalid/mcp' }, stdio: ['ignore', 'pipe', 'pipe'] });
        let diagnostics = '';
        for (const stream of [child.stdout, child.stderr])
            stream?.on('data', chunk => { diagnostics += String(chunk); });
        const closed = once(child, 'close');
        const deadline = setTimeout(() => child.kill('SIGKILL'), 10000);
        try {
            await closed;
            expect(child.signalCode).toBeNull();
            expect(child.exitCode).not.toBe(0);
            expect(diagnostics).toContain('password fixtures require loopback services');
        } finally {
            clearTimeout(deadline);
            if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
            await writeFile(this.info.outputPath('unsafe-local-startup.private.log'), diagnostics, { mode: 0o600 });
        }
    }
    async stop() {
        const child = this.child;
        if (!child)
            return;
        this.child = undefined;
        if (child.exitCode === null && child.signalCode === null) {
            const closed = once(child, 'close');
            child.kill('SIGTERM');
            const deadline = setTimeout(() => child.kill('SIGKILL'), 12000);
            try {
                await closed;
            }
            finally {
                clearTimeout(deadline);
            }
        }
        await writeFile(this.info.outputPath('local-auth-server-' + (++this.sequence) + '.private.log'), this.logs, { mode: 0o600 });
        this.logs = '';
    }
    async crash() {
        const child = this.child;
        if (!child || child.exitCode !== null || child.signalCode !== null)
            throw new Error('Only the running owned secondary server may be intentionally crashed.');
        this.child = undefined;
        const closed = once(child, 'close');
        child.kill('SIGKILL');
        await closed;
        expect(child.signalCode).toBe('SIGKILL');
        await writeFile(this.info.outputPath('local-auth-server-crash.private.log'), this.logs, { mode: 0o600 });
        this.logs = '';
    }
    async signedUnapproved(channel: 'rest' | 'mcp') {
        const now = Math.floor(Date.now() / 1000), encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
        const body = encode({ alg: 'RS256', typ: 'JWT' }) + '.' + encode({ iss: process.env['AUTH_ISSUER'], sub: 'local|unapproved-' + crypto.randomUUID(), aud: channel === 'rest' ? process.env['REST_AUDIENCE'] : process.env['MCP_AUDIENCE'], iat: now, exp: now + 600, scope: 'gategoldjira:access', 'https://gategoldjira.app/email': 'unapproved-' + crypto.randomUUID() + '@example.test', 'https://gategoldjira.app/email_verified': true });
        const signer = createSign('RSA-SHA256');
        signer.update(body);
        signer.end();
        // This is the new test-owned fixture key, never the primary developer identity key.
        return body + '.' + signer.sign(await readFile(this.key), 'base64url');
    }
    async addIdentity(username: string, email: string) {
        if (this.child)
            throw new Error('Prepare a private local identity before starting its owned server.');
        z.string().regex(/^[a-z][a-z0-9._-]{0,63}$/).parse(username);
        z.email().max(320).parse(email);
        const path = join(this.directory, 'credentials.json');
        const records = z.object({ accounts: z.array(z.object({ username: z.string(), passwordHash: z.string(), subject: z.string(), email: z.email() }).strict()).max(50) }).strict().parse(JSON.parse(await readFile(path, 'utf8')));
        const owner = records.accounts.find(account => account.username === 'owner');
        if (!owner || records.accounts.some(account => account.username === username))
            throw new Error('The private fixture needs its own unique local username.');
        // This reuses only our freshly generated private fixture hash, preserving the
        // significant-space password. The primary account/key/handout is untouched.
        records.accounts.push({ username, passwordHash: owner.passwordHash, subject: 'local|' + username, email });
        await writeFile(path, JSON.stringify(records), { mode: 0o600 });
        return { username, password: this.ownerPassword };
    }
    async ownerSession(request: APIRequestContext) {
        const response = await request.post(this.origin + '/api/v1/auth/local-sign-in', { data: { username: 'owner', password: this.ownerPassword } });
        expect(response.status()).toBe(200);
        return sessionSchema.parse(await response.json());
    }
}
/** Real sign-in against the owned local server, with public endpoint config only. */
export async function signInOnLocalServer(page: Page, server: LocalAuthServer, credentials: {
    username: string;
    password: string;
}, destination = '/') {
    await page.route('**/config.local.json', route => route.fulfill({ json: { mode: 'development', apiBaseUrl: server.origin + '/api/v1', issuer: process.env['AUTH_ISSUER'], clientId: 'local-development', audience: server.restAudience, scope: 'openid profile email gategoldjira:access' } }));
    await page.goto(destination);
    await expect(page.getByRole('heading', { name: 'Welcome to GateGoldJira', exact: true })).toBeVisible();
    await page.getByLabel('Username', { exact: true }).fill(credentials.username);
    await page.getByLabel('Password', { exact: true }).fill(credentials.password);
    await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
}
