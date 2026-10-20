import '@angular/compiler';
import { ApplicationRef, createEnvironmentInjector, EnvironmentInjector, makeEnvironmentProviders, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ROUTES, RouteReuseStrategy } from '@angular/router';
import type { bootstrapApplication } from '@angular/platform-browser';
import type { AuthConfig } from '@auth0/auth0-angular';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicConfig } from './app/core/config/config.service';

// Bootstrap and the provider SDK are integration boundaries. These checks run
// the real entry point, config validation and DI factories, without claiming
// browser rendering or acceptance against an actual identity provider.
const ports = vi.hoisted(() => ({
  bootstrap: vi.fn<typeof bootstrapApplication>(),
  provideIdentity: vi.fn<(config: AuthConfig) => void>(),
  RootComponent: class {},
  IdentityService: class {},
}));
vi.mock('@angular/platform-browser', async original => ({
  ...await original<typeof import('@angular/platform-browser')>(),
  bootstrapApplication: ports.bootstrap,
}));
vi.mock('./app/app.component', () => ({ AppComponent: ports.RootComponent }));
vi.mock('./app/app.routes', () => ({ routes: [] }));
vi.mock('@auth0/auth0-angular', () => ({
  AuthService: ports.IdentityService,
  provideAuth0: (config: AuthConfig) => {
    ports.provideIdentity(config);
    return makeEnvironmentProviders([{ provide: ports.IdentityService, useClass: ports.IdentityService }]);
  },
}));

const failure = 'GateGoldJira could not start. Check the public service configuration and reload.';
const development: PublicConfig = {
  mode: 'development', apiBaseUrl: 'http://localhost:21080/api/v1',
  issuer: 'http://localhost:21080/development-identity/', clientId: 'local-development',
  audience: 'http://localhost:21080/api', scope: 'openid profile email gategoldjira:access',
};
const production: PublicConfig = {
  ...development, mode: 'production', apiBaseUrl: 'https://api.example.test/api/v1',
  issuer: 'https://company.example.test/', clientId: 'public-client', audience: 'https://api.example.test/api',
};
const fetchConfig = vi.fn<typeof fetch>();
let root: { textContent: string };
let query: ReturnType<typeof vi.fn<(selector: string) => typeof root | null>>;
const children: EnvironmentInjector[] = [];

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
beforeEach(() => {
  vi.resetModules();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  ports.bootstrap.mockReset().mockImplementation(async () => TestBed.inject(ApplicationRef));
  ports.provideIdentity.mockReset();
  root = { textContent: 'Loading GateGoldJira' };
  query = vi.fn(() => root);
  vi.stubGlobal('document', { querySelector: query });
  vi.stubGlobal('window', { location: { origin: 'http://localhost:4200' } });
  fetchConfig.mockReset().mockResolvedValue(Response.json(development));
  vi.stubGlobal('fetch', fetchConfig);
});
afterEach(() => {
  for (const child of children.splice(0)) child.destroy();
  TestBed.resetTestingModule();
  vi.unstubAllGlobals();
});
async function load() { await import('./main'); }
async function bootstrappedInjector() {
  await vi.waitFor(() => expect(ports.bootstrap).toHaveBeenCalledOnce());
  const configuration = ports.bootstrap.mock.calls[0]?.[1];
  if (!configuration) throw new Error('Expected the actual entry point to configure bootstrap.');
  const child = createEnvironmentInjector(configuration.providers, TestBed.inject(EnvironmentInjector));
  children.push(child);
  return child;
}

describe('application startup and safe configuration failures', () => {
  it('waits for public configuration before bootstrapping any application or identity SDK', async () => {
    let resolve!: (response: Response) => void;
    fetchConfig.mockReturnValue(new Promise<Response>(finish => { resolve = finish; }));
    await load();
    expect(fetchConfig).toHaveBeenCalledExactlyOnceWith('/config.local.json', { cache: 'no-store', credentials: 'omit' });
    expect(ports.bootstrap).not.toHaveBeenCalled();
    expect(ports.provideIdentity).not.toHaveBeenCalled();
    resolve(Response.json(development));
    await bootstrappedInjector();
  });
  it('installs only local identity plus the configured router and project editor reuse strategy in development', async () => {
    await load(); const injector = await bootstrappedInjector();
    const { ConfigService } = await import('./app/core/config/config.service');
    const { SIGN_IN, LocalSignIn } = await import('./app/core/auth/sign-in.provider');
    const { ProjectEditorReuseStrategy } = await import('./app/core/routing/project-editor-reuse.strategy');
    expect(ports.bootstrap.mock.calls[0]?.[0]).toBe(ports.RootComponent);
    expect(injector.get(ConfigService).value).toEqual(development);
    expect(injector.get(SIGN_IN)).toBeInstanceOf(LocalSignIn);
    expect(injector.get(RouteReuseStrategy)).toBeInstanceOf(ProjectEditorReuseStrategy);
    expect(injector.get(ROUTES)).toEqual([[]]);
    expect(ports.provideIdentity).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
  it('wires the production SDK to the public company issuer and keeps credentials in memory', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://jira.example.test' } });
    fetchConfig.mockResolvedValue(Response.json(production));
    await load(); const injector = await bootstrappedInjector();
    const { SIGN_IN, OidcSignIn } = await import('./app/core/auth/sign-in.provider');
    expect(fetchConfig.mock.calls[0]?.[0]).toBe('/config.production.json');
    expect(ports.provideIdentity).toHaveBeenCalledExactlyOnceWith({
      domain: 'company.example.test', clientId: production.clientId,
      cacheLocation: 'memory', useRefreshTokens: false,
      authorizationParams: { redirect_uri: 'https://jira.example.test/sign-in', audience: production.audience, scope: production.scope },
    });
    expect(injector.get(SIGN_IN)).toBeInstanceOf(OidcSignIn);
    expect(injector.get(SIGN_IN).mode).toBe('production');
    expect(query).not.toHaveBeenCalled();
  });
  it.each(['unavailable', 'malformed', 'transport'] as const)('stops startup and displays safe recovery guidance when configuration is %s', async kind => {
    if (kind === 'unavailable') fetchConfig.mockResolvedValue(new Response('private upstream error', { status: 503 }));
    else if (kind === 'malformed') fetchConfig.mockResolvedValue(Response.json({ ...development, mode: 'unknown' }));
    else fetchConfig.mockRejectedValue(new Error('private connection details'));
    await load(); await vi.waitFor(() => expect(root.textContent).toBe(failure));
    expect(query).toHaveBeenCalledExactlyOnceWith('gg-root');
    expect(ports.bootstrap).not.toHaveBeenCalled(); expect(ports.provideIdentity).not.toHaveBeenCalled();
  });
  it('refuses an insecure production configuration before installing identity or the app', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://jira.example.test' } });
    fetchConfig.mockResolvedValue(Response.json({ ...production, issuer: 'http://company.example.test/' }));
    await load(); await vi.waitFor(() => expect(root.textContent).toBe(failure));
    expect(ports.bootstrap).not.toHaveBeenCalled(); expect(ports.provideIdentity).not.toHaveBeenCalled();
  });
  it('handles an actual bootstrap rejection without exposing its error details', async () => {
    ports.bootstrap.mockRejectedValue(new Error('private bootstrap failure'));
    await load(); await vi.waitFor(() => expect(root.textContent).toBe(failure));
    expect(ports.bootstrap).toHaveBeenCalledOnce(); expect(root.textContent).not.toContain('private');
  });
  it('handles identity-provider installation failure without falling back to local identities', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://jira.example.test' } });
    fetchConfig.mockResolvedValue(Response.json(production));
    ports.provideIdentity.mockImplementation(() => { throw new Error('private provider failure'); });
    await load(); await vi.waitFor(() => expect(root.textContent).toBe(failure));
    expect(ports.provideIdentity).toHaveBeenCalledOnce(); expect(ports.bootstrap).not.toHaveBeenCalled();
  });
  it('settles a configuration failure safely when the root element has already been removed', async () => {
    query.mockReturnValue(null); fetchConfig.mockRejectedValue(new Error('Configuration unavailable'));
    await load(); await vi.waitFor(() => expect(query).toHaveBeenCalledExactlyOnceWith('gg-root'));
    expect(root.textContent).toBe('Loading GateGoldJira'); expect(ports.bootstrap).not.toHaveBeenCalled();
  });
});
