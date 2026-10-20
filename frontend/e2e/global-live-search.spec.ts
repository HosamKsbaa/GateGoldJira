import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import {useCase} from './support/use-case';
import { writeFile } from 'node:fs/promises';
import { localFixturesAvailable, signIn } from './support/session';
import { zSearchIssuesV2Body } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the disposable local company.');
const board = '/boards/30000000-0000-4000-8000-000000000001';

test('global search shows numeric and Arabic results while typing, keeps the board and opens a keyboard choice', async ({
  page,
}) => {
  await signIn(page, 'member', board, /^All Issues$/);
  const query = page.getByRole('combobox', { name: 'Search all issues', exact: true });
  const results = page.getByRole('listbox', { name: 'Matching issues', exact: true });
  await query.fill('2');
  await expect.poll(() => results.getByRole('option').count()).toBeGreaterThan(0);
  await expect(query).toHaveAttribute('aria-busy', 'false');
  const keys = await results.locator('small bdi').allTextContents();
  expect(keys.length).toBeLessThanOrEqual(8);
  expect(keys.every(key => key.endsWith('-2'))).toBe(true);
  // Global number search spans every accessible project; a full key narrows it.
  await query.fill('DEMO-2');
  await expect(results.getByRole('option')).toHaveCount(1);
  await expect(results).toContainText('DEMO-2');
  await expect(results).toContainText('Build API');
  await expect(query).toBeFocused();
  await expect(query).toHaveAttribute('aria-busy', 'false');
  expect(new URL(page.url()).pathname).toBe(board);
  await expect(page.getByRole('heading', { name: 'All Issues', exact: true })).toBeVisible();
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence) await page.screenshot({ path: evidence + '/global-live-search.png' });

  await query.press('Escape');
  await expect(query).toHaveAttribute('aria-expanded', 'false');
  await expect(query).toBeFocused();
  await query.fill('واجهة');
  await expect(results.getByRole('option')).toHaveCount(1);
  await expect(results).toContainText('DEMO-3');
  await query.press('ArrowDown');
  await expect(query).toHaveAttribute('aria-activedescendant', 'global-issue-option-0');
  await query.press('Enter');
  await expect(page.getByRole('heading', { name: 'مراجعة الواجهة', exact: true })).toBeVisible();
  await expect(results).toBeHidden();
});

test('global live results reject delayed older queries and record warmed typing latency', async ({
  page,
}) => {
  await signIn(page, 'member', board, /^All Issues$/);
  const query = page.getByRole('combobox', { name: 'Search all issues', exact: true });
  const results = page.getByRole('listbox', { name: 'Matching issues', exact: true });
  let requested = (): void => {},
    release = (): void => {};
  const oldRequested = new Promise<void>(resolve => {
    requested = resolve;
  });
  const releaseOld = new Promise<void>(resolve => {
    release = resolve;
  });
  await page.route('**/api/v2/issues/search', async route => {
    const body = zSearchIssuesV2Body.parse(route.request().postDataJSON());
    if (body.filters.query !== 'Build API') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    requested();
    await releaseOld;
    // Aborting a superseded request may close its transport; its result must never render.
    try {
      await route.fulfill({ response });
    } catch {
      /* Superseded fetch was canceled. */
    }
  });
  try {
    await useCase('UC-SHL-0060',async()=>{
    await query.fill('Build API');
    await oldRequested;
    await query.fill('DEMO-3');
    await expect(results.getByRole('option')).toHaveCount(1);
    await expect(results).toContainText('DEMO-3');
    release();
    await expect(results).not.toContainText('DEMO-2');
    },'web');
  } finally {
    release();
  }
  await page.unroute('**/api/v2/issues/search');

  const samples: number[] = [];
  for (let index = 0; index < 21; index++) {
    const number = index % 2 ? '2' : '3';
    const start = performance.now();
    await query.fill('DEMO-' + number);
    await page.waitForFunction(key => {
      const input = document.getElementById('global-issue-query');
      return (
        input?.getAttribute('aria-busy') === 'false' &&
        document.getElementById('global-issue-options')?.textContent?.includes(key)
      );
    }, 'DEMO-' + number);
    if (index) samples.push(performance.now() - start);
    await expect(query).toBeFocused();
  }
  samples.sort((a, b) => a - b);
  const p95Ms = samples[18],
    maxMs = samples[19];
  if (p95Ms === undefined || maxMs === undefined) throw new Error('Missing timing samples.');
  expect(p95Ms).toBeLessThan(2000);
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence)
    await writeFile(
      evidence + '/typing-search-performance.json',
      JSON.stringify(
        {
          environment: 'local Angular development server and disposable test company',
          cloudAcceptance: false,
          operation: 'typing an exact issue key to visible global search results',
          trials: 20,
          p95Ms,
          maxMs,
        },
        null,
        2,
      ) + '\n',
    );
  await page.getByRole('heading', { name: 'All Issues', exact: true }).click();
  await expect(query).toHaveAttribute('aria-expanded', 'false');
  await query.fill('nonexistent ' + crypto.randomUUID());
  await expect(page.getByText('No matching issues.', { exact: true })).toBeVisible();
  await query.fill('');
  await expect(query).toHaveAttribute('aria-expanded', 'false');
});
