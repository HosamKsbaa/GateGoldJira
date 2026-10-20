import { z } from 'zod';

export const tenantSchema = z.strictObject({
  issuer: z.url().refine((url) => url.startsWith('https://') && url.endsWith('/')),
  restAudience: z.url(),
  mcpAudience: z.url(),
  requiredScope: z.literal('gategoldjira:access'),
  googleConnection: z.literal('google-oauth2'),
  webClientId: z.string().min(1),
  webOrigin: z.url(),
  resourceParameterCompatibilityProfile: z.literal('compatibility'),
  mcpClientRegistration: z.enum(['manual-public-client', 'manual-cimd']),
  mcpClientId: z.string().min(1),
  mcpClientMetadataUrl: z.url().refine(url => url.startsWith('https://') && new URL(url).pathname !== '/').optional(),
  mcpTokenEndpointAuthMethod: z.literal('none'),
  grantTypes: z.tuple([z.literal('authorization_code')]),
  signingAlgorithm: z.literal('RS256'),
  webCallbackUris: z.array(z.url()).min(1),
  webLogoutUris: z.array(z.url()).min(1),
  mcpRedirectUris: z.array(z.url()).min(1),
  dynamicClientRegistration: z.literal(false),
}).refine((config) => config.restAudience !== config.mcpAudience, 'REST and MCP audiences must be distinct')
.refine(config => config.mcpClientRegistration !== 'manual-cimd' || config.mcpClientMetadataUrl !== undefined, 'Manual CIMD registration needs the client metadata URL');

export type TenantConfig = z.infer<typeof tenantSchema>;
export function parseTenantConfig(value: unknown): TenantConfig { return tenantSchema.parse(value); }
