import { useCase as recordedUseCase } from './support/use-case';
const useCase = <T>(id: string, body: () => Promise<T>) => recordedUseCase(id, body, 'web');
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject, useModernIssues, coverWorkflowInFixture } from './support/project';
import {
  zConfigurationView,
  zSavedTypeSaved,
  zSavedPrioritySaved,
  zSavedConfigurationView,
  zSavedModernIssueView,
  zModernIssueView,
  zPageStageView,
  zModernPatchFields,
  zSavedWorkflowSaved,
  zSavedStageSaved,
  zSavedTransitionSaved,
  zPageModernIssueSummary,
} from '../src/app/api/generated/zod.gen';
import { modernEditable } from '../src/app/features/issues/issue-model';

test.skip(!localFixturesAvailable, 'Requires isolated company fixtures.');
async function headers(role = 'owner') {
  return { Authorization: 'Bearer ' + (await token(role)), 'Idempotency-Key': crypto.randomUUID() };
}
async function fixture(request: APIRequestContext) {
  const projectId = await isolatedProject(request);
  await useModernIssues(projectId);
  const root = await request.get(apiOrigin + '/api/v2/projects/' + projectId + '/configuration', {
    headers: await headers(),
  });
  expect(root.status()).toBe(200);
  const cfg = zConfigurationView.parse(await root.json());
  const type = await request.put(
    apiOrigin + '/api/v2/projects/' + projectId + '/issue-types/' + crypto.randomUUID(),
    {
      headers: await headers(),
      data: {
        expectedRevision: cfg.revision,
        key: 'story',
        name: 'قصة',
        behavior: 'standard',
        retired: false,
      },
    },
  );
  expect(type.status()).toBe(201);
  const kind = zSavedTypeSaved.parse(await type.json()).result;
  const priority = await request.put(
    apiOrigin + '/api/v2/projects/' + projectId + '/priorities/' + crypto.randomUUID(),
    {
      headers: await headers(),
      data: {
        expectedRevision: kind.configuration.revision,
        key: 'urgent',
        name: 'عاجل',
        sortOrder: '9007199254740993',
        retired: false,
      },
    },
  );
  expect(priority.status()).toBe(201);
  const urgent = zSavedPrioritySaved.parse(await priority.json()).result;
  const defaults = {
    ...cfg.defaults,
    standardTypeId: kind.type.id,
    priorityId: urgent.priority.id,
  };
  const response = await request.put(
    apiOrigin + '/api/v2/projects/' + projectId + '/configuration/defaults',
    {
      headers: await headers(),
      data: { expectedRevision: urgent.configuration.revision, defaults },
    },
  );
  expect(response.status()).toBe(200);
  const configured = zSavedConfigurationView.parse(await response.json()).result;
  const created = await request.post(apiOrigin + '/api/v2/projects/' + projectId + '/issues', {
    headers: await headers('member'),
    data: { title: 'قصة الفريق ' + crypto.randomUUID().slice(0, 8) },
  });
  expect(created.status()).toBe(201);
  return {
    projectId,
    issue: zSavedModernIssueView.parse(await created.json()).result,
    original: cfg.defaults,
    configured,
    type: kind.type,
    priority: urgent.priority,
  };
}
async function current(request: APIRequestContext, id: string) {
  const response = await request.get(apiOrigin + '/api/v2/issues/' + id, {
    headers: await headers('member'),
  });
  expect(response.status()).toBe(200);
  return zModernIssueView.parse(await response.json());
}
async function openField(page: Page, label: string) {
  await page.getByRole('button', { name: 'Edit ' + label, exact: true }).click();
  const field = page.getByRole('group', { name: 'Edit ' + label, exact: true });
  await expect(field).toBeVisible();
  return field;
}

test('native detail retains custom identities, auto-saves fields and progresses through its assigned workflow', async ({
  page,
  request,
}, testInfo) => {
  const f = await fixture(request);
  await signIn(
    page,
    'member',
    '/issues/' + f.issue.summary.id,
    new RegExp('^' + f.issue.summary.title + '$'),
  );
  await expect(page.locator('.issue-metadata')).toContainText('قصة');
  await expect(page.locator('.priority-value')).toHaveText(/عاجل/);
  let field = await openField(page, 'priority');
  await useCase('UC-ISS-0101', async () => {
  await field.getByRole('option', { name: 'High', exact: true }).click();
  await expect(field).toHaveCount(0);
  expect((await current(request, f.issue.summary.id)).summary.priority.key).toBe('high');
  });
  field = await useCase('UC-ISS-0097', async () => openField(page, 'assignee'));
  await useCase('UC-ISS-0099', async () => {
  await field.getByRole('option', { name: 'مطور تجريبي', exact: true }).click();
  await expect(field).toHaveCount(0);
  expect((await current(request, f.issue.summary.id)).summary.assignee?.displayName).toBe('مطور تجريبي');
  });
  field = await openField(page, 'due date');
  await useCase('UC-ISS-0102', async () => {
  await field.getByLabel('due date', { exact: true }).fill('2027-04-17');
  await expect(field).toHaveCount(0);
  expect((await current(request, f.issue.summary.id)).summary.dueDate).toBe('2027-04-17');
  });
  let saved = await current(request, f.issue.summary.id);
  expect(saved.summary.type.id).toBe(f.type.id);
  expect(saved.summary.priority.key).toBe('high');
  expect(saved.summary.assignee?.displayName).toBe('مطور تجريبي');
  expect(saved.summary.dueDate).toBe('2027-04-17');
  await useCase('UC-ISS-0119', async () => {
  await page.getByRole('button', { name: /^Issue status:/ }).click();
  await expect(page.getByRole('menu', { name: 'Issue status', exact: true })).toBeVisible();
  });
  await useCase('UC-ISS-0120', async () => {
  await page.getByRole('menuitemradio', { name: 'Review', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Issue status: Review', exact: true }),
  ).toBeVisible();
  expect((await current(request, f.issue.summary.id)).summary.stage.category).toBe('review');
  });
  saved = await current(request, f.issue.summary.id);
  expect(saved.summary.stage.category).toBe('review');
  expect(saved.summary.workflow.id).toBe(f.issue.summary.workflow.id);
  await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit ' + f.issue.summary.key });
  await expect(dialog.getByLabel('Issue type', { exact: true })).toHaveValue(f.type.id);
  await useCase('UC-ISS-0109', async () => {
  await dialog.getByLabel('Issue title', { exact: true }).fill('Updated custom story');
  await dialog.getByRole('button', { name: 'Save issue', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Updated custom story', exact: true }),
  ).toBeVisible();
  saved = await current(request, f.issue.summary.id);
  expect(saved.summary.type.id).toBe(f.type.id);
  expect(saved.summary.workflow.id).toBe(f.issue.summary.workflow.id);
  });
  await page.screenshot({ path: testInfo.outputPath('native-issue-detail.png'), fullPage: true });
});

test('native create uses current project defaults while existing issues retain their type and workflow', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const changed = await request.put(
    apiOrigin + '/api/v2/projects/' + f.projectId + '/configuration/defaults',
    {
      headers: await headers(),
      data: { expectedRevision: f.configured.revision, defaults: f.original },
    },
  );
  expect(changed.status()).toBe(200);
  await signIn(page, 'member', '/issues?projectId=' + f.projectId + '&create=true', /^Issues$/);
  const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Issue title', { exact: true }).fill('Uses new defaults');
  await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Uses new defaults', exact: true })).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1);
  if (!id) throw new Error('Missing created issue ID');
  const created = await current(request, id);
  expect(created.summary.type.id).toBe(f.original.standardTypeId);
  expect(created.summary.priority.id).toBe(f.original.priorityId);
  const old = await current(request, f.issue.summary.id);
  expect(old.summary.type.id).toBe(f.type.id);
  expect(old.summary.workflow.id).toBe(f.issue.summary.workflow.id);
});

test('lost accepted native priority save retries its original IDs and reference once', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(
    page,
    'member',
    '/issues/' + f.issue.summary.id,
    new RegExp('^' + f.issue.summary.title + '$'),
  );
  await useCase('UC-ISS-0159', async () => {
  const attempts: { reference: string; body: ReturnType<typeof zModernPatchFields.parse> }[] = [];
  await page.route('**/api/v2/issues/' + f.issue.summary.id + '/fields', async route => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    attempts.push({
      reference: route.request().headers()['idempotency-key'] ?? '',
      body: zModernPatchFields.parse(route.request().postDataJSON()),
    });
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    if (attempts.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  const field = await openField(page, 'priority');
  await field.getByRole('option', { name: 'High', exact: true }).click();
  await expect(field.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
  await expect(field.getByRole('option', { name: 'High', exact: true })).toBeDisabled();
  await field.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(field).toHaveCount(0);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  const saved = await current(request, f.issue.summary.id);
  expect(BigInt(saved.summary.revision)).toBe(BigInt(f.issue.summary.revision) + 1n);
  expect(saved.summary.priority.key).toBe('high');
  });
});

test('native selected-field conflict review preserves the draft and latest custom type', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await signIn(
    page,
    'member',
    '/issues/' + f.issue.summary.id,
    new RegExp('^' + f.issue.summary.title + '$'),
  );
  await useCase('UC-ISS-0158', async () => {
  let release = () => {};
  const gate = new Promise<void>(done => {
    release = done;
  });
  let requested = () => {};
  const seen = new Promise<void>(done => {
    requested = done;
  });
  await page.route(
    '**/api/v2/issues/' + f.issue.summary.id + '/fields',
    async route => {
      requested();
      await gate;
      await route.continue();
    },
    { times: 1 },
  );
  const field = await openField(page, 'due date');
  try {
    await field.getByLabel('due date', { exact: true }).fill('2027-05-21');
    await seen;
    const response = await request.put(apiOrigin + '/api/v2/issues/' + f.issue.summary.id, {
      headers: await headers('member'),
      data: {
        expectedRevision: f.issue.summary.revision,
        editable: { ...modernEditable(f.issue), dueDate: '2027-06-01', description: 'تحديث زميل' },
      },
    });
    expect(response.status()).toBe(200);
  } finally {
    release();
  }
  await field.getByRole('button', { name: 'Review latest and keep my draft', exact: true }).click();
  await expect(field.getByLabel('due date', { exact: true })).toHaveValue('2027-05-21');
  await field.getByRole('button', { name: 'Apply reviewed change', exact: true }).click();
  await expect(field).toHaveCount(0);
  const saved = await current(request, f.issue.summary.id);
  expect(saved.summary.dueDate).toBe('2027-05-21');
  expect(saved.description).toBe('تحديث زميل');
  expect(saved.summary.type.id).toBe(f.type.id);
  });
});

test('changing an issue type workflow default leaves existing work on its assigned process', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  let cfg = f.configured;
  const flow = await request.put(
    apiOrigin + '/api/v2/projects/' + f.projectId + '/workflows/' + crypto.randomUUID(),
    {
      headers: await headers(),
      data: { expectedRevision: cfg.revision, name: 'تسليم جديد', retired: false },
    },
  );
  expect(flow.status()).toBe(200);
  const prepared = zSavedWorkflowSaved.parse(await flow.json()).result;
  cfg = prepared.configuration;
  const stage = async (
    name: string,
    category: 'todo' | 'done',
    initial: boolean,
    position: string,
  ) => {
    const response = await request.put(
      apiOrigin +
        '/api/v2/projects/' +
        f.projectId +
        '/workflows/' +
        prepared.workflow.id +
        '/stages/' +
        crypto.randomUUID(),
      {
        headers: await headers(),
        data: {
          expectedRevision: cfg.revision,
          name,
          category,
          position,
          initial,
          acceptsEntries: true,
          retired: false,
        },
      },
    );
    expect(response.status()).toBe(200);
    const result = zSavedStageSaved.parse(await response.json()).result;
    cfg = result.configuration;
    return result.stage;
  };
  const todo = await stage('جاهز جديد', 'todo', true, '1');
  const done = await stage('منتهٍ جديد', 'done', false, '2');
  const move = await request.put(
    apiOrigin +
      '/api/v2/projects/' +
      f.projectId +
      '/workflows/' +
      prepared.workflow.id +
      '/transitions/' +
      crypto.randomUUID(),
    {
      headers: await headers(),
      data: {
        expectedRevision: cfg.revision,
        fromStageId: todo.id,
        toStageId: done.id,
        requiredPermission: null,
        retired: false,
      },
    },
  );
  expect(move.status()).toBe(200);
  cfg = zSavedTransitionSaved.parse(await move.json()).result.configuration;
  await coverWorkflowInFixture(f.projectId, prepared.workflow.id);
  await signIn(page, 'owner', '/projects/' + f.projectId + '/workflows', /^Workflows$/);
  await page.getByRole('combobox', { name: 'Issue type', exact: true }).selectOption(f.type.id);
  await page.getByRole('button', { name: 'Add binding', exact: true }).click();
  await page
    .getByRole('combobox', { name: 'Workflow', exact: true })
    .selectOption(prepared.workflow.id);
  await page.getByLabel('Default for new issues of this type', { exact: true }).check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(
    page.getByText('Changes saved. Existing issues keep their assigned workflow.', { exact: true }),
  ).toBeVisible();
  await signIn(page, 'owner', '/issues?projectId=' + f.projectId, /^Issues$/);
  await page.getByRole('button', { name: 'New issue', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
  await dialog.getByLabel('Issue title', { exact: true }).fill('New process issue');
  await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'New process issue', exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Issue status: جاهز جديد', exact: true }),
  ).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1);
  if (!id) throw new Error('Missing created ID');
  expect((await current(request, id)).summary.workflow.id).toBe(prepared.workflow.id);
  await signIn(
    page,
    'owner',
    '/issues/' + f.issue.summary.id,
    new RegExp('^' + f.issue.summary.title + '$'),
  );
  await page.getByRole('button', { name: 'Issue status: To do', exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Review', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitemradio', { name: 'منتهٍ جديد', exact: true })).toHaveCount(0);
  await page.getByRole('menuitemradio', { name: 'Review', exact: true }).click();
  expect((await current(request, f.issue.summary.id)).summary.workflow.id).toBe(
    f.issue.summary.workflow.id,
  );
});

test('native editing retains retired custom choices and viewer access hides editors', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const reset = await request.put(
    apiOrigin + '/api/v2/projects/' + f.projectId + '/configuration/defaults',
    {
      headers: await headers(),
      data: { expectedRevision: f.configured.revision, defaults: f.original },
    },
  );
  expect(reset.status()).toBe(200);
  let cfg = zSavedConfigurationView.parse(await reset.json()).result;
  const retired = await request.put(
    apiOrigin + '/api/v2/projects/' + f.projectId + '/issue-types/' + f.type.id,
    {
      headers: await headers(),
      data: {
        expectedRevision: cfg.revision,
        key: f.type.key,
        name: f.type.name,
        behavior: f.type.behavior,
        retired: true,
      },
    },
  );
  expect(retired.status()).toBe(200);
  cfg = zSavedTypeSaved.parse(await retired.json()).result.configuration;
  const priority = await request.put(
    apiOrigin + '/api/v2/projects/' + f.projectId + '/priorities/' + f.priority.id,
    {
      headers: await headers(),
      data: {
        expectedRevision: cfg.revision,
        key: f.priority.key,
        name: f.priority.name,
        sortOrder: f.priority.sortOrder,
        retired: true,
      },
    },
  );
  expect(priority.status()).toBe(200);
  await signIn(
    page,
    'member',
    '/issues/' + f.issue.summary.id,
    new RegExp('^' + f.issue.summary.title + '$'),
  );
  await useCase('UC-ISS-0111', async () => {
  await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Edit ' + f.issue.summary.key });
  await expect(dialog.getByLabel('Issue type', { exact: true })).toHaveValue(f.type.id);
  await expect(dialog.getByLabel('Priority', { exact: true })).toHaveValue(f.priority.id);
  await dialog.getByLabel('Issue title', { exact: true }).fill('Retained retired choices');
  await dialog.getByRole('button', { name: 'Save issue', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Retained retired choices', exact: true }),
  ).toBeVisible();
  const saved = await current(request, f.issue.summary.id);
  expect(saved.summary.type.id).toBe(f.type.id);
  expect(saved.summary.type.retired).toBe(true);
  expect(saved.summary.priority.id).toBe(f.priority.id);
  expect(saved.summary.priority.retired).toBe(true);
  });
  await signIn(page, 'viewer', '/issues/' + f.issue.summary.id, /^Retained retired choices$/);
  await useCase('UC-ISS-0169', async () => {
    await expect(page.getByRole('heading', { name: 'Retained retired choices', exact: true })).toBeVisible();
    await expect(page.locator('.issue-metadata')).toContainText(f.type.name);
    await expect(page.locator('.priority-value')).toContainText(f.priority.name);
    for (const name of ['Edit issue', 'Edit title', 'Edit description', 'Edit priority', 'Edit assignee', 'Edit due date'])
      await expect(page.getByRole('button', { name, exact: true })).toHaveCount(0);
    await expect(page.getByText('Read-only access', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Issue status:/ })).toHaveCount(0);
    await expect(page.locator('gg-modern-issue-actions .more-actions')).toHaveCount(0);
    await expect(page.getByRole('menuitemradio')).toHaveCount(0);
    await page.getByRole('link', { name: 'All issues', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Issues', exact: true })).toBeVisible();
    const results = page.getByRole('list', { name: 'Issue results list', exact: true });
    await expect(results.getByRole('link', { name: f.issue.summary.key + ' · Retained retired choices', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'New issue', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Select visible issues', exact: true })).toHaveCount(0);
    await expect(results.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Bulk issue actions', exact: true })).toHaveCount(0);
    // A global Create link may legitimately target another writable project.
    // Open this exact read-only project's creation URI through real sign-in.
    await signIn(page, 'viewer', '/issues?projectId=' + f.projectId + '&create=true', /^Issues$/);
    expect(new URL(page.url()).searchParams.get('create')).toBe('true');
    await expect(page.getByRole('combobox', { name: 'Project', exact: true })).toHaveValue(f.projectId);
    await expect(results.getByRole('link', { name: f.issue.summary.key + ' · Retained retired choices', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'Create issue', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Create issue', exact: true })).toHaveCount(0);
    await expect(results.getByRole('checkbox')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Bulk issue actions', exact: true })).toHaveCount(0);
  });
});

test('native subtasks keep their own default type and live numeric search finds them', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  await signIn(
    page,
    'member',
    '/issues/' + f.issue.summary.id,
    new RegExp('^' + f.issue.summary.title + '$'),
  );
  await page.getByRole('button', { name: 'Add subtask', exact: true }).click();
  const panel = page.locator('.subtask-form');
  await panel.getByLabel('Issue title', { exact: true }).fill('مهمة فرعية جديدة');
  await panel.getByRole('button', { name: 'Create subtask', exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('link', { name: /مهمة فرعية جديدة/ })).toBeVisible();
  const response = await request.post(apiOrigin + '/api/v2/issues/search', {
    headers: await headers('member'),
    data: { filters: { projectIds: [f.projectId], parentId: f.issue.summary.id } },
  });
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  const parsed = zPageModernIssueSummary.parse(body);
  expect(parsed.items).toHaveLength(1);
  const child = parsed.items[0];
  if (!child) throw new Error('Missing child');
  expect(child.type.behavior).toBe('subtask');
  expect(child.parent?.id).toBe(f.issue.summary.id);
  await signIn(page, 'member', '/issues?projectId=' + f.projectId, /^Issues$/);
  await useCase('UC-ISS-0034', async () => {
  await page
    .getByRole('searchbox', { name: 'Search by title or issue key', exact: true })
    .fill(child.number);
  await expect(page.getByRole('heading', { name: 'Results · 1', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /مهمة فرعية جديدة/ })).toBeVisible();
  await expect(
    page.getByRole('link', {
      name: new RegExp(f.issue.summary.key + ' · ' + f.issue.summary.title),
    }),
  ).toHaveCount(0);
  });
});
