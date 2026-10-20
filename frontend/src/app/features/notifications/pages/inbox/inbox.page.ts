import { foregroundRefresh } from '../../../../core/refresh/foreground-refresh';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type { NotificationView, SetReadFields } from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RetryIntent } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { focusAfterRender } from '../../../../shared/ui/focus-after-render';
import { NotificationsApi } from '../../notifications.api';
import { IconComponent, type IconName } from '../../../../shared/ui/icon.component';
import { NotificationPreferencesComponent } from '../../components/notification-preferences.component';

type InboxIntent = { kind: 'read'; notificationId: string; body: SetReadFields } | { kind: 'all' };
@Component({
  imports: [
    ReactiveFormsModule,
    RequestStatusComponent,
    IconComponent,
    NotificationPreferencesComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <header class="page-heading"
      ><div
        ><p class="eyebrow">Your workspace / Notifications</p><h1>Inbox</h1
        ><p class="page-description">Keep up with the conversations and work that need you.</p></div
      ><button type="button" class="secondary" (click)="load()" [disabled]="state.busy()"
        ><gg-icon name="refresh" /> Refresh inbox</button
      ></header
    >
    <gg-request-status [state]="state" />
    @if (notice()) {
      <p class="notice" role="status">{{ notice() }}</p>
    }
    @if (pending()) {
      <button type="button" (click)="retryPending()" [disabled]="state.busy()"
        >Retry inbox change</button
      >
    }
    <gg-notification-preferences />
    <div class="inbox-layout"
      ><section class="inbox-main" aria-labelledby="my-notifications-heading">
        <div class="inbox-toolbar"
          ><div
            ><h2 id="my-notifications-heading"
              >My notifications <span class="unread-count">{{ api.unreadCount() ?? '…' }}</span></h2
            ><p id="inbox-summary" role="status" tabindex="-1"
              >{{ api.unreadCount() ?? '…' }} unread · {{ total() }} matching notifications</p
            ></div
          ><button
            type="button"
            class="secondary"
            aria-label="Mark all accessible notifications read"
            (click)="markAll()"
            [disabled]="state.busy() || api.unreadCount() === 0"
            ><gg-icon name="check" /> Mark all as read</button
          ></div
        >
        <div class="inbox-filters"
          ><label class="checkbox"
            ><input type="checkbox" [formControl]="unreadOnly" />Unread only</label
          ><button type="button" class="secondary" (click)="load()" [disabled]="state.busy()"
            ><gg-icon name="filter" /> Apply inbox filter</button
          ></div
        >
        <ul class="notification-list">
          @for (item of items(); track item.id) {
            <li
              ><article
                class="notification-record"
                [class.unread]="!item.readAt"
                [attr.data-notification-id]="item.id"
              >
                <span class="notification-avatar" aria-hidden="true">{{
                  initials(item.actor.displayName)
                }}</span
                ><div class="notification-content"
                  ><div class="notification-meta"
                    ><bdi class="notification-actor">{{ item.actor.displayName }}</bdi
                    ><time [attr.datetime]="item.createdAt" [title]="item.createdAt">{{
                      formatDate(item.createdAt)
                    }}</time></div
                  >
                  <p class="notification-summary" dir="auto">{{ item.summary }}</p
                  ><p class="notification-reasons"
                    ><gg-icon [name]="reasonIcon(item)" /> {{ reasonText(item) }}
                    <span class="reason-dot" aria-hidden="true">·</span
                    ><bdi>{{ item.issueKey }}</bdi></p
                  >
                  <div class="notification-actions"
                    ><button
                      type="button"
                      class="secondary"
                      (click)="open(item)"
                      [disabled]="state.busy()"
                      >Open issue <bdi>{{ item.issueKey }}</bdi>
                      <gg-icon name="arrow-right" /></button
                    ><button
                      type="button"
                      class="read-action"
                      (click)="changeRead(item, !item.readAt)"
                      [disabled]="state.busy()"
                      >{{ item.readAt ? 'Mark unread' : 'Mark read' }}</button
                    ></div
                  > </div
                ><strong class="read-state" [class.read]="item.readAt">{{
                  item.readAt ? 'Read' : 'Unread'
                }}</strong>
              </article></li
            >
          } @empty {
            @if (!state.busy()) {
              <li class="empty-inbox"
                ><span class="empty-inbox-icon"><gg-icon name="bell" /></span
                ><h3>{{ unreadOnly.value ? 'You’re all caught up' : 'Nothing here yet' }}</h3
                ><p>No notifications match this filter.</p
                ><p class="muted"
                  >Assignments, mentions, comments, and updates will appear here.</p
                ></li
              >
            }
          }
        </ul>
        @if (cursor()) {
          <div class="inbox-pagination"
            ><button
              type="button"
              class="secondary"
              (click)="load(cursor() ?? undefined)"
              [disabled]="state.busy()"
              >Next inbox page <gg-icon name="arrow-right" /></button
          ></div>
        }</section
      ><aside class="inbox-guide"
        ><span class="guide-icon"><gg-icon name="bell" /></span><h2>Your work, in the loop</h2
        ><p>See when someone mentions you, assigns an issue, or updates work you follow.</p
        ><div class="guide-note"
          ><gg-icon name="check-square" /><p>Opening an issue marks this notification read.</p></div
        ><div class="guide-note"
          ><gg-icon name="users" /><p
            >Notifications from projects you can no longer access are excluded.</p
          ></div
        ><p class="guide-timezone">Times shown in {{ auth.me()?.companyTimeZone }}.</p></aside
      ></div
    >`,
  styles: `
    :host {
      display: block;
    }
    .page-description {
      font-size: 13px;
      color: var(--color-muted);
      margin: 5px 0 0;
    }
    .inbox-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 260px;
      gap: 32px;
      align-items: start;
    }
    .inbox-main {
      min-width: 0;
    }
    .inbox-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin-bottom: 20px;
    }
    .inbox-toolbar h2 {
      font-size: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
    }
    .unread-count {
      font-size: 11px;
      line-height: 1;
      min-width: 15px;
      padding: 4px 6px;
      text-align: center;
      background: #e9f2ff;
      color: var(--color-brand);
      border-radius: 3px;
    }
    .inbox-toolbar p {
      font-size: 12px;
      color: var(--color-muted);
      margin: 7px 0 0;
    }
    .inbox-toolbar button {
      font-size: 12px;
    }
    .inbox-toolbar button gg-icon {
      width: 15px;
      height: 15px;
    }
    .inbox-filters {
      display: flex;
      align-items: center;
      gap: 18px;
      margin-bottom: 18px;
    }
    .inbox-filters .checkbox {
      margin: 0;
      font-size: 12px;
      font-weight: 400;
    }
    .inbox-filters button {
      font-size: 11px;
      min-height: 28px;
      padding: 5px 9px;
    }
    .inbox-filters gg-icon {
      width: 13px;
      height: 13px;
    }
    .notification-list {
      list-style: none;
      margin: 0;
      padding: 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .notification-record {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 20px;
      border-bottom: 1px solid #f1f2f4;
      border-inline-start: 3px solid transparent;
      background: white;
      transition: background 0.15s;
    }
    .notification-list > li:last-child .notification-record {
      border-bottom: 0;
    }
    .notification-record.unread {
      border-inline-start-color: #0c66e4;
      background: #f7faff;
    }
    .notification-avatar {
      width: 34px;
      height: 34px;
      display: grid;
      place-items: center;
      flex: none;
      background: #e9f2ff;
      color: #0c66e4;
      border-radius: 50%;
      font-size: 11px;
      font-weight: 600;
    }
    .notification-record:not(.unread) .notification-avatar {
      background: #f1f2f4;
      color: #44546f;
    }
    .notification-content {
      flex: 1;
      min-width: 0;
    }
    .notification-meta {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
      padding-inline-end: 54px;
    }
    .notification-actor {
      font-size: 13px;
      font-weight: 600;
      color: var(--color-text);
    }
    .notification-meta time {
      font-size: 11px;
      color: var(--color-muted);
    }
    .notification-summary {
      font-size: 13px;
      color: var(--color-text);
      line-height: 1.6;
      margin: 7px 0 9px;
      overflow-wrap: anywhere;
    }
    .notification-reasons {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 11px;
      color: var(--color-muted);
      text-transform: capitalize;
      margin: 0;
    }
    .notification-reasons gg-icon {
      width: 14px;
      height: 14px;
    }
    .notification-reasons bdi {
      text-transform: none;
    }
    .reason-dot {
      padding-inline: 2px;
    }
    .notification-actions {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-top: 16px;
      flex-wrap: wrap;
    }
    .notification-actions button {
      font-size: 11px;
      min-height: 28px;
      padding: 4px 8px;
    }
    .notification-actions gg-icon {
      width: 13px;
      height: 13px;
    }
    .notification-actions .read-action {
      background: transparent;
      border-color: transparent;
      color: var(--color-muted);
      padding-inline: 0;
    }
    .notification-actions .read-action:hover {
      color: var(--color-brand);
      text-decoration: underline;
    }
    .read-state {
      position: absolute;
      inset-inline-end: 16px;
      top: 20px;
      color: #0c66e4;
      background: #e9f2ff;
      border-radius: 3px;
      padding: 3px 6px;
      font-weight: 600;
      font-size: 10px;
    }
    .read-state.read {
      color: var(--color-muted);
      background: #f1f2f4;
    }
    .inbox-pagination {
      display: flex;
      justify-content: flex-end;
      padding-top: 16px;
    }
    .inbox-guide {
      border: 1px solid #f1f2f4;
      background: #f7f8f9;
      border-radius: var(--radius);
      padding: 22px;
    }
    .guide-icon {
      display: inline-flex;
      background: #e9f2ff;
      color: #0c66e4;
      padding: 10px;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    .inbox-guide h2 {
      font-size: 15px;
      margin: 0;
    }
    .inbox-guide > p {
      color: var(--color-muted);
      font-size: 12px;
      line-height: 1.7;
      margin: 12px 0 22px;
    }
    .guide-note {
      display: flex;
      gap: 9px;
      color: var(--color-muted);
      margin-bottom: 18px;
    }
    .guide-note gg-icon {
      width: 15px;
      height: 15px;
      margin-top: 3px;
    }
    .guide-note p {
      font-size: 11px;
      line-height: 1.6;
      margin: 0;
    }
    .inbox-guide .guide-timezone {
      font-size: 10px;
      border-top: 1px solid var(--color-border);
      padding-top: 16px;
      margin-bottom: 0;
    }
    .empty-inbox {
      text-align: center;
      padding: 60px 20px;
      color: var(--color-muted);
    }
    .empty-inbox-icon {
      display: inline-flex;
      background: #e9f2ff;
      border-radius: 50%;
      color: #0c66e4;
      padding: 16px;
      margin-bottom: 16px;
    }
    .empty-inbox-icon gg-icon {
      width: 24px;
      height: 24px;
    }
    .empty-inbox h3 {
      font-size: 16px;
      color: var(--color-text);
      margin: 0 0 9px;
    }
    .empty-inbox p {
      font-size: 13px;
      margin: 0 0 8px;
    }
    .empty-inbox .muted {
      font-size: 12px;
    }
    @media (max-width: 1050px) {
      .inbox-layout {
        grid-template-columns: 1fr;
      }
      .inbox-guide {
        display: none;
      }
    }
    @media (max-width: 600px) {
      .inbox-toolbar {
        align-items: flex-start;
      }
      .inbox-toolbar button {
        font-size: 10px;
        padding: 5px 7px;
      }
      .inbox-toolbar button gg-icon {
        display: none;
      }
      .notification-record {
        padding: 16px 10px;
        gap: 9px;
      }
      .notification-avatar {
        width: 28px;
        height: 28px;
        font-size: 10px;
      }
      .notification-meta {
        gap: 5px;
        align-items: flex-start;
        flex-direction: column;
      }
      .notification-actor {
        font-size: 12px;
      }
      .read-state {
        inset-inline-end: 10px;
        top: 16px;
        font-size: 9px;
      }
      .notification-summary {
        font-size: 12px;
      }
      .page-heading > button {
        font-size: 11px;
        white-space: nowrap;
        padding: 6px 8px;
      }
      .page-heading > button gg-icon {
        display: none;
      }
    }
  `,
})
export class InboxPage {
  readonly api = inject(NotificationsApi);
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly identity = computed(() => this.auth.me()?.userId ?? null);
  private readonly retry = new RetryIntent<InboxIntent>();
  private generation = 0;
  private pendingDestination: string | null = null;
  private activeUnreadOnly = false;
  private activeCursor: string | undefined;
  readonly state = new RequestState();
  readonly unreadOnly = new FormControl(false, { nonNullable: true });
  readonly items = signal<NotificationView[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly total = signal(0);
  readonly notice = signal('');
  readonly pending = signal<InboxIntent | null>(null);
  constructor() {
    foregroundRefresh(
      () => !!this.identity() && !this.state.busy() && !this.pending(),
      async () => {
        const generation = this.generation,
          epoch = this.auth.sessionEpoch(),
          unread = this.activeUnreadOnly,
          cursor = this.activeCursor;
        const page = await this.api.list(unread, cursor);
        if (
          !this.current(generation, epoch) ||
          this.state.busy() ||
          this.pending() ||
          cursor !== this.activeCursor ||
          unread !== this.activeUnreadOnly
        )
          return;
        this.items.set(page.items);
        this.cursor.set(page.nextCursor);
        this.total.set(page.totalMatching);
      },
    );
    inject(DestroyRef).onDestroy(() => this.generation++);
    effect(() => {
      this.identity();
      this.auth.sessionEpoch();
      untracked(() => {
        this.generation++;
        this.items.set([]);
        this.cursor.set(null);
        this.total.set(0);
        this.notice.set('');
        this.pending.set(null);
        this.pendingDestination = null;
        this.retry.finish();
        this.state.busy.set(false);
        this.state.clear();
        if (this.identity()) void this.load();
      });
    });
  }
  private current(generation: number, epoch: number): boolean {
    return generation === this.generation && epoch === this.auth.sessionEpoch();
  }
  private async readPage(
    cursor: string | undefined,
    generation: number,
    epoch: number,
  ): Promise<void> {
    this.activeCursor = cursor;
    if (!cursor) this.activeUnreadOnly = this.unreadOnly.value;
    const [page] = await Promise.all([
      this.api.list(this.activeUnreadOnly, cursor),
      this.api.refreshSummary(),
    ]);
    if (!this.current(generation, epoch)) return;
    this.items.set(page.items);
    this.cursor.set(page.nextCursor);
    this.total.set(page.totalMatching);
  }
  async load(cursor?: string): Promise<void> {
    const generation = this.generation,
      epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        await this.readPage(cursor, generation, epoch);
        if (cursor && this.current(generation, epoch))
          focusAfterRender('inbox-summary', this.injector);
      },
      () => this.current(generation, epoch),
    );
  }
  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map(part => Array.from(part)[0] ?? '')
      .join('')
      .toLocaleUpperCase();
  }
  formatDate(value: string): string {
    return new Intl.DateTimeFormat('en', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: this.auth.me()?.companyTimeZone ?? 'UTC',
    }).format(new Date(value));
  }
  reasonIcon(item: NotificationView): IconName {
    if (item.reasons.includes('mention') || item.reasons.includes('comment')) return 'comment';
    if (item.reasons.includes('assignment')) return 'users';
    if (item.reasons.includes('dependency_blocked') || item.reasons.includes('dependency_resolved'))
      return 'link';
    if (item.reasons.includes('due_date')) return 'calendar';
    return 'activity';
  }
  reasonText(item: NotificationView): string {
    return item.reasons.map(reason => reason.replaceAll('_', ' ')).join(' · ');
  }
  private async apply(intent: InboxIntent, destination: string | null = null): Promise<void> {
    const generation = this.generation,
      epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        this.pending.set(intent);
        this.pendingDestination = destination;
        const reference = this.retry.reference(intent);
        if (intent.kind === 'all') {
          const saved = await this.api.markAll(reference);
          if (!this.current(generation, epoch)) return;
          this.notice.set(saved.result.changedCount + ' notifications marked read.');
        } else {
          const saved = await this.api.setRead(intent.notificationId, intent.body, reference);
          if (!this.current(generation, epoch)) return;
          this.notice.set(
            intent.body.read ? 'Notification marked read.' : 'Notification marked unread.',
          );
          if (destination) destination = saved.result.issueId;
        }
        this.retry.finish();
        this.pending.set(null);
        this.pendingDestination = null;
        await this.readPage(undefined, generation, epoch);
        if (!this.current(generation, epoch)) return;
        if (destination) await this.router.navigate(['/issues', destination]);
      },
      () => this.current(generation, epoch),
    );
  }
  async changeRead(item: NotificationView, read: boolean): Promise<void> {
    await this.apply({
      kind: 'read',
      notificationId: item.id,
      body: { expectedRevision: item.revision, read },
    });
  }
  async markAll(): Promise<void> {
    await this.apply({ kind: 'all' });
  }
  async retryPending(): Promise<void> {
    const intent = this.pending();
    if (intent) await this.apply(intent, this.pendingDestination);
  }
  async open(item: NotificationView): Promise<void> {
    const pending = this.pending();
    if (pending?.kind === 'read' && pending.notificationId === item.id && pending.body.read) {
      await this.apply(pending, item.issueId);
      return;
    }
    const generation = this.generation,
      epoch = this.auth.sessionEpoch();
    let fresh: NotificationView | null = null;
    await this.state.run(
      async () => {
        const value = await this.api.get(item.id);
        if (this.current(generation, epoch)) fresh = value;
      },
      () => this.current(generation, epoch),
    );
    if (!fresh || !this.current(generation, epoch)) return;
    const current: NotificationView = fresh;
    if (current.readAt) {
      await this.router.navigate(['/issues', current.issueId]);
      return;
    }
    await this.apply(
      {
        kind: 'read',
        notificationId: current.id,
        body: { expectedRevision: current.revision, read: true },
      },
      current.issueId,
    );
  }
}
