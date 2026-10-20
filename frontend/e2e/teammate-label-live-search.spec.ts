import { useCase as recordedUseCase } from './support/use-case';
const useCase = <T>(id: string, body: () => Promise<T>) => recordedUseCase(id, body, 'web');
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import {
  zModernIssueView,
  zSavedIssueView,
  zSavedLabelView,
  zSavedCommentView,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated local company.');
const teammate = 'مطور تجريبي';

async function fixture(request: APIRequestContext) {
  const projectId = await isolatedProject(request);
  const authorization = 'Bearer ' + (await token('owner'));
  const title = 'Live teammate search ' + crypto.randomUUID().slice(0, 8);
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: { Authorization: authorization, 'Idempotency-Key': crypto.randomUUID() },
    data: { title },
  });
  expect(response.status()).toBe(201);
  return { projectId, authorization, issue: zSavedIssueView.parse(await response.json()).result };
}

test('mention input searches names while typing and after reopening, then inserts the chosen teammate', async ({
  page,
  request,
}) => {
  const data = await fixture(request);
  await signIn(
    page,
    'owner',
    '/issues/' + data.issue.summary.id,
    new RegExp('^' + data.issue.summary.title + '$'),
  );
  const picker = page.locator('gg-mention-picker');
  const composer = page.getByRole('textbox', { name: 'Comment text', exact: true });
  await composer.fill('Please review this. ');
  const query = picker.getByRole('combobox', { name: 'Find a teammate', exact: true });
  await useCase('UC-COM-0108', async () => {
    await page.getByRole('button', { name: 'Mention a teammate', exact: true }).click();
    await expect(query).toBeVisible();
  });
  await useCase('UC-COM-0109', async () => {
  await query.fill('مطور');
  await expect(query).toHaveAttribute('aria-busy', 'true');
  await expect(picker.getByRole('button', { name: 'Find teammates', exact: true })).toHaveCount(0);
  await expect(picker.getByRole('option', { name: teammate, exact: true })).toBeVisible();
  await expect(query).toHaveAttribute('aria-busy', 'false');
  });
  await query.fill('no-such-teammate-' + crypto.randomUUID());
  await expect(
    picker.getByText('No eligible teammates match this page.', { exact: true }),
  ).toBeVisible();
  await query.fill('مطور');
  await expect(picker.getByRole('option', { name: teammate, exact: true })).toBeVisible();
  await useCase('UC-COM-0111', async () => {
  await picker.getByRole('button', { name: 'Close teammate selection', exact: true }).click();
  await expect(query).toHaveCount(0);
  });
  await page.getByRole('button', { name: 'Mention a teammate', exact: true }).click();
  await query.fill('مطور');
  await expect(picker.getByRole('option', { name: teammate, exact: true })).toBeVisible();
  await useCase('UC-COM-0110', async () => {
  await query.press('Enter');
  await expect(composer.locator('span[data-user-id]')).toHaveText(teammate);
  const saving = page.waitForResponse(
    response =>
      response.url().endsWith('/issues/' + data.issue.summary.id + '/comments') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  const saved = zSavedCommentView.parse(await (await saving).json()).result;
  expect(saved.mentions.map(user => user.userId)).toEqual(['10000000-0000-4000-8000-000000000002']);
  });
});

test('assignee and label searches keep returning results after rapid edits ending in the same query', async ({
  page,
  request,
}) => {
  const data = await fixture(request);
  const labelName = 'واجهة ' + crypto.randomUUID().slice(0, 8);
  const response = await request.post(
    apiOrigin + '/api/v1/projects/' + data.projectId + '/labels',
    {
      headers: { Authorization: data.authorization, 'Idempotency-Key': crypto.randomUUID() },
      data: { name: labelName },
    },
  );
  expect(response.status()).toBe(201);
  const label = zSavedLabelView.parse(await response.json()).result;
  let assigneeRequests = 0,
    labelRequests = 0;
  page.on('request', request => {
    const url = new URL(request.url());
    if (
      url.pathname.endsWith('/projects/' + data.projectId + '/assignees') &&
      url.searchParams.get('query') === 'مطور'
    )
      assigneeRequests++;
    if (
      url.pathname.endsWith('/projects/' + data.projectId + '/labels') &&
      url.searchParams.get('query') === labelName
    )
      labelRequests++;
  });
  await signIn(
    page,
    'owner',
    '/issues/' + data.issue.summary.id,
    new RegExp('^' + data.issue.summary.title + '$'),
  );
  await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const assignee = dialog.getByRole('combobox', { name: 'Assignee', exact: true });
  await assignee.fill('مطور');
  await expect(page.getByRole('option', { name: teammate, exact: true })).toBeVisible();
  await expect.poll(() => assigneeRequests).toBe(1);
  await assignee.evaluate(
    (element, values) => {
      if (!(element instanceof HTMLInputElement))
        throw new Error('Assignee search input is missing.');
      for (const value of values) {
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    ['مطور', 'no-match', 'مطور'],
  );
  await expect.poll(() => assigneeRequests).toBe(2);
  await expect(page.getByRole('option', { name: teammate, exact: true })).toBeVisible();
  await assignee.press('ArrowDown');
  await assignee.press('Enter');
  const labels = dialog.getByRole('combobox', { name: 'Labels', exact: true });
  await useCase('UC-LBL-0009', async () => {
  await labels.fill(labelName);
  await expect(page.getByRole('option', { name: labelName, exact: true })).toBeVisible();
  await expect.poll(() => labelRequests).toBe(1);
  });
  await labels.evaluate(
    (element, values) => {
      if (!(element instanceof HTMLInputElement)) throw new Error('Label search input is missing.');
      for (const value of values) {
        element.value = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    [labelName, 'no-match', labelName],
  );
  await expect.poll(() => labelRequests).toBe(2);
  await expect(page.getByRole('option', { name: labelName, exact: true })).toBeVisible();
  await useCase('UC-LBL-0011', async () => {
  await labels.press('ArrowDown');
  await labels.press('Enter');
  await page.getByRole('button', { name: 'Done choosing', exact: true }).click();
  await dialog.getByRole('button', { name: 'Save issue', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const saved = zModernIssueView.parse(
    await (
      await request.get(apiOrigin + '/api/v2/issues/' + data.issue.summary.id, {
        headers: { Authorization: data.authorization },
      })
    ).json(),
  );
  expect(saved.summary.assignee?.id).toBe('10000000-0000-4000-8000-000000000002');
  expect(saved.summary.labels.map(item => item.id)).toEqual([label.id]);
  });
});
