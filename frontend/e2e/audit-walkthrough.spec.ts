import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  apiOrigin,
  configureLocalSignIn,
  localFixturesAvailable,
  signIn,
  token,
} from './support/session';
import { zSavedIssueView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the disposable audit company.');
const projectId = '20000000-0000-4000-8000-000000000001';
const boardId = '30000000-0000-4000-8000-000000000001';

test('capture the complete workspace journey for the Jira usability audit', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const directory = process.env['GATEGOLD_E2E_EVIDENCE'] + '/jira-audit';
  await mkdir(directory, { recursive: true });
  const observations: {
    step: string;
    url: string;
    pageOverflow: boolean;
    smallControls: number;
    alerts: string[];
  }[] = [];
  async function capture(step: string, fullPage = false) {
    await expect(
      page.getByText(/^Loading(?:…| your workspace…| board…| boards…| issues…)$/),
    ).toHaveCount(0);
    await page.screenshot({ path: directory + '/' + step + '.png', fullPage });
    const measurements = await page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      smallControls: [...document.querySelectorAll('button,a,input,select')].filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.width < 24 || rect.height < 24);
      }).length,
    }));
    observations.push({
      step,
      url: new URL(page.url()).pathname,
      ...measurements,
      alerts: await page.getByRole('alert').allTextContents(),
    });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await configureLocalSignIn(page);
  await page.goto('/');
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  await capture('01-sign-in');
  await signIn(page, 'owner');
  await capture('02-workspace');
  await signIn(page, 'owner', '/projects', /^Projects$/);
  await capture('03-projects');
  await signIn(page, 'owner', '/projects/' + projectId, /^GateGold Demo/);
  await capture('04-project-overview');
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: {
      Authorization: 'Bearer ' + (await token('owner')),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: {
      title: 'Ship the team workspace · تحسين تجربة الفريق',
      description:
        '<h3>Acceptance criteria</h3><ul><li>Review permissions and attachments</li><li>Verify the Arabic collaboration flow</li></ul>',
      descriptionFormat: 'html',
      assigneeId: '10000000-0000-4000-8000-000000000002',
    },
  });
  expect(response.status()).toBe(201);
  const issue = zSavedIssueView.parse(await response.json()).result;
  const backlogResponse = await request.post(
    apiOrigin + '/api/v1/projects/' + projectId + '/issues',
    {
      headers: {
        Authorization: 'Bearer ' + (await token('owner')),
        'Idempotency-Key': crypto.randomUUID(),
      },
      data: { title: 'Plan the next release', priority: 'high' },
    },
  );
  expect(backlogResponse.status()).toBe(201);
  const planned = zSavedIssueView.parse(await backlogResponse.json()).result;
  expect(
    (
      await request.post(apiOrigin + '/api/v1/issues/' + planned.summary.id + '/organize', {
        headers: {
          Authorization: 'Bearer ' + (await token('owner')),
          'Idempotency-Key': crypto.randomUUID(),
        },
        data: { expectedRevision: planned.summary.revision, backlog: true },
      })
    ).status(),
  ).toBe(200);
  await signIn(page, 'member', '/boards/' + boardId, /^All Issues$/);
  await expect(page.locator('gg-native-issue-card').first()).toBeVisible();
  await capture('05-board');
  await page.getByRole('button', { name: 'Create issue', exact: true }).first().click();
  await expect(page.getByLabel('Description', { exact: true })).toBeVisible();
  await capture('06-create-issue');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('link', { name: issue.summary.title, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Issue preview', exact: true });
  await expect(
    drawer.getByRole('heading', { name: issue.summary.title, exact: true }),
  ).toBeVisible();
  await capture('07-issue-drawer');
  await drawer.getByRole('button', { name: 'Add comment', exact: true }).click();
  await expect(drawer.getByRole('textbox', { name: 'Comment text', exact: true })).toBeFocused();
  await capture('08-collaboration');
  await drawer.getByRole('button', { name: 'Close issue', exact: true }).click();
  await signIn(page, 'owner', '/boards/' + boardId + '/settings', /^Board settings$/);
  await expect(page.getByRole('button', { name: 'Add column', exact: true })).toBeVisible();
  await capture('09-workflow', true);
  await signIn(page, 'member', '/issues?projectId=' + projectId + '&view=backlog', /^Issues$/);
  await expect(
    page.getByRole('link', { name: planned.summary.key + ' · Plan the next release', exact: true }),
  ).toBeVisible();
  await capture('10-backlog');
  await signIn(page, 'member', '/notifications', /^Inbox$/);
  await expect(
    page.getByRole('button', { name: 'Open issue ' + issue.summary.key, exact: true }),
  ).toBeVisible();
  await capture('11-notifications');
  await signIn(page, 'owner', '/admin/users', /^Company users$/);
  await capture('12-user-administration');
  await signIn(page, 'owner', '/admin/projects/' + projectId + '/memberships', /^Project access$/);
  await capture('13-project-access');
  await signIn(page, 'owner', '/admin/activity', /^Company activity$/);
  await capture('14-activity');
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'member', '/boards/' + boardId, /^All Issues$/);
  await capture('15-mobile-board');
  await page.getByRole('link', { name: issue.summary.title, exact: true }).click();
  await expect(
    drawer.getByRole('heading', { name: issue.summary.title, exact: true }),
  ).toBeVisible();
  await capture('16-mobile-issue');
  expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await writeFile(directory + '/observations.json', JSON.stringify(observations, null, 2) + '\n');
});
