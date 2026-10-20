import { z } from 'zod';
import { serverInputSchema, settingsSchema, UserError, type Settings } from './models.ts';
import { PrivateStore } from './store.ts';

export async function resolveSettings(data: unknown, request: typeof fetch = fetch): Promise<Settings> {
  const parsed = serverInputSchema.safeParse(data);
  if (!parsed.success) throw new UserError(parsed.error.issues[0]?.message ?? 'Check the server address.');
  const { endpoint, website } = parsed.data;
  if (website) return { endpoint, website };
  const missing = 'Could not detect the website. Check the server URL, or enter the website under Advanced settings.';
  try {
    const response = await request(new URL(endpoint).origin + '/.well-known/oauth-protected-resource/mcp', {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    if (!response.ok || Number(response.headers.get('content-length')) > 65536) throw new UserError(missing);
    const body = await response.text();
    if (body.length > 65536) throw new UserError(missing);
    const metadata = z.object({ resource: z.literal(endpoint), gategoldjira_website_url: settingsSchema.shape.website }).parse(JSON.parse(body));
    return { endpoint, website: metadata.gategoldjira_website_url };
  } catch { throw new UserError(missing); }
}

// Version 1.0 could sign in against packaged defaults without saving settings.
// Recover only that already-authorized endpoint; never copy or change its token.
export async function restoreLegacySettings(store: PrivateStore, request: typeof fetch = fetch): Promise<void> {
  await store.locked(async () => {
    if (await store.settings()) return;
    const credential = await store.credential();
    if (credential) await store.write('settings.json', await resolveSettings({ endpoint: credential.endpoint }, request));
  });
}
