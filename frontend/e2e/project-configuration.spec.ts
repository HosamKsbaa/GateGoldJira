import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import {
  zConfigurationView,
  zPageTypeView,
  zPagePriorityView,
  zSavedPrioritySaved,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires isolated local company fixtures.');
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
async function promote(request: APIRequestContext, projectId: string) {
  const response = await request.put(
    apiOrigin +
      '/api/v1/projects/' +
      projectId +
      '/memberships/10000000-0000-4000-8000-000000000002',
    { headers: await headers(), data: { expectedRevision: '1', role: 'project_admin' } },
  );
  expect(response.status()).toBe(200);
}

test('project admins configure Arabic choices and manage people only in their project', async ({
  page,
  request,
}) => {
  const projectId = await isolatedProject(request);
  await promote(request, projectId);
  await signIn(page, 'member', '/projects/' + projectId + '/settings', /^Issue configuration$/);
  await expect(page.getByRole('button', { name: 'Add issue type', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Add issue type', exact: true }).click();
  await page.getByLabel('Type name', { exact: true }).fill('قصة الفريق 😀');
  await page.getByRole('button', { name: 'Save issue type', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Issue type saved.' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: 'قصة الفريق 😀' })).toBeVisible();
  await page.getByRole('button', { name: 'Priorities', exact: true }).click();
  await page.getByRole('button', { name: 'Add priority', exact: true }).click();
  await page.getByLabel('Priority name', { exact: true }).fill('عاجل');
  await page.getByLabel('Order', { exact: true }).fill('9007199254740993');
  await page.getByRole('button', { name: 'Save priority', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'عاجل' })).toContainText('9007199254740993');
  const response = await request.get(apiOrigin + '/api/v2/projects/' + projectId + '/priorities', {
    headers: await headers(),
  });
  expect(response.status()).toBe(200);
  const priorities = zPagePriorityView.parse(await response.json());
  expect(priorities.items.find(p => p.name === 'عاجل')?.sortOrder).toBe('9007199254740993');
  await page.getByRole('button', { name: 'Creation defaults', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save defaults', exact: true })).toBeDisabled();
  await page.getByRole('link', { name: 'Manage people', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Project access', level: 1 })).toBeVisible();
  await page
    .getByRole('combobox', { name: 'Approved user', exact: true })
    .selectOption('10000000-0000-4000-8000-000000000003');
  await page.getByRole('combobox', { name: 'Project role', exact: true }).selectOption('member');
  await page.getByRole('button', { name: 'Save membership', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Project role saved.' })).toBeVisible();
  const other = await isolatedProject(request);
  await signIn(page, 'member', '/projects/' + other + '/settings', /^Isolated workflow /);
  await expect(page).toHaveURL(new RegExp('/projects/' + other + '$'));
  await expect(page.getByRole('heading', { name: 'Issue configuration' })).toHaveCount(0);
});

test('a lost accepted taxonomy save freezes its fields and retries the original reference once', async ({
  page,
  request,
}) => {
  const projectId = await isolatedProject(request);
  await signIn(page, 'owner', '/projects/' + projectId + '/settings', /^Issue configuration$/);
  await expect(page.getByRole('button', { name: 'Add issue type', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Priorities', exact: true }).click();
  await page.getByRole('button', { name: 'Add priority', exact: true }).click();
  await page.getByLabel('Priority name', { exact: true }).fill('Response lost priority');
  let accepted = false;
  const references: string[] = [];
  await page.route('**/api/v2/projects/' + projectId + '/priorities/*', async route => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    references.push(route.request().headers()['idempotency-key'] ?? '');
    if (!accepted) {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      zSavedPrioritySaved.parse(await response.json());
      accepted = true;
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Save priority', exact: true }).click();
  await expect(page.getByLabel('Priority name', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Retry original save', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Response lost priority' })).toHaveCount(1);
  expect(references).toHaveLength(2);
  expect(references[0]).not.toBe('');
  expect(references[1]).toBe(references[0]);
  expect((await configuration(request, projectId)).revision).toBe('2');
});

test('configuration conflict review preserves the draft and unrelated new choices', async ({
  page,
  request,
}) => {
  const projectId = await isolatedProject(request);
  await signIn(page, 'owner', '/projects/' + projectId + '/settings', /^Issue configuration$/);
  await expect(page.getByRole('button', { name: 'Add issue type', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Edit issue type Task', exact: true }).click();
  await page.getByLabel('Type name', { exact: true }).fill('Task revised');
  const response = await request.put(
    apiOrigin + '/api/v2/projects/' + projectId + '/priorities/' + crypto.randomUUID(),
    {
      headers: await headers(),
      data: {
        expectedRevision: '1',
        key: 'teammate_priority',
        name: 'Teammate priority',
        sortOrder: '4',
        retired: false,
      },
    },
  );
  expect(response.status()).toBe(201);
  await page.getByRole('button', { name: 'Save issue type', exact: true }).click();
  await page.getByRole('button', { name: 'Review latest configuration', exact: true }).click();
  await expect(page.getByLabel('Type name', { exact: true })).toHaveValue('Task revised');
  await page.getByRole('button', { name: 'Save issue type', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Task revised' })).toBeVisible();
  const types = await request.get(apiOrigin + '/api/v2/projects/' + projectId + '/issue-types', {
    headers: await headers(),
  });
  expect(zPageTypeView.parse(await types.json()).items.find(v => v.key === 'task')?.name).toBe(
    'Task revised',
  );
  await page.getByRole('button', { name: 'Priorities', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Teammate priority' })).toBeVisible();
  expect((await configuration(request, projectId)).revision).toBe('3');
});

test('a failed conflict refresh keeps the draft visible and blocks a stale save until review succeeds', async ({
  page,
  request,
}) => {
  const projectId = await isolatedProject(request);
  await signIn(page, 'owner', '/projects/' + projectId + '/settings', /^Issue configuration$/);
  await expect(page.getByRole('button', { name: 'Add issue type', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Edit issue type Task', exact: true }).click();
  await page.getByLabel('Type name', { exact: true }).fill('Keep this draft');
  const peer = await request.put(
    apiOrigin + '/api/v2/projects/' + projectId + '/priorities/' + crypto.randomUUID(),
    {
      headers: await headers(),
      data: {
        expectedRevision: '1',
        key: 'peer',
        name: 'Peer priority',
        sortOrder: '4',
        retired: false,
      },
    },
  );
  expect(peer.status()).toBe(201);
  await page.getByRole('button', { name: 'Save issue type', exact: true }).click();
  let fail = true;
  await page.route('**/api/v2/projects/' + projectId + '/configuration', async route => {
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        json: {
          error: {
            code: 'temporarily_unavailable',
            message: 'Refresh unavailable. Retry loading current configuration.',
            fieldErrors: [],
            nextAction: 'reload_current_state',
            retryable: true,
          },
          current: null,
          unfinished: null,
        },
      });
      return;
    }
    await route.continue();
  });
  await page.getByRole('button', { name: 'Review latest configuration', exact: true }).click();
  await expect(page.getByLabel('Type name', { exact: true })).toHaveValue('Keep this draft');
  await expect(page.getByRole('button', { name: 'Save issue type', exact: true })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('Refresh unavailable');
  await page.getByRole('button', { name: 'Review latest configuration', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save issue type', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Save issue type', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'Keep this draft' })).toBeVisible();
});
