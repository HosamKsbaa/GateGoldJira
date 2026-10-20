import { readNativeIssue } from './support/native-issues';
import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { z } from 'zod';
import { zSavedIssueView, zSavedModernIssueView } from '../src/app/api/generated/zod.gen';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
const projectId = '20000000-0000-4000-8000-000000000001';
const memberId = '10000000-0000-4000-8000-000000000002';
test.skip(!localFixturesAvailable, 'Use make test-browser for isolated real local identities.');
test('MCP issue writes are visible in web details and attributed in safe Admin history', async ({
  page,
  request,
}) => {
  const title = 'MCP عربي ' + crypto.randomUUID();
  const description = '<img src=x onerror=alert(1)> نص عربي';
  const response = await request.post(apiOrigin + '/mcp', {
    headers: {
      Authorization: 'Bearer ' + (await token('member', 'mcp')),
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': '2025-11-25',
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'create_issue',
        arguments: { projectId, title, description, retryReference: crypto.randomUUID() },
      },
    },
  });
  expect(response.status()).toBe(200);
  const wire: unknown = await response.json();
  const created = z
    .object({
      result: z.object({
        isError: z.boolean().optional(),
        structuredContent: z.strictObject({
          ok: z.literal(true),
          data: zSavedIssueView,
          error: z.null(),
          links: z.array(z.strictObject({ url: z.url(), title: z.string() })).optional(),
        }),
      }),
    })
    .parse(wire).result.structuredContent.data;
  expect(created.result.reporter.id).toBe(memberId);
  await signIn(
    page,
    'member',
    '/issues/' + created.result.summary.id,
    new RegExp('^' + title + '$'),
  );
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  await signIn(page, 'owner', '/admin/activity', /Company activity/);
  await page.getByText('Advanced resource filters', { exact: true }).click();
  await page.getByLabel('Resource kind').selectOption('issue');
  await page.getByLabel('Resource identifier').fill(created.result.summary.id);
  await page.getByLabel('Resource identifier').press('Enter');
  await expect(page.locator('#activity-status')).toBeFocused();
  await expect(page.locator('#activity-status')).toContainText('1 matching events');
  const event = page.getByRole('region', { name: 'Activity events' }).locator('article');
  await expect(event).toContainText('مطور');
  await expect(event).toContainText('MCP');
  await event.locator('summary').focus();
  await page.keyboard.press('Space');
  await expect(event.getByText(description, { exact: true })).toBeVisible();
  await expect(event.locator('img')).toHaveCount(0);
  await signIn(
    page,
    'viewer',
    '/issues/' + created.result.summary.id,
    new RegExp('^' + title + '$'),
  );
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Activity', exact: true }),
  ).toHaveCount(0);
  const forbidden = await request.get(apiOrigin + '/api/v1/admin/activity', {
    headers: { Authorization: 'Bearer ' + (await token('viewer')) },
  });
  expect(forbidden.status()).toBe(403);
});
test('history validates paired filters and traverses bounded pages without duplicate events', async ({
  page,
  request,
}) => {
  const title = 'Activity paging ' + crypto.randomUUID();
  const headers = () => ({ Authorization: '', 'Idempotency-Key': crypto.randomUUID() });
  const auth = 'Bearer ' + (await token('owner'));
  const createdResponse = await request.post(
    apiOrigin + '/api/v1/projects/' + projectId + '/issues',
    { headers: { ...headers(), Authorization: auth }, data: { title } },
  );
  let issue = await readNativeIssue(
    request,
    zSavedIssueView.parse(await createdResponse.json()).result.summary.id,
  );
  for (let i = 0; i < 26; i++) {
    const response = await request.put(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
      headers: { ...headers(), Authorization: auth },
      data: {
        expectedRevision: issue.summary.revision,
        editable: {
          title: title + ' ' + i,
          description: '',
          descriptionFormat: issue.descriptionFormat,
          typeId: issue.summary.type.id,
          priorityId: issue.summary.priority.id,
          assigneeId: null,
          dueDate: null,
          labelIds: [],
        },
      },
    });
    expect(response.status()).toBe(200);
    issue = zSavedModernIssueView.parse(await response.json()).result;
  }
  await signIn(page, 'owner', '/admin/activity', /Company activity/);
  await page.getByText('Advanced resource filters', { exact: true }).click();
  await page.getByLabel('Resource kind').selectOption('issue');
  await page.getByLabel('Resource identifier').press('Enter');
  await expect(page.getByRole('alert')).toContainText(
    'Supply resource kind and identifier together',
  );
  await expect(page.getByLabel('Resource identifier')).toBeFocused();
  await page.getByLabel('Resource identifier').fill(issue.summary.id);
  await page.getByLabel('Resource identifier').press('Enter');
  await expect(page.locator('#activity-status')).toContainText('27 matching events');
  const rows = page.getByRole('region', { name: 'Activity events' }).locator('article');
  await expect(rows).toHaveCount(25);
  const first = await rows.evaluateAll(elements =>
    elements.map(element => element.getAttribute('data-activity-id')),
  );
  await page.getByRole('button', { name: 'Next activity page', exact: true }).click();
  await expect(rows).toHaveCount(2);
  for (const id of await rows.evaluateAll(elements =>
    elements.map(element => element.getAttribute('data-activity-id')),
  ))
    expect(first).not.toContain(id);
  await expect(page.locator('#activity-status')).toBeFocused();
  await page.getByRole('button', { name: 'First activity page', exact: true }).click();
  await expect(rows).toHaveCount(25);
});
