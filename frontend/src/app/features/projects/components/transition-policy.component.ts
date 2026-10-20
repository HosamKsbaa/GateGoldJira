import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type {
  FieldDefinition,
  TransitionPolicyFields,
  TransitionPolicyView,
  TransitionPolicy,
} from '../../../api/generated/types.gen';
import { ProjectFieldsApi } from '../project-fields.api';
import { AuthService } from '../../../core/auth/auth.service';
import { DraftsService } from '../../../core/drafts/drafts.service';
import { RetryIntent } from '../../../core/api/api-result';
import { RequestState } from '../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../shared/ui/request-status.component';
import { SearchablePickerComponent } from '../../../shared/ui/searchable-picker.component';
@Component({
  selector: 'gg-transition-policy',
  imports: [ReactiveFormsModule, RequestStatusComponent, SearchablePickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <section class="policy-editor" aria-label="Transition requirements"
    ><h3>Requirements and approvals</h3><gg-request-status [state]="state" />
    @if (view(); as current) {
      <form [formGroup]="form" (ngSubmit)="save()"
        ><fieldset
          [disabled]="
            state.busy() ||
            !!pending() ||
            !current.configuration.canManage ||
            current.configuration.mode !== 'modern'
          "
        >
          <p>Required before this move</p
          ><label class="check"><input type="checkbox" formControlName="assignee" />Assignee</label
          ><label class="check"><input type="checkbox" formControlName="dueDate" />Due date</label
          ><label class="check"
            ><input type="checkbox" formControlName="description" />Description</label
          >
          <gg-searchable-picker
            label="Required custom fields"
            [options]="choices()"
            [selected]="selectedChoices()"
            [value]="requiredIds()"
            [multiple]="true"
            [disabled]="state.busy() || !!pending()"
            [hasMore]="!!cursor()"
            (searched)="query.set($event)"
            (changed)="requiredIds.set($event); remember()"
            (more)="more()"
          />
          <label
            >Approvals needed<input
              type="number"
              min="0"
              max="100"
              formControlName="count" /></label
          ><label
            >Reviewers<select formControlName="role"
              ><option value="member">Project members</option
              ><option value="project_admin">Project administrators</option></select
            ></label
          ><label class="check"
            ><input type="checkbox" formControlName="excludeReporter" />Issue reporter cannot
            approve</label
          ><p class="help"
            >Set approvals to zero to disable review. Editing these rules invalidates earlier
            approvals while keeping their history.</p
          ></fieldset
        >
        <div class="actions"
          ><button
            type="submit"
            [disabled]="
              state.busy() ||
              conflict() ||
              !current.configuration.canManage ||
              current.configuration.mode !== 'modern'
            "
            >{{ pending() ? 'Retry original rules' : 'Save requirements' }}</button
          ><button
            type="button"
            class="secondary"
            (click)="cancelled.emit()"
            [disabled]="state.busy()"
            >Close</button
          ></div
        ></form
      >
      @if (conflict()) {
        <p class="notice"
          >The project changed. Your rules are preserved.
          <button type="button" class="secondary" (click)="review()"
            >Review current rules</button
          ></p
        >
      }
    }
  </section>`,
  styles: `
    .policy-editor {
      border: 1px solid var(--color-border);
      padding: 20px;
      background: #f7f8fa;
      border-radius: 6px;
      margin: 20px 0;
    }
    fieldset {
      border: 0;
      padding: 0;
    }
    label {
      margin-top: 12px;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .check input {
      width: auto;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }
  `,
})
export class TransitionPolicyComponent {
  readonly projectId = input.required<string>();
  readonly workflowId = input.required<string>();
  readonly transitionId = input.required<string>();
  readonly changed = output<void>();
  readonly cancelled = output<void>();
  readonly view = signal<TransitionPolicyView | null>(null);
  readonly fields = signal<FieldDefinition[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly query = signal('');
  readonly requiredIds = signal<string[]>([]);
  readonly pending = signal<TransitionPolicyFields | null>(null);
  readonly conflict = signal(false);
  readonly state = new RequestState();
  readonly form = new FormGroup({
    assignee: new FormControl(false, { nonNullable: true }),
    dueDate: new FormControl(false, { nonNullable: true }),
    description: new FormControl(false, { nonNullable: true }),
    count: new FormControl(0, { nonNullable: true }),
    role: new FormControl<'member' | 'project_admin'>('member', { nonNullable: true }),
    excludeReporter: new FormControl(false, { nonNullable: true }),
  });
  private readonly api = inject(ProjectFieldsApi);
  private readonly auth = inject(AuthService);
  private readonly destroyed = inject(DestroyRef);
  private readonly drafts = inject(DraftsService);
  private readonly retry = new RetryIntent<TransitionPolicyFields>();
  private generation = 0;
  private key = '';
  constructor() {
    effect(() => {
      this.projectId();
      this.workflowId();
      this.transitionId();
      this.auth.sessionEpoch();
      untracked(() => {
        this.generation++;
        this.drafts.release(this.key);
        this.key = 'transition-policy:' + this.transitionId();
        this.state.busy.set(false);
        void this.load();
      });
    });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.remember());
    this.destroyed.onDestroy(() => {
      this.generation++;
      this.drafts.release(this.key);
    });
  }
  choices() {
    return this.fields()
      .filter(
        f => !f.retired && f.name.toLocaleLowerCase().includes(this.query().toLocaleLowerCase()),
      )
      .map(f => ({ id: f.id, label: f.name }));
  }
  selectedChoices() {
    return this.fields()
      .filter(f => this.requiredIds().includes(f.id))
      .map(f => ({ id: f.id, label: f.name }));
  }
  remember(): void {
    this.drafts.activate(this.key, true);
  }
  private policy(): TransitionPolicy {
    const raw = this.form.getRawValue();
    const requiredSystemFields: TransitionPolicy['requiredSystemFields'] = [];
    if (raw.assignee) requiredSystemFields.push('assignee');
    if (raw.dueDate) requiredSystemFields.push('due_date');
    if (raw.description) requiredSystemFields.push('description');
    return {
      requiredSystemFields,
      requiredFieldIds: this.requiredIds(),
      approvalsRequired: raw.count,
      approverRole: raw.count > 0 ? raw.role : null,
      excludeIssueReporter: raw.excludeReporter,
    };
  }
  private apply(view: TransitionPolicyView): void {
    this.view.set(view);
    const p = view.policy;
    this.form.reset(
      {
        assignee: p.requiredSystemFields.includes('assignee'),
        dueDate: p.requiredSystemFields.includes('due_date'),
        description: p.requiredSystemFields.includes('description'),
        count: p.approvalsRequired,
        role: p.approverRole ?? 'member',
        excludeReporter: p.excludeIssueReporter,
      },
      { emitEvent: false },
    );
    this.requiredIds.set(p.requiredFieldIds);
    this.pending.set(null);
    this.conflict.set(false);
    this.retry.finish();
    this.drafts.release(this.key);
  }
  async load(): Promise<void> {
    const generation = this.generation,
      epoch = this.auth.sessionEpoch();
    await this.state.run(async () => {
      const [view, page] = await Promise.all([
        this.api.policy(this.projectId(), this.workflowId(), this.transitionId()),
        this.api.fields(this.projectId()),
      ]);
      if (
        generation !== this.generation ||
        epoch !== this.auth.sessionEpoch() ||
        this.destroyed.destroyed
      )
        return;
      this.apply(view);
      this.fields.set(page.items);
      this.cursor.set(page.nextCursor);
    });
  }
  async more(): Promise<void> {
    if (!this.cursor()) return;
    await this.state.run(async () => {
      const page = await this.api.fields(this.projectId(), this.cursor()!);
      this.fields.update(v => [...v, ...page.items]);
      this.cursor.set(page.nextCursor);
    });
  }
  async save(): Promise<void> {
    const view = this.view();
    if (!view || this.conflict()) return;
    const body = this.pending() ?? {
      expectedRevision: view.configuration.revision,
      policy: this.policy(),
    };
    this.pending.set(structuredClone(body));
    const generation = this.generation,
      epoch = this.auth.sessionEpoch();
    await this.state.run(async () => {
      const saved = await this.api.savePolicy(
        this.projectId(),
        this.workflowId(),
        this.transitionId(),
        body,
        this.retry.reference(body),
      );
      if (generation !== this.generation || epoch !== this.auth.sessionEpoch()) return;
      this.apply(saved.result);
      this.changed.emit();
    });
    if (this.state.failure()?.payload.error.code === 'conflict') this.conflict.set(true);
    if (this.state.failure()?.payload.error.code === 'validation_failed') {
      this.pending.set(null);
      this.retry.finish();
    }
  }
  async review(): Promise<void> {
    await this.state.run(async () => {
      const fresh = await this.api.policy(this.projectId(), this.workflowId(), this.transitionId());
      this.view.set(fresh);
      this.pending.set(null);
      this.retry.finish();
      this.conflict.set(false);
    });
  }
}
