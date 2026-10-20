import { z } from 'zod';
import { issuePageSchema, projectPageSchema, serverInputSchema, statusSchema, type ConnectionStatus } from './models.ts';

declare global { interface Window { sidecar?: { fetch: typeof fetch } } }
function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error('Missing panel element: ' + id);
  return found;
}
function input(id: string): HTMLInputElement {
  const found = element(id);
  if (!(found instanceof HTMLInputElement)) throw new Error('Missing panel input');
  return found;
}
function link(id: string): HTMLAnchorElement {
  const found = element(id);
  if (!(found instanceof HTMLAnchorElement)) throw new Error('Missing panel link');
  return found;
}
let state: ConnectionStatus | undefined;
let projectCursor: string | null = null;
let issueCursor: string | null = null;
let epoch = 0;
let busy = false;
let poll: ReturnType<typeof setTimeout> | undefined;
let loadedWorkspace = false;
function notice(message: string, error = false): void {
  element('notice').textContent = message;
  element('notice').hidden = !message;
  element('notice').classList.toggle('error', error);
}
async function api<T>(path: string, schema: z.ZodType<T>, body: unknown = {}): Promise<T> {
  if (!window.sidecar) throw new Error('Open this panel in Antigravity to connect your account.');
  const response = await window.sidecar.fetch(path, { method: 'POST', body: JSON.stringify(body) });
  const data: unknown = await response.json();
  if (!response.ok) {
    const failure = z.object({ error: z.string() }).safeParse(data);
    throw new Error(failure.success ? failure.data.error : 'The request could not be completed.');
  }
  return schema.parse(data);
}
function render(): void {
  if (!state) return;
  document.body.dataset['ready'] = 'true';
  element('connection-badge').textContent = state.connected ? 'Connected' : state.pending ? 'Awaiting sign-in' : 'Not connected';
  element('connection-badge').classList.toggle('connected', state.connected);
  element('signed-out').hidden = state.connected;
  element('signed-in').hidden = !state.connected;
  element('workspace').hidden = !state.connected;
  element('connect').hidden = state.hasCredential || state.pending;
  element('disconnect').hidden = !state.hasCredential;
  element('cancel').hidden = !state.pending;
  element('activity-link').hidden = !state.hasCredential;
  link('activity-link').href = state.settings ? new URL('/account/mcp-tokens', state.settings.website).href : '#';
  link('all-projects').href = state.settings ? new URL('/projects', state.settings.website).href : '#';
  element('setup-hint').hidden = state.settings !== null;
  element('account-name').textContent = state.account?.displayName ?? '';
  element('account-email').textContent = state.account?.email ?? '';
  for (const name of ['endpoint', 'website']) input(name).disabled = busy || state.hasCredential || state.pending;
  for (const button of document.querySelectorAll('button')) button.disabled = busy;
  const save = element('save-settings');
  if (save instanceof HTMLButtonElement) save.disabled = busy || state.hasCredential || state.pending;
  const connect = element('connect');
  if (connect instanceof HTMLButtonElement) connect.disabled = busy || !state.settings;
  const authorization = state.authorizationUrl ? new URL(state.authorizationUrl) : null;
  const valid = state.settings && authorization?.origin === new URL(state.settings.endpoint).origin && authorization?.pathname === '/oauth/authorize';
  link('authorization-link').hidden = !state.pending || !valid;
  link('authorization-link').href = valid && authorization ? authorization.href : '#';
}
async function action(run: () => Promise<void>): Promise<void> {
  if (busy) return;
  busy = true;
  render();
  try { await run(); }
  catch (error) { notice(error instanceof Error ? error.message : 'The request could not be completed.', true); }
  finally { busy = false; render(); }
}
async function refresh(): Promise<void> {
  const started = epoch;
  const next = await api('/api/status', statusSchema);
  if (started !== epoch) return;
  if (state?.account?.userId !== next.account?.userId) clearWorkspace();
  state = next;
  if (document.activeElement !== input('endpoint')) input('endpoint').value = next.settings?.endpoint ?? '';
  if (document.activeElement !== input('website')) input('website').value = next.settings?.website ?? '';
  notice(next.message);
  render();
  if (next.connected && !loadedWorkspace) {
    loadedWorkspace = true;
    const details = element('server-settings');
    if (details instanceof HTMLDetailsElement) details.open = false;
    await projects(false);
  }
  clearTimeout(poll);
  if (next.pending) poll = setTimeout(() => { void action(refresh); }, 1500);
}
function item(title: string, key: string, detail: string, path: string): HTMLElement {
  const row = document.createElement('article'); row.className = 'item';
  const label = document.createElement('span'); label.className = 'item-key'; label.textContent = key;
  const anchor = document.createElement('a'); anchor.textContent = title; anchor.href = new URL(path, state?.settings?.website).href;
  anchor.target = '_blank'; anchor.rel = 'noopener noreferrer';
  const subtitle = document.createElement('p'); subtitle.textContent = detail;
  row.append(label, anchor, subtitle); return row;
}
async function projects(more: boolean): Promise<void> {
  const started = epoch;
  const page = await api('/api/projects', projectPageSchema, more && projectCursor ? { cursor: projectCursor } : {});
  if (started !== epoch) return;
  if (!more) element('project-list').replaceChildren();
  for (const project of page.items) element('project-list').append(item(project.name, project.key, project.effectiveRole.replaceAll('_', ' '), '/backlog/' + project.id));
  projectCursor = page.nextCursor;
  element('more-projects').hidden = !projectCursor;
}
async function issues(more: boolean): Promise<void> {
  const started = epoch;
  const query = input('issue-query').value.trim();
  const page = await api('/api/issues', issuePageSchema, { query, ...(more && issueCursor ? { cursor: issueCursor } : {}) });
  if (started !== epoch) return;
  if (!more) element('issue-list').replaceChildren();
  for (const issue of page.items) element('issue-list').append(item(issue.title, issue.key, issue.status, '/issues/' + issue.id));
  issueCursor = page.nextCursor;
  element('more-issues').hidden = !issueCursor;
}
function clearWorkspace(): void {
  epoch++;
  loadedWorkspace = false;
  projectCursor = issueCursor = null;
  element('project-list').replaceChildren(); element('issue-list').replaceChildren();
  input('issue-query').value = '';
  clearTimeout(poll);
}
element('connect').addEventListener('click', () => { void action(async () => {
  const result = await api('/api/connect', z.object({ authorizationUrl: z.string().url() }));
  const url = new URL(result.authorizationUrl);
  if (!state?.settings || url.origin !== new URL(state.settings.endpoint).origin || url.pathname !== '/oauth/authorize') throw new Error('Invalid authorization address.');
  window.open(url.href, '_blank', 'noopener,noreferrer');
  await refresh();
}); });
element('disconnect').addEventListener('click', () => { void action(async () => {
  await api('/api/disconnect', z.object({ disconnected: z.literal(true) }));
  clearWorkspace(); await refresh();
}); });
element('cancel').addEventListener('click', () => { void action(async () => {
  await api('/api/cancel', z.object({ cancelled: z.literal(true) })); clearWorkspace(); await refresh();
}); });
element('refresh').addEventListener('click', () => { void action(async () => { loadedWorkspace = false; await refresh(); }); });
element('settings-form').addEventListener('submit', event => { event.preventDefault(); void action(async () => {
  const website = input('website').value.trim().replace(/\/$/, '');
  const settings = serverInputSchema.safeParse({ endpoint: input('endpoint').value, ...(website ? { website } : {}) });
  if (!settings.success) throw new Error(settings.error.issues[0]?.message ?? 'Check the server addresses.');
  await api('/api/settings', z.object({ saved: z.literal(true) }), settings.data); clearWorkspace(); await refresh(); notice('Server settings saved. You can sign in now.');
}); });
input('endpoint').addEventListener('input', () => { input('website').value = ''; });
element('search-form').addEventListener('submit', event => { event.preventDefault(); void action(() => issues(false)); });
element('more-projects').addEventListener('click', () => { void action(() => projects(true)); });
element('more-issues').addEventListener('click', () => { void action(() => issues(true)); });
for (const tab of ['projects', 'issues']) element(tab + '-tab').addEventListener('click', () => {
  for (const name of ['projects', 'issues']) {
    element(name + '-view').hidden = name !== tab;
    element(name + '-tab').setAttribute('aria-pressed', String(name === tab));
  }
});
window.addEventListener('pagehide', () => { clearWorkspace(); state = undefined; });
void action(refresh);

window.addEventListener('focus', () => { if (state && !state.pending) void action(refresh); });
