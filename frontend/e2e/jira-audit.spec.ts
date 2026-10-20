import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { mkdir } from 'node:fs/promises';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { zSavedIssueView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated local company.');
const demoProject = '20000000-0000-4000-8000-000000000001';

test('blocker lookup accepts a partial project key from a subtask and links the chosen issue', async ({
  page,
  request,
}) => {
  const headers = () => ({ Authorization: '', 'Idempotency-Key': crypto.randomUUID() });
  const authorization = 'Bearer ' + (await token('member'));
  const parentResponse = await request.post(
    apiOrigin + '/api/v1/projects/' + demoProject + '/issues',
    {
      headers: { ...headers(), Authorization: authorization },
      data: { title: 'Prepare launch audit' },
    },
  );
  expect(parentResponse.status()).toBe(201);
  const parent = zSavedIssueView.parse(await parentResponse.json()).result;
  const childResponse = await request.post(
    apiOrigin + '/api/v1/issues/' + parent.summary.id + '/subtasks',
    {
      headers: { ...headers(), Authorization: authorization },
      data: {
        title: 'Review launch checklist',
        expectedParentRevision: parent.summary.revision,
        description: '',
        priority: 'medium',
        assigneeId: null,
        dueDate: null,
        labelIds: [],
      },
    },
  );
  expect(childResponse.status()).toBe(201);
  const child = zSavedIssueView.parse(await childResponse.json()).result;
  const blockerResponse = await request.post(
    apiOrigin + '/api/v1/projects/' + demoProject + '/issues',
    {
      headers: { ...headers(), Authorization: authorization },
      data: { title: 'API contract · عربي', assigneeId: '10000000-0000-4000-8000-000000000001' },
    },
  );
  expect(blockerResponse.status()).toBe(201);
  const blocker = zSavedIssueView.parse(await blockerResponse.json()).result;
  await signIn(page, 'member', '/issues/' + child.summary.id, /^Review launch checklist$/);
  const dependencies = page.getByRole('region', { name: 'Dependencies', exact: true });
  await dependencies.getByRole('button', { name: 'Add blocker', exact: true }).click();
  await dependencies.getByLabel('Find a same-project issue').fill('de');
  await expect(
    dependencies.getByRole('button', {
      name: 'Select blocker ' + blocker.summary.key,
      exact: true,
    }),
  ).toBeVisible();
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence) {
    await mkdir(evidence + '/jira-audit', { recursive: true });
    await dependencies
      .locator('.add-blocker-panel')
      .screenshot({ path: evidence + '/jira-audit/blocker-prefix-search.png' });
  }
  await expect(
    dependencies.getByRole('button', { name: 'Select blocker ' + child.summary.key, exact: true }),
  ).toHaveCount(0);
  await dependencies
    .getByRole('button', { name: 'Select blocker ' + blocker.summary.key, exact: true })
    .click();
  await dependencies.getByRole('button', { name: 'Add selected blocker', exact: true }).click();
  await expect(
    dependencies.getByRole('button', {
      name: 'Remove blocker ' + blocker.summary.key,
      exact: true,
    }),
  ).toBeVisible();
});
