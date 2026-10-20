import { z } from 'zod';

const eventSchema = z.object({
  connection: z.object({ strategy: z.literal('google-oauth2') }),
  user: z.object({ email: z.email().max(320).optional(), email_verified: z.boolean().optional() }),
});

export interface PostLoginAPI {
  access: { deny(reason: string): void };
  accessToken: { setCustomClaim(name: string, value: string | boolean): void };
}

/** Validate managed-provider data before exposing trusted first-binding claims. */
export async function onExecutePostLogin(event: unknown, api: PostLoginAPI): Promise<void> {
  const parsed = eventSchema.safeParse(event);
  if (!parsed.success) {
    api.access.deny('The configured human Google connection is required.');
    return;
  }
  if (parsed.data.user.email_verified === true && parsed.data.user.email !== undefined) {
    api.accessToken.setCustomClaim('https://gategoldjira.app/email', parsed.data.user.email);
    api.accessToken.setCustomClaim('https://gategoldjira.app/email_verified', true);
  }
}
