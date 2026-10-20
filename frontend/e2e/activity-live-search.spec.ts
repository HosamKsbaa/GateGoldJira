import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import {
  zInboxSummary,
  zPageActivityView,
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

async function fixture(request: APIRequestContext) {
  const projectId = await isolatedProject(request);
  const authorization = 'Bearer ' + (await token('owner'));
  async function issue(title: string) {
    const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
      headers: { Authorization: authorization, 'Idempotency-Key': crypto.randomUUID() },
      data: { title },
    });
    expect(response.status()).toBe(201);
    return zSavedIssueView.parse(await response.json()).result;
  }
  const first = await issue('History live search first · أول');
  const second = await issue('History live search second · ثان');
  const summary = await request.get(apiOrigin + '/api/v1/notifications/summary', {
    headers: { Authorization: authorization },
  });
  expect(summary.status()).toBe(200);
  const companyToday = zInboxSummary.parse(await summary.json()).companyToday;
  return { projectId, first, second, companyToday };
}

test('company activity searches as you type, ignores late results and preserves the query focus', async ({
  page,
  request,
}) => {
  const data = await fixture(request);
  await signIn(page, 'owner', '/admin/activity', /^Company activity$/);
  const query = page.getByLabel('Issue key', { exact: true });
  await expect(query).toHaveAttribute('aria-busy', 'false');
  const requested = gate(),
    release = gate(),
    fulfilled = gate();
  let secondRequests = 0,
    datedRequests = 0;
  const oldResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return (
      url.pathname === '/api/v1/admin/activity' &&
      url.searchParams.get('issueKey') === data.first.summary.key
    );
  });
  await page.route('**/api/v1/admin/activity?*', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('issueKey') === data.second.summary.key) secondRequests++;
    if (
      url.searchParams.get('issueKey') === data.second.summary.key &&
      url.searchParams.get('fromDate') === data.companyToday &&
      url.searchParams.get('toDate') === data.companyToday
    )
      datedRequests++;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    zPageActivityView.parse(await response.json());
    if (url.searchParams.get('issueKey') === data.first.summary.key) {
      requested.resolve();
      await release.promise;
      await route.fulfill({ response });
      fulfilled.resolve();
      return;
    }
    await route.fulfill({ response });
  });
  try {
    await query.fill(data.first.summary.key.toLowerCase());
    await expect(query).toHaveAttribute('aria-busy', 'true');
    await expect(page.locator('#activity-status')).toHaveText('Searching activity…');
    await expect(
      page.getByRole('button', { name: 'Apply history filters', exact: true }),
    ).toHaveCount(0);
    await requested.promise;
    await query.fill(data.second.summary.key.toLowerCase());
    await expect(page.locator('#activity-status')).toContainText('1 matching events');
    await expect(query).toBeFocused();
    const events = page.getByRole('region', { name: 'Activity events' });
    await expect(
      events.getByRole('link', { name: data.second.summary.key, exact: true }),
    ).toBeVisible();
    release.resolve();
    await fulfilled.promise;
    await (await oldResponse).finished();
    await page.evaluate(() => new Promise<void>(done => requestAnimationFrame(() => done())));
    await expect(
      events.getByRole('link', { name: data.first.summary.key, exact: true }),
    ).toHaveCount(0);
    await expect(
      events.getByRole('link', { name: data.second.summary.key, exact: true }),
    ).toBeVisible();

    await query.evaluate(
      (element, keys) => {
        if (!(element instanceof HTMLInputElement))
          throw new Error('Missing activity query input.');
        for (const key of keys) {
          element.value = key;
          element.dispatchEvent(new Event('input', { bubbles: true }));
        }
      },
      [data.second.summary.key, 'ZZZZ-99999999', data.second.summary.key],
    );
    await expect.poll(() => secondRequests).toBe(2);
    await expect(
      events.getByRole('link', { name: data.second.summary.key, exact: true }),
    ).toBeVisible();
    await page.getByLabel('From date', { exact: true }).fill(data.companyToday);
    await page.getByLabel('To date', { exact: true }).fill(data.companyToday);
    await expect.poll(() => datedRequests).toBe(1);
    await expect(page.locator('#activity-status')).toContainText('1 matching events');
    await expect(page.getByLabel('To date', { exact: true })).toBeFocused();
    await page.getByLabel('To date', { exact: true }).fill('2020-01-01');
    await expect(page.getByRole('alert')).toContainText(
      'The start date must be on or before the end date.',
    );
    await expect(events.locator('article')).toHaveCount(0);
  } finally {
    release.resolve();
  }
});

test('activity resource filters validate complete paired identifiers and apply automatically', async ({
  page,
  request,
}) => {
  const data = await fixture(request);
  await signIn(page, 'owner', '/admin/activity', /^Company activity$/);
  await expect(page.getByLabel('Issue key', { exact: true })).toHaveAttribute('aria-busy', 'false');
  let pairedRequests = 0;
  page.on('request', request => {
    const url = new URL(request.url());
    if (
      url.pathname === '/api/v1/admin/activity' &&
      url.searchParams.get('resourceKind') === 'issue'
    )
      pairedRequests++;
  });
  await page.getByText('Advanced resource filters', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Resource kind', exact: true }).selectOption('issue');
  await expect(page.getByRole('alert')).toContainText(
    'Supply resource kind and identifier together.',
  );
  const identifier = page.getByLabel('Resource identifier', { exact: true });
  await identifier.fill('partial');
  await expect(page.getByRole('alert')).toContainText(
    'Use a complete UUID for the resource identifier.',
  );
  expect(pairedRequests).toBe(0);
  await identifier.fill(data.second.summary.id);
  await expect(page.locator('#activity-status')).toContainText('1 matching events');
  await expect(identifier).toBeFocused();
  await expect(
    page
      .getByRole('region', { name: 'Activity events' })
      .getByRole('link', { name: data.second.summary.key, exact: true }),
  ).toBeVisible();
  expect(pairedRequests).toBe(1);
  await identifier.press('Enter');
  await expect(page.locator('#activity-status')).toBeFocused();
  await expect.poll(() => pairedRequests).toBe(2);
  await page.getByRole('button', { name: 'Clear history filters', exact: true }).click();
  await expect(identifier).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Resource kind', exact: true })).toHaveValue('');
  await expect(page.locator('#activity-status')).toContainText('Showing the latest events.');
});
