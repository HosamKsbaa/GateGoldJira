import {
  type IssueRecord,
  type IssueCard,
  issueStageCategory,
} from '../../issue-model';
import { ModernIssuesApi } from '../../modern-issues.api';
import { ModernIssueFormComponent } from '../modern-issue-form/modern-issue-form.component';
import type { ModernCreateFields, ModernIssueView } from '../../../../api/generated/types.gen';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  viewChild,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { ApiError, RetryIntent } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { focusAfterRender } from '../../../../shared/ui/focus-after-render';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { RelatedIssueRowComponent } from '../related-issue-row/related-issue-row.component';

@Component({
  selector: 'gg-subtasks',
  imports: [
    RouterLink,
    IconComponent,
    RelatedIssueRowComponent,
    ModernIssueFormComponent,
    RequestStatusComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './subtasks.component.css',
  templateUrl: './subtasks.component.html',
})
export class SubtasksComponent {
  readonly category = issueStageCategory;
  readonly modernForm = viewChild(ModernIssueFormComponent);
  private readonly modernApi = inject(ModernIssuesApi);
  readonly modernCurrent = output<ModernIssueView>();
  readonly addId = 'add-subtask-' + crypto.randomUUID();
  issueIdForDraft(): string {
    return this.issue().summary.id;
  }
  readonly issue = input.required<IssueRecord>();
  readonly changed = output<void>();
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly rootId = computed(() => this.issue().summary.id);
  private generation = 0;
  readonly state = new RequestState();
  readonly children = signal<IssueCard[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly creating = signal(false);
  readonly notice = signal('');
  constructor() {
    inject(DestroyRef).onDestroy(() => this.generation++);
    effect(() => {
      this.rootId();
      this.auth.sessionEpoch();
      untracked(() => {
        this.generation++;
        this.children.set([]);
        this.cursor.set(null);
        this.creating.set(false);
        this.state.busy.set(false);
        this.state.clear();
        this.modernRetry.finish();
        this.pendingModern.set(null);
        this.notice.set('');
        if (this.auth.me() && !this.issue().summary.parent) void this.load();
      });
    });
  }
  private isCurrent(id: string, generation: number, epoch: number): boolean {
    return (
      id === this.rootId() && generation === this.generation && epoch === this.auth.sessionEpoch()
    );
  }
  async load(cursor?: string): Promise<void> {
    const id = this.rootId(),
      generation = this.generation,
      epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const page = await this.modernApi.search(
          {
            projectIds: [this.issue().summary.projectId],
            parentId: id,
            archived: this.issue().summary.archived,
          },
          cursor,
        );
        if (!this.isCurrent(id, generation, epoch)) return;
        this.children.set(page.items);
        this.cursor.set(page.nextCursor);
      },
      () => this.isCurrent(id, generation, epoch),
    );
  }
  async refresh(): Promise<void> {
    const id = this.rootId(),
      generation = this.generation,
      epoch = this.auth.sessionEpoch();
    await this.state.run(
      async () => {
        const fresh = await this.modernApi.get(id);
        if (!this.isCurrent(id, generation, epoch)) return;
        this.modernCurrent.emit(fresh);
        const page = await this.modernApi.search({
          projectIds: [this.issue().summary.projectId],
          parentId: id,
          archived: this.issue().summary.archived,
        });
        if (!this.isCurrent(id, generation, epoch)) return;
        this.children.set(page.items);
        this.cursor.set(page.nextCursor);
      },
      () => this.isCurrent(id, generation, epoch),
    );
  }
  begin(): void {
    this.creating.set(true);
    this.notice.set('');
    focusAfterRender('subtask-title', this.injector);
  }
  cancel(): void {
    if (this.creating() && !this.modernForm()?.confirmClose()) return;
    this.creating.set(false);
    this.modernRetry.finish();
    this.pendingModern.set(null);
    this.state.clear();
    focusAfterRender(this.addId, this.injector);
  }
  private readonly modernRetry = new RetryIntent<{ projectId: string; body: ModernCreateFields }>();
  readonly pendingModern = signal<{ projectId: string; body: ModernCreateFields } | null>(null);
  async retryModern(): Promise<void> {
    const intent = this.pendingModern();
    if (intent) await this.createModern(intent.body);
  }
  async createModern(fields: ModernCreateFields): Promise<void> {
    if (!this.issue().capabilities.includes('add_subtask')) return;
    const id = this.rootId(),
      generation = this.generation,
      epoch = this.auth.sessionEpoch();
    const intent = this.pendingModern() ?? {
      projectId: this.issue().summary.projectId,
      body: { ...fields, parentId: id, expectedParentRevision: this.issue().summary.revision },
    };
    this.pendingModern.set(intent);
    await this.state.run(
      async () => {
        try {
          const existing = this.modernForm()?.createdIssueId();
          const saved = existing
            ? { result: await this.modernApi.get(existing) }
            : await this.modernApi.create(
                intent.projectId,
                intent.body,
                this.modernRetry.reference(intent),
              );
          if (!this.isCurrent(id, generation, epoch)) return;
          this.modernForm()?.markCreated(saved.result.summary.id);
          await this.modernForm()?.finishUploads(saved.result);
          if (!this.isCurrent(id, generation, epoch)) return;
          this.modernForm()?.saved();
          this.modernRetry.finish();
          this.pendingModern.set(null);
          this.creating.set(false);
          this.notice.set('Subtask ' + saved.result.summary.key + ' created.');
          const page = await this.modernApi.search({
            projectIds: [intent.projectId],
            parentId: id,
            archived: this.issue().summary.archived,
          });
          if (!this.isCurrent(id, generation, epoch)) return;
          this.children.set(page.items);
          this.cursor.set(page.nextCursor);
          this.changed.emit();
        } catch (error: unknown) {
          if (
            this.isCurrent(id, generation, epoch) &&
            error instanceof ApiError &&
            !error.payload.error.retryable
          ) {
            this.pendingModern.set(null);
            this.modernRetry.finish();
          }
          throw error;
        }
      },
      () => this.isCurrent(id, generation, epoch),
    );
  }
}

