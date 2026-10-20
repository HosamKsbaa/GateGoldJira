import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import {
  zModernIssueView,
  zSavedIssueView,
  zSavedBoardSummary,
} from '../src/app/api/generated/zod.gen';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
const projectId = '20000000-0000-4000-8000-000000000001';
const ownerId = '10000000-0000-4000-8000-000000000001';
test.skip(!localFixturesAvailable, 'Use make test-browser for isolated real local identities.');
async function headers() {
  return {
    Authorization: 'Bearer ' + (await token('owner')),
    'Idempotency-Key': crypto.randomUUID(),
  };
}
async function create(request: APIRequestContext, title: string) {
  const result = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: await headers(),
    data: { title, assigneeId: ownerId },
  });
  expect(result.status()).toBe(201);
  return zSavedIssueView.parse(await result.json()).result;
}
async function read(request: APIRequestContext, id: string) {
  return zModernIssueView.parse(
    await (
      await request.get(apiOrigin + '/api/v2/issues/' + id, { headers: await headers() })
    ).json(),
  );
}
function card(page: Page, title: string) {
  return page
    .locator('gg-native-issue-card')
    .filter({ has: page.getByRole('link', { name: title, exact: true }) });
}
async function move(page: Page, title: string, status: 'todo' | 'in_progress' | 'review' | 'done') {
  const current = card(page, title);
  if ((await current.locator('details').getAttribute('open')) === null)
    await current.locator('summary').click();
  await current
    .getByLabel('Destination column')
    .selectOption({
      label: (
        { todo: 'To do', in_progress: 'In progress', review: 'Review', done: 'Done' } as const
      )[status],
    });
  await current.getByRole('button', { name: 'Choose destination', exact: true }).click();
}
test('link another developer, guard Done, complete and reopen the blocker, then remove the retained link', async ({
  page,
  request,
}) => {
  const marker = 'Dependency ' + crypto.randomUUID();
  const a = await create(request, marker + ' Dependent');
  const b = await create(request, marker + ' Other developer');
  await signIn(page, 'member', '/issues/' + a.summary.id, new RegExp('^' + a.summary.title + '$'));
  await page.getByRole('button', { name: 'Add blocker', exact: true }).click();
  await page.getByLabel('Find a same-project issue').fill(b.summary.key);
  await page.getByRole('button', { name: 'Select blocker ' + b.summary.key, exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Add selected blocker', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Add selected blocker', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove blocker ' + b.summary.key, exact: true }),
  ).toBeVisible();
  expect((await read(request, a.summary.id)).summary.blocked).toBe(true);
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
    headers: await headers(),
    data: { name: marker, savedFilters: { query: marker } },
  });
  expect(response.status()).toBe(201);
  const board = zSavedBoardSummary.parse(await response.json()).result;
  await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + marker + '$'));
  await move(page, a.summary.title, 'done');
  await expect(
    page.getByRole('heading', { name: 'Unfinished prerequisites', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Finish every direct blocker');
  await move(page, b.summary.title, 'done');
  await expect(page.getByText('Board updated.', { exact: true })).toBeVisible();
  expect((await read(request, a.summary.id)).summary.stage.category).toBe('todo');
  expect((await read(request, a.summary.id)).summary.blocked).toBe(false);
  await move(page, a.summary.title, 'done');
  await expect(
    page
      .getByRole('region', { name: 'Done column', exact: true })
      .getByRole('link', { name: a.summary.title, exact: true }),
  ).toBeVisible();
  await move(page, b.summary.title, 'review');
  await expect(
    page
      .getByRole('region', { name: 'Review column', exact: true })
      .getByRole('link', { name: b.summary.title, exact: true }),
  ).toBeVisible();
  await expect(
    card(page, a.summary.title).getByText('Blocked · 1 unfinished', { exact: true }),
  ).toBeVisible();
  expect((await read(request, a.summary.id)).summary.stage.category).toBe('done');
  await card(page, b.summary.title)
    .getByRole('link', { name: b.summary.title, exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Blocks', exact: true })).toBeVisible();
  await page
    .getByRole('link', { name: a.summary.key + ' · ' + a.summary.title, exact: true })
    .click();
  await page.getByRole('button', { name: 'Remove blocker ' + b.summary.key, exact: true }).click();
  await expect(
    page.locator('gg-dependencies').getByText('No blocking relationships', { exact: true }),
  ).toBeVisible();
  const after = await read(request, a.summary.id);
  expect(after.summary.blocked).toBe(false);
  expect(after.summary.stage.category).toBe('done');
});
test('cycle and stale-graph failures preserve the selected blocker for review', async ({
  page,
  request,
}) => {
  const marker = 'Cycle ' + crypto.randomUUID();
  const a = await create(request, marker + ' A'),
    b = await create(request, marker + ' B'),
    c = await create(request, marker + ' C');
  const first = await request.post(apiOrigin + '/api/v1/issues/' + a.summary.id + '/dependencies', {
    headers: await headers(),
    data: {
      blockerId: b.summary.id,
      expectedIssueRevision: a.summary.revision,
      expectedGraphRevision: a.graphRevision,
    },
  });
  expect(first.status()).toBe(200);
  await signIn(page, 'member', '/issues/' + b.summary.id, new RegExp('^' + b.summary.title + '$'));
  await page.getByRole('button', { name: 'Add blocker', exact: true }).click();
  await page.getByLabel('Find a same-project issue').fill(a.summary.key);
  await page.getByRole('button', { name: 'Select blocker ' + a.summary.key, exact: true }).click();
  await page.getByRole('button', { name: 'Add selected blocker', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('cycle');
  await expect(
    page.getByRole('button', { name: 'Add selected blocker', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Find a same-project issue').fill(c.summary.key);
  await page.getByRole('button', { name: 'Select blocker ' + c.summary.key, exact: true }).click();
  const current = await read(request, a.summary.id);
  const concurrent = await request.post(
    apiOrigin + '/api/v1/issues/' + a.summary.id + '/dependencies',
    {
      headers: await headers(),
      data: {
        blockerId: c.summary.id,
        expectedIssueRevision: current.summary.revision,
        expectedGraphRevision: current.graphRevision,
      },
    },
  );
  expect(concurrent.status()).toBe(200);
  await page.getByRole('button', { name: 'Add selected blocker', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('This issue changed.');
  await page.getByRole('button', { name: 'Review current relationships', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Add selected blocker', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Add selected blocker', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Remove blocker ' + c.summary.key, exact: true }),
  ).toBeVisible();
});
