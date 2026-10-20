import { Injectable, inject } from '@angular/core';
import {
  getBoardV2,
  listBoardCardsV2,
  saveBoardLayoutV2,
  createBoardV2,
  moveBoardCardV2,
  reorderBoardCardV2,
} from '../../api/generated/sdk.gen';
import type {
  IssueFilter,
  SaveLayoutFields,
  NativeMoveFields,
} from '../../api/generated/types.gen';
import { AuthService } from '../../core/auth/auth.service';
import { readResult } from '../../core/api/api-result';
@Injectable({ providedIn: 'root' })
export class ModernBoardsApi {
  private readonly auth = inject(AuthService);
  get(boardId: string, temporaryFilters: IssueFilter = {}, signal?: AbortSignal) {
    return readResult(
      getBoardV2({
        client: this.auth.client,
        path: { boardId },
        query: { temporaryFilters: JSON.stringify(temporaryFilters) },
        signal,
      }),
    );
  }
  cards(
    boardId: string,
    columnId: string,
    temporaryFilters: IssueFilter = {},
    cursor?: string,
    signal?: AbortSignal,
  ) {
    return readResult(
      listBoardCardsV2({
        client: this.auth.client,
        path: { boardId, columnId },
        body: { temporaryFilters, page: { limit: 25, ...(cursor ? { cursor } : {}) } },
        signal,
      }),
    );
  }
  save(boardId: string, body: SaveLayoutFields, reference: string) {
    return readResult(
      saveBoardLayoutV2({
        client: this.auth.client,
        path: { boardId },
        body,
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  create(projectId: string, name: string, savedFilters: IssueFilter, reference: string) {
    return readResult(
      createBoardV2({
        client: this.auth.client,
        path: { projectId },
        body: { name, savedFilters },
        headers: { 'Idempotency-Key': reference },
      }),
    );
  }
  move(boardId: string, body: NativeMoveFields, reference: string, reorder = false) {
    const options = {
      client: this.auth.client,
      path: { boardId },
      body,
      headers: { 'Idempotency-Key': reference },
    };
    return readResult(reorder ? reorderBoardCardV2(options) : moveBoardCardV2(options));
  }
}
