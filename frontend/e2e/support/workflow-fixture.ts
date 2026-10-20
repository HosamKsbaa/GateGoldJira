import { expect, type APIRequestContext } from '@playwright/test';
import { apiOrigin, token } from './session';
import { defaultWorkflow } from '../../src/app/features/boards/board-workflow';
import { zBoardView } from '../../src/app/api/generated/zod.gen';
import { readLayout } from './native-boards';

// Seed historic workflow shapes through the compatibility API, then exercise
// native columns and transitions with their real canonical IDs in the browser.
export async function addFixtureStages(
  request: APIRequestContext,
  boardId: string,
  names: string[],
) {
  const headers = {
    Authorization: 'Bearer ' + (await token('owner')),
    'Idempotency-Key': crypto.randomUUID(),
  };
  const response = await request.get(apiOrigin + '/api/v1/boards/' + boardId, { headers });
  expect(response.status()).toBe(200);
  const view = zBoardView.parse(await response.json());
  const workflow = defaultWorkflow();
  const extra = names.map(name => ({
    status: 'review:' + crypto.randomUUID(),
    name,
    allowedTargets: [] as string[],
  }));
  workflow.columns.push(...extra);
  for (const column of workflow.columns)
    column.allowedTargets = workflow.columns
      .filter(other => other.status !== column.status)
      .map(other => other.status);
  const saved = await request.put(apiOrigin + '/api/v1/boards/' + boardId, {
    headers,
    data: {
      expectedRevision: view.board.revision,
      name: view.board.name,
      savedFilters: view.board.savedFilters,
      wipLimits: view.board.wipLimits,
      workflow,
    },
  });
  expect(saved.status()).toBe(200);
  return readLayout(request, boardId);
}
