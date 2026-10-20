import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import type { ActivityView } from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { IssuesApi } from '../../issues.api';
@Component({
  selector: 'gg-issue-history',
  imports: [DatePipe, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <section aria-label="Issue activity"
    ><h2>Activity</h2><gg-request-status [state]="state" /><button
      type="button"
      class="secondary"
      (click)="load()"
      [disabled]="state.busy()"
      >Refresh activity</button
    >
    <ol class="activity-list">
      @for (event of events(); track event.id) {
        <li
          ><p
            ><bdi>{{ event.actor.displayName }}</bdi> ·
            {{
              event.action === 'patch_issue_field'
                ? 'update issue'
                : event.action.replaceAll('_', ' ')
            }}
            ·
            <time [attr.datetime]="event.createdAt">{{ event.createdAt | date: 'medium' }}</time></p
          ><dl>
            @for (change of event.changes; track $index) {
              <div
                ><dt>{{ change.field }}</dt
                ><dd dir="auto">{{ change.before ?? '—' }} → {{ change.after ?? '—' }}</dd></div
              >
            }
          </dl>
          @if (event.changeSummary) {
            <p>{{ event.changeSummary }}</p>
          }
        </li>
      } @empty {
        <li>No activity to show.</li>
      }
    </ol>
    @if (cursor()) {
      <button type="button" class="secondary" (click)="load(true)" [disabled]="state.busy()"
        >More activity</button
      >
    }
  </section>`,
  styles: `
    .activity-list {
      padding-left: 20px;
    }
    .activity-list li {
      border-bottom: 1px solid var(--border, #dfe1e6);
      padding: 8px 0;
    }
    dt {
      font-weight: 600;
    }
    dd {
      margin: 4px 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: 160px;
      overflow: auto;
    }
  `,
})
export class IssueHistoryComponent {
  readonly issueId = input.required<string>();
  readonly revision = input('');
  readonly state = new RequestState();
  readonly events = signal<ActivityView[]>([]);
  readonly cursor = signal<string | null>(null);
  private readonly api = inject(IssuesApi);
  private readonly auth = inject(AuthService);
  private generation = 0;
  constructor() {
    effect(() => {
      this.issueId();
      this.revision();
      this.auth.sessionEpoch();
      untracked(() => {
        this.generation++;
        this.events.set([]);
        this.cursor.set(null);
        this.state.busy.set(false);
        void this.load();
      });
    });
  }
  async load(more = false): Promise<void> {
    const id = this.issueId(),
      generation = this.generation,
      epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const page = await this.api.history(id, more ? (this.cursor() ?? undefined) : undefined);
        if (generation !== this.generation || epoch !== this.auth.sessionEpoch()) return;
        this.events.update(items => (more ? [...items, ...page.items] : page.items));
        this.cursor.set(page.nextCursor);
      },
      () => generation === this.generation && epoch === this.auth.sessionEpoch(),
    );
  }
}
