import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { zBoardView, zConfigurationView, zPageBoardSummary, zPageProjectView, zSavedIssueView, zSavedProjectView } from '../src/app/api/generated/zod.gen';
import { apiOrigin, token, localFixturesAvailable, signIn } from './support/session';

test.skip(!localFixturesAvailable, 'Requires the isolated company and local password accounts.');
const projectId = '20000000-0000-4000-8000-000000000001';

test('workspace navigation, global search and create dialog use real project context', async ({
  page,
}) => {
  await signIn(page, 'member', '/issues?projectId=' + projectId, /^Issues$/);
  await expect(
    page.getByRole('navigation', { name: 'Main navigation', exact: true }),
  ).toBeVisible();
  const search = page.getByRole('combobox', { name: 'Search all issues', exact: true });
  await search.fill('Build API');
  await search.press('Enter');
  await expect(page.getByLabel('Search by title or issue key', { exact: true })).toHaveValue(
    'Build API',
  );
  await expect(page.getByRole('link', { name: /DEMO-2 · Build API/ })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Project navigation', exact: true })
    .getByRole('link', { name: 'Board', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'All Issues', exact: true })).toBeVisible();
  await search.fill('Build API');
  await search.press('Enter');
  await expect(page.getByLabel('Search by title or issue key', { exact: true })).toHaveValue(
    'Build API',
  );
  await expect(page.getByRole('heading', { name: 'Results · 1', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Create issue', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Issue title', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Issues', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Create issue', exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('mobile navigation opens and closes while the page and board stay bounded', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'member');
  const toggle = page.getByRole('button', { name: 'Toggle navigation', exact: true });
  await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).toHaveCount(
    0,
  );
  await toggle.click();
  await expect(
    page.getByRole('dialog', { name: 'Workspace navigation', exact: true }),
  ).toBeVisible();
  await expect(page.locator('#main-content')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).toHaveCount(
    0,
  );
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page
    .getByRole('navigation', { name: 'Main navigation', exact: true })
    .getByRole('link', { name: 'Issues', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Issues', exact: true })).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await toggle.click();
  await page
    .getByRole('navigation', { name: 'Project navigation', exact: true })
    .getByRole('link', { name: 'Board', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'All Issues', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('region', { name: 'Done column', exact: true })).toBeVisible();
});

test('workspace, board and issue views remain usable across desktop, tablet and phone', async ({
  page,
  request,
}) => {
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  test.skip(!evidence, 'Requires the local evidence directory.');
  await mkdir(evidence!, { recursive: true });
  const authorization = { Authorization: 'Bearer ' + (await token('owner')) };
  // Recent projects uses the first four name-sorted entries of a bounded page.
  // Populate more than that page so this story cannot accidentally rely on Demo.
  for (let index = 0; index < 26; index++) {
    const padding = await request.post(apiOrigin + '/api/v1/projects', {
      headers: { ...authorization, 'Idempotency-Key': crypto.randomUUID() },
      data: { key: 'P' + crypto.randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase(), name: '000 Workspace padding ' + index + ' ' + crypto.randomUUID().slice(0, 8) },
    });
    expect(padding.status()).toBe(201); zSavedProjectView.parse(await padding.json());
  }
  const created = await request.post(apiOrigin + '/api/v1/projects', {
    headers: { ...authorization, 'Idempotency-Key': crypto.randomUUID() },
    data: { key: 'R' + crypto.randomUUID().replaceAll('-', '').slice(0, 7).toUpperCase(), name: '! Workspace responsive ' + crypto.randomUUID().slice(0, 8) },
  });
  expect(created.status()).toBe(201);
  const ownedProject = zSavedProjectView.parse(await created.json()).result;
  const configuration = await request.get(apiOrigin + '/api/v2/projects/' + ownedProject.id + '/configuration', { headers: authorization });
  expect(configuration.status()).toBe(200); expect(zConfigurationView.parse(await configuration.json()).mode).toBe('legacy');
  const boardPage = await request.get(apiOrigin + '/api/v1/projects/' + ownedProject.id + '/boards', { headers: authorization });
  expect(boardPage.status()).toBe(200);
  const ownedBoards = zPageBoardSummary.parse(await boardPage.json()).items;
  expect(ownedBoards).toHaveLength(1); const ownedBoard = ownedBoards[0]!;
  expect(ownedBoard.default).toBe(true); expect(ownedBoard.projectId).toBe(ownedProject.id);
  const createdIssue = await request.post(apiOrigin + '/api/v1/projects/' + ownedProject.id + '/issues', {
    headers: { ...authorization, 'Idempotency-Key': crypto.randomUUID() }, data: { title: 'Build API' },
  });
  expect(createdIssue.status()).toBe(201);
  const ownedIssue = zSavedIssueView.parse(await createdIssue.json()).result;
  const projects = await request.get(apiOrigin + '/api/v1/projects?limit=25&includeArchived=false', { headers: authorization });
  expect(projects.status()).toBe(200);
  const visibleProjects = zPageProjectView.parse(await projects.json());
  expect(visibleProjects.totalMatching).toBeGreaterThan(25); expect(visibleProjects.nextCursor).not.toBeNull();
  expect(visibleProjects.items.slice(0, 4).map(project => project.id)).toContain(ownedProject.id);
  expect(visibleProjects.items.map(project => project.id)).not.toContain(projectId);
  await page.setViewportSize({ width: 1440, height: 960 });
  await signIn(page, 'owner');
  await expect(page.locator('.workspace-project').first()).toBeVisible();
  await page.screenshot({ path: join(evidence!, 'jira-workspace-desktop.png') });
  await page
    .getByRole('navigation', { name: 'Recent projects', exact: true })
    .getByRole('link', { name: 'Open ' + ownedProject.name, exact: true })
    .click();
  await page
    .getByRole('navigation', { name: 'Project navigation', exact: true })
    .getByRole('link', { name: 'Board', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'All Issues', exact: true })).toBeVisible();
  const boardId = new URL(page.url()).pathname.split('/').at(-1);
  expect(boardId).toBe(ownedBoard.id);
  const currentBoard = zBoardView.parse(
    await (
      await request.get(apiOrigin + '/api/v1/boards/' + boardId, {
        headers: authorization,
      })
    ).json(),
  );
  await expect(page.locator('.kanban-column')).toHaveCount(currentBoard.columns.length);
  for (const viewport of [
    { width: 1440, height: 960, name: 'desktop' },
    { width: 768, height: 1024, name: 'tablet' },
    { width: 390, height: 844, name: 'phone' },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.locator('.workspace-sidebar')).toHaveCount(viewport.width <= 700 ? 0 : 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: join(evidence!, 'jira-board-' + viewport.name + '.png') });
  }
  await page.setViewportSize({ width: 1440, height: 960 });
  const card = page.locator('.kanban').getByRole('link', { name: 'Build API', exact: true });
  await card.click();
  await expect(
    page
      .getByRole('dialog', { name: 'Issue preview', exact: true })
      .getByRole('heading', { name: 'Build API', level: 1, exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: join(evidence!, 'jira-issue-preview-desktop.png') });
  await page.getByRole('link', { name: 'Open full issue', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/issues/' + ownedIssue.summary.id + '$'));
  await expect(
    page.getByRole('heading', { name: 'Build API', level: 1, exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: join(evidence!, 'jira-issue-desktop.png') });
});
