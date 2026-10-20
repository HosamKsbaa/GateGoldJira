import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { coverageProject, coverageCreate, coverageComment, coverageHeaders } from './support/coverage-issues';
import { zPageCommentView, zPageCommentVersionView, zSavedCommentView, zSavedAssetView, zPageMembershipView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated real company and native comment editor.');
test.use({ trace: 'off' });
test.setTimeout(120_000);
const webCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGN8tsWNgYGBiYGBgYGBAQAXSgHkeDr16gAAAABJRU5ErkJggg==', 'base64');
async function comments(request: APIRequestContext, issueId: string) {
  const response = await request.get(`${apiOrigin}/api/v1/issues/${issueId}/comments`, { headers: await coverageHeaders() }); expect(response.status()).toBe(200); return zPageCommentView.parse(await response.json());
}

for (const mode of ['post', 'edit'] as const) test('native accepted comment ' + mode + ' retries its original intention after a lost acknowledgement', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId), original = mode === 'edit' ? await coverageComment(request, issue.summary.id, '<p>Original revision before lost reply</p>') : null;
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  if (original) await page.locator('#comment-' + original.id).getByRole('button', { name: 'Edit comment', exact: true }).click();
  // Wait for the owned inline editor rather than filling the outgoing composer
  // while Angular switches from Add a comment to Edit comment.
  const editor = original
    ? page.locator('#comment-' + original.id).locator('gg-comment-editor')
    : page.locator('.comment-compose gg-comment-editor');
  const visual = editor.getByRole('textbox', { name: 'Comment text', exact: true }), text = 'Retained original comment intention · ' + mode;
  if (original) {
    await expect(visual).toHaveText('Original revision before lost reply');
    // Tiptap requests focus on its next frame when the inline editor opens.
    // Wait for that public readiness state before replacing the selection.
    await expect(visual).toBeFocused();
  }
  await visual.fill(text); await expect(visual).toHaveText(text);
  const sent: { reference: string | undefined; body: unknown; replayed: boolean; revision: string }[] = [];
  const url = original ? '**/api/v1/comments/' + original.id : '**/api/v1/issues/' + issue.summary.id + '/comments';
  await page.route(url, async route => {
    if (route.request().method() !== (original ? 'PUT' : 'POST')) { await route.continue(); return; }
    const response = await route.fetch(); expect(response.status()).toBe(original ? 200 : 201); const saved = zSavedCommentView.parse(await response.json());
    sent.push({ reference: route.request().headers()['idempotency-key'], body: route.request().postDataJSON(), replayed: saved.receipt.replayed, revision: saved.result.revision });
    if (sent.length === 1) await route.abort('failed'); else await route.fulfill({ response });
  });
  await webCase(original ? 'UC-COM-0091' : 'UC-COM-0090', async () => {
    const button = editor.getByRole('button', { name: original ? 'Save comment changes' : 'Post comment', exact: true });
    await button.click(); await expect(page.locator('gg-comment-thread').getByRole('alert')).toBeVisible(); await expect(visual).toHaveText(text); expect(sent).toHaveLength(1); expect(sent[0]?.body).toMatchObject({ ...(original ? { expectedRevision: original.revision } : {}), body: { html: expect.stringContaining(text) } });
    const acknowledgement = page.waitForResponse(value => value.request().method() === (original ? 'PUT' : 'POST') && value.url().endsWith(original ? '/api/v1/comments/' + original.id : '/api/v1/issues/' + issue.summary.id + '/comments'));
    await button.click(); const confirmed = await acknowledgement; expect(confirmed.status()).toBe(original ? 200 : 201); expect(zSavedCommentView.parse(await confirmed.json()).receipt.replayed).toBe(true);
    const published = page.getByRole('region', { name: 'Issue discussion', exact: true }).locator('.comment-record'); await expect(published).toHaveCount(1); await expect(published.locator('.editable-comment')).toContainText(text); await expect(published.locator('gg-comment-editor')).toHaveCount(0); expect(sent).toHaveLength(2); expect(sent[0]?.reference).toMatch(/^[0-9a-f-]{36}$/); expect(sent[1]?.reference).toBe(sent[0]?.reference); expect(sent[1]?.body).toEqual(sent[0]?.body); expect(sent.map(value => value.replayed)).toEqual([false,true]);
    const stored = await comments(request, issue.summary.id); expect(stored.items).toHaveLength(1); expect(stored.items[0]?.revision).toBe(original ? '2' : '1');
    const versions = await request.get(`${apiOrigin}/api/v1/comments/${stored.items[0]!.id}/versions`, { headers: await coverageHeaders() }); expect(versions.status()).toBe(200); expect(zPageCommentVersionView.parse(await versions.json()).items).toHaveLength(original ? 2 : 1);
  });
});

test('native comment authorship controls omit edits for other authors, including administrators', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId), original = await coverageComment(request, issue.summary.id, '<p>Member-owned retained content</p>');
  await signIn(page, 'owner', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  await webCase('UC-COM-0137', async () => { const record = page.locator('#comment-' + original.id); await expect(record).toContainText('Member-owned retained content'); await expect(record.getByRole('button', { name: 'Edit comment', exact: true })).toHaveCount(0); await record.locator('.editable-comment').click(); await expect(record.locator('gg-comment-editor')).toHaveCount(0); await expect(record.getByRole('button', { name: 'Comment history', exact: true })).toBeVisible(); expect((await comments(request, issue.summary.id)).items[0]?.safeHtml).toBe(original.safeHtml); });
});

test('native six-picture source preserves its draft and cannot publish over the inline image limit', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const editor = page.locator('gg-comment-editor'); await editor.getByRole('textbox', { name: 'Comment text', exact: true }).fill('Picture limit native acceptance');
  const chooser = page.waitForEvent('filechooser'); await editor.getByRole('button', { name: 'Attach files or pictures', exact: true }).click(); await (await chooser).setFiles({ name: 'native-limit.png', mimeType: 'image/png', buffer: png });
  const finalized = page.waitForResponse(value => value.request().method() === 'POST' && /\/asset-uploads\/[0-9a-f-]+\/finalize$/.test(new URL(value.url()).pathname)); await editor.getByRole('button', { name: 'Upload queued files', exact: true }).click(); const response = await finalized; expect(response.status()).toBe(201); const picture = zSavedAssetView.parse(await response.json()).result;
  await expect(editor.locator('.editor-picture')).toHaveCount(1); await editor.getByRole('button', { name: 'HTML source', exact: true }).click(); const source = '<p>Six inline images ' + Array.from({length:6}, () => `<img data-picture-id="${picture.id}" alt="Native image">`).join('') + '</p>'; await editor.getByLabel('Comment HTML', { exact: true }).fill(source);
  let writes = 0; page.on('request', value => { if (value.method() === 'POST' && value.url().endsWith('/comments')) writes++; });
  await webCase('UC-COM-0101', async () => { await editor.getByRole('button', { name: 'Post comment', exact: true }).click(); await expect(editor.getByRole('alert')).toContainText('Shorten the comment'); await expect(editor.getByLabel('Comment HTML', { exact: true })).toHaveValue(source); expect(writes).toBe(0); expect((await comments(request, issue.summary.id)).items).toEqual([]); });
});

test('native twenty-one distinct file references cannot publish and retain their selected draft', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const editor = page.locator('.comment-compose gg-comment-editor'), visual = editor.getByRole('textbox', { name: 'Comment text', exact: true }); await visual.fill('Twenty-one selected native references'); await expect(visual).toHaveText('Twenty-one selected native references');
  const chooser = page.waitForEvent('filechooser'); await editor.getByRole('button', { name: 'Attach files or pictures', exact: true }).click(); await (await chooser).setFiles(Array.from({length:20}, (_,index) => ({ name: 'native-reference-' + String(index).padStart(2,'0') + '.txt', mimeType: 'text/plain', buffer: Buffer.from('Reference ' + index) })));
  const queue = editor.getByRole('group', { name: 'Attach pictures and files', exact: true }); await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  // The queue uploads real sessions sequentially. Dismiss becomes available only
  // after the entire queue completes; attachment-count assertions follow that
  // observable prerequisite rather than imposing a five-second batch budget.
  await queue.getByRole('button', { name: 'Dismiss uploaded files', exact: true }).click();
  await expect(queue.getByRole('listitem')).toHaveCount(0); await expect(visual.locator('[data-attachment-id]')).toHaveCount(20);
  const more = page.waitForEvent('filechooser'); await queue.locator('button.choose-button').click(); await (await more).setFiles({ name: 'native-reference-20.txt', mimeType: 'text/plain', buffer: Buffer.from('Reference 20') }); await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click(); await expect(visual.locator('[data-attachment-id]')).toHaveCount(21);
  let writes = 0; page.on('request', value => { if (value.method() === 'POST' && value.url().endsWith('/comments')) writes++; });
  await webCase('UC-COM-0102', async () => { await editor.getByRole('button', { name: 'Post comment', exact: true }).click(); await expect(editor.getByRole('alert')).toContainText('Use at most 20 files'); await expect(visual.locator('[data-attachment-id]')).toHaveCount(21); await expect(visual).toContainText('native-reference-20.txt'); expect(writes).toBe(0); expect((await comments(request, issue.summary.id)).items).toEqual([]); });
});

test('native table formatting displays actual server sanitation notices with the safe accepted content', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const editor = page.locator('gg-comment-editor'); await editor.getByRole('textbox', { name: 'Comment text', exact: true }).fill('Sanitized native table'); await editor.getByLabel('Comment table options', { exact: true }).click(); await editor.getByRole('group', { name: 'Comment table controls', exact: true }).getByRole('button', { name: 'Insert table', exact: true }).click();
  await webCase('UC-COM-0105', async () => { const pending = page.waitForResponse(value => value.request().method() === 'POST' && value.url().endsWith('/comments')); await editor.getByRole('button', { name: 'Post comment', exact: true }).click(); const reply = await pending; expect(reply.status()).toBe(201); const accepted = zSavedCommentView.parse(await reply.json()).result; expect(accepted.sanitationNotices).toContain('Unsupported formatting, attributes or unsafe content were removed.'); expect(accepted.safeHtml).toContain('<table>'); expect(accepted.safeHtml).not.toMatch(/<colgroup|style=|class=/); await expect(page.locator('gg-comment-thread').getByRole('status').filter({ hasText: 'Unsupported formatting, attributes or unsafe content were removed.' })).toBeVisible(); await expect(page.getByRole('region', { name: 'Issue discussion', exact: true }).locator('table')).toBeVisible(); });
});

async function mentionCount(issueId: string) {
  const database = process.env['GATEGOLD_E2E_DATABASE_NAME']; if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database) || !/^[0-9a-f-]{36}$/.test(issueId)) throw new Error('Read-only notification evidence requires an isolated issue and disposable database.');
  const { execFile } = await import('node:child_process'), { promisify } = await import('node:util'), { resolve } = await import('node:path'); const result = await promisify(execFile)('docker', ['compose','-f',resolve('../compose.dev.yaml'),'exec','-T','postgres','psql','--username=gategoldjira','--dbname='+database,'-v','ON_ERROR_STOP=1','-At','-c',`SELECT count(*) FROM notifications WHERE issue_id='${issueId}' AND recipient_id='10000000-0000-4000-8000-000000000003' AND 'mention'=ANY(reasons);`]); return Number(result.stdout.trim());
}

test('native editing retains a historical mention label after project membership is removed without another notification', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId);
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const editor = page.locator('gg-comment-editor'); await editor.getByRole('textbox', { name: 'Comment text', exact: true }).fill('Historical native mention '); await editor.getByRole('button', { name: 'Mention a teammate', exact: true }).click(); await editor.getByRole('combobox', { name: 'Find a teammate', exact: true }).fill('Local Viewer'); await editor.getByRole('option', { name: 'Local Viewer', exact: true }).click();
  await editor.getByRole('button', { name: 'Post comment', exact: true }).click(); await expect(page.getByRole('region', { name: 'Issue discussion', exact: true })).toContainText('Local Viewer'); const initial = (await comments(request, issue.summary.id)).items[0]!; const before = await mentionCount(issue.summary.id); expect(before).toBe(1);
  const memberships = await request.get(`${apiOrigin}/api/v1/projects/${projectId}/memberships`, { headers: await coverageHeaders('owner') }); expect(memberships.status()).toBe(200); const member = zPageMembershipView.parse(await memberships.json()).items.find(value => value.user.id === '10000000-0000-4000-8000-000000000003')!;
  const removed = await request.post(`${apiOrigin}/api/v1/projects/${projectId}/memberships/${member.user.id}/remove`, { headers: await coverageHeaders('owner'), data: { expectedRevision: member.revision } }); expect(removed.status()).toBe(200);
  await webCase('UC-COM-0115', async () => { const record = page.locator('#comment-' + initial.id); await record.getByRole('button', { name: 'Edit comment', exact: true }).click(); await expect(record.locator('[data-user-id="' + member.user.id + '"]')).toHaveText('Local Viewer'); const current = record.locator('gg-comment-editor'); await current.getByRole('button', { name: 'HTML source', exact: true }).click(); await current.getByLabel('Comment HTML', { exact: true }).fill(`<p>Edited historical context <span data-user-id="${member.user.id}">Forged replacement label</span></p>`); await current.getByRole('button', { name: 'Save comment changes', exact: true }).click(); await expect(record).toContainText('Edited historical context'); await expect(record).toContainText('Local Viewer'); await expect(record).not.toContainText('Forged replacement label'); const accepted = (await comments(request, issue.summary.id)).items[0]!; expect(accepted.mentions).toEqual(initial.mentions); expect(accepted.mentions[0]?.displayLabel).toBe('Local Viewer'); expect(await mentionCount(issue.summary.id)).toBe(before); });
});
