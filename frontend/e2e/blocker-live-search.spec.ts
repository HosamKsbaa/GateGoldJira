import { useCase as recordedUseCase } from './support/use-case';
const useCase = <T>(id: string, body: () => Promise<T>) => recordedUseCase(id, body, 'web');
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import {
  zPageBoardSummary,
  zPageDependencyView,
  zPageModernIssueSummary,
  zSavedIssueView,
  zSearchIssuesBody,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated local company.');
const demoProject = '20000000-0000-4000-8000-000000000001';

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

async function createIssue(request: APIRequestContext, projectId: string, title: string) {
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: await headers(),
    data: { title },
  });
  expect(response.status()).toBe(201);
  return zSavedIssueView.parse(await response.json()).result;
}

async function fixture(request: APIRequestContext) {
  const projectId = await isolatedProject(request);
  const prefix = 'Live blocker ' + crypto.randomUUID().slice(0, 8);
  const root = await createIssue(request, projectId, prefix + ' root');
  const first = await createIssue(request, projectId, prefix + ' first');
  const second = await createIssue(request, projectId, prefix + ' second');
  const outside = await createIssue(request, demoProject, prefix + ' other project');
  const response = await request.get(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
    headers: await headers(),
  });
  expect(response.status()).toBe(200);
  const board = zPageBoardSummary.parse(await response.json()).items[0];
  if (!board) throw new Error('Missing isolated project board.');
  return { root, first, second, outside, board, prefix };
}

async function openDrawer(
  page: Page,
  data: Awaited<ReturnType<typeof fixture>>,
  candidateCount = 2,
) {
  await signIn(page, 'member', '/boards/' + data.board.id, new RegExp('^' + data.board.name + '$'));
  await page.getByRole('link', { name: data.root.summary.title, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Issue preview', exact: true });
  const dependencies = drawer.getByRole('region', { name: 'Dependencies', exact: true });
  const query = dependencies.getByRole('combobox', {
    name: 'Find a same-project issue',
    exact: true,
  });
  await useCase('UC-REL-0029', async () => {
    await dependencies.getByRole('button', { name: 'Add blocker', exact: true }).click();
  await expect(query).toBeFocused();
  await expect(
    dependencies.getByRole('listbox', { name: 'Blocker candidates' }).getByRole('option'),
  ).toHaveCount(candidateCount);
  });
  return { drawer, dependencies, query };
}

test('typing an issue key searches immediately, including the same key after reopening and rapid edits', async ({
  page,
  request,
}) => {
  const data = await fixture(request);
  const { dependencies, query } = await openDrawer(page, data);
  const requested = gate(),
    release = gate();
  const queries: string[] = [];
  await page.route('**/api/v2/issues/search', async route => {
    const body = zSearchIssuesBody.parse(route.request().postDataJSON());
    if (body.filters.query) queries.push(body.filters.query);
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    if (body.filters.query === data.first.summary.key && queries.length === 1) {
      requested.resolve();
      await release.promise;
    }
    await route.fulfill({ response });
  });
  const first = dependencies.getByRole('button', {
    name: 'Select blocker ' + data.first.summary.key,
    exact: true,
  });
  await useCase('UC-REL-0031', async () => {
  try {
    await query.fill(data.first.summary.key);
    await expect(
      dependencies.getByRole('status').filter({ hasText: 'Searching issues…' }),
    ).toBeVisible();
    await expect(query).toHaveAttribute('aria-busy', 'true');
    await expect(dependencies.getByText('No matching other issues.', { exact: true })).toHaveCount(
      0,
    );
    await expect(
      dependencies.getByRole('button', { name: 'Find blockers', exact: true }),
    ).toHaveCount(0);
    await requested.promise;
  } finally {
    release.resolve();
  }
  await expect(first).toBeVisible();
  await expect(query).toHaveAttribute('aria-busy', 'false');
  await expect(
    dependencies.getByRole('listbox', { name: 'Blocker candidates' }).getByRole('option'),
  ).toHaveCount(1);
  });

  await dependencies.getByRole('button', { name: 'Cancel adding blocker', exact: true }).click();
  await dependencies.getByRole('button', { name: 'Add blocker', exact: true }).click();
  await expect(query).toBeFocused();
  await query.fill(data.first.summary.key);
  await expect(first).toBeVisible();
  await expect.poll(() => queries.filter(value => value === data.first.summary.key).length).toBe(2);

  // Keep all edits in one browser task so the debounce cannot run between A, B and A.
  await query.evaluate(
    (element, keys) => {
      if (!(element instanceof HTMLInputElement)) throw new Error('Missing blocker query input.');
      for (const key of keys) {
        element.value = key;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    },
    [data.first.summary.key, data.second.summary.key, data.first.summary.key],
  );
  await expect(first).toBeVisible();
  await expect.poll(() => queries.filter(value => value === data.first.summary.key).length).toBe(3);
  await expect(
    dependencies.getByRole('button', {
      name: 'Select blocker ' + data.second.summary.key,
      exact: true,
    }),
  ).toHaveCount(0);
});

test('a bare issue number finds the exact same-project blocker as you type, with leading zeros and mobile keyboard selection', async ({
  page,
  request,
}) => {
  const data = await fixture(request);
  expect(data.root.summary.key).toMatch(/-1$/);
  expect(data.first.summary.key).toMatch(/-2$/);
  expect(data.second.summary.key).toMatch(/-3$/);
  const titleOnly = await createIssue(
    request,
    data.root.summary.projectId,
    'Title contains 2 but this is issue four',
  );
  for (let number = 5; number <= 11; number++) {
    await createIssue(request, data.root.summary.projectId, 'Numeric lookup distractor ' + number);
  }
  const twelve = await createIssue(
    request,
    data.root.summary.projectId,
    'Numeric lookup issue twelve',
  );
  expect(twelve.summary.key).toMatch(/-12$/);
  const otherProject = await isolatedProject(request);
  await createIssue(request, otherProject, 'Other project issue one');
  const otherTwo = await createIssue(request, otherProject, 'Other project issue two');
  expect(otherTwo.summary.key).toMatch(/-2$/);

  const { drawer, dependencies, query } = await openDrawer(page, data, 11);
  await expect(query).toHaveAttribute('placeholder', 'Search by issue number, key or title');
  const choices = dependencies.getByRole('listbox', { name: 'Blocker candidates' });
  const first = dependencies.getByRole('button', {
    name: 'Select blocker ' + data.first.summary.key,
    exact: true,
  });
  const lookup = async (value: string) => {
    const searched = page.waitForResponse(response => {
      if (
        !response.url().endsWith('/api/v2/issues/search') ||
        response.request().method() !== 'POST'
      )
        return false;
      const filters = zSearchIssuesBody.parse(response.request().postDataJSON()).filters;
      return (
        filters.query === (value || undefined) &&
        filters.projectIds?.[0] === data.root.summary.projectId
      );
    });
    await query.fill(value);
    const response = await searched;
    expect(response.status()).toBe(200);
    expect(zSearchIssuesBody.parse(response.request().postDataJSON()).filters.projectIds).toEqual([
      data.root.summary.projectId,
    ]);
    return zPageModernIssueSummary.parse(await response.json());
  };

  await useCase('UC-REL-0032', async () => {
  expect((await lookup('2')).items.map(issue => issue.id)).toEqual([data.first.summary.id]);
  await expect(first).toBeVisible();
  await expect(choices.getByRole('option')).toHaveCount(1);
  });
  for (const excluded of [data.root, titleOnly, twelve, otherTwo]) {
    await expect(
      dependencies.getByRole('button', {
        name: 'Select blocker ' + excluded.summary.key,
        exact: true,
      }),
    ).toHaveCount(0);
  }
  await expect(query).toBeFocused();
  await expect(
    dependencies.getByRole('button', { name: 'Find blockers', exact: true }),
  ).toHaveCount(0);
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence)
    await dependencies
      .locator('.add-blocker-panel')
      .screenshot({ path: evidence + '/blocker-numeric-search-desktop.png' });

  await page.setViewportSize({ width: 390, height: 844 });
  await useCase('UC-REL-0033', async () => {
  expect((await lookup('002')).items.map(issue => issue.id)).toEqual([data.first.summary.id]);
  await expect(first).toBeVisible();
  await expect(choices.getByRole('option')).toHaveCount(1);
  });
  await expect
    .poll(() => drawer.evaluate(element => element.scrollWidth <= element.clientWidth))
    .toBe(true);
  if (evidence)
    await dependencies
      .locator('.add-blocker-panel')
      .screenshot({ path: evidence + '/blocker-numeric-search-mobile.png' });

  await useCase('UC-REL-0044', async () => {
  expect((await lookup('1')).items.map(issue => issue.id)).toEqual([data.root.summary.id]);
  await expect(choices.getByRole('option')).toHaveCount(0);
  await expect(dependencies.getByText('No matching other issues.', { exact: true })).toBeVisible();
  });
  expect((await lookup('')).items).toHaveLength(12);
  await expect(choices.getByRole('option')).toHaveCount(11);
  await expect(
    dependencies.getByRole('button', { name: 'Select blocker ' + twelve.summary.key, exact: true }),
  ).toBeVisible();

  expect((await lookup('2')).items.map(issue => issue.id)).toEqual([data.first.summary.id]);
  await expect(first).toBeVisible();
  const confirm = dependencies.getByRole('button', { name: 'Add selected blocker', exact: true });
  await useCase('UC-REL-0062', async () => {
  await query.press('ArrowDown');
  await expect(query).toHaveAttribute('aria-activedescendant', /-candidate-0$/);
  await query.press('Enter');
  await expect(confirm).toBeFocused();
  });
  await confirm.click();
  await expect(
    dependencies.getByRole('button', {
      name: 'Remove blocker ' + data.first.summary.key,
      exact: true,
    }),
  ).toBeVisible();
  const linked = await request.get(
    apiOrigin +
      '/api/v1/issues/' +
      data.root.summary.id +
      '/dependencies?direction=blocked_by&limit=25',
    {
      headers: await headers(),
    },
  );
  expect(linked.status()).toBe(200);
  expect(zPageDependencyView.parse(await linked.json()).items.map(link => link.blocker.id)).toEqual(
    [data.first.summary.id],
  );
});

test('a held older lookup cannot replace a newer issue-key result', async ({ page, request }) => {
  const data = await fixture(request);
  const { dependencies, query } = await openDrawer(page, data);
  await useCase('UC-REL-0059', async () => {
  const olderReady = gate(),
    releaseOlder = gate(),
    olderFinished = gate();
  await page.route('**/api/v2/issues/search', async route => {
    const body = zSearchIssuesBody.parse(route.request().postDataJSON());
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    if (body.filters.query !== data.first.summary.key) {
      await route.fulfill({ response });
      return;
    }
    olderReady.resolve();
    await releaseOlder.promise;
    try {
      await route.fulfill({ response });
    } finally {
      olderFinished.resolve();
    }
  });
  try {
    await query.fill(data.first.summary.key);
    await olderReady.promise;
    await query.fill(data.second.summary.key);
    const newer = dependencies.getByRole('button', {
      name: 'Select blocker ' + data.second.summary.key,
      exact: true,
    });
    await expect(newer).toBeVisible();
    releaseOlder.resolve();
    await olderFinished.promise;
    await expect(newer).toBeVisible();
    await expect(
      dependencies.getByRole('button', {
        name: 'Select blocker ' + data.first.summary.key,
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      dependencies.getByRole('listbox', { name: 'Blocker candidates' }).getByRole('option'),
    ).toHaveCount(1);
    await expect(
      dependencies.getByRole('status').filter({ hasText: 'Searching issues…' }),
    ).toHaveCount(0);
  } finally {
    releaseOlder.resolve();
  }
  });
});

test('live lookup keeps project and self exclusion while keyboard selection links the chosen blocker', async ({
  page,
  request,
}) => {
  const data = await fixture(request);
  const { drawer, dependencies, query } = await openDrawer(page, data);
  const searched = page.waitForResponse(response => {
    if (!response.url().endsWith('/api/v2/issues/search') || response.request().method() !== 'POST')
      return false;
    return zSearchIssuesBody.parse(response.request().postDataJSON()).filters.query === data.prefix;
  });
  const choices = dependencies.getByRole('listbox', { name: 'Blocker candidates' });
  await useCase('UC-REL-0030', async () => {
  await query.fill(data.prefix);
  const response = await searched;
  expect(response.status()).toBe(200);
  expect(zSearchIssuesBody.parse(response.request().postDataJSON()).filters.projectIds).toEqual([
    data.root.summary.projectId,
  ]);

  await expect(choices.getByRole('option')).toHaveCount(2);
  await expect(
    dependencies.getByRole('button', {
      name: 'Select blocker ' + data.root.summary.key,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    dependencies.getByRole('button', {
      name: 'Select blocker ' + data.outside.summary.key,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    dependencies.getByRole('button', {
      name: 'Select blocker ' + data.first.summary.key,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dependencies.getByRole('button', {
      name: 'Select blocker ' + data.second.summary.key,
      exact: true,
    }),
  ).toBeVisible();
  });
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence)
    await dependencies
      .locator('.add-blocker-panel')
      .screenshot({ path: evidence + '/blocker-live-search-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => drawer.evaluate(element => element.scrollWidth <= element.clientWidth))
    .toBe(true);
  if (evidence)
    await dependencies
      .locator('.add-blocker-panel')
      .screenshot({ path: evidence + '/blocker-live-search-mobile.png' });
  await useCase('UC-REL-0061', async () => {
  await query.press('End');
  await expect(query).toHaveAttribute('aria-activedescendant', /-candidate-\d+$/);
  const active = await query.getAttribute('aria-activedescendant');
  if (!active) throw new Error('Keyboard selection did not activate a candidate.');
  const option = choices.locator('[id="' + active + '"]');
  const key = await option.locator('gg-related-issue-row bdi').first().textContent();
  if (!key) throw new Error('Selected blocker has no displayed issue key.');
  await query.press('Enter');
  await expect(
    dependencies.getByRole('button', { name: 'Add selected blocker', exact: true }),
  ).toBeFocused();
  await dependencies.getByRole('button', { name: 'Add selected blocker', exact: true }).click();
  await expect(
    dependencies.getByRole('button', { name: 'Remove blocker ' + key.trim(), exact: true }),
  ).toBeVisible();
  });
});
