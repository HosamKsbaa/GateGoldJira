import * as z from 'zod';

const publicConfigSchema = z.strictObject({
  mode: z.enum(['development', 'production']),
  authentication: z.enum(['oidc', 'password']).optional(),
  apiBaseUrl: z.string().min(1),
  issuer: z.url(),
  clientId: z.string().min(1).max(200),
  audience: z.url(),
  scope: z.literal('openid profile email gategoldjira:access'),
});
export type PublicConfig = z.infer<typeof publicConfigSchema>;
export const isLoopback = (host: string): boolean =>
  ['localhost', '127.0.0.1', '[::1]'].includes(host);

export function parsePublicConfig(input: unknown, appOrigin: string): PublicConfig {
  const config = publicConfigSchema.parse(input);
  const app = new URL(appOrigin);
  const api = new URL(config.apiBaseUrl, app);
  const issuer = new URL(config.issuer);
  const audience = new URL(config.audience);
  if (
    api.pathname !== '/api/v1' ||
    api.search ||
    api.hash ||
    api.username ||
    api.password ||
    (config.mode === 'production' && audience.origin !== api.origin) ||
    audience.pathname !== '/api' ||
    audience.search ||
    audience.hash ||
    audience.username ||
    audience.password ||
    issuer.username ||
    issuer.password ||
    issuer.search ||
    issuer.hash
  ) {
    throw new Error('Invalid public service configuration.');
  }
  if (config.mode === 'development') {
    if (![app, api, issuer, audience].every(url => isLoopback(url.hostname))) {
      throw new Error('Local identities require a loopback application and services.');
    }
  } else if (
    ![app, api, issuer, audience].every(url => url.protocol === 'https:') ||
    issuer.pathname !== '/'
  ) {
    throw new Error('Production requires HTTPS and a canonical identity issuer.');
  }
  if (config.authentication === 'password' &&
      (config.mode !== 'production' || app.origin !== api.origin || issuer.origin !== api.origin)) {
    throw new Error('Hosted password sign-in requires one HTTPS application and service origin.');
  }
  return config;
}

export async function loadPublicConfig(appOrigin: string): Promise<PublicConfig> {
  const path = isLoopback(new URL(appOrigin).hostname)
    ? '/config.local.json'
    : '/config.production.json';
  const response = await fetch(path, { cache: 'no-store', credentials: 'omit' });
  if (!response.ok) throw new Error('Public configuration is unavailable.');
  const input: unknown = await response.json();
  return parsePublicConfig(input, appOrigin);
}

export class ConfigService {
  readonly value: PublicConfig;
  constructor(value: PublicConfig) {
    this.value = value;
  }
  get apiOrigin(): string {
    return new URL(this.value.apiBaseUrl, window.location.origin).origin;
  }
}
