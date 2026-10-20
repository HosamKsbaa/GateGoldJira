import { inject, Injectable } from '@angular/core';
import { listBacklog, reorderBacklog } from '../../api/generated/sdk.gen';
import type { BacklogReorderFields } from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';
@Injectable({ providedIn: 'root' })
export class BacklogApi {
  private readonly auth = inject(AuthService);
  list(projectId: string, cursor?: string) {
    return readResult(
      listBacklog({
        client: this.auth.client,
        path: { projectId },
        query: { limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  reorder(issueId: string, body: BacklogReorderFields, reference: string) {
    return readResult(
      reorderBacklog({
        client: this.auth.client,
        path: { issueId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
}
