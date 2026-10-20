import { Injectable, inject } from '@angular/core';
import {
  getIssueFields,
  saveIssueFields,
  getIssueApprovals,
  voteIssueApproval,
  resubmitIssueApproval,
} from '../../api/generated/sdk.gen';
import type { ApprovalContextFields, SaveIssueFieldsRequest } from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';
@Injectable({ providedIn: 'root' })
export class IssueFieldsApi {
  private readonly auth = inject(AuthService);
  fields(issueId: string, cursor?: string) {
    return readResult(
      getIssueFields({
        client: this.auth.client,
        path: { issueId },
        query: { limit: 100, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  save(issueId: string, body: SaveIssueFieldsRequest, reference: string) {
    return readResult(
      saveIssueFields({
        client: this.auth.client,
        path: { issueId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  approvals(issueId: string, transitionId: string, cursor?: string) {
    return readResult(
      getIssueApprovals({
        client: this.auth.client,
        path: { issueId, transitionId },
        query: { limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  vote(
    issueId: string,
    transitionId: string,
    body: ApprovalContextFields,
    decision: 'approve' | 'reject',
    reference: string,
  ) {
    return readResult(
      voteIssueApproval({
        client: this.auth.client,
        path: { issueId, transitionId },
        body: { ...body, decision },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  resubmit(issueId: string, transitionId: string, body: ApprovalContextFields, reference: string) {
    return readResult(
      resubmitIssueApproval({
        client: this.auth.client,
        path: { issueId, transitionId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
}
