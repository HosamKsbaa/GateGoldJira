import { expect, type APIRequestContext } from '@playwright/test';
import { apiOrigin, token } from './session';
import { zLayoutView } from '../../src/app/api/generated/zod.gen';
import type { LayoutView, SaveLayoutFields } from '../../src/app/api/generated/types.gen';
export async function readLayout(request: APIRequestContext, boardId: string) {
  const response = await request.get(apiOrigin + '/api/v2/boards/' + boardId, {
    headers: { Authorization: 'Bearer ' + (await token('member')) },
  });
  expect(response.status()).toBe(200);
  return zLayoutView.parse(await response.json());
}
export function layoutFields(view: LayoutView): SaveLayoutFields {
  return {
    expectedRevision: view.board.revision,
    name: view.board.name,
    savedFilters: view.board.savedFilters,
    columns: view.columns.map(column => ({
      id: column.id,
      name: column.name,
      stageIds: column.stages.map(mapping => mapping.stage.id),
      wipLimit: column.wipLimit,
      wipMode: column.wipMode,
    })),
  };
}
