import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { z } from 'zod';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import {
  zSavedIssueView,
  zSavedCommentView,
  zSavedNotificationView,
  zInboxSummary,
  zPageNotificationView,
} from '../src/app/api/generated/zod.gen';
const projectId = '20000000-0000-4000-8000-000000000001';
const viewerId = '10000000-0000-4000-8000-000000000003';
test.skip(!localFixturesAvailable, 'Requires isolated PostgreSQL and signed local identities.');
test('Arabic keyboard mentions create a private inbox and uncertain read changes retry once', async ({
  page,
  request,
}) => {
  const title = 'Mention عربي ' + crypto.randomUUID();
  const created = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: {
      Authorization: 'Bearer ' + (await token('owner')),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { title },
  });
  const issue = zSavedIssueView.parse(await created.json()).result;
  await signIn(page, 'owner', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
  const editor = page.getByRole('textbox', { name: 'Comment text', exact: true });
  await editor.fill('مرحبا @مطور');
  await expect(
    page
      .getByRole('listbox', { name: 'Mention candidates', exact: true })
      .getByRole('option', { name: 'مطور تجريبي', exact: true }),
  ).toBeVisible();
  await editor.press('ArrowDown');
  await editor.press('Enter');
  await expect(editor.locator('span[data-user-id]')).toHaveText('مطور تجريبي');
  await editor.press('Control+End');
  await page.keyboard.insertText(' @ordinary');
  const saving = page.waitForResponse(
    response =>
      response.url().endsWith('/issues/' + issue.summary.id + '/comments') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  const saved = zSavedCommentView.parse(await (await saving).json()).result;
  expect(saved.mentions).toHaveLength(1);
  expect(saved.plainText).toContain('@ordinary');
  await expect(page.getByRole('region', { name: 'Issue discussion' })).toContainText('مطور تجريبي');
  await signIn(page, 'member', '/notifications', /^Inbox$/);
  const row = page.locator('.notification-record').filter({ hasText: issue.summary.key });
  await expect(row).toHaveCount(1);
  await expect(row.locator('strong')).toHaveText('Unread');
  const list = zPageNotificationView.parse(
    await (
      await request.get(apiOrigin + '/api/v1/notifications', {
        headers: { Authorization: 'Bearer ' + (await token('member')) },
      })
    ).json(),
  );
  const entry = list.items.find(item => item.issueId === issue.summary.id);
  if (!entry) throw new Error('Mention notification missing');
  const refs: string[] = [];
  let attempted = 0;
  await page.route(
    '**/api/v1/notifications/' + entry.id + '/read-state',
    async route => {
      refs.push(route.request().headers()['idempotency-key'] ?? '');
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      attempted++;
      if (attempted === 1) await route.abort('failed');
      else {
        expect(zSavedNotificationView.parse(await response.json()).receipt.replayed).toBe(true);
        await route.fulfill({ response });
      }
    },
    { times: 2 },
  );
  await row.getByRole('button', { name: 'Mark read', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry inbox change', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Retry inbox change', exact: true }).click();
  await expect(row.locator('strong')).toHaveText('Read');
  expect(refs).toHaveLength(2);
  expect(refs[0]).toBe(refs[1]);
  await row.getByRole('button', { name: 'Mark unread', exact: true }).click();
  await expect(row.locator('strong')).toHaveText('Unread');
  await page
    .getByRole('button', { name: 'Mark all accessible notifications read', exact: true })
    .click();
  await expect(row.locator('strong')).toHaveText('Read');
  await row.getByRole('button', { name: 'Mark unread', exact: true }).click();
  await row.getByRole('button', { name: 'Open issue ' + issue.summary.key, exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  const summary = zInboxSummary.parse(
    await (
      await request.get(apiOrigin + '/api/v1/notifications/summary', {
        headers: { Authorization: 'Bearer ' + (await token('member')) },
      })
    ).json(),
  );
  expect(summary.unreadCount).toBe(0);
  await signIn(page, 'viewer', '/notifications', /^Inbox$/);
  await expect(
    page.locator('.notification-record').filter({ hasText: issue.summary.key }),
  ).toHaveCount(0);
  await page.screenshot({
    path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/private-inbox.png',
    fullPage: true,
  });
});
test('a Viewer reads and changes only their own MCP-created mention notification', async ({
  page,
  request,
}) => {
  const title = 'Viewer mention ' + crypto.randomUUID();
  const made = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: {
      Authorization: 'Bearer ' + (await token('owner')),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { title },
  });
  const issue = zSavedIssueView.parse(await made.json()).result;
  const result = await request.post(apiOrigin + '/mcp', {
    headers: {
      Authorization: 'Bearer ' + (await token('owner', 'mcp')),
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/call',
      'Mcp-Name': 'create_comment',
      Accept: 'application/json, text/event-stream',
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientCapabilities': {},
        },
        name: 'create_comment',
        arguments: {
          issueId: issue.summary.id,
          body: {
            html: '<p>مرحبا <span data-user-id="' + viewerId + '">wrong label</span></p>',
            mentionUserIds: [viewerId],
            pictureIds: [],
          },
          retryReference: crypto.randomUUID(),
        },
      },
    },
  });
  const reply: unknown = await result.json();
  expect(result.status(), JSON.stringify(reply)).toBe(200);
  z.object({
    result: z.object({
      structuredContent: z.object({ ok: z.literal(true), data: zSavedCommentView }),
    }),
  }).parse(reply);
  await signIn(page, 'viewer', '/notifications', /^Inbox$/);
  const row = page.locator('.notification-record').filter({ hasText: issue.summary.key });
  await expect(row.locator('strong')).toHaveText('Unread');
  await row.getByRole('button', { name: 'Mark read', exact: true }).click();
  await expect(row.locator('strong')).toHaveText('Read');
  await row.getByRole('button', { name: 'Mark unread', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Unread only', exact: true }).check();
  await page.getByRole('button', { name: 'Apply inbox filter', exact: true }).click();
  await expect(row).toHaveCount(1);
  await row.getByRole('button', { name: 'Open issue ' + issue.summary.key, exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Post comment', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: /^Inbox/ }).click();
  await expect(
    page.locator('.notification-record').filter({ hasText: issue.summary.key }).locator('strong'),
  ).toHaveText('Read');
});
