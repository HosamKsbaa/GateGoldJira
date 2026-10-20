import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
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
import type {
  PlanningItemView,
  PlanningCreateFields,
  PlanningUpdateFields,
  PlanningIssueSummary,
} from '../../api/generated/types.gen';
import { statusCategory, statusName } from '../boards/board-workflow';
import { PlanningApi } from './planning.api';
import { ProjectsApi } from '../projects/projects.api';
import { AuthService } from '../../core/auth/auth.service';
import { RetryIntent } from '../../core/api/api-result';
@Component({
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/projects" class="breadcrumb">Projects</a>
    <header class="page-heading"
      ><div
        ><p class="eyebrow">{{ project.value()?.name ?? 'Project' }}</p
        ><h1>Planning</h1
        ><p
          >Group work into epics and releases. Track targets and progress without changing your
          Kanban workflow.</p
        ></div
      >
      @if (canEdit()) {
        <button type="button" (click)="create()">Create epic or release</button>
      }
    </header>
    <nav class="planning-tabs" aria-label="Project views"
      ><a [routerLink]="['/projects', projectId()]">Overview</a
      ><span aria-current="page">Planning</span
      ><a [routerLink]="['/projects', projectId(), 'reports']">Reports</a
      ><a [routerLink]="['/backlog', projectId()]">Backlog</a></nav
    >
    @if (error()) {
      <div class="notice error" role="alert"
        >{{ error() }} <button type="button" (click)="reload()">Reload planning</button></div
      >
    }
    @if (loading()) {
      <p role="status">Loading planning…</p>
    }
    <div class="planning-list">
      @for (item of items(); track item.id) {
        <article class="planning-card"
          ><div class="card-heading"
            ><span class="kind">{{ item.kind === 'epic' ? 'Epic' : 'Release' }}</span
            ><span class="status" [class.complete]="item.status === 'complete'">{{
              item.status
            }}</span></div
          ><h2 dir="auto">{{ item.name }}</h2
          ><p dir="auto" class="description">{{ item.description || 'No description yet.' }}</p
          ><div class="progress-label"
            ><span>{{ item.completedCount }} / {{ item.issueCount }} issues done</span
            ><strong>{{ percent(item) }}%</strong></div
          ><progress
            [value]="item.completedCount"
            [max]="item.issueCount || 1"
            [attr.aria-label]="item.name + ' completion'"
          ></progress
          ><div class="card-footer"
            ><span>{{ item.targetDate ? 'Target ' + item.targetDate : 'No target date' }}</span
            ><div
              ><button class="secondary" type="button" (click)="showIssues(item)"
                >View issues</button
              >
              @if (canEdit()) {
                <button class="secondary" type="button" (click)="edit(item)"
                  >Edit {{ item.kind }}</button
                >
              }
            </div></div
          ></article
        >
      }
      @if (!loading() && !items().length) {
        <div class="empty-state"
          ><h2>Plan the next piece of work</h2
          ><p
            >Create an epic to group a larger goal, or a release to coordinate delivery. Assign
            issues from their Planning section.</p
          >
          @if (canEdit()) {
            <button type="button" (click)="create()">Create your first epic or release</button>
          }
        </div>
      }
    </div>
    @if (nextCursor()) {
      <button type="button" class="secondary" [disabled]="loading()" (click)="loadMore()"
        >Load more planning items</button
      >
    }
    @if (editing()) {
      <section class="editor" aria-label="Planning editor"
        ><div class="editor-heading"
          ><h2>{{ selected() ? 'Edit ' + selected()?.kind : 'Create epic or release' }}</h2
          ><button type="button" class="secondary" [disabled]="saving()" (click)="cancel()"
            >Cancel</button
          ></div
        ><form [formGroup]="form" (ngSubmit)="save()"
          ><label
            >Kind<select formControlName="kind"
              ><option value="epic">Epic</option
              ><option value="release">Release</option></select
            ></label
          ><label>Name<input formControlName="name" maxlength="100" dir="auto" /></label
          ><label
            >Description<textarea
              formControlName="description"
              maxlength="2000"
              rows="3"
              dir="auto"
            ></textarea></label
          ><div class="form-row"
            ><label>Target date<input type="date" formControlName="targetDate" /></label
            ><label
              >Status<select formControlName="status"
                ><option value="planned">Planned</option
                ><option value="active">Active</option
                ><option value="complete">Complete</option></select
              ></label
            ></div
          ><p class="muted"
            >Progress comes from assigned issues. Marking this
            {{ form.controls.kind.value }} complete does not change issue statuses.</p
          ><div class="editor-actions"
            ><button type="submit" [disabled]="form.invalid || saving()">{{
              saving() ? 'Saving…' : 'Save planning item'
            }}</button></div
          ></form
        ></section
      >
    }
    @if (issueSelection()) {
      <section class="linked-work"
        ><header
          ><h2 dir="auto">Issues in {{ issueSelection()?.name }}</h2
          ><button type="button" class="secondary" (click)="closeIssues()"
            >Close issues</button
          ></header
        >
        @if (issueError()) {
          <p role="alert">{{ issueError() }}</p>
        }
        @if (issueLoading()) {
          <p role="status">Loading linked issues…</p>
        }
        <ul>
          @for (issue of linkedIssues(); track issue.id) {
            <li
              ><a [routerLink]="['/issues', issue.id]"
                ><strong>{{ project.value()?.key }}-{{ issue.number }}</strong
                ><span dir="auto">{{ issue.title }}</span></a
              ><span>{{ stageLabel(issue.status, issue.stageName) }}</span></li
            >
          }
        </ul>
        @if (!issueLoading() && !linkedIssues().length) {
          <p
            >No issues assigned yet. Open an issue and choose this {{ issueSelection()?.kind }} in
            Planning.</p
          >
        }
        @if (issueCursor()) {
          <button
            type="button"
            class="secondary"
            [disabled]="issueLoading()"
            (click)="loadMoreIssues()"
            >Load more linked issues</button
          >
        }
      </section>
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
      max-width: 680px;
      line-height: 1.6;
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
    .planning-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
      margin-bottom: 20px;
    }
    .planning-card {
      padding: 22px;
      border: 1px solid var(--color-border);
      border-radius: 10px;
      background: white;
      min-width: 0;
    }
    .card-heading,
    .progress-label,
    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .kind {
      font-size: 12px;
      color: var(--color-brand);
      font-weight: 650;
    }
    .status {
      font-size: 11px;
      text-transform: uppercase;
      background: #f1f2f4;
      padding: 4px 7px;
      border-radius: 4px;
    }
    .status.complete {
      background: #dcfff1;
      color: #216e4e;
    }
    .planning-card h2 {
      font-size: 19px;
      margin: 14px 0 10px;
      overflow-wrap: anywhere;
    }
    .description {
      min-height: 42px;
      line-height: 1.6;
      color: var(--color-muted);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .progress-label,
    .card-footer {
      font-size: 12px;
      color: var(--color-muted);
    }
    progress {
      display: block;
      width: 100%;
      height: 8px;
      accent-color: var(--color-brand);
      margin: 10px 0 20px;
    }
    .card-footer > div {
      display: flex;
      gap: 6px;
    }
    .editor,
    .linked-work {
      padding: 24px;
      border: 1px solid var(--color-border);
      border-radius: 10px;
      margin-top: 24px;
      background: #fafbfc;
    }
    .editor-heading,
    .linked-work header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    .editor h2,
    .linked-work h2 {
      font-size: 18px;
    }
    .editor form {
      max-width: 760px;
      display: grid;
      gap: 16px;
    }
    .editor label {
      display: grid;
      gap: 7px;
      font-size: 13px;
      font-weight: 600;
    }
    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }
    .muted {
      font-size: 12px;
      color: var(--color-muted);
      line-height: 1.6;
    }
    .editor-actions {
      padding-top: 12px;
      border-top: 1px solid var(--color-border);
    }
    .linked-work ul {
      padding: 0;
      list-style: none;
    }
    .linked-work li {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 0;
      border-bottom: 1px solid var(--color-border);
      font-size: 13px;
    }
    .linked-work li a {
      display: flex;
      gap: 12px;
      min-width: 0;
    }
    .linked-work li span {
      overflow-wrap: anywhere;
    }
    .empty-state {
      grid-column: 1/-1;
      padding: 36px;
      text-align: center;
      border: 1px dashed var(--color-border);
      border-radius: 10px;
    }
    .empty-state p {
      color: var(--color-muted);
      line-height: 1.7;
      max-width: 600px;
      margin: 12px auto 24px;
    }
    @media (max-width: 760px) {
      .planning-list {
        grid-template-columns: 1fr;
      }
      .page-heading {
        align-items: start;
        flex-direction: column;
      }
      .card-footer {
        align-items: start;
        flex-direction: column;
      }
      .form-row {
        grid-template-columns: 1fr;
      }
      .planning-tabs {
        gap: 16px;
        font-size: 13px;
      }
      .editor,
      .linked-work {
        padding: 16px;
      }
    }
  `,
})
export class ProjectPlanningPage {
  stageLabel(status: string, name?: string): string {
    return name ?? statusName(statusCategory(status));
  }
  private readonly api = inject(PlanningApi);
  private readonly auth = inject(AuthService);
  private readonly destroy = inject(DestroyRef);
  private editorGeneration = 0;
  private readonly route = inject(ActivatedRoute);
  private readonly projects = inject(ProjectsApi);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly projectId = computed(() => this.params().get('projectId') ?? '');
  readonly project = resource({
    params: () => this.projectId(),
    loader: ({ params }) => this.projects.get(params),
  });
  readonly canEdit = computed(() => {
    const p = this.project.value();
    return !!p && !p.archived && p.effectiveRole !== 'viewer';
  });
  readonly items = signal<PlanningItemView[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly editing = signal(false);
  readonly selected = signal<PlanningItemView | null>(null);
  readonly saving = signal(false);
  readonly issueSelection = signal<PlanningItemView | null>(null);
  readonly linkedIssues = signal<PlanningIssueSummary[]>([]);
  readonly issueCursor = signal<string | null>(null);
  readonly issueLoading = signal(false);
  readonly issueError = signal('');
  readonly form = new FormGroup({
    kind: new FormControl<'epic' | 'release'>('epic', { nonNullable: true }),
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    description: new FormControl('', { nonNullable: true }),
    targetDate: new FormControl('', { nonNullable: true }),
    status: new FormControl<'planned' | 'active' | 'complete'>('planned', { nonNullable: true }),
  });
  private loadGeneration = 0;
  private issueGeneration = 0;
  private readonly createIntent = new RetryIntent<PlanningCreateFields>();
  private readonly updateIntent = new RetryIntent<PlanningUpdateFields>();
  constructor() {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (this.editing() && (this.form.dirty || this.saving())) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    this.destroy.onDestroy(() => {
      window.removeEventListener('beforeunload', beforeUnload);
      ++this.editorGeneration;
      ++this.loadGeneration;
      ++this.issueGeneration;
    });
    effect(() => {
      this.projectId();
      this.auth.sessionEpoch();
      untracked(() => {
        this.cancel();
        this.closeIssues();
        this.items.set([]);
        this.nextCursor.set(null);
        void this.reload();
      });
    });
  }
  percent(item: PlanningItemView) {
    return item.issueCount ? Math.round((item.completedCount / item.issueCount) * 100) : 0;
  }
  async reload() {
    await this.load(false);
  }
  async loadMore() {
    await this.load(true);
  }
  private async load(append: boolean) {
    const generation = ++this.loadGeneration;
    const projectId = this.projectId();
    this.loading.set(true);
    this.error.set('');
    try {
      const page = await this.api.list(
        projectId,
        undefined,
        append ? (this.nextCursor() ?? undefined) : undefined,
      );
      if (generation !== this.loadGeneration || projectId !== this.projectId()) return;
      this.items.set(append ? [...this.items(), ...page.items] : page.items);
      this.nextCursor.set(page.nextCursor);
    } catch (error) {
      if (generation === this.loadGeneration)
        this.error.set(error instanceof Error ? error.message : 'Planning could not be loaded.');
    } finally {
      if (generation === this.loadGeneration) this.loading.set(false);
    }
  }
  create() {
    ++this.editorGeneration;
    this.selected.set(null);
    this.form.reset({ kind: 'epic', name: '', description: '', targetDate: '', status: 'planned' });
    this.form.controls.kind.enable();
    this.editing.set(true);
    this.createIntent.finish();
  }
  edit(item: PlanningItemView) {
    ++this.editorGeneration;
    this.selected.set(item);
    this.form.reset({
      kind: item.kind,
      name: item.name,
      description: item.description,
      targetDate: item.targetDate ?? '',
      status: item.status,
    });
    this.form.controls.kind.disable();
    this.editing.set(true);
    this.updateIntent.finish();
  }
  mayLeave(): boolean {
    return !this.editing() || (!this.form.dirty && !this.saving()) || window.confirm(this.saving()
      ? 'This planning change is still being saved. Leave this editor?'
      : 'Discard unsaved planning changes and leave this editor?');
  }
  cancel() {
    ++this.editorGeneration;
    this.saving.set(false);
    this.error.set('');
    this.editing.set(false);
    this.selected.set(null);
  }
  async save() {
    if (this.form.invalid || this.saving()) return;
    const projectId = this.projectId(), epoch = this.auth.sessionEpoch(), generation = this.editorGeneration;
    const current = () => !this.destroy.destroyed && projectId === this.projectId() && epoch === this.auth.sessionEpoch() && generation === this.editorGeneration;
    this.saving.set(true);
    this.error.set('');
    const values = this.form.getRawValue();
    const fields = {
      name: values.name.trim(),
      description: values.description,
      targetDate: values.targetDate || null,
      status: values.status,
    };
    try {
      const selected = this.selected();
      if (selected) {
        const body: PlanningUpdateFields = { ...fields, expectedRevision: selected.revision };
        await this.api.update(
          projectId,
          selected.id,
          body,
          this.updateIntent.reference(body),
        );
        if (!current()) return;
        this.updateIntent.finish();
      } else {
        const body: PlanningCreateFields = { ...fields, kind: values.kind };
        await this.api.create(projectId, body, this.createIntent.reference(body));
        if (!current()) return;
        this.createIntent.finish();
      }
      this.cancel();
      await this.reload();
    } catch (error) {
      if (current()) this.error.set(error instanceof Error ? error.message : 'Planning could not be saved.');
    } finally {
      if (current()) this.saving.set(false);
    }
  }
  async showIssues(item: PlanningItemView) {
    this.issueSelection.set(item);
    this.linkedIssues.set([]);
    this.issueCursor.set(null);
    await this.fetchIssues(false);
  }
  async loadMoreIssues() {
    await this.fetchIssues(true);
  }
  closeIssues() {
    ++this.issueGeneration;
    this.issueSelection.set(null);
    this.linkedIssues.set([]);
    this.issueCursor.set(null);
    this.issueLoading.set(false);
  }
  private async fetchIssues(append: boolean) {
    const selected = this.issueSelection();
    if (!selected) return;
    const generation = ++this.issueGeneration;
    const projectId = this.projectId();
    this.issueLoading.set(true);
    this.issueError.set('');
    try {
      const page = await this.api.issues(
        projectId,
        selected.id,
        append ? (this.issueCursor() ?? undefined) : undefined,
      );
      if (
        generation !== this.issueGeneration ||
        projectId !== this.projectId() ||
        this.issueSelection()?.id !== selected.id
      )
        return;
      this.linkedIssues.set(append ? [...this.linkedIssues(), ...page.items] : page.items);
      this.issueCursor.set(page.nextCursor);
    } catch (error) {
      if (generation === this.issueGeneration)
        this.issueError.set(
          error instanceof Error ? error.message : 'Linked issues could not be loaded.',
        );
    } finally {
      if (generation === this.issueGeneration) this.issueLoading.set(false);
    }
  }
}
