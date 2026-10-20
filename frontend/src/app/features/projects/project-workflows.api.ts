import { Injectable, inject } from '@angular/core';
import {
  listWorkflows,
  listWorkflowStages,
  listWorkflowTransitions,
  listTypeWorkflowBindings,
  saveWorkflow,
  saveWorkflowStage,
  saveWorkflowTransition,
  setTypeWorkflowBinding,
  migrateWorkflowIssues,
} from '../../api/generated/sdk.gen';
import type {
  SaveWorkflowFields,
  SaveStageFields,
  SaveTransitionFields,
  SetBindingFields,
  MigrationFields,
} from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';

@Injectable({ providedIn: 'root' })
export class ProjectWorkflowsApi {
  private readonly auth = inject(AuthService);
  workflows(projectId: string, cursor?: string) {
    return readResult(
      listWorkflows({
        client: this.auth.client,
        path: { projectId },
        query: { includeRetired: true, limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  stages(projectId: string, workflowId: string, cursor?: string) {
    return readResult(
      listWorkflowStages({
        client: this.auth.client,
        path: { projectId, workflowId },
        query: { includeRetired: true, limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  transitions(projectId: string, workflowId: string, cursor?: string) {
    return readResult(
      listWorkflowTransitions({
        client: this.auth.client,
        path: { projectId, workflowId },
        query: { includeRetired: true, limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  bindings(projectId: string, typeId: string, cursor?: string) {
    return readResult(
      listTypeWorkflowBindings({
        client: this.auth.client,
        path: { projectId, typeId },
        query: { limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  saveWorkflow(projectId: string, workflowId: string, body: SaveWorkflowFields, reference: string) {
    return readResult(
      saveWorkflow({
        client: this.auth.client,
        path: { projectId, workflowId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  saveStage(
    projectId: string,
    workflowId: string,
    stageId: string,
    body: SaveStageFields,
    reference: string,
  ) {
    return readResult(
      saveWorkflowStage({
        client: this.auth.client,
        path: { projectId, workflowId, stageId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  saveTransition(
    projectId: string,
    workflowId: string,
    transitionId: string,
    body: SaveTransitionFields,
    reference: string,
  ) {
    return readResult(
      saveWorkflowTransition({
        client: this.auth.client,
        path: { projectId, workflowId, transitionId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  saveBinding(
    projectId: string,
    typeId: string,
    workflowId: string,
    body: SetBindingFields,
    reference: string,
  ) {
    return readResult(
      setTypeWorkflowBinding({
        client: this.auth.client,
        path: { projectId, typeId, workflowId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  migrate(projectId: string, body: MigrationFields, reference: string) {
    return readResult(
      migrateWorkflowIssues({
        client: this.auth.client,
        path: { projectId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
}
