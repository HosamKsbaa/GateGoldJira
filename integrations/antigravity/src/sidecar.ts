import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SidecarApp, Response } from 'sidecar_sdk';
import { z } from 'zod';
import { runtime } from './runtime.ts';
import { safeMessage, type ConnectionStatus } from './models.ts';
import { resolveSettings } from './server-settings.ts';

const root = dirname(fileURLToPath(import.meta.url));
const { store, oauth, client } = await runtime(root);
if (!process.env['ANTIGRAVITY_SIDECAR_UI_TOKEN']) throw new Error('GateGoldJira requires an Antigravity host with authenticated sidecar UI support.');
const app = new SidecarApp();
const headers = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
const assets = join(root, 'sidecars', 'studio');
app.page('/', () => new Response(readFileSync(join(assets, 'index.html'), 'utf8'), { contentType: 'text/html; charset=utf-8', headers: {
  ...headers, 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'",
} }));
app.page('/app.js', () => new Response(readFileSync(join(assets, 'app.js'), 'utf8'), { contentType: 'application/javascript', headers }));
app.page('/styles.css', () => new Response(readFileSync(join(assets, 'styles.css'), 'utf8'), { contentType: 'text/css', headers }));

function api(path: string, handler: (data: unknown) => Promise<unknown>): void {
  // All data APIs are POST: the host SDK requires its per-sidecar token for
  // mutations but leaves GET routes public on the local loopback listener.
  app.api(path, async data => {
    try { return new Response(JSON.stringify(await handler(data)), { contentType: 'application/json', headers }); }
    catch (error) { return new Response(JSON.stringify({ error: safeMessage(error) }), { contentType: 'application/json', status: 400, headers }); }
  }, 'POST');
}
api('/api/status', async (): Promise<ConnectionStatus> => {
  const credential = await store.credential();
  let account = null;
  let message = oauth.message;
  if (credential) {
    try { account = await client.me(); }
    catch (error) { message = safeMessage(error); }
  }
  const pending = await store.pending();
  return { settings: await store.settings(), connected: account !== null, hasCredential: Boolean(await store.credential()), account,
    pending: Boolean(pending && pending.expiresAt > Date.now()), authorizationUrl: await oauth.pendingURL(), message };
});
api('/api/settings', async data => {
  await oauth.configure(await resolveSettings(data));
  await client.close();
  return { saved: true };
});
api('/api/connect', async () => ({ authorizationUrl: await oauth.begin() }));
api('/api/cancel', async () => { await oauth.cancel(); return { cancelled: true }; });
api('/api/disconnect', async () => { await oauth.disconnect(); await client.close(); return { disconnected: true }; });
api('/api/projects', async data => {
  const input = z.object({ cursor: z.string().max(2048).optional() }).strict().parse(data);
  return client.projects(input.cursor);
});
api('/api/issues', async data => {
  const input = z.object({ query: z.string().max(200), projectId: z.string().uuid().optional(), cursor: z.string().max(2048).optional() }).strict().parse(data);
  return client.issues(input.query, input.projectId, input.cursor);
});
await app.run();
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
  void oauth.cancel().then(() => client.close()).finally(() => { void app.close().finally(() => process.exit()); });
});
