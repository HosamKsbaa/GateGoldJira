import { Injectable, inject } from '@angular/core';
import { previewIssueImport, importIssues, exportIssues } from '../../api/generated/sdk.gen';
import type {
  PreviewIssueImportData,
  ImportIssuesData,
  IssueFilter,
} from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';

@Injectable({ providedIn: 'root' })
export class ImportExportApi {
  private readonly auth = inject(AuthService);
  preview(projectId: string, body: PreviewIssueImportData['body']) {
    return readResult(previewIssueImport({ client: this.auth.client, path: { projectId }, body }));
  }
  import(projectId: string, body: ImportIssuesData['body'], reference: string) {
    return readResult(
      importIssues({
        client: this.auth.client,
        path: { projectId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  export(
    projectId: string,
    filters: IssueFilter,
    cursor?: string,
    signal?: AbortSignal,
    limit = 100,
  ) {
    return readResult(
      exportIssues({
        client: this.auth.client,
        path: { projectId },
        body: { filters, page: { limit, ...(cursor ? { cursor } : {}) } },
        signal,
      }),
    );
  }
}
