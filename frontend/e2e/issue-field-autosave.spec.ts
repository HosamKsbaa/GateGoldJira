import { useCase as recordedUseCase } from './support/use-case';
const useCase = <T>(id: string, body: () => Promise<T>) => recordedUseCase(id, body, 'web');
import { readNativeIssue, fixturePriority } from './support/native-issues';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import {
  zModernIssueView,
  zPageBoardSummary,
  zSavedIssueView,
  zSavedModernIssueView,
  zModernUpdateFields,
  zModernPatchFields,
} from '../src/app/api/generated/zod.gen';
import type {
  ModernEditable,
  ModernIssueView,
  ModernUpdateFields,
  ModernPatchFields,
} from '../src/app/api/generated/types.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated local company.');
test.use({ locale: 'en-US' });

type RecordedSave =
  | { reference: string; method: 'PUT'; body: ModernUpdateFields }
  | { reference: string; method: 'PATCH'; body: ModernPatchFields };
function gate() {
  let resolve = (): void => {};
  const promise = new Promise<void>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
async function headers(role = 'member') {
  return { Authorization: 'Bearer ' + (await token(role)), 'Idempotency-Key': crypto.randomUUID() };
}
async function fixture(request: APIRequestContext) {
  const projectId = await isolatedProject(request);
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: await headers(),
    data: {
      title: 'Save issue choices immediately ' + crypto.randomUUID().slice(0, 8),
      description: 'Keep this description while saving individual fields.',
    },
  });
  expect(response.status()).toBe(201);
  return readNativeIssue(request, zSavedIssueView.parse(await response.json()).result.summary.id);
}
async function currentIssue(request: APIRequestContext, id: string): Promise<ModernIssueView> {
  const response = await request.get(apiOrigin + '/api/v2/issues/' + id, {
    headers: await headers(),
  });
  expect(response.status()).toBe(200);
  return zModernIssueView.parse(await response.json());
}
function editable(issue: ModernIssueView): ModernEditable {
  return {
    title: issue.summary.title,
    description: issue.description,
    descriptionFormat: issue.descriptionFormat,
    typeId: issue.summary.type.id,
    priorityId: issue.summary.priority.id,
    assigneeId: issue.summary.assignee?.id ?? null,
    dueDate: issue.summary.dueDate,
    labelIds: issue.summary.labels.map(label => label.id),
  };
}
function recordSaves(page: Page, id: string): RecordedSave[] {
  const saves: RecordedSave[] = [];
  page.on('request', request => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/v2/issues/' + id) {
      saves.push({
        reference: request.headers()['idempotency-key'] ?? '',
        method: 'PUT',
        body: zModernUpdateFields.parse(request.postDataJSON()),
      });
    }
    if (
      request.method() === 'PATCH' &&
      new URL(request.url()).pathname === '/api/v2/issues/' + id + '/fields'
    ) {
      saves.push({
        reference: request.headers()['idempotency-key'] ?? '',
        method: 'PATCH',
        body: zModernPatchFields.parse(request.postDataJSON()),
      });
    }
  });
  return saves;
}
async function openField(scope: Page | Locator, label: string): Promise<Locator> {
  await scope.getByRole('button', { name: 'Edit ' + label, exact: true }).click();
  const field = scope.getByRole('group', { name: 'Edit ' + label, exact: true });
  await expect(field).toBeVisible();
  await expect(field.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  return field;
}

test('assignee, priority and due date persist immediately, including unassignment and clearing a date', async ({
  page,
  request,
}) => {
  const issue = await fixture(request);
  await signIn(
    page,
    'member',
    '/issues/' + issue.summary.id,
    new RegExp('^' + issue.summary.title + '$'),
  );
  const saves = recordSaves(page, issue.summary.id);

  let field = await openField(page, 'assignee');
  await field.getByRole('option', { name: 'مطور تجريبي', exact: true }).click();
  await expect(field).toHaveCount(0);
  await expect(page.locator('.issue-metadata .person-value').first()).toContainText('مطور تجريبي');
  let saved = await currentIssue(request, issue.summary.id);
  expect(saved.summary.assignee?.id).toBe('10000000-0000-4000-8000-000000000002');
  expect(saves).toHaveLength(1);

  field = await openField(page, 'priority');
  await field.getByRole('option', { name: 'High', exact: true }).click();
  await expect(field).toHaveCount(0);
  await expect(page.locator('.priority-value')).toHaveAttribute('data-priority', 'high');
  saved = await currentIssue(request, issue.summary.id);
  expect(saved.summary.priority.key).toBe('high');
  expect(saved.summary.assignee?.displayName).toBe('مطور تجريبي');
  expect(saves).toHaveLength(2);

  field = await openField(page, 'due date');
  await field.getByLabel('due date', { exact: true }).fill('2027-04-16');
  await expect(field).toHaveCount(0);
  await expect(page.locator('.due-value')).toContainText('2027-04-16');
  saved = await currentIssue(request, issue.summary.id);
  expect(saved.summary.dueDate).toBe('2027-04-16');
  expect(saves).toHaveLength(3);

  await useCase('UC-ISS-0106', async () => {
  field = await openField(page, 'due date');
  await field.getByLabel('due date', { exact: true }).fill('');
  await expect(field).toHaveCount(0);
  await expect(page.locator('.due-value')).toHaveCount(0);
  saved = await currentIssue(request, issue.summary.id);
  expect(saved.summary.dueDate).toBeNull();
  expect(saves).toHaveLength(4);
  });

  await useCase('UC-ISS-0100', async () => {
  field = await openField(page, 'assignee');
  await field.getByRole('option', { name: 'Unassigned', exact: true }).click();
  await expect(field).toHaveCount(0);
  saved = await currentIssue(request, issue.summary.id);
  expect(saved.summary.assignee).toBeNull();
  expect(saved.summary.priority.key).toBe('high');
  expect(saved.description).toBe(issue.description);
  expect(BigInt(saved.summary.revision)).toBe(BigInt(issue.summary.revision) + 5n);
  expect(saves).toHaveLength(5);
  expect(new Set(saves.map(save => save.reference)).size).toBe(5);
  for (const save of saves) expect(save.reference).toMatch(/^[0-9a-f-]{36}$/);
  });

  await signIn(
    page,
    'viewer',
    '/issues/' + issue.summary.id,
    new RegExp('^' + issue.summary.title + '$'),
  );
  for (const label of ['assignee', 'priority', 'due date']) {
    await expect(page.getByRole('button', { name: 'Edit ' + label, exact: true })).toHaveCount(0);
  }
  const denied = await request.put(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
    headers: await headers('viewer'),
    data: {
      expectedRevision: saved.summary.revision,
      editable: {
        ...editable(saved),
        priorityId: await fixturePriority(request, issue.summary.projectId, 'low'),
      },
    },
  });
  expect(denied.status()).toBe(403);
  expect((await currentIssue(request, issue.summary.id)).summary.revision).toBe(
    saved.summary.revision,
  );
});

test('opening menus, navigating options, cancelling and choosing the saved value never write an issue', async ({
  page,
  request,
}) => {
  const issue = await fixture(request);
  await signIn(
    page,
    'member',
    '/issues/' + issue.summary.id,
    new RegExp('^' + issue.summary.title + '$'),
  );
  const saves = recordSaves(page, issue.summary.id);
  let field = await openField(page, 'priority');
  await expect(field.getByRole('option', { name: 'Medium', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(field.getByRole('option', { name: 'High', exact: true })).toBeFocused();
  await expect(field.getByRole('option', { name: 'Medium', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await useCase('UC-ISS-0181', async () => {
  await page.keyboard.press('Escape');
  await expect(field).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit priority', exact: true })).toBeFocused();
  });

  await useCase('UC-ISS-0161', async () => {
  field = await openField(page, 'priority');
  await field.getByRole('option', { name: 'Medium', exact: true }).click();
  await expect(field).toHaveCount(0);
  field = await openField(page, 'assignee');
  await field.getByRole('option', { name: 'Unassigned', exact: true }).click();
  await expect(field).toHaveCount(0);
  field = await openField(page, 'due date');
  await field.getByLabel('due date', { exact: true }).press('Escape');
  await expect(field).toHaveCount(0);
  expect(saves).toHaveLength(0);
  expect((await currentIssue(request, issue.summary.id)).summary.revision).toBe(
    issue.summary.revision,
  );
  });

  // These multi-value editors retain their explicit save and cancel contract.
  for (const label of ['title', 'description', 'labels']) {
    await page.getByRole('button', { name: 'Edit ' + label, exact: true }).click();
    field = page.getByRole('group', { name: 'Edit ' + label, exact: true });
    await expect(field.getByRole('button', { name: 'Save', exact: true })).toBeVisible();
    await field.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  expect(saves).toHaveLength(0);
});

test('typing native date segments keeps intermediate years local until Enter and incomplete dates can still be cleared', async ({
  page,
  request,
}) => {
  const issue = await fixture(request);
  const initialResponse = await request.put(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
    headers: await headers(),
    data: {
      expectedRevision: issue.summary.revision,
      editable: { ...editable(issue), dueDate: '2027-04-16' },
    },
  });
  expect(initialResponse.status()).toBe(200);
  const initial = zSavedModernIssueView.parse(await initialResponse.json()).result;
  await signIn(
    page,
    'member',
    '/issues/' + issue.summary.id,
    new RegExp('^' + issue.summary.title + '$'),
  );
  const saves = recordSaves(page, issue.summary.id);
  let field = await openField(page, 'due date');
  let date = field.getByLabel('due date', { exact: true });
  await expect(date).toHaveValue('2027-04-16');
  // Chromium's en-US date control starts on month; move through day to year.
  await expect(date).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Backspace');
  await expect(field).toBeVisible();
  await expect(date).toHaveValue('');
  await expect(field.getByRole('button', { name: 'Clear date', exact: true })).toBeEnabled();
  await useCase('UC-ISS-0105', async () => {
  for (const digit of ['2', '0', '3', '2']) {
    // Keep the native segment focused instead of refocusing through Locator.press.
    await page.keyboard.press(digit);
    await expect(field).toBeVisible();
    expect(saves).toHaveLength(0);
  }
  await expect(date).toHaveValue('2032-04-16');
  const unchanged = await currentIssue(request, issue.summary.id);
  expect(unchanged.summary.dueDate).toBe('2027-04-16');
  expect(unchanged.summary.revision).toBe(initial.summary.revision);
  });
  let entered = initial;
  await useCase('UC-ISS-0103', async () => {
  await page.keyboard.press('Enter');
  await expect(field).toHaveCount(0);
  expect(saves).toHaveLength(1);
  entered = await currentIssue(request, issue.summary.id);
  expect(entered.summary.dueDate).toBe('2032-04-16');
  expect(BigInt(entered.summary.revision)).toBe(BigInt(initial.summary.revision) + 1n);
  });

  field = await openField(page, 'due date');
  date = field.getByLabel('due date', { exact: true });
  await expect(date).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Backspace');
  await expect(date).toHaveValue('');
  await expect(field).toBeVisible();
  expect(saves).toHaveLength(1);
  await field.getByRole('button', { name: 'Clear date', exact: true }).click();
  await expect(field).toHaveCount(0);
  expect(saves).toHaveLength(2);
  const cleared = await currentIssue(request, issue.summary.id);
  expect(cleared.summary.dueDate).toBeNull();
  expect(BigInt(cleared.summary.revision)).toBe(BigInt(entered.summary.revision) + 1n);
});

test('mobile board drawer saves one selected value and blocks repeat edits while its accepted response is pending', async ({
  page,
  request,
}) => {
  const issue = await fixture(request);
  const boards = zPageBoardSummary.parse(
    await (
      await request.get(apiOrigin + '/api/v1/projects/' + issue.summary.projectId + '/boards', {
        headers: await headers(),
      })
    ).json(),
  );
  const board = boards.items[0];
  if (!board) throw new Error('Missing isolated board');
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + board.name + '$'));
  await page.getByRole('link', { name: issue.summary.title, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Issue preview', exact: true });
  await expect(drawer).toBeVisible();
  const field = await openField(drawer, 'priority');
  await useCase('UC-ISS-0182', async () => {
  expect(await field.evaluate(element => element.matches(':popover-open'))).toBe(true);
  const bounds = await field.boundingBox();
  if (!bounds) throw new Error('Missing mobile priority popup');
  expect(bounds.x).toBeGreaterThanOrEqual(7);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(383);
  });
  const saves = recordSaves(page, issue.summary.id);
  const accepted = gate(),
    release = gate();
  const endpoint = '**/api/v2/issues/' + issue.summary.id + '/fields';
  await page.route(endpoint, async route => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    zSavedModernIssueView.parse(await response.json());
    accepted.resolve();
    await release.promise;
    await route.fulfill({ response });
  });
  await useCase('UC-ISS-0160', async () => {
  try {
    await field.getByRole('option', { name: 'High', exact: true }).click();
    await accepted.promise;
    await expect(field).toBeVisible();
    await expect(drawer.getByRole('button', { name: 'Edit priority', exact: true })).toBeDisabled();
    await expect(drawer.getByRole('button', { name: 'Edit assignee', exact: true })).toBeDisabled();
    await expect(field.getByRole('option', { name: 'Low', exact: true })).toBeDisabled();
    await expect(field.getByRole('option', { name: 'High', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(field).toBeVisible();
    expect(saves).toHaveLength(1);
    expect((await currentIssue(request, issue.summary.id)).summary.priority.key).toBe('high');
    const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
    if (evidence) await page.screenshot({ path: evidence + '/issue-autosave-mobile-pending.png' });
  } finally {
    release.resolve();
  }
  await expect(field).toHaveCount(0);
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('.priority-value')).toHaveAttribute('data-priority', 'high');
  expect(saves).toHaveLength(1);
  expect(BigInt((await currentIssue(request, issue.summary.id)).summary.revision)).toBe(
    BigInt(issue.summary.revision) + 1n,
  );
  });
});

test('a lost accepted autosave keeps the selection and retries the original reference without another revision', async ({
  page,
  request,
}) => {
  const issue = await fixture(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(
    page,
    'member',
    '/issues/' + issue.summary.id,
    new RegExp('^' + issue.summary.title + '$'),
  );
  const field = await openField(page, 'priority');
  const before = await field.boundingBox();
  if (!before) throw new Error('Missing initial priority popup');
  const saves = recordSaves(page, issue.summary.id);
  let attempts = 0;
  await page.route('**/api/v2/issues/' + issue.summary.id + '/fields', async route => {
    if (route.request().method() !== 'PATCH') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    zSavedModernIssueView.parse(await response.json());
    if (++attempts === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await field.getByRole('option', { name: 'High', exact: true }).click();
  await expect(field.getByRole('alert')).toBeVisible();
  await expect(field.getByRole('option', { name: 'High', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(field.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(field.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
  for (const label of ['Low', 'Medium', 'High']) {
    await expect(field.getByRole('option', { name: label, exact: true })).toBeDisabled();
  }
  await expect
    .poll(
      async () => {
        const bounds = await field.boundingBox();
        return (
          !!bounds &&
          bounds.height > before.height &&
          bounds.x >= 7 &&
          bounds.x + bounds.width <= 383 &&
          bounds.y >= 7 &&
          bounds.y + bounds.height <= 837
        );
      },
      { message: 'The expanded mobile error popup stays inside the viewport.' },
    )
    .toBe(true);
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence) await page.screenshot({ path: evidence + '/issue-autosave-mobile-retry.png' });
  expect(saves).toHaveLength(1);
  let saved = await currentIssue(request, issue.summary.id);
  expect(saved.summary.priority.key).toBe('high');
  expect(BigInt(saved.summary.revision)).toBe(BigInt(issue.summary.revision) + 1n);
  await field.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect(field).toHaveCount(0);
  expect(saves).toHaveLength(2);
  expect(saves[1]).toEqual(saves[0]);
  saved = await currentIssue(request, issue.summary.id);
  expect(saved.summary.priority.key).toBe('high');
  expect(BigInt(saved.summary.revision)).toBe(BigInt(issue.summary.revision) + 1n);
});

test('an autosave conflict requires reviewing and applying the draft, preserving the latest unrelated fields', async ({
  page,
  request,
}) => {
  const issue = await fixture(request);
  await signIn(
    page,
    'member',
    '/issues/' + issue.summary.id,
    new RegExp('^' + issue.summary.title + '$'),
  );
  const field = await openField(page, 'due date');
  const saves = recordSaves(page, issue.summary.id);
  const requested = gate(),
    release = gate();
  const endpoint = '**/api/v2/issues/' + issue.summary.id + '/fields';
  await page.route(
    endpoint,
    async route => {
      if (route.request().method() !== 'PATCH') {
        await route.continue();
        return;
      }
      requested.resolve();
      await release.promise;
      await route.continue();
    },
    { times: 1 },
  );
  let latest: ModernIssueView;
  try {
    await field.getByLabel('due date', { exact: true }).fill('2027-07-22');
    await requested.promise;
    const before = await currentIssue(request, issue.summary.id);
    const response = await request.put(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
      headers: await headers(),
      data: {
        expectedRevision: before.summary.revision,
        editable: {
          ...editable(before),
          description: 'A newer teammate description · تحديث زميل',
          priorityId: await fixturePriority(request, issue.summary.projectId, 'high'),
          dueDate: '2027-08-01',
        },
      },
    });
    expect(response.status()).toBe(200);
    latest = zSavedModernIssueView.parse(await response.json()).result;
  } finally {
    release.resolve();
  }
  await expect(
    field.getByRole('button', { name: 'Review latest and keep my draft', exact: true }),
  ).toBeVisible();
  await expect(field.getByLabel('due date', { exact: true })).toHaveValue('2027-07-22');
  expect(saves).toHaveLength(1);
  await field.getByRole('button', { name: 'Review latest and keep my draft', exact: true }).click();
  await expect(
    field.getByRole('button', { name: 'Apply reviewed change', exact: true }),
  ).toBeVisible();
  await expect(field.getByLabel('due date', { exact: true })).toHaveValue('2027-07-22');
  expect(saves).toHaveLength(1);
  let saved = await currentIssue(request, issue.summary.id);
  expect(saved.summary.revision).toBe(latest.summary.revision);
  expect(saved.summary.dueDate).toBe('2027-08-01');
  await field.getByRole('button', { name: 'Apply reviewed change', exact: true }).click();
  await expect(field).toHaveCount(0);
  saved = await currentIssue(request, issue.summary.id);
  expect(saved.summary.dueDate).toBe('2027-07-22');
  expect(saved.summary.priority.key).toBe('high');
  expect(saved.description).toBe('A newer teammate description · تحديث زميل');
  expect(BigInt(saved.summary.revision)).toBe(BigInt(latest.summary.revision) + 1n);
  expect(saves).toHaveLength(2);
  expect(saves[1]?.reference).not.toBe(saves[0]?.reference);
  const reviewedSave = saves[1];
  expect(reviewedSave?.method).toBe('PATCH');
  if (reviewedSave?.method === 'PATCH') expect(reviewedSave.body.dueDate?.prior).toBe('2027-08-01');
});

test('an autosave merges a teammate edit to unrelated fields without requiring review', async ({
  page,
  request,
}) => {
  const issue = await fixture(request);
  await signIn(
    page,
    'member',
    '/issues/' + issue.summary.id,
    new RegExp('^' + issue.summary.title + '$'),
  );
  await useCase('UC-ISS-0157', async () => {
  const field = await openField(page, 'due date');
  const requested = gate(),
    release = gate();
  const saves = recordSaves(page, issue.summary.id);
  await page.route(
    '**/api/v2/issues/' + issue.summary.id + '/fields',
    async route => {
      if (route.request().method() !== 'PATCH') {
        await route.continue();
        return;
      }
      requested.resolve();
      await release.promise;
      await route.continue();
    },
    { times: 1 },
  );
  try {
    await field.getByLabel('due date', { exact: true }).fill('2027-07-22');
    await requested.promise;
    const before = await currentIssue(request, issue.summary.id);
    const response = await request.put(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
      headers: await headers(),
      data: {
        expectedRevision: before.summary.revision,
        editable: {
          ...editable(before),
          description: 'A teammate update · تحديث زميل',
          priorityId: await fixturePriority(request, issue.summary.projectId, 'high'),
        },
      },
    });
    expect(response.status()).toBe(200);
  } finally {
    release.resolve();
  }
  await expect(field).toHaveCount(0);
  const saved = await currentIssue(request, issue.summary.id);
  expect(saved.summary.dueDate).toBe('2027-07-22');
  expect(saved.summary.priority.key).toBe('high');
  expect(saved.description).toBe('A teammate update · تحديث زميل');
  expect(saves).toHaveLength(1);
  expect(saves[0]?.method).toBe('PATCH');
  });
});
