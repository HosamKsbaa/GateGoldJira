import { fixturePriority } from './support/native-issues';
import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { zModernIssueView, zSavedModernIssueView } from '../src/app/api/generated/zod.gen';
import type { ModernEditable } from '../src/app/api/generated/types.gen';
const projectId = '20000000-0000-4000-8000-000000000001';
const memberId = '10000000-0000-4000-8000-000000000002';
test.skip(
  !localFixturesAvailable,
  'Use make test-browser for isolated PostgreSQL and real local access tokens.',
);
test('create Arabic work, assign My Issues, recover a stale replacement and clear fields', async ({
  page,
  request,
}) => {
  await signIn(page, 'member', '/issues', /^Issues$/);
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption(projectId);
  await page.getByRole('button', { name: 'New issue', exact: true }).click();
  await expect(page.getByLabel('Issue title', { exact: true })).toBeFocused();
  const title = 'عمل الفريق 😀';
  await page.getByLabel('Issue title', { exact: true }).fill(title);
  await page
    .getByLabel('Description', { exact: true })
    .fill('وصف عربي <script>text stays plain</script>');
  await page.locator('gg-modern-issue-form .optional-fields > summary').click();
  await page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Assignee', exact: true })
    .fill('مطور');
  await page
    .getByRole('dialog')
    .getByRole('listbox', { name: 'Assignee choices', exact: true })
    .getByRole('option', { name: 'مطور تجريبي', exact: true })
    .click();
  await page.getByLabel('Due date', { exact: true }).fill('2020-01-01');
  await page.getByRole('button', { name: 'Create issue', exact: true }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await expect(
    page.getByText('وصف عربي <script>text stays plain</script>', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Due 2020-01-01 · Overdue', { exact: true })).toBeVisible();
  const path = new URL(page.url()).pathname;
  const issueId = path.split('/').at(-1);
  expect(issueId).toBeTruthy();
  await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
  await page.getByLabel('Issue title', { exact: true }).fill('Unsent local title');
  const headers = { Authorization: 'Bearer ' + (await token('member')) };
  const read = await request.get(apiOrigin + '/api/v2' + path, { headers });
  expect(read.status()).toBe(200);
  const view = zModernIssueView.parse(await read.json());
  const editable: ModernEditable = {
    title: 'Changed in another session',
    description: view.description,
    descriptionFormat: view.descriptionFormat,
    typeId: view.summary.type.id,
    priorityId: await fixturePriority(request, view.summary.projectId, 'high'),
    assigneeId: view.summary.assignee?.id ?? null,
    dueDate: view.summary.dueDate,
    labelIds: view.summary.labels.map(label => label.id),
  };
  const concurrent = await request.put(apiOrigin + '/api/v2' + path, {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: { expectedRevision: view.summary.revision, editable },
  });
  expect(concurrent.status()).toBe(200);
  await page.getByRole('button', { name: 'Save issue', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/issue changed/);
  await expect(page.getByLabel('Issue title', { exact: true })).toHaveValue('Unsent local title');
  await page.getByRole('button', { name: 'Review current issue', exact: true }).click();
  await expect(page.getByLabel('Issue title', { exact: true })).toHaveValue(
    'Changed in another session',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Remove مطور تجريبي', exact: true })
    .click();
  await page.getByLabel('Due date', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Save issue', exact: true }).click();
  await expect(page.getByText('Issue saved.', { exact: true })).toBeVisible();
  const after = zModernIssueView.parse(
    await (await request.get(apiOrigin + '/api/v2' + path, { headers })).json(),
  );
  expect(after.summary.assignee).toBeNull();
  expect(after.summary.dueDate).toBeNull();
  expect(after.summary.key).toBe(view.summary.key);
  expect(after.reporter.id).toBe(memberId);
  await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('combobox', { name: 'Assignee', exact: true })
    .fill('مطور');
  await page
    .getByRole('dialog')
    .getByRole('listbox', { name: 'Assignee choices', exact: true })
    .getByRole('option', { name: 'مطور تجريبي', exact: true })
    .click();
  await page.getByRole('button', { name: 'Save issue', exact: true }).click();
  await expect(page.getByText('Issue saved.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Issues', exact: true }).click();
  await page.getByRole('button', { name: 'My Issues', exact: true }).click();
  await expect(
    page.getByRole('link', {
      name: view.summary.key + ' · Changed in another session',
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel('Search by title or issue key').fill(view.summary.key.toLowerCase());
  await expect(page.getByRole('heading', { name: 'Results · 1', exact: true })).toBeVisible();
  await page
    .getByRole('link', { name: view.summary.key + ' · Changed in another session', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Changed in another session', exact: true }),
  ).toBeVisible();
});
test('Unicode title boundaries and Viewer read-only details', async ({ page, request }) => {
  await signIn(page, 'owner', '/issues', /^Issues$/);
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption(projectId);
  await page.getByRole('button', { name: 'New issue', exact: true }).click();
  await page.getByLabel('Issue title', { exact: true }).fill('😀'.repeat(201));
  await expect(page.getByRole('button', { name: 'Create issue', exact: true })).toBeDisabled();
  await page.getByLabel('Issue title', { exact: true }).fill('😀'.repeat(200));
  await expect(page.getByRole('button', { name: 'Create issue', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Create issue', exact: true }).click();
  await expect(page.getByRole('heading', { name: '😀'.repeat(200), exact: true })).toBeVisible();
  const path = new URL(page.url()).pathname;
  await signIn(page, 'viewer', path, /😀/);
  await expect(page.getByRole('button', { name: 'Edit issue', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Issue status:/ })).toHaveCount(0);
  const read = await request.get(apiOrigin + '/api/v2' + path, {
    headers: { Authorization: 'Bearer ' + (await token('viewer')) },
  });
  expect(read.status()).toBe(200);
  const view = zModernIssueView.parse(await read.json());
  expect(view.capabilities).toEqual(['read']);
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
test('an uncertain create retries the original reference without duplicating work', async ({
  page,
}) => {
  await signIn(page, 'member', '/issues', /^Issues$/);
  await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption(projectId);
  await page.getByRole('button', { name: 'New issue', exact: true }).click();
  await page
    .getByLabel('Issue title', { exact: true })
    .fill('Retry preserved after connection loss');
  const references: string[] = [];
  let attempt = 0;
  let releaseResponse = (): void => {};
  const responseGate = new Promise<void>(resolve => {
    releaseResponse = resolve;
  });
  await page.route('**/api/v2/projects/' + projectId + '/issues', async route => {
    references.push(route.request().headers()['idempotency-key'] ?? '');
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    attempt++;
    if (attempt === 1) {
      await responseGate;
      await route.abort('failed');
      return;
    }
    const saved = zSavedModernIssueView.parse(await response.json());
    expect(saved.receipt.replayed).toBe(true);
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Create issue', exact: true }).click();
  try {
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }),
    ).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeVisible();
  } finally {
    releaseResponse();
  }
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('try again');
  await expect(page.getByLabel('Issue title', { exact: true })).toHaveValue(
    'Retry preserved after connection loss',
  );
  await page.getByRole('button', { name: 'Retry original create', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Retry preserved after connection loss', exact: true }),
  ).toBeVisible();
  expect(references).toHaveLength(2);
  expect(references[0]).toBeTruthy();
  expect(references[0]).toBe(references[1]);
});
