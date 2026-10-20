import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { coverageGet, coverageIssue, coverageProject, coverageReadIssue } from './support/coverage-boards';
import { zPageLabelView, zSavedLabelView, zSavedModernIssueView } from '../src/app/api/generated/zod.gen';
import type { SavedLabelView } from '../src/app/api/generated/types.gen';

test.skip(!localFixturesAvailable, 'Requires isolated real Go/PostgreSQL fixtures.');
test.use({ trace: 'off' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('an accepted label acknowledgement preserves the next unsent label name', async ({ page, request }) => {
  const projectId = await coverageProject(request);
  const issue = await coverageIssue(request, projectId, { title: 'Owned label acknowledgement draft' });
  await signIn(page, 'member', '/issues/' + issue.summary.id, /^Owned label acknowledgement draft$/);
  await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit ' + issue.summary.key, exact: true });
  const fields = dialog.locator('gg-date-label-fields');
  const name = fields.getByLabel('New label name', { exact: true });
  const create = fields.getByRole('button', { name: 'Create and select label', exact: true });
  const labelPath = `/api/v1/projects/${projectId}/labels`;
  const submittedName = 'First accepted label';
  const nextName = 'Next unsent label';
  const accepted = deferred<{ status: number; body: SavedLabelView }>();
  const acknowledgement = deferred<void>();
  let heldFirstResponse = false;

  await page.route('**' + labelPath, async route => {
    if (route.request().method() !== 'POST' || heldFirstResponse) {
      await route.continue();
      return;
    }
    heldFirstResponse = true;
    try {
      // Go genuinely commits the command. Only delivery of its actual response
      // is delayed, so neither a fabricated receipt nor a mocked write can pass.
      const response = await route.fetch();
      const body = zSavedLabelView.parse(await response.json());
      accepted.resolve({ status: response.status(), body });
      await acknowledgement.promise;
      await route.fulfill({ response });
    } catch (error: unknown) {
      accepted.reject(error);
      throw error;
    }
  });

  try {
    await useCase('UC-LBL-0029', async () => {
      await name.fill(submittedName);
      await expect(create).toBeEnabled();
      await create.click();
      const first = await accepted.promise;
      expect(first.status).toBe(201);
      expect(first.body.result).toMatchObject({ projectId, name: submittedName });
      await expect(create).toBeDisabled();
      await expect(name).toBeEnabled();
      await name.fill(nextName);
      await expect(name).toHaveValue(nextName);

      acknowledgement.resolve();
      await expect(fields.getByRole('button', { name: 'Remove ' + submittedName, exact: true })).toBeVisible();
      await expect(create).toBeEnabled();
      await expect(name).toHaveValue(nextName);
      const firstLookup = await coverageGet(request, labelPath + '?query=' + encodeURIComponent(submittedName), zPageLabelView, 'member');
      expect(firstLookup.items.map(label => ({ id: label.id, name: label.name }))).toEqual([{ id: first.body.result.id, name: submittedName }]);

      // A subsequent empty lookup must retain the selected friendly name. This
      // observes the cache/selection contract through the actual picker.
      const query = 'unmatched-' + crypto.randomUUID().slice(0, 8);
      const searched = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === labelPath && new URL(response.url()).searchParams.get('query') === query);
      await fields.getByRole('combobox', { name: 'Labels', exact: true }).fill(query);
      const searchResponse = await searched;
      expect(searchResponse.status()).toBe(200);
      expect(zPageLabelView.parse(await searchResponse.json()).items).toEqual([]);
      await expect(fields.getByRole('button', { name: 'Remove ' + submittedName, exact: true })).toBeVisible();
      await fields.getByRole('button', { name: 'Done choosing', exact: true }).click();
      await expect(name).toHaveValue(nextName);

      // Positive control: submitting that unchanged next name clears it only
      // after the real second acknowledgement, while preserving both selections.
      const secondResponse = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === labelPath);
      await expect(create).toBeEnabled();
      await create.click();
      const response = await secondResponse;
      expect(response.status()).toBe(201);
      const second = zSavedLabelView.parse(await response.json()).result;
      expect(second).toMatchObject({ projectId, name: nextName });
      expect(second.id).not.toBe(first.body.result.id);
      await expect(name).toHaveValue('');
      await expect(fields.getByRole('button', { name: 'Remove ' + submittedName, exact: true })).toBeVisible();
      await expect(fields.getByRole('button', { name: 'Remove ' + nextName, exact: true })).toBeVisible();
      await expect(fields).toContainText('2 / 10 labels selected');

      const savedIssue = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === `/api/v2/issues/${issue.summary.id}`);
      const save = dialog.getByRole('button', { name: 'Save issue', exact: true });
      await expect(save).toBeEnabled();
      await save.click();
      const issueResponse = await savedIssue;
      expect(issueResponse.status()).toBe(200);
      const updated = zSavedModernIssueView.parse(await issueResponse.json()).result;
      expect(new Set(updated.summary.labels.map(label => label.id))).toEqual(new Set([first.body.result.id, second.id]));
      await expect(dialog).toHaveCount(0);
      const persisted = await coverageReadIssue(request, issue.summary.id);
      expect(new Set(persisted.summary.labels.map(label => label.id))).toEqual(new Set([first.body.result.id, second.id]));
    }, 'web');
  } finally {
    acknowledgement.resolve();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
