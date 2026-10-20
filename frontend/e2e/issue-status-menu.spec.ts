import { useCase } from './support/use-case';
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import {
  zBoardView,
  zModernIssueView,
  zPageBoardSummary,
  zSavedIssueView,
} from '../src/app/api/generated/zod.gen';
import { defaultWorkflow } from '../src/app/features/boards/board-workflow';
import type { UpdateBoardFields } from '../src/app/api/generated/types.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated local company.');
async function headers(role: 'member' | 'owner' = 'member') {
  return { Authorization: 'Bearer ' + (await token(role)), 'Idempotency-Key': crypto.randomUUID() };
}
async function fixture(request: APIRequestContext) {
  const projectId = await isolatedProject(request);
  const made = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: await headers(),
    data: { title: 'Choose an issue stage' },
  });
  expect(made.status()).toBe(201);
  const issue = zSavedIssueView.parse(await made.json()).result;
  const boards = zPageBoardSummary.parse(
    await (
      await request.get(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
        headers: await headers(),
      })
    ).json(),
  );
  const board = boards.items[0];
  if (!board) throw new Error('Missing fixture board');
  return { issue, board };
}

test('one click shows stages in the board drawer, keyboard and mobile clicks move the issue', async ({
  page,
  request,
}) => {
  const { issue, board } = await fixture(request);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + board.name + '$'));
  await page.getByRole('link', { name: issue.summary.title, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Issue preview', exact: true });
  const trigger = drawer.getByRole('button', { name: /^Issue status:/ });
  const menu = drawer.getByRole('menu', { name: 'Issue status', exact: true });
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  for (const name of ['To do', 'In progress', 'Review', 'Done'])
    await expect(menu.getByRole('menuitemradio', { name, exact: true })).toBeVisible();
  await expect(menu.getByRole('menuitemradio', { name: 'To do', exact: true })).toBeFocused();
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence)
    await page.screenshot({ path: evidence + '/issue-refactor/status-dropdown-desktop.png' });
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitemradio', { name: 'In progress', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(drawer).toBeVisible();
  await trigger.press('ArrowDown');
  await expect(menu.getByRole('menuitemradio', { name: 'To do', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitemradio', { name: 'In progress', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAccessibleName('Issue status: In progress');
  await expect(trigger).toBeEnabled();
  await expect(menu).toHaveCount(0);
  const saved = zModernIssueView.parse(
    await (
      await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
        headers: await headers(),
      })
    ).json(),
  );
  expect(saved.summary.stage.category).toBe('in_progress');

  await trigger.click();
  await drawer.getByRole('heading', { name: 'Description', exact: true }).click();
  await expect(menu).toHaveCount(0);
  await trigger.click();
  await page.keyboard.press('Tab');
  await expect(menu).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(menu.getByRole('menuitemradio', { name: 'Review', exact: true })).toBeVisible();
  expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  if (evidence)
    await page.screenshot({ path: evidence + '/issue-refactor/status-dropdown-mobile.png' });
  await menu.getByRole('menuitemradio', { name: 'Review', exact: true }).click();
  await expect(trigger).toHaveAccessibleName('Issue status: Review');
  await drawer.getByRole('button', { name: 'Close issue', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Review column', exact: true })
      .getByRole('link', { name: issue.summary.title, exact: true }),
  ).toBeVisible();
});

test('rapid keyboard navigation preserves the intended stage before the menu renders', async ({
  page,
  request,
}) => {
  await useCase('UC-ISS-0179', async () => {
  const { issue } = await fixture(request);
  await signIn(page, 'member', '/issues/' + issue.summary.id, /^Choose an issue stage$/);
  const trigger = page.getByRole('button', { name: /^Issue status:/ });
  await trigger.focus();
  let releaseChoices = (): void => {};
  const choicesGate = new Promise<void>(resolve => {
    releaseChoices = resolve;
  });
  let started = (): void => {};
  const requested = new Promise<void>(resolve => {
    started = resolve;
  });
  await page.route('**/api/v2/issues/' + issue.summary.id + '/transitions*', async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    started();
    await choicesGate;
    await route.fulfill({ response });
  });
  // Dispatch all keys in one browser task so deferred menu rendering cannot settle between them.
  await trigger.evaluate(element => {
    for (const key of ['ArrowDown', 'ArrowDown', 'Enter']) {
      element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    }
  });
  await requested;
  await expect(trigger).toHaveAccessibleName('Issue status: To do');
  releaseChoices();
  await expect(trigger).toHaveAccessibleName('Issue status: In progress');
  await expect(trigger).toBeEnabled();
  await expect(page.getByRole('menu', { name: 'Issue status', exact: true })).toHaveCount(0);
  const saved = zModernIssueView.parse(
    await (
      await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
        headers: await headers(),
      })
    ).json(),
  );
  expect(saved.summary.stage.category).toBe('in_progress');

  }, 'web');
});

test('custom stages appear, restricted moves are disabled, and failed moves retain the saved status', async ({
  page,
  request,
}) => {
  const { issue, board } = await fixture(request);
  const view = zBoardView.parse(
    await (
      await request.get(apiOrigin + '/api/v1/boards/' + board.id, { headers: await headers() })
    ).json(),
  );
  const qa = 'review:' + crypto.randomUUID();
  const workflow = defaultWorkflow();
  workflow.columns = workflow.columns.map(column => ({
    ...column,
    allowedTargets: column.status === 'todo' ? ['in_progress', qa] : [...column.allowedTargets, qa],
  }));
  workflow.columns.push({ status: qa, name: 'QA عربي', allowedTargets: ['review', 'done'] });
  const body: UpdateBoardFields = {
    expectedRevision: view.board.revision,
    name: board.name,
    savedFilters: {},
    wipLimits: view.board.wipLimits,
    workflow,
  };
  expect(
    (
      await request.put(apiOrigin + '/api/v1/boards/' + board.id, {
        headers: await headers('owner'),
        data: body,
      })
    ).status(),
  ).toBe(200);
  await signIn(page, 'member', '/issues/' + issue.summary.id, /^Choose an issue stage$/);
  const trigger = page.getByRole('button', { name: /^Issue status:/ });
  const menu = page.getByRole('menu', { name: 'Issue status', exact: true });
  await trigger.click();
  await expect(menu.getByRole('menuitemradio', { name: /^Done/ })).toHaveCount(0);
  await expect(menu.getByRole('menuitemradio', { name: 'QA عربي', exact: true })).toBeVisible();
  // End skips the unavailable stages and reaches the custom stage.
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitemradio', { name: 'QA عربي', exact: true })).toBeFocused();
  await page.route(
    '**/api/v2/issues/' + issue.summary.id + '/move',
    route => route.abort('failed'),
    { times: 1 },
  );
  await page.keyboard.press('Enter');
  await expect(page.locator('gg-modern-issue-actions').getByRole('alert')).toBeVisible();
  await expect(trigger).toHaveAccessibleName('Issue status: To do');
  await trigger.click();
  await menu.getByRole('menuitemradio', { name: 'QA عربي', exact: true }).click();
  await expect(trigger).toHaveAccessibleName('Issue status: QA عربي');
  const saved = zModernIssueView.parse(
    await (
      await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
        headers: await headers(),
      })
    ).json(),
  );
  expect(saved.summary.stage.name).toBe('QA عربي');
  await signIn(page, 'viewer', '/issues/' + issue.summary.id, /^Choose an issue stage$/);
  await expect(trigger).toHaveCount(0);
  await expect(page.locator('.readonly-status')).toContainText('QA عربي');
});

test('priority and assignee choices appear on the first click, dismiss without changes, and save keyboard choices immediately', async ({
  page,
  request,
}) => {
  const { issue } = await fixture(request);
  await signIn(page, 'member', '/issues/' + issue.summary.id, /^Choose an issue stage$/);
  // Text clicks do not inherit the edit trigger's disabled actionability guard.
  await expect(page.getByRole('button', { name: 'Edit priority', exact: true })).toBeEnabled();
  await page.locator('.priority-value').click();
  const editor = page.getByRole('group', { name: 'Edit priority', exact: true });
  for (const name of ['Low', 'Medium', 'High'])
    await expect(editor.getByRole('option', { name, exact: true })).toBeVisible();
  await expect(editor.getByRole('option', { name: 'Medium', exact: true })).toBeFocused();
  await expect(editor.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(editor).toHaveCount(0);
  await expect(page.locator('.priority-value')).toContainText('Medium');
  await expect(page.getByRole('button', { name: 'Edit priority', exact: true })).toBeFocused();
  await page.locator('.priority-value').click();
  await expect(editor.getByRole('option', { name: 'Medium', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(editor.getByRole('option', { name: 'High', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(editor).toHaveCount(0);
  await expect(page.locator('.priority-value')).toContainText('High');
  await expect(page.getByRole('button', { name: 'Edit priority', exact: true })).toBeFocused();
  await page.locator('gg-modern-issue-field-editor .person-value').click();
  const assignee = page.getByRole('group', { name: 'Edit assignee', exact: true });
  await expect(assignee.getByRole('option', { name: 'Unassigned', exact: true })).toBeVisible();
  await expect(assignee.getByRole('option', { name: 'مطور تجريبي', exact: true })).toBeVisible();
  await expect(assignee.getByLabel('Find teammate', { exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(assignee).toHaveCount(0);
  const saved = zModernIssueView.parse(
    await (
      await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
        headers: await headers(),
      })
    ).json(),
  );
  expect(saved.summary.priority.key).toBe('high');
  expect(saved.summary.assignee).toBeNull();
});
