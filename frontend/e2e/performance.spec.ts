import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { localFixturesAvailable, signIn } from './support/session';

// Trace recording snapshots every navigation and distorts the latency being measured.
// Functional browser scenarios retain their failure traces separately.
test.use({ trace: 'off' });

test.skip(
  process.env['RUN_BROWSER_PERFORMANCE'] !== '1' || !localFixturesAvailable,
  'Opt-in local timing; deployed Cloud/browser acceptance remains a separate target measurement.',
);
test('100 warmed browser route reads render bounded cards and record local timings', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'member', '/projects', /Projects/);
  const projectPath = '/projects/20000000-0000-4000-8000-000000000001';
  await page
    .getByRole('main')
    .getByRole('link', { name: /DEMO ·/ })
    .click();
  await page.getByRole('link', { name: 'Open project boards', exact: true }).click();
  const boardLink = page.getByRole('link', { name: 'All Issues', exact: true });
  await expect(boardLink).toBeVisible();
  const boardPath = await boardLink.getAttribute('href');
  if (!boardPath) throw new Error('Board route missing');
  const measurements: { action: string; trials: number; p95Ms: number; maxMs: number }[] = [];
  for (const action of [
    { name: 'project', path: projectPath, heading: /GateGold Demo/ },
    { name: 'board', path: boardPath, heading: 'All Issues' },
  ]) {
    const times: number[] = [];
    for (let i = 0; i < 101; i++) {
      // Navigate through the SPA so in-memory credentials remain valid. A full
      // reload deliberately signs the local user out and is a different test.
      await page
        .getByRole('navigation', { name: 'Main navigation', exact: true })
        .getByRole('link', { name: 'Projects', exact: true })
        .click();
      const start = performance.now();
      await page
        .getByRole('main')
        .getByRole('link', { name: /DEMO ·/ })
        .click();
      if (action.name === 'board') {
        await page.getByRole('link', { name: 'Open project boards', exact: true }).click();
        await page.getByRole('link', { name: 'All Issues', exact: true }).click();
      }
      await expect(page.getByRole('heading', { name: action.heading, exact: true })).toBeVisible();
      await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0);
      if (action.name === 'board') {
        await expect(page.locator('.issue-card').first()).toBeVisible();
        expect(await page.locator('.issue-card').count()).toBeLessThanOrEqual(100);
      }
      if (i > 0) times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    const p95 = times[94];
    const maximum = times[99];
    if (p95 === undefined || maximum === undefined) throw new Error('Timing samples missing');
    measurements.push({ action: action.name, trials: 100, p95Ms: p95, maxMs: maximum });
    expect(p95).toBeLessThanOrEqual(2000);
  }
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await writeFile(
      join(evidence, 'browser-performance-local.json'),
      JSON.stringify(
        {
          environment: 'local Angular development server and small isolated fixture',
          cloudAcceptance: false,
          measurements,
        },
        null,
        2,
      ) + '\n',
    );
  }
});
