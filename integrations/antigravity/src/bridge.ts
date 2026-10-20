import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ToolSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { runtime } from './runtime.ts';
import { safeMessage } from './models.ts';
import { registerPanel } from './panel-preference.ts';

const root = dirname(fileURLToPath(import.meta.url));
const { client, store } = await runtime(root);
try { await registerPanel(store); }
catch { console.error('GateGoldJira: enable its side panel in Antigravity Settings → Customizations → Sidecars, then reload.'); }
const catalog = z.object({ tools: z.record(z.string(), ToolSchema) }).parse(JSON.parse(readFileSync(join(root, 'mcp-tools.json'), 'utf8')));
const tools = Object.values(catalog.tools);
const server = new Server({ name: 'GateGoldJira', version: '1.1.0' }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
server.setRequestHandler(CallToolRequestSchema, async request => {
  if (!catalog.tools[request.params.name]) return { isError: true, content: [{ type: 'text', text: 'Unknown GateGoldJira tool.' }] };
  try { return await client.call(request.params.name, request.params.arguments ?? {}); }
  catch (error) { return { isError: true, content: [{ type: 'text', text: safeMessage(error) }] }; }
});
await server.connect(new StdioServerTransport());
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
  void client.close().finally(() => { void server.close().finally(() => process.exit()); });
});
