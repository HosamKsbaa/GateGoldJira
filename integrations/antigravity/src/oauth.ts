import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { z } from 'zod';
import { PrivateStore } from './store.ts';
import { credentialSchema, SignInRequired, UserError, type Credential, type Settings } from './models.ts';

export const clientId = 'gategoldjira-antigravity';
const scope = 'gategoldjira:access';
const metadataSchema = z.object({
  issuer: z.string(), authorization_endpoint: z.string(), token_endpoint: z.string(), revocation_endpoint: z.string(),
  code_challenge_methods_supported: z.array(z.string()), scopes_supported: z.array(z.string()),
});
const tokenSchema = z.object({
  access_token: credentialSchema.shape.accessToken, refresh_token: credentialSchema.shape.refreshToken,
  token_type: z.literal('Bearer'), expires_in: z.number().int().min(1).max(86400), scope: z.literal(scope),
});
interface Pending {
  id: string; url: string; server: Server; timer: ReturnType<typeof setTimeout>;
}

export class BrowserOAuth {
  private current?: Pending;
  message = '';
  constructor(readonly store: PrivateStore, private readonly request: typeof fetch = fetch) {}

  private async json(url: string): Promise<unknown> {
    const response = await this.request(url, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new UserError('OAuth discovery is unavailable. Check the server address and its browser OAuth configuration.');
    if (Number(response.headers.get('content-length')) > 65536) throw new UserError('The server returned invalid OAuth metadata.');
    const text = await response.text();
    if (text.length > 65536) throw new UserError('The server returned invalid OAuth metadata.');
    return JSON.parse(text);
  }
  private async discover(settings: Pick<Settings, 'endpoint'>) {
    const origin = new URL(settings.endpoint).origin;
    const resource = z.object({ resource: z.literal(settings.endpoint), authorization_servers: z.array(z.string()) })
      .parse(await this.json(origin + '/.well-known/oauth-protected-resource/mcp'));
    const issuer = origin + '/oauth';
    if (!resource.authorization_servers.includes(issuer)) {
      throw new UserError('Enable GateGoldJira browser OAuth on this server before connecting the plugin.');
    }
    const metadata = metadataSchema.parse(await this.json(origin + '/.well-known/oauth-authorization-server/oauth'));
    if (metadata.issuer !== issuer || metadata.authorization_endpoint !== issuer + '/authorize'
      || metadata.token_endpoint !== issuer + '/token' || metadata.revocation_endpoint !== issuer + '/revoke'
      || !metadata.code_challenge_methods_supported.includes('S256') || !metadata.scopes_supported.includes(scope)) {
      throw new UserError('The server returned incompatible OAuth settings. Update the server before connecting.');
    }
    return metadata;
  }
  private async exchange(settings: Settings, form: URLSearchParams): Promise<Credential> {
    const metadata = await this.discover(settings);
    form.set('client_id', clientId);
    form.set('resource', settings.endpoint);
    const response = await this.request(metadata.token_endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (response.status === 400 || response.status === 401) throw new SignInRequired();
    if (!response.ok) throw new UserError('The authorization server is unavailable. Try again shortly.');
    const tokens = tokenSchema.parse(await response.json());
    return { sessionId: randomUUID(), endpoint: settings.endpoint, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: Date.now() + tokens.expires_in * 1000 };
  }
  async begin(): Promise<string> {
    return this.store.locked(async () => {
      if (await this.store.credential()) throw new UserError('Disconnect the current account before signing in as another user.');
      const existing = await this.store.pending();
      if (existing && existing.expiresAt > Date.now()) {
        try { process.kill(existing.pid, 0); }
        catch { await this.store.remove('pending.json'); }
        if (await this.store.pending()) {
          if (this.current?.id === existing.id) return this.current.url;
          throw new UserError('Sign-in is already open in another GateGoldJira panel. Finish or cancel that request first.');
        }
      }
      const settings = await this.store.requireSettings();
      const metadata = await this.discover(settings);
      const verifier = randomBytes(32).toString('base64url');
      const state = randomBytes(32).toString('base64url');
      const id = randomUUID();
      const server = createServer();
      await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing callback listener');
      const redirect = 'http://127.0.0.1:' + address.port + '/oauth/callback';
      const url = new URL(metadata.authorization_endpoint);
      url.search = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirect,
        scope, resource: settings.endpoint, state, code_challenge_method: 'S256',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      }).toString();
      server.on('request', (request, response) => {
        const callback = new URL(request.url ?? '/', redirect);
        const provided = callback.searchParams.get('state') ?? '';
        const providedBytes = Buffer.from(provided);
        const stateBytes = Buffer.from(state);
        const validState = providedBytes.length === stateBytes.length && timingSafeEqual(providedBytes, stateBytes);
        const unique = [...callback.searchParams.keys()].every(key => callback.searchParams.getAll(key).length === 1);
        if (request.method !== 'GET' || request.headers.host !== new URL(redirect).host || callback.pathname !== '/oauth/callback'
          || !validState || !unique || callback.searchParams.get('iss') !== metadata.issuer) {
          response.writeHead(400, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
          response.end('Invalid authorization callback. Return to GateGoldJira and try again.');
          return;
        }
        void this.store.locked(async () => {
          const pending = await this.store.pending();
          if (pending?.id !== id || pending.expiresAt <= Date.now()) throw new UserError('This sign-in request was cancelled.');
          await this.store.remove('pending.json');
          if (callback.searchParams.has('error')) throw new UserError('Access was not approved. You can start sign-in again.');
          const code = callback.searchParams.get('code') ?? '';
          if (!/^[A-Za-z0-9_-]{43}$/.test(code)) throw new UserError('The authorization code is invalid. Start sign-in again.');
          const tokens = await this.exchange(settings, new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirect }));
          await this.store.write('credentials.json', tokens);
          this.message = 'Connected. Return to the GateGoldJira panel.';
        }).then(() => {
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
          response.end('<!doctype html><title>GateGoldJira connected</title><h1>You are connected</h1><p>Return to GateGoldJira in Antigravity. You can close this tab.</p>');
        }).catch(() => {
          this.message = 'Sign-in did not complete. Start again to connect your account.';
          response.writeHead(400, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
          response.end('Sign-in did not complete. Return to GateGoldJira and start again.');
        }).finally(() => { void this.finish(id); });
      });
      const timer = setTimeout(() => {
        this.message = 'Sign-in timed out. Start again when you are ready.';
        void this.finish(id);
      }, 180000);
      timer.unref();
      this.current = { id, server, timer, url: url.href };
      await this.store.write('pending.json', { id, pid: process.pid, expiresAt: Date.now() + 180000 });
      this.message = 'Complete sign-in and approve access in your browser.';
      return url.href;
    });
  }
  private async finish(id: string): Promise<void> {
    if (this.current?.id === id) {
      clearTimeout(this.current.timer);
      this.current.server.close();
      this.current = undefined;
    }
    await this.store.locked(async () => {
      if ((await this.store.pending())?.id === id) await this.store.remove('pending.json');
    });
  }
  async cancel(): Promise<void> {
    const pending = await this.store.pending();
    if (pending) await this.finish(pending.id);
    this.message = 'Sign-in cancelled. You can start again when you are ready.';
  }
  async pendingURL(): Promise<string | null> { return this.current?.url ?? null; }
  async access(rejected?: string, expectedEndpoint?: string, expectedSession?: string): Promise<string> {
    return this.store.locked(async () => {
      const settings = await this.store.requireSettings();
      const credential = await this.store.credential();
      if (!credential || credential.endpoint !== settings.endpoint || expectedEndpoint && settings.endpoint !== expectedEndpoint || expectedSession && credential.sessionId !== expectedSession) throw new SignInRequired();
      if (credential.expiresAt > Date.now() + 30000 && credential.accessToken !== rejected) return credential.accessToken;
      try {
        const refreshed = { ...await this.exchange(settings, new URLSearchParams({ grant_type: 'refresh_token', refresh_token: credential.refreshToken })), sessionId: credential.sessionId };
        await this.store.write('credentials.json', refreshed);
        return refreshed.accessToken;
      } catch (error) {
        if (error instanceof SignInRequired) await this.store.remove('credentials.json');
        throw error;
      }
    });
  }
  readonly authorizedFetch: typeof fetch = async (input, init) => {
    const settings = await this.store.requireSettings();
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== new URL(settings.endpoint).origin || url.pathname !== '/mcp' || url.username || url.password) throw new Error('Unexpected MCP destination');
    const credential = await this.store.credential();
    if (!credential) throw new SignInRequired();
    const token = await this.access(undefined, settings.endpoint, credential.sessionId);
    const headers = new Headers(init?.headers);
    headers.set('Authorization', 'Bearer ' + token);
    const options: RequestInit = { ...init, headers, redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(30000), ...(init?.signal ? [init.signal] : [])]) };
    let response = await this.request(input, options);
    // An HTTP 401 is rejected before tool execution. Never retry tool errors or
    // network failures, because a mutation might already have committed.
    if (response.status === 401) {
      await response.body?.cancel();
      headers.set('Authorization', 'Bearer ' + await this.access(token, settings.endpoint, credential.sessionId));
      response = await this.request(input, options);
      if (response.status === 401) {
        await this.store.locked(async () => {
          if ((await this.store.credential())?.sessionId === credential.sessionId) await this.store.remove('credentials.json');
        });
        throw new SignInRequired();
      }
    }
    return response;
  };
  async configure(settings: Settings): Promise<void> {
    await this.store.locked(async () => {
      const pending = await this.store.pending();
      if (await this.store.credential() || pending && pending.expiresAt > Date.now()) throw new UserError('Disconnect or cancel sign-in before changing the server.');
      await this.store.remove('pending.json');
      await this.store.write('settings.json', settings);
    });
  }
  async disconnect(): Promise<void> {
    await this.cancel();
    await this.store.locked(async () => {
      const credential = await this.store.credential();
      if (credential) {
        const settings = await this.store.settings() ?? { endpoint: credential.endpoint };
        const metadata = await this.discover(settings);
        const response = await this.request(metadata.revocation_endpoint, {
          method: 'POST', body: new URLSearchParams({ client_id: clientId, token: credential.refreshToken, token_type_hint: 'refresh_token' }),
          redirect: 'error', signal: AbortSignal.timeout(10000),
        });
        if (!response.ok) throw new UserError('Disconnect could not reach the server. Retry or revoke this connection from the website.');
      }
      await this.store.remove('credentials.json');
      this.message = 'Disconnected. You can sign in with another account.';
    });
  }
}
