import { DatePipe } from '@angular/common';
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
import type {
  ApprovalContextView,
  ApprovalContextFields,
  ModernIssueView,
  StageView,
  TransitionView,
} from '../../../../api/generated/types.gen';
import { IssueFieldsApi } from '../../issue-fields.api';
import { ProjectWorkflowsApi } from '../../../projects/project-workflows.api';
import { AuthService } from '../../../../core/auth/auth.service';
import { RetryIntent } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
@Component({
  selector: 'gg-issue-review',
  imports: [DatePipe, RequestStatusComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <section aria-label="Review and approvals"
    ><h3>Review and approvals</h3><gg-request-status [state]="state" />
    <label
      >Move to review<select
        [value]="selected()"
        (change)="select($event)"
        [disabled]="state.busy() || !!pending()"
        ><option value="">Choose a move</option>
        @for (edge of edges(); track edge.id) {
          <option [value]="edge.id"
            >{{ stageName(edge.fromStageId) }} → {{ stageName(edge.toStageId)
            }}{{ edge.retired ? ' · Retired' : '' }}</option
          >
        }
      </select></label
    >
    @if (edgeCursor()) {
      <button type="button" class="secondary" (click)="load(true)" [disabled]="state.busy()"
        >More moves</button
      >
    }
    @if (stageCursor()) {
      <button type="button" class="secondary" (click)="moreStages()" [disabled]="state.busy()"
        >More stage names</button
      >
    }
    @if (context(); as review) {
      <p role="status">{{
        !review.currentContext
          ? 'Past move · History only'
          : review.rejected
            ? 'Changes requested'
            : review.reviewSatisfied
              ? 'Review requirements satisfied'
              : review.approved + ' / ' + review.required + ' approvals'
      }}</p>
      @if (review.required > 0 && review.currentContext) {
        <p class="muted"
          >Edits to the issue or its rules require a new review. Earlier decisions stay in
          history.</p
        ><div class="actions">
          @if (review.canVote && !ownVote(review)) {
            <button type="button" (click)="act('approve')" [disabled]="disabled() || state.busy()"
              >Approve</button
            ><button
              type="button"
              class="secondary"
              (click)="act('reject')"
              [disabled]="disabled() || state.busy()"
              >Request changes</button
            >
          }
          @if (issue().capabilities.includes('edit')) {
            <button
              type="button"
              class="secondary"
              (click)="act('resubmit')"
              [disabled]="disabled() || state.busy()"
              >Resubmit for review</button
            >
          }
        </div>
      }
      @if (pending()) {
        <button type="button" (click)="retryPending()" [disabled]="state.busy()"
          >Retry original review action</button
        ><button type="button" class="secondary" (click)="refresh()" [disabled]="state.busy()"
          >Review current context</button
        >
      }
      <ul class="review-votes">
        @for (
          vote of review.votes;
          track vote.approver.id +
            vote.issueRevision +
            vote.workflowRevision +
            vote.configurationRevision
        ) {
          <li
            ><strong dir="auto">{{ vote.approver.displayName }}</strong> ·
            {{ vote.decision === 'approve' ? 'Approved' : 'Requested changes'
            }}<small
              >{{ vote.decidedAt | date: 'medium' }} ·
              {{ vote.current && vote.eligible ? 'Current' : 'Previous review' }} · Issue revision
              {{ vote.issueRevision }}</small
            ></li
          >
        } @empty {
          <li class="muted">No review decisions yet.</li>
        }
      </ul>
      @if (review.nextCursor) {
        <button type="button" class="secondary" (click)="history()" [disabled]="state.busy()"
          >Earlier decisions</button
        >
      }
    }
  </section>`,
  styles: `
    :host {
      display: block;
      margin: 20px 0;
    }
    section {
      border-top: 1px solid var(--color-border);
      padding-top: 16px;
    }
    h3 {
      font-size: 14px;
    }
    select {
      width: 100%;
    }
    .review-votes {
      list-style: none;
      padding: 0;
    }
    .review-votes li {
      padding: 10px 0;
      border-bottom: 1px solid var(--color-border);
      font-size: 13px;
    }
    small {
      display: block;
      color: var(--color-muted);
      margin-top: 4px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
})
export class IssueReviewComponent {
  readonly issue = input.required<ModernIssueView>();
  readonly disabled = input(false);
  readonly changed = output<void>();
  readonly selected = signal('');
  readonly context = signal<ApprovalContextView | null>(null);
  readonly edges = signal<TransitionView[]>([]);
  readonly stages = signal<StageView[]>([]);
  readonly edgeCursor = signal<string | null>(null);
  readonly stageCursor = signal<string | null>(null);
  readonly state = new RequestState();
  readonly pending = signal<{
    kind: 'approve' | 'reject' | 'resubmit';
    transitionId: string;
    body: ApprovalContextFields;
  } | null>(null);
  private readonly api = inject(IssueFieldsApi);
  private readonly workflows = inject(ProjectWorkflowsApi);
  private readonly auth = inject(AuthService);
  private readonly destroyed = inject(DestroyRef);
  private readonly retry = new RetryIntent<object>();
  private generation = 0;
  private id = '';
  constructor() {
    effect(() => {
      const issue = this.issue(),
        epoch = this.auth.sessionEpoch();
      untracked(() => {
        this.generation++;
        this.state.busy.set(false);
        if (this.id !== issue.summary.id) {
          this.id = issue.summary.id;
          this.selected.set('');
          this.context.set(null);
          this.pending.set(null);
          this.retry.finish();
        }
        void this.load();
      });
    });
    this.destroyed.onDestroy(() => this.generation++);
  }
  stageName(id: string): string {
    return this.stages().find(stage => stage.id === id)?.name ?? 'Stage ' + id.slice(0, 8);
  }
  ownVote(v: ApprovalContextView): boolean {
    return v.votes.some(vote => vote.current && vote.approver.id === this.auth.me()?.userId);
  }
  private current(generation: number, epoch: number): boolean {
    return (
      !this.destroyed.destroyed &&
      generation === this.generation &&
      epoch === this.auth.sessionEpoch()
    );
  }
  async load(more = false): Promise<void> {
    const issue = this.issue(),
      generation = this.generation,
      epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const [edges, stages] = await Promise.all([
          this.workflows.transitions(
            issue.summary.projectId,
            issue.summary.workflow.id,
            more ? (this.edgeCursor() ?? undefined) : undefined,
          ),
          more
            ? Promise.resolve(null)
            : this.workflows.stages(issue.summary.projectId, issue.summary.workflow.id),
        ]);
        if (!this.current(generation, epoch)) return;
        this.edges.set(more ? [...this.edges(), ...edges.items] : edges.items);
        this.edgeCursor.set(edges.nextCursor);
        if (stages) {
          this.stages.set(stages.items);
          this.stageCursor.set(stages.nextCursor);
        }
        if (this.selected()) {
          const review = await this.api.approvals(issue.summary.id, this.selected());
          if (this.current(generation, epoch)) this.context.set(review);
        }
      },
      () => this.current(generation, epoch),
    );
  }
  select(event: Event): void {
    if (event.target instanceof HTMLSelectElement) {
      this.selected.set(event.target.value);
      void this.refresh();
    }
  }
  async refresh(): Promise<void> {
    this.pending.set(null);
    this.retry.finish();
    if (!this.selected()) {
      this.context.set(null);
      return;
    }
    const generation = ++this.generation,
      epoch = this.auth.sessionEpoch();
    this.state.busy.set(false);
    await this.state.run(
      async () => {
        const review = await this.api.approvals(this.issue().summary.id, this.selected());
        if (this.current(generation, epoch)) this.context.set(review);
      },
      () => this.current(generation, epoch),
    );
  }
  async history(): Promise<void> {
    const review = this.context();
    if (!review?.nextCursor) return;
    const generation = this.generation,
      epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const page = await this.api.approvals(
          review.issueId,
          review.transitionId,
          review.nextCursor ?? undefined,
        );
        if (this.current(generation, epoch))
          this.context.set({ ...page, votes: [...review.votes, ...page.votes] });
      },
      () => this.current(generation, epoch),
    );
  }
  async moreStages(): Promise<void> {
    const issue = this.issue(),
      generation = this.generation,
      epoch = this.auth.sessionEpoch();
    if (!this.stageCursor()) return;
    await this.state.run(
      async () => {
        const page = await this.workflows.stages(
          issue.summary.projectId,
          issue.summary.workflow.id,
          this.stageCursor()!,
        );
        if (this.current(generation, epoch)) {
          this.stages.update(v => [...v, ...page.items]);
          this.stageCursor.set(page.nextCursor);
        }
      },
      () => this.current(generation, epoch),
    );
  }
  async act(kind: 'approve' | 'reject' | 'resubmit'): Promise<void> {
    const review = this.context();
    if (!review || this.disabled() || this.pending()) return;
    this.pending.set({
      kind,
      transitionId: review.transitionId,
      body: {
        expectedRevision: review.issueRevision,
        expectedWorkflowRevision: review.workflowRevision,
        expectedConfigurationRevision: review.configurationRevision,
      },
    });
    await this.retryPending();
  }
  async retryPending(): Promise<void> {
    const intention = this.pending();
    if (!intention || this.disabled()) return;
    const generation = this.generation,
      epoch = this.auth.sessionEpoch(),
      id = this.issue().summary.id;
    await this.state.run(
      async () => {
        const ref = this.retry.reference(intention);
        const saved =
          intention.kind === 'resubmit'
            ? await this.api.resubmit(id, intention.transitionId, intention.body, ref)
            : await this.api.vote(id, intention.transitionId, intention.body, intention.kind, ref);
        if (!this.current(generation, epoch)) return;
        this.context.set(saved.result);
        this.pending.set(null);
        this.retry.finish();
        if (intention.kind === 'resubmit') this.changed.emit();
      },
      () => this.current(generation, epoch),
    );
  }
}
