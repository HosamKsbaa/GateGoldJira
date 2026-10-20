import { Injectable, inject } from '@angular/core';
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  restoreProject,
  updateProject,
} from '../../api/generated/sdk.gen';
import type { CreateProjectData, UpdateProjectData } from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';

@Injectable({ providedIn: 'root' })
export class ProjectsApi {
  private readonly auth = inject(AuthService);
  list(includeArchived: boolean, cursor?: string) {
    return readResult(
      listProjects({
        client: this.auth.client,
        query: { limit: 25, includeArchived, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  get(projectId: string, signal?: AbortSignal) {
    return readResult(getProject({ client: this.auth.client, path: { projectId }, signal }));
  }
  create(body: CreateProjectData['body'], reference: string) {
    return readResult(
      createProject({ client: this.auth.client, body, headers: { 'Idempotency-Key': reference } }),
    );
  }
  update(projectId: string, body: UpdateProjectData['body'], reference: string) {
    return readResult(
      updateProject({
        client: this.auth.client,
        path: { projectId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  archive(projectId: string, expectedRevision: string, reference: string) {
    return readResult(
      archiveProject({
        client: this.auth.client,
        path: { projectId },
        body: { expectedRevision },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  restore(projectId: string, expectedRevision: string, reference: string) {
    return readResult(
      restoreProject({
        client: this.auth.client,
        path: { projectId },
        body: { expectedRevision },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
}
