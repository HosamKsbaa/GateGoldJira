import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { GateGoldClient } from '../src/mcp.ts';
import { BrowserOAuth } from '../src/oauth.ts';
import { PrivateStore } from '../src/store.ts';
import { UserError } from '../src/models.ts';

class SearchClient extends GateGoldClient {
  readonly calls: { name: string; args: Record<string, unknown> }[] = [];
  constructor(readonly reply: CallToolResult) {
    super(new BrowserOAuth(new PrivateStore('/unused-private-search-fixture', null)));
  }
  override async call(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    this.calls.push({ name, args });
    return this.reply;
  }
}

function nativeIssue(title: string, stage: string, projectId = randomUUID()) {
  return { id: randomUUID(), key: 'TEST-1', title, projectId, stage: { id: randomUUID(), name: stage, category: 'review' } };
}
function reply(items: object[], nextCursor: string | null = null): CallToolResult {
  return { content: [], structuredContent: { ok: true, data: { items, nextCursor }, error: null } };
}

test('native issue search uses the canonical tool, exact project scope, query and opaque cursor', async () => {
  const projectId = randomUUID(), issue = nativeIssue('مهمة عربية', 'Ready to deploy · جاهز', projectId);
  const client = new SearchClient(reply([issue], 'next-page'));
  const result = await client.issues('42', projectId, 'previous-page');
  assert.deepEqual(client.calls, [{ name: 'search_issues_v2', args: { filters: { query: '42', projectIds: [projectId], sort: 'updated' }, page: { limit: 25, cursor: 'previous-page' } } }]);
  assert.deepEqual(result, { items: [{ id: issue.id, key: issue.key, title: issue.title, projectId, status: 'Ready to deploy · جاهز' }], nextCursor: 'next-page' });
});

test('mixed retained/native results retain every issue and their actual stage names', async () => {
  const retained = nativeIssue('Retained task', 'To do'), native = nativeIssue('Native task', 'Quality assurance');
  const client = new SearchClient(reply([retained, native]));
  const result = await client.issues('shared title');
  assert.deepEqual(result.items.map(issue => ({ title: issue.title, status: issue.status })), [
    { title: 'Retained task', status: 'To do' }, { title: 'Native task', status: 'Quality assurance' },
  ]);
  assert.deepEqual(client.calls[0]?.args, { filters: { query: 'shared title', sort: 'updated' }, page: { limit: 25 } });
});

test('empty search omits query and stale project/cursor choices', async () => {
  const client = new SearchClient(reply([]));
  assert.deepEqual(await client.issues(''), { items: [], nextCursor: null });
  assert.deepEqual(client.calls[0]?.args, { filters: { sort: 'updated' }, page: { limit: 25 } });
});

test('malformed native results fail validation instead of silently dropping records or using a legacy fallback', async () => {
  const client = new SearchClient(reply([{ id: randomUUID(), key: 'TEST-1', title: 'Missing stage', projectId: randomUUID(), status: 'todo' }]));
  await assert.rejects(() => client.issues('Missing stage'));
  assert.deepEqual(client.calls.map(call => call.name), ['search_issues_v2']);
});

test('permission failures remain errors and do not retry through the incompatible legacy search', async () => {
  const client = new SearchClient({ content: [], isError: true, structuredContent: { ok: false, data: null, error: { code: 'forbidden' } } });
  await assert.rejects(() => client.issues('private'), UserError);
  assert.deepEqual(client.calls.map(call => call.name), ['search_issues_v2']);
});
