import assert from 'node:assert/strict';
import { test } from 'node:test';
import { onExecutePostLogin, type PostLoginAPI } from './verified-email-action.js';

test('verified Google email claims only; malformed/foreign providers are denied', async () => {
  for (const sample of [
    { event: { connection: { strategy: 'google-oauth2' }, user: { email: 'member@example.test', email_verified: true } }, claims: 2, denied: false },
    { event: { connection: { strategy: 'google-oauth2' }, user: { email: 'member@example.test', email_verified: false } }, claims: 0, denied: false },
    { event: { connection: { strategy: 'auth0' }, user: { email: 'member@example.test', email_verified: true } }, claims: 0, denied: true },
    { event: { connection: { strategy: 'google-oauth2' }, user: { email: 'not-email', email_verified: true } }, claims: 0, denied: true },
  ]) {
    const claims: Array<{ name: string; value: string | boolean }> = [];
    let denied = false;
    const api: PostLoginAPI = { access: { deny: () => { denied = true; } }, accessToken: { setCustomClaim: (name, value) => { claims.push({ name, value }); } } };
    await onExecutePostLogin(sample.event, api);
    assert.equal(claims.length, sample.claims);
    assert.equal(denied, sample.denied);
  }
});

import { readFileSync } from 'node:fs';
import { parseTenantConfig } from './config.js';
test('public tenant candidate has explicit resource compatibility, audiences and no secret grant', () => {
 const input: unknown=JSON.parse(readFileSync('tenant.example.json','utf8'));
 const candidate=parseTenantConfig(input);
 assert.equal(candidate.resourceParameterCompatibilityProfile,'compatibility');
 assert.notEqual(candidate.restAudience,candidate.mcpAudience);
 assert.equal(candidate.mcpTokenEndpointAuthMethod,'none');
 assert.equal(candidate.dynamicClientRegistration,false);
 assert.throws(()=>parseTenantConfig({...candidate,grantTypes:['client_credentials']}));
 assert.throws(()=>parseTenantConfig({...candidate,mcpClientRegistration:'manual-cimd'}));
 assert.throws(()=>parseTenantConfig({...candidate,clientSecret:'forbidden'}));
});

const validTenant = parseTenantConfig(JSON.parse(readFileSync('tenant.example.json', 'utf8')) as unknown);
for (const [label, fields] of [
  ['insecure issuer', { issuer: 'http://identity.example.test/' }],
  ['issuer without canonical trailing slash', { issuer: 'https://identity.example.test' }],
  ['equal REST and MCP audiences', { mcpAudience: validTenant.restAudience }],
  ['missing public web client', { webClientId: '' }],
  ['foreign human connection', { googleConnection: 'auth0' }],
  ['client credentials grant', { grantTypes: ['client_credentials'] }],
  ['extra secret grant', { grantTypes: ['authorization_code', 'client_credentials'] }],
  ['shared secret client authentication', { mcpTokenEndpointAuthMethod: 'client_secret_post' }],
  ['missing CIMD metadata', { mcpClientRegistration: 'manual-cimd', mcpClientMetadataUrl: undefined }],
  ['insecure metadata URL', { mcpClientMetadataUrl: 'http://client.example.test/client.json' }],
  ['metadata URL without a document path', { mcpClientMetadataUrl: 'https://client.example.test/' }],
  ['no callback', { webCallbackUris: [] }],
  ['no logout destination', { webLogoutUris: [] }],
  ['no MCP callback', { mcpRedirectUris: [] }],
  ['dynamic client registration', { dynamicClientRegistration: true }],
  ['unknown public configuration field', { clientSecret: 'synthetic-forbidden-test-value' }],
] as const) {
  test('tenant validation rejects ' + label, () => {
    assert.throws(() => parseTenantConfig({ ...validTenant, ...fields }));
  });
}
test('manual CIMD registration accepts its explicit HTTPS metadata document', () => {
  const input = { ...validTenant, mcpClientRegistration: 'manual-cimd', mcpClientMetadataUrl: 'https://client.example.test/client.json' };
  assert.deepEqual(parseTenantConfig(input), input);
});

for (const [label, event, expectedDenial, expectedClaims] of [
  ['missing event', undefined, true, []],
  ['missing connection', { user: { email_verified: true, email: 'member@example.test' } }, true, []],
  ['foreign connection', { connection: { strategy: 'auth0' }, user: {} }, true, []],
  ['missing user', { connection: { strategy: 'google-oauth2' } }, true, []],
  ['invalid verification type', { connection: { strategy: 'google-oauth2' }, user: { email_verified: 'true', email: 'member@example.test' } }, true, []],
  ['invalid email', { connection: { strategy: 'google-oauth2' }, user: { email_verified: true, email: 'not-email' } }, true, []],
  ['unverified email', { connection: { strategy: 'google-oauth2' }, user: { email_verified: false, email: 'member@example.test' } }, false, []],
  ['missing verification', { connection: { strategy: 'google-oauth2' }, user: { email: 'member@example.test' } }, false, []],
  ['verified flag without email', { connection: { strategy: 'google-oauth2' }, user: { email_verified: true } }, false, []],
  ['missing both optional attributes', { connection: { strategy: 'google-oauth2' }, user: {} }, false, []],
  ['verified Google email', { connection: { strategy: 'google-oauth2' }, user: { email_verified: true, email: 'member@example.test' } }, false, [
    ['https://gategoldjira.app/email', 'member@example.test'], ['https://gategoldjira.app/email_verified', true],
  ]],
] as const) {
  test('post-login action emits exact trusted claims for ' + label, async () => {
    const denials: string[] = [], claims: Array<readonly [string, string | boolean]> = [];
    const api: PostLoginAPI = {
      access: { deny: reason => { denials.push(reason); } },
      accessToken: { setCustomClaim: (name, value) => { claims.push([name, value]); } },
    };
    await onExecutePostLogin(event, api);
    assert.deepEqual(denials, expectedDenial ? ['The configured human Google connection is required.'] : []);
    assert.deepEqual(claims, expectedClaims);
  });
}
