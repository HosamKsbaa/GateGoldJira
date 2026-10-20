import { dragBoardCard } from './support/board-drag';
import { addFixtureStages } from './support/workflow-fixture';
import { readLayout } from './support/native-boards';
import { isolatedProject } from './support/project';
import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import {
  zSavedBoardSummary,
  zSavedIssueView,
  zBoardView,
  zModernIssueView,
} from '../src/app/api/generated/zod.gen';
const projectId = '20000000-0000-4000-8000-000000000001';
test.skip(!localFixturesAvailable, 'Requires isolated PostgreSQL and approved accounts.');
test('custom stages persist, receive dragged cards, retain shared visibility and keyboard moves', async ({
  page,
  request,
}) => {
  const projectId = await isolatedProject(request);
  const headers = {
    Authorization: 'Bearer ' + (await token('member')),
    'Idempotency-Key': crypto.randomUUID(),
  };
  const title = 'Custom stages ' + crypto.randomUUID().slice(0, 8);
  const created = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers,
    data: { title },
  });
  expect(created.status()).toBe(201);
  const issue = zSavedIssueView.parse(await created.json()).result;
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: { name: title, savedFilters: { query: title } },
  });
  expect(response.status()).toBe(201);
  const board = zSavedBoardSummary.parse(await response.json()).result;
  const view = await addFixtureStages(request, board.id, ['QA عربي', 'Ready to deploy']);
  const qa = view.columns.find(column => column.name === 'QA عربي')!;
  const deploy = view.columns.find(column => column.name === 'Ready to deploy')!;
  await page.setViewportSize({ width: 1440, height: 1100 });
  await signIn(page, 'member', '/boards/' + board.id + '/settings', /^Board settings$/);
  await expect(page.locator('.native-column')).toHaveCount(6);
  await page.getByRole('button', { name: 'Save board settings', exact: true }).click();
  await expect(page.getByText('Board settings saved.', { exact: true })).toBeVisible();
  expect((await readLayout(request, board.id)).columns.map(column => column.name)).toEqual(
    view.columns.map(column => column.name),
  );
  await page.getByRole('link', { name: 'Open Kanban board', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const target = page.getByRole('region', { name: 'QA عربي column', exact: true });
  const card = page
    .locator('gg-native-issue-card')
    .filter({ has: page.getByRole('link', { name: title, exact: true }) });
  await card.locator('summary').click();
  await card.getByLabel('Destination column').selectOption(qa.id);
  await card.getByRole('button', { name: 'Choose destination', exact: true }).click();
  await expect(target.getByRole('link', { name: title, exact: true })).toBeVisible();
  const qaCard = target.locator('gg-native-issue-card');
  const destination = page.getByRole('region', { name: 'Ready to deploy column', exact: true });
  await dragBoardCard(page, qaCard.locator('.issue-card'), destination.locator('.card-list'));
  await expect(destination.getByRole('link', { name: title, exact: true })).toBeVisible();
  const saved = zModernIssueView.parse(
    await (await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, { headers })).json(),
  );
  expect(saved.summary.stage.id).toBe(deploy.stages[0]!.stage.id);
  expect(saved.summary.stage.name).toBe('Ready to deploy');
  await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + title + '$'));
  // Later columns load when scrolled into view, keeping first paint bounded.
  await destination.scrollIntoViewIfNeeded();
  await expect(destination.getByRole('link', { name: title, exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (process.env['GATEGOLD_E2E_EVIDENCE']) {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.screenshot({
      path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/custom-stages-board.png',
      fullPage: true,
    });
  }
});
