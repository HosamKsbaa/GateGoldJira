import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import {
  zSavedIssueView,
  zSavedAssetView,
  zAssetView,
  zPageAssetView,
} from '../src/app/api/generated/zod.gen';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
const projectId = '20000000-0000-4000-8000-000000000001';
test.skip(!localFixturesAvailable, 'Use the isolated PostgreSQL browser runner.');
test('Arabic document drafts recover a lost acknowledgement and publish only with their comment', async ({
  page,
  request,
}, info) => {
  const title = 'Private files ' + crypto.randomUUID();
  const created = await request.post(`${apiOrigin}/api/v1/projects/${projectId}/issues`, {
    headers: {
      Authorization: 'Bearer ' + (await token('member')),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { title },
  });
  expect(created.status()).toBe(201);
  const issue = zSavedIssueView.parse(await created.json()).result;
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
  const editor = page.getByRole('textbox', { name: 'Comment text', exact: true });
  await editor.fill('وثيقة مراجعة الفريق');
  let assetId = '';
  const uploadRequests: string[] = [];
  page.on('request', value => { if (value.method() === 'POST' && /\/asset-uploads(?:\/|$)/.test(new URL(value.url()).pathname)) uploadRequests.push(value.url()); });
  await page.route(
    '**/api/v1/asset-uploads/*/finalize',
    async route => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      assetId = zSavedAssetView.parse(await response.json()).result.id;
      await route.abort('failed');
    },
    { times: 1 },
  );
  const chooser = page.waitForEvent('filechooser');
  await page
    .locator('gg-comment-editor')
    .getByRole('button', { name: 'Attach files or pictures', exact: true })
    .click();
  await (
    await chooser
  ).setFiles({ name: 'مراجعة.txt', mimeType: 'text/plain', buffer: Buffer.from('متطلبات الفريق') });
  const queue = page
    .locator('gg-comment-editor')
    .getByRole('group', { name: 'Attach pictures and files', exact: true });
  await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  await expect(queue.getByRole('alert')).toBeVisible();
  expect(assetId).not.toBe('');
  await useCase('UC-AST-0039', async () => {
  const denied = await request.get(`${apiOrigin}/api/v1/assets/${assetId}`, {
    headers: { Authorization: 'Bearer ' + (await token('viewer')) },
  });
  expect(denied.status()).toBe(404);
  await expect(page.locator('gg-issue-attachments').getByRole('button', { name: 'مراجعة.txt', exact: true })).toHaveCount(0);
  }, 'web');
  const transfersBeforeResume = uploadRequests.slice();
  await useCase('UC-COM-0056', () => useCase('UC-AST-0064', async () => {
    await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click();
    await expect(editor).toContainText('مراجعة.txt');
    await expect(editor).toContainText('وثيقة مراجعة الفريق');
    expect(uploadRequests).toEqual(transfersBeforeResume);
    const uploadedFile = queue.locator('.queue-items > li').filter({
      has: page.locator('bdi').filter({ hasText: /^مراجعة\.txt$/ }),
    });
    await expect(uploadedFile).toHaveCount(1);
    await expect(uploadedFile.locator('small')).toHaveText(Buffer.byteLength('متطلبات الفريق') + ' bytes · Uploaded');
  }, 'web'), 'web');
  await useCase('UC-AST-0040', async () => {
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  const thread = page.getByRole('region', { name: 'Issue discussion' });
  await expect(thread.getByRole('button', { name: 'مراجعة.txt', exact: true })).toBeVisible();
  const published = await request.get(`${apiOrigin}/api/v1/assets/${assetId}`, {
    headers: { Authorization: 'Bearer ' + (await token('viewer')) },
  });
  expect(published.status()).toBe(200);
  expect(zAssetView.parse(await published.json()).state).toBe('published');
  await expect(
    page.locator('gg-issue-attachments').getByRole('button', { name: 'مراجعة.txt', exact: true }),
  ).toBeVisible();
  }, 'web');
  const thread = page.getByRole('region', { name: 'Issue discussion' });
  await useCase('UC-AST-0055', async () => {
    await page.locator('gg-issue-attachments').getByRole('button', { name: 'مراجعة.txt', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Attachment preview', exact: true });
    await expect(preview.getByRole('heading', { name: 'مراجعة.txt', exact: true })).toBeVisible();
    const pending = page.waitForEvent('download'); await preview.getByRole('link', { name: 'Download file', exact: true }).click(); const download = await pending; expect(download.suggestedFilename()).toBe('مراجعة.txt');
    const stream = await download.createReadStream(); expect(stream).not.toBeNull(); const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk)); expect(Buffer.concat(chunks).toString()).toBe('متطلبات الفريق');
    await preview.getByRole('button', { name: 'Close attachment preview', exact: true }).click();
  }, 'web');
  await thread.getByRole('button', { name: 'Edit comment', exact: true }).click();
  await editor.fill('تمت المراجعة');
  await page.getByRole('button', { name: 'Save comment changes', exact: true }).click();
  await thread.getByRole('button', { name: 'Comment history', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Comment version history' })
      .getByRole('button', { name: 'مراجعة.txt', exact: true }),
  ).toBeVisible();
  await useCase('UC-AST-0036', async () => {
    await page.locator('gg-issue-attachments').getByRole('button', { name: 'Remove مراجعة.txt', exact: true }).click();
    await expect(page.locator('gg-issue-attachments').getByRole('article', { name: 'مراجعة.txt', exact: true })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Comment version history', exact: true }).getByRole('button', { name: 'مراجعة.txt', exact: true })).toBeVisible();
    const retained = await request.get(`${apiOrigin}/api/v1/assets/${assetId}`, { headers: { Authorization: 'Bearer ' + (await token('viewer')) } }); expect(retained.status()).toBe(200); expect(zAssetView.parse(await retained.json())).toMatchObject({ inPanel: false, state: 'published' });
  }, 'web');
  await useCase('UC-AST-0038', async () => {
    await page.getByRole('region', { name: 'Comment version history', exact: true }).getByRole('button', { name: 'مراجعة.txt', exact: true }).click();
    const preview = page.getByRole('dialog', { name: 'Attachment preview', exact: true }); await expect(preview.getByRole('heading', { name: 'مراجعة.txt', exact: true })).toBeVisible();
    const pending = page.waitForEvent('download'); await preview.getByRole('link', { name: 'Download file', exact: true }).click(); const download = await pending; expect(download.suggestedFilename()).toBe('مراجعة.txt'); const stream = await download.createReadStream(); expect(stream).not.toBeNull(); const chunks: Buffer[] = []; for await (const chunk of stream!) chunks.push(Buffer.from(chunk)); expect(Buffer.concat(chunks).toString()).toBe('متطلبات الفريق'); await preview.getByRole('button', { name: 'Close attachment preview', exact: true }).click();
  }, 'web');
  await page.screenshot({
    path: info.outputPath('unified-arabic-file-history.png'),
    fullPage: true,
  });
});
test('description attachments stay private until Save and are then visible in the unified panel', async ({
  page,
  request,
}) => {
  const title = 'Description files ' + crypto.randomUUID();
  const created = await request.post(`${apiOrigin}/api/v1/projects/${projectId}/issues`, {
    headers: {
      Authorization: 'Bearer ' + (await token('member')),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { title },
  });
  const issue = zSavedIssueView.parse(await created.json()).result;
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
  await page.getByRole('button', { name: 'Edit description', exact: true }).click();
  const host = page.locator('gg-description-editor');
  const text = host.getByRole('textbox', { name: 'Description', exact: true });
  await text.fill('وصف عربي');
  const chooser = page.waitForEvent('filechooser');
  await host.getByRole('button', { name: 'Attach files or pictures', exact: true }).click();
  await (
    await chooser
  ).setFiles({
    name: 'private.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('private before description save'),
  });
  await useCase('UC-COM-0026', async () => {
    await host.getByRole('button', { name: 'Upload queued files', exact: true }).click();
    await expect(text).toContainText('private.txt');
  }, 'web');
  await useCase('UC-AST-0041', async () => {
  const before = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, {
    headers: { Authorization: 'Bearer ' + (await token('viewer')) },
  });
  expect(zPageAssetView.parse(await before.json()).items).toHaveLength(0);
  await expect(page.locator('gg-issue-attachments').getByRole('button', { name: 'private.txt', exact: true })).toHaveCount(0);
  }, 'web');
  await useCase('UC-AST-0042', async () => {
  await page
    .getByRole('group', { name: 'Edit description', exact: true })
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(
    page.locator('gg-issue-attachments').getByRole('button', { name: 'private.txt', exact: true }),
  ).toBeVisible();
  const after = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, {
    headers: { Authorization: 'Bearer ' + (await token('viewer')) },
  });
  const assets = zPageAssetView.parse(await after.json());
  expect(assets.items).toHaveLength(1);
  expect(assets.items[0]?.issueRevision).toBe('2');
  }, 'web');
});

test('retained file references open after the original frontend hostname changes', async ({
  page,
  request,
}) => {
  const title = 'Legacy links ' + crypto.randomUUID(),
    headers = {
      Authorization: 'Bearer ' + (await token('member')),
      'Idempotency-Key': crypto.randomUUID(),
    };
  const created = await request.post(`${apiOrigin}/api/v1/projects/${projectId}/issues`, {
    headers,
    data: { title },
  });
  const issue = zSavedIssueView.parse(await created.json()).result;
  const uploaded = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: {
      metadata: {
        kind: 'file',
        filename: 'legacy.txt',
        description: '',
        mimeType: 'text/plain',
        publication: 'issue',
      },
      dataBase64: Buffer.from('Retained file').toString('base64'),
    },
  });
  expect(uploaded.status()).toBe(201);
  const file = zSavedAssetView.parse(await uploaded.json()).result;
  const html = `<p><a href="https://old.company.example/issues/${issue.summary.id}?attachment=${file.id}">Legacy document</a></p>`;
  const commented = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: { body: { html, mentionUserIds: [], pictureIds: [] } },
  });
  expect(commented.status()).toBe(201);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
  await useCase('UC-AST-0043', () => useCase('UC-COM-0120', async () => {
  await page
    .getByRole('region', { name: 'Issue discussion' })
    .getByRole('button', { name: 'Legacy document', exact: true })
    .click();
  const preview = page.getByRole('dialog', { name: 'Attachment preview', exact: true });
  await expect(preview.getByRole('heading', { name: 'legacy.txt', exact: true })).toBeVisible();
  await expect(preview.getByRole('link', { name: 'Download file', exact: true })).toBeVisible();
  }, 'web'), 'web');
});
