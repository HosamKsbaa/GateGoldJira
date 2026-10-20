import { useCase } from './support/use-case';
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import {
  zModernIssueView,
  zPageAttachmentView,
  zSavedIssueView,
  zSavedBoardSummary,
} from '../src/app/api/generated/zod.gen';
import type { ModernEditable } from '../src/app/api/generated/types.gen';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';

const projectId = '20000000-0000-4000-8000-000000000001';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGN8tsWNgYGBiYGBgYGBAQAXSgHkeDr16gAAAABJRU5ErkJggg==',
  'base64',
);
function blankPDF(): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>',
  ];
  let content = '%PDF-1.4\n';
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(content);
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const crossReference = Buffer.byteLength(content);
  content += 'xref\n0 4\n0000000000 65535 f \n';
  content += offsets.map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('');
  content += `trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${crossReference}\n%%EOF\n`;
  return Buffer.from(content);
}
const pdf = blankPDF();

test.skip(!localFixturesAvailable, 'Requires isolated PostgreSQL and local approved accounts.');

async function fixture(request: APIRequestContext) {
  const title = 'Team collaboration · عربي · ' + crypto.randomUUID().slice(0, 8);
  const headers = {
    Authorization: 'Bearer ' + (await token('member')),
    'Idempotency-Key': crypto.randomUUID(),
  };
  const created = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers,
    data: { title },
  });
  expect(created.status()).toBe(201);
  const issue = zSavedIssueView.parse(await created.json()).result;
  const saved = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: { name: title, savedFilters: { query: title } },
  });
  expect(saved.status()).toBe(201);
  return { title, issue, board: zSavedBoardSummary.parse(await saved.json()).result };
}

test('card body opens comments, private pictures and documents without losing drafts', async ({
  page,
  request,
}) => {
  const { title, issue, board } = await fixture(request);
  await page.setViewportSize({ width: 1440, height: 960 });
  await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + title + '$'));
  const surface = page.locator('gg-native-issue-card .issue-card');
  const bounds = await surface.boundingBox();
  if (!bounds) throw new Error('Card surface unavailable');
  // Empty padding, outside the title/key links, must act as the issue link.
  await useCase('UC-ISS-0082', async () => {
    await page.mouse.click(bounds.x + bounds.width - 10, bounds.y + bounds.height - 8);
    const drawer = page.getByRole('dialog', { name: 'Issue preview', exact: true });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Edit issue', exact: true })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Add comment', exact: true })).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Attach files', exact: true })).toBeVisible();
    await expect(drawer.getByRole('button', { name: /^Issue status:/ })).toBeVisible();
  }, 'web');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Comment text', exact: true });
  await expect(editor).toBeFocused();
  await editor.fill('مرحبا الفريق — تفاصيل المهمة والمرفقات');
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Issue discussion', exact: true })).toContainText(
    'مرحبا الفريق',
  );
  await editor.fill('مسودة محفوظة أثناء رفع الملفات');

  await page.getByRole('button', { name: 'Attach files', exact: true }).click();
  const pictures = page
    .locator('gg-issue-attachments')
    .getByRole('group', { name: 'Attach pictures and files', exact: true });
  await pictures
    .getByLabel('Choose files')
    .setInputFiles({ name: 'توضيح.png', mimeType: 'image/png', buffer: png });
  await pictures.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  await expect(page.locator('gg-issue-attachments').getByAltText('توضيح.png')).toBeVisible();
  await expect(editor).toContainText('مسودة محفوظة أثناء رفع الملفات');

  const documents = page.getByRole('region', { name: 'Attachments', exact: true });
  const upload = page
    .locator('gg-issue-attachments')
    .getByRole('group', { name: 'Attach pictures and files', exact: true });
  await upload
    .getByLabel('Choose files')
    .setInputFiles({ name: 'متطلبات.pdf', mimeType: 'application/pdf', buffer: pdf });
  await upload.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  await expect(
    documents.getByRole('button', { name: 'Download متطلبات.pdf', exact: true }),
  ).toBeVisible();
  await documents.getByRole('button', { name: 'Preview متطلبات.pdf', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Attachment preview', exact: true });
  await expect(preview.locator('iframe')).toHaveAttribute('src', /^blob:/);
  await preview.getByRole('button', { name: 'Close attachment preview', exact: true }).click();
  await expect(editor).toContainText('مسودة محفوظة أثناء رفع الملفات');
  const downloadEvent = page.waitForEvent('download');
  await documents.getByRole('button', { name: 'Download متطلبات.pdf', exact: true }).click();
  const downloaded = await downloadEvent;
  expect(downloaded.suggestedFilename()).toBe('متطلبات.pdf');
  expect(await downloaded.failure()).toBeNull();

  await upload.getByLabel('Choose files').setInputFiles({
    name: 'ملاحظات.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('ملاحظات عربية\nReview this issue with the team.\n'),
  });
  await upload.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  await expect(
    documents.getByRole('button', { name: 'Download ملاحظات.txt', exact: true }),
  ).toBeVisible();
  await expect(editor).toContainText('مسودة محفوظة أثناء رفع الملفات');
  await page.getByRole('button', { name: 'Add comment', exact: true }).click();
  await expect(editor).toBeFocused();
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Issue discussion', exact: true })).toContainText(
    'مسودة محفوظة أثناء رفع الملفات',
  );
  await page.setViewportSize({ width: 1440, height: 1100 });
  await signIn(page, 'viewer', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
  await expect(
    documents.getByRole('button', { name: 'Download متطلبات.pdf', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload queued files', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Post comment', exact: true })).toHaveCount(0);
  await expect(documents.getByRole('button', { name: /^Remove / })).toHaveCount(0);
  if (process.env['GATEGOLD_E2E_EVIDENCE']) {
    await page.screenshot({
      path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/issue-comments-and-attachments.png',
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('an issue row opens by clicking its status and keeps a native keyboard link', async ({
  page,
  request,
}) => {
  const { title, issue } = await fixture(request);
  await signIn(
    page,
    'viewer',
    '/issues?projectId=' + projectId + '&query=' + encodeURIComponent(title),
    /^Issues$/,
  );
  const row = page
    .getByRole('list', { name: 'Issue results list', exact: true })
    .getByRole('listitem')
    .filter({ hasText: title });
  await expect(row).toHaveCount(1);
  const bounds = await row.locator('.status-pill').boundingBox();
  if (!bounds) throw new Error('Issue status cell unavailable');
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await expect(page).toHaveURL(new RegExp('/issues/' + issue.summary.id + '$'));
  await page.getByRole('link', { name: 'All issues', exact: true }).click();
  const link = page.getByRole('link', { name: issue.summary.key + ' · ' + title, exact: true });
  await link.press('Enter');
  await expect(page).toHaveURL(new RegExp('/issues/' + issue.summary.id + '$'));
});

test('an uncertain document upload preserves its file and retries without duplicates', async ({
  page,
  request,
}) => {
  const { title, issue } = await fixture(request);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
  const editor = page.getByRole('textbox', { name: 'Comment text', exact: true });
  await editor.fill('مسودة تبقى بعد انقطاع الاتصال');
  const references: string[] = [];
  let uploads = 0;
  await page.route('**/api/v1/asset-uploads/*/finalize', async route => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    references.push(route.request().headers()['idempotency-key'] ?? '');
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    if (++uploads === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  const upload = page
    .locator('gg-issue-attachments')
    .getByRole('group', { name: 'Attach pictures and files', exact: true });
  await upload
    .getByLabel('Choose files')
    .setInputFiles({ name: 'retry.pdf', mimeType: 'application/pdf', buffer: pdf });
  await upload.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  await expect(upload.getByRole('alert').filter({ hasText: 'Try again.' })).toBeVisible();
  await expect(upload).toContainText('retry.pdf');
  await expect(editor).toContainText('مسودة تبقى بعد انقطاع الاتصال');
  await upload.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  const documents = page.getByRole('region', { name: 'Attachments', exact: true });
  await expect(
    documents.getByRole('button', { name: 'Download retry.pdf', exact: true }),
  ).toHaveCount(1);
  await expect(editor).toContainText('مسودة تبقى بعد انقطاع الاتصال');
  expect(references).toHaveLength(1);
  expect(references[0]).toBeTruthy();
});

test('stale document detach needs explicit review and retains private file history', async ({
  page,
  request,
}) => {
  const { title, issue } = await fixture(request);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
  const editor = page.getByRole('textbox', { name: 'Comment text', exact: true });
  await editor.fill('مسودة تبقى أثناء مراجعة المرفق');
  const upload = page
    .locator('gg-issue-attachments')
    .getByRole('group', { name: 'Attach pictures and files', exact: true });
  await upload.getByLabel('Choose files').setInputFiles({
    name: 'history.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Retained issue history\n'),
  });
  const parentRefresh = page.waitForResponse(
    response =>
      response.request().method() === 'GET' &&
      response.url().endsWith('/api/v2/issues/' + issue.summary.id),
  );
  await upload.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  await parentRefresh;
  const documents = page.getByRole('region', { name: 'Attachments', exact: true });
  await expect(
    documents.getByRole('button', { name: 'Download history.txt', exact: true }),
  ).toBeVisible();
  const headers = { Authorization: 'Bearer ' + (await token('member')) };
  const read = await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, { headers });
  const current = zModernIssueView.parse(await read.json());
  const editable: ModernEditable = {
    title,
    description: 'Updated from another session.',
    descriptionFormat: current.descriptionFormat,
    typeId: current.summary.type.id,
    priorityId: current.summary.priority.id,
    assigneeId: current.summary.assignee?.id ?? null,
    dueDate: current.summary.dueDate,
    labelIds: current.summary.labels.map(label => label.id),
  };
  const updated = await request.put(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: { expectedRevision: current.summary.revision, editable },
  });
  expect(updated.status()).toBe(200);
  await documents.getByRole('button', { name: 'Remove history.txt', exact: true }).click();
  await expect(documents.getByRole('alert')).toContainText('The issue changed.');
  const retry = documents.getByRole('button', {
    name: 'Use current revision and retry detach',
    exact: true,
  });
  await expect(retry).toBeEnabled();
  await expect(editor).toContainText('مسودة تبقى أثناء مراجعة المرفق');
  const attached = zPageAttachmentView.parse(
    await (
      await request.get(apiOrigin + '/api/v1/issues/' + issue.summary.id + '/attachments', {
        headers,
      })
    ).json(),
  ).items[0];
  if (!attached) throw new Error('Attachment missing before explicit detach retry');
  await retry.click();
  await expect(
    documents.getByRole('button', { name: 'Download history.txt', exact: true }),
  ).toHaveCount(0);
  await expect(editor).toContainText('مسودة تبقى أثناء مراجعة المرفق');
  const path = apiOrigin + '/api/v1/attachments/' + attached.id + '/content';
  const retained = await request.get(path, {
    headers: { Authorization: 'Bearer ' + (await token('viewer')) },
  });
  expect(retained.status()).toBe(200);
  expect(retained.headers()['cache-control']).toBe('private, no-store');
  expect(retained.headers()['content-disposition']).toContain('attachment;');
  expect(retained.headers()['x-content-type-options']).toBe('nosniff');
  expect(await retained.text()).toBe('Retained issue history\n');
  expect((await request.get(path)).status()).toBe(401);
});
