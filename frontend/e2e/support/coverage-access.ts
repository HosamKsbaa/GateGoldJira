import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { z } from 'zod';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { apiOrigin, token } from './session';
import { zPageUserView, zFailure } from '../../src/app/api/generated/zod.gen';

export const memberId = '10000000-0000-4000-8000-000000000002';
export const viewerId = '10000000-0000-4000-8000-000000000003';
export const ownerId = '10000000-0000-4000-8000-000000000001';
export const disabledId = '10000000-0000-4000-8000-000000000004';

// Move only the owning test's newly issued credential across a real clock boundary.
// This helper cannot target a development/company database or accept arbitrary SQL.
export async function expireFixtureOAuth(connectionId: string, boundary: 'access' | 'refresh'): Promise<void> {
  const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
  if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(connectionId)) throw new Error('Credential clock controls require an isolated browser database and owned connection.');
  const assignment = boundary === 'access' ? "access_expires_at=now()-interval '1 second'" : "metadata=jsonb_set(metadata,'{RefreshCreateAt}',to_jsonb('" + new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString() + "'::text))";
  const sql = "UPDATE mcp_oauth_credentials SET " + assignment + " WHERE connection_id='" + connectionId + "' AND refresh_hash IS NOT NULL AND NOT refresh_used;";
  const result = await promisify(execFile)('docker', ['compose', '-f', resolve('../compose.dev.yaml'), 'exec', '-T', 'postgres', 'psql', '--username=gategoldjira', '--dbname=' + database, '-v', 'ON_ERROR_STOP=1', '-c', sql]);
  expect(result.stdout.trim()).toBe('UPDATE 1');
}

export async function prepareFixtureReminderExclusion(issueId: string, today: string, kind: 'archived_issue' | 'archived_project'): Promise<void> {
  const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
  if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database) || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(issueId) || !/^\d{4}-\d{2}-\d{2}$/.test(today)) throw new Error('Archived reminder preconditions require an isolated browser database, company date and owned issue.');
  // The worker supports retained archived issue rows; no public archive command exists.
  const sql = "UPDATE issues SET due_date='" + today + "'::date" + (kind === 'archived_issue' ? ',archived=true' : '') + " WHERE id='" + issueId + "'" + (kind === 'archived_project' ? ' AND EXISTS(SELECT 1 FROM projects WHERE projects.id=issues.project_id AND archived_at IS NOT NULL)' : '') + ';';
  const result = await promisify(execFile)('docker', ['compose', '-f', resolve('../compose.dev.yaml'), 'exec', '-T', 'postgres', 'psql', '--username=gategoldjira', '--dbname=' + database, '-v', 'ON_ERROR_STOP=1', '-c', sql]);
  expect(result.stdout.trim()).toBe('UPDATE 1');
}

export async function authorization(role = 'owner', reference: string = crypto.randomUUID()) {
  return {
    Authorization: 'Bearer ' + (await token(role)),
    'Idempotency-Key': reference,
  };
}

export async function read<S extends z.ZodType>(
  request: APIRequestContext,
  path: string,
  schema: S,
  role = 'owner',
): Promise<z.output<S>> {
  const response = await request.get(apiOrigin + path, { headers: await authorization(role) });
  expect(response.status(), path).toBe(200);
  return schema.parse(await response.json());
}

export async function allCompanyUsers(request: APIRequestContext) {
  const users: z.infer<typeof zPageUserView>['items'] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await read(request, '/api/v1/admin/users?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), zPageUserView);
    users.push(...page.items); cursor = page.nextCursor ?? undefined;
    if (cursor) { expect(cursors.has(cursor)).toBe(false); cursors.add(cursor); }
  } while (cursor);
  return users;
}

export async function save<T>(
  request: APIRequestContext,
  path: string,
  body: object,
  schema: z.ZodType<T>,
  options: { method?: 'POST' | 'PUT'; role?: string; reference?: string; status?: number } = {},
): Promise<T> {
  const response = await request.fetch(apiOrigin + path, {
    method: options.method ?? 'PUT',
    headers: await authorization(options.role, options.reference),
    data: body,
  });
  expect(response.status(), path).toBe(options.status ?? 200);
  return schema.parse(await response.json());
}

export async function rejected(
  response: APIResponse,
  status: number,
  message: RegExp,
): Promise<void> {
  expect(response.status()).toBe(status);
  // Both transport and service failures use the published safe envelope.
  const failure = z.object({ error: z.object({ code: z.string(), message: z.string(),
    fieldErrors: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  }) })
    .parse(await response.json());
  expect([failure.error.code, failure.error.message, ...(failure.error.fieldErrors ?? []).map(v => v.field + ': ' + v.message)].join('\n')).toMatch(message);
}

export async function callTool(
  request: APIRequestContext,
  name: string,
  args: object = {},
  bearer?: string,
) {
  return request.post(apiOrigin + '/mcp', {
    headers: {
      Authorization: 'Bearer ' + (bearer ?? (await token('owner', 'mcp'))),
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
    },
    data: {
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name, arguments: args },
    },
  });
}

export async function mcpSuccess<S extends z.ZodType>(request: APIRequestContext, name: string, args: object, schema: S, role = 'owner'): Promise<z.output<S>> {
  const response = await callTool(request, name, args, await token(role, 'mcp'));
  expect(response.status(), name).toBe(200);
  const raw: unknown = await response.json();
  const failed = z.object({ result: z.object({ isError: z.literal(true), structuredContent: z.object({ ok: z.literal(false), data: z.null(), error: z.object({ error: zFailure }) }) }) }).safeParse(raw);
  if (failed.success) {
    const failure = failed.data.result.structuredContent.error.error;
    // Do not print arguments, resource content or credentials when setup fails.
    throw new Error('MCP tool ' + name + ' unexpectedly returned ' + failure.code + ' (' + failure.nextAction + ').');
  }
  const envelope = z.object({ ok: z.literal(true), data: z.unknown(), error: z.null() });
  const reply = z.object({ jsonrpc: z.literal('2.0'), id: z.literal(1), result: z.object({ isError: z.literal(false).optional(), structuredContent: envelope, content: z.array(z.object({ type: z.literal('text'), text: z.string() })).min(1) }) }).parse(raw);
  const text: unknown = JSON.parse(reply.result.content[0]!.text);
  const data = schema.parse(reply.result.structuredContent.data);
  const textData: unknown = schema.parse(envelope.parse(text).data);
  expect(textData).toEqual(data);
  return data;
}

export async function mcpFailure<S extends z.ZodType>(request: APIRequestContext, name: string, args: object, schema: S, code: string, role = 'owner'): Promise<z.output<S>> {
  const response = await callTool(request, name, args, await token(role, 'mcp'));
  expect(response.status(), name).toBe(200);
  const reply = z.object({ jsonrpc: z.literal('2.0'), id: z.literal(1), result: z.object({ isError: z.literal(true), structuredContent: z.object({ ok: z.literal(false), data: z.null(), error: z.unknown() }), content: z.array(z.object({ type: z.literal('text'), text: z.string().min(1) })).min(1) }) }).parse(await response.json());
  const data = schema.parse(reply.result.structuredContent.error);
  const failure = z.object({ error: z.object({ code: z.string(), message: z.string() }) }).parse(data);
  expect(failure.error.code).toBe(code);
  expect(reply.result.content.map(item => item.text).join('\n')).toContain(failure.error.message);
  return data;
}
