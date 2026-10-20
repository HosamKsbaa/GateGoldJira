import { Injectable, inject } from '@angular/core';
import {
  listPictures,
  uploadPicture,
  downloadPicture,
  detachGalleryPicture,
} from '../../api/generated/sdk.gen';
import type { UploadMetadata } from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';
import { pictureUploadRequest, pictureBinaryResponse } from './binary-contract';
@Injectable({ providedIn: 'root' })
export class PicturesApi {
  private readonly auth = inject(AuthService);
  list(issueId: string, cursor?: string, includeOwnDrafts = false) {
    return readResult(
      listPictures({
        client: this.auth.client,
        path: { issueId },
        query: { limit: 25, includeOwnDrafts, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  upload(issueId: string, metadata: UploadMetadata, file: File, reference: string) {
    return readResult(
      uploadPicture({
        client: this.auth.client,
        path: { issueId },
        body: { metadata, file },
        headers: { 'Idempotency-Key': reference },
        requestValidator: async value => {
          await pictureUploadRequest.parseAsync(value);
        },
      }),
    );
  }
  content(pictureId: string, signal?: AbortSignal) {
    return readResult(
      downloadPicture({
        client: this.auth.client,
        path: { pictureId },
        parseAs: 'blob',
        signal,
        responseValidator: async value => {
          await pictureBinaryResponse.parseAsync(value);
        },
      }),
    );
  }
  detach(pictureId: string, expectedIssueRevision: string, reference: string) {
    return readResult(
      detachGalleryPicture({
        client: this.auth.client,
        path: { pictureId },
        body: { expectedIssueRevision },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
}
