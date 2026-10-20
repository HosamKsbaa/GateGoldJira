import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { isolatedProject, useModernIssues } from './support/project';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { zPageModernIssueSummary, zPageAutomationRuleView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires a disposable local company.');
test('native backlog creates planned work, keeps ordering and moves the selected issue onto its board', async ({
  page,
  request,
}) => {
  const projectId = await isolatedProject(request);
  await useModernIssues(projectId);
  await signIn(page, 'member', '/backlog/' + projectId, /^Backlog$/);
  await page.getByRole('button', { name: 'New issue', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
  await dialog.getByLabel('Issue title', { exact: true }).fill('خطة جديدة');
  await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
  const rows = page.getByRole('list', { name: 'Ranked backlog', exact: true });
  await expect(rows).toContainText('خطة جديدة');
  await expect(dialog).not.toBeVisible();
  const headers = { Authorization: 'Bearer ' + (await token('member')) };
  const searched = await request.post(apiOrigin + '/api/v2/issues/search', {
    headers,
    data: { filters: { projectIds: [projectId], query: 'خطة جديدة' } },
  });
  const issue = zPageModernIssueSummary.parse(await searched.json()).items[0];
  if (!issue) throw new Error('Missing planned issue.');
  expect(issue.backlog).toBe(true);
  await page.getByRole('button', { name: 'Move ' + issue.key + ' to board', exact: true }).click();
  await expect(rows).not.toContainText('خطة جديدة');
});

test('native automation editor saves a scoped stage identity without depending on legacy board JSON', async ({
  page,
  request,
}) => {
  const projectId = await isolatedProject(request);
  await useModernIssues(projectId);
  await signIn(page, 'owner', '/projects/' + projectId + '/automation', /^Automation$/);
  await page.getByRole('button', { name: 'Create assignment rule', exact: true }).click();
  await page.getByLabel('Rule name', { exact: true }).fill('مراجعة الفريق');
  const stage = page.getByRole('combobox', { name: 'When issue enters', exact: true });
  await expect(stage.locator('option')).not.toHaveCount(0);
  await stage.selectOption({ label: 'Review · Default workflow' });
  await page.getByRole('combobox', { name: 'Assign to', exact: true }).fill('مطور');
  await page.getByRole('option', { name: 'مطور تجريبي', exact: true }).getByRole('button').click();
  await page.getByRole('button', { name: 'Save assignment rule', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'مراجعة الفريق', exact: true })).toBeVisible();
  const response = await request.get(
    apiOrigin + '/api/v1/projects/' + projectId + '/automation-rules',
    { headers: { Authorization: 'Bearer ' + (await token('owner')) } },
  );
  const rule = zPageAutomationRuleView.parse(await response.json()).items[0];
  if (!rule) throw new Error('Missing saved stage rule.');
  expect(rule.stageId).toBeTruthy();
  expect(rule.stage).toBe('review');
});
