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
  AutomationRuleView,
  AutomationRuleFields,
  IssueUserSummary,
} from '../../api/generated/types.gen';
import { IntegrationsApi } from './integrations.api';
import { ProjectsApi } from '../projects/projects.api';
import { ProjectWorkflowsApi } from '../projects/project-workflows.api';
import { IssuesApi } from '../issues/issues.api';
import {
  SearchablePickerComponent,
  type PickerOption,
} from '../../shared/ui/searchable-picker.component';
import { RetryIntent } from '../../core/api/api-result';
import { AuthService } from '../../core/auth/auth.service';
@Component({
  imports: [ReactiveFormsModule, RouterLink, SearchablePickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<a [routerLink]="['/projects', projectId()]">← Project overview</a
    ><header class="page-heading"
      ><div
        ><p class="eyebrow">{{ project.value()?.name ?? 'Project' }}</p
        ><h1>Automation</h1><p>Assign work to a teammate when an issue enters a stage.</p></div
      >
      @if (canManage()) {
        <button type="button" (click)="create()">Create assignment rule</button>
      }</header
    ><p class="notice"
      >Rules run inside the issue move and keep the same permissions, completion checks and history.
      One enabled assignment rule is allowed per stage.</p
    >
    @if (error()) {
      <p class="notice error" role="alert"
        >{{ error() }}
        <button type="button" class="secondary" (click)="reload()">Reload rules</button></p
      >
    }
    @if (loading()) {
      <p role="status">Loading automation rules…</p>
    }
    <div class="rules">
      @for (rule of rules(); track rule.id) {
        <article
          ><div
            ><span class="rule-state" [class.enabled]="rule.enabled">{{
              rule.enabled ? 'Enabled' : 'Disabled'
            }}</span
            ><h2 dir="auto">{{ rule.name }}</h2
            ><p
              >When an issue enters <strong dir="auto">{{ stageName(rule) }}</strong
              >, assign it to <strong dir="auto">{{ rule.assignee.displayName }}</strong
              >.</p
            ></div
          >
          @if (canManage()) {
            <button type="button" class="secondary" (click)="edit(rule)">Edit rule</button>
          }
        </article>
      }
      @if (!rules().length && !loading()) {
        <div class="empty-state"
          ><h2>No assignment rules yet</h2
          ><p
            >For example, assign work entering Review to the person responsible for reviewing it.</p
          ></div
        >
      }
    </div>
    @if (cursor()) {
      <button type="button" class="secondary" [disabled]="loading()" (click)="more()"
        >Load more rules</button
      >
    }
    @if (editing() && canManage()) {
      <section class="editor"
        ><h2>{{ selected() ? 'Edit assignment rule' : 'Create assignment rule' }}</h2
        ><form [formGroup]="form" (ngSubmit)="save()"
          ><label
            >Rule name<input
              formControlName="name"
              maxlength="100"
              dir="auto"
              placeholder="Assign review to the reviewer" /></label
          ><label
            >When issue enters<select formControlName="stage">
              @for (stage of stages.value(); track stage.status) {
                <option [value]="stage.status">{{ stage.name }}</option>
              }
              @if (selected() && !hasStage(form.controls.stage.value)) {
                <option [value]="form.controls.stage.value"
                  >Retired stage · {{ form.controls.stage.value.split(':')[0] }}</option
                >
              }
            </select></label
          ><gg-searchable-picker
            label="Assign to"
            [options]="assigneeOptions()"
            [selected]="selectedAssignee()"
            [value]="form.controls.assigneeId.value ? [form.controls.assigneeId.value] : []"
            [loading]="assigneeLoading()"
            [hasMore]="!!assigneeCursor()"
            (searched)="searchAssignees($event)"
            (changed)="form.controls.assigneeId.setValue($event[0] ?? '')"
            (more)="moreAssignees()"
          /><label class="checkbox"
            ><input type="checkbox" formControlName="enabled" /> Enable this rule</label
          ><p class="help"
            >If the teammate loses project access or the stage is retired, the rule stops assigning
            work. Disable or update it to choose a replacement.</p
          ><div class="form-actions"
            ><button type="submit" [disabled]="saving() || form.invalid || stages.isLoading()">{{
              saving() ? 'Saving…' : 'Save assignment rule'
            }}</button
            ><button type="button" class="secondary" [disabled]="saving()" (click)="cancel()"
              >Cancel</button
            ></div
          ></form
        ></section
      >
    } `,
  styles: `
    :host {
      display: block;
      max-width: 1100px;
      margin: auto;
    }
    .page-heading p,
    .help {
      color: var(--color-muted);
      font-size: 13px;
      line-height: 1.7;
    }
    .rules {
      display: grid;
      gap: 14px;
    }
    .rules article {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
      border: 1px solid var(--color-border);
      border-radius: 9px;
      padding: 22px;
    }
    .rules h2 {
      font-size: 17px;
      margin: 10px 0;
    }
    .rules p {
      font-size: 13px;
      line-height: 1.7;
      color: var(--color-muted);
    }
    .rule-state {
      font-size: 11px;
      font-weight: 650;
      background: #f1f2f4;
      padding: 4px 6px;
      border-radius: 4px;
    }
    .rule-state.enabled {
      background: #dcfff1;
      color: #216e4e;
    }
    .empty-state {
      text-align: center;
      padding: 30px;
      background: #f7f8f9;
      border-radius: 8px;
    }
    .empty-state p {
      color: var(--color-muted);
      font-size: 13px;
    }
    .editor {
      margin-top: 24px;
      padding: 24px;
      border: 1px solid var(--color-border);
      border-radius: 9px;
      background: #fafbfc;
    }
    .editor h2 {
      font-size: 18px;
    }
    .editor form {
      display: grid;
      gap: 14px;
      max-width: 680px;
    }
    label {
      display: grid;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
    }
    .checkbox {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .checkbox input {
      width: auto;
    }
    .form-actions {
      display: flex;
      gap: 10px;
      padding-top: 14px;
      border-top: 1px solid var(--color-border);
    }
    @media (max-width: 600px) {
      .rules article {
        padding: 16px;
        align-items: start;
        flex-direction: column;
      }
      .editor {
        padding: 16px;
      }
      .page-heading {
        align-items: start;
        flex-direction: column;
      }
    }
  `,
})
export class AutomationRulesPage {
  private readonly api = inject(IntegrationsApi);
  private readonly projectApi = inject(ProjectsApi);
  private readonly workflowsApi = inject(ProjectWorkflowsApi);
  private readonly issueApi = inject(IssuesApi);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private assigneeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly projectId = computed(() => this.params().get('projectId') ?? '');
  readonly project = resource({
    params: () => ({ projectId: this.projectId(), epoch: this.auth.sessionEpoch() }),
    loader: ({ params }) => this.projectApi.get(params.projectId),
  });
  readonly canManage = computed(() => {
    const p = this.project.value();
    return !!p && !p.archived && ['administrator', 'project_admin'].includes(p.effectiveRole);
  });
  readonly stages = resource({
    params: () => this.projectId(),
    loader: async ({ params, abortSignal }) => {
      const stages: Array<{ status: string; name: string }> = [];
      let workflowCursor: string | undefined;
      do {
        if (abortSignal.aborted) throw new DOMException('Aborted', 'AbortError');
        const workflows = await this.workflowsApi.workflows(params, workflowCursor);
        for (const workflow of workflows.items) {
          if (workflow.retired) continue;
          let stageCursor: string | undefined;
          do {
            if (abortSignal.aborted) throw new DOMException('Aborted', 'AbortError');
            const page = await this.workflowsApi.stages(params, workflow.id, stageCursor);
            for (const stage of page.items)
              if (!stage.retired && stage.acceptsEntries)
                stages.push({ status: stage.id, name: stage.name + ' · ' + workflow.name });
            stageCursor = page.nextCursor ?? undefined;
          } while (stageCursor);
        }
        workflowCursor = workflows.nextCursor ?? undefined;
      } while (workflowCursor);
      return stages;
    },
  });
  readonly rules = signal<AutomationRuleView[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly editing = signal(false);
  readonly selected = signal<AutomationRuleView | null>(null);
  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    stage: new FormControl('review', { nonNullable: true, validators: [Validators.required] }),
    assigneeId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    enabled: new FormControl(true, { nonNullable: true }),
  });
  readonly assigneeQuery = signal('');
  readonly assignees = signal<IssueUserSummary[]>([]);
  readonly assigneeCursor = signal<string | null>(null);
  readonly assigneeLoading = signal(false);
  private assigneeGeneration = 0;
  private editorGeneration = 0;
  private loadGeneration = 0;
  private ruleId: string = crypto.randomUUID();
  private readonly intent = new RetryIntent<AutomationRuleFields>();
  readonly assigneeOptions = computed<PickerOption[]>(() =>
    this.assignees().map(person => ({ id: person.id, label: person.displayName })),
  );
  constructor() {
    this.destroyRef.onDestroy(() => {
      this.cancelAssigneeSearch();
      ++this.assigneeGeneration;
      ++this.loadGeneration;
    });
    effect(() => {
      this.projectId();
      this.auth.sessionEpoch();
      untracked(() => {
        this.cancel();
        this.rules.set([]);
        this.cursor.set(null);
        this.error.set('');
        void this.reload();
      });
    });
  }
  selectedAssignee(): PickerOption[] {
    const current = this.selected();
    return current ? [{ id: current.assignee.id, label: current.assignee.displayName }] : [];
  }
  searchAssignees(query: string) {
    this.cancelAssigneeSearch();
    ++this.assigneeGeneration;
    this.assigneeQuery.set(query);
    this.assignees.set([]);
    this.assigneeCursor.set(null);
    if (!this.editing() || !this.canManage() || Array.from(query).length > 100) {
      this.assigneeLoading.set(false);
      return;
    }
    this.assigneeLoading.set(true);
    this.assigneeTimer = setTimeout(() => {
      this.assigneeTimer = null;
      void this.loadAssignees(false);
    }, 120);
  }
  private cancelAssigneeSearch(): void {
    if (this.assigneeTimer !== null) {
      clearTimeout(this.assigneeTimer);
      this.assigneeTimer = null;
    }
  }
  stageName(rule: AutomationRuleView) {
    const status = rule.stageId ?? rule.stage;
    return (
      this.stages.value()?.find(stage => stage.status === status)?.name ??
      rule.stage.split(':')[0]?.replace('_', ' ') ??
      status
    );
  }
  hasStage(status: string) {
    return this.stages.value()?.some(stage => stage.status === status) ?? false;
  }
  hasAssignee(id: string) {
    return this.assignees().some(person => person.id === id);
  }
  async reload() {
    await this.load(false);
  }
  async more() {
    await this.load(true);
  }
  private async load(append: boolean) {
    const generation = ++this.loadGeneration;
    const projectId = this.projectId(),
      epoch = this.auth.sessionEpoch();
    const current = () =>
      !this.destroyRef.destroyed &&
      generation === this.loadGeneration &&
      projectId === this.projectId() &&
      epoch === this.auth.sessionEpoch();
    this.loading.set(true);
    this.error.set('');
    try {
      const page = await this.api.rules(
        projectId,
        append ? (this.cursor() ?? undefined) : undefined,
      );
      if (!current()) return;
      this.rules.set(append ? [...this.rules(), ...page.items] : page.items);
      this.cursor.set(page.nextCursor);
    } catch (error) {
      if (current())
        this.error.set(error instanceof Error ? error.message : 'Rules could not be loaded.');
    } finally {
      if (current()) this.loading.set(false);
    }
  }
  create() {
    this.cancel();
    this.ruleId = crypto.randomUUID();
    this.form.reset({
      name: '',
      stage:
        this.stages.value()?.find(stage => stage.status.split(':')[0] === 'review')?.status ??
        this.stages.value()?.[0]?.status ??
        '',
      assigneeId: '',
      enabled: true,
    });
    this.intent.finish();
    this.editing.set(true);
    void this.loadAssignees(false);
  }
  edit(rule: AutomationRuleView) {
    this.cancel();
    this.ruleId = rule.id;
    this.selected.set(rule);
    this.form.reset({
      name: rule.name,
      stage: rule.stageId ?? rule.stage,
      assigneeId: rule.assignee.id,
      enabled: rule.enabled,
    });
    this.intent.finish();
    this.editing.set(true);
    void this.loadAssignees(false);
  }
  cancel() {
    ++this.editorGeneration;
    this.saving.set(false);
    this.error.set('');
    this.cancelAssigneeSearch();
    ++this.assigneeGeneration;
    this.assigneeLoading.set(false);
    this.assignees.set([]);
    this.assigneeCursor.set(null);
    this.assigneeQuery.set('');
    this.editing.set(false);
    this.selected.set(null);
  }
  async moreAssignees() {
    if (!this.assigneeLoading() && this.assigneeCursor()) await this.loadAssignees(true);
  }
  private async loadAssignees(append: boolean) {
    this.cancelAssigneeSearch();
    if (!this.editing() || !this.canManage()) return;
    const generation = ++this.assigneeGeneration,
      projectId = this.projectId(),
      query = this.assigneeQuery(),
      epoch = this.auth.sessionEpoch(),
      cursor = append ? (this.assigneeCursor() ?? undefined) : undefined;
    const current = () =>
      !this.destroyRef.destroyed &&
      generation === this.assigneeGeneration &&
      projectId === this.projectId() &&
      query === this.assigneeQuery() &&
      epoch === this.auth.sessionEpoch() &&
      this.editing();
    this.assigneeLoading.set(true);
    try {
      const page = await this.issueApi.assignees(projectId, query, cursor);
      if (!current()) return;
      const users = new Map((append ? this.assignees() : []).map(user => [user.id, user]));
      for (const user of page.items) users.set(user.id, user);
      this.assignees.set([...users.values()]);
      this.assigneeCursor.set(page.nextCursor);
    } catch (error) {
      if (current())
        this.error.set(error instanceof Error ? error.message : 'Teammates could not be loaded.');
    } finally {
      if (current()) this.assigneeLoading.set(false);
    }
  }
  async save() {
    if (this.saving() || this.form.invalid || !this.canManage()) return;
    const values = this.form.getRawValue();
    const body: AutomationRuleFields = {
      assigneeId: values.assigneeId,
      enabled: values.enabled,
      stageId: values.stage,
      name: values.name.trim(),
      expectedRevision: this.selected()?.revision ?? '0',
    };
    const projectId = this.projectId(), generation = this.editorGeneration, epoch = this.auth.sessionEpoch();
    const current = () => !this.destroyRef.destroyed && generation === this.editorGeneration && projectId === this.projectId() && epoch === this.auth.sessionEpoch();
    this.saving.set(true);
    this.error.set('');
    try {
      await this.api.saveRule(projectId, this.ruleId, body, this.intent.reference(body));
      if (!current()) return;
      this.intent.finish();
      this.cancel();
      await this.reload();
    } catch (error) {
      if (current()) this.error.set(error instanceof Error ? error.message : 'The rule could not be saved.');
    } finally {
      if (current()) this.saving.set(false);
    }
  }
}
