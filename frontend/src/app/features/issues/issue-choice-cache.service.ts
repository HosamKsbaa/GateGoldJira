import { Injectable, effect, inject } from '@angular/core';
import type { LabelView, UserSummary } from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';

/** Retains display names for IDs in in-memory drafts, including choices beyond page one. */
@Injectable({ providedIn: 'root' })
export class IssueChoiceCache {
  readonly users = new Map<string, UserSummary>();
  readonly labels = new Map<string, LabelView>();
  private readonly auth = inject(AuthService);
  constructor() {
    let epoch = this.auth.sessionEpoch();
    effect(() => {
      const current = this.auth.sessionEpoch();
      if (current !== epoch) {
        epoch = current;
        this.users.clear();
        this.labels.clear();
      }
    });
  }
}
