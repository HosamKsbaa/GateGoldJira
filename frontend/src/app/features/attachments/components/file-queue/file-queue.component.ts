import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { AttachmentView, PictureView } from '../../../../api/generated/types.gen';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService, type DraftFile } from '../../../../core/drafts/drafts.service';
import { AssetsApi } from '../../assets.api';
import { attachmentMetadata, attachmentSize } from '../../attachment-files';
@Component({
  selector: 'gg-file-queue',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './file-queue.component.html',
  styleUrl: './file-queue.component.css',
})
export class FileQueueComponent {
  readonly issueId = input.required<string>();
  readonly disabled = input(false);
  readonly publication = input<'gallery' | 'comment_draft'>('gallery');
  readonly pictureLimit = input(20);
  readonly queueScope = input('attachments');
  readonly trackIssueRevision = input(false);
  readonly uploadedRevision = output<string>();
  readonly changed = output<void>();
  readonly pictureUploaded = output<PictureView>();
  readonly documentUploaded = output<AttachmentView>();
  readonly dragOver = signal(false);
  readonly busy = signal(false);
  readonly files = signal<DraftFile[]>([]);
  readonly error = signal('');
  readonly size = attachmentSize;
  readonly controlId = 'file-queue-' + crypto.randomUUID();
  private readonly api = inject(AssetsApi);
  readonly maximumBytes = signal(10 * 1024 * 1024);
  private transfer: AbortController | null = null;
  private activeItem: string | null = null;
  private readonly auth = inject(AuthService);
  private readonly drafts = inject(DraftsService);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private generation = 0;
  private key = '';

  constructor() {
    effect(() => {
      this.issueId();
      this.queueScope();
      this.auth.sessionEpoch();
      untracked(() => {
        this.drafts.release(this.key);
        this.key = 'uploads:' + this.issueId() + ':' + this.queueScope();
        this.generation++;
        this.files.set(this.drafts.uploads.get(this.key) ?? []);
        this.transfer?.abort();
        this.remember();
        this.busy.set(false);
        this.error.set('');
        const generation = this.generation;
        void this.api
          .policy()
          .then(policy => {
            if (generation === this.generation)
              this.maximumBytes.set(Number(policy.maximumFileBytes));
          })
          .catch(() => {});
      });
    });
    inject(DestroyRef).onDestroy(() => {
      this.generation++;
      this.transfer?.abort();
      this.drafts.release(this.key);
    });
  }

  private remember(): void {
    this.drafts.uploads.set(this.key, this.files());
    this.drafts.activate(this.key, this.pending());
  }
  chooseFiles(): void {
    if (!this.busy() && !this.disabled()) this.fileInput()?.nativeElement.click();
  }
  async pasteAndUpload(file: File): Promise<void> {
    this.choose([file]);
    await this.upload();
  }
  pending(): boolean {
    return this.files().some(item => item.state !== 'uploaded');
  }
  select(event: Event): void {
    if (event.target instanceof HTMLInputElement) {
      this.choose(Array.from(event.target.files ?? []));
      event.target.value = '';
    }
  }
  drop(event: DragEvent): void {
    event.preventDefault();
    this.dragOver.set(false);
    this.choose(Array.from(event.dataTransfer?.files ?? []));
  }

  choose(files: File[]): void {
    if (this.busy() || this.disabled()) return;
    this.error.set('');
    for (const file of files) {
      const queuedPictures = this.files().filter(
        item => item.state !== 'uploaded' && this.isPicture(item.file),
      ).length;
      if (this.isPicture(file) && queuedPictures >= this.pictureLimit()) {
        this.error.set('Remove a picture from the editor before adding more.');
        continue;
      }
      if (
        !attachmentMetadata(
          file,
          this.isPicture(file)
            ? Math.min(this.maximumBytes(), 10 * 1024 * 1024)
            : this.maximumBytes(),
        )
      ) {
        this.error.set('Choose a valid filename and a file within the displayed upload limit.');
        continue;
      }
      if (this.files().length >= 20) {
        this.error.set('Finish this queue before adding more than 20 files.');
        break;
      }
      this.files.update(items => [
        ...items,
        { id: crypto.randomUUID(), file, state: 'queued', reference: crypto.randomUUID() },
      ]);
    }
    this.remember();
  }

  private isPicture(file: File): boolean {
    return ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
  }
  progress(item: DraftFile): number {
    return Math.min(100, Math.round(((item.receivedBytes ?? 0) / item.file.size) * 100));
  }
  async cancelUpload(item: DraftFile): Promise<void> {
    if (this.activeItem === item.id) this.transfer?.abort();
    if (!item.sessionId) {
      if (!this.busy()) this.remove(item.id);
      return;
    }
    item.cancelReference ??= crypto.randomUUID();
    const generation = this.generation,
      epoch = this.auth.sessionEpoch();
    const current = () => generation === this.generation && epoch === this.auth.sessionEpoch();
    try {
      await this.api.cancel(item.sessionId, item.cancelReference);
      if (!current()) return;
      this.files.update(items => items.filter(value => value.id !== item.id));
      this.remember();
    } catch (error: unknown) {
      if (!current()) return;
      item.error =
        error instanceof Error
          ? error.message
          : 'Cancellation could not be confirmed. Retry cancel.';
      this.files.update(items => [...items]);
    }
  }
  remove(id: string): void {
    if (this.busy() || this.disabled()) return;
    this.files.update(items => items.filter(item => item.id !== id));
    this.remember();
  }
  clear(): void {
    if (this.busy() || this.disabled()) return;
    this.files.set([]);
    this.error.set('');
    this.drafts.uploads.delete(this.key);
    this.drafts.release(this.key);
  }

  clearCompleted(): void {
    // A confirmed editor save can dismiss completed uploads while its parent is still busy.
    if (this.busy()) return;
    this.files.update(items => items.filter(item => item.state !== 'uploaded'));
    this.remember();
  }

  async upload(): Promise<void> {
    if (this.busy() || this.disabled()) return;
    const generation = this.generation,
      epoch = this.auth.sessionEpoch(),
      id = this.issueId();
    const current = () => generation === this.generation && epoch === this.auth.sessionEpoch();
    this.busy.set(true);
    this.error.set('');
    let count = 0;
    try {
      for (const item of this.files()) {
        if (item.state === 'uploaded') continue;
        try {
          const mime = item.file.type,
            metadata = attachmentMetadata(item.file, this.maximumBytes());
          if (!metadata) continue;
          this.transfer = new AbortController();
          this.activeItem = item.id;
          const picture = mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp';
          const asset = await this.api.uploadFile(
            id,
            {
              filename: item.file.name,
              description: picture ? Array.from(item.file.name).slice(0, 200).join('') : '',
              mimeType: picture ? mime : metadata.mimeType,
              kind: picture ? 'image' : 'file',
              publication: this.publication() === 'comment_draft' ? 'draft' : 'issue',
            },
            item,
            received => {
              if (current()) {
                item.receivedBytes = received;
                this.files.update(items => [...items]);
                this.remember();
              }
            },
            this.transfer.signal,
          );
          if (!current()) return;
          if (this.trackIssueRevision() && asset.state === 'published')
            this.uploadedRevision.emit(asset.issueRevision);
          if (asset.kind === 'image')
            this.pictureUploaded.emit({
              id: asset.id,
              issueId: asset.issueId,
              filename: asset.filename,
              description: asset.description,
              mimeType: picture ? mime : 'image/png',
              byteSize: Number(asset.byteSize),
              uploader: asset.uploader,
              uploadedAt: asset.uploadedAt,
              state: asset.state,
              inGallery: asset.inPanel,
              expiresAt: asset.expiresAt,
            });
          else
            this.documentUploaded.emit({
              id: asset.id,
              issueId: asset.issueId,
              filename: asset.filename,
              mimeType: metadata.mimeType,
              byteSize: Number(asset.byteSize),
              uploader: asset.uploader,
              uploadedAt: asset.uploadedAt,
              attached: asset.inPanel,
            });
          item.state = 'uploaded';
          delete item.error;
          count++;
        } catch (error: unknown) {
          if (!current()) return;
          item.state = 'failed';
          item.error = error instanceof Error ? error.message : 'Upload failed. Retry this queue.';
        }
        this.files.update(items => [...items]);
        this.remember();
      }
      if (count) this.changed.emit();
    } finally {
      if (current()) {
        this.busy.set(false);
        this.activeItem = null;
        this.transfer = null;
      }
    }
  }
}
