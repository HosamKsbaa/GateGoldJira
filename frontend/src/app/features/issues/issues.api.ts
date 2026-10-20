import { Injectable, inject } from '@angular/core';
import {
  organizeIssue,
  setIssueWatch,
  setIssueLink,
  listSavedSearches,
  saveIssueSearch,
  listActivity,
  listAssignees,
  listDependencies,
  addDependency,
  removeDependency,
  listLabels,
  createLabel,
} from '../../api/generated/sdk.gen';
import type {
  AddDependencyFields,
  RemoveDependencyFields,
  OrganizeFields,
  LinkFields,
  SaveIssueSearchRequest,
} from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';
@Injectable({ providedIn: 'root' })
export class IssuesApi {
  private readonly auth = inject(AuthService);
  organize(issueId: string, body: OrganizeFields, reference: string) {
    return readResult(
      organizeIssue({
        client: this.auth.client,
        path: { issueId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  watch(issueId: string, watching: boolean, reference: string) {
    return readResult(
      setIssueWatch({
        client: this.auth.client,
        path: { issueId },
        body: { watching },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  link(issueId: string, body: LinkFields, reference: string) {
    return readResult(
      setIssueLink({
        client: this.auth.client,
        path: { issueId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  savedSearches() {
    return readResult(listSavedSearches({ client: this.auth.client }));
  }
  saveSearch(searchId: string, body: SaveIssueSearchRequest, reference: string) {
    return readResult(
      saveIssueSearch({
        client: this.auth.client,
        path: { searchId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  history(issueId: string, cursor?: string) {
    return readResult(
      listActivity({
        client: this.auth.client,
        query: {
          resourceKind: 'issue',
          resourceId: issueId,
          limit: 25,
          ...(cursor ? { cursor } : {}),
        },
      }),
    );
  }
  labels(projectId: string, query: string, cursor?: string) {
    return readResult(
      listLabels({
        client: this.auth.client,
        path: { projectId },
        query: { query, limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  createLabel(projectId: string, name: string, reference: string) {
    return readResult(
      createLabel({
        client: this.auth.client,
        path: { projectId },
        body: { name },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  assignees(projectId: string, query: string, cursor?: string) {
    return readResult(
      listAssignees({
        client: this.auth.client,
        path: { projectId },
        query: { query, limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  dependencies(issueId: string, direction: 'blocked_by' | 'blocks', cursor?: string) {
    return readResult(
      listDependencies({
        client: this.auth.client,
        path: { issueId },
        query: { direction, limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  addDependency(issueId: string, body: AddDependencyFields, reference: string) {
    return readResult(
      addDependency({
        client: this.auth.client,
        path: { issueId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  removeDependency(
    issueId: string,
    blockerId: string,
    body: RemoveDependencyFields,
    reference: string,
  ) {
    return readResult(
      removeDependency({
        client: this.auth.client,
        path: { issueId, blockerId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
}
