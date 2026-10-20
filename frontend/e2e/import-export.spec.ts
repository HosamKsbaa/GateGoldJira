import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { readFile } from 'node:fs/promises';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import { zSavedImportResult, zPageIssueSummary } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires isolated local projects and CSV endpoints.');
test('CSV mapping previews row errors, preserves uncertain retries and round-trips existing source keys', async ({
  page,
  request,
}) => {
  const projectId = await isolatedProject(request);
  await signIn(page, 'member', '/projects/' + projectId + '/import-export', /^Import and export$/);
  const csv =
    'Work,Notes,Owner,Tags,External ID\nUX CSV عربي,=2+2,مطور تجريبي,backend;واجهة,OLD-1\nUX CSV second,Ready,,backend,OLD-2\n,Incomplete,,,OLD-3\n';
  async function load(csv: string) {
    await page
      .getByLabel('Choose CSV file', { exact: true })
      .setInputFiles({ name: 'migration.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    for (const [field, column] of [
      ['Title · Required', 'Work'],
      ['Description', 'Notes'],
      ['Assignee', 'Owner'],
      ['Labels', 'Tags'],
      ['Source key', 'External ID'],
    ] as const)
      await page.getByRole('combobox', { name: field, exact: true }).selectOption(column);
    await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  }
  await load(csv);
  await expect(page.getByText('2 valid rows', { exact: true })).toBeVisible();
  await expect(page.getByText('1 rows need attention', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Import valid rows', exact: true })).toBeDisabled();
  await page
    .getByRole('checkbox', {
      name: 'I reviewed this preview and want to import its valid rows.',
      exact: true,
    })
    .check();
  const references: string[] = [];
  let attempts = 0;
  await page.route('**/api/v1/projects/' + projectId + '/issues/import', async route => {
    references.push(route.request().headers()['idempotency-key'] ?? '');
    const response = await route.fetch();
    attempts++;
    if (attempts === 1) {
      await route.abort('failed');
      return;
    }
    expect(zSavedImportResult.parse(await response.json()).receipt.replayed).toBe(true);
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Import valid rows', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('try again');
  await expect(
    page.getByRole('combobox', { name: 'Title · Required', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Import valid rows', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Import result', exact: true })).toContainText(
    '2 created · 0 existing · 1 failed',
  );
  expect(references).toHaveLength(2);
  expect(references[0]).toBeTruthy();
  expect(references[0]).toBe(references[1]);
  await page.unroute('**/api/v1/projects/' + projectId + '/issues/import');
  await page.getByRole('button', { name: 'Start a new import', exact: true }).click();
  await load(csv.replace('\n,Incomplete,,,OLD-3', '\nUX CSV corrected,Complete,,,OLD-3'));
  await expect(page.getByText('3 valid rows', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Existing issue · will reuse', exact: true }),
  ).toHaveCount(2);
  await page
    .getByRole('checkbox', {
      name: 'I reviewed this preview and want to import its valid rows.',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Import valid rows', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Import result', exact: true })).toContainText(
    '1 created · 2 existing · 0 failed',
  );
  await page.getByLabel('Issue key or title', { exact: true }).fill('UX CSV');
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const download = await downloading,
    path = await download.path();
  if (!path) throw new Error('CSV download was unavailable.');
  const exported = await readFile(path, 'utf8');
  expect(exported).toContain('UX CSV عربي');
  expect(exported).toContain("'=2+2");
  expect(exported).toContain(Buffer.from('OLD-1').toString('base64url'));
  expect(exported).toContain(Buffer.from('OLD-3').toString('base64url'));
  expect(exported).toContain('sourceKey,sourceKeyEncoding');
  expect(exported.split('base64url-v1')).toHaveLength(4);
  expect(
    exported.split('\n').filter(line => line.startsWith('key,title,description,')),
  ).toHaveLength(1);
  await page.getByRole('button', { name: 'Start a new import', exact: true }).click();
  await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles({
    name: 'exported-issues.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(exported),
  });
  await expect(page.getByRole('combobox', { name: 'Title · Required', exact: true })).toHaveValue(
    '',
  );
  await expect(page.getByRole('combobox', { name: 'Source key', exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.getByText('3 valid rows', { exact: true })).toBeVisible();
  await expect(page.getByText('0 rows need attention', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Existing issue · will reuse', exact: true }),
  ).toHaveCount(3);
  await page
    .getByRole('checkbox', {
      name: 'I reviewed this preview and want to import its valid rows.',
      exact: true,
    })
    .check();
  await page.getByRole('button', { name: 'Import valid rows', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Import result', exact: true })).toContainText(
    '0 created · 3 existing · 0 failed',
  );
  const search = await request.post(apiOrigin + '/api/v1/issues/search', {
    headers: { Authorization: 'Bearer ' + (await token('member')) },
    data: { filters: { projectIds: [projectId], query: 'UX CSV' }, page: { limit: 25 } },
  });
  expect(search.status()).toBe(200);
  expect(zPageIssueSummary.parse(await search.json()).totalMatching).toBe(3);
  if (process.env['GATEGOLD_E2E_EVIDENCE']) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/csv-import-export.png',
      fullPage: true,
    });
  }
  await signIn(page, 'viewer', '/projects/' + projectId + '/import-export', /^Import and export$/);
  await expect(page.getByLabel('Choose CSV file', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Export CSV', exact: true })).toBeVisible();
});
