import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { BrowserOAuth } from './oauth.ts';
import { accountSchema, canonicalIssuePageSchema, projectPageSchema, UserError } from './models.ts';

export class GateGoldClient {
  private client?: Promise<Client>;
  private endpoint = '';
  constructor(readonly oauth: BrowserOAuth) {}
  private async connected(): Promise<Client> {
    const settings = await this.oauth.store.requireSettings();
    if (settings.endpoint !== this.endpoint) await this.close();
    this.endpoint = settings.endpoint;
    if (!this.client) {
      const client = new Client({ name: 'GateGoldJira Antigravity plugin', version: '1.1.0' });
      this.client = client.connect(new StreamableHTTPClientTransport(new URL(settings.endpoint), { fetch: this.oauth.authorizedFetch }))
        .then(() => client).catch(error => { this.client = undefined; throw error; });
    }
    return this.client;
  }
  async call(name: string, args: Record<string, unknown>): Promise<CallToolResult> {
    const client = await this.connected();
    return CallToolResultSchema.parse(await client.callTool({ name, arguments: args }));
  }
  private async data<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
    const result = await this.call(name, args);
    const envelope = z.object({ ok: z.boolean(), data: z.unknown(), error: z.unknown().nullable().optional() }).parse(result.structuredContent);
    if (!envelope.ok || result.isError) throw new UserError('Your account could not read this information. Check your permissions or sign in again.');
    return schema.parse(envelope.data);
  }
  me() { return this.data('get_me', {}, accountSchema); }
  projects(cursor?: string) {
    return this.data('list_projects', { page: { limit: 25, ...(cursor ? { cursor } : {}) } }, projectPageSchema);
  }
  issues(query: string, projectId?: string, cursor?: string) {
    return this.data('search_issues_v2', { filters: { ...(query ? { query } : {}), ...(projectId ? { projectIds: [projectId] } : {}), sort: 'updated' }, page: { limit: 25, ...(cursor ? { cursor } : {}) } }, canonicalIssuePageSchema);
  }
  async close(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    if (client) await (await client.catch(() => undefined))?.close();
  }
}
