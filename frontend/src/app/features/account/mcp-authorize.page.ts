import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { getMcpBrowserAuthorization, decideMcpBrowserAuthorization } from '../../api/generated/sdk.gen';
import type { OAuthConsent } from '../../api/generated/types.gen';
import { readResult } from '../../core/api/api-result';
import { AuthService } from '../../core/auth/auth.service';
import { RequestState } from '../../shared/ui/request-state';
import { RequestStatusComponent } from '../../shared/ui/request-status.component';

@Component({
  imports: [RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel narrow">
      <p class="eyebrow">Your account · MCP connection</p>
      <h1>Connect Antigravity</h1>
      <gg-request-status [state]="state" />
      @if (consent(); as request) {
        <p><strong>{{ request.clientName }}</strong> wants to connect to GateGoldJira as <strong>{{ auth.me()?.displayName }}</strong>.</p>
        <p>It can read and change records using your current account and project permissions.</p>
        <p>You can disconnect it at any time and review its activity in your account’s MCP connections.</p>
        <p class="muted">Return address: {{ request.redirectUri }}</p>
        <div class="actions">
          <button type="button" (click)="decide(true)" [disabled]="state.busy()">Approve connection</button>
          <button type="button" class="secondary" (click)="decide(false)" [disabled]="state.busy()">Cancel connection</button>
        </div>
      }
    </section>
  `,
  styles: `.actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 24px; } .muted { overflow-wrap: anywhere; }`,
})
export class McpAuthorizePage {
  readonly auth = inject(AuthService);
  readonly state = new RequestState();
  readonly consent = signal<OAuthConsent | null>(null);
  private readonly request = inject(ActivatedRoute).snapshot.queryParamMap.get('request') ?? '';
  private destroyed = false;
  constructor() {
    inject(DestroyRef).onDestroy(() => { this.destroyed = true; });
    effect(() => {
      this.auth.sessionEpoch();
      untracked(() => {
        this.consent.set(null);
        this.state.busy.set(false);
        void this.load();
      });
    });
  }
  private current() {
    const epoch = this.auth.sessionEpoch();
    return () => !this.destroyed && epoch === this.auth.sessionEpoch() && this.auth.me() !== null;
  }
  private async load() {
    const current = this.current();
    await this.state.run(async () => {
      if (!/^[A-Za-z0-9_-]{43}$/.test(this.request)) throw new Error('Invalid connection request');
      const result = await readResult(getMcpBrowserAuthorization({ client: this.auth.client, path: { request: this.request } }));
      if (current()) this.consent.set(result);
    }, current);
  }
  async decide(allow: boolean) {
    const current = this.current();
    await this.state.run(async () => {
      const result = await readResult(decideMcpBrowserAuthorization({ client: this.auth.client, path: { request: this.request }, body: { allow } }));
      if (!current()) return;
      const target = new URL(result.redirectUrl);
      const loopback = target.protocol === 'http:' && ['127.0.0.1', '[::1]'].includes(target.hostname);
      const antigravity = target.origin === 'https://antigravity.google' && target.pathname === '/oauth-callback';
      if ((!loopback && !antigravity) || target.username || target.password) throw new Error('Invalid client return address');
      window.location.assign(target.href);
    }, current);
  }
}
