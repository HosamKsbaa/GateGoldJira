import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  ModernIssueSummary,
  PriorityView,
  StageView,
  UserSummary,
} from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { ApiError } from '../../../../core/api/api-result';
import { DraftsService, type ModernBulkIntent } from '../../../../core/drafts/drafts.service';
import { ProjectWorkflowsApi } from '../../../projects/project-workflows.api';
import { ModernIssuesApi } from '../../modern-issues.api';
import { IssuesApi } from '../../issues.api';
import { bulkWorkflowId, selectableBulkPriority, selectableBulkStage } from './bulk-targets';

type Action =
  | 'priority'
  | 'assignee'
  | 'due'
  | 'status'
  | 'archive'
  | 'restore'
  | 'backlog'
  | 'board';
type Intent = ModernBulkIntent;
type Pending = { reference: string; intent: Intent };
@Component({
  selector: 'gg-modern-bulk-actions',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (selected().length) {
      <section class="bulk-panel" aria-label="Bulk issue actions">
        <p>
          <strong>{{ selected().length }} selected</strong> · Each issue is saved independently.
          Issues needing attention stay selected.
        </p>
        <div class="actions">
          <label
            >Action<select
              aria-label="Bulk action"
              [(ngModel)]="action"
              [disabled]="frozen()"
              (ngModelChange)="clearReport(); loadStages()"
            >
              <option value="priority">Set priority</option>
              <option value="assignee">Assign</option>
              <option value="due">Set due date</option>
              <option value="status">Move to stage</option>
              <option value="archive">Archive</option>
              <option value="restore">Restore</option>
              <option value="backlog">Move to backlog</option>
              <option value="board">Add to board</option>
            </select></label
          >
          @switch (action) {
            @case ('priority') {
              <label
                >Priority<select
                  aria-label="Bulk priority"
                  [(ngModel)]="priorityId"
                  (ngModelChange)="clearReport()"
                  [disabled]="frozen()"
                >
                  <option value="">Choose priority</option>
                  @for (priority of priorities(); track priority.id) {
                    @if (!priority.retired) {
                      <option [value]="priority.id">{{ priority.name }}</option>
                    }
                  }
                </select></label
              >
            }
            @case ('assignee') {
              <label
                >Assignee<select
                  aria-label="Bulk assignee"
                  [(ngModel)]="assigneeId"
                  (ngModelChange)="clearReport()"
                  [disabled]="frozen()"
                >
                  <option value="">Unassigned</option>
                  @for (user of people(); track user.id) {
                    <option [value]="user.id">{{ user.displayName }}</option>
                  }
                </select></label
              >
            }
            @case ('due') {
              <label
                >Due date<input
                  type="date"
                  aria-label="Bulk due date"
                  [(ngModel)]="dueDate"
                  (ngModelChange)="clearReport()"
                  [disabled]="frozen()" /></label
              ><span class="muted">Leave empty to clear the date.</span>
            }
            @case ('status') {
              <label
                >Target stage<select
                  aria-label="Bulk target stage"
                  [(ngModel)]="stageId"
                  (ngModelChange)="clearReport()"
                  [disabled]="frozen() || loadingStages()"
                >
                  <option value="">Choose stage</option>
                  @for (stage of stages(); track stage.id) {
                    <option [value]="stage.id">{{ stage.name }}</option>
                  }
                </select></label
              >
              @if (stageCursor()) {
                <button
                  type="button"
                  class="secondary"
                  (click)="loadStages(true)"
                  [disabled]="frozen() || loadingStages()"
                >
                  More stages
                </button>
              }
              @if (stageMessage()) {
                <p role="status">{{ stageMessage() }}</p>
              }
            }
          }
          <button type="button" (click)="apply()" [disabled]="busy() || !validAction()">
            {{
              hasPending()
                ? 'Retry original bulk action'
                : busy()
                  ? 'Applying…'
                  : 'Apply to selected'
            }}</button
          ><button type="button" class="secondary" (click)="clear()" [disabled]="frozen()">
            Clear selection
          </button>
        </div>
        @if (hasPending()) {
          <p class="notice">
            The outcome of one or more saves is uncertain. The original values and retry references
            are retained.
          </p>
        }
        @if (report()) {
          <p role="status">{{ report() }}</p>
        }
        <ul>
          @for (failure of failures(); track failure.id) {
            <li>
              <bdi>{{ failure.key }}</bdi
              >: {{ failure.message }}
              @if (!failure.uncertain) {
                <button
                  type="button"
                  class="secondary"
                  (click)="review(failure.id)"
                  [disabled]="busy()"
                >
                  Review {{ failure.key }}
                </button>
              }
            </li>
          }
        </ul>
      </section>
    } @else if (report()) {
      <p role="status" class="notice">{{ report() }}</p>
    }`,
  styles: `
    .bulk-panel {
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: #f0f6ff;
      padding: 1rem;
      margin-block: 1rem;
    }
    .actions {
      display: flex;
      gap: 0.6rem;
      align-items: end;
      flex-wrap: wrap;
    }
    label {
      display: grid;
      gap: 0.3rem;
      min-width: 10rem;
    }
    li {
      margin-block: 0.5rem;
    }
  `,
})
export class ModernBulkActionsComponent {
  readonly projectId = input.required<string>();
  readonly selected = input.required<ModernIssueSummary[]>();
  readonly priorities = input<PriorityView[]>([]);
  readonly people = input<UserSummary[]>([]);
  readonly selectionChange = output<ModernIssueSummary[]>();
  readonly changed = output<void>();
  private readonly api = inject(ModernIssuesApi);
  private readonly organization = inject(IssuesApi);
  private readonly workflows = inject(ProjectWorkflowsApi);
  private readonly auth = inject(AuthService);
  private readonly drafts = inject(DraftsService);
  private readonly destroy = inject(DestroyRef);
  private readonly sessionEpochAtCreation = this.auth.sessionEpoch();
  private readonly retries = new Map<string, Pending>();
  private stageGeneration = 0;
  private restoredProject = '';
  private stageScope = '';
  readonly busy = signal(false);
  readonly hasPending = signal(false);
  readonly report = signal('');
  readonly failures = signal<{ id: string; key: string; message: string; uncertain: boolean }[]>(
    [],
  );
  readonly stages = signal<StageView[]>([]);
  readonly stageCursor = signal<string | null>(null);
  readonly loadingStages = signal(false);
  readonly stageMessage = signal('');
  action: Action = 'priority';
  priorityId = '';
  assigneeId = '';
  dueDate = '';
  stageId = '';
  constructor() {
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      const next = this.auth.sessionEpoch();
      if (next === epoch) return;
      epoch = next;
      this.retries.clear();
      this.hasPending.set(false);
      this.failures.set([]);
      this.report.set('');
      this.drafts.release(this.draftKey());
    });
    effect(() => {
      this.selected();
      this.projectId();
      if (this.action === 'status') void this.loadStages();
    });
    effect(() => {
      const priorities = this.priorities();
      if (!this.frozen() && !selectableBulkPriority(this.priorityId, priorities))
        this.priorityId = '';
    });
    effect(() => {
      const project = this.projectId();
      if (this.restoredProject === project) return;
      this.restoredProject = project;
      const draft = this.drafts.modernBulk.get(project);
      if (!draft) {
        this.priorityId = '';
        this.assigneeId = '';
        this.dueDate = '';
        this.stageId = '';
      }
      if (draft) {
        this.action = draft.action;
        this.priorityId = draft.priorityId;
        this.assigneeId = draft.assigneeId;
        this.dueDate = draft.dueDate;
        this.stageId = draft.stageId;
        for (const [id, pending] of draft.retries) this.retries.set(id, pending);
        this.hasPending.set(this.retries.size > 0);
        this.selectionChange.emit(draft.selected);
        this.drafts.activate(this.draftKey(), this.retries.size > 0);
      }
    });
    this.destroy.onDestroy(() => {
      this.stageGeneration++;
      this.storeDraft();
      this.drafts.release(this.draftKey());
    });
  }
  private storeDraft() {
    if (
      this.retries.size &&
      this.auth.me() &&
      this.auth.sessionEpoch() === this.sessionEpochAtCreation
    )
      this.drafts.modernBulk.set(this.projectId(), {
        selected: this.selected(),
        retries: new Map(this.retries),
        action: this.action,
        priorityId: this.priorityId,
        assigneeId: this.assigneeId,
        dueDate: this.dueDate,
        stageId: this.stageId,
      });
    else this.drafts.modernBulk.delete(this.projectId());
  }
  private draftKey() {
    return 'native-bulk:' + this.projectId();
  }
  frozen() {
    return this.busy() || this.hasPending();
  }
  validAction() {
    if (this.hasPending()) return true;
    if (this.action === 'priority')
      return selectableBulkPriority(this.priorityId, this.priorities());
    if (this.action === 'status')
      return (
        !this.loadingStages() &&
        !!bulkWorkflowId(this.projectId(), this.selected()) &&
        selectableBulkStage(this.stageId, this.stages())
      );
    return true;
  }
  clearReport() {
    if (!this.frozen()) this.report.set('');
  }
  clear() {
    if (!this.frozen()) {
      this.selectionChange.emit([]);
      this.failures.set([]);
    }
  }
  async loadStages(more = false) {
    if (this.action !== 'status' || this.frozen()) return;
    const workflow = bulkWorkflowId(this.projectId(), this.selected());
    const scope = workflow ? this.projectId() + ':' + workflow : '';
    if (scope !== this.stageScope) {
      this.stageScope = scope;
      this.stageGeneration++;
      this.stageId = '';
      this.stages.set([]);
      this.stageCursor.set(null);
      this.loadingStages.set(false);
    } else if (!more && (this.loadingStages() || this.stages().length > 0)) return;
    const generation = ++this.stageGeneration,
      epoch = this.auth.sessionEpoch();
    if (!workflow) {
      this.loadingStages.set(false);
      this.stageMessage.set('Select issues from one workflow to move them together.');
      return;
    }
    this.loadingStages.set(true);
    this.stageMessage.set('');
    try {
      const page = await this.workflows.stages(
        this.projectId(),
        workflow,
        more ? (this.stageCursor() ?? undefined) : undefined,
      );
      if (
        generation === this.stageGeneration &&
        epoch === this.auth.sessionEpoch() &&
        !this.destroy.destroyed
      ) {
        this.stages.set(
          more
            ? [...this.stages(), ...page.items.filter(s => !s.retired && s.acceptsEntries)]
            : page.items.filter(s => !s.retired && s.acceptsEntries),
        );
        this.stageCursor.set(page.nextCursor);
      }
    } catch {
      if (generation === this.stageGeneration)
        this.stageMessage.set('Could not load stages. Choose the action again to retry.');
    } finally {
      if (generation === this.stageGeneration) this.loadingStages.set(false);
    }
  }
  private intent(summary: ModernIssueSummary): Intent {
    if (summary.projectId !== this.projectId())
      throw new Error('Choose issues from this project only.');
    switch (this.action) {
      case 'priority':
        return {
          kind: 'patch',
          body: {
            field: 'priorityId',
            priority: { prior: summary.priority.id, value: this.priorityId },
          },
        };
      case 'assignee':
        return {
          kind: 'patch',
          body: {
            field: 'assigneeId',
            assignee: { prior: summary.assignee?.id ?? null, value: this.assigneeId || null },
          },
        };
      case 'due':
        return {
          kind: 'patch',
          body: {
            field: 'dueDate',
            dueDate: { prior: summary.dueDate, value: this.dueDate || null },
          },
        };
      case 'status':
        return {
          kind: 'move',
          body: { expectedRevision: summary.revision, targetStageId: this.stageId },
        };
      default:
        return {
          kind: 'organize',
          body: {
            expectedRevision: summary.revision,
            ...(this.action === 'archive' || this.action === 'restore'
              ? { archived: this.action === 'archive' }
              : { backlog: this.action === 'backlog' }),
          },
        };
    }
  }
  async apply() {
    if (this.busy() || !this.validAction()) return;
    const epoch = this.auth.sessionEpoch();
    const failed: ModernIssueSummary[] = [];
    let count = 0;
    this.busy.set(true);
    this.drafts.activate(this.draftKey(), true);
    this.report.set('');
    this.failures.set([]);
    try {
      for (const summary of this.selected().slice(0, 100)) {
        if (epoch !== this.auth.sessionEpoch() || this.destroy.destroyed) return;
        let pending = this.retries.get(summary.id);
        try {
          if (!pending) {
            pending = { reference: crypto.randomUUID(), intent: this.intent(summary) };
            this.retries.set(summary.id, pending);
          }
          const intent = pending.intent;
          if (intent.kind === 'patch')
            await this.api.patch(summary.id, intent.body, pending.reference);
          else if (intent.kind === 'move')
            await this.api.move(summary.id, intent.body, pending.reference);
          else await this.organization.organize(summary.id, intent.body, pending.reference);
          if (epoch !== this.auth.sessionEpoch() || this.destroy.destroyed) return;
          this.retries.delete(summary.id);
          count++;
        } catch (error: unknown) {
          if (epoch !== this.auth.sessionEpoch() || this.destroy.destroyed) return;
          const uncertain =
            !!pending && !(error instanceof ApiError && !error.payload.error.retryable);
          if (!uncertain) this.retries.delete(summary.id);
          failed.push(summary);
          this.failures.update(items => [
            ...items,
            {
              id: summary.id,
              key: summary.key,
              message: error instanceof Error ? error.message : 'Could not save this issue.',
              uncertain,
            },
          ]);
        }
      }
      if (epoch === this.auth.sessionEpoch()) {
        this.report.set(`${count} issue(s) saved; ${failed.length} need attention.`);
        this.selectionChange.emit(failed);
        this.changed.emit();
      }
    } finally {
      this.hasPending.set(this.retries.size > 0);
      if (!this.destroy.destroyed) {
        this.drafts.activate(this.draftKey(), this.retries.size > 0);
        this.storeDraft();
      }
      this.busy.set(false);
    }
  }
  async review(id: string) {
    if (this.retries.has(id) || this.busy()) return;
    const epoch = this.auth.sessionEpoch();
    this.busy.set(true);
    try {
      const current = await this.api.get(id);
      if (epoch !== this.auth.sessionEpoch()) return;
      this.selectionChange.emit(
        this.selected().map(item => (item.id === id ? current.summary : item)),
      );
      this.failures.update(items => items.filter(item => item.id !== id));
      this.report.set('Latest issue loaded. Review its values before applying again.');
    } catch {
      if (epoch === this.auth.sessionEpoch())
        this.report.set('Could not review this issue. Your selection is preserved.');
    } finally {
      this.busy.set(false);
    }
  }
}
