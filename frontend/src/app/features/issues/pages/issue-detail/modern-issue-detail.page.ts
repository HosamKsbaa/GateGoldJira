import { IssueReviewComponent } from '../../components/custom-fields/issue-review.component';
import { CustomFieldsComponent } from '../../components/custom-fields/custom-fields.component';
import { IssuePlanningComponent } from '../../../planning/issue-planning.component';
import { DevelopmentLinksComponent } from '../../../integrations/development-links.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { IssueAttachmentsComponent } from '../../../attachments/components/issue-attachments/issue-attachments.component';
import {
  ModernIssueFieldEditorComponent,
  type ModernEditableField,
} from '../../components/modern-issue-field-editor/modern-issue-field-editor.component';
import { DraftsService, type ModernIssueDraft } from '../../../../core/drafts/drafts.service';
import { foregroundRefresh } from '../../../../core/refresh/foreground-refresh';
import { ModernIssueActionsComponent } from '../../components/modern-issue-actions/modern-issue-actions.component';
import { IssueHistoryComponent } from '../../components/issue-history/issue-history.component';
import { statusName, statusCategory } from '../../../boards/board-workflow';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  resource,
  effect,
  Injector,
  afterNextRender,
  ElementRef,
  viewChild,
  input,
  computed,
  viewChildren,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ModernIssuesApi } from '../../modern-issues.api';
import { CommentContentComponent } from '../../../comments/components/comment-thread/comment-nodes.component';
import { CommentThreadComponent } from '../../../comments/components/comment-thread/comment-thread.component';
import { SubtasksComponent } from '../../components/subtasks/subtasks.component';
import { DependenciesComponent } from '../../components/dependencies/dependencies.component';
import { ModernIssueFormComponent } from '../../components/modern-issue-form/modern-issue-form.component';
import type { ModernIssueView, ModernEditable } from '../../../../api/generated/types.gen';
import { zModernIssueView } from '../../../../api/generated/zod.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RetryIntent, ApiError } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { focusAfterRender } from '../../../../shared/ui/focus-after-render';
@Component({
  selector: 'gg-modern-issue-detail',
  imports: [
    IssueReviewComponent,
    CustomFieldsComponent,
    IssuePlanningComponent,
    DevelopmentLinksComponent,
    IconComponent,
    IssueAttachmentsComponent,
    ModernIssueFieldEditorComponent,
    ModernIssueActionsComponent,
    IssueHistoryComponent,
    DatePipe,
    RouterLink,
    ModernIssueFormComponent,
    DependenciesComponent,
    SubtasksComponent,
    RequestStatusComponent,
    CommentThreadComponent,
    CommentContentComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './issue-detail.page.css',
  templateUrl: './modern-issue-detail.page.html',
})
export class ModernIssueDetailPage {
  readonly embeddedIssueId = input<string | null>(null);
  readonly activityTab = signal<'comments' | 'history'>('comments');
  private readonly drafts = inject(DraftsService);
  readonly selectedID = computed(
    () => this.embeddedIssueId() ?? this.params().get('issueId') ?? '',
  );
  private readonly api = inject(ModernIssuesApi);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly issueForm = viewChild(ModernIssueFormComponent);
  readonly quickActions = viewChild(ModernIssueActionsComponent);
  readonly planning = viewChild(IssuePlanningComponent);
  readonly fields = viewChildren(ModernIssueFieldEditorComponent);
  readonly inlineEditing = computed(() => this.fields().some(field => field.editing()));
  inlineUnavailable(field: ModernEditableField): boolean {
    return (
      !!this.editing() ||
      this.state.busy() ||
      !!this.planning()?.busy() ||
      this.fields().some(editor => editor.field() !== field && editor.editing())
    );
  }
  fieldSaved(current: ModernIssueView): void {
    this.issue.set(current);
    void this.attachments()?.load();
  }
  readonly state = new RequestState();
  private readonly editDialog = viewChild<ElementRef<HTMLDialogElement>>('editDialog');
  readonly discussion = viewChild(CommentThreadComponent);
  readonly attachments = viewChild(IssueAttachmentsComponent);
  private readonly attachmentSection = viewChild<ElementRef<HTMLElement>>('attachmentSection');
  readonly notice = signal('');
  readonly ownUploadRevision = signal<string | null>(null);
  readonly editing = signal<ModernIssueView | null>(null);
  readonly rejectedDraft = signal<ModernIssueDraft | null>(null);
  readonly issue = resource({
    params: () =>
      this.auth.me() ? { id: this.selectedID(), epoch: this.auth.sessionEpoch() } : undefined,
    loader: ({ params, abortSignal }) => this.api.get(params.id, abortSignal),
  });
  private readonly retry = new RetryIntent<{
    issueId: string;
    expectedRevision: string;
    editable: ModernEditable;
  }>();
  constructor() {
    foregroundRefresh(
      () =>
        !!this.auth.me() &&
        !this.editing() &&
        !this.state.busy() &&
        !this.drafts.dirtyCount() &&
        !this.discussion()?.state.busy() &&
        !this.attachments()?.busy() &&
        !this.inlineEditing() &&
        !this.quickActions()?.busy(),
      async () => {
        const id = this.selectedID(),
          epoch = this.auth.sessionEpoch(),
          before = this.issue.value();
        const latest = await this.api.get(id);
        if (
          id !== this.selectedID() ||
          epoch !== this.auth.sessionEpoch() ||
          this.editing() ||
          this.drafts.dirtyCount() ||
          this.state.busy() ||
          this.quickActions()?.busy() ||
          this.discussion()?.state.busy() ||
          this.attachments()?.busy() ||
          this.inlineEditing() ||
          before !== this.issue.value()
        )
          return;
        this.issue.set(latest);
        await this.discussion()?.refreshQuiet();
      },
    );
    let id = this.selectedID();
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      const nextId = this.selectedID();
      const nextEpoch = this.auth.sessionEpoch();
      if (id !== nextId || epoch !== nextEpoch) {
        id = nextId;
        epoch = nextEpoch;
        this.rejectedDraft.set(null);
        this.cancel();
        this.notice.set('');
        this.activityTab.set('comments');
      }
    });
  }
  errorMessage(): string {
    const error = this.issue.error();
    return error instanceof ApiError ? error.message : 'The issue could not be loaded. Try again.';
  }
  currentConflict(): ModernIssueView | null {
    const failure = this.state.failure();
    if (failure?.payload.error.code !== 'conflict') return null;
    const current = zModernIssueView.safeParse(failure.payload.current);
    return current.success ? current.data : null;
  }
  async edit(): Promise<void> {
    await this.state.run(async () => {
      const epoch = this.auth.sessionEpoch();
      const id = this.selectedID();
      const current = await this.api.get(id);
      if (epoch !== this.auth.sessionEpoch() || id !== this.selectedID()) return;
      this.issue.set(current);
      if (!current.capabilities.includes('edit')) return;
      this.rejectedDraft.set(null);
      this.editing.set(current);
      this.ownUploadRevision.set(null);
      this.notice.set('');
      this.retry.finish();
      this.openEditor();
    });
  }
  filesAdded(): void {
    this.issue.reload();
    void this.attachments()?.load();
  }
  focusComments(addComment = false): void {
    this.activityTab.set('comments');
    afterNextRender(() => this.discussion()?.focusDiscussion(addComment), {
      injector: this.injector,
    });
  }
  activityKey(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 'comments'
        : event.key === 'End'
          ? 'history'
          : this.activityTab() === 'comments'
            ? 'history'
            : 'comments';
    this.activityTab.set(next);
    const tabs = event.currentTarget;
    if (tabs instanceof HTMLElement)
      tabs.querySelector<HTMLButtonElement>('#' + next + '-tab')?.focus();
  }
  focusAttachments(addPicture = false): void {
    if (addPicture) {
      this.attachments()?.chooseFiles();
      return;
    }
    const section = this.attachmentSection()?.nativeElement;
    section?.scrollIntoView({ block: 'start' });
    section?.focus({ preventScroll: true });
  }
  private openEditor(): void {
    afterNextRender(
      () => {
        const dialog = this.editDialog()?.nativeElement;
        if (dialog && !dialog.open) dialog.showModal();
        document.getElementById('issue-title')?.focus();
      },
      { injector: this.injector },
    );
  }
  dialogCancel(event: Event): void {
    event.preventDefault();
    if (!this.state.busy()) this.cancel();
  }
  readonly category = statusCategory;

  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map(part => Array.from(part)[0] ?? '')
      .join('');
  }
  cancel(): void {
    if (this.editing() && !this.issueForm()?.confirmClose()) return;
    this.editDialog()?.nativeElement.close();
    this.editing.set(null);
    this.rejectedDraft.set(null);
    this.retry.finish();
    this.state.clear();
    focusAfterRender('edit-issue', this.injector);
  }
  review(current: ModernIssueView): void {
    this.rejectedDraft.set(null);
    this.issueForm()?.saved();
    this.issue.set(current);
    this.editing.set(current);
    this.ownUploadRevision.set(null);
    this.retry.finish();
    this.state.clear();
    this.openEditor();
  }
  private async restoreRejectedDraft(
    intention: { issueId: string; expectedRevision: string; editable: ModernEditable },
    draft: ModernIssueDraft | undefined,
    userId: string | undefined,
    savedEpoch: number,
  ): Promise<void> {
    const epoch = this.auth.sessionEpoch();
    const sameRead = () =>
      !!userId &&
      this.auth.me()?.userId === userId &&
      this.auth.sessionEpoch() === epoch &&
      epoch === savedEpoch + 1 &&
      this.selectedID() === intention.issueId;
    // A forbidden write invalidates shared caches and all drafts. Retain only
    // this rejected intention, after a fresh read authorizes this exact issue.
    // A sign-out/login, another epoch change or denied read cannot revive it.
    if (!sameRead()) return;
    try {
      const current = await this.api.get(intention.issueId);
      if (!sameRead() || current.summary.id !== intention.issueId) return;
      this.issue.set(current);
      this.rejectedDraft.set({
        fields: { ...(draft?.fields ?? intention.editable), ...intention.editable },
        editable: intention.editable,
        revision: intention.expectedRevision,
        files: draft?.files ?? [],
      });
      this.editing.set(current);
      this.ownUploadRevision.set(intention.expectedRevision);
      this.retry.finish();
      this.openEditor();
    } catch {
      // The original forbidden result remains visible; inaccessible data and
      // its private draft stay cleared by the session boundary.
    }
  }
  async save(editable: ModernEditable): Promise<void> {
    const current = this.editing();
    if (!current) return;
    await this.state.run(async () => {
      const epoch = this.auth.sessionEpoch();
      const intention = {
        issueId: current.summary.id,
        expectedRevision: this.ownUploadRevision() ?? current.summary.revision,
        editable,
      };
      const userId = this.auth.me()?.userId;
      const draft = this.drafts.modernIssues.get('issue:' + intention.issueId);
      let saved;
      try {
        saved = await this.api.update(
          intention.issueId,
          intention.expectedRevision,
          editable,
          this.retry.reference(intention),
        );
      } catch (error: unknown) {
        if (error instanceof ApiError && error.payload.error.code === 'forbidden') {
          await this.restoreRejectedDraft(intention, draft, userId, epoch);
        }
        throw error;
      }
      if (epoch !== this.auth.sessionEpoch() || intention.issueId !== this.selectedID()) return;
      this.issueForm()?.saved();
      this.issue.set(saved.result);
      this.editDialog()?.nativeElement.close();
      this.editing.set(null);
      focusAfterRender('edit-issue', this.injector);
      this.retry.finish();
      this.notice.set('Issue saved.');
    });
  }
}
