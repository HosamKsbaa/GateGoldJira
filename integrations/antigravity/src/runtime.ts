import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { settingsSchema } from './models.ts';
import { BrowserOAuth } from './oauth.ts';
import { PrivateStore } from './store.ts';
import { GateGoldClient } from './mcp.ts';
import { restoreLegacySettings } from './server-settings.ts';
import { safeMessage } from './models.ts';

export async function runtime(root = dirname(fileURLToPath(import.meta.url))) {
  const defaults = settingsSchema.nullable().parse(JSON.parse(readFileSync(join(root, 'connection.json'), 'utf8')));
  const store = new PrivateStore(PrivateStore.userDirectory(), defaults);
  const oauth = new BrowserOAuth(store);
  try { await restoreLegacySettings(store); }
  catch (error) { oauth.message = safeMessage(error); }
  return { store, oauth, client: new GateGoldClient(oauth) };
}
