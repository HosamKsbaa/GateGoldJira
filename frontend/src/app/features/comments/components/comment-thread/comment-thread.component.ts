import type { IssueRecord } from '../../../issues/issue-model';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  Injector,
  ElementRef,
  viewChild,
} from '@angular/core';
import type {
  CommentBody,
  CommentView,
  CommentVersionView,
} from '../../../../api/generated/types.gen';
import { zCommentView } from '../../../../api/generated/zod.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { RetryIntent, ApiError } from '../../../../core/api/api-result';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { focusAfterRender } from '../../../../shared/ui/focus-after-render';
import { CommentsApi } from '../../comments.api';
import { CommentContentComponent } from './comment-nodes.component';
import { CommentEditorComponent } from '../comment-editor/comment-editor.component';
@Component({
  selector: 'gg-comment-thread',
  imports: [
    IconComponent,
    DatePipe,
    CommentContentComponent,
    CommentEditorComponent,
    RequestStatusComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './comment-thread.component.css',
  template: ` <section
    #discussionSection
    class="panel discussion"
    [id]="sectionId"
    tabindex="-1"
    [attr.aria-labelledby]="sectionId + '-heading'"
    ><div class="discussion-heading"
      ><h2 [id]="sectionId + '-heading'">Comments</h2
      ><button
        type="button"
        class="icon-button"
        aria-label="Reload comments"
        title="Refresh comments"
        (click)="load()"
        [disabled]="state.busy()"
        ><gg-icon name="refresh" /></button></div
    ><gg-request-status [state]="state" />
    @if (notice()) {
      <p role="status" class="notice">{{ notice() }}</p>
    }
    @for (value of sanitationNotices(); track value) {
      <p class="notice" role="status">{{ value }}</p>
    }
    <p [id]="statusId" class="discussion-count" tabindex="-1" role="status"
      >{{ total() }} comments · oldest first</p
    >
    @if (writable() && !editing()) {
      <div class="comment-compose"
        ><h3 class="editor-heading">Add a comment</h3
        ><gg-comment-editor
          [projectId]="issue().summary.projectId"
          [issueId]="issueId()"
          [current]="editing()"
          [reset]="editorReset()"
          [busy]="state.busy()"
          (draftRevision)="draftRevision.set($event)"
          (save)="save($event)"
          (cancel)="cancel()"
      /></div>
    } @else if (!writable()) {
      <p>Read-only discussion access</p>
    }
    <div role="region" aria-label="Issue discussion">
      @for (comment of comments(); track comment.id) {
        <article class="comment-record" [id]="'comment-' + comment.id" [attr.data-comment-id]="comment.id">
          <span class="comment-avatar" aria-hidden="true">{{
            initials(comment.author.displayName)
          }}</span
          ><div class="comment-body"
            ><header
              ><bdi class="comment-author">{{ comment.author.displayName }}</bdi> ·
              <time [attr.datetime]="comment.createdAt">{{
                comment.createdAt | date: 'medium'
              }}</time>
              @if (comment.editedAt) {
                <span> · Edited · version {{ comment.revision }}</span>
              }
            </header>
            @if (editing()?.id === comment.id) {
              <gg-comment-editor
                [projectId]="issue().summary.projectId"
                [issueId]="issueId()"
                [current]="editing()"
                [reset]="editorReset()"
                [busy]="state.busy()"
                (draftRevision)="draftRevision.set($event)"
                (save)="save($event)"
                (cancel)="cancel()"
              />
            } @else {
              <div
                class="editable-comment"
                [class.can-edit]="comment.canEdit"
                (click)="clickComment($event, comment)"
                ><gg-comment-content
                  [html]="comment.safeHtml"
                  [attachmentIds]="comment.attachmentIds ?? []"
              /></div>
            }
            <div class="actions">
              @if (comment.canEdit) {
                <button
                  type="button"
                  class="comment-action"
                  (click)="edit(comment)"
                  [disabled]="state.busy()"
                  >Edit comment</button
                >
              }
              <button
                type="button"
                class="comment-action"
                (click)="history(comment)"
                [disabled]="state.busy()"
                >Comment history</button
              ></div
            ></div
          >
        </article>
      } @empty {
        @if (!writable()) {
          <p class="empty-discussion">No comments yet.</p>
        }
      }
    </div>
    @if (cursor()) {
      <button type="button" (click)="load(cursor() ?? undefined)" [disabled]="state.busy()"
        >Next comments page</button
      >
    }
    @if (historyComment(); as comment) {
      <section class="comment-history" aria-label="Comment version history"
        ><h3>Retained versions</h3>
        @for (version of versions(); track version.revision) {
          <article
            ><h4>Version {{ version.revision }}</h4
            ><time [attr.datetime]="version.createdAt">{{
              version.createdAt | date: 'medium'
            }}</time
            ><gg-comment-content
              [html]="version.safeHtml"
              [attachmentIds]="version.attachmentIds ?? []"
          /></article>
        }
        @if (versionCursor()) {
          <button
            type="button"
            (click)="history(comment, versionCursor() ?? undefined)"
            [disabled]="state.busy()"
            >Next versions page</button
          >
        }
        <button type="button" (click)="closeHistory()" [disabled]="state.busy()"
          >Close comment history</button
        ></section
      >
    }
    @if (conflict(); as current) {
      <div class="notice"
        ><p>The comment has a newer version. Your unsent text remains in the editor.</p
        ><button type="button" (click)="review(current)"
          >Use current revision and keep my draft</button
        ></div
      >
    }
  </section>`,
})
export class CommentThreadComponent {
  readonly issue = input.required<IssueRecord>();
  readonly changed = output<void>();
  readonly issueId = computed(() => this.issue().summary.id);
  private readonly api = inject(CommentsApi);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly retry = new RetryIntent<{
    issueId: string;
    commentId: string | null;
    revision: string | null;
    body: CommentBody;
  }>();
  private generation = 0;
  readonly sectionId = 'comments-' + crypto.randomUUID();
  private readonly discussionSection = viewChild<ElementRef<HTMLElement>>('discussionSection');
  private readonly editor = viewChild(CommentEditorComponent);
  readonly statusId = 'discussion-status-' + crypto.randomUUID();
  readonly state = new RequestState();
  readonly comments = signal<CommentView[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly total = signal(0);
  readonly draftRevision = signal<string | null>(null);
  readonly editing = signal<CommentView | null>(null);
  readonly editorReset = signal(0);
  readonly historyComment = signal<CommentView | null>(null);
  readonly versions = signal<CommentVersionView[]>([]);
  readonly versionCursor = signal<string | null>(null);
  readonly notice = signal('');
  readonly sanitationNotices = signal<string[]>([]);
  readonly writable = computed(() => this.issue().capabilities.includes('comment'));
  readonly conflict = computed(() => {
    const failure = this.state.failure();
    if (failure?.payload.error.code !== 'conflict') return null;
    const parsed = zCommentView.safeParse(failure.payload.current);
    return parsed.success ? parsed.data : null;
  });
  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
    });
    effect(() => {
      this.issueId();
      this.auth.sessionEpoch();
      untracked(() => {
        this.generation++;
        this.state.busy.set(false);
        this.state.clear();
        this.clearRecords();
        this.cancel();
        this.notice.set('');
        this.sanitationNotices.set([]);
        void this.load();
      });
    });
  }
  private clearRecords(): void {
    this.comments.set([]);
    this.cursor.set(null);
    this.total.set(0);
    this.closeHistory();
  }
  closeHistory(): void {
    this.historyComment.set(null);
    this.versions.set([]);
    this.versionCursor.set(null);
  }
  async refreshQuiet(): Promise<void> {
    if (this.state.busy()) return;
    const id = this.issueId(),
      generation = this.generation,
      epoch = this.auth.sessionEpoch();
    const page = await this.api.list(id);
    if (generation !== this.generation || epoch !== this.auth.sessionEpoch() || this.state.busy())
      return;
    if (this.comments().length <= 25) {
      this.comments.set(page.items);
      this.cursor.set(page.nextCursor);
    } else if (page.totalMatching !== this.total()) {
      this.notice.set('New discussion activity. Reload comments to see the latest changes.');
    }
    this.total.set(page.totalMatching);
  }
  async load(cursor?: string): Promise<void> {
    const id = this.issueId(),
      epoch = this.auth.sessionEpoch(),
      generation = this.generation;
    const isCurrent = () =>
      id === this.issueId() && epoch === this.auth.sessionEpoch() && generation === this.generation;
    await this.state.run(async () => {
      try {
        const page = await this.api.list(id, cursor);
        if (!isCurrent()) return;
        this.comments.update(items => (cursor ? [...items, ...page.items] : page.items));
        this.cursor.set(page.nextCursor);
        this.total.set(page.totalMatching);
        if (cursor) focusAfterRender(this.statusId, this.injector);
      } catch (error: unknown) {
        if (isCurrent() && error instanceof ApiError && [403, 404].includes(error.status)) {
          this.clearRecords();
          this.cancel();
        }
        throw error;
      }
    }, isCurrent);
  }
  focusDiscussion(addComment = false): void {
    if (addComment && this.writable()) {
      if (this.editing()) {
        this.cancel();
      }
      afterNextRender(() => this.editor()?.focusEditor(), { injector: this.injector });
      return;
    }
    const section = this.discussionSection()?.nativeElement;
    section?.scrollIntoView({ block: 'start' });
    section?.focus({ preventScroll: true });
  }
  initials(name: string): string {
    return name
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map(part => Array.from(part)[0] ?? '')
      .join('');
  }
  clickComment(event: MouseEvent, comment: CommentView): void {
    if (
      event.target instanceof Element &&
      event.target.closest('a,button,input,gg-picture-image,gg-attachment-reference')
    )
      return;
    if (window.getSelection()?.toString()) return;
    this.edit(comment);
  }
  edit(comment: CommentView): void {
    if (!comment.canEdit || this.state.busy() || this.editing()?.id === comment.id) return;
    this.editing.set(comment);
    this.retry.finish();
    this.state.clear();
    this.notice.set('');
    this.sanitationNotices.set([]);
  }
  cancel(): void {
    if (this.editing() && !this.editor()?.confirmClose()) return;
    this.editing.set(null);
    this.editorReset.update(value => value + 1);
    this.retry.finish();
    this.state.clear();
  }
  review(current: CommentView): void {
    this.draftRevision.set(current.revision);
    this.editing.set(current);
    this.retry.finish();
    this.state.clear();
  }
  async save(body: CommentBody): Promise<void> {
    const current = this.editing(),
      id = this.issueId(),
      epoch = this.auth.sessionEpoch(),
      generation = this.generation;
    const isCurrent = () =>
      id === this.issueId() && epoch === this.auth.sessionEpoch() && generation === this.generation;
    await this.state.run(async () => {
      const reference = this.retry.reference({
        issueId: id,
        commentId: current?.id ?? null,
        revision: this.draftRevision() ?? current?.revision ?? null,
        body,
      });
      const saved = current
        ? await this.api.update(
            current.id,
            this.draftRevision() ?? current.revision,
            body,
            reference,
          )
        : await this.api.create(id, body, reference);
      if (!isCurrent()) return;
      this.editor()?.saved();
      this.retry.finish();
      this.editing.set(null);
      this.editorReset.update(value => value + 1);
      this.sanitationNotices.set(saved.result.sanitationNotices);
      this.notice.set(current ? 'Comment changes saved.' : 'Comment posted.');
      this.changed.emit();
      const page = await this.api.list(id);
      if (!isCurrent()) return;
      this.comments.set(page.items);
      this.cursor.set(page.nextCursor);
      this.total.set(page.totalMatching);
      focusAfterRender(this.statusId, this.injector);
    }, isCurrent);
  }
  async history(comment: CommentView, cursor?: string): Promise<void> {
    const epoch = this.auth.sessionEpoch(),
      generation = this.generation;
    const isCurrent = () => epoch === this.auth.sessionEpoch() && generation === this.generation;
    await this.state.run(async () => {
      const page = await this.api.versions(comment.id, cursor);
      if (!isCurrent()) return;
      this.historyComment.set(comment);
      this.versions.set(page.items);
      this.versionCursor.set(page.nextCursor);
    }, isCurrent);
  }
}
