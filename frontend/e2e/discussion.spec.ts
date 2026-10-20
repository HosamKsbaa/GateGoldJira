import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { z } from 'zod';
import {
  zSavedIssueView,
  zSavedCommentView,
  zSavedPictureView,
  zSavedAssetView,
} from '../src/app/api/generated/zod.gen';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
const projectId = '20000000-0000-4000-8000-000000000001';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGN8tsWNgYGBiYGBgYGBAQAXSgHkeDr16gAAAABJRU5ErkJggg==',
  'base64',
);
test.skip(
  !localFixturesAvailable,
  'Run through make test-browser with isolated PostgreSQL and local tokens.',
);
test('Arabic rich comments keep text through a lost upload response, author edits and old picture versions', async ({
  page,
  request,
}) => {
  const title = 'Discussion عربي ' + crypto.randomUUID();
  const headers = {
    Authorization: 'Bearer ' + (await token('member')),
    'Idempotency-Key': crypto.randomUUID(),
  };
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers,
    data: { title },
  });
  expect(response.status()).toBe(201);
  const issue = zSavedIssueView.parse(await response.json()).result;
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
  const editor = page.getByRole('textbox', { name: 'Comment text', exact: true });
  await expect(editor).toBeVisible();
  await editor.fill('مرحبا فريق Jira-12 — وصف عربي محفوظ');
  await editor.press('Control+a');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await page.getByRole('combobox', { name: 'Comment direction' }).selectOption('rtl');
  let confirmedPicture: string | null = null;
  await page.route(
    '**/api/v1/asset-uploads/*/finalize',
    async route => {
      const saved = await route.fetch();
      expect(saved.status()).toBe(201);
      confirmedPicture = zSavedAssetView.parse(await saved.json()).result.id;
      await route.abort('failed');
    },
    { times: 1 },
  );
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator('gg-comment-editor')
    .getByRole('button', { name: 'Attach files or pictures', exact: true })
    .click();
  await (await chooser).setFiles({ name: 'شرح.png', mimeType: 'image/png', buffer: png });
  const upload = page
    .locator('gg-comment-editor')
    .getByRole('group', { name: 'Attach pictures and files', exact: true });
  await upload.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  await expect(upload.getByRole('alert')).toBeVisible();
  await expect(editor).toContainText('مرحبا فريق Jira-12');
  await upload.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  await expect(editor.getByAltText('شرح.png', { exact: true })).toHaveCount(1);
  await expect(editor).toContainText('مرحبا فريق Jira-12 — وصف عربي محفوظ');
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(
    page.locator('gg-issue-attachments').getByRole('button', { name: 'شرح.png', exact: true }),
  ).toBeVisible();
  const thread = page.getByRole('region', { name: 'Issue discussion' });
  await expect(thread).toContainText('مرحبا فريق Jira-12');
  await expect(thread.locator('strong')).toContainText('وصف عربي محفوظ');
  await expect(thread.locator('p[dir="rtl"]')).toBeVisible();
  await expect(thread.getByAltText('شرح.png')).toBeVisible();
  expect(confirmedPicture).not.toBeNull();
  await thread.getByRole('button', { name: 'Edit comment', exact: true }).click();
  await expect(editor).toContainText('مرحبا فريق Jira-12');
  await editor.fill('نص جديد فقط');
  await page.getByRole('button', { name: 'Save comment changes', exact: true }).click();
  await expect(thread).toContainText('نص جديد فقط');
  await expect(thread).toContainText('Edited · version 2');
  await thread.getByRole('button', { name: 'Comment history', exact: true }).click();
  const history = page.getByRole('region', { name: 'Comment version history' });
  await expect(history).toContainText('Version 1');
  await expect(history).toContainText('Version 2');
  await history.scrollIntoViewIfNeeded();
  await expect(history).toContainText('مرحبا فريق Jira-12');
  await expect(history.getByAltText('شرح.png')).toBeVisible();
  await signIn(page, 'viewer', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
  await expect(page.getByRole('region', { name: 'Issue discussion' })).toContainText('نص جديد فقط');
  await expect(page.getByRole('button', { name: 'Edit comment', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Post comment', exact: true })).toHaveCount(0);
  const copied = await request.get(
    apiOrigin + '/api/v1/pictures/' + confirmedPicture + '/content',
    { headers: { Authorization: 'Bearer ' + (await token('viewer')) } },
  );
  expect(copied.status()).toBe(200);
  expect(copied.headers()['cache-control']).toBe('private, no-store');
  const unauthenticated = await request.get(
    apiOrigin + '/api/v1/pictures/' + confirmedPicture + '/content',
  );
  expect(unauthenticated.status()).toBe(401);
});
test('MCP sanitizes malicious formatting and web renders typed nodes without remote image requests', async ({
  page,
  request,
}) => {
  const title = 'Safe HTML ' + crypto.randomUUID();
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: {
      Authorization: 'Bearer ' + (await token('member')),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { title },
  });
  const issue = zSavedIssueView.parse(await response.json()).result;
  const body = {
    html: '<h3 dir="rtl">مرحبا GG-12</h3><p style="color:red" onclick="alert(1)">نص <b>غامق</b> <i>مائل</i> <u>مسطر</u><br><a href="https://example.test/help">رابط</a><script>alert(1)</script><img src="https://remote.invalid/secret"><a href="javascript:alert(1)">آمن</a></p><blockquote><p>اقتباس</p></blockquote><ul><li>أول</li></ul><ol><li>ثان</li></ol>',
    mentionUserIds: [],
    pictureIds: [],
  };
  const result = await request.post(apiOrigin + '/mcp', {
    headers: {
      Authorization: 'Bearer ' + (await token('member', 'mcp')),
      'MCP-Protocol-Version': '2025-11-25',
      Accept: 'application/json, text/event-stream',
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'create_comment',
        arguments: { issueId: issue.summary.id, body, retryReference: crypto.randomUUID() },
      },
    },
  });
  const saved = z
    .object({
      result: z.object({
        structuredContent: z.object({ ok: z.literal(true), data: zSavedCommentView }),
      }),
    })
    .parse(await result.json()).result.structuredContent.data;
  expect(saved.result.sanitationNotices.length).toBeGreaterThan(0);
  expect(saved.result.safeHtml).not.toContain('remote.invalid');
  let remoteRequests = 0;
  page.on('request', req => {
    if (req.url().includes('remote.invalid')) remoteRequests++;
  });
  await signIn(page, 'viewer', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
  const thread = page.getByRole('region', { name: 'Issue discussion' });
  await expect(thread.getByRole('heading', { name: 'مرحبا GG-12' })).toBeVisible();
  await expect(thread.locator('strong')).toHaveText('غامق');
  await expect(thread.locator('em')).toHaveText('مائل');
  await expect(thread.locator('u')).toHaveText('مسطر');
  await expect(thread.locator('blockquote')).toContainText('اقتباس');
  await expect(thread.locator('ul li')).toContainText('أول');
  await expect(thread.locator('ol li')).toContainText('ثان');
  await expect(thread.locator('script,img,[onclick],[style]')).toHaveCount(0);
  expect(remoteRequests).toBe(0);
  await page.screenshot({
    path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/discussion-arabic.png',
    fullPage: true,
  });
});
