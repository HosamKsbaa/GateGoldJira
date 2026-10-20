import { readLayout, layoutFields } from './support/native-boards';
import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import {
  zModernIssueView,
  zSavedIssueView,
  zBoardView,
  zSavedBoardSummary,
  zNativeCardPage,
} from '../src/app/api/generated/zod.gen';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { dragBoardCard } from './support/board-drag';
const projectId = '20000000-0000-4000-8000-000000000001';
test.skip(
  !localFixturesAvailable,
  'Use make test-browser for real local tokens and isolated PostgreSQL.',
);
async function headers() {
  return {
    Authorization: 'Bearer ' + (await token('owner')),
    'Idempotency-Key': crypto.randomUUID(),
  };
}
async function issue(request: APIRequestContext, title: string) {
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: await headers(),
    data: { title, priority: 'high', dueDate: '2020-01-01' },
  });
  expect(response.status()).toBe(201);
  return zSavedIssueView.parse(await response.json()).result;
}
function card(page: Page, title: string) {
  return page
    .locator('gg-native-issue-card')
    .filter({ has: page.getByRole('link', { name: title, exact: true }) });
}
test('named Arabic board settings preserve issues, keyboard and drag moves share soft WIP counts', async ({
  page,
  request,
}) => {
  const marker = 'Kanban ' + crypto.randomUUID();
  const a = await issue(request, marker + ' عمل أ');
  const b = await issue(request, marker + ' عمل ب');
  const baseline = [];
  for (const work of [a, b])
    baseline.push(
      zModernIssueView.parse(
        await (
          await request.get(apiOrigin + '/api/v2/issues/' + work.summary.id, {
            headers: await headers(),
          })
        ).json(),
      ),
    );
  await signIn(page, 'member', '/boards/project/' + projectId, /^Project boards$/);
  const name = 'لوحة الفريق ' + crypto.randomUUID();
  await page.getByLabel('New board name').fill(name);
  await page.getByRole('button', { name: 'Create board', exact: true }).click();
  const row = page
    .locator('.records li')
    .filter({ has: page.getByRole('link', { name, exact: true }) });
  await row.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Board settings', exact: true })).toBeVisible();
  await page
    .locator('.native-column')
    .nth(2)
    .getByLabel('Work-in-progress limit', { exact: true })
    .fill('1');
  await page.getByLabel('Title, key or number', { exact: true }).fill(marker);
  await page.getByRole('combobox', { name: 'Priorities', exact: true }).focus();
  await page
    .getByRole('listbox', { name: 'Priorities choices', exact: true })
    .getByRole('option', { name: 'High', exact: true })
    .click();
  await page.getByRole('button', { name: 'Done choosing', exact: true }).click();
  await page.getByRole('button', { name: 'Save board settings', exact: true }).click();
  await expect(page.getByText('Board settings saved.', { exact: true })).toBeVisible();
  for (const before of baseline) {
    const current = zModernIssueView.parse(
      await (
        await request.get(apiOrigin + '/api/v2/issues/' + before.summary.id, {
          headers: await headers(),
        })
      ).json(),
    );
    // Saving the shared workflow can canonicalize its targets and display
    // names. Issue content, identity, revision and ordering must not change.
    expect({
      ...current,
      summary: { ...current.summary, statusName: undefined },
      workflow: undefined,
    }).toEqual({
      ...before,
      summary: { ...before.summary, statusName: undefined },
      workflow: undefined,
    });
    expect(current.summary.workflow).toEqual(before.summary.workflow);
  }
  await page.getByRole('link', { name: 'Open Kanban board', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  for (const work of [a, b]) {
    const item = card(page, work.summary.title);
    await item.locator('summary').click();
    await item.getByLabel('Destination column').selectOption({ label: 'Review' });
    await item.getByRole('button', { name: 'Choose destination', exact: true }).click();
    await expect(page.getByText('Board updated.', { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: 'Review column', exact: true })
        .getByRole('link', { name: work.summary.title, exact: true }),
    ).toBeVisible();
  }
  const review = page.getByRole('region', { name: 'Review column', exact: true });
  await expect(review.getByText(/WIP warning/)).toBeVisible();
  await page.getByText('Filters', { exact: true }).click();
  await page.getByLabel('Title, key or number', { exact: true }).fill(marker + ' عمل أ');
  await expect(card(page, b.summary.title)).toHaveCount(0);
  await expect(review.getByText(/WIP warning/)).toBeVisible();
  await expect(review.getByRole('heading', { name: 'Review 1', exact: true })).toBeVisible();
  await page.getByLabel('Title, key or number', { exact: true }).fill('');
  await expect(card(page, b.summary.title)).toBeVisible();
  await page.locator('.board-filters > summary').click();
  // Begin on the card body: drag must not require a tiny dedicated handle.
  const handle = card(page, a.summary.title).locator('.issue-card');
  const target = page
    .getByRole('region', { name: 'In progress column', exact: true })
    .locator('.card-list');
  await dragBoardCard(page, handle, target);
  await expect(
    page
      .getByRole('region', { name: 'In progress column', exact: true })
      .getByRole('link', { name: a.summary.title, exact: true }),
  ).toBeVisible();
  await expect(review.getByText(/WIP warning/)).toHaveCount(0);
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  const layout = await page.locator('.kanban-scroll').evaluate(element => {
    const columns = Array.from(element.querySelectorAll('.kanban-column')).map(
      column => column.getBoundingClientRect().top,
    );
    return {
      scrolls: element.scrollWidth > element.clientWidth,
      oneRow: columns.every(top => Math.abs(top - (columns[0] ?? top)) < 2),
    };
  });
  expect(layout).toEqual({ scrolls: true, oneRow: true });
  const persisted = zModernIssueView.parse(
    await (
      await request.get(apiOrigin + '/api/v2/issues/' + a.summary.id, { headers: await headers() })
    ).json(),
  );
  expect(persisted.summary.stage.category).toBe('in_progress');
});
test('column pages stay bounded and keyboard reorder respects hidden cards across boards', async ({
  page,
  request,
}) => {
  const marker = 'Paged ' + crypto.randomUUID();
  const cards = [];
  for (let i = 0; i < 30; i++) cards.push(await issue(request, marker + ' ' + i));
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
    headers: await headers(),
    data: { name: marker, savedFilters: { query: marker } },
  });
  expect(response.status()).toBe(201);
  const board = zSavedBoardSummary.parse(await response.json()).result;
  await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + marker + '$'));
  const column = page.getByRole('region', { name: 'To do column', exact: true });
  await expect(column.locator('gg-native-issue-card')).toHaveCount(25);
  await column.getByRole('button', { name: 'More To do issues', exact: true }).click();
  await expect(column.locator('gg-native-issue-card')).toHaveCount(30);
  const first = cards[0],
    last = cards[29];
  if (!first || !last) throw new Error('Missing fixtures');
  const item = card(page, last.summary.title);
  await item.locator('summary').click();
  await item.getByLabel('Same-column neighbor').selectOption(first.summary.id);
  await item.getByRole('button', { name: 'Move before', exact: true }).click();
  // Wait for the persisted response: CDK may change visual order while dragging.
  await expect(page.getByText('Board updated.', { exact: true })).toBeVisible();
  // A confirmed move refreshes the bounded first page.
  await expect(column.locator('gg-native-issue-card')).toHaveCount(25);
  await expect(column.locator('gg-native-issue-card').first()).toContainText(last.summary.title);
  const native = await readLayout(request, board.id);
  const raw = await request.post(
    apiOrigin + '/api/v2/boards/' + board.id + '/columns/' + native.columns[0]!.id + '/search',
    { headers: await headers(), data: { page: { limit: 25 } } },
  );
  expect(raw.status()).toBe(200);
  const confirmed = zNativeCardPage.parse(await raw.json());
  expect(confirmed.items[0]?.id).toBe(last.summary.id);
});
test('Viewer cannot mutate boards and guarded Done shows responsible unfinished work', async ({
  page,
  request,
}) => {
  const response = await request.get(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
    headers: await headers(),
  });
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  const { zPageBoardSummary } = await import('../src/app/api/generated/zod.gen');
  const all = zPageBoardSummary.parse(body);
  const board = all.items.find(b => b.default);
  if (!board) throw new Error('Default board missing');
  await signIn(page, 'viewer', '/boards/' + board.id, /^All Issues$/);
  await expect(page.getByRole('button', { name: /Drag / })).toHaveCount(0);
  await expect(page.getByText('Read-only board', { exact: true })).toBeVisible();
  await signIn(page, 'member', '/boards/' + board.id, /^All Issues$/);
  const blocked = page.locator('gg-native-issue-card').filter({ hasText: 'Blocked ·' }).first();
  await expect(blocked).toBeVisible();
  await blocked.locator('summary').click();
  await blocked.getByLabel('Destination column').selectOption({ label: 'Done' });
  await blocked.getByRole('button', { name: 'Choose destination', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Unfinished prerequisites', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Finish every direct blocker and subtask');
  await expect(page.getByRole('link', { name: /DEMO-1/ }).last()).toBeVisible();
  const snapshot = zBoardView.parse(
    await (
      await request.get(apiOrigin + '/api/v1/boards/' + board.id, { headers: await headers() })
    ).json(),
  );
  expect(snapshot.columns).toHaveLength(4);
});
test('uncertain moves restore confirmed cards and retry the original reference once', async ({
  page,
  request,
}) => {
  const title = 'Uncertain board move ' + crypto.randomUUID();
  const work = await issue(request, title);
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
    headers: await headers(),
    data: { name: title, savedFilters: { query: title } },
  });
  const board = zSavedBoardSummary.parse(await response.json()).result;
  await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + title + '$'));
  const references: string[] = [];
  let attempted = 0;
  await page.route('**/api/v2/boards/' + board.id + '/cards/move', async route => {
    references.push(route.request().headers()['idempotency-key'] ?? '');
    const saved = await route.fetch();
    expect(saved.status()).toBe(200);
    attempted++;
    if (attempted === 1) await route.abort('failed');
    else {
      const body: unknown = await saved.json();
      const { zSavedNativeMoveResult } = await import('../src/app/api/generated/zod.gen');
      expect(zSavedNativeMoveResult.parse(body).receipt.replayed).toBe(true);
      await route.fulfill({ response: saved });
    }
  });
  const item = card(page, title);
  await item.locator('summary').click();
  await item.getByLabel('Destination column').selectOption({ label: 'Review' });
  await item.getByRole('button', { name: 'Choose destination', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Retry original move', exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'To do column', exact: true })
      .getByRole('link', { name: title, exact: true }),
  ).toBeVisible();
  const query = page.getByRole('searchbox', { name: 'Search this board', exact: true });
  await query.fill(title);
  // Pending intent keeps the confirmed cards until the original move is retried.
  await expect(
    page
      .getByRole('region', { name: 'To do column', exact: true })
      .getByRole('link', { name: title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Retry original move', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Retry original move', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Review column', exact: true })
      .getByRole('link', { name: title, exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Original move confirmed.', { exact: true })).toBeVisible();
  expect(references).toHaveLength(2);
  expect(references[0]).toBe(references[1]);
});
test('loading a large column never renders more than two hundred cards', async ({
  page,
  request,
}) => {
  test.setTimeout(60_000);
  const marker = 'Window ' + crypto.randomUUID();
  for (let i = 0; i < 205; i++) await issue(request, marker + ' ' + i);
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
    headers: await headers(),
    data: { name: marker, savedFilters: { query: marker } },
  });
  const board = zSavedBoardSummary.parse(await response.json()).result;
  await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + marker + '$'));
  const column = page.getByRole('region', { name: 'To do column', exact: true });
  await expect(column.locator('gg-native-issue-card')).toHaveCount(25);
  for (const count of [50, 75, 100, 125, 150, 175, 200, 200]) {
    await column.getByRole('button', { name: 'More To do issues', exact: true }).click();
    await expect(column.locator('gg-native-issue-card')).toHaveCount(count);
  }
  await expect(
    column.getByText('Showing the latest 200 loaded cards.', { exact: true }),
  ).toBeVisible();
  await expect(column.getByRole('button', { name: 'More To do issues', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Reload board', exact: true }).click();
  await expect(column.locator('gg-native-issue-card')).toHaveCount(25);
});
test('stale board settings retain unsaved input and archive restores the same issues', async ({
  page,
  request,
}) => {
  const name = 'Settings ' + crypto.randomUUID();
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
    headers: {
      Authorization: 'Bearer ' + (await token('member')),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { name, savedFilters: {} },
  });
  const board = zSavedBoardSummary.parse(await response.json()).result;
  await signIn(page, 'member', '/boards/' + board.id + '/settings', /^Board settings$/);
  await page.getByLabel('Board name', { exact: true }).fill('Unsent name');
  const fresh = await readLayout(request, board.id);
  const fields = layoutFields(fresh);
  fields.name = 'Changed elsewhere';
  fields.columns[2]!.wipLimit = 1;
  const concurrent = await request.put(apiOrigin + '/api/v2/boards/' + board.id + '/layout', {
    headers: await headers(),
    data: fields,
  });
  expect(concurrent.status()).toBe(200);
  await page.getByRole('button', { name: 'Save board settings', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed');
  await expect(page.getByLabel('Board name', { exact: true })).toHaveValue('Unsent name');
  await page.getByRole('button', { name: 'Review current board', exact: true }).click();
  await expect(page.getByLabel('Board name', { exact: true })).toHaveValue('Unsent name');
  await page.getByLabel('Board name', { exact: true }).fill('Changed elsewhere');
  await page
    .locator('.native-column')
    .nth(2)
    .getByLabel('Work-in-progress limit', { exact: true })
    .fill('1');
  await page.getByRole('button', { name: 'Save board settings', exact: true }).click();
  await expect(page.getByText('Board settings saved.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Archive board', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore board', exact: true })).toBeVisible();
  await expect(page.getByLabel('Board name', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Restore board', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Archive board', exact: true })).toBeVisible();
  await expect(page.getByLabel('Board name', { exact: true })).toHaveValue('Changed elsewhere');
  await expect(
    page.locator('.native-column').nth(2).getByLabel('Work-in-progress limit', { exact: true }),
  ).toHaveValue('1');
  const current = await readLayout(request, board.id);
  expect(current.board.id).toBe(board.id);
  expect(current.board.archived).toBe(false);
  expect(current.columns.reduce((n, c) => n + c.savedMatchCount, 0)).toBeGreaterThan(0);
});

test('create an issue from the board and close the dialog with keyboard focus restored', async ({
  page,
  request,
}) => {
  const marker = 'Board-created ' + crypto.randomUUID();
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
    headers: await headers(),
    data: { name: marker, savedFilters: { query: marker } },
  });
  expect(response.status()).toBe(201);
  const board = zSavedBoardSummary.parse(await response.json()).result;
  await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + marker + '$'));
  const trigger = page.locator('#board-create-trigger');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
  await expect(dialog.getByLabel('Issue title', { exact: true })).toBeFocused();
  expect(
    await dialog.evaluate(
      element => element instanceof HTMLDialogElement && element.matches(':modal'),
    ),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByLabel('Issue title', { exact: true }).fill(marker + ' عمل جديد');
  await dialog
    .getByLabel('Description', { exact: true })
    .fill('Created directly from the team board.');
  await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const preview = page.getByRole('dialog', { name: 'Issue preview', exact: true });
  await expect(
    preview.getByRole('heading', { name: marker + ' عمل جديد', exact: true }),
  ).toBeVisible();
  await preview.getByRole('button', { name: 'Close issue', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'To do column', exact: true })
      .getByRole('link', { name: marker + ' عمل جديد', exact: true }),
  ).toBeVisible();
  const native = await readLayout(request, board.id);
  const cards = await request.post(
    apiOrigin + '/api/v2/boards/' + board.id + '/columns/' + native.columns[0]!.id + '/search',
    { headers: await headers(), data: { page: { limit: 25 } } },
  );
  const saved = zNativeCardPage.parse(await cards.json());
  expect(saved.items).toHaveLength(1);
  expect(saved.items[0]?.title).toBe(marker + ' عمل جديد');
  const created = saved.items[0];
  if (!created) throw new Error('Created issue missing');
  // A title remains an ordinary link, but can also start a card drag.
  const titleLink = card(page, created.title).locator('h3 a');
  const destination = page
    .getByRole('region', { name: 'In progress column', exact: true })
    .locator('.card-list');
  const from = await titleLink.boundingBox(),
    to = await destination.boundingBox();
  if (!from || !to) throw new Error('Title drag surfaces unavailable');
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 15, from.y + from.height / 2 + 15, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  const movedLink = page
    .getByRole('region', { name: 'In progress column', exact: true })
    .getByRole('link', { name: created.title, exact: true });
  await expect(movedLink).toBeVisible();
  await expect(page.getByText('Board updated.', { exact: true })).toBeVisible();
  const confirmed = zModernIssueView.parse(
    await (
      await request.get(apiOrigin + '/api/v2/issues/' + created.id, { headers: await headers() })
    ).json(),
  );
  expect(confirmed.summary.stage.category).toBe('in_progress');
  await movedLink.click();
  await expect(page.getByRole('dialog', { name: 'Issue preview', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Open full issue', exact: true }).click();
  await expect(page).toHaveURL(new RegExp('/issues/' + created.id + '$'));
});
