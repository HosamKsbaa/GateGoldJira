import { Injectable, inject } from '@angular/core';
import {
  listBoards,
  archiveBoard,
  restoreBoard,
  getProject,
} from '../../api/generated/sdk.gen';
import type { ColumnSummary } from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';
export type Status = ColumnSummary['status'];
@Injectable({ providedIn: 'root' })
export class BoardsApi {
  private readonly auth = inject(AuthService);
  list(projectId: string, includeArchived: boolean, cursor?: string) {
    return readResult(
      listBoards({
        client: this.auth.client,
        path: { projectId },
        query: { limit: 25, includeArchived, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  project(projectId: string) {
    return readResult(getProject({ client: this.auth.client, path: { projectId } }));
  }
  archive(boardId: string, expectedRevision: string, reference: string) {
    return readResult(
      archiveBoard({
        client: this.auth.client,
        path: { boardId },
        body: { expectedRevision },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  restore(boardId: string, expectedRevision: string, reference: string) {
    return readResult(
      restoreBoard({
        client: this.auth.client,
        path: { boardId },
        body: { expectedRevision },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
}
