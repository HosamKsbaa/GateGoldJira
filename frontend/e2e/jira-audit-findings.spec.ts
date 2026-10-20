import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { mkdir } from 'node:fs/promises';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import { zModernIssueView, zSavedIssueView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the disposable audit company.');
async function create(request: APIRequestContext, projectId: string, title: string) {
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: {
      Authorization: 'Bearer ' + (await token('member')),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { title },
  });
  expect(response.status()).toBe(201);
  return zSavedIssueView.parse(await response.json()).result;
}

test('AUDIT-02: creating from Backlog should keep the new issue in the backlog', async ({
  page,
  request,
}) => {
  const projectId = await isolatedProject(request);
  await signIn(page, 'member', '/issues?projectId=' + projectId + '&view=backlog', /^Issues$/);
  await page.getByRole('button', { name: 'New issue', exact: true }).click();
  await page.getByLabel('Issue title', { exact: true }).fill('Plan the next release from backlog');
  await page.getByRole('dialog').getByRole('button', { name: 'Create issue', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Plan the next release from backlog', exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1);
  const saved = zModernIssueView.parse(
    await (
      await request.get(apiOrigin + '/api/v2/issues/' + id, {
        headers: { Authorization: 'Bearer ' + (await token('member')) },
      })
    ).json(),
  );
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence) {
    await mkdir(evidence + '/jira-audit', { recursive: true });
    await page.screenshot({ path: evidence + '/jira-audit/17-backlog-create-context.png' });
  }
  expect(saved.summary.backlog).toBe(true);
});

test('AUDIT-03: a broad related-issue lookup should allow reaching results after the first page', async ({
  page,
  request,
}) => {
  const projectId = await isolatedProject(request);
  const root = await create(request, projectId, 'Link work across the team');
  for (let index = 1; index <= 27; index++)
    await create(request, projectId, 'Audit candidate ' + String(index).padStart(2, '0'));
  await signIn(page, 'member', '/issues/' + root.summary.id, /^Link work across the team$/);
  await page.locator('summary').filter({ hasText: 'Related issues' }).click();
  await page.getByLabel('Related issue search').fill('Audit candidate');
  await expect(page.getByRole('button', { name: 'Link issue', exact: true })).toHaveCount(25);
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence) {
    await mkdir(evidence + '/jira-audit', { recursive: true });
    await page.screenshot({ path: evidence + '/jira-audit/18-related-search-pagination.png' });
  }
  await page.getByRole('button', { name: 'More related issues', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Link issue', exact: true })).toHaveCount(27);
  await expect(page.getByRole('button', { name: 'More related issues', exact: true })).toHaveCount(
    0,
  );
});
