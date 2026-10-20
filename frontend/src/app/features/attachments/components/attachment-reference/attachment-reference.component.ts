import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import type { AssetView } from '../../../../api/generated/types.gen';
import { AssetsApi } from '../../assets.api';
import { AuthService } from '../../../../core/auth/auth.service';
import { FilePreviewComponent } from '../file-preview/file-preview.component';
@Component({
  selector: 'gg-attachment-reference',
  imports: [FilePreviewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<button type="button" class="secondary" (click)="open()" [disabled]="loading()"
      ><ng-content
    /></button>
    @if (error()) {
      <span role="status">{{ error() }}</span>
    }
    @if (current(); as file) {
      <gg-file-preview [attachment]="file" (closed)="current.set(null)" />
    }`,
})
export class AttachmentReferenceComponent {
  readonly attachmentId = input.required<string>();
  readonly current = signal<AssetView | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  private readonly api = inject(AssetsApi);
  private readonly auth = inject(AuthService);
  async open(): Promise<void> {
    const epoch = this.auth.sessionEpoch(),
      id = this.attachmentId();
    this.loading.set(true);
    this.error.set('');
    try {
      const file = await this.api.get(id);
      if (epoch === this.auth.sessionEpoch() && id === this.attachmentId()) this.current.set(file);
    } catch {
      this.error.set('Attachment unavailable.');
    } finally {
      this.loading.set(false);
    }
  }
}
