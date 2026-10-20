import { useCase as recordedUseCase } from './support/use-case';
const useCase = <T>(id: string, body: () => Promise<T>) => recordedUseCase(id, body, 'web');
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject, useModernIssues } from './support/project';
import {
  zConfigurationView,
  zSavedModernIssueView,
  zSavedFieldSaved,
  zCustomFieldsView,
  zModernIssueView,
  zPageIssueTransitionOption,
  zPageFieldDefinition,
  zSavedBackfillFieldResult,
} from '../src/app/api/generated/zod.gen';
import { modernEditable } from '../src/app/features/issues/issue-model';
test.skip(!localFixturesAvailable, 'Requires isolated company fixtures.');
async function headers(role = 'owner') {
  return { Authorization: 'Bearer ' + (await token(role)), 'Idempotency-Key': crypto.randomUUID() };
}
async function fixture(request: APIRequestContext) {
  const projectId = await isolatedProject(request);
  await useModernIssues(projectId);
  const response = await request.post(apiOrigin + '/api/v2/projects/' + projectId + '/issues', {
    headers: await headers('member'),
    data: { title: 'Typed review ' + crypto.randomUUID().slice(0, 6) },
  });
  expect(response.status()).toBe(201);
  return { projectId, issue: zSavedModernIssueView.parse(await response.json()).result };
}
async function fields(request: APIRequestContext, id: string) {
  const response = await request.get(apiOrigin + '/api/v2/issues/' + id + '/custom-fields', {
    headers: await headers('member'),
  });
  expect(response.status()).toBe(200);
  return zCustomFieldsView.parse(await response.json());
}
async function addText(request: APIRequestContext, projectId: string) {
  const root = await request.get(apiOrigin + '/api/v2/projects/' + projectId + '/configuration', {
    headers: await headers(),
  });
  const cfg = zConfigurationView.parse(await root.json());
  const id = crypto.randomUUID();
  const saved = await request.put(apiOrigin + '/api/v2/projects/' + projectId + '/fields/' + id, {
    headers: await headers(),
    data: {
      expectedRevision: cfg.revision,
      key: 'acceptance',
      name: 'معيار القبول',
      kind: 'text',
      required: false,
      retired: false,
      defaultValue: { kind: 'text', text: 'مطلوب التحقق' },
    },
  });
  expect(saved.status()).toBe(201);
  return zSavedFieldSaved.parse(await saved.json()).result.field;
}

test('field settings preserve decimal precision, backfill requirements and native creation defaults', async ({
  page,
  request,
}, testInfo) => {
  const f = await fixture(request);
  await signIn(page, 'owner', '/projects/' + f.projectId + '/fields', /^Custom fields$/);
  await page.getByRole('button', { name: 'Add field', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Estimate');
  await page.getByLabel('Stable key', { exact: true }).fill('estimate');
  await page.getByRole('combobox', { name: 'Value type', exact: true }).selectOption('number');
  await page.getByLabel('Creation default', { exact: true }).fill('9007199254740993.1234567890');
  await page.getByRole('button', { name: 'Save field', exact: true }).click();
  await expect(page.getByText('Field saved.', { exact: true })).toBeVisible();
  const definitionReply = await request.get(apiOrigin + '/api/v2/projects/' + f.projectId + '/fields', { headers: await headers() }); expect(definitionReply.status()).toBe(200);
  const estimate = zPageFieldDefinition.parse(await definitionReply.json()).items.find(value => value.name === 'Estimate')!;
  const explicitReply = await request.post(apiOrigin + '/api/v2/projects/' + f.projectId + '/issues', { headers: await headers('member'), data: { title: 'Explicit estimate retained by backfill', fieldValues: [{ fieldId: estimate.id, value: { kind: 'number', number: '77' } }] } }); expect(explicitReply.status()).toBe(201); const explicit = zSavedModernIssueView.parse(await explicitReply.json()).result;
  await useCase('UC-FLD-0071', async () => {
    const pending = page.waitForResponse(value => value.request().method() === 'POST' && value.url().endsWith('/fields/' + estimate.id + '/backfill'));
    await page.getByRole('button', { name: 'Fill missing values', exact: true }).click(); const reply = await pending; expect(reply.status()).toBe(200); const result = zSavedBackfillFieldResult.parse(await reply.json()); expect(result.result.changed).toBe(1); expect(result.receipt.eventId).not.toBeNull();
    await expect(page.getByRole('status').filter({ hasText: '1 issues updated; 0 still missing this default.' })).toBeVisible();
    const original = await fields(request, f.issue.summary.id); expect(BigInt(original.revision)).toBeGreaterThan(BigInt(f.issue.summary.revision)); expect(original.values).toContainEqual({ fieldId: estimate.id, value: { kind: 'number', number: '9007199254740993.123456789' } });
  });
  await useCase('UC-FLD-0072', async () => {
    await signIn(page, 'member', '/issues/' + explicit.summary.id, /^Explicit estimate retained by backfill$/);
    await expect(page.locator('gg-custom-fields').getByLabel('Estimate', { exact: true })).toHaveValue('77'); const retained = await fields(request, explicit.summary.id); expect(retained.revision).toBe(explicit.summary.revision); expect(retained.values).toEqual([{ fieldId: estimate.id, value: { kind: 'number', number: '77' } }]);
  });
  await signIn(page, 'owner', '/projects/' + f.projectId + '/fields', /^Custom fields$/);
  await page.getByRole('button', { name: 'Edit Estimate', exact: true }).click();
  await page.getByLabel('Required on every issue', { exact: true }).check();
  await page.getByRole('button', { name: 'Save field', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Required');
  const original = await fields(request, f.issue.summary.id);
  expect(original.values[0]?.value).toEqual({
    kind: 'number',
    number: '9007199254740993.123456789',
  });
  await signIn(page, 'member', '/issues?projectId=' + f.projectId, /^Issues$/);
  await page.getByRole('button', { name: 'New issue', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
  await dialog.getByLabel('Issue title', { exact: true }).fill('Default estimate');
  await expect(dialog.getByLabel('Estimate', { exact: true })).toHaveValue(
    '9007199254740993.123456789',
  );
  await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Default estimate', exact: true })).toBeVisible();
  const id = new URL(page.url()).pathname.split('/').at(-1);
  if (!id) throw new Error('Missing issue ID');
  expect((await fields(request, id)).values[0]?.value).toEqual(original.values[0]?.value);
  const custom = page.locator('gg-custom-fields');
  await custom.getByLabel('Estimate', { exact: true }).fill('9007199254740994.0000000001');
  await custom.getByRole('button', { name: 'Save fields', exact: true }).click();
  await expect(custom.getByRole('button', { name: 'Save fields', exact: true })).toHaveCount(0);
  await expect
    .poll(async () => (await fields(request, id)).values[0]?.value)
    .toEqual({ kind: 'number', number: '9007199254740994.0000000001' });
  await page.screenshot({ path: testInfo.outputPath('typed-field-detail.png'), fullPage: true });
  await signIn(page, 'viewer', '/issues/' + id, /^Default estimate$/);
  await expect(
    page.locator('gg-custom-fields').getByLabel('Estimate', { exact: true }),
  ).toBeDisabled();
});

test('custom-field uncertain saves freeze their payload and conflict review preserves Arabic drafts', async ({
  page,
  request,
}) => {
  const f = await fixture(request);
  const field = await addText(request, f.projectId);
  await signIn(
    page,
    'member',
    '/issues/' + f.issue.summary.id,
    new RegExp('^' + f.issue.summary.title + '$'),
  );
  const custom = page.locator('gg-custom-fields');
  const attempts: { reference: string; body: string | null }[] = [];
  await page.route('**/api/v2/issues/' + f.issue.summary.id + '/custom-fields', async route => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    attempts.push({
      reference: route.request().headers()['idempotency-key'] ?? '',
      body: route.request().postData(),
    });
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    if (attempts.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await useCase('UC-FLD-0058', async () => {
  await custom.getByLabel(field.name, { exact: true }).fill('تم الاختبار بنجاح');
  await custom.getByRole('button', { name: 'Save fields', exact: true }).click();
  await expect(
    custom.getByRole('button', { name: 'Retry original save', exact: true }),
  ).toBeVisible();
  await expect(custom.getByLabel(field.name, { exact: true })).toBeDisabled();
  });
  await useCase('UC-FLD-0057', async () => {
  await custom.getByRole('button', { name: 'Retry original save', exact: true }).click();
  await expect(
    custom.getByRole('button', { name: 'Retry original save', exact: true }),
  ).toHaveCount(0);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect((await fields(request, f.issue.summary.id)).values).toContainEqual({ fieldId: field.id, value: { kind: 'text', text: 'تم الاختبار بنجاح' } });
  });
  await page.unrouteAll();
  await custom.getByLabel(field.name, { exact: true }).fill('مسودة المراجع');
  const currentResponse = await request.get(apiOrigin + '/api/v2/issues/' + f.issue.summary.id, {
    headers: await headers('member'),
  });
  const current = zModernIssueView.parse(await currentResponse.json());
  const edited = await request.put(apiOrigin + '/api/v2/issues/' + f.issue.summary.id, {
    headers: await headers('member'),
    data: {
      expectedRevision: current.summary.revision,
      editable: { ...modernEditable(current), description: 'Parallel description' },
    },
  });
  expect(edited.status()).toBe(200);
  await useCase('UC-FLD-0055', async () => {
  await custom.getByRole('button', { name: 'Save fields', exact: true }).click();
  await custom.getByRole('button', { name: 'Review current issue', exact: true }).click();
  await expect(custom.getByLabel(field.name, { exact: true })).toHaveValue('مسودة المراجع');
  });
  await useCase('UC-FLD-0056', async () => {
  await custom.getByRole('button', { name: 'Save fields', exact: true }).click();
  await expect(custom.getByRole('button', { name: 'Save fields', exact: true })).toHaveCount(0);
  await expect
    .poll(
      async () =>
        (await fields(request, f.issue.summary.id)).values.find(v => v.fieldId === field.id)?.value,
    )
    .toEqual({ kind: 'text', text: 'مسودة المراجع' });
  });
});

test('workflow rule editor and issue review support rejection, resubmit, approval and status movement', async ({
  page,
  request,
}, testInfo) => {
  const f = await fixture(request);
  const choicesResponse = await request.get(
    apiOrigin + '/api/v2/issues/' + f.issue.summary.id + '/transitions',
    { headers: await headers('member') },
  );
  const options = zPageIssueTransitionOption.parse(await choicesResponse.json());
  const edge = options.items.find(o => o.stage.category === 'review');
  if (!edge) throw new Error('Missing review move');
  await signIn(page, 'owner', '/projects/' + f.projectId + '/workflows', /^Workflows$/);
  await page
    .getByRole('row')
    .filter({ has: page.getByRole('cell', { name: 'To do', exact: true }) })
    .filter({ has: page.getByRole('cell', { name: 'Review', exact: true }) })
    .getByRole('button', { name: 'Requirements for move to Review', exact: true })
    .click();
  const policy = page.locator('gg-transition-policy');
  await policy.getByLabel('Approvals needed', { exact: true }).fill('1');
  await policy.getByRole('button', { name: 'Save requirements', exact: true }).click();
  await expect(
    policy.getByRole('button', { name: 'Save requirements', exact: true }),
  ).toBeEnabled();
  await signIn(
    page,
    'member',
    '/issues/' + f.issue.summary.id,
    new RegExp('^' + f.issue.summary.title + '$'),
  );
  const review = page.locator('gg-issue-review');
  await useCase('UC-APR-0001', async () => { await expect(review.getByRole('combobox', { name: 'Move to review', exact: true }).locator('option[value="' + edge.transitionId + '"]')).toHaveText('To do → Review'); });
  await useCase('UC-APR-0002', async () => {
  await review
    .getByRole('combobox', { name: 'Move to review', exact: true })
    .selectOption(edge.transitionId);
  await expect(review.getByRole('combobox', { name: 'Move to review', exact: true })).toHaveValue(edge.transitionId);
  await expect(review.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  });
  await useCase('UC-APR-0005', async () => { await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(''); await expect(review.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0); await expect(review.getByRole('status').filter({ hasText: '0 / 1 approvals' })).toHaveCount(0); const unchanged = await request.get(apiOrigin + '/api/v2/issues/' + f.issue.summary.id, { headers: await headers('member') }); expect(unchanged.status()).toBe(200); expect(zModernIssueView.parse(await unchanged.json()).summary.revision).toBe(f.issue.summary.revision); });
  await review.getByRole('combobox', { name: 'Move to review', exact: true }).selectOption(edge.transitionId);
  await useCase('UC-APR-0006', async () => {
    await expect(review.getByRole('status').filter({ hasText: '0 / 1 approvals' })).toBeVisible();
  });
  await page.getByRole('button', { name: /^Issue status:/ }).click();
  await expect(page.getByRole('menuitemradio', { name: /^Review/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await useCase('UC-APR-0008', async () => {
    await review.getByRole('button', { name: 'Request changes', exact: true }).click();
    await expect(review.getByRole('status').filter({ hasText: 'Changes requested' })).toBeVisible();
    await expect(review.locator('.review-votes li').filter({ hasText: 'Requested changes' })).toHaveCount(1);
  });
  await review.getByRole('button', { name: 'Resubmit for review', exact: true }).click();
  await expect(review.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  await useCase('UC-APR-0007', async () => {
  await review.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(
    review.getByRole('status').filter({ hasText: 'Review requirements satisfied' }),
  ).toBeVisible();
  await expect(review.locator('.review-votes li')).toHaveCount(2);
  });
  await useCase('UC-APR-0009', async () => {
    await expect(review.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await expect(review.getByRole('button', { name: 'Request changes', exact: true })).toHaveCount(0);
  });
  await useCase('UC-APR-0054', async () => {
    await page.getByRole('button', { name: /^Issue status:/ }).click();
    await expect(page.getByRole('menuitemradio', { name: 'Review', exact: true })).toBeEnabled();
  });
  await useCase('UC-APR-0017', async () => {
    await page.getByRole('menuitemradio', { name: 'Review', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Issue status: Review', exact: true })).toBeVisible();
    const moved = await request.get(apiOrigin + '/api/v2/issues/' + f.issue.summary.id, { headers: await headers('member') });
    expect(moved.status()).toBe(200);
    expect(zModernIssueView.parse(await moved.json()).summary.stage.category).toBe('review');
  });
  await useCase('UC-APR-0047', async () => {
    await expect(review.getByRole('status').filter({ hasText: 'Past move · History only' })).toBeVisible();
    await expect(review.locator('.review-votes li')).toHaveCount(2);
    await expect(review.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
    await expect(review.getByRole('button', { name: 'Request changes', exact: true })).toHaveCount(0);
  });
  await page.screenshot({ path: testInfo.outputPath('review-history.png'), fullPage: true });
});
