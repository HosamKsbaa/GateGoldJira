import type { IssueRecord } from '../../../issues/issue-model';
import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { AssetView } from '../../../../api/generated/types.gen';
import { ApiError, RetryIntent } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { RequestState } from '../../../../shared/ui/request-state';
import { RequestStatusComponent } from '../../../../shared/ui/request-status.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { PictureImageComponent } from '../../../pictures/components/picture-image/picture-image.component';
import { AssetsApi } from '../../assets.api';
import { attachmentSize } from '../../attachment-files';
import { FileQueueComponent } from '../file-queue/file-queue.component';
import { FilePreviewComponent } from '../file-preview/file-preview.component';

type IssueAttachment = { kind: 'picture' | 'document'; file: AssetView };

@Component({
  selector: 'gg-issue-attachments',
  imports: [
    DatePipe,
    RequestStatusComponent,
    IconComponent,
    PictureImageComponent,
    FileQueueComponent,
    FilePreviewComponent,
  ],
  templateUrl: './issue-attachments.component.html',
  styleUrl: './issue-attachments.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IssueAttachmentsComponent {
  readonly issue = input.required<IssueRecord>();
  readonly changed = output<void>();
  readonly state = new RequestState();
  readonly loading = new RequestState();
  readonly items = signal<IssueAttachment[]>([]);
  readonly total = signal(0);
  readonly preview = signal<AssetView | null>(null);
  readonly notice = signal('');
  readonly pendingDetach = signal<IssueAttachment | null>(null);
  readonly detachRevision = signal('');
  readonly conflict = computed(
    () => this.state.failure()?.payload.error.code === 'conflict' && !!this.pendingDetach(),
  );
  readonly writable = computed(() => this.issue().capabilities.includes('edit'));
  readonly canRetryDetach = computed(
    () => this.writable() && this.issue().summary.revision !== this.detachRevision(),
  );
  readonly cursor = signal<string | null>(null);
  readonly hasMore = computed(() => !!this.cursor());
  readonly queue = viewChild(FileQueueComponent);
  readonly busy = computed(
    () => this.state.busy() || this.loading.busy() || !!this.queue()?.busy(),
  );
  readonly size = attachmentSize;
  private readonly issueId = computed(() => this.issue().summary.id);
  private readonly api = inject(AssetsApi);
  private readonly auth = inject(AuthService);
  private readonly retry = new RetryIntent<{ id: string; revision: string }>();
  private readonly urls = new Set<string>();
  private generation = 0;

  constructor() {
    effect(() => {
      this.issueId();
      this.auth.sessionEpoch();
      untracked(() => {
        this.generation++;
        this.items.set([]);
        this.total.set(0);
        this.preview.set(null);
        this.cursor.set(null);
        this.pendingDetach.set(null);
        this.notice.set('');
        this.retry.finish();
        this.state.clear();
        this.state.busy.set(false);
        this.loading.clear();
        this.loading.busy.set(false);
        this.releaseUrls();
        void this.load();
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.releaseUrls();
    });
  }

  private currentRequest(): () => boolean {
    const generation = this.generation,
      epoch = this.auth.sessionEpoch(),
      id = this.issueId();
    return () =>
      generation === this.generation && epoch === this.auth.sessionEpoch() && id === this.issueId();
  }

  async load(more = false): Promise<void> {
    const current = this.currentRequest(),
      id = this.issueId();
    await this.loading.run(async () => {
      try {
        const page = await this.api.list(id, more ? (this.cursor() ?? undefined) : undefined);
        if (!current()) return;
        const next: IssueAttachment[] = page.items.map(file => ({
          kind: file.kind === 'image' ? 'picture' : 'document',
          file,
        }));
        this.items.set(more ? [...this.items(), ...next] : next);
        this.cursor.set(page.nextCursor);
        this.total.set(page.totalMatching);
      } catch (error: unknown) {
        if (current() && error instanceof ApiError && [403, 404].includes(error.status)) {
          this.items.set([]);
          this.total.set(0);
          this.preview.set(null);
        }
        throw error;
      }
    }, current);
  }

  chooseFiles(): void {
    this.queue()?.chooseFiles();
  }
  added(): void {
    this.changed.emit();
    void this.load();
  }
  private releaseUrls(): void {
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
  }

  async download(item: IssueAttachment): Promise<void> {
    const current = this.currentRequest();
    await this.state.run(async () => {
      const blob = await this.api.content(item.file.id);
      if (!current()) return;
      const url = URL.createObjectURL(blob);
      this.urls.add(url);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = item.file.filename;
      anchor.hidden = true;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        this.urls.delete(url);
      }, 1000);
    }, current);
  }

  async detach(item: IssueAttachment, revision = this.issue().summary.revision): Promise<void> {
    if (!this.writable() || this.state.busy()) return;
    const current = this.currentRequest();
    this.pendingDetach.set(item);
    this.detachRevision.set(revision);
    await this.state.run(async () => {
      const reference = this.retry.reference({ id: item.file.id, revision });
      try {
        await this.api.detach(item.file.id, revision, reference);
      } catch (error: unknown) {
        if (current() && error instanceof ApiError && error.payload.error.code === 'conflict')
          this.changed.emit();
        throw error;
      }
      if (!current()) return;
      this.retry.finish();
      this.pendingDetach.set(null);
      this.items.update(items => items.filter(value => value.file.id !== item.file.id));
      this.total.update(total => Math.max(0, total - 1));
      this.notice.set(
        `${item.file.filename} removed from attachments. References in comments and descriptions are preserved.`,
      );
      this.changed.emit();
    }, current);
  }

  reviewDetach(): void {
    const item = this.pendingDetach();
    if (!item || !this.canRetryDetach()) return;
    this.retry.finish();
    void this.detach(item);
  }
}
