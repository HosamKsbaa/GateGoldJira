import { Injectable, effect, inject } from '@angular/core';
import type { ImportIssuesData } from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';

export interface ImportDraft {
  body: ImportIssuesData['body'];
  filename: string;
  locked: boolean;
  reference: string;
}
@Injectable({ providedIn: 'root' })
export class ImportDraftsService {
  readonly drafts = new Map<string, ImportDraft>();
  private readonly auth = inject(AuthService);
  constructor() {
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      const current = this.auth.sessionEpoch();
      if (current !== epoch) {
        epoch = current;
        this.drafts.clear();
      }
    });
  }
}
