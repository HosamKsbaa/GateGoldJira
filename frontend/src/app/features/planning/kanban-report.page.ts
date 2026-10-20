import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { KanbanReport } from '../../api/generated/types.gen';
import { statusCategory, statusName } from '../boards/board-workflow';
import { PlanningApi } from './planning.api';
import { ProjectsApi } from '../projects/projects.api';
@Component({
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/projects" class="breadcrumb">Projects</a
    ><header class="page-heading"
      ><div
        ><p class="eyebrow">{{ project.value()?.name ?? 'Project' }}</p
        ><h1>Kanban reports</h1><p>Understand delivery pace and spot work that needs help.</p></div
      ></header
    >
    <nav class="planning-tabs" aria-label="Project views"
      ><a [routerLink]="['/projects', projectId()]">Overview</a
      ><a [routerLink]="['/projects', projectId(), 'planning']">Planning</a
      ><span aria-current="page">Reports</span
      ><a [routerLink]="['/backlog', projectId()]">Backlog</a></nav
    >
    <form [formGroup]="dates" (ngSubmit)="load(false)" class="report-range"
      ><label>From<input type="date" formControlName="from" /></label
      ><label>Through<input type="date" formControlName="through" /></label
      ><button type="submit" [disabled]="dates.invalid || loading()">{{
        loading() ? 'Loading…' : 'Update report'
      }}</button
      ><span>Inclusive dates · UTC · Up to 366 days</span></form
    >
    @if (error()) {
      <p class="notice error" role="alert">{{ error() }}</p>
    }
    @if (loading()) {
      <p role="status">Loading report…</p>
    }
    @if (report(); as current) {
      <div class="metric-grid"
        ><article
          ><span>Completed cycles</span><strong>{{ current.completedCycles }}</strong
          ><small>During {{ current.from }} – {{ current.through }}</small></article
        ><article
          ><span>Average cycle time</span
          ><strong>{{
            current.averageCycleDays === null ? '—' : number(current.averageCycleDays) + ' days'
          }}</strong
          ><small>{{ current.measuredCycles }} cycles with a recorded start</small></article
        ><article
          ><span>Active board work</span><strong>{{ current.activeCount }}</strong
          ><small>Current unfinished work, including To do</small></article
        ><article
          ><span>Blocked work</span><strong class="blocked">{{ current.blockedCount }}</strong
          ><small>Currently waiting for an unfinished blocker</small></article
        ></div
      >
      <section class="report-section"
        ><h2>Daily throughput</h2
        ><p class="muted">Each completion is counted, including a completion after reopening.</p>
        @if (!current.days.length) {
          <div class="empty-state"
            >No recorded completions in this date range. Move finished work to a Done stage to start
            measuring delivery.</div
          >
        } @else {
          <table class="throughput"
            ><caption class="sr-only">Completed cycles by UTC day</caption
            ><thead
              ><tr><th>Day</th><th>Completed cycles</th><th class="sr-only">Chart</th></tr></thead
            ><tbody>
              @for (day of current.days; track day.day) {
                <tr
                  ><th scope="row">{{ day.day }}</th
                  ><td>{{ day.completedCycles }}</td
                  ><td class="bar-cell"
                    ><span
                      class="bar"
                      [style.width.%]="barWidth(day.completedCycles)"
                      aria-hidden="true"
                    ></span></td
                ></tr>
              }</tbody
          ></table>
        }
      </section>
      <section class="report-section"
        ><div class="section-heading"
          ><h2>Aging and blocked work</h2
          ><span class="muted">Current snapshot · {{ snapshot(current.snapshotAt) }}</span></div
        ><p class="muted"
          >Cycle age follows recorded transitions. Work age follows creation. A dash means work has
          no recorded start.</p
        ><div class="table-scroll"
          ><table
            ><caption class="sr-only">Current unfinished issues on the active board</caption
            ><thead
              ><tr
                ><th>Issue</th><th>Assignee</th><th>Cycle age</th><th>Work age</th
                ><th>Blockers</th></tr
              ></thead
            ><tbody>
              @for (issue of current.work.items; track issue.id) {
                <tr [class.is-blocked]="issue.unfinishedBlockers > 0"
                  ><td
                    ><a [routerLink]="['/issues', issue.id]"
                      ><strong>{{ issue.key }}</strong> <span dir="auto">{{ issue.title }}</span></a
                    ><small>{{ stageLabel(issue.status, issue.stageName) }}</small></td
                  ><td dir="auto">{{ issue.assignee?.displayName ?? 'Unassigned' }}</td
                  ><td>{{
                    issue.cycleAgeDays === null ? '—' : number(issue.cycleAgeDays) + ' d'
                  }}</td
                  ><td>{{ number(issue.workAgeDays) }} d</td
                  ><td>
                    @if (issue.unfinishedBlockers) {
                      <span class="blocked-tag">{{ issue.unfinishedBlockers }} unfinished</span>
                    } @else {
                      <span class="muted">None</span>
                    }
                  </td></tr
                >
              }
              @if (!current.work.items.length) {
                <tr><td colspan="5">No active unfinished issues.</td></tr>
              }
            </tbody></table
          ></div
        >
        @if (current.work.nextCursor) {
          <button type="button" class="secondary" [disabled]="loading()" (click)="load(true)"
            >Load more active work</button
          >
        }
      </section>
      <details class="definition"
        ><summary>How these numbers are calculated</summary><p>{{ current.definition }}</p
        ><p
          >No last-updated timestamp is used to measure cycle time. Board stage names can change
          without rewriting recorded timing history.</p
        ></details
      >
    }
  `,
  styles: `
    :host {
      display: block;
      max-width: 1240px;
      margin: auto;
    }
    .breadcrumb {
      font-size: 13px;
    }
    .page-heading p {
      color: var(--color-muted);
    }
    .planning-tabs {
      display: flex;
      gap: 24px;
      border-bottom: 1px solid var(--color-border);
      margin-bottom: 24px;
    }
    .planning-tabs a,
    .planning-tabs span {
      padding: 12px 0;
      text-decoration: none;
    }
    .planning-tabs span {
      border-bottom: 2px solid var(--color-brand);
      font-weight: 600;
      color: var(--color-brand);
    }
    .report-range {
      display: flex;
      gap: 14px;
      align-items: end;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .report-range label {
      display: grid;
      gap: 7px;
      font-size: 13px;
      font-weight: 600;
    }
    .report-range > span {
      font-size: 12px;
      color: var(--color-muted);
      padding-bottom: 10px;
    }
    .metric-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
    }
    .metric-grid article {
      border: 1px solid var(--color-border);
      border-radius: 10px;
      padding: 20px;
      display: grid;
      gap: 12px;
    }
    .metric-grid article > span {
      font-size: 13px;
      color: var(--color-muted);
    }
    .metric-grid strong {
      font-size: 27px;
      font-weight: 650;
    }
    .metric-grid small {
      font-size: 11px;
      color: var(--color-muted);
      line-height: 1.5;
    }
    .blocked {
      color: #ae2a19;
    }
    .report-section {
      margin-top: 30px;
      padding: 24px;
      border: 1px solid var(--color-border);
      border-radius: 10px;
    }
    .report-section h2 {
      font-size: 18px;
      margin: 0 0 12px;
    }
    .muted {
      font-size: 12px;
      color: var(--color-muted);
      line-height: 1.6;
    }
    .section-heading {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
    }
    .table-scroll {
      overflow-x: auto;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th,
    td {
      text-align: start;
      border-bottom: 1px solid var(--color-border);
      padding: 12px 10px;
      vertical-align: middle;
    }
    thead th {
      font-size: 12px;
      color: var(--color-muted);
      background: #f7f8f9;
    }
    td a {
      color: var(--color-text);
      text-decoration: none;
      display: block;
      overflow-wrap: anywhere;
      min-width: 200px;
    }
    td a:hover {
      color: var(--color-brand);
    }
    td a strong {
      color: var(--color-brand);
      margin-inline-end: 7px;
    }
    td small {
      display: block;
      color: var(--color-muted);
      font-size: 11px;
      margin-top: 6px;
    }
    .is-blocked {
      background: #fffaf0;
    }
    .blocked-tag {
      font-size: 11px;
      background: #fff1e0;
      color: #a54800;
      border-radius: 4px;
      padding: 4px 6px;
      white-space: nowrap;
    }
    .bar-cell {
      width: 60%;
    }
    .bar {
      display: block;
      min-width: 4px;
      height: 12px;
      background: #579dff;
      border-radius: 3px;
    }
    .throughput tbody th {
      font-weight: 500;
    }
    .definition {
      margin: 24px 0;
      padding: 18px;
      background: #f7f8f9;
      border-radius: 8px;
      font-size: 13px;
    }
    .definition summary {
      cursor: pointer;
      font-weight: 600;
    }
    .definition p {
      line-height: 1.7;
      color: var(--color-muted);
    }
    .empty-state {
      padding: 24px;
      background: #f7f8f9;
      border-radius: 6px;
      color: var(--color-muted);
      font-size: 13px;
      line-height: 1.7;
    }
    @media (max-width: 900px) {
      .metric-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    @media (max-width: 600px) {
      .report-section {
        padding: 16px;
      }
      .metric-grid {
        gap: 10px;
      }
      .metric-grid article {
        padding: 14px;
      }
      .metric-grid strong {
        font-size: 23px;
      }
      .planning-tabs {
        gap: 16px;
        font-size: 13px;
      }
      .section-heading {
        align-items: start;
        flex-direction: column;
      }
      .report-range label {
        flex: 1;
        min-width: 130px;
      }
      .bar-cell {
        width: 35%;
      }
    }
  `,
})
export class KanbanReportPage {
  stageLabel(status: string, name?: string): string {
    return name ?? statusName(statusCategory(status));
  }
  private readonly api = inject(PlanningApi);
  private readonly projects = inject(ProjectsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly projectId = computed(() => this.params().get('projectId') ?? '');
  readonly project = resource({
    params: () => this.projectId(),
    loader: ({ params }) => this.projects.get(params),
  });
  readonly dates = new FormGroup({
    from: new FormControl(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    through: new FormControl(new Date().toISOString().slice(0, 10), {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  private loadGeneration = 0;
  readonly report = signal<KanbanReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  constructor() {
    effect(() => {
      this.projectId();
      untracked(() => {
        this.report.set(null);
        void this.load(false);
      });
    });
  }
  number(value: number) {
    return new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(value);
  }
  snapshot(value: string) {
    return (
      new Intl.DateTimeFormat('en', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'UTC',
      }).format(new Date(value)) + ' UTC'
    );
  }
  barWidth(count: number) {
    return (
      (count / Math.max(1, ...(this.report()?.days.map(day => day.completedCycles) ?? []))) * 100
    );
  }
  async load(append: boolean) {
    if (this.dates.invalid || (append && this.loading())) return;
    const generation = ++this.loadGeneration;
    const projectId = this.projectId();
    this.loading.set(true);
    this.error.set('');
    const values = this.dates.getRawValue();
    try {
      const previous = this.report();
      const page = await this.api.report(
        projectId,
        append && previous ? previous.from : values.from,
        append && previous ? previous.through : values.through,
        append ? (previous?.work.nextCursor ?? undefined) : undefined,
      );
      if (generation !== this.loadGeneration || projectId !== this.projectId()) return;
      this.report.set(
        append && previous
          ? { ...page, work: { ...page.work, items: [...previous.work.items, ...page.work.items] } }
          : page,
      );
    } catch (error) {
      if (generation === this.loadGeneration)
        this.error.set(error instanceof Error ? error.message : 'The report could not be loaded.');
    } finally {
      if (generation === this.loadGeneration) this.loading.set(false);
    }
  }
}
