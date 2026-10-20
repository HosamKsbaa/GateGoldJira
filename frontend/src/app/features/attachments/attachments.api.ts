import { Injectable, inject } from '@angular/core';
import {
  getAttachment,
  detachAttachment,
  downloadAttachment,
  listAttachments,
  uploadAttachment,
} from '../../api/generated/sdk.gen';
import type { AttachmentUploadMetadata } from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';
import { attachmentBinaryResponse, attachmentUploadRequest } from './binary-contract';

@Injectable({ providedIn: 'root' })
export class AttachmentsApi {
  private readonly auth = inject(AuthService);

  get(attachmentId: string) {
    return readResult(getAttachment({ client: this.auth.client, path: { attachmentId } }));
  }
  list(issueId: string, cursor?: string) {
    return readResult(
      listAttachments({
        client: this.auth.client,
        path: { issueId },
        query: { limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }

  upload(issueId: string, metadata: AttachmentUploadMetadata, file: File, reference: string) {
    return readResult(
      uploadAttachment({
        client: this.auth.client,
        path: { issueId },
        body: { metadata, file },
        headers: { 'Idempotency-Key': reference },
        requestValidator: async value => {
          await attachmentUploadRequest.parseAsync(value);
        },
      }),
    );
  }

  content(attachmentId: string, signal?: AbortSignal) {
    return readResult(
      downloadAttachment({
        client: this.auth.client,
        path: { attachmentId },
        parseAs: 'blob',
        signal,
        responseValidator: async value => {
          await attachmentBinaryResponse.parseAsync(value);
        },
      }),
    );
  }

  detach(attachmentId: string, expectedIssueRevision: string, reference: string) {
    return readResult(
      detachAttachment({
        client: this.auth.client,
        path: { attachmentId },
        body: { expectedIssueRevision },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
}
