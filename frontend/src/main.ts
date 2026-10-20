import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter, RouteReuseStrategy } from '@angular/router';
import { inject, type EnvironmentProviders, type Provider } from '@angular/core';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { ProjectEditorReuseStrategy } from './app/core/routing/project-editor-reuse.strategy';
import { ConfigService, loadPublicConfig } from './app/core/config/config.service';
import { LocalSignIn, OidcSignIn, SIGN_IN } from './app/core/auth/sign-in.provider';

async function start(): Promise<void> {
  const config = await loadPublicConfig(window.location.origin);
  const identityProviders: (Provider | EnvironmentProviders)[] = [];
  if (config.mode === 'production' && config.authentication !== 'password') {
    const { provideAuth0, AuthService: Auth0Service } = await import('@auth0/auth0-angular');
    identityProviders.push(
      provideAuth0({
        domain: new URL(config.issuer).hostname,
        clientId: config.clientId,
        cacheLocation: 'memory',
        useRefreshTokens: false,
        authorizationParams: {
          redirect_uri: window.location.origin + '/sign-in',
          audience: config.audience,
          scope: config.scope,
        },
      }),
      { provide: SIGN_IN, useFactory: () => new OidcSignIn(inject(Auth0Service), config) },
    );
  } else identityProviders.push({ provide: SIGN_IN, useFactory: () => new LocalSignIn(config.authentication === 'password' ? 'password' : 'development') });
  await bootstrapApplication(AppComponent, {
    providers: [
      provideRouter(routes),
      { provide: RouteReuseStrategy, useClass: ProjectEditorReuseStrategy },
      { provide: ConfigService, useValue: new ConfigService(config) },
      ...identityProviders,
    ],
  });
}
void start().catch(() => {
  const root = document.querySelector('gg-root');
  if (root)
    root.textContent =
      'GateGoldJira could not start. Check the public service configuration and reload.';
});
