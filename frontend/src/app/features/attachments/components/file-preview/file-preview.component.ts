import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, type SafeResourceUrl } from '@angular/platform-browser';
import type { AssetView, AttachmentView, PictureView } from '../../../../api/generated/types.gen';
import { AssetsApi } from '../../assets.api';
import { PicturesApi } from '../../../pictures/pictures.api';
import { AttachmentsApi } from '../../attachments.api';
import { AuthService } from '../../../../core/auth/auth.service';
@Component({
  selector: 'gg-file-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<dialog #dialog aria-label="Attachment preview" (cancel)="close($event)"
    ><header
      ><h2 dir="auto">{{ attachment().filename }}</h2
      ><button
        type="button"
        class="secondary"
        aria-label="Close attachment preview"
        (click)="close()"
        >×</button
      ></header
    >
    @if (error()) {
      <div class="preview-error"
        ><p role="alert">{{ error() }}</p
        ><button type="button" class="secondary" (click)="attempt.update(increment)"
          >Retry preview</button
        ></div
      >
    } @else if (!source()) {
      <p role="status">Loading private attachment…</p>
    } @else {
      @if (pdf(); as url) {
        <iframe
          [src]="url"
          title="PDF attachment"
          sandbox="allow-same-origin allow-scripts"
          referrerpolicy="no-referrer"
        ></iframe>
      } @else if (picture()) {
        <div class="image-preview"><img [src]="source()" [alt]="attachment().filename" /></div>
      } @else {
        <p>Preview is not available for this file type. Download it to open it in your app.</p>
      }
      <a [href]="source()" [download]="attachment().filename">Download file</a>
    }
  </dialog>`,
  styles: `
    dialog {
      border: 0;
      border-radius: 8px;
      width: min(900px, 92vw);
      height: 85dvh;
      max-height: 90dvh;
      padding: 20px;
      box-shadow: 0 20px 60px #091e4266;
    }
    dialog::backdrop {
      background: #091e4280;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    h2 {
      font-size: 18px;
      overflow-wrap: anywhere;
    }
    iframe {
      display: block;
      width: 100%;
      height: calc(100% - 100px);
      border: 1px solid #dfe1e6;
    }
    header button {
      font-size: 24px;
    }
    .image-preview {
      display: grid;
      place-items: center;
      height: calc(100% - 110px);
      background: #f7f8f9;
      margin-bottom: 16px;
    }
    .image-preview img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
    }
    a {
      display: inline-block;
      margin-top: 12px;
    }
  `,
})
export class FilePreviewComponent {
  readonly attachment = input.required<AssetView | AttachmentView | PictureView>();
  readonly closed = output<void>();
  readonly source = signal<string | null>(null);
  readonly pdf = signal<SafeResourceUrl | null>(null);
  readonly picture = signal(false);
  readonly error = signal('');
  readonly attempt = signal(0);
  readonly increment = (value: number): number => value + 1;
  private readonly assets = inject(AssetsApi);
  private readonly pictures = inject(PicturesApi);
  private readonly api = inject(AttachmentsApi);
  private readonly auth = inject(AuthService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  constructor() {
    afterNextRender(() => this.dialog()?.nativeElement.showModal());
    effect(cleanup => {
      this.attempt();
      const item = this.attachment(),
        epoch = this.auth.sessionEpoch();
      const abort = new AbortController();
      let url: string | null = null;
      this.source.set(null);
      this.pdf.set(null);
      this.error.set('');
      this.picture.set(false);
      void (
        'kind' in item
          ? this.assets.content(item.id, abort.signal)
          : 'inGallery' in item
            ? this.pictures.content(item.id, abort.signal)
            : this.api.content(item.id, abort.signal)
      )
        .then(blob => {
          if (abort.signal.aborted || epoch !== this.auth.sessionEpoch()) return;
          url = URL.createObjectURL(blob);
          this.source.set(url);
          this.picture.set(['image/png', 'image/jpeg', 'image/webp'].includes(blob.type));
          if (item.mimeType === 'application/pdf' && blob.type === 'application/pdf')
            this.pdf.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
        })
        .catch(() => {
          if (!abort.signal.aborted)
            this.error.set('This attachment could not be loaded. Try again.');
        });
      cleanup(() => {
        abort.abort();
        if (url) URL.revokeObjectURL(url);
      });
    });
    inject(DestroyRef).onDestroy(() => this.dialog()?.nativeElement.close());
  }
  close(event?: Event): void {
    event?.preventDefault();
    this.dialog()?.nativeElement.close();
    this.closed.emit();
  }
}
