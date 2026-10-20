import { useCase as recordedUseCase } from './support/use-case';
const useCase = <T>(id: string, body: () => Promise<T>) => recordedUseCase(id, body, 'web');
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import {
  zModernIssueView,
  zPageBoardSummary,
  zPageCommentView,
  zSavedCommentView,
  zSavedIssueView,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated local company.');
const richHTML =
  '<p dir="rtl">خطة الفريق <a href="https://example.test/work">Work link</a></p><pre><code>if (count &lt; 3) {\n  return "مرحبا";\n}</code></pre><table><tbody><tr><th><p>Task</p></th><th><p>المالك</p></th></tr><tr><td><p>Review design</p></td><td dir="rtl"><p>الفريق</p></td></tr></tbody></table><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Completed review</p></li><li data-type="taskItem" data-checked="false" dir="rtl"><p>اختبر التطبيق</p></li></ul>';
async function headers(role = 'member') {
  return { Authorization: 'Bearer ' + (await token(role)), 'Idempotency-Key': crypto.randomUUID() };
}
async function fixture(request: APIRequestContext) {
  const projectId = await isolatedProject(request);
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: await headers(),
    data: {
      title: 'Rich blocks ' + crypto.randomUUID().slice(0, 8),
      description: richHTML,
      descriptionFormat: 'html',
    },
  });
  expect(response.status()).toBe(201);
  return zSavedIssueView.parse(await response.json()).result;
}

test('description code, tables and editable checklists persist through source preview and table commands', async ({
  page,
  request,
}) => {
  const issue = await fixture(request);
  await signIn(
    page,
    'member',
    '/issues/' + issue.summary.id,
    new RegExp('^' + issue.summary.title + '$'),
  );
  const description = page.locator('.issue-description');
  await expect(description.locator('pre code')).toContainText('count < 3');
  await expect(
    description.getByRole('columnheader', { name: 'المالك', exact: true }),
  ).toBeVisible();
  await expect(
    description.getByRole('img', { name: 'Completed checklist item', exact: true }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Edit description', exact: true }).click();
  const editor = page.getByRole('group', { name: 'Edit description', exact: true });
  await expect(
    editor.getByRole('button', { name: 'Description Code block', exact: true }),
  ).toBeEnabled();
  await expect(
    editor.getByRole('button', { name: 'Description Checklist', exact: true }),
  ).toBeEnabled();
  await editor.getByRole('button', { name: 'HTML source', exact: true }).click();
  const source = editor.getByLabel('Description HTML', { exact: true });
  await source.fill(richHTML + '<script>removed()</script>');
  await editor.getByRole('button', { name: 'Preview HTML', exact: true }).click();
  const visual = editor.getByRole('textbox', { name: 'Description', exact: true });
  await expect(visual.locator('pre code')).toContainText('مرحبا');
  await expect(visual.locator('table tr')).toHaveCount(2);
  await visual
    .getByRole('checkbox', { name: 'Checklist item: اختبر التطبيق', exact: true })
    .check();
  await expect(visual.locator('li[data-checked]').nth(1)).toHaveAttribute('data-checked', 'true');
  await visual.locator('td p').first().click();
  await editor.getByLabel('Description table options', { exact: true }).click();
  const tools = editor.getByRole('group', { name: 'Description table controls', exact: true });
  await tools.getByRole('button', { name: 'Add row below', exact: true }).click();
  await expect(visual.locator('table tr')).toHaveCount(3);
  await tools.getByRole('button', { name: 'Add column after', exact: true }).click();
  await expect(visual.locator('table tr').first().locator('th,td')).toHaveCount(3);
  await tools.getByRole('button', { name: 'Delete column', exact: true }).click();
  await expect(visual.locator('table tr').first().locator('th,td')).toHaveCount(2);
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(description.locator('table tr')).toHaveCount(3);
  await expect(
    description.getByRole('img', { name: 'Completed checklist item', exact: true }),
  ).toHaveCount(2);
  const saved = zModernIssueView.parse(
    await (
      await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
        headers: await headers(),
      })
    ).json(),
  );
  expect(saved.description).toContain('<table');
  expect(saved.description).toContain('<pre>');
  expect(saved.description).toContain('data-checked="true"');
  expect(saved.description).not.toContain('removed()');
  await page.screenshot({
    path: test.info().outputPath('rich-description-desktop.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await signIn(
    page,
    'viewer',
    '/issues/' + issue.summary.id,
    new RegExp('^' + issue.summary.title + '$'),
  );
  await expect(description.locator('pre code')).toContainText('count < 3');
  await expect(description.locator('input[type="checkbox"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit description', exact: true })).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath('rich-description-viewer-mobile.png'),
    fullPage: true,
  });
});

test('own rich comment body opens editing in the board drawer while links remain links and history keeps rich blocks', async ({
  page,
  request,
}) => {
  const issue = await fixture(request);
  const createdResponse = await request.post(
    apiOrigin + '/api/v1/issues/' + issue.summary.id + '/comments',
    {
      headers: await headers(),
      data: { body: { html: richHTML, mentionUserIds: [], pictureIds: [] } },
    },
  );
  expect(createdResponse.status()).toBe(201);
  const created = zSavedCommentView.parse(await createdResponse.json()).result;
  const boards = zPageBoardSummary.parse(
    await (
      await request.get(apiOrigin + '/api/v1/projects/' + issue.summary.projectId + '/boards', {
        headers: await headers(),
      })
    ).json(),
  );
  const board = boards.items[0];
  if (!board) throw new Error('Missing fixture board');
  await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + board.name + '$'));
  await page.getByRole('link', { name: issue.summary.title, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Issue preview', exact: true });
  const record = drawer.locator('[data-comment-id="' + created.id + '"]');
  await expect(record.locator('table')).toBeVisible();
  await useCase('UC-COM-0079', async () => {
  const popup = page.waitForEvent('popup');
  await record.getByRole('link', { name: 'Work link', exact: true }).click();
  await (await popup).close();
  await expect(record.getByRole('textbox', { name: 'Comment text', exact: true })).toHaveCount(0);
  });
  await record.getByText('Review design', { exact: true }).click();
  const editor = record.locator('gg-comment-editor');
  await expect(editor.getByRole('textbox', { name: 'Comment text', exact: true })).toBeVisible();
  await editor.getByRole('button', { name: 'HTML source', exact: true }).click();
  const source = editor.getByLabel('Comment HTML', { exact: true });
  await expect(source).toHaveValue(/data-type="taskList"/);
  await source.fill(richHTML.replace('count &lt; 3', 'count &lt; 5'));
  await editor.getByRole('button', { name: 'Preview HTML', exact: true }).click();
  await editor.getByRole('button', { name: 'Save comment changes', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(record.locator('pre code')).toContainText('count < 5');
  const comments = zPageCommentView.parse(
    await (
      await request.get(apiOrigin + '/api/v1/issues/' + issue.summary.id + '/comments', {
        headers: await headers(),
      })
    ).json(),
  );
  expect(comments.items.find(comment => comment.id === created.id)?.safeHtml).toContain(
    'count &lt; 5',
  );
  await record.getByRole('button', { name: 'Comment history', exact: true }).click();
  const history = drawer.getByRole('region', { name: 'Comment version history', exact: true });
  await expect(history.locator('pre code')).toHaveCount(2);
  await expect(history.locator('table')).toHaveCount(2);
  await expect(history.locator('.rich-checklist')).toHaveCount(2);
});

test('comment toolbar creates code, checklists and table structures that render without executable markup', async ({
  page,
  request,
}) => {
  const issue = await fixture(request);
  await signIn(
    page,
    'member',
    '/issues/' + issue.summary.id,
    new RegExp('^' + issue.summary.title + '$'),
  );
  const editor = page.locator('gg-comment-editor');
  const text = editor.getByRole('textbox', { name: 'Comment text', exact: true });
  await text.fill('const result = "مرحبا";');
  await editor.getByRole('button', { name: 'Code block', exact: true }).click();
  await expect(text.locator('pre code')).toContainText('const result');
  await text.press('ArrowDown');
  await text.press('ArrowDown');
  await editor.getByRole('button', { name: 'HTML source', exact: true }).click();
  await editor.getByLabel('Comment HTML', { exact: true }).fill('<p>Checklist item</p>');
  await editor.getByRole('button', { name: 'Preview HTML', exact: true }).click();
  await editor.getByRole('button', { name: 'Checklist', exact: true }).click();
  await expect(text.locator('ul[data-type="taskList"]')).toHaveCount(1);
  await text.locator('input[type="checkbox"]').check();
  await editor.getByLabel('Comment table options', { exact: true }).click();
  const tools = editor.getByRole('group', { name: 'Comment table controls', exact: true });
  await tools.getByRole('button', { name: 'Insert table', exact: true }).click();
  await expect(text.locator('table tr')).toHaveCount(3);
  await text.locator('th p').first().click();
  await page.keyboard.type('Header');
  await editor.getByRole('button', { name: 'Post comment', exact: true }).click();
  const thread = page.getByRole('region', { name: 'Issue discussion', exact: true });
  await expect(thread.locator('table tr')).toHaveCount(3);
  await expect(thread.locator('.rich-checklist .checked')).toHaveCount(1);
  await expect(thread.locator('input,script,iframe')).toHaveCount(0);
});

test('nested checklist tables retain surrounding text and completion when an unsaved draft is restored', async ({
  page,
  request,
}) => {
  const issue = await fixture(request);
  await signIn(
    page,
    'member',
    '/issues/' + issue.summary.id,
    new RegExp('^' + issue.summary.title + '$'),
  );
  await useCase('UC-COM-0060', async () => {
  const editor = page.locator('gg-comment-editor');
  const nestedHTML =
    '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Before nested table</p><table><tbody><tr><th><p>Owner</p></th></tr><tr><td><p>الفريق</p></td></tr></tbody></table><p>After nested table</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Nested review</p></li></ul></li></ul>';
  await editor.getByRole('button', { name: 'HTML source', exact: true }).click();
  await editor.getByLabel('Comment HTML', { exact: true }).fill(nestedHTML);
  await editor.getByRole('button', { name: 'Preview HTML', exact: true }).click();
  const text = editor.getByRole('textbox', { name: 'Comment text', exact: true });
  await expect(text.getByText('Before nested table', { exact: true })).toBeVisible();
  await expect(text.getByText('After nested table', { exact: true })).toBeVisible();
  await expect(text.locator('li[data-checked]')).toHaveCount(2);
  await expect(text.locator('.tableWrapper')).toHaveCount(1);
  // getHTML stores the wrapper in the in-memory draft. Recreating the editor must
  // retain the task's full content instead of parsing only that descendant div.
  page.once('dialog', confirmation => confirmation.accept());
  await page.getByRole('link', { name: 'All issues', exact: true }).click();
  await page
    .getByRole('link', { name: issue.summary.key + ' · ' + issue.summary.title, exact: true })
    .click();
  await expect(text.getByText('Before nested table', { exact: true })).toBeVisible();
  await expect(text.getByText('After nested table', { exact: true })).toBeVisible();
  await expect(text.getByText('Nested review', { exact: true })).toBeVisible();
  await expect(text.locator('table tr')).toHaveCount(2);
  await expect(text.locator('li[data-checked]').first()).toHaveAttribute('data-checked', 'true');
  await expect(text.locator('li[data-checked]').nth(1)).toHaveAttribute('data-checked', 'false');
  await editor.getByRole('button', { name: 'HTML source', exact: true }).click();
  await expect(editor.getByLabel('Comment HTML', { exact: true })).toHaveValue(
    /<li[^>]+data-type="taskItem"/,
  );
  await expect(editor.getByLabel('Comment HTML', { exact: true })).toHaveValue(
    /Before nested table[\s\S]*After nested table[\s\S]*Nested review/,
  );
  await editor.getByRole('button', { name: 'Preview HTML', exact: true }).click();
  await editor.getByRole('button', { name: 'Post comment', exact: true }).click();
  const thread = page.getByRole('region', { name: 'Issue discussion', exact: true });
  await expect(thread.getByText('Before nested table', { exact: true })).toBeVisible();
  await expect(thread.getByText('After nested table', { exact: true })).toBeVisible();
  await expect(thread.getByText('Nested review', { exact: true })).toBeVisible();
  await expect(thread.locator('table tr')).toHaveCount(2);
  await expect(thread.locator('.rich-checklist .checked')).toHaveCount(1);
  const comments = zPageCommentView.parse(
    await (
      await request.get(apiOrigin + '/api/v1/issues/' + issue.summary.id + '/comments', {
        headers: await headers(),
      })
    ).json(),
  );
  expect(comments.items[0]?.safeHtml).toContain('data-type="taskItem"');
  expect(comments.items[0]?.safeHtml).toContain('After nested table');
  expect(comments.items[0]?.safeHtml).not.toContain('<input');
  });
});
