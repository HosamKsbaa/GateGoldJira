import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import {useCase} from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject, useModernIssues } from './support/project';
import {
  zConfigurationView,
  zPageTypeView,
  zPageFieldDefinition,
  zPageWorkflowView,
  zSavedModernIssueView,
  zModernIssueView,
  zPagePriorityView,
  zPageMembershipView,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated browser company.');
async function headers() {
  return {
    Authorization: 'Bearer ' + (await token('owner')),
    'Idempotency-Key': crypto.randomUUID(),
  };
}
async function configuration(request: APIRequestContext, projectId: string) {
  const response = await request.get(
    apiOrigin + '/api/v2/projects/' + projectId + '/configuration',
    { headers: await headers() },
  );
  expect(response.status()).toBe(200);
  return zConfigurationView.parse(await response.json());
}
// Simulate same-route browser history navigation without reloading the SPA or
// reaching into Angular internals. This exercises reuse and real router guards.
async function historyNavigate(page: Page, path: string) {
  await page.evaluate(destination => {
    history.pushState(null, '', destination);
    dispatchEvent(new PopStateEvent('popstate'));
  }, path);
}

for (const editor of [
  {
    section: 'settings',
    heading: 'Issue configuration',
    resource: 'issue-types',
    button: 'Add issue type',
    label: 'Type name',
    submit: 'Save issue type',
  },
  {
    section: 'workflows',
    heading: 'Workflows',
    resource: 'workflows',
    button: 'Create workflow',
    label: 'Workflow name',
    submit: 'Save changes',
  },
  {
    section: 'fields',
    heading: 'Custom fields',
    resource: 'fields',
    button: 'Add field',
    label: 'Name',
    submit: 'Save field',
  },
]) {
  test(`${editor.section} history navigation saves only in the newly selected project`, async ({
    page,
    request,
  }) => {
    const scenario=async()=>{
    const first = await isolatedProject(request),
      second = await isolatedProject(request);
    await signIn(
      page,
      'owner',
      `/projects/${first}/${editor.section}`,
      new RegExp('^' + editor.heading + '$'),
    );
    await expect(page.getByRole('button', { name: editor.button, exact: true })).toBeEnabled();
    const loaded = page.waitForResponse(
      response =>
        response.request().method() === 'GET' &&
        response.url().includes(`/api/v2/projects/${second}/${editor.resource}`),
    );
    await historyNavigate(page, `/projects/${second}/${editor.section}`);
    expect((await loaded).status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`/projects/${second}/${editor.section}$`));
    await expect(page.getByRole('button', { name: editor.button, exact: true })).toBeEnabled();
    await page.getByRole('button', { name: editor.button, exact: true }).click();
    await page.getByLabel(editor.label, { exact: true }).fill('Only the second project');
    if (editor.section === 'fields')
      await page.getByLabel('Stable key', { exact: true }).fill('second_only');
    const saved = page.waitForResponse(
      response =>
        response.request().method() === 'PUT' &&
        response.url().includes(`/api/v2/projects/${second}/${editor.resource}/`),
    );
    await page.getByRole('button', { name: editor.submit, exact: true }).click();
    expect((await saved).ok()).toBe(true);
    const original = await request.get(apiOrigin + `/api/v2/projects/${first}/${editor.resource}`, {
      headers: await headers(),
    });
    expect(original.status()).toBe(200);
    const body: unknown = await original.json();
    const rows =
      editor.section === 'settings'
        ? zPageTypeView.parse(body).items
        : editor.section === 'fields'
          ? zPageFieldDefinition.parse(body).items
          : zPageWorkflowView.parse(body).items;
    expect(rows.some(row => row.name === 'Only the second project')).toBe(false);
    expect((await configuration(request, first)).revision).toBe('1');
    };
    if(editor.section==='workflows')await useCase('UC-WFL-0088',scenario,'web');else await scenario();
  });
}

test('membership history navigation changes access only in the current project', async ({
  page,
  request,
}) => {
  const first = await isolatedProject(request),
    second = await isolatedProject(request);
  await signIn(page, 'owner', `/admin/projects/${first}/memberships`, /^Project access$/);
  await expect(page.getByLabel('Approved user', { exact: true })).toBeEnabled();
  const loaded = page.waitForResponse(
    response =>
      response.request().method() === 'GET' &&
      response.url().includes(`/api/v1/projects/${second}/memberships`),
  );
  await historyNavigate(page, `/admin/projects/${second}/memberships`);
  expect((await loaded).status()).toBe(200);
  await page
    .getByRole('combobox', { name: 'Approved user', exact: true })
    .selectOption('10000000-0000-4000-8000-000000000003');
  await page.getByRole('combobox', { name: 'Project role', exact: true }).selectOption('member');
  const saved = page.waitForResponse(
    response =>
      response.request().method() === 'PUT' &&
      response.url().includes(`/api/v1/projects/${second}/memberships/`),
  );
  await page.getByRole('button', { name: 'Save membership', exact: true }).click();
  expect((await saved).status()).toBe(200);
  const original = await request.get(apiOrigin + `/api/v1/projects/${first}/memberships`, {
    headers: await headers(),
  });
  expect(original.status()).toBe(200);
  expect(
    zPageMembershipView
      .parse(await original.json())
      .items.find(item => item.user.id === '10000000-0000-4000-8000-000000000003')?.role,
  ).toBe('viewer');
});

test('project switches respect dirty workflow cancellation and destination access guards', async ({
  page,
  request,
}) => {
  const first = await isolatedProject(request),
    second = await isolatedProject(request);
  await signIn(page, 'owner', `/projects/${first}/workflows`, /^Workflows$/);
  await page.getByRole('button', { name: 'Create workflow', exact: true }).click();
  await page.getByLabel('Workflow name', { exact: true }).fill('Retained until I leave');
  await useCase('UC-WFL-0087',async()=>{
  let confirmations=0;
  page.once('dialog', dialog => {expect(dialog.type()).toBe('confirm');confirmations++;void dialog.dismiss();});
  await historyNavigate(page, `/projects/${second}/workflows`);
  await expect(page).toHaveURL(new RegExp(`/projects/${first}/workflows$`));
  await expect(page.getByLabel('Workflow name', { exact: true })).toHaveValue(
    'Retained until I leave',
  );
  expect(confirmations).toBe(1);
  },'web');
  page.once('dialog', dialog => dialog.accept());
  await historyNavigate(page, `/projects/${second}/workflows`);
  await expect(page).toHaveURL(new RegExp(`/projects/${second}/workflows$`));
  await expect(page.getByLabel('Workflow name', { exact: true })).toHaveCount(0);
  const promoted = await request.put(
    apiOrigin + `/api/v1/projects/${first}/memberships/10000000-0000-4000-8000-000000000002`,
    {
      headers: await headers(),
      data: { expectedRevision: '1', role: 'project_admin' },
    },
  );
  expect(promoted.status()).toBe(200);
  await signIn(page, 'member', `/projects/${first}/settings`, /^Issue configuration$/);
  await historyNavigate(page, `/projects/${second}/settings`);
  await expect(page).toHaveURL(new RegExp(`/projects/${second}$`));
  await expect(page.getByRole('heading', { name: 'Issue configuration', exact: true })).toHaveCount(
    0,
  );
});

async function createIssue(request: APIRequestContext, projectId: string) {
  const response = await request.post(apiOrigin + `/api/v2/projects/${projectId}/issues`, {
    headers: await headers(),
    data: { title: 'Scoped bulk issue' },
  });
  expect(response.status()).toBe(201);
  return zSavedModernIssueView.parse(await response.json()).result;
}
test('bulk project/workflow switches discard stale stage and priority targets before applying', async ({
  page,
  request,
}) => {
  await useCase('UC-ISS-0143', async () => {
  const first = await isolatedProject(request),
    second = await isolatedProject(request);
  await useModernIssues(first);
  await useModernIssues(second);
  const a = await createIssue(request, first),
    b = await createIssue(request, second);
  await signIn(page, 'owner', '/issues?projectId=' + first, /^Issues$/);
  const project = page.getByRole('combobox', { name: 'Project', exact: true });
  for (
    let i = 0;
    i < 20 && (await project.locator(`option[value="${second}"]`).count()) === 0;
    i++
  ) {
    await Promise.all([
      page.waitForResponse(
        response =>
          response.request().method() === 'GET' && response.url().includes('/api/v1/projects?'),
      ),
      page.getByRole('button', { name: 'More projects', exact: true }).click(),
    ]);
  }
  await expect(project.locator(`option[value="${second}"]`)).toHaveCount(1);
  await page.getByRole('checkbox', { name: 'Select issue ' + a.summary.key, exact: true }).check();
  const choices = await request.get(apiOrigin + `/api/v2/projects/${first}/priorities`, {
    headers: await headers(),
  });
  const priority = zPagePriorityView
    .parse(await choices.json())
    .items.find(item => item.key === 'low');
  if (!priority) throw new Error('Missing first-project priority');
  await page
    .getByRole('combobox', { name: 'Bulk priority', exact: true })
    .selectOption(priority.id);
  await page.getByRole('combobox', { name: 'Bulk action', exact: true }).selectOption('status');
  await page
    .getByRole('combobox', { name: 'Bulk target stage', exact: true })
    .selectOption({ label: 'In progress' });
  const oldStage = await page.getByLabel('Bulk target stage', { exact: true }).inputValue();
  await project.selectOption(second);
  await page.getByRole('checkbox', { name: 'Select issue ' + b.summary.key, exact: true }).check();
  await expect(page.getByLabel('Bulk target stage', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Bulk target stage', { exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Apply to selected', exact: true })).toBeDisabled();
  expect(
    await page
      .getByLabel('Bulk target stage', { exact: true })
      .locator(`option[value="${oldStage}"]`)
      .count(),
  ).toBe(0);
  await page
    .getByRole('combobox', { name: 'Bulk target stage', exact: true })
    .selectOption({ label: 'In progress' });
  await page.getByRole('button', { name: 'Apply to selected', exact: true }).click();
  await expect(
    page.getByText('1 issue(s) saved; 0 need attention.', { exact: true }),
  ).toBeVisible();
  const current = await request.get(apiOrigin + '/api/v2/issues/' + a.summary.id, {
    headers: await headers(),
  });
  expect(zModernIssueView.parse(await current.json()).summary).toEqual(a.summary);
  await page.getByRole('checkbox', { name: 'Select issue ' + b.summary.key, exact: true }).check();
  await page.getByRole('combobox', { name: 'Bulk action', exact: true }).selectOption('priority');
  await expect(page.getByLabel('Bulk priority', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Apply to selected', exact: true })).toBeDisabled();

  }, 'web');
});
