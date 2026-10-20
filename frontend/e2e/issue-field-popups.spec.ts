import { useCase } from './support/use-case';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import {
  zPageBoardSummary,
  zPageUserSummary,
  zSavedIssueView,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated local company.');
function gate() {
  let resolve = (): void => {};
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
async function headers() {
  return {
    Authorization: 'Bearer ' + (await token('member')),
    'Idempotency-Key': crypto.randomUUID(),
  };
}
async function fixture(request: APIRequestContext) {
  const projectId = await isolatedProject(request);
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: await headers(),
    data: { title: 'Popup field editing ' + crypto.randomUUID().slice(0, 8) },
  });
  expect(response.status()).toBe(201);
  const issue = zSavedIssueView.parse(await response.json()).result;
  const boards = zPageBoardSummary.parse(
    await (
      await request.get(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
        headers: await headers(),
      })
    ).json(),
  );
  const board = boards.items[0];
  if (!board) throw new Error('Missing isolated board');
  return { issue, board, projectId };
}
async function openDrawer(page: Page, data: Awaited<ReturnType<typeof fixture>>) {
  await signIn(page, 'member', '/boards/' + data.board.id, new RegExp('^' + data.board.name + '$'));
  await page.getByRole('link', { name: data.issue.summary.title, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Issue preview', exact: true });
  await expect(drawer).toBeVisible();
  return drawer;
}

test('Details menus float above the board drawer without moving fields and close with keyboard or outside click', async ({
  page,
  request,
}) => {
  const data = await fixture(request);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const drawer = await openDrawer(page, data);
  const priorityTrigger = drawer.getByRole('button', { name: 'Edit priority', exact: true });
  await priorityTrigger.scrollIntoViewIfNeeded();
  const dueTrigger = drawer.getByRole('button', { name: 'Edit due date', exact: true });
  const before = await dueTrigger.boundingBox();
  if (!before) throw new Error('Missing due date anchor');
  await drawer.locator('.priority-value').click();
  const priority = drawer.getByRole('group', { name: 'Edit priority', exact: true });
  await expect(priority).toBeVisible();
  expect(await priority.evaluate(element => element.matches(':popover-open'))).toBe(true);
  const after = await dueTrigger.boundingBox();
  if (!after) throw new Error('Missing due date anchor');
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  await expect(priority.getByRole('option', { name: 'Medium', exact: true })).toBeFocused();
  await expect(priority.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(priority).toHaveCount(0);
  await expect(priorityTrigger).toBeFocused();
  await expect(drawer).toBeVisible();
  await priorityTrigger.click();
  await expect(priority.getByRole('option', { name: 'Medium', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(priority.getByRole('option', { name: 'High', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(priority).toHaveCount(0);
  await expect(priorityTrigger).toBeFocused();
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('.priority-value')).toContainText('High');
  await priorityTrigger.click();
  await drawer.getByRole('heading', { name: 'Description', exact: true }).click();
  await expect(priority).toHaveCount(0);
  await dueTrigger.click();
  const due = drawer.getByRole('group', { name: 'Edit due date', exact: true });
  expect(await due.evaluate(element => element.matches(':popover-open'))).toBe(true);
  await expect(due.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await due.getByLabel('due date', { exact: true }).fill('2027-03-10');
  await expect(due).toHaveCount(0);
  await expect(drawer.getByText('Due 2027-03-10', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await drawer.evaluate(element => element.setAttribute('dir', 'rtl'));
  await priorityTrigger.scrollIntoViewIfNeeded();
  await priorityTrigger.click();
  await expect(priority).toBeVisible();
  const bounds = await priority.boundingBox();
  if (!bounds) throw new Error('Missing mobile popup');
  expect(bounds.x).toBeGreaterThanOrEqual(7);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(383);
  expect(bounds.y).toBeGreaterThanOrEqual(7);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(837);
  expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence) await page.screenshot({ path: evidence + '/issue-details-popup-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(drawer).toBeVisible();
});

test('priority keyboard intent survives a delayed first choice page without saving the retained value', async ({
  page,
  request,
}) => {
  await useCase('UC-ISS-0180', async () => {
  const data = await fixture(request);
  const requested = gate(),
    release = gate();
  await page.route('**/api/v2/projects/' + data.projectId + '/priorities*', async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    requested.resolve();
    await release.promise;
    await route.fulfill({ response });
  });
  const drawer = await openDrawer(page, data);
  const writes: string[] = [];
  page.on('request', outgoing => {
    const path = new URL(outgoing.url()).pathname;
    const issuePath = '/api/v2/issues/' + data.issue.summary.id;
    if (
      (outgoing.method() === 'PUT' && path === issuePath) ||
      (outgoing.method() === 'PATCH' && path === issuePath + '/fields')
    )
      writes.push(outgoing.url());
  });
  const trigger = drawer.getByRole('button', { name: 'Edit priority', exact: true });
  await trigger.click();
  const priority = drawer.getByRole('group', { name: 'Edit priority', exact: true });
  try {
    await requested.promise;
    await expect(priority.getByRole('option', { name: 'Medium', exact: true })).toBeFocused();
    await expect(priority.getByRole('option', { name: 'High', exact: true })).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(priority).toBeVisible();
    expect(writes).toEqual([]);
  } finally {
    release.resolve();
  }
  await expect(priority).toHaveCount(0);
  await expect(drawer.locator('.priority-value')).toContainText('High');
  await expect(trigger).toBeFocused();
  expect(writes).toHaveLength(1);

  }, 'web');
});

test('assignee results update while typing, cached choices open immediately, and late replies cannot replace the latest query', async ({
  page,
  request,
}) => {
  const data = await fixture(request);
  await signIn(
    page,
    'member',
    '/issues/' + data.issue.summary.id,
    new RegExp('^' + data.issue.summary.title + '$'),
  );
  const endpoint = '**/api/v1/projects/' + data.projectId + '/assignees*';
  const trigger = page.getByRole('button', { name: 'Edit assignee', exact: true });
  await trigger.click();
  const field = page.getByRole('group', { name: 'Edit assignee', exact: true });
  const query = field.getByLabel('Find teammate', { exact: true });
  await expect(field.getByRole('option', { name: 'مطور تجريبي', exact: true })).toBeVisible();
  await expect(query).toHaveAttribute('aria-busy', 'false');
  await expect(field.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0);
  await query.press('Escape');
  await expect(field).toHaveCount(0);
  const reopened = gate(),
    releaseReopen = gate();
  await page.route(endpoint, async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    reopened.resolve();
    await releaseReopen.promise;
    await route.fulfill({ response });
  });
  try {
    await trigger.click();
    await reopened.promise;
    // The verified project choices stay available while their fresh first page is in flight.
    await expect(query).toHaveAttribute('aria-busy', 'true');
    await expect(field.getByRole('option', { name: 'مطور تجريبي', exact: true })).toBeVisible();
  } finally {
    releaseReopen.resolve();
  }
  await expect(query).toHaveAttribute('aria-busy', 'false');
  await page.unroute(endpoint);
  const oldRequested = gate(),
    oldReleased = gate();
  const received: string[] = [];
  await page.route(endpoint, async route => {
    const requestedQuery = new URL(route.request().url()).searchParams.get('query') ?? '';
    received.push(requestedQuery);
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    zPageUserSummary.parse(await response.json());
    if (requestedQuery === 'no-such-teammate') {
      oldRequested.resolve();
      await oldReleased.promise;
    }
    await route.fulfill({ response });
  });
  try {
    await query.fill('no-such-teammate');
    await expect(
      field.getByRole('status').filter({ hasText: 'Searching teammates…' }),
    ).toBeVisible();
    await oldRequested.promise;
    await useCase('UC-ISS-0098', async () => {
      await query.fill('مطور');
      await expect.poll(() => received.includes('مطور')).toBe(true);
      await expect(query).toHaveAttribute('aria-busy', 'false');
      await expect(field.getByRole('option', { name: 'مطور تجريبي', exact: true })).toBeVisible();
      await expect(field.getByRole('option', { name: 'Local Owner', exact: true })).toHaveCount(0);
    }, 'web');
  } finally {
    oldReleased.resolve();
  }
  await expect(field.getByRole('option', { name: 'مطور تجريبي', exact: true })).toBeVisible();
  await query.press('Escape');
  await expect(field).toHaveCount(0);
  await trigger.click();
  await query.fill('مطور');
  await expect.poll(() => received.filter(value => value === 'مطور').length).toBe(2);
  await expect(query).toHaveAttribute('aria-busy', 'false');
  await query.press('ArrowDown');
  await expect(field.getByRole('option', { name: 'Unassigned', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(field.getByRole('option', { name: 'مطور تجريبي', exact: true })).toBeFocused();
  await expect(field.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence) await page.screenshot({ path: evidence + '/issue-assignee-popup-desktop.png' });
  await page.keyboard.press('Enter');
  await expect(field).toHaveCount(0);
  await expect(page.locator('gg-modern-issue-field-editor .person-value')).toContainText(
    'مطور تجريبي',
  );
  await expect(trigger).toBeFocused();
});

test('shared label choices float above the issue form, search as typed and close without reopening or losing the form', async ({
  page,
  request,
}) => {
  const data = await fixture(request);
  await signIn(
    page,
    'member',
    '/issues/' + data.issue.summary.id,
    new RegExp('^' + data.issue.summary.title + '$'),
  );
  await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit ' + data.issue.summary.key, exact: true });
  await dialog.getByLabel('New label name').fill('Popup label');
  await dialog.getByRole('button', { name: 'Create and select label', exact: true }).click();
  await expect(
    dialog.getByRole('button', { name: 'Remove Popup label', exact: true }),
  ).toBeVisible();
  const query = dialog.getByRole('combobox', { name: 'Labels', exact: true });
  await query.scrollIntoViewIfNeeded();
  const footer = dialog.getByRole('button', { name: 'Save issue', exact: true });
  const before = await footer.boundingBox();
  if (!before) throw new Error('Missing form footer');
  await query.fill('Popup');
  await expect(dialog.getByRole('option', { name: 'Popup label', exact: true })).toBeVisible();
  const panel = query.locator('..').locator('.picker-results');
  expect(await panel.evaluate(element => element.matches(':popover-open'))).toBe(true);
  await expect(query).toHaveAttribute('aria-busy', 'false');
  const after = await footer.boundingBox();
  if (!after) throw new Error('Missing form footer');
  expect(Math.abs(after.y - before.y)).toBeLessThan(1);
  await query.press('Escape');
  await expect(panel).toHaveCount(0);
  await expect(query).toBeFocused();
  await expect(dialog).toBeVisible();
  await query.press('ArrowDown');
  await expect(panel).toBeVisible();
  await panel.getByRole('button', { name: 'Done choosing', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(query).toBeFocused();
  await query.press('ArrowDown');
  await expect(panel).toBeVisible();
  await dialog.getByLabel('New label name').click();
  await expect(panel).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
});
