import { readNativeIssue, fixtureStage } from './support/native-issues';
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import {
  zMe,
  zModernIssueView,
  zBoardView,
  zPageBoardSummary,
  zSavedMoveResult,
  zSavedIssueView,
  zSavedProjectView,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated local company.');

async function projectStage(
  request: APIRequestContext,
  authorization: string,
  projectId: string,
  category: 'todo' | 'in_progress' | 'review' | 'done',
): Promise<string> {
  const listResponse = await request.get(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
    headers: { Authorization: authorization },
  });
  expect(listResponse.status()).toBe(200);
  const defaultBoard = zPageBoardSummary
    .parse(await listResponse.json())
    .items.find(board => board.default);
  if (!defaultBoard) throw new Error('Project fixture has no default board.');
  const response = await request.get(apiOrigin + '/api/v1/boards/' + defaultBoard.id, {
    headers: { Authorization: authorization },
  });
  expect(response.status()).toBe(200);
  const view = zBoardView.parse(await response.json());
  const stage = view.columns.find(column => column.status.split(':')[0] === category);
  if (!stage) throw new Error('Project fixture is missing its ' + category + ' stage.');
  return stage.status;
}

test('epics and releases group issue work and the project report follows completion', async ({
  page,
  request,
}) => {
  const authorization = 'Bearer ' + (await token('owner'));
  const response = await request.post(apiOrigin + '/api/v1/projects', {
    headers: { Authorization: authorization, 'Idempotency-Key': crypto.randomUUID() },
    data: {
      key: 'P' + crypto.randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase(),
      name: 'Planning browser project',
    },
  });
  expect(response.status()).toBe(201);
  const project = zSavedProjectView.parse(await response.json()).result;
  await signIn(page, 'owner', '/projects/' + project.id + '/planning', /^Planning$/);
  await page.getByRole('button', { name: 'Create epic or release', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('بوابة إطلاق');
  await page
    .getByLabel('Description', { exact: true })
    .fill('Coordinate the next useful delivery.');
  await page.getByLabel('Target date', { exact: true }).fill('2026-10-31');
  await page.getByRole('button', { name: 'Save planning item', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'بوابة إطلاق', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Create epic or release', exact: true }).click();
  await page.getByRole('combobox', { name: 'Kind', exact: true }).selectOption('release');
  await page.getByLabel('Name', { exact: true }).fill('October release');
  await page.getByRole('button', { name: 'Save planning item', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'October release', exact: true })).toBeVisible();
  const activeStage = await projectStage(request, authorization, project.id, 'in_progress');
  const issueResponse = await request.post(
    apiOrigin + '/api/v1/projects/' + project.id + '/issues',
    {
      headers: { Authorization: authorization, 'Idempotency-Key': crypto.randomUUID() },
      data: { title: 'Deliver planning browser flow', initialStatus: activeStage },
    },
  );
  expect(issueResponse.status()).toBe(201);
  const issue = zSavedIssueView.parse(await issueResponse.json()).result;
  await signIn(page, 'owner', '/issues/' + issue.summary.id, /^Deliver planning browser flow$/);
  await page
    .getByRole('combobox', { name: 'Issue epic', exact: true })
    .selectOption({ label: 'بوابة إطلاق' });
  await expect(page.getByRole('combobox', { name: 'Issue release', exact: true })).toBeEnabled();
  await page
    .getByRole('combobox', { name: 'Issue release', exact: true })
    .selectOption({ label: 'October release' });
  await expect(page.getByRole('combobox', { name: 'Issue release', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Save planning', exact: true })).toHaveCount(0);
  await expect(page.getByText('Planning updated.', { exact: true })).toBeVisible();
  const doneStage = await projectStage(request, authorization, project.id, 'done');
  const doneOrder = issue.orderRevisions.find(order => order.status === doneStage);
  if (!doneOrder) throw new Error('Issue fixture is missing its Done order.');
  const doneResponse = await request.post(
    apiOrigin + '/api/v1/issues/' + issue.summary.id + '/move',
    {
      headers: { Authorization: authorization, 'Idempotency-Key': crypto.randomUUID() },
      data: {
        expectedRevision: issue.summary.revision,
        targetStatus: doneOrder.status,
        expectedSourceOrderRevision: issue.sourceOrderRevision,
        expectedTargetOrderRevision: doneOrder.revision,
      },
    },
  );
  expect(doneResponse.status()).toBe(200);
  await signIn(page, 'owner', '/projects/' + project.id + '/planning', /^Planning$/);
  const epicCard = page
    .locator('.planning-card')
    .filter({ has: page.getByRole('heading', { name: 'بوابة إطلاق', exact: true }) });
  await expect(epicCard.getByText('1 / 1 issues done', { exact: true })).toBeVisible();
  await epicCard.getByRole('button', { name: 'View issues', exact: true }).click();
  await expect(
    page
      .locator('.linked-work')
      .getByRole('link')
      .filter({ hasText: 'Deliver planning browser flow' }),
  ).toBeVisible();
  if (process.env['GATEGOLD_E2E_EVIDENCE']) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/planning-epics-releases.png',
      fullPage: true,
    });
  }
  await page.locator('.planning-tabs').getByRole('link', { name: 'Reports', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Kanban reports', exact: true })).toBeVisible();
  await expect(
    page
      .locator('.metric-grid article')
      .filter({ hasText: 'Completed cycles' })
      .getByText('1', { exact: true }),
  ).toBeVisible();
  await page.getByText('How these numbers are calculated', { exact: true }).click();
  await expect(page.getByText(/No last-updated timestamp is used/)).toBeVisible();
  if (process.env['GATEGOLD_E2E_EVIDENCE']) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/kanban-reports.png',
      fullPage: true,
    });
  }
});

test('manual development links edit and remove while a stage-entry rule assigns a reviewer', async ({
  page,
  request,
}) => {
  const authorization = 'Bearer ' + (await token('owner'));
  const memberAuthorization = 'Bearer ' + (await token('member'));
  const meResponse = await request.get(apiOrigin + '/api/v1/me', {
    headers: { Authorization: memberAuthorization },
  });
  const member = zMe.parse(await meResponse.json());
  const projectResponse = await request.post(apiOrigin + '/api/v1/projects', {
    headers: { Authorization: authorization, 'Idempotency-Key': crypto.randomUUID() },
    data: {
      key: 'I' + crypto.randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase(),
      name: 'Integration browser project',
    },
  });
  expect(projectResponse.status()).toBe(201);
  const projectId = zSavedProjectView.parse(await projectResponse.json()).result.id;
  const membershipResponse = await request.put(
    apiOrigin + '/api/v1/projects/' + projectId + '/memberships/' + member.userId,
    {
      headers: { Authorization: authorization, 'Idempotency-Key': crypto.randomUUID() },
      data: { expectedRevision: '0', role: 'member' },
    },
  );
  expect(membershipResponse.status()).toBe(200);
  await signIn(page, 'owner', '/projects/' + projectId + '/automation', /^Automation$/);
  await page.getByRole('button', { name: 'Create assignment rule', exact: true }).click();
  await page.getByLabel('Rule name', { exact: true }).fill('Browser review assignment');
  await page
    .getByRole('combobox', { name: 'When issue enters', exact: true })
    .selectOption({ label: 'Review · Default workflow' });
  await page.getByRole('combobox', { name: 'Assign to', exact: true }).fill(member.displayName);
  await page
    .getByRole('option', { name: member.displayName, exact: true })
    .getByRole('button')
    .click();
  await page.getByRole('button', { name: 'Save assignment rule', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Browser review assignment', exact: true }),
  ).toBeVisible();
  if (process.env['GATEGOLD_E2E_EVIDENCE']) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/stage-assignment-automation.png',
      fullPage: true,
    });
  }
  const issueResponse = await request.post(
    apiOrigin + '/api/v1/projects/' + projectId + '/issues',
    {
      headers: { Authorization: authorization, 'Idempotency-Key': crypto.randomUUID() },
      data: { title: 'Development browser flow' },
    },
  );
  expect(issueResponse.status()).toBe(201);
  const issue = zSavedIssueView.parse(await issueResponse.json()).result;
  await signIn(page, 'owner', '/issues/' + issue.summary.id, /^Development browser flow$/);
  await page.getByRole('button', { name: 'Add link', exact: true }).click();
  await page.getByRole('combobox', { name: 'Link type', exact: true }).selectOption('pull_request');
  await page.locator('.development').getByLabel('Title', { exact: true }).fill('PR review');
  await page.getByLabel('URL', { exact: true }).fill('https://github.com/company/project/pull/123');
  await page.getByRole('button', { name: 'Save development link', exact: true }).click();
  await expect(page.getByRole('link', { name: 'PR review ↗', exact: true })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
  await page.locator('.development').getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .locator('.development')
    .getByLabel('Title', { exact: true })
    .fill('PR ready for review');
  await page.getByRole('button', { name: 'Save development link', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'PR ready for review ↗', exact: true }),
  ).toBeVisible();
  if (process.env['GATEGOLD_E2E_EVIDENCE'])
    await page
      .locator('.development')
      .screenshot({ path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/development-links.png' });
  const currentIssue = await readNativeIssue(request, issue.summary.id);
  const moveResponse = await request.post(
    apiOrigin + '/api/v2/issues/' + issue.summary.id + '/move',
    {
      headers: { Authorization: authorization, 'Idempotency-Key': crypto.randomUUID() },
      data: {
        expectedRevision: currentIssue.summary.revision,
        targetStageId: await fixtureStage(request, issue.summary.id, 'review'),
      },
    },
  );
  expect(moveResponse.status()).toBe(200);
  const { zSavedModernIssueView } = await import('../src/app/api/generated/zod.gen');
  const moved = zSavedModernIssueView.parse(await moveResponse.json()).result;
  expect(moved.summary.assignee?.id).toBe(member.userId);
  await page.locator('.development').getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('link', { name: 'PR ready for review ↗', exact: true })).toHaveCount(
    0,
  );
  const ruleResponse = await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
    headers: { Authorization: authorization },
  });
  const current = zModernIssueView.parse(await ruleResponse.json());
  expect(current.summary.assignee?.id).toBe(member.userId);
});
