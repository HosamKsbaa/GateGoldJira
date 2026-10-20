import { Injectable, inject } from '@angular/core';
import {
  getIssueV2,
  searchIssuesV2,
  createIssueV2,
  updateIssueV2,
  patchIssueFieldV2,
  moveIssueV2,
  listIssueTransitionsV2,
} from '../../api/generated/sdk.gen';
import type {
  ModernCreateFields,
  ModernEditable,
  ModernPatchFields,
  ModernMoveFields,
  IssueFilter,
  ModernSearchInput,
} from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';

@Injectable({ providedIn: 'root' })
export class ModernIssuesApi {
  private readonly auth = inject(AuthService);
  get(issueId: string, signal?: AbortSignal) {
    return readResult(getIssueV2({ client: this.auth.client, path: { issueId }, signal }));
  }
  search(filters: IssueFilter, cursor?: string, signal?: AbortSignal, typeBehavior?: ModernSearchInput['typeBehavior']) {
    return readResult(
      searchIssuesV2({
        client: this.auth.client,
        signal,
        body: { filters, page: { limit: 25, ...(cursor ? { cursor } : {}) }, ...(typeBehavior ? { typeBehavior } : {}) },
      }),
    );
  }
  create(projectId: string, body: ModernCreateFields, reference: string) {
    return readResult(
      createIssueV2({
        client: this.auth.client,
        path: { projectId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  update(issueId: string, expectedRevision: string, editable: ModernEditable, reference: string) {
    return readResult(
      updateIssueV2({
        client: this.auth.client,
        path: { issueId },
        body: { expectedRevision, editable },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  patch(issueId: string, body: ModernPatchFields, reference: string) {
    return readResult(
      patchIssueFieldV2({
        client: this.auth.client,
        path: { issueId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  move(issueId: string, body: ModernMoveFields, reference: string) {
    return readResult(
      moveIssueV2({
        client: this.auth.client,
        path: { issueId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  transitions(issueId: string, cursor?: string) {
    return readResult(
      listIssueTransitionsV2({
        client: this.auth.client,
        path: { issueId },
        query: { limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
}
