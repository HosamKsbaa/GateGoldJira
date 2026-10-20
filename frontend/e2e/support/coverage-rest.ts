import { expect, type APIRequestContext, type APIResponse } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { z } from 'zod';
import * as generated from '../../src/app/api/generated/zod.gen';
import { apiOrigin, token } from './session';
import { useCase } from './use-case';
import { test } from './browser-test';

const reference = z.object({ $ref: z.string() }).passthrough();
const parameter = z.object({ in: z.enum(['path', 'query', 'header', 'cookie']), name: z.string(), required: z.boolean().optional(), explode: z.boolean().optional() }).passthrough();
const media = z.object({ schema: z.unknown() }).passthrough();
const operation = z.object({ operationId: z.string(), parameters: z.array(parameter).optional(), requestBody: z.object({ content: z.record(z.string(), media) }).optional(), responses: z.record(z.string(), z.object({ content: z.record(z.string(), media).optional() }).passthrough()) }).passthrough();
const document = z.object({ paths: z.record(z.string(), z.record(z.string(), z.unknown())) });
const openApi = document.parse(JSON.parse(readFileSync(new URL('../../../backend/api/openapi.json', import.meta.url), 'utf8')));
const operations = new Map<string, { path: string; method: string; definition: z.output<typeof operation> }>();
for (const [path, item] of Object.entries(openApi.paths)) for (const [method, candidate] of Object.entries(item)) {
  if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
  const parsed = operation.parse(candidate);
  if (operations.has(parsed.operationId)) throw new Error('Duplicate OpenAPI operation ' + parsed.operationId);
  operations.set(parsed.operationId, { path, method: method.toUpperCase(), definition: parsed });
}
const catalog = z.object({ cases: z.array(z.object({ id: z.string(), surfaces: z.array(z.string()) })) }).parse(JSON.parse(readFileSync(new URL('../../../docs/use-cases/catalog.json', import.meta.url), 'utf8')));
const restCases = new Set(catalog.cases.filter(value => value.surfaces.includes('rest')).map(value => value.id));

/** Runs the same real business assertions but never credits a surface absent from the catalog. */
export function restCase<T>(id: string, body: () => Promise<T>): Promise<T> {
  return restCases.has(id) ? useCase(id, body, 'rest') : test.step('Uncredited REST business assertion for ' + id, body);
}
export const hasRestCase = (id: string) => restCases.has(id);

function queryValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value === null) return 'null';
  return JSON.stringify(value);
}

export function restPlan(name: string, args: object) {
  const found = operations.get(name);
  if (!found) throw new Error('No published HTTP operation for ' + name);
  const fields: Record<string, unknown> = { ...args }, headers: Record<string, string> = {};
  let path = found.path;
  const parameters = found.definition.parameters ?? [];
  for (const input of parameters.filter(value => value.in === 'path')) {
    const value = fields[input.name];
    if (value === undefined) throw new Error('Missing HTTP path argument ' + input.name + ' for ' + name);
    path = path.replace('{' + input.name + '}', encodeURIComponent(queryValue(value))); delete fields[input.name];
  }
  if (/\{[^}]+\}/.test(path)) throw new Error('Unresolved HTTP path for ' + name);
  const retryHeader = parameters.find(value => value.in === 'header' && value.name.toLowerCase() === 'idempotency-key');
  if (retryHeader && fields['retryReference'] !== undefined) { headers[retryHeader.name] = queryValue(fields['retryReference']); delete fields['retryReference']; }
  const query = new URLSearchParams(), queryParameters = parameters.filter(value => value.in === 'query');
  const content = found.definition.requestBody?.content;
  // MCP groups cursor/limit into page for query endpoints. JSON search commands
  // retain their nested page exactly, including intentionally malformed fields.
  if (!content && queryParameters.length && fields['page'] !== undefined) {
    const page: unknown = fields['page'];
    if (page === null || typeof page !== 'object' || Array.isArray(page)) throw new Error('Cannot flatten a nonobject HTTP query page for ' + name);
    delete fields['page'];
    for (const [key, value] of Object.entries(page)) {
      if (Object.hasOwn(fields, key)) throw new Error('Ambiguous top-level/page HTTP argument ' + key);
      fields[key] = value;
    }
  }
  for (const input of queryParameters) {
    const value = fields[input.name]; if (value === undefined) continue;
    if (Array.isArray(value)) { if (input.explode) for (const part of value) query.append(input.name, queryValue(part)); else query.set(input.name, value.map(queryValue).join(',')); }
    else query.set(input.name, queryValue(value));
    delete fields[input.name];
  }
  if (content && !content['application/json']) throw new Error('HTTP multipart operation requires an explicit binary adapter: ' + name);
  // Preserve unknown JSON body properties. Filtering by schema here would turn a
  // deliberate invalid request into a valid one and conceal server validation.
  const sendBody = !!content || (Object.keys(fields).length > 0 && !queryParameters.length && found.method !== 'GET');
  const body = sendBody ? fields : undefined;
  if ((!content && queryParameters.length > 0) || found.method === 'GET') for (const [key, value] of Object.entries(fields)) if (value !== undefined) query.set(key, queryValue(value));
  return { ...found, headers, body, url: apiOrigin + path + (query.size ? '?' + query.toString() : '') };
}

export async function restCall(request: APIRequestContext, name: string, args: object = {}, role = 'owner'): Promise<APIResponse> {
  const plan = restPlan(name, args);
  return request.fetch(plan.url, { method: plan.method, headers: { Authorization: 'Bearer ' + await token(role), ...plan.headers }, ...(plan.body === undefined ? {} : { data: plan.body }) });
}
function validatePublished(name: string, response: APIResponse, body: unknown): void {
  const entry = operations.get(name)!;
  const declared = entry.definition.responses[String(response.status())];
  expect(declared, name + ' must publish its actual HTTP status ' + response.status()).toBeDefined();
  const shape = declared?.content?.['application/json']?.schema;
  if (shape === undefined) throw new Error('No published JSON response schema for ' + name + '/' + response.status());
  const ref = reference.parse(shape).$ref;
  if (!ref.startsWith('#/components/schemas/')) throw new Error('Unsupported HTTP response reference for ' + name);
  const exportName = 'z' + ref.slice('#/components/schemas/'.length);
  const schema: unknown = Reflect.get(generated, exportName);
  if (!(schema instanceof z.ZodType)) throw new Error('Missing generated HTTP schema ' + exportName);
  schema.parse(body);
}

export async function restSuccess<S extends z.ZodType>(request: APIRequestContext, name: string, args: object, schema: S, role = 'owner'): Promise<z.output<S>> {
  const response = await restCall(request, name, args, role), status = response.status();
  const expected = Object.keys(operations.get(name)!.definition.responses).filter(value => /^2\d\d$/.test(value)).map(Number);
  expect(expected, name + ' actual HTTP success status').toContain(status);
  expect(response.headers()['content-type'], name).toMatch(/^application\/(?:problem\+)?json(?:;|$)/);
  const body: unknown = await response.json(); validatePublished(name, response, body); return schema.parse(body);
}
const failureStatuses: Record<string, number> = { authentication_required: 401, account_inactive: 403, forbidden: 403, unavailable_record: 404, validation_failed: 422, conflict: 409, prerequisite_unfinished: 409, retry_reference_reused: 409, temporarily_unavailable: 503 };
export async function restFailure<S extends z.ZodType>(request: APIRequestContext, name: string, args: object, schema: S, code: string, role = 'owner'): Promise<z.output<S>> {
  const response = await restCall(request, name, args, role), expected = failureStatuses[code];
  if (expected === undefined) throw new Error('No explicit expected HTTP failure status for ' + code);
  expect(response.status(), name + ' HTTP failure status for ' + code).toBe(expected);
  expect(response.headers()['content-type'], name).toMatch(/^application\/(?:problem\+)?json(?:;|$)/);
  const body: unknown = await response.json(); validatePublished(name, response, body);
  const failure = z.object({ error: generated.zFailure }).parse(body); expect(failure.error.code).toBe(code);
  return schema.parse(body);
}
