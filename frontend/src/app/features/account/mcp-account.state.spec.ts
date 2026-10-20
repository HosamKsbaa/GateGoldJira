// Public account models and typed transport ports; no installed-host acceptance claim.
import '@angular/compiler';
import { provideZonelessChangeDetection, RendererFactory2, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatedToken, Me, OAuthConsent, TokenActivityPage, TokenList, TokenView } from '../../api/generated/types.gen';
import { createApiClient } from '../../core/api/client';
import { ApiError } from '../../core/api/api-result';
import { AuthService } from '../../core/auth/auth.service';
import { McpTokensApi } from './mcp-tokens.api';
import { McpTokensPage } from './mcp-tokens.page';
import { McpAuthorizePage } from './mcp-authorize.page';
import { mcpOAuthConfig, mcpRemotePackage } from './mcp-connection-config';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
const owner: Me = { userId: '10000000-0000-4000-8000-000000000001', displayName: 'Owner', email: 'owner@example.test', administrator: true, companyTimeZone: 'Africa/Cairo' };
const sampleToken = (id = 'token-1', extra: Partial<TokenView> = {}): TokenView => ({ id, name: id, kind: 'personal', prefix: 'gg_test', createdAt: '2026-10-20T00:00:00Z', lastUsedAt: null, revokedAt: null, expiresAt: null, ...extra });
const listing = (items = [sampleToken()]): TokenList => ({ endpoint: 'https://jira.example.test/mcp', oauthClientId: 'public-browser-client', activeLimit: 10, items });
const created = (id = 'new-token'): CreatedToken => ({ token: 'synthetic-one-time-test-credential', details: sampleToken(id) });
const error = () => new ApiError({ error: { code: 'temporarily_unavailable', message: 'Try again shortly.', retryable: true, nextAction: 'retry_same_reference', fieldErrors: [] }, current: null, unfinished: null }, 503);
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }
function framework() {
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
    { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('Account model tests do not render components.'); } } },
    { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
  ] });
}
beforeEach(() => {
  vi.stubGlobal('window', { location: { assign: vi.fn<(url: string) => void>() } });
  vi.stubGlobal('document', { getElementById: () => null });
  vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn<(text: string) => Promise<void>>().mockResolvedValue() } });
});
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

describe('personal MCP token management public state', () => {
  const epoch = signal(1), me = signal<Me | null>(owner);
  const list = vi.fn<McpTokensApi['list']>(), create = vi.fn<McpTokensApi['create']>();
  const revoke = vi.fn<McpTokensApi['revoke']>(), activity = vi.fn<McpTokensApi['activity']>();
  let page: McpTokensPage;
  beforeEach(() => {
    epoch.set(1); me.set(owner);
    for (const port of [list, create, revoke, activity]) port.mockReset();
    list.mockResolvedValue(listing()); activity.mockResolvedValue({ items: [], nextCursor: null });
    framework();
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { sessionEpoch: epoch, me } satisfies Pick<AuthService, 'sessionEpoch' | 'me'> },
      { provide: McpTokensApi, useValue: { list, create, revoke, activity } satisfies Pick<McpTokensApi, 'list' | 'create' | 'revoke' | 'activity'> },
    ] });
    page = TestBed.runInInjectionContext(() => new McpTokensPage()); TestBed.tick();
  });
  async function loaded() { await vi.waitFor(() => expect(page.listing()?.items).toHaveLength(1)); }

  it('loads a signed-in account and counts only currently active credentials', async () => {
    await loaded();
    page.listing.set(listing([sampleToken(), sampleToken('revoked', { revokedAt: '2026-10-19T00:00:00Z' }), sampleToken('expired', { expiresAt: '2000-01-01T00:00:00Z' })]));
    expect(page.activeCount()).toBe(1);
    expect(page.status(sampleToken('future', { expiresAt: '2099-01-01T00:00:00Z' }))).toBe('Active');
    expect(page.status(sampleToken('revoked-and-expired', { revokedAt: '2026-01-01T00:00:00Z', expiresAt: '2000-01-01T00:00:00Z' }))).toBe('Revoked');
  });
  it('rejects empty, whitespace-only and oversized token names before creating a credential', async () => {
    await loaded();
    for (const name of ['', '   ', 'x'.repeat(81)]) { page.form.controls.name.setValue(name); await page.create(); }
    expect(create).not.toHaveBeenCalled(); expect(page.created()).toBeNull();
  });
  it('creates a trimmed credential once, limits displayed history and clears its private value on dismissal', async () => {
    await loaded(); page.listing.set(listing(Array.from({ length: 100 }, (_, i) => sampleToken(String(i)))));
    create.mockResolvedValue(created()); page.form.controls.name.setValue('  Build assistant  ');
    await page.create();
    expect(create).toHaveBeenCalledExactlyOnceWith({ name: 'Build assistant' });
    expect(page.created()?.token).toBe(created().token); expect(page.showToken()).toBe(false);
    expect(page.listing()?.items).toHaveLength(100); expect(page.listing()?.items[0]?.id).toBe('new-token');
    expect(page.form.controls.name.value).toBe(''); expect(page.notice()).toContain('only be shown once');
    page.form.controls.name.setValue('Second'); await page.create(); expect(create).toHaveBeenCalledOnce();
    page.showToken.set(true); page.dismiss(); expect(page.created()).toBeNull(); expect(page.showToken()).toBe(false);
    expect(page.notice()).toContain('revoke it');
  });
  it('contains a failed list request and permits explicit recovery', async () => {
    await loaded(); list.mockRejectedValueOnce(error()); await page.load();
    expect(page.state.failure()?.status).toBe(503); expect(page.state.busy()).toBe(false);
    list.mockResolvedValueOnce(listing([sampleToken('replacement')])); await page.load();
    expect(page.state.failure()).toBeNull(); expect(page.listing()?.items[0]?.id).toBe('replacement');
  });
  it('does not expose a credential that finishes creating after the account changes', async () => {
    await loaded(); const pending = deferred<CreatedToken>(); create.mockReturnValueOnce(pending.promise);
    page.form.controls.name.setValue('Old account'); const saving = page.create();
    me.set(null); epoch.set(2); TestBed.tick();
    expect(page.listing()).toBeNull(); expect(page.created()).toBeNull(); expect(page.form.controls.name.value).toBe('');
    pending.resolve(created()); await saving;
    expect(page.created()).toBeNull(); expect(page.notice()).toBe(''); expect(page.state.busy()).toBe(false);
  });
  it('copies only the requested one-time credential or typed configuration and handles denied clipboard access', async () => {
    await loaded(); const clipboard = vi.mocked(navigator.clipboard.writeText);
    await page.copy('token'); expect(clipboard).not.toHaveBeenCalled();
    page.created.set(created()); await page.copy('token'); expect(clipboard).toHaveBeenLastCalledWith(created().token); expect(page.notice()).toBe('Token copied.');
    await page.copy('config');
    expect(JSON.parse(clipboard.mock.calls.at(-1)![0])).toEqual({ mcpServers: { gategoldjira: { serverUrl: listing().endpoint, headers: { Authorization: 'Bearer ' + created().token } } } });
    clipboard.mockRejectedValueOnce(new Error('Clipboard denied')); await page.copy('token'); expect(page.notice()).toContain('Clipboard access is unavailable');
  });
  it('copies the pinned browser OAuth proxy configuration without including a personal token', async () => {
    await loaded(); await page.copyOAuthConfig();
    const value = vi.mocked(navigator.clipboard.writeText).mock.calls[0]![0];
    expect(JSON.parse(value)).toEqual(mcpOAuthConfig(listing().endpoint, listing().oauthClientId!));
    expect(value).not.toContain(created().token); expect(page.notice()).toContain('OAuth configuration copied');
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error('denied')); await page.copyOAuthConfig();
    expect(page.notice()).toContain('Allow clipboard access');
  });
  it('does not copy missing OAuth metadata or restore a clipboard notice after sign-out', async () => {
    await loaded(); page.listing.set({ ...listing(), oauthClientId: null }); await page.copyOAuthConfig();
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    page.listing.set(listing()); const held = deferred<void>(); vi.mocked(navigator.clipboard.writeText).mockReturnValueOnce(held.promise);
    const copying = page.copyOAuthConfig(); me.set(null); epoch.set(2); TestBed.tick(); held.resolve(); await copying;
    expect(page.notice()).toBe('');
  });
  it('revokes a displayed credential, hides its one-time secret and keeps unrelated tokens', async () => {
    await loaded(); page.listing.set(listing([created().details, sampleToken('other')])); page.created.set(created()); page.confirming.set('new-token');
    revoke.mockResolvedValue({ ...created().details, revokedAt: '2026-10-20T01:00:00Z' }); await page.revoke(created().details);
    expect(revoke).toHaveBeenCalledExactlyOnceWith('new-token'); expect(page.created()).toBeNull(); expect(page.confirming()).toBeNull();
    expect(page.listing()?.items[0]?.revokedAt).not.toBeNull(); expect(page.listing()?.items[1]?.id).toBe('other'); expect(page.notice()).toContain('can no longer connect');
  });
  it('loads activity pages only when selected and an older cursor exists', async () => {
    await loaded(); await page.loadActivity(); expect(activity).not.toHaveBeenCalled();
    activity.mockResolvedValueOnce({ items: [], nextCursor: 'older-page' }); page.openActivity(sampleToken());
    await vi.waitFor(() => expect(page.activity()?.nextCursor).toBe('older-page'));
    activity.mockResolvedValueOnce({ items: [], nextCursor: null }); await page.loadActivity(true);
    expect(activity.mock.calls).toEqual([['token-1', undefined], ['token-1', 'older-page']]); expect(page.activity()?.nextCursor).toBeNull();
    await page.loadActivity(true); expect(activity).toHaveBeenCalledTimes(2);
  });
  it('drops an old activity reply when another token is selected', async () => {
    await loaded(); const held = deferred<TokenActivityPage>(); activity.mockReturnValueOnce(held.promise);
    page.openActivity(sampleToken('old')); activity.mockResolvedValueOnce({ items: [], nextCursor: 'new-page' }); page.openActivity(sampleToken('new'));
    await vi.waitFor(() => expect(page.activity()?.nextCursor).toBe('new-page'));
    held.resolve({ items: [], nextCursor: 'private-old-page' }); await Promise.resolve();
    expect(page.selectedToken()?.id).toBe('new'); expect(page.activity()?.nextCursor).toBe('new-page');
    page.closeActivity(); expect(page.selectedToken()).toBeNull(); expect(page.activity()).toBeNull(); expect(page.activityState.busy()).toBe(false);
  });
});

describe('MCP browser consent and client return addresses', () => {
  const epoch = signal(1), me = signal<Me | null>(owner), fetchPort = vi.fn<typeof fetch>();
  const consent: OAuthConsent = { clientName: 'Antigravity', redirectUri: 'http://127.0.0.1:18999/callback', scope: 'gategoldjira:access' };
  const request = 'r'.repeat(43);
  function make(requestId = request) {
    framework(); TestBed.configureTestingModule({ providers: [
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ request: requestId }) } } },
      { provide: AuthService, useValue: { me, sessionEpoch: epoch, client: createApiClient({ baseUrl: 'https://jira.example.test/api/v1', fetch: fetchPort }) } satisfies Pick<AuthService, 'me' | 'sessionEpoch' | 'client'> },
    ] });
    const page = TestBed.runInInjectionContext(() => new McpAuthorizePage()); TestBed.tick(); return page;
  }
  beforeEach(() => { epoch.set(1); me.set(owner); fetchPort.mockReset().mockResolvedValue(Response.json(consent)); });
  it('rejects malformed consent requests without sending an authorization request', async () => {
    const page = make('invalid'); await vi.waitFor(() => expect(page.state.busy()).toBe(false));
    expect(fetchPort).not.toHaveBeenCalled(); expect(page.consent()).toBeNull(); expect(page.state.message()).toContain('could not be completed');
  });
  it.each(['http://127.0.0.1:18999/callback?code=test', 'http://[::1]:18999/callback?error=access_denied', 'https://antigravity.google/oauth-callback?code=test'])(
    'allows only the supported client return address %s', async redirectUrl => {
      const page = make(); await vi.waitFor(() => expect(page.consent()).toEqual(consent));
      fetchPort.mockResolvedValueOnce(Response.json({ redirectUrl })); await page.decide(false);
      const sent = fetchPort.mock.calls[1]![0]; expect(sent).toBeInstanceOf(Request);
      expect(await (sent as Request).json()).toEqual({ allow: false });
      expect(window.location.assign).toHaveBeenCalledExactlyOnceWith(new URL(redirectUrl).href);
    });
  it.each(['https://attacker.example/callback', 'http://localhost:18999/callback', 'https://antigravity.google/other', 'http://user:password@127.0.0.1:18999/callback', 'javascript:alert(1)'])(
    'contains an unsafe server return address %s', async redirectUrl => {
      const page = make(); await vi.waitFor(() => expect(page.consent()).toEqual(consent));
      fetchPort.mockResolvedValueOnce(Response.json({ redirectUrl })); await page.decide(true);
      expect(window.location.assign).not.toHaveBeenCalled(); expect(page.state.message()).toContain('could not be completed'); expect(page.state.busy()).toBe(false);
    });
  it('does not redirect when an authorization decision finishes after sign-out', async () => {
    const page = make(); await vi.waitFor(() => expect(page.consent()).toEqual(consent));
    const held = deferred<Response>(); fetchPort.mockReturnValueOnce(held.promise); const saving = page.decide(true);
    me.set(null); epoch.set(2); TestBed.tick();
    held.resolve(Response.json({ redirectUrl: 'http://127.0.0.1:18999/callback?code=private' })); await saving;
    expect(page.consent()).toBeNull(); expect(window.location.assign).not.toHaveBeenCalled();
  });
});

describe('portable MCP OAuth configuration validation', () => {
  it.each(['https://jira.example.test/mcp', 'http://127.0.0.1:21080/mcp', 'http://localhost:21080/mcp'])('keeps an allowed endpoint exact: %s', endpoint => {
    const config = mcpOAuthConfig(endpoint, 'public-client');
    expect(config.mcpServers.gategoldjira.args).toContain(mcpRemotePackage);
    expect(config.mcpServers.gategoldjira.args.filter(arg => arg === endpoint)).toHaveLength(2);
    expect(config.mcpServers.gategoldjira.args).toContain(JSON.stringify({ client_id: 'public-client' }));
  });
  it.each(['http://remote.example/mcp', 'https://user:password@jira.example/mcp', 'https://jira.example/mcp?token=x', 'https://jira.example/mcp#secret', 'file:///tmp/mcp'])('rejects unsafe configuration endpoint %s', endpoint => {
    expect(() => mcpOAuthConfig(endpoint, 'client')).toThrow();
  });
});
