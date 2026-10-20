import { Injectable, inject } from '@angular/core';
import {
  getProjectConfiguration,
  listIssueTypes,
  listPriorities,
  saveIssueType,
  savePriority,
  setProjectDefaults,
  getProjectActivation,
  activateProjectCore,
} from '../../api/generated/sdk.gen';
import type {
  SaveTypeFields,
  SavePriorityFields,
  SetDefaultsFields,
  ActivateFields,
} from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';
@Injectable({ providedIn: 'root' })
export class ProjectConfigurationApi {
  private readonly auth = inject(AuthService);
  activation(projectId: string) {
    return readResult(getProjectActivation({ client: this.auth.client, path: { projectId } }));
  }
  activate(projectId: string, body: ActivateFields, reference: string) {
    return readResult(
      activateProjectCore({
        client: this.auth.client,
        path: { projectId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  get(projectId: string) {
    return readResult(getProjectConfiguration({ client: this.auth.client, path: { projectId } }));
  }
  types(projectId: string, cursor?: string) {
    return readResult(
      listIssueTypes({
        client: this.auth.client,
        path: { projectId },
        query: { includeRetired: true, limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  priorities(projectId: string, cursor?: string) {
    return readResult(
      listPriorities({
        client: this.auth.client,
        path: { projectId },
        query: { includeRetired: true, limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  saveType(projectId: string, typeId: string, body: SaveTypeFields, reference: string) {
    return readResult(
      saveIssueType({
        client: this.auth.client,
        path: { projectId, typeId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  savePriority(projectId: string, priorityId: string, body: SavePriorityFields, reference: string) {
    return readResult(
      savePriority({
        client: this.auth.client,
        path: { projectId, priorityId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  defaults(projectId: string, body: SetDefaultsFields, reference: string) {
    return readResult(
      setProjectDefaults({
        client: this.auth.client,
        path: { projectId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
}
