import { Injectable, inject } from '@angular/core';
import {
  listFields,
  listFieldOptions,
  saveField,
  saveFieldOption,
  backfillFieldDefaults,
  getTransitionPolicy,
  saveTransitionPolicy,
} from '../../api/generated/sdk.gen';
import type {
  SaveFieldFields,
  SaveFieldOptionFields,
  TransitionPolicyFields,
} from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';
@Injectable({ providedIn: 'root' })
export class ProjectFieldsApi {
  private readonly auth = inject(AuthService);
  fields(projectId: string, cursor?: string) {
    return readResult(
      listFields({
        client: this.auth.client,
        path: { projectId },
        query: { includeRetired: true, limit: 100, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  options(projectId: string, fieldId: string, cursor?: string) {
    return readResult(
      listFieldOptions({
        client: this.auth.client,
        path: { projectId, fieldId },
        query: { includeRetired: true, limit: 100, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  save(projectId: string, fieldId: string, body: SaveFieldFields, reference: string) {
    return readResult(
      saveField({
        client: this.auth.client,
        path: { projectId, fieldId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  saveOption(
    projectId: string,
    fieldId: string,
    optionId: string,
    body: SaveFieldOptionFields,
    reference: string,
  ) {
    return readResult(
      saveFieldOption({
        client: this.auth.client,
        path: { projectId, fieldId, optionId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  backfill(projectId: string, fieldId: string, revision: string, reference: string) {
    return readResult(
      backfillFieldDefaults({
        client: this.auth.client,
        path: { projectId, fieldId },
        body: { expectedRevision: revision, limit: 100 },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  policy(projectId: string, workflowId: string, transitionId: string) {
    return readResult(
      getTransitionPolicy({
        client: this.auth.client,
        path: { projectId, workflowId, transitionId },
      }),
    );
  }
  savePolicy(
    projectId: string,
    workflowId: string,
    transitionId: string,
    body: TransitionPolicyFields,
    reference: string,
  ) {
    return readResult(
      saveTransitionPolicy({
        client: this.auth.client,
        path: { projectId, workflowId, transitionId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
}
