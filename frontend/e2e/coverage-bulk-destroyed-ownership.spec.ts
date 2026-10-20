import { expect, type Dialog } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { coverageCreate, coverageHeaders, coverageProject, coverageRead } from './support/coverage-issues';
import { zModernPatchFields, zPagePriorityView, zSavedModernIssueView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated real Go/PostgreSQL company.');

test('native accepted bulk reply after leaving releases dirty ownership and restores the exact retry', async ({ page, request }) => {
  const projectId = await coverageProject(request), one = await coverageCreate(request, projectId), two = await coverageCreate(request, projectId);
  const priorities = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/priorities`, { headers: await coverageHeaders() });
  expect(priorities.status()).toBe(200);
  const target = zPagePriorityView.parse(await priorities.json()).items.find(value => value.key === 'low');
  expect(target).toBeDefined(); if (!target) throw new Error('The owned project requires its default low priority.');
  const selected = [one, two];
  await signIn(page, 'member', '/issues?projectId=' + projectId, /^Issues$/);
  for (const value of selected) await page.getByRole('checkbox', { name: 'Select issue ' + value.summary.key, exact: true }).check();
  await page.getByRole('combobox', { name: 'Bulk priority', exact: true }).selectOption(target.id);
  const attempts: { id: string; reference: string; body: ReturnType<typeof zModernPatchFields.parse> }[] = [];
  let release!: () => void, complete!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }), completed = new Promise<void>(resolve => { complete = resolve; });
  let accepted = false, firstAcknowledgementHeld = true;
  const ownedFields = new RegExp(`/api/v2/issues/(${one.summary.id}|${two.summary.id})/fields$`);
  await page.route(ownedFields, async route => {
    if (route.request().method() !== 'PATCH') { await route.continue(); return; }
    const id = new URL(route.request().url()).pathname.split('/')[4];
    expect(id).toBeDefined(); if (!id) throw new Error('Expected the issue identity in its published field route.');
    const reference = route.request().headers()['idempotency-key'];
    expect(reference).toMatch(/^[0-9a-f-]{36}$/); if (!reference) throw new Error('Every bulk save needs a retry reference.');
    attempts.push({ id, reference, body: zModernPatchFields.parse(route.request().postDataJSON()) });
    const response = await route.fetch(); expect(response.status()).toBe(200);
    const saved = zSavedModernIssueView.parse(await response.json()); expect(saved.result.summary.priority.id).toBe(target.id);
    if (firstAcknowledgementHeld) {
      firstAcknowledgementHeld = false; accepted = true;
      try { await gate; await route.fulfill({ response }); } finally { complete(); }
    } else await route.fulfill({ response });
  });
  const dialogs: { message: string; expected: boolean }[] = [];
  let expectLeaveConfirmation = true;
  const onDialog = async (dialog: Dialog) => {
    dialogs.push({ message: dialog.message(), expected: expectLeaveConfirmation });
    if (expectLeaveConfirmation) { expectLeaveConfirmation = false; await dialog.accept(); }
    else await dialog.dismiss();
  };
  page.on('dialog', onDialog);
  try {
    await page.getByRole('button', { name: 'Apply to selected', exact: true }).click();
    await expect.poll(() => accepted).toBe(true);
    expect(attempts).toHaveLength(1);
    await useCase('UC-SHL-0070', async () => {
      await page.getByRole('link', { name: 'Project overview', exact: true }).click();
      await expect(page).toHaveURL(new RegExp('/projects/' + projectId + '$'));
      await expect(page.getByRole('heading', { level: 1, name: /^Isolated workflow/ })).toBeVisible();
      expect(dialogs).toEqual([{ message: 'Leave this editor? Your unsaved draft stays in this tab until you sign out or reload.', expected: true }]);
    }, 'web');
    await page.getByRole('link', { name: 'Backlog', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Backlog', exact: true, level: 1 })).toBeVisible();
    await useCase('UC-SHL-0091', async () => {
      const acknowledgement = page.waitForResponse(value => value.request().method() === 'PATCH' && value.url().endsWith('/issues/' + attempts[0]!.id + '/fields'));
      release(); await completed; await (await acknowledgement).finished();
      const stored = await Promise.all(selected.map(value => coverageRead(request, value.summary.id)));
      expect(stored.filter(value => value.summary.priority.id === target.id)).toHaveLength(1);
      expect(stored.filter(value => value.summary.revision === '1')).toHaveLength(1);
      expect(attempts).toHaveLength(1);
      await page.getByRole('navigation', { name: 'Project views', exact: true }).getByRole('link', { name: 'Issues', exact: true }).click();
      await expect(page).toHaveURL(new RegExp('/issues\\?projectId=' + projectId + '$'));
      await expect(page.getByRole('heading', { name: 'Issues', exact: true, level: 1 })).toBeVisible();
      expect(dialogs.filter(value => !value.expected)).toEqual([]);
    }, 'web');
    await useCase('UC-SHL-0072', async () => {
      await expect(page.getByRole('region', { name: 'Bulk issue actions', exact: true })).toContainText('2 selected');
      for (const value of selected) await expect(page.getByRole('checkbox', { name: 'Select issue ' + value.summary.key, exact: true })).toBeChecked();
      await expect(page.getByRole('combobox', { name: 'Bulk priority', exact: true })).toHaveValue(target.id);
      await expect(page.getByRole('button', { name: 'Retry original bulk action', exact: true })).toBeVisible();
    }, 'web');
    await useCase('UC-ISS-0165', async () => {
      await page.getByRole('button', { name: 'Retry original bulk action', exact: true }).click();
      await expect(page.getByText('2 issue(s) saved; 0 need attention.', { exact: true })).toBeVisible();
      expect(attempts).toHaveLength(3); expect(attempts[1]).toEqual(attempts[0]); expect(attempts[2]?.id).not.toBe(attempts[0]?.id); expect(attempts[2]?.reference).not.toBe(attempts[0]?.reference);
      expect(attempts[0]?.body).toEqual({ field: 'priorityId', priority: { prior: one.summary.priority.id, value: target.id } });
      for (const value of selected) { const current = await coverageRead(request, value.summary.id); expect(current.summary.priority.id).toBe(target.id); expect(current.summary.revision).toBe('2'); }
      for (const value of selected) await expect(page.getByRole('checkbox', { name: 'Select issue ' + value.summary.key, exact: true })).not.toBeChecked();
      expect(dialogs.filter(value => !value.expected)).toEqual([]);
    }, 'web');
  } finally { release(); await page.unrouteAll({ behavior: 'wait' }); page.off('dialog', onDialog); }
});
