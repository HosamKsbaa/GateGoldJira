import { describe, expect, it } from 'vitest';
import { parsePublicConfig } from './config.service';

const local = {
  mode: 'development',
  apiBaseUrl: '/api/v1',
  issuer: 'http://localhost:21080/development-identity/',
  clientId: 'local-development',
  audience: 'http://127.0.0.1:4200/api',
  scope: 'openid profile email gategoldjira:access',
};

describe('public configuration boundary', () => {
  it('accepts hosted password sign-in only on one HTTPS origin', () => {
    const hosted = {
      ...local, mode: 'production', authentication: 'password',
      apiBaseUrl: 'https://jira.example/api/v1', issuer: 'https://jira.example/',
      audience: 'https://jira.example/api', clientId: 'hosted-password',
    };
    expect(parsePublicConfig(hosted, 'https://jira.example').authentication).toBe('password');
    expect(() => parsePublicConfig(hosted, 'https://other.example')).toThrow();
    expect(() => parsePublicConfig({ ...hosted, issuer: 'https://other.example/' }, 'https://jira.example')).toThrow();
    expect(() => parsePublicConfig({ ...local, authentication: 'password' }, 'http://localhost:4200')).toThrow();
  });
  it('accepts the explicit local mode', () =>
    expect(parsePublicConfig(local, 'http://127.0.0.1:4200').mode).toBe('development'));
  it.each([
    { ...local, clientSecret: 'must-never-be-in-a-browser' },
    { ...local, audience: 'http://127.0.0.1:4200/mcp' },
    { ...local, apiBaseUrl: 'https://service.example/api/v1' },
    { ...local, mode: 'production' },
  ])('rejects unsafe or mixed configuration', input =>
    expect(() => parsePublicConfig(input, 'http://127.0.0.1:4200')).toThrow(),
  );
  it('accepts separate HTTPS frontend, backend and issuer', () => {
    const production = {
      ...local,
      mode: 'production',
      apiBaseUrl: 'https://api.example/api/v1',
      issuer: 'https://company.auth0.com/',
      audience: 'https://api.example/api',
      clientId: 'public-client',
    };
    expect(parsePublicConfig(production, 'https://app.example').mode).toBe('production');
  });
});
