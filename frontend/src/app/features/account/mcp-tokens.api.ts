import { Injectable, inject } from '@angular/core';
import { createPersonalMcpToken, listPersonalMcpTokenActivity, listPersonalMcpTokens, revokePersonalMcpToken } from '../../api/generated/sdk.gen';
import type { CreatePersonalMcpTokenData } from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';

@Injectable({ providedIn: 'root' })
export class McpTokensApi {
  private readonly auth = inject(AuthService);
  list() {
    return readResult(listPersonalMcpTokens({ client: this.auth.client }));
  }
  create(body: CreatePersonalMcpTokenData['body']) {
    return readResult(createPersonalMcpToken({ client: this.auth.client, body }));
  }
  activity(tokenId: string, before?: string) {
    return readResult(listPersonalMcpTokenActivity({ client: this.auth.client, path: { tokenId }, query: { before } }));
  }
  revoke(tokenId: string) {
    return readResult(revokePersonalMcpToken({ client: this.auth.client, path: { tokenId } }));
  }
}
