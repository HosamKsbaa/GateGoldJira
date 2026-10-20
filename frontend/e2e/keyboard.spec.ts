import { expect, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { signIn, localFixturesAvailable } from './support/session';

test.skip(!localFixturesAvailable, 'Requires the isolated local company fixture.');
async function noOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
for (const width of [768, 1440]) {
  test(`keyboard navigation, empty filters and inbox work at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1024 });
    await signIn(page, 'member');
    await page
      .getByRole('navigation', { name: 'Main navigation', exact: true })
      .getByRole('link', { name: 'Issues', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Issues', exact: true })).toBeVisible();
    await noOverflow(page);
    const search = page.getByLabel('Search by title or issue key', { exact: true });
    await search.focus();
    await page.keyboard.insertText('غير موجود ' + crypto.randomUUID());
    await expect(search).toBeFocused();
    await expect(page.getByText('No issues match these filters.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(search).toHaveValue('');
    await page.getByRole('link', { name: /^Inbox/ }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
    await noOverflow(page);
    await page.getByRole('checkbox', { name: 'Unread only', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('checkbox', { name: 'Unread only', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Apply inbox filter', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    await expect(page.getByRole('link', { name: /^Inbox/ })).toHaveCount(0);
  });
}
