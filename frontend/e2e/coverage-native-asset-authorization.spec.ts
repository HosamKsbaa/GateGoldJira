import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { coverageProject, coverageCreate, coverageHeaders } from './support/coverage-issues';
import { gatePrivateTextRead } from './support/private-storage-gate';
import { zAssetChunk, zFailureBody, zPageMembershipView, zSavedAssetView, zSavedMembershipView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated local company and private object storage.');
test.use({ trace: 'off' });
test.setTimeout(60_000);

test('native download rechecks actual membership after a held private storage read', async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId);
  const bytes = Buffer.from('Private post-I/O authorization fixture · ' + crypto.randomUUID());
  const filename = 'owned-storage-authorization.txt';
  const memberId = '10000000-0000-4000-8000-000000000002';
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const panel = page.locator('gg-issue-attachments');
  const chooser = page.waitForEvent('filechooser');
  await panel.getByRole('button', { name: 'Add files', exact: true }).click();
  await (await chooser).setFiles({ name: filename, mimeType: 'text/plain', buffer: bytes });
  const finalized = page.waitForResponse(value => value.request().method() === 'POST' && /\/asset-uploads\/[0-9a-f-]+\/finalize$/.test(new URL(value.url()).pathname));
  await panel.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  const published = await finalized; expect(published.status()).toBe(201);
  const asset = zSavedAssetView.parse(await published.json()).result;
  await expect(panel.getByRole('article', { name: filename, exact: true })).toBeVisible();
  const directory = await request.get(`${apiOrigin}/api/v1/projects/${projectId}/memberships`, { headers: await coverageHeaders('owner') });
  expect(directory.status()).toBe(200);
  const membership = zPageMembershipView.parse(await directory.json()).items.find(value => value.user.id === memberId);
  expect(membership).toBeDefined();
  const storage = await gatePrivateTextRead({ projectId, issueId: issue.summary.id, assetId: asset.id, bytes });
  const downloads: string[] = [];
  page.on('download', value => downloads.push(value.suggestedFilename()));
  let removedRevision: string | undefined;
  let terminalResponse = false, primaryFailure = false;
  const responsePromise = page.waitForResponse(value => value.request().method() === 'GET' && new URL(value.url()).pathname === '/api/v1/assets/' + asset.id + '/chunk');
  void responsePromise.then(() => { terminalResponse = true; }, () => {});
  try {
    await useCase('UC-AST-0054', async () => {
      // Only the normal Download button triggers the real Go object-store read.
      // The kernel file lease holds Open until after the real membership removal.
      await panel.getByRole('button', { name: 'Download ' + filename, exact: true }).click();
      await storage.waitForReader();
      expect(storage.readerWaiting).toBe(true);
      expect(terminalResponse).toBe(false); expect(downloads).toEqual([]);
      const removed = await request.post(`${apiOrigin}/api/v1/projects/${projectId}/memberships/${memberId}/remove`, {
        headers: await coverageHeaders('owner'), data: { expectedRevision: membership!.revision },
      });
      expect(removed.status()).toBe(200);
      removedRevision = zSavedMembershipView.parse(await removed.json()).result.revision;
      expect(terminalResponse).toBe(false);
      await storage.release();
      const denied = await responsePromise; expect(denied.status()).toBe(404);
      const body: unknown = await denied.json();
      const failure = zFailureBody.parse(body);
      expect(failure.error.code).toBe('unavailable_record');
      expect(body).not.toHaveProperty('dataBase64');
      expect(JSON.stringify(body)).not.toContain(bytes.toString('base64'));
      await expect(panel.getByRole('alert')).toContainText(failure.error.message);
      expect(downloads).toEqual([]);
    }, 'web');
  } catch (error) { primaryFailure = true; throw error; }
  finally {
    try {
      try { await storage.restore(); }
      finally {
        if (removedRevision) {
          const restored = await request.put(`${apiOrigin}/api/v1/projects/${projectId}/memberships/${memberId}`, {
            headers: await coverageHeaders('owner'), data: { expectedRevision: removedRevision, role: membership!.role },
          });
          expect(restored.status()).toBe(200);
          expect(zSavedMembershipView.parse(await restored.json()).result.removed).toBe(false);
        }
      }
    } catch (cleanupError) {
      if (!primaryFailure) throw cleanupError;
      test.info().annotations.push({ type: 'cleanup-error', description: String(cleanupError).slice(0, 500) });
    }
  }
  // Verify cleanup through the real service, not merely the filesystem helper.
  const restored = await request.get(`${apiOrigin}/api/v1/assets/${asset.id}/chunk?offset=0&count=1048576`, { headers: await coverageHeaders('owner') });
  expect(restored.status()).toBe(200);
  expect(Buffer.from(zAssetChunk.parse(await restored.json()).dataBase64, 'base64')).toEqual(bytes);
});
