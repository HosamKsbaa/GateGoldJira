import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type {
  NotificationPreferencesView,
  UpdateNotificationPreferencesFields,
} from '../../../api/generated/types.gen';
import { AuthService } from '../../../core/auth/auth.service';
import { RetryIntent } from '../../../core/api/api-result';
import { RequestState } from '../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../shared/ui/request-status.component';
import { IconComponent } from '../../../shared/ui/icon.component';
import { NotificationsApi } from '../notifications.api';

type Reason = NotificationPreferencesView['events'][number];

const notificationEvents: ReadonlyArray<{ value: Reason; label: string }> = [
  { value: 'assignment', label: 'Assignments' },
  { value: 'mention', label: 'Mentions' },
  { value: 'comment', label: 'Comments' },
  { value: 'status', label: 'Stage changes' },
  { value: 'due_date', label: 'Due dates' },
  { value: 'watching', label: 'Work I follow' },
  { value: 'dependency_blocked', label: 'New blockers' },
  { value: 'dependency_resolved', label: 'Resolved blockers' },
  { value: 'subtask_created', label: 'New subtasks' },
  { value: 'subtasks_completed', label: 'Completed subtasks' },
];

@Component({
  selector: 'gg-notification-preferences',
  imports: [ReactiveFormsModule, RequestStatusComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="preference-panel" aria-label="Notification preferences">
      <button
        class="preference-toggle secondary"
        type="button"
        (click)="expanded.set(!expanded())"
        [attr.aria-expanded]="expanded()"
        aria-controls="notification-preferences-form"
        ><gg-icon name="settings" /> Notification preferences
        <gg-icon [name]="expanded() ? 'chevron-down' : 'chevron-right'"
      /></button>
      @if (expanded()) {
        <div id="notification-preferences-form" class="preference-content">
          <h2>Choose what reaches you</h2
          ><p class="muted"
            >These settings apply to new updates. Your existing inbox history stays available.</p
          >
          <gg-request-status [state]="state" />
          @if (notice()) {
            <p role="status" class="notice">{{ notice() }}</p>
          }
          @if (current(); as preferences) {
            <form [formGroup]="form" (ngSubmit)="save()">
              <fieldset [disabled]="state.busy() || !!pending()">
                <legend class="sr-only">Delivery channels and events</legend>
                <div class="preference-channels">
                  <label class="checkbox"
                    ><input type="checkbox" formControlName="inAppEnabled" /> Show new updates in my
                    Inbox</label
                  >
                  <label
                    >Email updates<select formControlName="emailMode"
                      ><option value="off">Off</option
                      ><option value="instant">As updates happen</option
                      ><option value="daily">Daily digest</option></select
                    ></label
                  >
                  <label class="checkbox"
                    ><input type="checkbox" formControlName="dueReminders" /> Remind me when
                    assigned or reported work is due today</label
                  >
                </div>
                <p class="delivery-state" role="status">{{
                  preferences.emailDeliveryAvailable
                    ? 'Email delivery is enabled for this workspace.'
                    : 'Email delivery is not configured yet. You can save your preferences for when it is enabled.'
                }}</p>
                <p class="muted"
                  >Daily digests combine up to 50 updates after a day. Reminders appear in your
                  selected channels, use the company calendar and exclude completed work.</p
                >
                <h3>Updates I care about</h3>
                <div class="preference-events">
                  @for (event of events; track event.value) {
                    <label class="checkbox"
                      ><input
                        type="checkbox"
                        [checked]="form.controls.events.value.includes(event.value)"
                        (change)="toggle(event.value)"
                      />{{ event.label }}</label
                    >
                  }
                </div>
                <div class="selection-actions"
                  ><button type="button" class="secondary" (click)="selectAll()">Select all</button
                  ><button
                    type="button"
                    class="secondary"
                    (click)="form.controls.events.setValue([])"
                    >Select none</button
                  ></div
                >
                @if (
                  form.controls.dueReminders.value &&
                  !form.controls.events.value.includes('due_date')
                ) {
                  <p class="notice" role="status"
                    >Select Due dates above to receive your due-today reminders.</p
                  >
                }
                <p class="muted"
                  >Only updates you can currently access are delivered. Turning email off also stops
                  queued deliveries.</p
                >
              </fieldset>
              <div class="preference-actions"
                ><button type="submit" [disabled]="state.busy() || !!pending()"
                  >Save preferences</button
                ><button
                  type="button"
                  class="secondary"
                  (click)="reload()"
                  [disabled]="state.busy()"
                  >Reload saved preferences</button
                ></div
              >
            </form>
            @if (pending()) {
              <button type="button" (click)="retryPending()" [disabled]="state.busy()"
                >Retry preference save</button
              >
            }
          } @else {
            <button type="button" class="secondary" (click)="reload()" [disabled]="state.busy()"
              >Load preferences</button
            >
          }
        </div>
      }
    </section>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: 24px;
    }
    .preference-panel {
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: white;
    }
    .preference-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      justify-content: flex-start;
      background: white;
      border: 0;
      padding: 12px 16px;
      min-height: 44px;
    }
    .preference-toggle gg-icon:last-child {
      margin-inline-start: auto;
    }
    .preference-content {
      padding: 4px 20px 20px;
    }
    .preference-content h2 {
      font-size: 16px;
      margin: 8px 0;
    }
    .preference-content h3 {
      font-size: 14px;
      margin: 20px 0 12px;
    }
    .preference-content p {
      font-size: 13px;
      line-height: 1.6;
    }
    .preference-content fieldset {
      border: 0;
      padding: 0;
      margin: 0;
      min-width: 0;
    }
    .preference-channels {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      align-items: start;
      margin-top: 16px;
    }
    .preference-channels > label:last-child {
      grid-column: 1/-1;
    }
    .preference-events {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .checkbox {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      font-size: 13px;
      font-weight: 400;
      min-height: 32px;
      margin: 0;
    }
    .checkbox input {
      flex: none;
      width: 16px;
      height: 16px;
      margin: 2px 0 0;
    }
    .delivery-state {
      border-inline-start: 3px solid #0c66e4;
      background: #f7faff;
      padding: 9px 12px;
    }
    .preference-actions,
    .selection-actions {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-top: 16px;
    }
    .selection-actions button {
      font-size: 12px;
      min-height: 32px;
    }
    @media (max-width: 600px) {
      .preference-content {
        padding-inline: 14px;
      }
      .preference-channels,
      .preference-events {
        grid-template-columns: 1fr;
      }
      .preference-actions button {
        flex: 1;
      }
      .checkbox {
        min-height: 40px;
      }
    }
  `,
})
export class NotificationPreferencesComponent {
  private readonly api = inject(NotificationsApi);
  private readonly auth = inject(AuthService);
  private readonly retry = new RetryIntent<UpdateNotificationPreferencesFields>();
  private generation = 0;
  readonly events = notificationEvents;
  readonly state = new RequestState();
  readonly expanded = signal(false);
  readonly current = signal<NotificationPreferencesView | null>(null);
  readonly pending = signal<UpdateNotificationPreferencesFields | null>(null);
  readonly notice = signal('');
  readonly form = new FormGroup({
    inAppEnabled: new FormControl(true, { nonNullable: true }),
    events: new FormControl<Reason[]>([], { nonNullable: true }),
    emailMode: new FormControl<'off' | 'instant' | 'daily'>('off', { nonNullable: true }),
    dueReminders: new FormControl(false, { nonNullable: true }),
  });
  constructor() {
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      const next = this.auth.sessionEpoch();
      if (next !== epoch) {
        epoch = next;
        this.generation++;
        this.current.set(null);
        this.pending.set(null);
        this.retry.finish();
        this.notice.set('');
        this.state.clear();
        this.state.busy.set(false);
        void this.reload();
      }
    });
    void this.reload();
  }
  toggle(value: Reason): void {
    const values = this.form.controls.events.value;
    this.form.controls.events.setValue(
      values.includes(value) ? values.filter(item => item !== value) : [...values, value],
    );
  }
  selectAll(): void {
    this.form.controls.events.setValue(this.events.map(event => event.value));
  }
  private apply(value: NotificationPreferencesView): void {
    this.current.set(value);
    this.form.setValue({
      inAppEnabled: value.inAppEnabled,
      events: [...value.events],
      emailMode: value.emailMode,
      dueReminders: value.dueReminders,
    });
    this.form.markAsPristine();
  }
  async reload(): Promise<void> {
    if (this.state.busy()) return;
    const generation = ++this.generation,
      epoch = this.auth.sessionEpoch();
    const active = () => generation === this.generation && epoch === this.auth.sessionEpoch();
    await this.state.run(async () => {
      const value = await this.api.preferences();
      if (!active()) return;
      this.apply(value);
      this.pending.set(null);
      this.retry.finish();
      this.notice.set('');
    }, active);
  }
  async save(): Promise<void> {
    const current = this.current();
    if (!current || this.state.busy() || this.pending()) return;
    const values = this.form.getRawValue();
    await this.write({
      ...values,
      events: [...values.events].sort(),
      expectedRevision: current.revision,
    });
  }
  async retryPending(): Promise<void> {
    const body = this.pending();
    if (body && !this.state.busy()) await this.write(body);
  }
  private async write(body: UpdateNotificationPreferencesFields): Promise<void> {
    const generation = this.generation,
      epoch = this.auth.sessionEpoch();
    const active = () => generation === this.generation && epoch === this.auth.sessionEpoch();
    this.pending.set(body);
    await this.state.run(async () => {
      const saved = await this.api.updatePreferences(body, this.retry.reference(body));
      if (!active()) return;
      this.apply(saved.result);
      this.pending.set(null);
      this.retry.finish();
      this.notice.set('Notification preferences saved.');
    }, active);
  }
}
