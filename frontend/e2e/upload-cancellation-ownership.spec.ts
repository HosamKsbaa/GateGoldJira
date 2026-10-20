import { expect, type APIRequestContext, type Page, type Request } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, fillCredentials, localFixturesAvailable, signIn } from './support/session';
import { coverageCreate, coverageHeaders, coverageProject } from './support/coverage-issues';
import { zPageAssetView, zSavedUploadSessionView, zUploadSessionView } from '../src/app/api/generated/zod.gen';
import type { ModernIssueView } from '../src/app/api/generated/types.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated local Go/PostgreSQL company and real SPA identities.');

function gate() {
  let resolve!: () => void;
  return { promise: new Promise<void>(done => { resolve = done; }), resolve: () => resolve() };
}
async function readSession(request: APIRequestContext, sessionId: string, account = 'member') {
  const response = await request.get(`${apiOrigin}/api/v1/asset-uploads/${sessionId}`, { headers: await coverageHeaders(account) });
  expect(response.status()).toBe(200);
  return zUploadSessionView.parse(await response.json());
}
async function noPublishedAssets(request: APIRequestContext, issueId: string) {
  const response = await request.get(`${apiOrigin}/api/v1/issues/${issueId}/assets`, { headers: await coverageHeaders('owner') });
  expect(response.status()).toBe(200);
  expect(zPageAssetView.parse(await response.json()).items).toEqual([]);
}
async function openIssueFromSearch(page: Page, issue: ModernIssueView) {
  const search = page.getByRole('combobox', { name: 'Search all issues', exact: true });
  await search.fill(issue.summary.key);
  const matches = page.getByRole('listbox', { name: 'Matching issues', exact: true });
  await expect(matches.getByRole('option')).toHaveCount(1);
  await expect(matches).toContainText(issue.summary.key);
  await search.press('ArrowDown');
  await search.press('Enter');
  await expect(page.getByRole('heading', { name: issue.summary.title, exact: true })).toBeVisible();
}

test('an accepted upload cancellation cannot restore an unmounted previous account queue after its delayed acknowledgement', async ({ page, request }) => {
  await useCase('UC-AST-0087', async () => {
  const projectId = await coverageProject(request);
  const issue = await coverageCreate(request, projectId, { title: 'Cancel ownership ' + crypto.randomUUID().slice(0, 8) });
  const nonce = crypto.randomUUID().slice(0, 8);
  const privateFirst = `previous-account-canceled-${nonce}.txt`, privateSecond = `previous-account-retained-${nonce}.txt`;
  const ownerFirst = `current-owner-canceled-${nonce}.txt`, ownerSecond = `current-owner-retained-${nonce}.txt`;
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await page.locator('html').evaluate((element, value) => element.setAttribute('data-cancel-ownership', value), nonce);
  const panel = page.locator('gg-issue-attachments');
  const queue = panel.getByRole('group', { name: 'Attach pictures and files', exact: true });
  const selected = queue.getByLabel('Choose files', { exact: true });
  const commands: string[] = [];
  const observe = (outgoing: Request) => {
    const path = new URL(outgoing.url()).pathname;
    if (outgoing.method() === 'POST' && path.includes('/asset-uploads')) commands.push(path);
  };
  page.on('request', observe);
  const cancelAccepted = gate(), releaseCancel = gate(), cancelFinished = gate();
  let firstSession = '', ownerSession = '', acceptedSession = '', cancelCount = 0;
  let interceptFirstCancel = true;
  // A real start command has already created the resumable session. Losing its
  // first chunk request leaves that session and its stable queue entry intact.
  await page.route('**/api/v1/asset-uploads/*/chunks', async route => {
    const sessionId = new URL(route.request().url()).pathname.split('/').at(-2)!;
    if (!firstSession) firstSession = sessionId;
    else if (sessionId !== firstSession) ownerSession = sessionId;
    await route.abort('failed');
  });
  await page.route('**/api/v1/asset-uploads/*/cancel', async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    const result = zSavedUploadSessionView.parse(await response.json()).result;
    expect(result.state).toBe('canceled');
    cancelCount++;
    if (interceptFirstCancel) {
      interceptFirstCancel = false;
      acceptedSession = result.sessionId;
      cancelAccepted.resolve();
      try { await releaseCancel.promise; await route.fulfill({ response }); }
      finally { cancelFinished.resolve(); }
    } else await route.fulfill({ response });
  });
  try {
    await test.step('retain two private queued files and hold a genuine accepted cancellation', async () => {
      await selected.setInputFiles({ name: privateFirst, mimeType: 'text/plain', buffer: Buffer.from('Private previous-account resumable bytes') });
      await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click();
      const failedRow = queue.locator('.queue-items > li').filter({ hasText: privateFirst });
      await expect(failedRow).toContainText('Upload failed');
      await expect(failedRow.getByRole('alert')).toBeVisible();
      await expect.poll(() => firstSession).toMatch(/^[0-9a-f-]{36}$/);
      expect(await readSession(request, firstSession)).toMatchObject({ sessionId: firstSession, issueId: issue.summary.id, receivedBytes: '0', state: 'uploading' });
      await selected.setInputFiles({ name: privateSecond, mimeType: 'text/plain', buffer: Buffer.from('Private remaining queued file') });
      await expect(queue.locator('.queue-items > li')).toHaveCount(2);
      await expect(queue.locator('.queue-items > li').filter({ hasText: privateSecond })).toContainText('Ready to upload');
      await queue.getByRole('button', { name: 'Cancel upload for ' + privateFirst, exact: true }).click();
      await cancelAccepted.promise;
      expect(acceptedSession).toBe(firstSession);
      expect((await readSession(request, firstSession)).state).toBe('canceled');
      await expect(queue.locator('.queue-items > li')).toHaveCount(2);
      await noPublishedAssets(request, issue.summary.id);
    });

    await test.step('unmount the queue, replace the account in the same SPA, then release the old response', async () => {
      const confirmation = page.waitForEvent('dialog');
      const leaving = page.getByRole('link', { name: 'All issues', exact: true }).click();
      const dialog = await confirmation;
      expect(dialog.type()).toBe('confirm');
      expect(dialog.message()).toContain('Your unsaved draft stays in this tab');
      await dialog.accept(); await leaving;
      await expect(page.getByRole('heading', { name: 'Issues', exact: true })).toBeVisible();
      await expect(page.locator('gg-file-queue')).toHaveCount(0);
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
      await fillCredentials(page, 'owner');
      await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Welcome, Local Owner', exact: true })).toBeVisible();
      const before = commands.length;
      const received = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/asset-uploads/${firstSession}/cancel`);
      releaseCancel.resolve();
      const response = await received;
      expect(response.status()).toBe(200);
      expect(zSavedUploadSessionView.parse(await response.json()).result.state).toBe('canceled');
      await cancelFinished.promise;
      await openIssueFromSearch(page, issue);
      await expect(selected).toBeEnabled();
      await expect(panel.getByRole('button', { name: 'Refresh attachments', exact: true })).toBeEnabled();
      await expect(queue.locator('.queue-items > li')).toHaveCount(0);
      await expect(queue).not.toContainText(privateFirst);
      await expect(queue).not.toContainText(privateSecond);
      await expect(queue.getByRole('alert')).toHaveCount(0);
      expect(commands).toHaveLength(before);
      expect(cancelCount).toBe(1);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
      await expect(page.locator('html')).toHaveAttribute('data-cancel-ownership', nonce);
      await noPublishedAssets(request, issue.summary.id);
    });

    await test.step('the current owner can cancel their own session while retaining only their own second queued file', async () => {
      await selected.setInputFiles({ name: ownerFirst, mimeType: 'text/plain', buffer: Buffer.from('Current owner resumable bytes') });
      await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click();
      await expect(queue.locator('.queue-items > li').filter({ hasText: ownerFirst })).toContainText('Upload failed');
      await expect.poll(() => ownerSession).toMatch(/^[0-9a-f-]{36}$/);
      expect(ownerSession).not.toBe(firstSession);
      await selected.setInputFiles({ name: ownerSecond, mimeType: 'text/plain', buffer: Buffer.from('Current owner remaining queued file') });
      const canceled = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/asset-uploads/${ownerSession}/cancel`);
      await queue.getByRole('button', { name: 'Cancel upload for ' + ownerFirst, exact: true }).click();
      expect((await canceled).status()).toBe(200);
      await expect(queue.locator('.queue-items > li')).toHaveCount(1);
      await expect(queue.locator('.queue-items > li')).toContainText(ownerSecond);
      await expect(queue).not.toContainText(ownerFirst);
      expect((await readSession(request, ownerSession, 'owner')).state).toBe('canceled');
      expect(cancelCount).toBe(2);
      await queue.getByRole('button', { name: 'Remove queued ' + ownerSecond, exact: true }).click();
      await expect(queue.locator('.queue-items > li')).toHaveCount(0);
      const unexpected: string[] = [];
      const rejectDirtyPrompt = async (dialog: import('@playwright/test').Dialog) => { unexpected.push(dialog.message()); await dialog.dismiss(); };
      page.on('dialog', rejectDirtyPrompt);
      try {
        await page.getByRole('link', { name: 'All issues', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Issues', exact: true })).toBeVisible();
        expect(unexpected).toEqual([]);
      } finally { page.off('dialog', rejectDirtyPrompt); }
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
      await noPublishedAssets(request, issue.summary.id);
    });
  } finally {
    releaseCancel.resolve();
    page.off('request', observe);
    await page.unrouteAll({ behavior: 'wait' });
  }
  }, 'web');
});
