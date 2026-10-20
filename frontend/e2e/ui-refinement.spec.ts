import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { localFixturesAvailable, signIn } from './support/session';

test.skip(!localFixturesAvailable, 'Requires the isolated local workspace.');
const board = '/boards/30000000-0000-4000-8000-000000000001';

test('board focus mode and filter popover keep the workspace accessible', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await signIn(page, 'member', board, /^All Issues$/);
  await expect(
    page.getByRole('searchbox', { name: 'Search this board', exact: true }),
  ).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
  const columns = page.locator('.kanban');
  const before = await columns.boundingBox();
  expect(before).not.toBeNull();
  expect(before!.y).toBeLessThan(310);
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main navigation', exact: true })).toHaveCount(
    0,
  );
  const expanded = await columns.boundingBox();
  expect(expanded!.width).toBeGreaterThan(before!.width + 150);
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await expect(
    page.getByRole('navigation', { name: 'Main navigation', exact: true }),
  ).toBeVisible();
  await page.locator('.board-filters summary').click();
  await expect(page.getByRole('button', { name: 'Close filters', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close filters', exact: true }).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.board-filters summary')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Close filters', exact: true })).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('Jump to column', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const jump = page.getByRole('combobox', { name: 'Jump to column', exact: true });
  const todo = await jump.locator('option').nth(0).getAttribute('value');
  const done = await jump.locator('option').nth(3).getAttribute('value');
  if (!todo || !done) throw new Error('Missing canonical column choices');
  await jump.selectOption(done);
  await expect
    .poll(() => page.locator('.kanban-scroll').evaluate(element => element.scrollLeft))
    .toBeGreaterThan(500);
  await expect(page.getByLabel('Jump to column', { exact: true })).toHaveValue(done);
  await page.locator('.kanban-scroll').evaluate(element => {
    element.scrollLeft = 0;
  });
  await expect(page.getByLabel('Jump to column', { exact: true })).toHaveValue(todo);
});

test('issue activity tabs work with the keyboard and retain rich comment drafts', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await signIn(page, 'member', board, /^All Issues$/);
  await page.locator('.kanban').getByRole('link', { name: 'Build API', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Issue preview', exact: true });
  await expect(drawer).toBeVisible();
  const editor = drawer.getByRole('textbox', { name: 'Comment text', exact: true });
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await editor.fill('مسودة تعليق — keep while reviewing history');
  const comments = drawer.getByRole('tab', { name: 'Comments', exact: true });
  const history = drawer.getByRole('tab', { name: 'History', exact: true });
  await comments.focus();
  await comments.press('ArrowRight');
  await expect(history).toBeFocused();
  await expect(history).toHaveAttribute('aria-selected', 'true');
  await expect(editor).toBeHidden();
  await history.press('Home');
  await expect(comments).toBeFocused();
  await expect(editor).toContainText('مسودة تعليق');
  await history.click();
  await drawer.getByRole('button', { name: 'Add comment', exact: true }).click();
  await expect(editor).toBeFocused();
  await expect(editor).toContainText('keep while reviewing history');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('capture issue list and drawer at desktop and mobile sizes', async ({ page }) => {
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  test.skip(!evidence, 'Requires the screenshot output directory.');
  const directory = join(evidence!, 'ui-refinement', 'after');
  await mkdir(directory, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 960 });
  await signIn(page, 'owner', board, /^All Issues$/);
  await expect(
    page.locator('.kanban').getByRole('link', { name: 'Build API', exact: true }),
  ).toBeVisible();
  await writeFile(
    join(directory, 'layout.json'),
    JSON.stringify(
      { viewport: page.viewportSize(), board: await page.locator('.kanban').boundingBox() },
      null,
      2,
    ),
  );
  await page.mouse.move(0, 0);
  await page.screenshot({ path: join(directory, 'board-desktop.png') });
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click();
  await page.screenshot({ path: join(directory, 'board-focus.png') });
  await page.getByRole('button', { name: 'Expand sidebar', exact: true }).click();
  await page.locator('.kanban').getByRole('link', { name: 'Build API', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Comment text', exact: true })).toBeVisible();
  await page.screenshot({ path: join(directory, 'issue-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  const drawer = page.getByRole('dialog', { name: 'Issue preview', exact: true });
  await drawer.evaluate(element => {
    element.scrollTop = 0;
  });
  await page.screenshot({ path: join(directory, 'issue-phone.png') });
  await page.getByRole('button', { name: 'Close issue', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Jump to column', exact: true })
    .selectOption({ index: 0 });
  await expect
    .poll(async () => page.locator('.kanban-scroll').evaluate(element => element.scrollLeft))
    .toBeLessThan(3);
  await page.screenshot({ path: join(directory, 'board-phone.png') });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page
    .getByRole('navigation', { name: 'Project views', exact: true })
    .getByRole('link', { name: 'Issues', exact: true })
    .click();
  await expect(page.getByLabel('Search by title or issue key', { exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Search issues', exact: true })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Issue results list', exact: true })).toBeVisible();
  await page.mouse.move(0, 0);
  await page.screenshot({ path: join(directory, 'issues-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: join(directory, 'issues-phone.png') });
});
