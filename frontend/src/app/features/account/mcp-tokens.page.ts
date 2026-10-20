import { ChangeDetectionStrategy, Component, DestroyRef, Injector, computed, effect, inject, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { TokenActivityPage, CreatedToken, TokenList, TokenView } from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { RequestState } from '../../shared/ui/request-state';
import { RequestStatusComponent } from '../../shared/ui/request-status.component';
import { McpTokensApi } from './mcp-tokens.api';
import { mcpOAuthConfig } from './mcp-connection-config';
import { focusAfterRender } from '../../shared/ui/focus-after-render';

@Component({
  imports: [ReactiveFormsModule, DatePipe, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:pagehide)': 'hideCredential()' },
  templateUrl: './mcp-tokens.page.html',
  styleUrl: './mcp-tokens.page.css',
})
export class McpTokensPage {
  private readonly api = inject(McpTokensApi);
  private readonly injector = inject(Injector);
  readonly auth = inject(AuthService);
  readonly state = new RequestState();
  readonly activityState = new RequestState();
  readonly selectedToken = signal<TokenView | null>(null);
  readonly activity = signal<TokenActivityPage | null>(null);
  private activityGeneration = 0;
  readonly listing = signal<TokenList | null>(null);
  readonly created = signal<CreatedToken | null>(null);
  readonly showToken = signal(false);
  readonly notice = signal('');
  readonly confirming = signal<string | null>(null);
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(80)] }),
  });
  readonly activeCount = computed(() => this.listing()?.items.filter(token => this.status(token) === 'Active').length ?? 0);
  private destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.destroyed = true; this.hideCredential(); });
    effect(() => {
      const user = this.auth.me()?.userId;
      this.auth.sessionEpoch();
      untracked(() => {
        this.created.set(null);
        this.listing.set(null);
        this.confirming.set(null);
        this.notice.set('');
        this.form.reset({ name: '' });
        this.closeActivity();
        this.state.busy.set(false);
        this.state.clear();
        if (user) void this.load();
      });
    });
  }

  private current() {
    const epoch = this.auth.sessionEpoch();
    return () => !this.destroyed && this.auth.sessionEpoch() === epoch && this.auth.me() !== null;
  }
  async load() {
    const current = this.current();
    await this.state.run(async () => {
      const result = await this.api.list();
      if (current()) this.listing.set(result);
    }, current);
  }
  async create() {
    if (this.form.invalid || !this.form.controls.name.value.trim() || this.created()) return;
    const current = this.current();
    const values = this.form.getRawValue();
    this.notice.set('');
    await this.state.run(async () => {
      const result = await this.api.create({ name: values.name.trim() });
      if (!current()) return;
      this.created.set(result);
      this.notice.set('Token created. Copy it now; it will only be shown once.');
      focusAfterRender('created-token-heading', this.injector);
      this.showToken.set(false);
      this.listing.update(list => list ? { ...list, items: [result.details, ...list.items].slice(0, 100) } : list);
      this.form.controls.name.reset('');
    }, current);
  }
  dismiss() {
    this.hideCredential();
    this.notice.set('Token hidden. If you lose it, revoke it and create a replacement.');
  }
  hideCredential() {
    this.created.set(null);
    this.showToken.set(false);
  }
  async copyOAuthConfig() {
    const list = this.listing();
    if (!list?.oauthClientId) return;
    const current = this.current();
    try {
      await navigator.clipboard.writeText(JSON.stringify(mcpOAuthConfig(list.endpoint, list.oauthClientId), null, 2));
      if (current()) this.notice.set('OAuth configuration copied. Merge it into Antigravity’s MCP config and reload the server. The proxy opens your browser for sign-in and approval.');
    } catch {
      if (current()) this.notice.set('Clipboard access is unavailable. Allow clipboard access, then copy the OAuth configuration again.');
    }
  }
  async copy(kind: 'token' | 'config') {
    const created = this.created();
    const endpoint = this.listing()?.endpoint;
    if (!created || !endpoint) return;
    const current = this.current();
    const value = kind === 'token' ? created.token : JSON.stringify({ mcpServers: { gategoldjira: {
      serverUrl: endpoint, headers: { Authorization: 'Bearer ' + created.token },
    } } }, null, 2);
    try {
      await navigator.clipboard.writeText(value);
      if (current()) this.notice.set(kind === 'token' ? 'Token copied.' : 'Antigravity configuration copied. Merge it into your MCP configuration, then refresh the server.');
    } catch {
      if (current()) this.notice.set('Clipboard access is unavailable. Use Show token, then select and copy the token.');
    }
  }
  async revoke(token: TokenView) {
    const current = this.current();
    await this.state.run(async () => {
      const result = await this.api.revoke(token.id);
      if (!current()) return;
      this.listing.update(list => list ? { ...list, items: list.items.map(item => item.id === result.id ? result : item) } : list);
      if (this.created()?.details.id === token.id) this.created.set(null);
      this.confirming.set(null);
      this.notice.set('Token revoked. It can no longer connect to MCP.');
    }, current);
  }
  openActivity(token: TokenView) {
    this.closeActivity();
    this.selectedToken.set(token);
    void this.loadActivity();
    focusAfterRender('token-activity-heading', this.injector);
  }
  closeActivity() {
    this.activityGeneration++;
    this.selectedToken.set(null);
    this.activity.set(null);
    this.activityState.busy.set(false);
    this.activityState.clear();
  }
  async loadActivity(older = false) {
    const token = this.selectedToken();
    if (!token) return;
    const before = older ? this.activity()?.nextCursor : undefined;
    if (older && !before) return;
    const authenticated = this.current();
    const generation = this.activityGeneration;
    const current = () => authenticated() && this.activityGeneration === generation;
    await this.activityState.run(async () => {
      const page = await this.api.activity(token.id, before ?? undefined);
      if (!current()) return;
      this.activity.update(previous => older && previous ? { ...page, items: [...previous.items, ...page.items] } : page);
    }, current);
  }
  status(token: TokenView) {
    if (token.revokedAt) return 'Revoked';
    return token.expiresAt && Date.parse(token.expiresAt) <= Date.now() ? 'Expired' : 'Active';
  }
}
