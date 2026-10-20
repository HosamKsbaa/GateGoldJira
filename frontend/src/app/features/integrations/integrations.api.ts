import { Injectable, inject } from '@angular/core';
import {
  listDevelopmentLinks,
  saveDevelopmentLink,
  listAutomationRules,
  saveAutomationRule,
} from '../../api/generated/sdk.gen';
import type { DevelopmentLinkFields, AutomationRuleFields } from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';
@Injectable({ providedIn: 'root' })
export class IntegrationsApi {
  private readonly auth = inject(AuthService);
  links(issueId: string, cursor?: string) {
    return readResult(
      listDevelopmentLinks({
        client: this.auth.client,
        path: { issueId },
        query: { limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  saveLink(issueId: string, linkId: string, body: DevelopmentLinkFields, reference: string) {
    return readResult(
      saveDevelopmentLink({
        client: this.auth.client,
        path: { issueId, linkId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  rules(projectId: string, cursor?: string) {
    return readResult(
      listAutomationRules({
        client: this.auth.client,
        path: { projectId },
        query: { limit: 25, ...(cursor ? { cursor } : {}) },
      }),
    );
  }
  saveRule(projectId: string, ruleId: string, body: AutomationRuleFields, reference: string) {
    return readResult(
      saveAutomationRule({
        client: this.auth.client,
        path: { projectId, ruleId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
}
