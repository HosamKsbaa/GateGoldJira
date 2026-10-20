import { Injectable, inject } from '@angular/core';
import {
  approveUser,
  listMembershipCandidates,
  listActivity,
  listMemberships,
  listUsers,
  removeMembership,
  setMembership,
  updateUser,
} from '../../api/generated/sdk.gen';
import type {
  ApproveFields,
  ListActivityData,
  UpdateUserFields,
  MembershipView,
} from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';

@Injectable({ providedIn: 'root' })
export class AdministrationApi {
  private readonly auth = inject(AuthService);
  activity(filters: NonNullable<ListActivityData['query']>, cursor?: string) {
    return readResult(
      listActivity({
        client: this.auth.client,
        query: { ...filters, limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  membershipCandidates(projectId: string, query = '', cursor?: string, signal?: AbortSignal) {
    return readResult(
      listMembershipCandidates({
        client: this.auth.client,
        path: { projectId },
        signal,
        query: { query, limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  users(cursor?: string) {
    return readResult(
      listUsers({ client: this.auth.client, query: { limit: 25, ...(cursor ? { cursor } : {}) } }),
    );
  }
  approve(body: ApproveFields, reference: string) {
    return readResult(
      approveUser({ client: this.auth.client, body, headers: { 'Idempotency-Key': reference } }),
    );
  }
  update(userId: string, body: UpdateUserFields, reference: string) {
    return readResult(
      updateUser({
        client: this.auth.client,
        path: { userId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  memberships(projectId: string, cursor?: string) {
    return readResult(
      listMemberships({
        client: this.auth.client,
        path: { projectId },
        query: { limit: 25, includeRemoved: true, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  set(
    projectId: string,
    userId: string,
    role: MembershipView['role'],
    expectedRevision: string,
    reference: string,
  ) {
    return readResult(
      setMembership({
        client: this.auth.client,
        path: { projectId, userId },
        body: { role, expectedRevision },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  remove(projectId: string, userId: string, expectedRevision: string, reference: string) {
    return readResult(
      removeMembership({
        client: this.auth.client,
        path: { projectId, userId },
        body: { expectedRevision },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
}
