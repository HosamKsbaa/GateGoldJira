import { Injectable, inject } from '@angular/core';
import {
  listPlanningItems,
  listPlanningIssues,
  createPlanningItem,
  updatePlanningItem,
  getIssuePlanning,
  setIssuePlanning,
  getKanbanReport,
} from '../../api/generated/sdk.gen';
import type {
  PlanningCreateFields,
  PlanningUpdateFields,
  IssuePlanningFields,
} from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';
@Injectable({ providedIn: 'root' })
export class PlanningApi {
  private readonly auth = inject(AuthService);
  list(projectId: string, kind?: 'epic' | 'release', cursor?: string) {
    return readResult(
      listPlanningItems({
        client: this.auth.client,
        path: { projectId },
        query: { limit: 25, ...(kind ? { kind } : {}), ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  issues(projectId: string, planningId: string, cursor?: string) {
    return readResult(
      listPlanningIssues({
        client: this.auth.client,
        path: { projectId, planningId },
        query: { limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  create(projectId: string, body: PlanningCreateFields, reference: string) {
    return readResult(
      createPlanningItem({
        client: this.auth.client,
        path: { projectId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  update(projectId: string, planningId: string, body: PlanningUpdateFields, reference: string) {
    return readResult(
      updatePlanningItem({
        client: this.auth.client,
        path: { projectId, planningId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  getIssue(issueId: string) {
    return readResult(getIssuePlanning({ client: this.auth.client, path: { issueId } }));
  }
  setIssue(issueId: string, body: IssuePlanningFields, reference: string) {
    return readResult(
      setIssuePlanning({
        client: this.auth.client,
        path: { issueId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  report(projectId: string, from: string, through: string, cursor?: string) {
    return readResult(
      getKanbanReport({
        client: this.auth.client,
        path: { projectId },
        query: { from, through, limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
}
