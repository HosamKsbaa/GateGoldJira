import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AdministrationApi } from '../../administration.api';
import { ProjectsApi } from '../../../projects/projects.api';
import type {
  ActivityView,
  ListActivityData,
  ProjectView,
} from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { focusAfterRender } from '../../../../shared/ui/focus-after-render';

type ResourceKind =
  | ''
  | 'user'
  | 'project'
  | 'issue'
  | 'board'
  | 'comment'
  | 'picture'
  | 'notification'
  | 'attachment'
  | 'label';
const idControl = () =>
  new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.pattern(
        /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
      ),
    ],
  });
@Component({
  imports: [ReactiveFormsModule, RouterLink, RequestStatusComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-heading"
      ><div
        ><p class="eyebrow">Administration</p><h1>Company activity</h1
        ><p class="muted">See who changed work, access and settings.</p></div
      ><button type="button" class="secondary" (click)="refresh()" [disabled]="state.busy()"
        ><gg-icon name="refresh" /> Refresh activity</button
      ></header
    >
    <gg-request-status [state]="state" />
    <section class="activity-filter-panel" aria-label="Filter history"
      ><form
        [formGroup]="form"
        (ngSubmit)="apply(true)"
        [attr.aria-busy]="searchPending() || state.busy()"
      >
        <div class="activity-filter-grid"
          ><label
            >Issue key<input
              id="activity-issue-key"
              formControlName="issueKey"
              placeholder="DEMO-2"
              autocomplete="off"
              [attr.aria-busy]="searchPending() || state.busy()"
              aria-describedby="history-live-search-help"
              (keydown.enter)="$event.preventDefault(); apply(true)" /></label
          ><label
            >Project<select formControlName="projectId"
              ><option value="">All projects</option>
              @for (project of projects(); track project.id) {
                <option [value]="project.id">{{ project.key }} · {{ project.name }}</option>
              }
            </select></label
          ><label>From date<input type="date" formControlName="fromDate" /></label
          ><label>To date<input type="date" formControlName="toDate" /></label
        ></div>
        <p id="history-live-search-help" class="filter-help"
          >Results update as you type a complete issue key or change filters. Dates use the company
          calendar, {{ auth.me()?.companyTimeZone }}.</p
        ><gg-request-status [state]="projectState" />
        @if (projectCursor()) {
          <button
            type="button"
            class="secondary"
            (click)="loadProjects(projectCursor() ?? undefined)"
            [disabled]="projectState.busy()"
            >Load more projects</button
          >
        }
        <details class="advanced-filters"
          ><summary>Advanced resource filters</summary
          ><div class="activity-filter-grid"
            ><label
              >Resource kind<select formControlName="resourceKind"
                ><option value="">All resources</option
                ><option value="user">User</option
                ><option value="project">Project</option
                ><option value="issue">Issue</option
                ><option value="board">Board</option
                ><option value="comment">Comment</option
                ><option value="picture">Picture</option
                ><option value="attachment">Attachment</option
                ><option value="label">Label</option
                ><option value="notification">Notification read state</option></select
              ></label
            ><label
              >Resource identifier<input
                id="activity-resource"
                formControlName="resourceId"
                aria-describedby="activity-filter-help"
                (keydown.enter)="$event.preventDefault(); apply(true)" /></label></div
          ><p id="activity-filter-help" class="filter-help"
            >Use a UUID with a resource kind for a specific record. Issue history also includes
            related changes.</p
          ></details
        >
        @if (filterError()) {
          <p role="alert" class="error">{{ filterError() }}</p>
        }
        <div class="actions">
          @if (state.message()) {
            <button type="submit" class="secondary" [disabled]="form.invalid || state.busy()"
              >Retry history search</button
            >
          }
          <button type="button" class="secondary" (click)="reset()"
            >Clear history filters</button
          ></div
        >
      </form></section
    >
    <p id="activity-status" tabindex="-1" role="status" class="activity-status">
      @if (searchPending() || state.busy()) {
        Searching activity…
      } @else if (!filterError()) {
        {{ total() }} matching events. {{ notice() }}
      }
    </p>
    <section aria-label="Activity events">
      @if (!items().length && !searchPending() && !state.busy() && !filterError()) {
        <div class="activity-empty"
          ><gg-icon name="activity" /><h2>No activity matches these filters</h2
          ><p>Try a wider date range or another issue key.</p></div
        >
      }
      <ol class="activity-events">
        @for (event of items(); track event.id) {
          <li
            ><article class="activity-event" [attr.data-activity-id]="event.id"
              ><span class="activity-avatar" aria-hidden="true">{{
                initials(event.actor.displayName)
              }}</span
              ><div class="event-content"
                ><h2
                  ><bdi>{{ event.actor.displayName }}</bdi> {{ event.actionSummary }}</h2
                ><div class="event-context">
                  @if (event.issueKey) {
                    <a [routerLink]="['/issues', event.issueId || event.resourceId]"
                      ><bdi>{{ event.issueKey }}</bdi></a
                    >
                  }
                  <span dir="auto">{{ event.resourceName }}</span>
                  @if (event.projectName) {
                    <span class="muted" dir="auto">{{ event.projectName }}</span>
                  }</div
                ><p class="event-time"
                  ><time [attr.datetime]="event.createdAt">{{ formatDate(event.createdAt) }}</time
                  ><span>·</span
                  >{{
                    event.action === 'schedule_due_reminder'
                      ? 'Automated reminder'
                      : event.channel === 'mcp'
                        ? 'MCP'
                        : 'Web'
                  }}</p
                >
                @if (event.changes.length) {
                  <p class="event-summary">Changed {{ changeSummary(event) }}</p>
                }
                <details class="event-details"
                  ><summary>View change details</summary
                  ><dl class="activity-changes">
                    @for (change of event.changes; track $index) {
                      <dt>{{ fieldLabel(change.field) }}</dt
                      ><dd
                        ><span class="muted">Before:</span>
                        <span dir="auto" class="preserve-space">{{
                          change.before ?? '(empty)'
                        }}</span></dd
                      ><dd
                        ><span class="muted">After:</span>
                        <span dir="auto" class="preserve-space">{{
                          change.after ?? '(empty)'
                        }}</span></dd
                      >
                    }</dl
                  ><p class="technical-id"
                    >Event <bdi>{{ event.id }}</bdi> · {{ event.resourceKind }}
                    <bdi>{{ event.resourceId }}</bdi></p
                  ></details
                >
              </div></article
            ></li
          >
        }</ol
      ><div class="actions">
        @if (pastFirst()) {
          <button type="button" class="secondary" (click)="refresh()" [disabled]="state.busy()"
            >First activity page</button
          >
        }
        @if (cursor()) {
          <button type="button" (click)="next()" [disabled]="state.busy()"
            >Next activity page</button
          >
        }
      </div>
    </section>
  `,
  styles: `
    .activity-filter-panel {
      padding: 20px;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: white;
    }
    .activity-filter-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
    }
    .filter-help,
    .activity-status {
      font-size: 13px;
      color: var(--color-muted);
    }
    .advanced-filters {
      margin: 16px 0;
    }
    .advanced-filters summary {
      cursor: pointer;
      color: var(--color-muted);
      font-size: 13px;
    }
    .advanced-filters .activity-filter-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-top: 16px;
    }
    .activity-events {
      padding: 0;
      list-style: none;
      margin: 20px 0;
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .activity-events:empty {
      display: none;
    }
    .activity-event {
      display: flex;
      gap: 14px;
      padding: 20px;
      background: white;
      border-bottom: 1px solid var(--color-border);
    }
    .activity-events > li:last-child .activity-event {
      border-bottom: 0;
    }
    .activity-avatar {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      flex: none;
      border-radius: 50%;
      background: #e9f2ff;
      color: #0c66e4;
      font-size: 12px;
      font-weight: 600;
    }
    .event-content {
      min-width: 0;
      flex: 1;
    }
    .event-content h2 {
      font-size: 14px;
      line-height: 1.5;
      font-weight: 400;
      margin: 0;
    }
    .event-content h2 bdi {
      font-weight: 600;
    }
    .event-context {
      display: flex;
      gap: 10px;
      align-items: baseline;
      flex-wrap: wrap;
      font-size: 13px;
      margin-top: 7px;
    }
    .event-context > span {
      overflow-wrap: anywhere;
    }
    .event-context a {
      font-weight: 600;
    }
    .event-time {
      font-size: 12px;
      color: var(--color-muted);
      display: flex;
      gap: 7px;
      margin: 9px 0;
    }
    .event-summary {
      font-size: 13px;
      color: var(--color-muted);
      margin: 8px 0;
    }
    .event-details summary {
      font-size: 12px;
      color: var(--color-muted);
      cursor: pointer;
      min-height: 30px;
      display: flex;
      align-items: center;
    }
    .event-details summary:hover {
      color: var(--color-brand);
    }
    .activity-changes {
      font-size: 13px;
      padding: 12px;
      background: #f7f8f9;
      border-radius: 4px;
      overflow-wrap: anywhere;
    }
    .activity-changes dt {
      font-weight: 600;
      margin: 12px 0 6px;
    }
    .activity-changes dt:first-child {
      margin-top: 0;
    }
    .activity-changes dd {
      margin: 6px 0;
    }
    .technical-id {
      font-size: 11px;
      overflow-wrap: anywhere;
      color: var(--color-muted);
    }
    .activity-empty {
      text-align: center;
      border: 1px dashed var(--color-border);
      border-radius: var(--radius);
      padding: 44px 16px;
      color: var(--color-muted);
    }
    .activity-empty h2 {
      font-size: 16px;
      color: var(--color-text);
    }
    .activity-empty p {
      font-size: 13px;
    }
    @media (max-width: 1000px) {
      .activity-filter-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 600px) {
      .activity-filter-grid,
      .advanced-filters .activity-filter-grid {
        grid-template-columns: 1fr;
      }
      .activity-filter-panel {
        padding: 14px;
      }
      .activity-event {
        padding: 16px 12px;
        gap: 10px;
      }
      .activity-avatar {
        width: 28px;
        height: 28px;
      }
      .event-context {
        gap: 6px;
      }
      .page-heading > button {
        font-size: 12px;
        white-space: nowrap;
      }
      .page-heading > button gg-icon {
        display: none;
      }
    }
  `,
})
export class ActivityPage {
  private readonly api = inject(AdministrationApi);
  private readonly projectsApi = inject(ProjectsApi);
  readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  readonly searchPending = signal(false);
  readonly state = new RequestState();
  readonly projectState = new RequestState();
  readonly form = new FormGroup({
    resourceKind: new FormControl<ResourceKind>('', { nonNullable: true }),
    resourceId: idControl(),
    projectId: idControl(),
    issueKey: new FormControl('', {
      nonNullable: true,
      validators: [Validators.pattern(/^[A-Za-z][A-Za-z0-9]{1,9}-[1-9][0-9]*$/)],
    }),
    fromDate: new FormControl('', { nonNullable: true }),
    toDate: new FormControl('', { nonNullable: true }),
  });
  readonly items = signal<ActivityView[]>([]);
  readonly projects = signal<ProjectView[]>([]);
  readonly projectCursor = signal<string | null>(null);
  readonly cursor = signal<string | null>(null);
  readonly total = signal(0);
  readonly filterError = signal('');
  readonly notice = signal('');
  readonly pastFirst = signal(false);
  private filters: NonNullable<ListActivityData['query']> = {};
  private generation = 0;
  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.scheduleSearch());
    this.destroyRef.onDestroy(() => {
      this.cancelScheduledSearch();
      this.generation++;
    });
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      const current = this.auth.sessionEpoch();
      if (current !== epoch) {
        epoch = current;
        this.cancelScheduledSearch();
        this.generation++;
        this.items.set([]);
        this.projects.set([]);
        this.projectCursor.set(null);
        this.cursor.set(null);
        this.total.set(0);
        this.notice.set('');
        this.filterError.set('');
        this.filters = {};
        this.form.reset(undefined, { emitEvent: false });
        this.state.clear();
        this.state.busy.set(false);
        this.projectState.clear();
        this.projectState.busy.set(false);
      }
    });
    void this.refresh();
    void this.loadProjects();
  }
  private cancelScheduledSearch(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
    this.searchPending.set(false);
  }
  private filterValue(): NonNullable<ListActivityData['query']> | null {
    const value = this.form.getRawValue();
    this.filterError.set('');
    if (this.form.controls.issueKey.invalid) {
      this.filterError.set('Use a complete issue key, such as DEMO-2.');
      return null;
    }
    if (this.form.controls.resourceId.invalid || this.form.controls.projectId.invalid) {
      this.filterError.set('Use a complete UUID for the resource identifier.');
      return null;
    }
    if (!!value.resourceKind !== !!value.resourceId) {
      this.filterError.set('Supply resource kind and identifier together.');
      return null;
    }
    if (value.fromDate && value.toDate && value.fromDate > value.toDate) {
      this.filterError.set('The start date must be on or before the end date.');
      return null;
    }
    return {
      ...(value.resourceKind
        ? { resourceKind: value.resourceKind, resourceId: value.resourceId }
        : {}),
      ...(value.projectId ? { projectId: value.projectId } : {}),
      ...(value.issueKey ? { issueKey: value.issueKey.trim().toLocaleUpperCase() } : {}),
      ...(value.fromDate ? { fromDate: value.fromDate } : {}),
      ...(value.toDate ? { toDate: value.toDate } : {}),
    };
  }
  private scheduleSearch(): void {
    this.cancelScheduledSearch();
    this.generation++;
    this.state.busy.set(false);
    this.state.clear();
    this.items.set([]);
    this.cursor.set(null);
    this.total.set(0);
    this.notice.set('');
    this.pastFirst.set(false);
    const filters = this.filterValue();
    if (!filters) return;
    this.filters = filters;
    this.searchPending.set(true);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      void this.apply();
    }, 120);
  }
  async loadProjects(cursor?: string): Promise<void> {
    const epoch = this.auth.sessionEpoch();
    const current = () => !this.destroyRef.destroyed && epoch === this.auth.sessionEpoch();
    await this.projectState.run(async () => {
      const page = await this.projectsApi.list(true, cursor);
      if (!current()) return;
      this.projects.update(values => (cursor ? [...values, ...page.items] : page.items));
      this.projectCursor.set(page.nextCursor);
    }, current);
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
  fieldLabel(field: string): string {
    const names: Readonly<Record<string, string>> = {
      assigneeId: 'Assignee',
      labelIds: 'Labels',
      dueDate: 'Due date',
      parentId: 'Parent issue',
      pictureIds: 'Pictures',
      mentionIds: 'Mentions',
      plainText: 'Text',
      safeHtml: 'Rich text',
      inAppEnabled: 'Inbox delivery',
      emailMode: 'Email delivery',
      dueReminders: 'Due reminders',
      events: 'Notification events',
      backlogRank: 'Backlog order',
      epicId: 'Epic',
      releaseId: 'Release',
      planningKind: 'Planning kind',
      planningStatus: 'Planning status',
      targetDate: 'Target date',
    };
    const last = field.split('.').at(-1) ?? field;
    return (
      names[last] ??
      last
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replaceAll('_', ' ')
        .replace(/^./, letter => letter.toUpperCase())
    );
  }
  changeSummary(event: ActivityView): string {
    return (
      [...new Set(event.changes.map(change => this.fieldLabel(change.field)))]
        .slice(0, 8)
        .join(', ') +
      (event.changes.length > 8 ? ' and more' : '') +
      '.'
    );
  }
  private async load(cursor?: string, focusStatus = false): Promise<void> {
    const generation = ++this.generation,
      epoch = this.auth.sessionEpoch(),
      filters = this.filters;
    const current = () =>
      !this.destroyRef.destroyed &&
      generation === this.generation &&
      epoch === this.auth.sessionEpoch();
    await this.state.run(async () => {
      const page = await this.api.activity(filters, cursor);
      if (!current()) return;
      this.items.set(page.items);
      this.cursor.set(page.nextCursor);
      this.total.set(page.totalMatching);
      this.pastFirst.set(!!cursor);
      this.notice.set(
        cursor
          ? 'Showing the next portion; earlier events remain in history.'
          : 'Showing the latest events.',
      );
      if (focusStatus) focusAfterRender('activity-status', this.injector);
    }, current);
  }
  async apply(focusStatus = false): Promise<void> {
    this.cancelScheduledSearch();
    this.generation++;
    this.state.busy.set(false);
    const filters = this.filterValue();
    if (!filters) {
      if (focusStatus && this.form.controls.resourceId.valid && this.form.controls.issueKey.valid)
        focusAfterRender('activity-resource', this.injector);
      return;
    }
    this.filters = filters;
    this.cursor.set(null);
    this.pastFirst.set(false);
    await this.load(undefined, focusStatus);
  }
  async reset(): Promise<void> {
    this.cancelScheduledSearch();
    this.generation++;
    this.state.busy.set(false);
    this.state.clear();
    this.form.reset(undefined, { emitEvent: false });
    this.filterError.set('');
    this.filters = {};
    await this.load(undefined, true);
  }
  async refresh(): Promise<void> {
    this.cancelScheduledSearch();
    if (!this.state.busy()) await this.load(undefined, true);
  }
  async next(): Promise<void> {
    const cursor = this.cursor();
    if (cursor && !this.searchPending() && !this.state.busy()) await this.load(cursor, true);
  }
}
