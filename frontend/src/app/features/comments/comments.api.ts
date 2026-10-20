import { Injectable, inject } from '@angular/core';
import {
  listComments,
  listCommentVersions,
  createComment,
  updateComment,
  listMentionCandidates,
} from '../../api/generated/sdk.gen';
import type { CommentBody } from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';
@Injectable({ providedIn: 'root' })
export class CommentsApi {
  private readonly auth = inject(AuthService);
  mentionCandidates(projectId: string, query: string, cursor?: string, signal?: AbortSignal) {
    return readResult(
      listMentionCandidates({
        client: this.auth.client,
        path: { projectId },
        query: { query, limit: 25, ...(cursor ? { cursor } : {}) },
        signal,
      }),
    );
  }
  list(issueId: string, cursor?: string) {
    return readResult(
      listComments({
        client: this.auth.client,
        path: { issueId },
        query: { limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  versions(commentId: string, cursor?: string) {
    return readResult(
      listCommentVersions({
        client: this.auth.client,
        path: { commentId },
        query: { limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  create(issueId: string, body: CommentBody, reference: string) {
    return readResult(
      createComment({
        client: this.auth.client,
        path: { issueId },
        body: { body },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  update(commentId: string, expectedRevision: string, body: CommentBody, reference: string) {
    return readResult(
      updateComment({
        client: this.auth.client,
        path: { commentId },
        body: { expectedRevision, body },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
}
