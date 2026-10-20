import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  resource,
  signal,
  viewChild,
  DestroyRef,
} from '@angular/core';
import { PicturesApi } from '../../pictures.api';
import { AuthService } from '../../../../core/auth/auth.service';
@Component({
  selector: 'gg-picture-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <span
    #host
    class="protected-picture"
    [class.external]="externalPreview()"
    [attr.aria-label]="description()"
  >
    @if (source(); as url) {
      <button
        type="button"
        class="picture-open"
        (click)="open(preview)"
        [attr.aria-label]="'Preview ' + description()"
        ><img [src]="url" [alt]="description()" loading="lazy" decoding="async" /></button
      ><dialog #preview class="picture-preview" (close)="expanded.set(false)"
        ><button
          type="button"
          class="secondary"
          aria-label="Close picture preview"
          (click)="preview.close()"
          >Close</button
        >
        @if (expanded()) {
          <img [src]="url" [alt]="description()" />
        }
        <p dir="auto">{{ description() }}</p></dialog
      >
    } @else if (blob.error()) {
      <span role="status"
        >Picture unavailable.
        <button type="button" (click)="blob.reload()">Retry picture</button></span
      >
    } @else {
      <span class="muted">{{
        visible() ? 'Loading picture…' : 'Picture loads when visible.'
      }}</span>
    }
  </span>`,
  styles: `
    .external {
      display: block;
      max-height: 120px;
    }
    .external .picture-open {
      display: block;
      height: 120px;
      width: 100%;
    }
    .external img {
      display: block;
      max-height: 120px;
      width: 100%;
      object-fit: contain;
    }
    .picture-open {
      padding: 0;
      border: 0;
      background: transparent;
      cursor: zoom-in;
      max-width: 100%;
      display: inline-block;
    }
    .picture-preview {
      border: 0;
      border-radius: 8px;
      max-width: 94vw;
      max-height: 90dvh;
      padding: 16px;
    }
    .picture-preview::backdrop {
      background: #091e4280;
    }
    .picture-preview img {
      display: block;
      max-width: 85vw;
      max-height: 72dvh;
      object-fit: contain;
      margin: 12px auto;
    }
  `,
})
export class PictureImageComponent {
  readonly externalPreview = input(false);
  readonly previewRequested = output<void>();
  open(dialog: HTMLDialogElement): void {
    if (this.externalPreview()) this.previewRequested.emit();
    else {
      this.expanded.set(true);
      dialog.showModal();
    }
  }
  readonly expanded = signal(false);
  readonly pictureId = input.required<string>();
  readonly description = input('Uploaded picture');
  private readonly auth = inject(AuthService);
  private readonly api = inject(PicturesApi);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  readonly visible = signal(false);
  readonly source = signal<string | null>(null);
  readonly blob = resource({
    params: () =>
      this.visible() && this.auth.me()
        ? { id: this.pictureId(), epoch: this.auth.sessionEpoch() }
        : undefined,
    loader: ({ params, abortSignal }) => this.api.content(params.id, abortSignal),
  });
  constructor() {
    effect(onCleanup => {
      if (!this.auth.me() || !this.blob.hasValue()) {
        this.source.set(null);
        return;
      }
      const url = URL.createObjectURL(this.blob.value());
      this.source.set(url);
      onCleanup(() => {
        URL.revokeObjectURL(url);
        this.source.set(null);
      });
    });
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof IntersectionObserver === 'undefined') {
        this.visible.set(true);
        return;
      }
      const observer = new IntersectionObserver(
        entries => {
          if (entries.some(entry => entry.isIntersecting)) {
            this.visible.set(true);
            observer.disconnect();
          }
        },
        { rootMargin: '100px' },
      );
      observer.observe(this.host().nativeElement);
      destroy.onDestroy(() => observer.disconnect());
    });
  }
}
