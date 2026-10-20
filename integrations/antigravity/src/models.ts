import { z } from 'zod';

function serviceURL(value: string, mcp: boolean): boolean {
  try {
    const url = new URL(value);
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return (url.protocol === 'https:' || url.protocol === 'http:' && loopback)
      && !url.username && !url.password && !url.search && !url.hash
      && (mcp ? url.pathname === '/mcp' : url.pathname === '/');
  } catch { return false; }
}
export const settingsSchema = z.object({
  endpoint: z.string().max(2048).refine(value => serviceURL(value, true), 'Use an HTTPS /mcp URL, or loopback HTTP for development.'),
  website: z.string().max(2048).refine(value => serviceURL(value, false), 'Use an HTTPS website origin, or loopback HTTP for development.'),
}).strict();
export type Settings = z.infer<typeof settingsSchema>;
export const serverInputSchema = z.object({
  endpoint: z.string().trim().max(2048).transform((value, ctx) => {
    try {
      const url = new URL(value);
      if (url.pathname === '/' || url.pathname === '/mcp/') url.pathname = '/mcp';
      if (serviceURL(url.href, true)) return url.href;
    } catch { /* Report a useful validation message below. */ }
    ctx.addIssue({ code: 'custom', message: 'Use your HTTPS API address or /mcp URL. HTTP is only supported on this computer.' });
    return z.NEVER;
  }),
  website: settingsSchema.shape.website.optional(),
}).strict();
export const credentialSchema = z.object({
  sessionId: z.string().uuid(),
  endpoint: settingsSchema.shape.endpoint,
  accessToken: z.string().regex(/^gg_oauth_[A-Za-z0-9_-]{43}$/),
  refreshToken: z.string().regex(/^gg_refresh_[A-Za-z0-9_-]{43}$/),
  expiresAt: z.number().int().positive(),
}).strict();
export type Credential = z.infer<typeof credentialSchema>;
export const pendingSchema = z.object({ id: z.string().uuid(), pid: z.number().int().positive(), expiresAt: z.number() }).strict();
export const accountSchema = z.object({ userId: z.string().uuid(), displayName: z.string(), email: z.string(), administrator: z.boolean() });
export type Account = z.infer<typeof accountSchema>;
export const projectSchema = z.object({ id: z.string().uuid(), key: z.string(), name: z.string(), effectiveRole: z.string() });
export const issueSchema = z.object({ id: z.string().uuid(), key: z.string(), title: z.string(), status: z.string(), projectId: z.string().uuid() });
export const cursorSchema = z.string().max(2048).nullable();
export const projectPageSchema = z.object({ items: z.array(projectSchema).max(25), nextCursor: cursorSchema });
export const issuePageSchema = z.object({ items: z.array(issueSchema).max(25), nextCursor: cursorSchema });
// The server's canonical search works across both retained and native projects.
// Keep the panel's small presentation model while showing the actual stage name.
export const canonicalIssuePageSchema = z.object({
  items: z.array(issueSchema.omit({ status: true }).extend({
    stage: z.object({ name: z.string().min(1) }),
  })).max(25),
  nextCursor: cursorSchema,
}).transform(page => ({
  items: page.items.map(({ stage, ...issue }) => ({ ...issue, status: stage.name })),
  nextCursor: page.nextCursor,
}));
export const statusSchema = z.object({
  settings: settingsSchema.nullable(), connected: z.boolean(), hasCredential: z.boolean(), pending: z.boolean(),
  authorizationUrl: z.string().nullable(), message: z.string(), account: accountSchema.nullable(),
});
export type ConnectionStatus = z.infer<typeof statusSchema>;

export class SignInRequired extends Error {
  constructor() { super('Sign in from the GateGoldJira side panel to use your account.'); }
}
export class UserError extends Error {}
export function safeMessage(error: unknown): string {
  if (error instanceof UserError || error instanceof SignInRequired) return error.message;
  return 'GateGoldJira could not complete the request. Check the server address and try again.';
}
