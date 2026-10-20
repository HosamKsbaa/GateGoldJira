import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { zSavedIssueView, zSavedLabelView } from '../src/app/api/generated/zod.gen';
const projectId = '20000000-0000-4000-8000-000000000001';
test.skip(
  !localFixturesAvailable,
  'Requires isolated local PostgreSQL and development identities.',
);
test('Arabic reusable labels and calendar dates can be selected, cleared and filtered with the keyboard', async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8),
    title = 'Dates labels ' + suffix,
    label = 'عاجل ' + suffix;
  const made = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: {
      Authorization: 'Bearer ' + (await token('member')),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { title },
  });
  const issue = zSavedIssueView.parse(await made.json()).result;
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
  await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
  await page.getByLabel('Due date', { exact: true }).fill('2026-10-11');
  await page.getByLabel('New label name', { exact: true }).fill(label);
  await page.getByRole('button', { name: 'Create and select label', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove ' + label, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save issue', exact: true }).click();
  await expect(page.getByText('Due 2026-10-11 · Overdue', { exact: true })).toBeVisible();
  await expect(page.locator('.badge').filter({ hasText: label })).toHaveCount(1);
  const reused = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/labels', {
    headers: {
      Authorization: 'Bearer ' + (await token('member')),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { name: ' ' + label + ' ' },
  });
  expect(reused.status()).toBe(200);
  const existing = zSavedLabelView.parse(await reused.json()).result;
  await page.getByRole('link', { name: 'All issues', exact: true }).click();
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption(projectId);
  await page.getByText('Advanced filters', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Labels', exact: true }).fill(label);
  await expect(page.getByRole('option', { name: label, exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Labels', exact: true }).press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Done choosing', exact: true }).click();
  await page.getByLabel('Due from', { exact: true }).fill('2026-10-11');
  await page.getByLabel('Due through', { exact: true }).fill('2026-10-11');
  await expect(page.getByRole('heading', { name: 'Results · 1' })).toBeVisible();
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
  await page.getByLabel('Due date', { exact: true }).fill('');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove ' + label, exact: true })
    .click();
  await page.getByRole('button', { name: 'Save issue', exact: true }).click();
  await expect(page.getByText('Due 2026-10-11 · Overdue', { exact: true })).toHaveCount(0);
  const denied = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/labels', {
    headers: {
      Authorization: 'Bearer ' + (await token('viewer')),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { name: 'Denied' },
  });
  expect(denied.status()).toBe(403);
  expect(existing.name).toBe(label);
});
