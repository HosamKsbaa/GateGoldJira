import { fixtureStage } from './support/native-issues';
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import {
  zModernIssueView,
  zSavedIssueView,
  zSavedModernIssueView,
  zModernIssueFailureBody,
} from '../src/app/api/generated/zod.gen';
const projectId = '20000000-0000-4000-8000-000000000001';
test.skip(
  !localFixturesAvailable,
  'Requires isolated local PostgreSQL and signed development identities.',
);
async function move(request: APIRequestContext, id: string, status: 'done' | 'review') {
  const headers = {
    Authorization: 'Bearer ' + (await token('member')),
    'Idempotency-Key': crypto.randomUUID(),
  };
  const current = zModernIssueView.parse(
    await (await request.get(apiOrigin + '/api/v2/issues/' + id, { headers })).json(),
  );
  return request.post(apiOrigin + '/api/v2/issues/' + id + '/move', {
    headers,
    data: {
      expectedRevision: current.summary.revision,
      targetStageId: await fixtureStage(request, id, status),
    },
  });
}
test('subtasks keep independent fields and discussion, parent filtering and guarded explicit completion', async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID().slice(0, 8),
    parentTitle = 'Parent ' + suffix,
    childTitle = 'عمل فرعي ' + suffix;
  const made = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: {
      Authorization: 'Bearer ' + (await token('member')),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { title: parentTitle, dueDate: '2026-12-01' },
  });
  expect(made.status()).toBe(201);
  const parent = zSavedIssueView.parse(await made.json()).result;
  await signIn(page, 'member', '/issues/' + parent.summary.id, new RegExp('^' + parentTitle + '$'));
  const section = page.getByRole('region', { name: 'Subtasks', exact: true });
  await section.getByRole('button', { name: 'Add subtask', exact: true }).click();
  await expect(section.getByLabel('Issue title', { exact: true })).toBeFocused();
  await section.locator('gg-modern-issue-form .optional-fields > summary').click();
  await expect(section.getByLabel('Due date', { exact: true })).toHaveValue('');
  await expect(section.getByRole('combobox', { name: 'Assignee', exact: true })).toHaveValue('');
  await section.getByLabel('Issue title', { exact: true }).fill(childTitle);
  await section.getByLabel('Description', { exact: true }).fill('Independent child description');
  await section.getByLabel('Due date', { exact: true }).fill('2026-12-02');
  const saving = page.waitForResponse(
    response =>
      response.url().endsWith('/api/v2/projects/' + projectId + '/issues') &&
      response.request().method() === 'POST',
  );
  await section.getByRole('button', { name: 'Create subtask', exact: true }).click();
  const response = await saving;
  expect(response.status()).toBe(201);
  const { zSavedModernIssueView } = await import('../src/app/api/generated/zod.gen');
  const child = zSavedModernIssueView.parse(await response.json()).result;
  expect(child.summary.parent?.id).toBe(parent.summary.id);
  await expect(section.getByText('0 / 1 subtasks done', { exact: true })).toBeVisible();
  await expect(page.getByText('Due 2026-12-01', { exact: true })).toBeVisible();
  await section.getByRole('link', { name: /Find these subtasks in Issues/ }).click();
  await expect(page.getByRole('heading', { name: 'Results · 1', exact: true })).toBeVisible();
  await page.getByText('Advanced filters', { exact: true }).click();
  await expect(page.getByRole('group', { name: 'Parent issue filter' })).toContainText(
    parent.summary.key,
  );
  await page.getByRole('link', { name: new RegExp(childTitle) }).click();
  await expect(page.getByRole('heading', { name: childTitle, exact: true })).toBeVisible();
  await expect(page.getByText('Independent child description', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
  await expect(
    page.getByText('Type: Subtask · Parent stays fixed.', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Due date', { exact: true }).fill('2026-12-03');
  const label = 'طفل ' + suffix;
  await page.getByLabel('New label name', { exact: true }).fill(label);
  await page.getByRole('button', { name: 'Create and select label', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove ' + label, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save issue', exact: true }).click();
  await expect(page.getByText('Issue saved.', { exact: true })).toBeVisible();
  const discussionText = 'نقاش المهمة الفرعية GG-12';
  await page.getByRole('textbox', { name: 'Comment text', exact: true }).fill(discussionText);
  await expect(page.locator('gg-comment-editor .editor-count')).toContainText(
    Array.from(discussionText).length + ' / 5,000',
  );
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Issue discussion' })).toContainText(
    'نقاش المهمة الفرعية GG-12',
  );
  await page.getByRole('link', { name: 'Open parent ' + parent.summary.key, exact: true }).click();
  await expect(page.getByText('Due 2026-12-01', { exact: true })).toBeVisible();
  await expect(page.locator('.badge').filter({ hasText: label })).toHaveCount(1);
  const rejected = await move(request, parent.summary.id, 'done');
  expect(rejected.status()).toBe(409);
  expect(zModernIssueFailureBody.parse(await rejected.json()).error.code).toBe(
    'prerequisite_unfinished',
  );
  const doneChild = await move(request, child.summary.id, 'done');
  expect(doneChild.status()).toBe(200);
  zSavedModernIssueView.parse(await doneChild.json());
  await section.getByRole('button', { name: 'Reload subtasks and progress', exact: true }).click();
  await expect(section.getByText('1 / 1 subtasks done', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Issue status: To do', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.issue-metadata .priority-value')).toContainText('Medium');
  const doneParent = await move(request, parent.summary.id, 'done');
  expect(doneParent.status()).toBe(200);
  await section.getByRole('button', { name: 'Reload subtasks and progress', exact: true }).click();
  await expect(section.getByRole('button', { name: 'Add subtask', exact: true })).toHaveCount(0);
  const reopen = await move(request, child.summary.id, 'review');
  expect(reopen.status()).toBe(409);
  await signIn(page, 'viewer', '/issues/' + parent.summary.id, new RegExp('^' + parentTitle + '$'));
  await expect(section).toContainText('1 / 1 subtasks done');
  await expect(section.getByRole('button', { name: 'Add subtask', exact: true })).toHaveCount(0);
  await page.screenshot({
    path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/subtasks.png',
    fullPage: true,
  });
});
