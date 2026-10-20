import { expect, type APIRequestContext } from '@playwright/test';
import { apiOrigin, token } from './session';
import {
  zModernIssueView,
  zPagePriorityView,
  zPageStageView,
} from '../../src/app/api/generated/zod.gen';
export async function readNativeIssue(request: APIRequestContext, id: string) {
  const response = await request.get(apiOrigin + '/api/v2/issues/' + id, {
    headers: { Authorization: 'Bearer ' + (await token('member')) },
  });
  expect(response.status()).toBe(200);
  return zModernIssueView.parse(await response.json());
}
export async function fixturePriority(request: APIRequestContext, projectId: string, key: string) {
  const response = await request.get(
    apiOrigin + '/api/v2/projects/' + projectId + '/priorities?limit=100',
    { headers: { Authorization: 'Bearer ' + (await token('member')) } },
  );
  expect(response.status()).toBe(200);
  const priority = zPagePriorityView
    .parse(await response.json())
    .items.find(item => item.key === key);
  if (!priority) throw new Error('Missing fixture priority ' + key);
  return priority.id;
}
export async function fixtureStage(request: APIRequestContext, issueId: string, category: string) {
  const issue = await readNativeIssue(request, issueId);
  const response = await request.get(
    apiOrigin +
      `/api/v2/projects/${issue.summary.projectId}/workflows/${issue.summary.workflow.id}/stages?limit=100`,
    { headers: { Authorization: 'Bearer ' + (await token('member')) } },
  );
  expect(response.status()).toBe(200);
  const stages = zPageStageView
    .parse(await response.json())
    .items.filter(item => item.category === category && !item.retired && item.acceptsEntries);
  if (stages.length !== 1 || !stages[0])
    throw new Error('Fixture requires an unambiguous stage for ' + category);
  return stages[0].id;
}
