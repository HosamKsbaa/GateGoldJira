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
