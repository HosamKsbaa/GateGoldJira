import { expect, type Locator } from '@playwright/test';
import { test } from './support/browser-test';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AssetView, CommentView } from '../src/app/api/generated/types.gen';
import { apiOrigin, localFixturesAvailable, signIn, fillCredentials } from './support/session';
import { useCase } from './support/use-case';
const restCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'rest');
const webCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
import { coverageComment, coverageCreate, coverageHeaders, coverageProject, coverageRead, coverageOfficeFile, coverageExpireUpload } from './support/coverage-issues';
import {
  zSavedCommentView, zPageCommentView, zPageCommentVersionView, zSavedAssetView,
  zPageAssetView, zAssetView, zAssetPolicy, zSavedUploadSessionView, zUploadSessionView,
  zAssetChunk, zSavedUserView, zProjectView, zUpdateCommentFields,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires isolated real Go/PostgreSQL fixtures.');
test.use({ trace: 'off' });
test.setTimeout(90_000);
async function source(editor: Locator, name: 'Description' | 'Comment', html: string) {
  await editor.getByRole('button', { name: 'HTML source', exact: true }).click();
  await editor.getByLabel(name + ' HTML', { exact: true }).fill(html);
  await editor.getByRole('button', { name: 'Preview HTML', exact: true }).click();
}
for (const kind of ['Description', 'Comment'] as const) {
  test(`${kind} editor exposes every inline/block style and persists real formatted content`, async ({ page, request }) => {
    const projectId = await coverageProject(request);
    const issue = await coverageCreate(request, projectId);
    await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
    if (kind === 'Description') await page.getByRole('button', { name: 'Edit description', exact: true }).click();
    const host = page.locator(kind === 'Description' ? 'gg-description-editor' : 'gg-comment-editor');
    const visual = host.getByRole('textbox', { name: kind === 'Description' ? 'Description' : 'Comment text', exact: true });
    const prefix = kind === 'Description' ? 'Description ' : '';
    const offset = kind === 'Description' ? 0 : 30;
    await webCase(`UC-COM-${String(offset + 1).padStart(4, '0')}`, async () => {
      await visual.fill('First paragraph\nSecond paragraph');
      await expect(visual).toContainText('First paragraph');
      await expect(visual).toContainText('Second paragraph');
    });
    const formats = [
      { index: 2, label: 'Bold', selector: 'strong' },
      { index: 3, label: 'Italic', selector: 'em' },
      { index: 4, label: 'Underline', selector: 'u' },
      { index: 5, label: 'Bullet list', selector: 'ul:not([data-type]) li' },
      { index: 6, label: 'Numbered list', selector: 'ol li' },
      { index: 7, label: 'Quote', selector: 'blockquote' },
      { index: 8, label: 'Code block', selector: 'pre code' },
      { index: 9, label: 'Checklist', selector: 'ul[data-type="taskList"] li' },
    ];
    for (const format of formats) await webCase(`UC-COM-${String(offset + format.index).padStart(4, '0')}`, async () => {
      await source(host, kind, '<p>Format this selection</p>');
      await visual.click(); await visual.press('Control+a');
      await host.getByRole('button', { name: prefix + format.label, exact: true }).click();
      await expect(visual.locator(format.selector)).toContainText('Format this selection');
      await visual.locator(format.selector).first().click();
      await expect(host.getByRole('button', { name: prefix + format.label, exact: true })).toHaveAttribute('aria-pressed', 'true');
    });
    await webCase(`UC-COM-${String(offset + 10).padStart(4, '0')}`, async () => {
      const check = visual.getByRole('checkbox'); await check.check();
      await expect(check).toBeChecked();
      await host.getByRole('button', { name: 'HTML source', exact: true }).click();
      await expect(host.getByLabel(kind + ' HTML', { exact: true })).toHaveValue(/data-checked="true"/);
      await host.getByRole('button', { name: 'Preview HTML', exact: true }).click();
    });
    for (const protocol of ['http', 'https'] as const) await webCase(`UC-COM-${String(offset + (protocol === 'http' ? 17 : 18)).padStart(4, '0')}`, async () => {
      await source(host, kind, '<p>Linked selection</p>');
      await visual.click(); await visual.press('Control+a');
      const options = host.getByRole('button', { name: kind === 'Description' ? 'Description link options' : 'Link options', exact: true });
      if (await options.getAttribute('aria-expanded') !== 'true') await options.click();
      await host.getByLabel('Link address', { exact: true }).fill(protocol + '://example.test/issue');
      await host.getByRole('button', { name: kind === 'Description' ? 'Link description selection' : 'Add link to selection', exact: true }).click();
      await expect(visual.getByRole('link', { name: 'Linked selection', exact: true })).toHaveAttribute('href', protocol + '://example.test/issue');
      await expect(visual).toBeFocused();
    });
    await webCase(`UC-COM-${String(offset + 28).padStart(4, '0')}`, async () => {
      await host.getByLabel('Link address', { exact: true }).fill('javascript:alert(1)');
      await host.getByRole('button', { name: kind === 'Description' ? 'Link description selection' : 'Add link to selection', exact: true }).click();
      await expect(host.getByRole('alert')).toContainText('HTTP or HTTPS');
      await expect(visual.locator('a[href^="javascript:"]')).toHaveCount(0);
    });
    if (kind === 'Comment') {
      await webCase('UC-COM-0071', async () => {
        await visual.getByRole('link', { name: 'Linked selection', exact: true }).click({ modifiers: [] });
        await host.getByRole('button', { name: 'Remove link', exact: true }).click();
        await expect(visual.locator('a')).toHaveCount(0); await expect(visual).toContainText('Linked selection');
      });
      await webCase('UC-COM-0070', async () => {
        await source(host, kind, '<p>Before break</p>'); await visual.click(); await visual.press('End');
        await host.getByRole('button', { name: 'Line break', exact: true }).click();
        await page.keyboard.type('After break');
        await expect(visual).toContainText('Before break');
        await expect(visual).toContainText('After break');
        await host.getByRole('button', { name: 'HTML source', exact: true }).click();
        await expect(host.getByLabel('Comment HTML', { exact: true })).toHaveValue(/Before break<br\s*\/?>After break/);
        await host.getByRole('button', { name: 'Preview HTML', exact: true }).click();
      });
    }
    if (kind === 'Description') await webCase('UC-COM-0029', async () => {
      await source(host, kind, '<p>Safe description<script>window.bad=1</script><img src="https://remote.invalid/a" onerror="alert(1)"></p>');
      await expect(visual).toContainText('Safe description'); await expect(visual.locator('script,iframe,img[src*="remote.invalid"]')).toHaveCount(0);
    });
    await source(host, kind, '<p>Table anchor</p>');
    await visual.click();
    await host.getByLabel(kind + ' table options', { exact: true }).click();
    const tools = host.getByRole('group', { name: kind + ' table controls', exact: true });
    await webCase(`UC-COM-${String(offset + 11).padStart(4, '0')}`, async () => {
      await tools.getByRole('button', { name: 'Insert table', exact: true }).click();
      await expect(visual.locator('tr')).toHaveCount(3);
      await expect(visual.locator('tr').first().locator('th,td')).toHaveCount(3);
    });
    await visual.locator('td p').first().click();
    await webCase(`UC-COM-${String(offset + 12).padStart(4, '0')}`, async () => {
      await tools.getByRole('button', { name: 'Add row below', exact: true }).click();
      await expect(visual.locator('tr')).toHaveCount(4);
    });
    await webCase(`UC-COM-${String(offset + 13).padStart(4, '0')}`, async () => {
      await tools.getByRole('button', { name: 'Add column after', exact: true }).click();
      await expect(visual.locator('tr').first().locator('th,td')).toHaveCount(4);
    });
    await webCase(`UC-COM-${String(offset + 14).padStart(4, '0')}`, async () => {
      await tools.getByRole('button', { name: 'Delete row', exact: true }).click();
      await expect(visual.locator('tr')).toHaveCount(3);
    });
    await webCase(`UC-COM-${String(offset + 15).padStart(4, '0')}`, async () => {
      await tools.getByRole('button', { name: 'Delete column', exact: true }).click();
      await expect(visual.locator('tr').first().locator('th,td')).toHaveCount(3);
    });
    await webCase(`UC-COM-${String(offset + 16).padStart(4, '0')}`, async () => {
      await tools.getByRole('button', { name: 'Delete table', exact: true }).click();
      await expect(visual.locator('table')).toHaveCount(0);
    });
    await source(host, kind, '<p>Heading selection</p>');
    for (const level of kind === 'Description' ? [2, 3] : [1, 2, 3, 4, 5, 6]) {
      const id = kind === 'Description' ? 59 + level : 62 + level;
      await webCase(`UC-COM-${String(id).padStart(4, '0')}`, async () => {
        await visual.getByText('Heading selection', { exact: true }).click();
        await host.getByLabel(kind + ' heading', { exact: true }).selectOption(String(level));
        await expect(visual.locator('h' + level)).toContainText('Heading selection');
      });
    }
    if (kind === 'Comment') await webCase('UC-COM-0069', async () => {
      await host.getByLabel('Comment heading', { exact: true }).selectOption('0');
      await expect(visual.locator('h1,h2,h3,h4,h5,h6')).toHaveCount(0);
      await expect(visual.locator('p').filter({ hasText: 'Heading selection' })).toHaveCount(1);
    });
    for (const direction of ['auto', 'rtl', 'ltr'] as const) await webCase(`UC-COM-${String(offset + 22 + ['auto', 'rtl', 'ltr'].indexOf(direction)).padStart(4, '0')}`, async () => {
      await visual.getByText('Heading selection', { exact: true }).click(); await host.getByLabel(kind + ' direction', { exact: true }).selectOption(direction);
      if (direction === 'auto') await expect(visual.locator('p,h1,h2,h3,h4,h5,h6').first()).not.toHaveAttribute('dir', /^(rtl|ltr)$/);
      else await expect(visual.locator('p,h1,h2,h3,h4,h5,h6').first()).toHaveAttribute('dir', direction);
    });
    await webCase(`UC-COM-${String(offset + 19).padStart(4, '0')}`, async () => {
      await host.getByRole('button', { name: 'HTML source', exact: true }).click();
      await expect(host.getByLabel(kind + ' HTML', { exact: true })).toHaveValue(/Heading selection/);
      await expect(host.getByRole('button', { name: prefix + 'Bold', exact: true })).toBeDisabled();
    });
    await webCase(`UC-COM-${String(offset + 20).padStart(4, '0')}`, async () => {
      await host.getByLabel(kind + ' HTML', { exact: true }).fill('<p dir="rtl">مراجعة عربية <strong>مهمة</strong></p>');
      await host.getByRole('button', { name: 'Preview HTML', exact: true }).click();
      await expect(visual.locator('strong')).toHaveText('مهمة');
    });
    await webCase(`UC-COM-${String(offset + 21).padStart(4, '0')}`, async () => {
      await host.getByRole('button', { name: 'HTML source', exact: true }).click();
      await host.getByRole('button', { name: 'Visual editor', exact: true }).click();
      await expect(visual).toBeVisible(); await expect(visual).toContainText('مراجعة عربية');
    });
    await webCase(`UC-COM-${String(offset + 27).padStart(4, '0')}`, async () => {
      if (kind === 'Description') {
        await page.getByRole('group', { name: 'Edit description', exact: true }).getByRole('button', { name: 'Save', exact: true }).click();
        await expect(host).toHaveCount(0);
        await expect(page.locator('.issue-description')).toContainText('مراجعة عربية مهمة');
        await expect.poll(async () => (await coverageRead(request, issue.summary.id)).description).toContain('مراجعة عربية');
      } else {
        await host.getByRole('button', { name: 'Post comment', exact: true }).click();
        await expect(page.getByRole('region', { name: 'Issue discussion', exact: true })).toContainText('مراجعة عربية مهمة');
        const response = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders() });
        expect(zPageCommentView.parse(await response.json()).items[0]?.plainText).toContain('مراجعة عربية مهمة');
      }
    });
  });
}

test('comment service enforces visible text/HTML/reference boundaries and safe rendering', async ({ request, page }) => {
  const projectId = await coverageProject(request);
  const issue = await coverageCreate(request, projectId);
  // Deliberately malformed inputs remain unknown rather than weakening generated request types.
  for (const scenario of [
    { id: 'UC-COM-0130', body: { html: '<p><br></p>', mentionUserIds: [], pictureIds: [] } },
    { id: 'UC-COM-0131', body: { html: '<p>' + 'x'.repeat(5001) + '</p>', mentionUserIds: [], pictureIds: [] } },
    { id: 'UC-COM-0132', body: { html: '<p title="' + 'x'.repeat(65537) + '">tiny</p>', mentionUserIds: [], pictureIds: [] } },
    { id: 'UC-COM-0101', body: { html: '<p>Too many pictures</p>', mentionUserIds: [], pictureIds: Array.from({ length: 6 }, () => crypto.randomUUID()) } },
    { id: 'UC-COM-0102', body: { html: '<p>Too many files</p>', mentionUserIds: [], pictureIds: [], attachmentIds: Array.from({ length: 21 }, () => crypto.randomUUID()) } },
    { id: 'UC-COM-0133', body: { html: '<p><img data-picture-id="' + crypto.randomUUID() + '" src="https://evil.invalid/x"></p>', mentionUserIds: [], pictureIds: [] } },
  ]) await restCase(scenario.id, async () => {
    const response = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders(), data: { body: scenario.body } });
    expect(response.status()).toBe(422);
    const comments = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders() });
    expect(zPageCommentView.parse(await comments.json()).items).toHaveLength(0);
  });
  let requests = 0;
  page.on('request', r => { if (r.url().includes('remote-picture.invalid')) requests++; });
  const html = '<p>Safe <strong>bold</strong><script>window.__unsafe=1</script><a href="javascript:alert(1)">bad link</a><img src="https://remote-picture.invalid/pixel" onerror="alert(1)"></p>';
  const comment = await restCase('UC-COM-0123', async () => {
    const saved = await coverageComment(request, issue.summary.id, html);
    expect(saved.safeHtml).not.toMatch(/script|onerror|javascript:/i); expect(saved.safeHtml).toContain('<strong>bold</strong>'); return saved;
  });
  await restCase('UC-COM-0105', async () => {
    expect(comment.sanitationNotices.length).toBeGreaterThan(0);
  });
  await webCase('UC-COM-0104', async () => {
    await signIn(page, 'viewer', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
    await expect(page.getByRole('region', { name: 'Issue discussion', exact: true }).locator('strong')).toHaveText('bold');
    await expect(page.getByRole('region', { name: 'Issue discussion', exact: true }).locator('img[src*="remote-picture.invalid"]')).toHaveCount(0);
    expect(requests).toBe(0);
  });
});

test('comments replay once, require authorship, detect conflict and retain exact historical revisions', async ({ request }) => {
  const projectId = await coverageProject(request);
  const issue = await coverageCreate(request, projectId);
  const reference = crypto.randomUUID();
  const body = { body: { html: '<p>Original عربي</p>', mentionUserIds: [], pictureIds: [] } };
  const first = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders('member', reference), data: body });
  expect(first.status()).toBe(201); let saved = zSavedCommentView.parse(await first.json()).result;
  await restCase('UC-COM-0090', async () => {
    const retry = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders('member', reference), data: body });
    expect(retry.status()).toBe(201); const receipt = zSavedCommentView.parse(await retry.json());
    expect(receipt.receipt.replayed).toBe(true); expect(receipt.result.id).toBe(saved.id);
    const listed = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders() });
    expect(zPageCommentView.parse(await listed.json()).items).toHaveLength(1);
  });
  await restCase('UC-COM-0094', async () => {
    const response = await request.put(`${apiOrigin}/api/v1/comments/${saved.id}`, { headers: await coverageHeaders('owner'), data: { expectedRevision: saved.revision, body: { html: '<p>Not mine</p>', mentionUserIds: [], pictureIds: [] } } });
    expect(response.status()).toBe(403);
  });
  const updateReference = crypto.randomUUID();
  const update = { expectedRevision: saved.revision, body: { html: '<p>Updated عربي</p>', mentionUserIds: [], pictureIds: [] } };
  await restCase('UC-COM-0126', async () => {
    const response = await request.put(`${apiOrigin}/api/v1/comments/${saved.id}`, { headers: await coverageHeaders('member', updateReference), data: update });
    expect(response.status()).toBe(200); saved = zSavedCommentView.parse(await response.json()).result;
    expect(saved.revision).toBe('2'); expect(saved.plainText).toContain('Updated عربي'); expect(saved.editedAt).not.toBeNull();
  });
  await restCase('UC-COM-0091', async () => {
    const response = await request.put(`${apiOrigin}/api/v1/comments/${saved.id}`, { headers: await coverageHeaders('member', updateReference), data: update });
    expect(response.status()).toBe(200); const replay = zSavedCommentView.parse(await response.json());
    expect(replay.receipt.replayed).toBe(true); expect(replay.result.revision).toBe('2');
  });
  await restCase('UC-COM-0128', async () => {
    const response = await request.put(`${apiOrigin}/api/v1/comments/${saved.id}`, { headers: await coverageHeaders(), data: { ...update, body: { ...update.body, html: '<p>Stale content</p>' } } });
    expect(response.status()).toBe(409);
  });
  await restCase('UC-COM-0085', async () => {
    const response = await request.get(`${apiOrigin}/api/v1/comments/${saved.id}/versions`, { headers: await coverageHeaders() });
    expect(response.status()).toBe(200); const versions = zPageCommentVersionView.parse(await response.json());
    expect(versions.items.map(v => v.revision).sort()).toEqual(['1', '2']);
    expect(versions.items.find(v => v.revision === '1')?.safeHtml).toContain('Original عربي');
    expect(versions.items.find(v => v.revision === '2')?.safeHtml).toContain('Updated عربي');
  });
  await restCase('UC-COM-0127', async () => {
    const response = await request.get(`${apiOrigin}/api/v1/comments/${saved.id}/versions?limit=1`, { headers: await coverageHeaders() });
    const firstPage = zPageCommentVersionView.parse(await response.json()); expect(firstPage.items).toHaveLength(1); expect(firstPage.nextCursor).not.toBeNull();
    const next = await request.get(`${apiOrigin}/api/v1/comments/${saved.id}/versions?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor!)}`, { headers: await coverageHeaders() });
    expect(next.status()).toBe(200); const secondPage = zPageCommentVersionView.parse(await next.json());
    expect(secondPage.items).toHaveLength(1); expect(secondPage.items[0]?.revision).not.toBe(firstPage.items[0]?.revision);
  });
});

test('attachment types, publication, private reads, downloads and detach preserve exact bytes', async ({ request, page }) => {
  const projectId = await coverageProject(request);
  const issue = await coverageCreate(request, projectId);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGN8tsWNgYGBiYGBgYGBAQAXSgHkeDr16gAAAABJRU5ErkJggg==', 'base64');
  const files = [
    { id: 'UC-AST-0083', kind: 'image', filename: 'small.png', mimeType: 'image/png', bytes: png },
    { id: 'UC-AST-0016', kind: 'file', filename: 'manual.pdf', mimeType: 'application/pdf', bytes: Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF') },
    { id: 'UC-AST-0017', kind: 'file', filename: 'notes.txt', mimeType: 'text/plain', bytes: Buffer.from('Team notes\nArabic العربية') },
    { id: 'UC-AST-0018', kind: 'file', filename: 'issues.csv', mimeType: 'text/csv', bytes: Buffer.from('title,owner\nReview,Developer\n') },
    { id: 'UC-AST-0021', kind: 'file', filename: 'data.bin', mimeType: 'application/octet-stream', bytes: Buffer.from([0, 255, 1, 2, 127]) },
    { id: 'UC-AST-0055', kind: 'file', filename: 'متطلبات الفريق.txt', mimeType: 'text/plain', bytes: Buffer.from('مراجعة المحتوى') },
  ];
  for (const file of files) await restCase(file.id, async () => {
    const response = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, {
      headers: await coverageHeaders(), data: { metadata: { kind: file.kind, filename: file.filename, mimeType: file.mimeType, description: '', publication: 'issue' }, dataBase64: file.bytes.toString('base64') },
    });
    expect(response.status()).toBe(201); const asset = zSavedAssetView.parse(await response.json()).result;
    expect(asset.filename).toBe(file.filename); expect(asset.byteSize).toBe(String(file.bytes.length)); expect(asset.state).toBe('published');
    const content = await request.get(`${apiOrigin}/api/v1/assets/${asset.id}/chunk?offset=0&count=1048576`, { headers: await coverageHeaders('viewer') });
    expect(content.status()).toBe(200); expect(Buffer.from(zAssetChunk.parse(await content.json()).dataBase64, 'base64')).toEqual(file.bytes);
  });
  const uploaded = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, {
    headers: await coverageHeaders(), data: { metadata: { kind: 'file', filename: 'draft.txt', mimeType: 'text/plain', description: '', publication: 'draft' }, dataBase64: Buffer.from('private draft').toString('base64') },
  });
  expect(uploaded.status()).toBe(201); const draft = zSavedAssetView.parse(await uploaded.json()).result;
  await restCase('UC-AST-0039', async () => {
    const denied = await request.get(`${apiOrigin}/api/v1/assets/${draft.id}`, { headers: await coverageHeaders('viewer') }); expect(denied.status()).toBe(404);
    const list = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders('viewer') });
    expect(zPageAssetView.parse(await list.json()).items.some(v => v.id === draft.id)).toBe(false);
  });
  await restCase('UC-AST-0040', async () => {
    const response = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, {
      headers: await coverageHeaders(), data: { body: { html: `<p>Review <a data-attachment-id="${draft.id}" href="/issues/${issue.summary.id}?attachment=${draft.id}">draft.txt</a></p>`, pictureIds: [], mentionUserIds: [], attachmentIds: [draft.id] } },
    });
    expect(response.status()).toBe(201);
    const published = await request.get(`${apiOrigin}/api/v1/assets/${draft.id}`, { headers: await coverageHeaders('viewer') }); expect(published.status()).toBe(200);
    expect(zAssetView.parse(await published.json()).state).toBe('published');
  });
  await restCase('UC-AST-0074', async () => {
    const chunk = await request.get(`${apiOrigin}/api/v1/assets/${draft.id}/chunk?offset=2&count=4`, { headers: await coverageHeaders('viewer') });
    expect(chunk.status()).toBe(200); const data = zAssetChunk.parse(await chunk.json());
    expect(Buffer.from(data.dataBase64, 'base64').toString()).toBe('ivat'); expect(data.offset).toBe('2'); expect(data.terminal).toBe(false);
  });
  await restCase('UC-AST-0081', async () => {
    const response = await request.post(`${apiOrigin}/api/v1/assets/${draft.id}/detach`, { headers: await coverageHeaders(), data: { expectedIssueRevision: '1' } }); expect(response.status()).toBe(409);
    const current = await request.get(`${apiOrigin}/api/v1/assets/${draft.id}`, { headers: await coverageHeaders() }); expect(zAssetView.parse(await current.json()).inPanel).toBe(true);
  });
  await restCase('UC-AST-0036', async () => {
    const current = await coverageRead(request, issue.summary.id);
    const response = await request.post(`${apiOrigin}/api/v1/assets/${draft.id}/detach`, { headers: await coverageHeaders(), data: { expectedIssueRevision: current.summary.revision } }); expect(response.status()).toBe(200);
    expect(zSavedAssetView.parse(await response.json()).result.inPanel).toBe(false);
  });
  await restCase('UC-AST-0038', async () => {
    const current = await request.get(`${apiOrigin}/api/v1/assets/${draft.id}`, { headers: await coverageHeaders('viewer') }); expect(current.status()).toBe(200);
    const content = await request.get(`${apiOrigin}/api/v1/assets/${draft.id}/chunk?offset=0&count=1048576`, { headers: await coverageHeaders('viewer') }); expect(content.status()).toBe(200);
    expect(Buffer.from(zAssetChunk.parse(await content.json()).dataBase64, 'base64').toString()).toBe('private draft');
  });
  await webCase('UC-AST-0052', async () => {
    const response = await page.goto(`${apiOrigin}/api/v1/assets/${draft.id}/chunk?offset=0&count=10`); expect(response?.status()).toBe(401);
    await expect(page.locator('body')).toContainText('authentication_required');
  });
  await webCase('UC-AST-0053', async () => {
    await signIn(page, 'viewer', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
    const panel = page.locator('gg-issue-attachments');
    await expect(panel.getByRole('button', { name: 'Add files', exact: true })).toHaveCount(0);
    await expect(panel.getByLabel('Choose files', { exact: true })).toHaveCount(0);
    const response = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders('viewer'), data: { metadata: { kind: 'file', filename: 'viewer.txt', mimeType: 'text/plain', description: '', publication: 'issue' }, dataBase64: Buffer.from('denied').toString('base64') } }); expect(response.status()).toBe(403);
  });
  const panel = page.locator('gg-issue-attachments'); const preview = page.getByRole('dialog', { name: 'Attachment preview', exact: true });
  await webCase('UC-AST-0025', async () => { await panel.getByRole('button', { name: 'small.png', exact: true }).click(); await expect(preview.getByRole('img', { name: 'small.png', exact: true })).toHaveJSProperty('naturalWidth', 2); await expect(preview.getByRole('img')).toHaveAttribute('src', /^blob:/); await preview.getByRole('button', { name: 'Close attachment preview', exact: true }).click(); });
  await webCase('UC-AST-0027', async () => { await panel.getByRole('button', { name: 'manual.pdf', exact: true }).click(); await expect(preview.getByTitle('PDF attachment', { exact: true })).toHaveAttribute('src', /^blob:/); await expect(preview.getByTitle('PDF attachment', { exact: true })).toHaveAttribute('sandbox', 'allow-same-origin allow-scripts'); await expect(preview.getByRole('link', { name: 'Download file', exact: true })).toBeVisible(); await preview.getByRole('button', { name: 'Close attachment preview', exact: true }).click(); });
  const discussion = page.getByRole('region', { name: 'Issue discussion', exact: true });
  await webCase('UC-AST-0034', async () => { await discussion.getByRole('button', { name: 'draft.txt', exact: true }).click(); await expect(preview.getByRole('heading', { name: 'draft.txt', exact: true })).toBeVisible(); await expect(preview.getByRole('link', { name: 'Download file', exact: true })).toBeVisible(); await preview.getByRole('button', { name: 'Close attachment preview', exact: true }).click(); });
  await webCase('UC-AST-0035', async () => { await page.route('**/api/v1/assets/' + draft.id, route => route.abort('failed'), { times: 1 }); await discussion.getByRole('button', { name: 'draft.txt', exact: true }).click(); await expect(discussion.getByRole('status').filter({ hasText: 'Attachment unavailable.' })).toBeVisible(); await discussion.getByRole('button', { name: 'draft.txt', exact: true }).click(); await expect(preview.getByRole('heading', { name: 'draft.txt', exact: true })).toBeVisible(); await preview.getByRole('button', { name: 'Close attachment preview', exact: true }).click(); });
  for (const scenario of [
    { id: 'UC-AST-0049', filename: 'bad.png', kind: 'image', mimeType: 'image/png', dataBase64: Buffer.from('not a PNG').toString('base64') },
    { id: 'UC-AST-0050', filename: 'bad.pdf', kind: 'file', mimeType: 'application/pdf', dataBase64: Buffer.from('not a PDF').toString('base64') },
  ]) await restCase(scenario.id, async () => {
    const response = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders(), data: { metadata: { kind: scenario.kind, filename: scenario.filename, mimeType: scenario.mimeType, description: '', publication: 'issue' }, dataBase64: scenario.dataBase64 } }); expect(response.status()).toBe(422);
  });
});

test('resumable uploads enforce offsets/checksums and replay chunks/finalization safely', async ({ request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  const bytes = Buffer.from('Resume this complete UTF-8 file العربية');
  let sessionId = '';
  await restCase('UC-AST-0056', async () => {
    const response = await request.get(`${apiOrigin}/api/v1/asset-policy`, { headers: await coverageHeaders() }); expect(response.status()).toBe(200);
    const policy = zAssetPolicy.parse(await response.json()); expect(BigInt(policy.maximumFileBytes)).toBeGreaterThan(0n); expect(policy.chunkBytes).toBe('1048576');
  });
  const start = async (checksum = createHash('sha256').update(bytes).digest('hex'), expectedBytes = String(bytes.length)) => request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/asset-uploads`, { headers: await coverageHeaders(), data: { metadata: { kind: 'file', filename: 'resume.txt', description: '', mimeType: 'text/plain', publication: 'issue' }, expectedBytes, checksum } });
  await restCase('UC-AST-0057', async () => {
    const response = await start(); expect(response.status()).toBe(200); const saved = zSavedUploadSessionView.parse(await response.json()).result;
    sessionId = saved.sessionId; expect(saved.receivedBytes).toBe('0'); expect(saved.expectedBytes).toBe(String(bytes.length)); expect(saved.state).toBe('uploading');
  });
  await restCase('UC-AST-0058', async () => {
    const response = await request.get(`${apiOrigin}/api/v1/asset-uploads/${sessionId}`, { headers: await coverageHeaders() }); expect(response.status()).toBe(200);
    expect(zUploadSessionView.parse(await response.json()).sessionId).toBe(sessionId);
  });
  await restCase('UC-AST-0071', async () => {
    const response = await request.get(`${apiOrigin}/api/v1/asset-uploads/${sessionId}`, { headers: await coverageHeaders('owner') }); expect(response.status()).toBe(404);
  });
  await restCase('UC-AST-0069', async () => {
    const response = await request.post(`${apiOrigin}/api/v1/asset-uploads/${sessionId}/finalize`, { headers: await coverageHeaders() }); expect(response.status()).toBe(422);
  });
  await restCase('UC-AST-0065', async () => {
    const response = await request.post(`${apiOrigin}/api/v1/asset-uploads/${sessionId}/chunks`, { headers: await coverageHeaders(), data: { offset: '1', dataBase64: bytes.toString('base64') } }); expect(response.status()).toBe(422);
  });
  const chunkReference = crypto.randomUUID();
  await restCase('UC-AST-0059', async () => {
    const response = await request.post(`${apiOrigin}/api/v1/asset-uploads/${sessionId}/chunks`, { headers: await coverageHeaders('member', chunkReference), data: { offset: '0', dataBase64: bytes.toString('base64') } }); expect(response.status()).toBe(200);
    expect(zSavedUploadSessionView.parse(await response.json()).result.receivedBytes).toBe(String(bytes.length));
  });
  await restCase('UC-AST-0062', async () => {
    const response = await request.post(`${apiOrigin}/api/v1/asset-uploads/${sessionId}/chunks`, { headers: await coverageHeaders('member', chunkReference), data: { offset: '0', dataBase64: bytes.toString('base64') } }); expect(response.status()).toBe(200);
    expect(zSavedUploadSessionView.parse(await response.json()).result.receivedBytes).toBe(String(bytes.length));
  });
  const finalizeReference = crypto.randomUUID(); let assetId = '';
  await restCase('UC-AST-0060', async () => {
    const response = await request.post(`${apiOrigin}/api/v1/asset-uploads/${sessionId}/finalize`, { headers: await coverageHeaders('member', finalizeReference) }); expect(response.status()).toBe(201);
    const saved = zSavedAssetView.parse(await response.json()); assetId = saved.result.id; expect(saved.result.byteSize).toBe(String(bytes.length));
  });
  await restCase('UC-AST-0063', async () => {
    const response = await request.post(`${apiOrigin}/api/v1/asset-uploads/${sessionId}/finalize`, { headers: await coverageHeaders('member', finalizeReference) }); expect(response.status()).toBe(201);
    const saved = zSavedAssetView.parse(await response.json()); expect(saved.receipt.replayed).toBe(true); expect(saved.result.id).toBe(assetId);
  });
  await restCase('UC-AST-0064', async () => {
    const response = await request.get(`${apiOrigin}/api/v1/asset-uploads/${sessionId}`, { headers: await coverageHeaders() }); expect(response.status()).toBe(200); expect(zUploadSessionView.parse(await response.json()).state).toBe('committed');
  });
  await restCase('UC-AST-0072', async () => {
    const response = await request.post(`${apiOrigin}/api/v1/asset-uploads/${sessionId}/cancel`, { headers: await coverageHeaders() }); expect(response.status()).toBe(422);
  });
  const canceled = zSavedUploadSessionView.parse(await (await start()).json()).result;
  await restCase('UC-AST-0061', async () => {
    const response = await request.post(`${apiOrigin}/api/v1/asset-uploads/${canceled.sessionId}/cancel`, { headers: await coverageHeaders() }); expect(response.status()).toBe(200); expect(zSavedUploadSessionView.parse(await response.json()).result.state).toBe('canceled');
  });
  const bad = zSavedUploadSessionView.parse(await (await start('0'.repeat(64))).json()).result;
  const appended = await request.post(`${apiOrigin}/api/v1/asset-uploads/${bad.sessionId}/chunks`, { headers: await coverageHeaders(), data: { offset: '0', dataBase64: bytes.toString('base64') } }); expect(appended.status()).toBe(200);
  await restCase('UC-AST-0068', async () => {
    const response = await request.post(`${apiOrigin}/api/v1/asset-uploads/${bad.sessionId}/finalize`, { headers: await coverageHeaders() }); expect(response.status()).toBe(422);
    const list = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders() }); expect(zPageAssetView.parse(await list.json()).items.some(v => v.id === bad.assetId)).toBe(false);
  });
});

test('attachment queue, preview, download and refresh controls work through the browser', async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const panel = page.locator('gg-issue-attachments'); const queue = panel.getByRole('group', { name: 'Attach pictures and files', exact: true });
  const input = queue.getByLabel('Choose files', { exact: true });
  const file = (name: string) => ({ name, mimeType: 'text/plain', buffer: Buffer.from('Attachment contents ' + name) });
  await webCase('UC-AST-0001', async () => { await input.setInputFiles(file('one.txt')); await expect(queue.locator('.queue-items li')).toHaveCount(1); await expect(queue).toContainText('one.txt'); await expect(queue).toContainText('Ready to upload'); });
  await webCase('UC-AST-0002', async () => { await input.setInputFiles([file('two.txt'), file('three.txt')]); await expect(queue.locator('.queue-items li')).toHaveCount(3); await expect(queue).toContainText('two.txt'); await expect(queue).toContainText('three.txt'); });
  await webCase('UC-AST-0004', async () => { await queue.getByRole('button', { name: 'Remove queued two.txt', exact: true }).click(); await expect(queue.locator('.queue-items li')).toHaveCount(2); await expect(queue).not.toContainText('two.txt'); });
  await webCase('UC-AST-0005', async () => { await queue.getByRole('button', { name: 'Clear queue', exact: true }).click(); await expect(queue.locator('.queue-items li')).toHaveCount(0); });
  await webCase('UC-AST-0044', async () => { await input.setInputFiles({ name: 'empty.txt', mimeType: 'text/plain', buffer: Buffer.alloc(0) }); await expect(queue.getByRole('alert')).toContainText('valid filename'); await expect(queue.locator('.queue-items li')).toHaveCount(0); });
  await webCase('UC-AST-0045', async () => {
    const data = await page.evaluateHandle(() => { const transfer = new DataTransfer(); transfer.items.add(new File(['unsafe name'], '../bad.txt', { type: 'text/plain' })); return transfer; });
    await queue.dispatchEvent('drop', { dataTransfer: data }); await data.dispose();
    await expect(queue.getByRole('alert')).toContainText('valid filename'); await expect(queue.locator('.queue-items li')).toHaveCount(0);
  });
  const policyResponse = await request.get(`${apiOrigin}/api/v1/asset-policy`, { headers: await coverageHeaders() }); expect(policyResponse.status()).toBe(200); const policy = zAssetPolicy.parse(await policyResponse.json());
  for (const scenario of [{ id: 'UC-AST-0047', name: 'oversize.bin', mime: 'application/octet-stream', size: Number(policy.maximumFileBytes) + 1 }, { id: 'UC-AST-0048', name: 'oversize.png', mime: 'image/png', size: Number(policy.maximumImageBytes) + 1 }]) await webCase(scenario.id, async () => {
    const data = await page.evaluateHandle(({ name, mime, size }) => { const transfer = new DataTransfer(); transfer.items.add(new File([new Uint8Array(size)], name, { type: mime })); return transfer; }, scenario);
    await queue.dispatchEvent('drop', { dataTransfer: data }); await data.dispose();
    await expect(queue.getByRole('alert')).toContainText('within the displayed upload limit'); await expect(queue.locator('.queue-items li')).toHaveCount(0);
  });
  await webCase('UC-AST-0046', async () => { await input.setInputFiles(Array.from({ length: 21 }, (_, n) => file('limit-' + n + '.txt'))); await expect(queue.locator('.queue-items li')).toHaveCount(20); await expect(queue.getByRole('alert')).toContainText('20 files'); });
  await queue.getByRole('button', { name: 'Clear queue', exact: true }).click();
  await webCase('UC-AST-0003', async () => {
    const data = await page.evaluateHandle(() => { const transfer = new DataTransfer(); transfer.items.add(new File(['Dropped text'], 'dropped.txt', { type: 'text/plain' })); return transfer; });
    await queue.dispatchEvent('drop', { dataTransfer: data }); await data.dispose();
    await expect(queue.locator('.queue-items li')).toHaveCount(1); await expect(queue).toContainText('dropped.txt');
  });
  let release = () => {}; const gate = new Promise<void>(resolve => { release = resolve; });
  let seen = () => {}; const requestSeen = new Promise<void>(resolve => { seen = resolve; });
  await page.route('**/api/v1/asset-uploads/*/chunks', async route => { seen(); await gate; await route.continue(); }, { times: 1 });
  const uploading = queue.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  try {
    await requestSeen;
    await webCase('UC-AST-0008', async () => { await expect(queue.getByRole('progressbar', { name: 'Upload progress for dropped.txt', exact: true })).toBeVisible(); await expect(queue.getByRole('progressbar')).toHaveAttribute('max', '100'); });
    await webCase('UC-AST-0076', async () => { await expect(queue.getByRole('progressbar', { name: 'Upload progress for dropped.txt', exact: true })).toHaveAttribute('value', /^(0|[1-9][0-9]?|100)$/); await expect(queue.locator('button.choose-button')).toBeDisabled(); });
  } finally { release(); }
  await uploading;
  await webCase('UC-AST-0006', async () => { await expect(queue).toContainText('Uploaded'); await expect(panel.getByRole('button', { name: 'dropped.txt', exact: true })).toBeVisible(); const response = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders() }); expect(zPageAssetView.parse(await response.json()).items.map(a => a.filename)).toContain('dropped.txt'); });
  await webCase('UC-AST-0007', async () => { await queue.getByRole('button', { name: 'Dismiss uploaded files', exact: true }).click(); await expect(queue.locator('.queue-items li')).toHaveCount(0); await expect(panel.getByRole('button', { name: 'dropped.txt', exact: true })).toBeVisible(); });
  await webCase('UC-AST-0022', async () => { await expect(panel.getByRole('article', { name: 'dropped.txt', exact: true })).toBeVisible(); await expect(panel.getByRole('heading', { name: 'Attachments 1', exact: true })).toBeVisible(); });
  await webCase('UC-AST-0023', async () => { await panel.getByRole('button', { name: 'Refresh attachments', exact: true }).click(); await expect(panel.getByRole('button', { name: 'dropped.txt', exact: true })).toBeVisible(); });
  const preview = page.getByRole('dialog', { name: 'Attachment preview', exact: true });
  await webCase('UC-AST-0026', async () => { await panel.getByRole('button', { name: 'dropped.txt', exact: true }).click(); await expect(preview).toBeVisible(); await expect(preview.getByRole('heading', { name: 'dropped.txt', exact: true })).toBeVisible(); await expect(preview.getByRole('link', { name: 'Download file', exact: true })).toBeVisible(); });
  await webCase('UC-AST-0030', async () => { const download = page.waitForEvent('download'); await preview.getByRole('link', { name: 'Download file', exact: true }).click(); const result = await download; expect(result.suggestedFilename()).toBe('dropped.txt'); expect(await result.failure()).toBeNull(); });
  await webCase('UC-AST-0031', async () => { await preview.getByRole('button', { name: 'Close attachment preview', exact: true }).click(); await expect(preview).toHaveCount(0); });
  await webCase('UC-AST-0028', async () => { await panel.getByRole('button', { name: 'Preview dropped.txt', exact: true }).click(); await expect(preview).toContainText('Preview is not available for this file type.'); await expect(preview.getByRole('link', { name: 'Download file', exact: true })).toBeVisible(); });
  await webCase('UC-AST-0032', async () => { await page.keyboard.press('Escape'); await expect(preview).toHaveCount(0); });
  await webCase('UC-AST-0029', async () => { const download = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Download dropped.txt', exact: true }).click(); const result = await download; expect(result.suggestedFilename()).toBe('dropped.txt'); expect(await result.failure()).toBeNull(); });
});

test('discussion edit, cancel, history, refresh, viewer and transient failure controls preserve content', async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  await signIn(page, 'viewer', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  await webCase('UC-COM-0076', async () => { await expect(page.getByRole('region', { name: 'Issue discussion', exact: true })).toContainText('No comments yet.'); await expect(page.locator('gg-comment-editor')).toHaveCount(0); });
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const thread = page.locator('gg-comment-thread'); const editor = thread.locator('gg-comment-editor');
  const text = editor.getByRole('textbox', { name: 'Comment text', exact: true });
  await webCase('UC-COM-0073', async () => { await text.fill('First browser discussion'); await editor.getByRole('button', { name: 'Post comment', exact: true }).click(); await expect(thread.getByRole('region', { name: 'Issue discussion', exact: true })).toContainText('First browser discussion'); const r = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders() }); expect(zPageCommentView.parse(await r.json()).items[0]?.plainText).toBe('First browser discussion'); });
  const record = thread.locator('.comment-record').first();
  await webCase('UC-COM-0078', async () => { await record.getByRole('button', { name: 'Edit comment', exact: true }).click(); await expect(record.getByRole('textbox', { name: 'Comment text', exact: true })).toContainText('First browser discussion'); });
  await webCase('UC-COM-0083', async () => { await editor.getByRole('button', { name: 'Cancel comment edit', exact: true }).click(); await expect(record.locator('gg-comment-editor')).toHaveCount(0); await expect(record).toContainText('First browser discussion'); });
  await webCase('UC-COM-0077', async () => { await record.locator('.editable-comment').click(); await expect(record.locator('gg-comment-editor')).toBeVisible(); await expect(text).toContainText('First browser discussion'); });
  await text.fill('Edited browser discussion'); await editor.getByRole('button', { name: 'Save comment changes', exact: true }).click(); await expect(record).toContainText('Edited browser discussion');
  await webCase('UC-COM-0087', async () => { await record.getByRole('button', { name: 'Comment history', exact: true }).click(); const history = thread.getByRole('region', { name: 'Comment version history', exact: true }); await expect(history).toContainText('First browser discussion'); await expect(history).toContainText('Edited browser discussion'); await history.getByRole('button', { name: 'Close comment history', exact: true }).click(); await expect(history).toHaveCount(0); });
  await webCase('UC-COM-0074', async () => { await thread.getByRole('button', { name: 'Reload comments', exact: true }).click(); await expect(record).toContainText('Edited browser discussion'); await expect(thread.getByRole('status').filter({ hasText: '1 comments · oldest first' })).toBeVisible(); });
  await webCase('UC-COM-0092', async () => { await page.route('**/api/v1/issues/' + issue.summary.id + '/comments?*', route => route.abort('failed'), { times: 1 }); await thread.getByRole('button', { name: 'Reload comments', exact: true }).click(); await expect(thread.getByRole('alert')).toBeVisible(); await expect(record).toContainText('Edited browser discussion'); });
  await signIn(page, 'viewer', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  await webCase('UC-COM-0095', async () => { await expect(thread).toContainText('Read-only discussion access'); await expect(record).toContainText('Edited browser discussion'); await expect(thread.getByRole('button', { name: 'Edit comment', exact: true })).toHaveCount(0); await expect(editor).toHaveCount(0); });
});

test('upload policy and chunk validation reject excess capacity before corrupting a session', async ({ request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  const policyResponse = await request.get(`${apiOrigin}/api/v1/asset-policy`, { headers: await coverageHeaders() }); expect(policyResponse.status()).toBe(200); const policy = zAssetPolicy.parse(await policyResponse.json());
  const start = async (kind: 'image' | 'file', size: string) => request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/asset-uploads`, { headers: await coverageHeaders(), data: { metadata: { kind, filename: kind === 'image' ? 'capacity.png' : 'capacity.bin', description: '', mimeType: kind === 'image' ? 'image/png' : 'application/octet-stream', publication: 'issue' }, expectedBytes: size, checksum: '0'.repeat(64) } });
  for (const scenario of [{ kind: 'file' as const, maximum: policy.maximumFileBytes }, { kind: 'image' as const, maximum: policy.maximumImageBytes }]) await test.step('Upload API rejects excess ' + scenario.kind + ' capacity', async () => {
    const response = await start(scenario.kind, String(BigInt(scenario.maximum) + 1n)); expect(response.status()).toBe(422);
    const list = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders() }); expect(zPageAssetView.parse(await list.json()).items).toHaveLength(0);
  });
  const started = await start('file', '100'); expect(started.status()).toBe(200); const session = zSavedUploadSessionView.parse(await started.json()).result;
  await restCase('UC-AST-0066', async () => { const response = await request.post(`${apiOrigin}/api/v1/asset-uploads/${session.sessionId}/chunks`, { headers: await coverageHeaders(), data: { offset: '0', dataBase64: Buffer.alloc(1048577, 1).toString('base64') } }); expect(response.status()).toBe(422); });
  await restCase('UC-AST-0067', async () => { const response = await request.post(`${apiOrigin}/api/v1/asset-uploads/${session.sessionId}/chunks`, { headers: await coverageHeaders(), data: { offset: '0', dataBase64: Buffer.from('short').toString('base64') } }); expect(response.status()).toBe(422); const current = await request.get(`${apiOrigin}/api/v1/asset-uploads/${session.sessionId}`, { headers: await coverageHeaders() }); expect(zUploadSessionView.parse(await current.json()).receivedBytes).toBe('0'); });
  const canceled = await request.post(`${apiOrigin}/api/v1/asset-uploads/${session.sessionId}/cancel`, { headers: await coverageHeaders() }); expect(canceled.status()).toBe(200);
  await restCase('UC-AST-0073', async () => { const data = Buffer.from('Direct base64 transfer'); const response = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders(), data: { metadata: { kind: 'file', filename: 'direct.txt', description: '', mimeType: 'text/plain', publication: 'issue' }, dataBase64: data.toString('base64') } }); expect(response.status()).toBe(201); const asset = zSavedAssetView.parse(await response.json()).result; expect(asset.byteSize).toBe(String(data.length)); expect(asset.state).toBe('published'); });
});

test('mention trigger, Escape, toolbar, keyboard selection and ordinary at-name text behave independently', async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const host = page.locator('gg-comment-editor'); const text = host.getByRole('textbox', { name: 'Comment text', exact: true }); const picker = host.locator('gg-mention-picker');
  await webCase('UC-COM-0107', async () => { await text.fill('Please @'); await expect(picker.getByRole('combobox', { name: 'Find a teammate', exact: true })).toBeVisible(); await expect(picker.getByRole('option').first()).toBeVisible(); });
  await webCase('UC-COM-0117', async () => { await text.press('Escape'); await expect(picker.getByRole('combobox', { name: 'Find a teammate', exact: true })).toHaveCount(0); await expect(text).toContainText('Please @'); });
  await webCase('UC-COM-0108', async () => { await host.getByRole('button', { name: 'Mention a teammate', exact: true }).click(); await expect(picker.getByRole('combobox', { name: 'Find a teammate', exact: true })).toBeVisible(); await expect(picker.getByRole('option').first()).toBeVisible(); });
  const query = picker.getByRole('combobox', { name: 'Find a teammate', exact: true });
  await webCase('UC-COM-0116', async () => { await query.press('ArrowDown'); await expect(query).toHaveAttribute('aria-activedescendant', /-1$/); await query.press('ArrowUp'); await expect(query).toHaveAttribute('aria-activedescendant', /-0$/); });
  const selected = (await picker.getByRole('option').first().innerText()).trim();
  await webCase('UC-COM-0110', async () => { await query.press('Enter'); await expect(picker.getByRole('combobox', { name: 'Find a teammate', exact: true })).toHaveCount(0); await expect(text.locator('span[data-user-id]')).toHaveText(selected); });
  await host.getByRole('button', { name: 'Mention a teammate', exact: true }).click();
  await webCase('UC-COM-0111', async () => { await picker.getByRole('button', { name: 'Close teammate selection', exact: true }).click(); await expect(query).toHaveCount(0); await expect(text.locator('span[data-user-id]')).toHaveText(selected); });
  await webCase('UC-COM-0113', async () => { await text.fill('Ordinary @NoSuchPerson text.'); await expect(text.locator('span[data-user-id]')).toHaveCount(0); await host.getByRole('button', { name: 'Post comment', exact: true }).click(); await expect(page.getByRole('region', { name: 'Issue discussion', exact: true })).toContainText('Ordinary @NoSuchPerson text.'); const response = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders() }); expect(zPageCommentView.parse(await response.json()).items[0]?.mentions).toEqual([]); });
});

test('a late earlier mention reply cannot overwrite the current teammate query', async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const host = page.locator('gg-comment-editor'); const picker = host.locator('gg-mention-picker');
  await host.getByRole('button', { name: 'Mention a teammate', exact: true }).click();
  const query = picker.getByRole('combobox', { name: 'Find a teammate', exact: true }); await expect(picker.getByRole('option').first()).toBeVisible();
  let release = () => {}; const gate = new Promise<void>(resolve => { release = resolve; }); let seen = () => {}; const ready = new Promise<void>(resolve => { seen = resolve; }); let finished = () => {}; const done = new Promise<void>(resolve => { finished = resolve; });
  await page.route('**/api/v1/projects/' + projectId + '/mention-candidates?*', async route => { const response = await route.fetch(); if (new URL(route.request().url()).searchParams.get('query') !== 'Local') { await route.fulfill({ response }); return; } seen(); await gate; try { await route.fulfill({ response }); } finally { finished(); } });
  await webCase('UC-COM-0118', async () => {
    try { await query.fill('Local'); await ready; await query.fill('مطور'); await expect(picker.getByRole('option', { name: 'مطور تجريبي', exact: true })).toBeVisible(); release(); await done; await expect(picker.getByRole('option')).toHaveCount(1); await expect(picker.getByRole('option', { name: 'مطور تجريبي', exact: true })).toBeVisible(); await expect(query).toHaveValue('مطور'); } finally { release(); }
  });
});

test('mention candidate pages reach later eligible people without duplicating the current page', async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId); const prefix = 'ZZ mention ' + crypto.randomUUID().slice(0, 8);
  for (let n = 0; n < 26; n++) {
    const response = await request.post(`${apiOrigin}/api/v1/admin/users`, { headers: await coverageHeaders('owner'), data: { email: crypto.randomUUID() + '@example.test', displayName: prefix + ' ' + String(n).padStart(2, '0'), administrator: false } }); expect(response.status()).toBe(201); const user = zSavedUserView.parse(await response.json()).result;
    const membership = await request.put(`${apiOrigin}/api/v1/projects/${projectId}/memberships/${user.id}`, { headers: await coverageHeaders('owner'), data: { expectedRevision: '0', role: 'viewer' } }); expect(membership.status()).toBe(200);
  }
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const host = page.locator('gg-comment-editor'); const picker = host.locator('gg-mention-picker');
  await host.getByRole('button', { name: 'Mention a teammate', exact: true }).click(); await picker.getByRole('combobox', { name: 'Find a teammate', exact: true }).fill(prefix);
  await webCase('UC-COM-0112', async () => { await expect(picker.getByRole('option')).toHaveCount(25); await expect(picker.getByRole('option', { name: prefix + ' 25', exact: true })).toHaveCount(0); await picker.getByRole('button', { name: 'Next teammates page', exact: true }).click(); await expect(picker.getByRole('option')).toHaveCount(1); await expect(picker.getByRole('option', { name: prefix + ' 25', exact: true })).toBeVisible(); await expect(picker.getByRole('button', { name: 'Next teammates page', exact: true })).toHaveCount(0); });
});

test('retained mentions keep their original labels while newly inaccessible mentions are rejected', async ({ request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId); const userId = '10000000-0000-4000-8000-000000000003';
  const html = `<p>Review <span data-user-id="${userId}">Forged display label</span></p>`;
  const created = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders(), data: { body: { html, pictureIds: [], mentionUserIds: [userId] } } }); expect(created.status()).toBe(201); const comment = zSavedCommentView.parse(await created.json()).result; const originalLabel = comment.mentions[0]?.displayLabel; expect(originalLabel).toBe('Local Viewer');
  const removed = await request.post(`${apiOrigin}/api/v1/projects/${projectId}/memberships/${userId}/remove`, { headers: await coverageHeaders('owner'), data: { expectedRevision: '1' } }); expect(removed.status()).toBe(200);
  await restCase('UC-COM-0134', async () => { const response = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders(), data: { body: { html, pictureIds: [], mentionUserIds: [userId] } } }); expect(response.status()).toBe(422); const listed = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders() }); expect(zPageCommentView.parse(await listed.json()).items).toHaveLength(1); });
  await restCase('UC-COM-0115', async () => { const response = await request.put(`${apiOrigin}/api/v1/comments/${comment.id}`, { headers: await coverageHeaders(), data: { expectedRevision: comment.revision, body: { html: html.replace('Review', 'Updated review'), pictureIds: [], mentionUserIds: [userId] } } }); expect(response.status()).toBe(200); const saved = zSavedCommentView.parse(await response.json()).result; expect(saved.mentions).toEqual(comment.mentions); expect(saved.safeHtml).toContain(originalLabel); expect(saved.safeHtml).not.toContain('Forged display label'); });
});

test('comment text can be selected without editing, dirty cancellation is explicit and conflicts preserve the draft', async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId); const comment = await coverageComment(request, issue.summary.id, '<p>Selection remains selectable and editable.</p>');
  const nextComment = await coverageComment(request, issue.summary.id, '<p>Another independently versioned comment.</p>');
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const thread = page.locator('gg-comment-thread'); const record = thread.locator(`[data-comment-id="${comment.id}"]`);
  await webCase('UC-COM-0081', async () => {
    const content = record.locator('.editable-comment'); await content.scrollIntoViewIfNeeded(); const box = await content.boundingBox(); if (!box) throw new Error('Missing rendered comment');
    await page.mouse.move(box.x + 2, box.y + Math.min(10, box.height / 2)); await page.mouse.down(); await page.mouse.move(box.x + Math.min(150, box.width - 2), box.y + Math.min(10, box.height / 2), { steps: 12 }); await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection()?.toString())).not.toBe(''); await expect(record.locator('gg-comment-editor')).toHaveCount(0); await page.evaluate(() => window.getSelection()?.removeAllRanges());
  });
  await record.getByRole('button', { name: 'Edit comment', exact: true }).click(); const editor = record.locator('gg-comment-editor'); const text = editor.getByRole('textbox', { name: 'Comment text', exact: true }); await text.fill('My unsent review العربية');
  await webCase('UC-COM-0084', async () => { page.once('dialog', dialog => dialog.dismiss()); await editor.getByRole('button', { name: 'Cancel comment edit', exact: true }).click(); await expect(text).toContainText('My unsent review العربية'); await expect(editor).toBeVisible(); });
  const parallel = await request.put(`${apiOrigin}/api/v1/comments/${comment.id}`, { headers: await coverageHeaders(), data: { expectedRevision: comment.revision, body: { html: '<p>Parallel accepted edit</p>', pictureIds: [], mentionUserIds: [] } } }); expect(parallel.status()).toBe(200);
  await webCase('UC-COM-0089', async () => {
    await editor.getByRole('button', { name: 'Save comment changes', exact: true }).click(); await expect(thread).toContainText('The comment has a newer version. Your unsent text remains in the editor.'); await expect(text).toContainText('My unsent review العربية');
    await thread.getByRole('button', { name: 'Use current revision and keep my draft', exact: true }).click(); await expect(text).toContainText('My unsent review العربية'); await editor.getByRole('button', { name: 'Save comment changes', exact: true }).click(); await expect(editor).toHaveCount(0); await expect(record).toContainText('My unsent review العربية'); await expect(record).toContainText('Edited · version 3');
    const versions = await request.get(`${apiOrigin}/api/v1/comments/${comment.id}/versions`, { headers: await coverageHeaders() }); const history = zPageCommentVersionView.parse(await versions.json()); expect(history.items).toHaveLength(3); expect(history.items.find(v => v.revision === '2')?.plainText).toBe('Parallel accepted edit'); expect(history.items.find(v => v.revision === '3')?.plainText).toBe('My unsent review العربية');
  });
  // Check the real child-to-parent revision event too: a model without the
  // child's initialization output must not be mistaken for a website defect.
  const nextRecord = thread.locator(`[data-comment-id="${nextComment.id}"]`);
  await nextRecord.getByRole('button', { name: 'Edit comment', exact: true }).click();
  const nextEditor = nextRecord.locator('gg-comment-editor');
  await nextEditor.getByRole('textbox', { name: 'Comment text', exact: true }).fill('Independent next comment العربية');
  const nextWrite = page.waitForRequest(value => value.method() === 'PUT' && value.url().endsWith('/comments/' + nextComment.id));
  await nextEditor.getByRole('button', { name: 'Save comment changes', exact: true }).click();
  expect(zUpdateCommentFields.parse((await nextWrite).postDataJSON()).expectedRevision).toBe(nextComment.revision);
  await expect(nextEditor).toHaveCount(0); await expect(nextRecord).toContainText('Independent next comment العربية');
  const response = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders() });
  expect(response.status()).toBe(200); const persisted = zPageCommentView.parse(await response.json());
  expect(persisted.items.find(value => value.id === nextComment.id)?.revision).toBe('2');
  expect(persisted.items.find(value => value.id === comment.id)?.revision).toBe('3');
});

test('a pending comment upload cannot post and revoked access clears the already rendered discussion', async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId); await coverageComment(request, issue.summary.id, '<p>Private discussion before access removal</p>');
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const thread = page.locator('gg-comment-thread'); const editor = thread.locator('gg-comment-editor'); const text = editor.getByRole('textbox', { name: 'Comment text', exact: true }); await text.fill('Draft with pending file');
  await webCase('UC-COM-0100', async () => { const chooser = page.waitForEvent('filechooser'); await editor.getByRole('button', { name: 'Attach files or pictures', exact: true }).click(); await (await chooser).setFiles({ name: 'pending.txt', mimeType: 'text/plain', buffer: Buffer.from('not uploaded') }); await editor.getByRole('button', { name: 'Post comment', exact: true }).click(); await expect(editor.getByRole('alert')).toContainText('Finish uploading'); await expect(text).toContainText('Draft with pending file'); const listed = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders() }); expect(zPageCommentView.parse(await listed.json()).items).toHaveLength(1); });
  await editor.getByRole('button', { name: 'Clear queue', exact: true }).click();
  const removed = await request.post(`${apiOrigin}/api/v1/projects/${projectId}/memberships/10000000-0000-4000-8000-000000000002/remove`, { headers: await coverageHeaders('owner'), data: { expectedRevision: '1' } }); expect(removed.status()).toBe(200);
  await webCase('UC-COM-0093', async () => { await thread.getByRole('button', { name: 'Reload comments', exact: true }).click(); await expect(thread.getByRole('alert')).toBeVisible(); await expect(thread.getByRole('region', { name: 'Issue discussion', exact: true })).not.toContainText('Private discussion before access removal'); await expect(thread.locator('.comment-record')).toHaveCount(0); });
});

test('JPEG, WebP, Word and Excel uploads retain their actual media bytes', async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  const formats = [
    { id: 'UC-AST-0084', kind: 'image', extension: 'jpg', mimeType: 'image/jpeg' },
    { id: 'UC-AST-0085', kind: 'image', extension: 'webp', mimeType: 'image/webp' },
    { id: 'UC-AST-0019', kind: 'file', extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    { id: 'UC-AST-0020', kind: 'file', extension: 'xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  ];
  for (const format of formats) await restCase(format.id, async () => {
    const bytes = format.extension === 'docx' || format.extension === 'xlsx'
      ? await coverageOfficeFile(format.extension)
      : Buffer.from(await page.evaluate(mime => { const canvas = document.createElement('canvas'); canvas.width = 4; canvas.height = 3; const context = canvas.getContext('2d'); if (!context) throw new Error('Canvas is unavailable'); context.fillStyle = '#0c66e4'; context.fillRect(0, 0, 4, 3); const data = canvas.toDataURL(mime); if (!data.startsWith('data:' + mime)) throw new Error('Browser did not encode requested type'); return data.split(',')[1]!; }, format.mimeType), 'base64');
    const response = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders(), data: { metadata: { kind: format.kind, filename: 'acceptance.' + format.extension, mimeType: format.mimeType, description: 'Typed media fixture', publication: 'issue' }, dataBase64: bytes.toString('base64') } }); expect(response.status()).toBe(201); const asset = zSavedAssetView.parse(await response.json()).result; expect(asset.mimeType).toBe(format.mimeType); expect(asset.byteSize).toBe(String(bytes.length));
    const content = await request.get(`${apiOrigin}/api/v1/assets/${asset.id}/chunk?offset=0&count=1048576`, { headers: await coverageHeaders('viewer') }); expect(content.status()).toBe(200); expect(Buffer.from(zAssetChunk.parse(await content.json()).dataBase64, 'base64')).toEqual(bytes);
  });
});

for (const lostAcknowledgement of [false, true]) test(`active upload cancellation ${lostAcknowledgement ? 'reconciles a lost acknowledgement' : 'confirms the stopped transfer'}`, async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const queue = page.locator('gg-issue-attachments').getByRole('group', { name: 'Attach pictures and files', exact: true });
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let sessionId = ''; const cancelReferences: string[] = [];
  await page.route('**/api/v1/asset-uploads/*/chunks', async route => {
    sessionId = route.request().url().split('/').at(-2) ?? '';
    await held; await route.abort('failed').catch(() => {});
  });
  await page.route('**/api/v1/asset-uploads/*/cancel', async route => {
    cancelReferences.push(route.request().headers()['idempotency-key'] ?? '');
    const response = await route.fetch();
    if (lostAcknowledgement && cancelReferences.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await queue.getByLabel('Choose files', { exact: true }).setInputFiles({ name: 'cancel.txt', mimeType: 'text/plain', buffer: Buffer.from('unfinished transfer') });
  await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  await expect.poll(() => sessionId).not.toBe('');
  try {
    await webCase(lostAcknowledgement ? 'UC-AST-0010' : 'UC-AST-0009', async () => {
      await queue.getByRole('button', { name: 'Cancel upload for cancel.txt', exact: true }).click();
      if (lostAcknowledgement) {
        await expect(queue.getByRole('alert')).toBeVisible();
        await expect(queue).toContainText('cancel.txt');
        await queue.getByRole('button', { name: 'Cancel upload for cancel.txt', exact: true }).click();
        expect(cancelReferences).toHaveLength(2); expect(cancelReferences[1]).toBe(cancelReferences[0]);
      }
      await expect(queue.locator('.queue-items li')).toHaveCount(0);
      const canceled = await request.get(`${apiOrigin}/api/v1/asset-uploads/${sessionId}`, { headers: await coverageHeaders() });
      expect(canceled.status()).toBe(200); expect(zUploadSessionView.parse(await canceled.json()).state).toBe('canceled');
      const list = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders() }); expect(zPageAssetView.parse(await list.json()).items).toHaveLength(0);
    });
  } finally { release(); }
});

test('failed upload retry preserves its exact session and chunk reference', async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const queue = page.locator('gg-issue-attachments').getByRole('group', { name: 'Attach pictures and files', exact: true });
  const starts: string[] = [], chunkReferences: string[] = [];
  page.on('request', outgoing => { if (outgoing.method() === 'POST' && outgoing.url().endsWith('/asset-uploads')) starts.push(outgoing.url()); });
  await page.route('**/api/v1/asset-uploads/*/chunks', async route => {
    chunkReferences.push(route.request().headers()['idempotency-key'] ?? '');
    if (chunkReferences.length === 1) await route.abort('failed'); else await route.continue();
  });
  await webCase('UC-AST-0012', async () => {
    await queue.getByLabel('Choose files', { exact: true }).setInputFiles({ name: 'retry.txt', mimeType: 'text/plain', buffer: Buffer.from('retry these same bytes') });
    await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click();
    await expect(queue).toContainText('Upload failed'); await expect(queue).toContainText('retry.txt');
    await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click();
    await expect(queue).toContainText('Uploaded');
    await expect(page.locator('gg-issue-attachments').getByRole('button', { name: 'retry.txt', exact: true })).toBeVisible();
    expect(starts).toHaveLength(1); expect(chunkReferences).toHaveLength(2); expect(chunkReferences[1]).toBe(chunkReferences[0]);
  });
});

test('same-tab navigation restores the file, upload session and progress before resuming', async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const queue = page.locator('gg-issue-attachments').getByRole('group', { name: 'Attach pictures and files', exact: true });
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
  let firstChunk = false, starts = 0;
  page.on('request', outgoing => { if (outgoing.method() === 'POST' && outgoing.url().endsWith('/asset-uploads')) starts++; });
  await page.route('**/api/v1/asset-uploads/*/chunks', async route => { if (!firstChunk) { firstChunk = true; await held; await route.abort('failed').catch(() => {}); } else await route.continue(); });
  await queue.getByLabel('Choose files', { exact: true }).setInputFiles({ name: 'restore.txt', mimeType: 'text/plain', buffer: Buffer.from('same tab restoration') });
  await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  await expect.poll(() => firstChunk).toBe(true);
  await webCase('UC-AST-0011', async () => {
    page.once('dialog', confirmation => confirmation.accept());
    await page.getByRole('link', { name: 'All issues', exact: true }).click();
    release();
    await page.getByRole('link', { name: issue.summary.key + ' · ' + issue.summary.title, exact: true }).click();
    await expect(queue).toContainText('restore.txt');
    await expect(queue.getByRole('progressbar', { name: 'Upload progress for restore.txt', exact: true })).toHaveAttribute('value', '0');
    await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click();
    await expect(queue).toContainText('Uploaded');
    await expect(page.locator('gg-issue-attachments').getByRole('button', { name: 'restore.txt', exact: true })).toBeVisible();
    expect(starts).toBe(1);
  });
});

test('comment and attachment cursors append distinct oldest-first records in the real browser', async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  const comments: CommentView[] = [], assets: AssetView[] = [];
  for (let index = 0; index < 26; index++) {
    comments.push(await coverageComment(request, issue.summary.id, `<p>Cursor comment ${String(index).padStart(2, '0')}</p>`));
    const response = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders(), data: { metadata: { kind: index === 0 ? 'image' : 'file', filename: `cursor-${String(index).padStart(2, '0')}.${index === 0 ? 'png' : 'txt'}`, description: '', mimeType: index === 0 ? 'image/png' : 'text/plain', publication: 'issue' }, dataBase64: index === 0 ? 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGN8tsWNgYGBiYGBgYGBAQAXSgHkeDr16gAAAABJRU5ErkJggg==' : Buffer.from('Page ' + index).toString('base64') } }); expect(response.status()).toBe(201); assets.push(zSavedAssetView.parse(await response.json()).result);
  }
  await signIn(page, 'viewer', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const thread = page.locator('gg-comment-thread'), panel = page.locator('gg-issue-attachments');
  await webCase('UC-COM-0075', async () => {
    await expect(thread.locator('.comment-record')).toHaveCount(25);
    await thread.getByRole('button', { name: 'Next comments page', exact: true }).click();
    await expect(thread.locator('.comment-record')).toHaveCount(26);
    expect(await thread.locator('.comment-record').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-comment-id')))).toEqual(comments.map(comment => comment.id));
    await expect(thread.getByRole('button', { name: 'Next comments page', exact: true })).toHaveCount(0);
  });
  await restCase('UC-COM-0125', async () => {
    const first = zPageCommentView.parse(await (await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments?limit=25`, { headers: await coverageHeaders('viewer') })).json());
    expect(first.items).toHaveLength(25); expect(first.nextCursor).not.toBeNull();
    const second = zPageCommentView.parse(await (await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments?limit=25&cursor=${encodeURIComponent(first.nextCursor!)}`, { headers: await coverageHeaders('viewer') })).json());
    expect(second.items).toHaveLength(1); expect([...first.items, ...second.items].map(comment => comment.id)).toEqual(comments.map(comment => comment.id)); expect(second.nextCursor).toBeNull();
  });
  await webCase('UC-AST-0024', async () => {
    await expect(panel.locator('.attachment-card')).toHaveCount(25);
    await panel.getByRole('button', { name: 'Load more attachments', exact: true }).click();
    await expect(panel.locator('.attachment-card')).toHaveCount(26);
    expect(new Set(await panel.locator('.attachment-card').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))))).toEqual(new Set(assets.map(asset => asset.filename)));
    await expect(panel.getByRole('button', { name: 'Load more attachments', exact: true })).toHaveCount(0);
  });
  await restCase('UC-AST-0079', async () => {
    const first = zPageAssetView.parse(await (await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets?limit=25`, { headers: await coverageHeaders('viewer') })).json());
    expect(first.items).toHaveLength(25); expect(first.nextCursor).not.toBeNull();
    const second = zPageAssetView.parse(await (await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets?limit=25&cursor=${encodeURIComponent(first.nextCursor!)}`, { headers: await coverageHeaders('viewer') })).json());
    expect(second.items).toHaveLength(1); expect(new Set([...first.items, ...second.items].map(asset => asset.id))).toEqual(new Set(assets.map(asset => asset.id))); expect(second.nextCursor).toBeNull(); expect(first.totalMatching).toBe(26); expect(second.totalMatching).toBe(26); expect(new Set([...first.items, ...second.items].map(asset => asset.kind))).toEqual(new Set(['image', 'file']));
  });
});

test('issue Add comment action focuses its rich composer', async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  await webCase('UC-COM-0072', async () => {
    await page.getByRole('button', { name: 'Add comment', exact: true }).click();
    const editor = page.locator('gg-comment-editor').getByRole('textbox', { name: 'Comment text', exact: true });
    await expect(editor).toBeFocused(); await page.keyboard.type('Focused comment'); await expect(editor).toHaveText('Focused comment');
  });
});

test('nested description task blocks retain tables and Arabic text through save and reopening', async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  await webCase('UC-COM-0030', async () => {
    await page.getByRole('button', { name: 'Edit description', exact: true }).click();
    const host = page.locator('gg-description-editor');
    await source(host, 'Description', '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Before nested description</p><table><tbody><tr><th><p>Owner</p></th></tr><tr><td><p>الفريق</p></td></tr></tbody></table><p>After nested description</p><ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>Nested review</p></li></ul></li></ul>');
    const visual = host.getByRole('textbox', { name: 'Description', exact: true });
    await expect(visual.locator('table tr')).toHaveCount(2); await expect(visual).toContainText('After nested description');
    await page.getByRole('group', { name: 'Edit description', exact: true }).getByRole('button', { name: 'Save', exact: true }).click();
    await expect(host).toHaveCount(0);
    const saved = await coverageRead(request, issue.summary.id); expect(saved.description).toContain('After nested description'); expect(saved.description).toContain('data-checked="true"'); expect(saved.description).toContain('الفريق');
    await page.getByRole('button', { name: 'Edit description', exact: true }).click();
    await expect(visual.locator('table tr')).toHaveCount(2); await expect(visual).toContainText('Before nested description'); await expect(visual).toContainText('After nested description'); await expect(visual).toContainText('Nested review');
    await expect(visual.locator('li[data-checked]').first()).toHaveAttribute('data-checked', 'true'); await expect(visual.locator('li[data-checked]').nth(1)).toHaveAttribute('data-checked', 'false');
  });
});

test('archiving a project immediately denies comment creation and editing', async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  const comment = await coverageComment(request, issue.summary.id, '<p>Retained before archive</p>');
  const project = await request.get(`${apiOrigin}/api/v1/projects/${projectId}`, { headers: await coverageHeaders('owner') }); expect(project.status()).toBe(200);
  const archived = await request.post(`${apiOrigin}/api/v1/projects/${projectId}/archive`, { headers: await coverageHeaders('owner'), data: { expectedRevision: zProjectView.parse(await project.json()).revision } }); expect(archived.status()).toBe(200);
  await restCase('UC-COM-0096', async () => {
    const created = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders(), data: { body: { html: '<p>Denied new comment</p>', pictureIds: [], mentionUserIds: [] } } }); expect(created.status()).toBe(403);
    const edited = await request.put(`${apiOrigin}/api/v1/comments/${comment.id}`, { headers: await coverageHeaders(), data: { expectedRevision: comment.revision, body: { html: '<p>Denied edit</p>', pictureIds: [], mentionUserIds: [] } } }); expect(edited.status()).toBe(403);
    const read = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders() }); expect(read.status()).toBe(200); expect(zPageCommentView.parse(await read.json()).items.map(item => item.plainText)).toEqual(['Retained before archive']);
  });
  await webCase('UC-COM-0096', async () => {
    await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
    await expect(page.locator('gg-comment-thread')).toContainText('Read-only discussion access');
    await expect(page.getByRole('region', { name: 'Issue discussion', exact: true })).toContainText('Retained before archive');
    await expect(page.locator('gg-comment-editor')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Edit comment', exact: true })).toHaveCount(0);
  });
});

test('an earlier issue comment reply cannot overwrite the newly opened issue discussion', async ({ page, request }) => {
  const projectId = await coverageProject(request); const first = await coverageCreate(request, projectId), second = await coverageCreate(request, projectId);
  await coverageComment(request, first.summary.id, '<p>Only first private discussion</p>'); await coverageComment(request, second.summary.id, '<p>Only second private discussion</p>');
  await signIn(page, 'member', '/issues/' + first.summary.id, new RegExp('^' + first.summary.title + '$'));
  await expect(page.getByRole('region', { name: 'Issue discussion', exact: true })).toContainText('Only first private discussion');
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); let waiting = false, delivered = false;
  await page.route('**/api/v1/issues/' + first.summary.id + '/comments?*', async route => { const response = await route.fetch(); waiting = true; await held; await route.fulfill({ response }).catch(() => {}); delivered = true; }, { times: 1 });
  await page.locator('gg-comment-thread').getByRole('button', { name: 'Reload comments', exact: true }).click(); await expect.poll(() => waiting).toBe(true);
  await webCase('UC-COM-0119', async () => {
    await page.getByRole('link', { name: 'All issues', exact: true }).click();
    await page.getByRole('link', { name: second.summary.key + ' · ' + second.summary.title, exact: true }).click();
    const discussion = page.getByRole('region', { name: 'Issue discussion', exact: true }); await expect(discussion).toContainText('Only second private discussion');
    release(); await expect.poll(() => delivered).toBe(true);
    await expect(discussion).toContainText('Only second private discussion'); await expect(discussion).not.toContainText('Only first private discussion'); await expect(discussion.locator('.comment-record')).toHaveCount(1);
  });
});

test('failed editor module loading exposes an actionable error with the issue still usable', async ({ page, request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId, { description: 'Persisted description remains intact · وصف محفوظ' });
  let failedModule = false, moduleHeld = false, failedOriginalSource = '', failedModuleUrl = '';
  let releaseModule!: () => void;
  const moduleGate = new Promise<void>(resolve => { releaseModule = resolve; });
  const retainedTitle = 'Draft retained while the editor loads · مسودة';
  let issueWrites = 0, commentWrites = 0;
  const observeWrites = (outgoing: import('@playwright/test').Request) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(outgoing.method())) return;
    const path = new URL(outgoing.url()).pathname;
    if (path === '/api/v2/issues/' + issue.summary.id || path.startsWith('/api/v2/issues/' + issue.summary.id + '/')) issueWrites++;
    if (path === '/api/v1/issues/' + issue.summary.id + '/comments' || path.startsWith('/api/v1/comments/')) commentWrites++;
  };
  page.on('request', observeWrites);
  const coreEntry = /(?:^|\/)node_modules\/@tiptap\/core\/(?:dist\/index\.js|src\/(?:index|Editor)\.ts)$/;
  const sourceMapSchema = z.object({ sources: z.array(z.string()) });
  await page.route('**/*.js*', async route => {
    if (failedModule || moduleHeld || route.request().resourceType() !== 'script') { await route.continue(); return; }
    const response = await route.fetch();
    const code = await response.text();
    // Resolve the actual compiler-emitted module identity, not its hashed URL.
    // Shared lazy chunks are currently named chunk-*.js in Angular development.
    const marker = [...code.matchAll(/^\/\/ ([^\r\n]+)$/gm)].map(value => value[1]!).find(value => coreEntry.test(value));
    let original = marker;
    if (marker) {
      const reference = [...code.matchAll(/^\/\/[#@]\s*sourceMappingURL=(\S+)$/gm)].at(-1)?.[1];
      if (reference?.startsWith('data:application/json;base64,')) {
        const map: unknown = JSON.parse(Buffer.from(reference.slice('data:application/json;base64,'.length), 'base64').toString('utf8'));
        original = sourceMapSchema.parse(map).sources.find(value => coreEntry.test(value));
      } else if (reference && !reference.startsWith('data:')) {
        const mapUrl = new URL(reference, route.request().url());
        if (mapUrl.origin !== new URL(route.request().url()).origin) throw new Error('Editor source map must belong to the actual local build.');
        const mapResponse = await page.request.get(mapUrl.toString());
        if (!mapResponse.ok()) throw new Error('The actual editor source map is unavailable.');
        original = sourceMapSchema.parse(await mapResponse.json()).sources.find(value => coreEntry.test(value));
      }
    }
    if (!failedModule && original) {
      moduleHeld = true; failedOriginalSource = original; failedModuleUrl = route.request().url();
      await moduleGate;
      failedModule = true;
      await route.abort('failed');
    } else await route.fulfill({ response });
  });
  try {
    await webCase('UC-COM-0106', async () => {
    await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
    await expect.poll(() => moduleHeld).toBe(true);
    // Prove the surrounding issue-form title draft is retained. An unsaved
    // rich-text draft cannot be entered before its first lazy module has loaded.
    await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit ' + issue.summary.key, exact: true });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Issue title', { exact: true }).fill(retainedTitle);
    releaseModule();
    await expect.poll(() => failedModule).toBe(true);
    await expect(dialog.locator('gg-description-editor').getByRole('alert')).toContainText(/editor.*could not load|reload/i);
    await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue(retainedTitle);
    await expect(dialog.getByRole('button', { name: 'Save issue', exact: true })).toBeDisabled();
    const confirmation = page.waitForEvent('dialog');
    const closing = dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    const warning = await confirmation;
    expect(warning.type()).toBe('confirm');
    expect(warning.message()).toContain('Your unsaved draft stays in this tab');
    await warning.accept(); await closing; await expect(dialog).toHaveCount(0);
    expect(failedOriginalSource).toMatch(coreEntry);
    expect(new URL(failedModuleUrl).origin).toBe(new URL(page.url()).origin);
    await expect(page.locator('gg-comment-editor').getByRole('alert')).toContainText(/editor|reload|try/i);
    await expect(page.getByRole('heading', { name: new RegExp('^' + issue.summary.title + '$'), level: 1 })).toBeVisible();
    await expect(page.locator('gg-comment-editor').getByRole('button', { name: 'Post comment', exact: true })).toBeDisabled();
    await page.getByRole('link', { name: 'All issues', exact: true }).click();
    await page.getByRole('link', { name: issue.summary.key + ' · ' + issue.summary.title, exact: true }).click();
    await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
    await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue(retainedTitle);
    await expect(dialog.getByText(/Draft restored in this tab/)).toBeVisible();
    // The ordinary remount retries the failed import. Recovery must retain both
    // the unsent title and the original rich-editor content, without a write.
    await expect(dialog.getByRole('textbox', { name: 'Description', exact: true })).toHaveText(issue.description);
    await expect(dialog.getByRole('textbox', { name: 'Description', exact: true })).toBeEditable();
    await expect(dialog.locator('gg-description-editor').getByRole('alert')).toHaveCount(0);
    await expect(dialog.getByRole('button', { name: 'Save issue', exact: true })).toBeEnabled();
    const persisted = await coverageRead(request, issue.summary.id);
    expect(persisted.summary.title).toBe(issue.summary.title);
    expect(persisted.description).toBe(issue.description);
    expect(issueWrites).toBe(0); expect(commentWrites).toBe(0);
    const discussion = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders() });
    expect(discussion.status()).toBe(200); expect(zPageCommentView.parse(await discussion.json()).items).toEqual([]);
    });
  } finally {
    releaseModule();
    page.off('request', observeWrites);
    // Other lazy imports may already be fetching when the core module fails.
    // Drain those real route handlers before Playwright disposes this page.
    await page.unrouteAll({ behavior: 'wait' });
  }
});

for (const state of ['canceled', 'expired'] as const) test(`resuming a ${state} upload explains how to choose the file again`, async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const queue = page.locator('gg-issue-attachments').getByRole('group', { name: 'Attach pictures and files', exact: true }); let sessionId = '';
  await page.route('**/api/v1/asset-uploads/*/chunks', async route => { sessionId = route.request().url().split('/').at(-2) ?? ''; await route.abort('failed'); }, { times: 1 });
  await queue.getByLabel('Choose files', { exact: true }).setInputFiles({ name: state + '.txt', mimeType: 'text/plain', buffer: Buffer.from('resume state boundary') });
  await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click(); await expect(queue).toContainText('Upload failed'); expect(sessionId).not.toBe('');
  const response = await request.get(`${apiOrigin}/api/v1/asset-uploads/${sessionId}`, { headers: await coverageHeaders() }); expect(response.status()).toBe(200); const original = zUploadSessionView.parse(await response.json());
  if (state === 'expired') await coverageExpireUpload(projectId, original.assetId);
  else { const canceled = await request.post(`${apiOrigin}/api/v1/asset-uploads/${sessionId}/cancel`, { headers: await coverageHeaders() }); expect(canceled.status()).toBe(200); }
  await webCase('UC-AST-0070', async () => {
    await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click(); await expect(queue.getByRole('alert')).toContainText('This upload was canceled or expired. Choose the file again.'); await expect(queue).toContainText(state + '.txt');
    const list = await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders() }); expect(zPageAssetView.parse(await list.json()).items).toHaveLength(0);
  });
  if (state === 'expired') await restCase('UC-AST-0082', async () => { const current = await request.get(`${apiOrigin}/api/v1/asset-uploads/${sessionId}`, { headers: await coverageHeaders() }); expect(current.status()).toBe(200); expect(zUploadSessionView.parse(await current.json()).state).toBe('expired'); const append = await request.post(`${apiOrigin}/api/v1/asset-uploads/${sessionId}/chunks`, { headers: await coverageHeaders(), data: { offset: '0', dataBase64: Buffer.from('resume state boundary').toString('base64') } }); expect(append.status()).toBe(422); const finalize = await request.post(`${apiOrigin}/api/v1/asset-uploads/${sessionId}/finalize`, { headers: await coverageHeaders() }); expect(finalize.status()).toBe(422); expect(zPageAssetView.parse(await (await request.get(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders() })).json()).items).toEqual([]); });
});

test('foreign private draft references cannot publish through the comment editor', async ({ page, request }) => {
  const projectId = await coverageProject(request), sourceIssue = await coverageCreate(request, projectId), targetIssue = await coverageCreate(request, projectId);
  const uploaded = await request.post(`${apiOrigin}/api/v1/issues/${sourceIssue.summary.id}/assets`, { headers: await coverageHeaders(), data: { metadata: { kind: 'file', filename: 'foreign-private.txt', description: '', mimeType: 'text/plain', publication: 'draft' }, dataBase64: Buffer.from('private source issue').toString('base64') } }); expect(uploaded.status()).toBe(201); const asset = zSavedAssetView.parse(await uploaded.json()).result;
  await signIn(page, 'member', '/issues/' + targetIssue.summary.id, new RegExp('^' + targetIssue.summary.title + '$'));
  await webCase('UC-AST-0051', async () => {
    const editor = page.locator('gg-comment-editor'); await source(editor, 'Comment', `<p>Attempt private foreign publication <a data-attachment-id="${asset.id}" href="/issues/${sourceIssue.summary.id}?attachment=${asset.id}">foreign-private.txt</a></p>`);
    await editor.getByRole('button', { name: 'Post comment', exact: true }).click(); await expect(page.locator('gg-comment-thread').getByRole('alert')).toBeVisible(); await expect(editor.getByLabel('Comment HTML', { exact: true })).toHaveValue(/Attempt private foreign publication/);
    const deniedPublication = await request.post(`${apiOrigin}/api/v1/issues/${targetIssue.summary.id}/comments`, { headers: await coverageHeaders(), data: { body: { html: `<p>Attempt private foreign publication <a data-attachment-id="${asset.id}" href="/issues/${targetIssue.summary.id}?attachment=${asset.id}">foreign-private.txt</a></p>`, attachmentIds: [asset.id], pictureIds: [], mentionUserIds: [] } } }); expect(deniedPublication.status()).toBe(404);
    await expect(page.getByRole('region', { name: 'Issue discussion', exact: true }).locator('.comment-record')).toHaveCount(0);
    const original = await request.get(`${apiOrigin}/api/v1/assets/${asset.id}`, { headers: await coverageHeaders() }); expect(original.status()).toBe(200); expect(zAssetView.parse(await original.json()).state).toBe('draft');
    const denied = await request.get(`${apiOrigin}/api/v1/assets/${asset.id}`, { headers: await coverageHeaders('viewer') }); expect(denied.status()).toBe(404);
  });
});

test('comment attachment and picture clicks preview media without entering comment edit', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId), files: AssetView[] = [];
  for (const file of [
    { filename: 'interactive.txt', kind: 'file', mimeType: 'text/plain', description: '', dataBase64: Buffer.from('Interactive file').toString('base64') },
    { filename: 'interactive.png', kind: 'image', mimeType: 'image/png', description: 'Interactive picture', dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGN8tsWNgYGBiYGBgYGBAQAXSgHkeDr16gAAAABJRU5ErkJggg==' },
  ]) {
    const response = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders(), data: { metadata: { kind: file.kind, filename: file.filename, mimeType: file.mimeType, description: file.description, publication: 'issue' }, dataBase64: file.dataBase64 } }); expect(response.status()).toBe(201); files.push(zSavedAssetView.parse(await response.json()).result);
  }
  const [file, picture] = files; if (!file || !picture) throw new Error('Missing interactive media fixtures');
  const saved = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/comments`, { headers: await coverageHeaders(), data: { body: { html: `<p>Interactive media <a data-attachment-id="${file.id}" href="/issues/${issue.summary.id}?attachment=${file.id}">Interactive document</a> <img data-picture-id="${picture.id}" alt="Interactive picture"></p>`, attachmentIds: [file.id], pictureIds: [picture.id], mentionUserIds: [] } } }); expect(saved.status()).toBe(201);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const record = page.locator('gg-comment-thread .comment-record').first();
  await webCase('UC-COM-0080', async () => {
    await record.getByRole('button', { name: 'interactive.txt', exact: true }).click(); const preview = page.getByRole('dialog', { name: 'Attachment preview', exact: true }); await expect(preview.getByRole('heading', { name: 'interactive.txt', exact: true })).toBeVisible(); await expect(record.locator('gg-comment-editor')).toHaveCount(0); await preview.getByRole('button', { name: 'Close attachment preview', exact: true }).click();
    await record.getByRole('button', { name: 'Preview Interactive picture', exact: true }).click(); const picturePreview = record.locator('dialog[open]'); await expect(picturePreview.getByRole('img', { name: 'Interactive picture', exact: true })).toHaveJSProperty('naturalWidth', 2); await expect(record.locator('gg-comment-editor')).toHaveCount(0); await picturePreview.getByRole('button', { name: 'Close picture preview', exact: true }).click();
  });
  await webCase('UC-COM-0121', async () => { await expect(record.getByRole('button', { name: 'Edit comment', exact: true })).toBeVisible(); await expect(record.getByRole('button', { name: /delete comment|remove comment/i })).toHaveCount(0); await expect(record).toContainText('Interactive media'); });
  await webCase('UC-AST-0077', async () => { const panel = page.locator('gg-issue-attachments'); await expect(panel.getByRole('button', { name: 'Remove interactive.txt', exact: true })).toBeVisible(); await expect(panel.getByRole('button', { name: /permanent|delete/i })).toHaveCount(0); const unchanged = await request.get(`${apiOrigin}/api/v1/assets/${file.id}/chunk?offset=0&count=100`, { headers: await coverageHeaders() }); expect(unchanged.status()).toBe(200); expect(Buffer.from(zAssetChunk.parse(await unchanged.json()).dataBase64, 'base64').toString()).toBe('Interactive file'); });
});

test('closed private preview aborts its read and a late reply cannot enter the next SPA session', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId);
  const response = await request.post(`${apiOrigin}/api/v1/issues/${issue.summary.id}/assets`, { headers: await coverageHeaders(), data: { metadata: { kind: 'file', filename: 'previous-session-private.txt', description: '', mimeType: 'text/plain', publication: 'issue' }, dataBase64: Buffer.from('Previous session private content').toString('base64') } }); expect(response.status()).toBe(201); const asset = zSavedAssetView.parse(await response.json()).result;
  const removed = await request.post(`${apiOrigin}/api/v1/projects/${projectId}/memberships/10000000-0000-4000-8000-000000000003/remove`, { headers: await coverageHeaders('owner'), data: { expectedRevision: '1' } }); expect(removed.status()).toBe(200);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; }); let waiting = false, delivered = false, aborted = false;
  page.on('requestfailed', failed => { if (failed.url().includes('/assets/' + asset.id + '/chunk')) aborted = true; });
  await page.route('**/api/v1/assets/' + asset.id + '/chunk?*', async route => { const content = await route.fetch(); waiting = true; await held; await route.fulfill({ response: content }).catch(() => {}); delivered = true; });
  await webCase('UC-AST-0075', async () => {
    await page.locator('gg-issue-attachments').getByRole('button', { name: asset.filename, exact: true }).click(); const preview = page.getByRole('dialog', { name: 'Attachment preview', exact: true }); await expect(preview).toContainText('Loading private attachment'); await expect.poll(() => waiting).toBe(true);
    await preview.getByRole('button', { name: 'Close attachment preview', exact: true }).click(); await expect(preview).toHaveCount(0); await expect.poll(() => aborted).toBe(true);
    const marker = crypto.randomUUID(); await page.locator('html').evaluate((element, value) => element.setAttribute('data-session-fixture', value), marker);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await fillCredentials(page, 'viewer'); await page.getByRole('button', { name: 'Sign in locally', exact: true }).click(); await expect(page.getByRole('heading', { name: /Welcome,/, level: 1 })).toBeVisible(); await expect(page.locator('html')).toHaveAttribute('data-session-fixture', marker);
    release(); await expect.poll(() => delivered).toBe(true); await expect(preview).toHaveCount(0); await expect(page.locator('body')).not.toContainText(asset.filename); await expect(page.locator('a[download="previous-session-private.txt"]')).toHaveCount(0);
    const denied = await request.get(`${apiOrigin}/api/v1/assets/${asset.id}/chunk?offset=0&count=100`, { headers: await coverageHeaders('viewer') }); expect(denied.status()).toBe(404);
  });
});
