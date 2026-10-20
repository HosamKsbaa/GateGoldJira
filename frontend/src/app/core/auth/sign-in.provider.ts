import { InjectionToken } from '@angular/core';
import type { AuthService as Auth0Service } from '@auth0/auth0-angular';
import { firstValueFrom } from 'rxjs';
import type { PublicConfig } from '../config/config.service';

export interface SignInProvider {
  readonly mode: 'development' | 'production' | 'password';
  accessToken(): Promise<string | undefined>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  setLocalToken?(token: string): void;
  clearLocalToken?(): void;
}
export const SIGN_IN = new InjectionToken<SignInProvider>('GateGoldJira sign-in');

// Local credentials exchange for short-lived tokens kept only in memory.
export class LocalSignIn implements SignInProvider {
  constructor(readonly mode: 'development' | 'password' = 'development') {}
  private token: string | undefined;
  async accessToken(): Promise<string | undefined> {
    return this.token;
  }
  async signIn(): Promise<void> {
    throw new Error('Enter your local username and password.');
  }
  async signOut(): Promise<void> {
    this.clearLocalToken();
  }
  clearLocalToken(): void {
    this.token = undefined;
  }
  setLocalToken(token: string): void {
    const value = token.trim();
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value) || value.length > 16_384) {
      throw new Error('Enter a valid local access token.');
    }
    this.token = value;
  }
}

export class OidcSignIn implements SignInProvider {
  readonly mode = 'production';
  constructor(
    private readonly sdk: Auth0Service,
    private readonly config: PublicConfig,
  ) {}
  async accessToken(): Promise<string | undefined> {
    if (!(await firstValueFrom(this.sdk.isAuthenticated$))) return undefined;
    return firstValueFrom(
      this.sdk.getAccessTokenSilently({
        authorizationParams: {
          audience: this.config.audience,
          scope: this.config.scope,
        },
      }),
    );
  }
  async signIn(): Promise<void> {
    await firstValueFrom(
      this.sdk.loginWithRedirect({
        authorizationParams: { connection: 'google-oauth2' },
        appState: { target: '/' },
      }),
    );
  }
  async signOut(): Promise<void> {
    await firstValueFrom(this.sdk.logout({ logoutParams: { returnTo: window.location.origin } }));
  }
}
