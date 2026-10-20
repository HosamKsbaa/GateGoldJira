import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import {
  zModernIssueView,
  zPageBoardSummary,
  zSavedIssueView,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated local company.');
async function headers() {
  return {
    Authorization: 'Bearer ' + (await token('member')),
    'Idempotency-Key': crypto.randomUUID(),
  };
}
async function read(request: APIRequestContext, id: string) {
  return zModernIssueView.parse(
    await (
      await request.get(apiOrigin + '/api/v2/issues/' + id, { headers: await headers() })
    ).json(),
  );
}

test('the compact collaboration layout keeps Arabic comments, uploads and relationship controls usable in the drawer', async ({
  page,
  request,
}) => {
  const projectId = await isolatedProject(request);
  const made = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: await headers(),
    data: { title: 'Polish the issue workspace' },
  });
  expect(made.status()).toBe(201);
  const issue = zSavedIssueView.parse(await made.json()).result;
  const childResponse = await request.post(
    apiOrigin + '/api/v1/issues/' + issue.summary.id + '/subtasks',
    {
      headers: await headers(),
      data: {
        title: 'Review mobile layouts · مراجعة التصميم',
        description: '',
        priority: 'medium',
        assigneeId: '10000000-0000-4000-8000-000000000002',
        dueDate: '2026-10-12',
        labelIds: [],
        expectedParentRevision: issue.summary.revision,
      },
    },
  );
  expect(childResponse.status()).toBe(201);
  const child = zSavedIssueView.parse(await childResponse.json()).result;
  const otherResponse = await request.post(
    apiOrigin + '/api/v1/projects/' + projectId + '/issues',
    {
      headers: await headers(),
      data: {
        title: 'Ship the comments API',
        initialStatus: 'review',
        assigneeId: '10000000-0000-4000-8000-000000000001',
      },
    },
  );
  expect(otherResponse.status()).toBe(201);
  const blocker = zSavedIssueView.parse(await otherResponse.json()).result;
  const current = await read(request, issue.summary.id);
  expect(
    (
      await request.post(apiOrigin + '/api/v1/issues/' + issue.summary.id + '/dependencies', {
        headers: await headers(),
        data: {
          blockerId: blocker.summary.id,
          expectedIssueRevision: current.summary.revision,
          expectedGraphRevision: current.graphRevision,
        },
      })
    ).status(),
  ).toBe(200);
  const boards = zPageBoardSummary.parse(
    await (
      await request.get(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
        headers: await headers(),
      })
    ).json(),
  );
  const board = boards.items[0];
  if (!board) throw new Error('Missing fixture board');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + board.name + '$'));
  await page.getByRole('link', { name: issue.summary.title, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Issue preview', exact: true });
  const subtasks = drawer.getByRole('region', { name: 'Subtasks', exact: true });
  const dependencies = drawer.getByRole('region', { name: 'Dependencies', exact: true });
  const composer = drawer.locator('gg-comment-editor');
  const editor = composer.getByRole('textbox', { name: 'Comment text', exact: true });
  await expect(
    subtasks.getByRole('link', {
      name: child.summary.key + ' · ' + child.summary.title,
      exact: true,
    }),
  ).toBeVisible();
  await expect(subtasks.getByRole('progressbar', { name: 'Subtask completion' })).toHaveAttribute(
    'value',
    '0',
  );
  await expect(
    dependencies.getByRole('link', {
      name: blocker.summary.key + ' · ' + blocker.summary.title,
      exact: true,
    }),
  ).toBeVisible();
  await expect(dependencies.getByLabel('Find a same-project issue')).toHaveCount(0);
  await dependencies.getByRole('button', { name: 'Add blocker', exact: true }).click();
  await expect(dependencies.getByLabel('Find a same-project issue')).toBeFocused();
  await dependencies.getByRole('button', { name: 'Cancel adding blocker', exact: true }).click();
  await expect(
    dependencies.getByRole('button', { name: 'Add blocker', exact: true }),
  ).toBeFocused();
  await editor.fill('The layout is ready for review.\nجاهز لمراجعة الفريق');
  await subtasks.evaluate(element => element.scrollIntoView({ block: 'start' }));
  const bounds = await composer.boundingBox();
  expect(bounds?.height).toBeLessThan(340);
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence)
    await page.screenshot({ path: evidence + '/issue-refactor/collaboration-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  if (evidence) {
    await subtasks.screenshot({ path: evidence + '/issue-refactor/subtasks-mobile.png' });
    await dependencies.screenshot({ path: evidence + '/issue-refactor/dependencies-mobile.png' });
    await composer.screenshot({ path: evidence + '/issue-refactor/comment-editor-mobile.png' });
  }
  // Attaching a file must not replace the selected Arabic/English draft.
  await editor.press('Control+a');
  const chooserEvent = page.waitForEvent('filechooser');
  await composer.getByRole('button', { name: 'Attach files or pictures', exact: true }).click();
  await (
    await chooserEvent
  ).setFiles({
    name: 'handoff.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Ready for review'),
  });
  const queue = composer.locator('gg-file-queue');
  await expect(queue).toBeVisible();
  await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  await expect(
    queue.getByRole('button', { name: 'Upload queued files', exact: true }),
  ).toBeDisabled();
  await expect(editor).toContainText('handoff.txt');
  await expect(editor).toContainText('جاهز لمراجعة الفريق');
  await composer.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(drawer.getByRole('region', { name: 'Issue discussion', exact: true })).toContainText(
    'جاهز لمراجعة الفريق',
  );
  await expect(composer.locator('.editor-attachments')).toBeHidden();
  await expect(editor).toHaveAttribute('data-empty', 'true');
  await expect(
    drawer
      .locator('gg-issue-attachments')
      .getByRole('button', { name: 'Download handoff.txt', exact: true }),
  ).toBeVisible();
});
