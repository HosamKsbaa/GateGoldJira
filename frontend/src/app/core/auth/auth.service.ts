import { Injectable, inject, signal } from '@angular/core';
import { createApiClient } from '../api/client';
import { getMe, localSignIn } from '../../api/generated/sdk.gen';
import type { Me } from '../../api/generated/types.gen';
import { ConfigService } from '../config/config.service';
import { SIGN_IN } from './sign-in.provider';
import { parseFailure } from '../api/api-result';

export type LocalSignInResult =
  | 'signed-in'
  | 'invalid-credentials'
  | 'access-denied'
  | 'unavailable'
  | 'superseded';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly provider = inject(SIGN_IN);
  private readonly config = inject(ConfigService);
  private readonly current = signal<Me | null>(null);
  private readonly epoch = signal(0);
  private readonly denied = signal(false);
  readonly me = this.current.asReadonly();
  readonly sessionEpoch = this.epoch.asReadonly();
  readonly sessionDenied = this.denied.asReadonly();
  readonly mode = this.provider.mode;
  private readonly localClient = createApiClient({
    baseUrl: this.config.apiOrigin,
    fetch: (input, init) => fetch(input, { ...init, cache: 'no-store', credentials: 'omit' }),
  });
  readonly client = createApiClient({
    baseUrl: this.config.apiOrigin,
    auth: () => this.provider.accessToken(),
    fetch: async (input, init) => {
      const epoch = this.epoch();
      const response = await fetch(input, { ...init, cache: 'no-store', credentials: 'omit' });
      if (epoch === this.epoch() && (response.status === 401 || response.status === 403)) {
        const failure = parseFailure(
          await response
            .clone()
            .json()
            .catch(() => null),
        );
        if (response.status === 403 && failure.success && failure.data.error.code === 'forbidden') {
          this.epoch.update(value => value + 1);
          void this.refresh().catch(() => this.clearProtectedState());
          return response;
        }
        const hadSession = this.current() !== null;
        this.clearProtectedState();
        this.denied.set(hadSession);
      }
      return response;
    },
  });

  async refresh(): Promise<Me | null> {
    const epoch = this.epoch();
    const result = await getMe({ client: this.client });
    if (result.data && epoch === this.epoch()) {
      const previous = this.current();
      if (
        previous &&
        (previous.userId !== result.data.userId ||
          previous.administrator !== result.data.administrator)
      ) {
        this.epoch.update(value => value + 1);
      }
      this.current.set(result.data);
      return result.data;
    }
    if (epoch === this.epoch()) this.current.set(null);
    return null;
  }
  async signIn(): Promise<void> {
    await this.provider.signIn();
  }
  async signInLocalCredentials(username: string, password: string): Promise<LocalSignInResult> {
    if (this.mode !== 'development' || !this.provider.setLocalToken)
      throw new Error('Local sign-in is unavailable.');
    this.clearProtectedState();
    const epoch = this.epoch();
    try {
      const result = await localSignIn({
        client: this.localClient,
        body: { username: username.trim(), password },
      });
      if (epoch !== this.epoch()) return 'superseded';
      if (!result.data) return this.localFailure(result.response?.status);

      // Verify company access before installing a session. This separate client has
      // no session interceptor, so a stale failed login cannot clear a newer login.
      const token = result.data.accessToken;
      const identity = await getMe({ client: this.localClient, auth: () => token });
      if (epoch !== this.epoch()) return 'superseded';
      if (!identity.data) return this.localFailure(identity.response?.status);
      this.provider.setLocalToken(token);
      this.current.set(identity.data);
      return 'signed-in';
    } catch {
      if (epoch !== this.epoch()) return 'superseded';
      this.clearProtectedState();
      return 'unavailable';
    }
  }
  async signInLocal(token: string): Promise<boolean> {
    if (this.mode !== 'development' || !this.provider.setLocalToken)
      throw new Error('Local sign-in is unavailable.');
    this.clearProtectedState();
    this.provider.setLocalToken(token);
    return (await this.refresh()) !== null;
  }
  async signOut(): Promise<void> {
    this.clearProtectedState();
    await this.provider.signOut();
  }
  clearProtectedState(): void {
    this.provider.clearLocalToken?.();
    this.denied.set(false);
    this.current.set(null);
    this.epoch.update(value => value + 1);
  }
  private localFailure(status: number | undefined): LocalSignInResult {
    if (status === 401) return 'invalid-credentials';
    if (status === 403) return 'access-denied';
    return 'unavailable';
  }
}
