import { expect, type APIRequestContext, type Page } from '@playwright/test';
import {readinessFixture,readinessCases} from './support/configuration-readiness';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { isolatedProject } from './support/project';
import { coverageConfiguration, coverageFailure, coverageGet, coverageHeaders, coverageIssue, coverageProject, coverageWrite } from './support/coverage-boards';
import { zActivationReadiness, zPageFieldDefinition, zPagePriorityView, zPageTypeView, zPageWorkflowView, zPageTransitionView, zSavedFieldSaved, zSavedIssueView, zSavedPrioritySaved, zSavedTransitionPolicyView, zSavedTypeSaved, zTransitionPolicyView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated real Go/PostgreSQL browser environment.');
test.use({ trace: 'off' });
test.describe.configure({ timeout: 90000 });
const webCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
async function spa(page: Page, path: string) {
  await page.evaluate(next => { history.pushState({}, '', next); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }, path);
  await expect(page).toHaveURL(url => url.pathname + url.search === path);
}
async function addPriority(request: APIRequestContext, projectId: string, name: string) {
  return (await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/priorities/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, key: 'p_' + crypto.randomUUID().replaceAll('-', '').slice(0, 12), name, sortOrder: '9', retired: false }, zSavedPrioritySaved, 201)).result.priority;
}
async function editTask(page: Page, name: string) {
  await expect(page.getByRole('button', { name: 'Edit issue type Task', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Edit issue type Task', exact: true }).click();
  await page.getByLabel('Type name', { exact: true }).fill(name);
}

test('native field retirement explains active transition requirements and preserves the field and rule', async ({ request, page }) => {
  const projectId = await coverageProject(request), root = `/api/v2/projects/${projectId}`, fieldId = crypto.randomUUID();
  const field = (await coverageWrite(request, 'PUT', root + '/fields/' + fieldId, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, key: 'release_evidence', name: 'Release evidence', kind: 'text', required: false, retired: false, defaultValue: null }, zSavedFieldSaved, 201)).result.field;
  const workflow = (await coverageGet(request, root + '/workflows', zPageWorkflowView)).items[0]!, transition = (await coverageGet(request, root + '/workflows/' + workflow.id + '/transitions', zPageTransitionView)).items[0]!;
  const policy = { requiredSystemFields: [], requiredFieldIds: [fieldId], approvalsRequired: 0, approverRole: null, excludeIssueReporter: false };
  await coverageWrite(request, 'PUT', `${root}/workflows/${workflow.id}/transitions/${transition.id}/policy`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, policy }, zSavedTransitionPolicyView);
  const before = await coverageConfiguration(request, projectId);
  await signIn(page, 'owner', `/projects/${projectId}/fields`, /^Custom fields$/);
  await webCase('UC-CFG-0053', async () => {
    await page.getByRole('button', { name: 'Edit ' + field.name, exact: true }).click();
    await page.getByRole('checkbox', { name: 'Retired', exact: true }).check();
    const denied = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === root + '/fields/' + fieldId);
    await page.getByRole('button', { name: 'Save field', exact: true }).click();
    const response = await denied; expect(response.status()).toBe(422); expect(await response.json()).toMatchObject({ error: { code: 'validation_failed' } });
    await expect(page.getByRole('alert')).toContainText('Remove active transition requirements before retiring this field.');
    await expect(page.getByRole('checkbox', { name: 'Retired', exact: true })).toBeChecked();
    expect((await coverageConfiguration(request, projectId)).revision).toBe(before.revision);
    expect((await coverageGet(request, root + '/fields', zPageFieldDefinition)).items.find(value => value.id === fieldId)?.retired).toBe(false);
    expect((await coverageGet(request, `${root}/workflows/${workflow.id}/transitions/${transition.id}/policy`, zTransitionPolicyView)).policy.requiredFieldIds).toEqual([fieldId]);
  });
});

test('native configuration conflict reload failure retains the visible draft and keeps stale saving blocked', async ({ request, page }) => {
  const projectId = await coverageProject(request), root = `/api/v2/projects/${projectId}`;
  await signIn(page, 'owner', `/projects/${projectId}/settings`, /^Issue configuration$/);
  await editTask(page, 'Native retained conflicting draft');
  await addPriority(request, projectId, 'Concurrent native priority');
  await page.getByRole('button', { name: 'Save issue type', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Review latest configuration', exact: true })).toBeVisible();
  await webCase('UC-CFG-0070', async () => {
    await page.route(url => url.pathname === root + '/configuration', route => route.abort('failed'), { times: 1 });
    await page.getByRole('button', { name: 'Review latest configuration', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(/connection|try again/i);
    await expect(page.getByLabel('Type name', { exact: true })).toHaveValue('Native retained conflicting draft');
    await expect(page.getByRole('button', { name: 'Save issue type', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Review latest configuration', exact: true })).toBeEnabled();
    expect((await coverageGet(request, root + '/issue-types', zPageTypeView)).items.find(value => value.key === 'task')?.name).toBe('Task');
  });
});

test('native uncertain taxonomy save retries the frozen accepted reference and payload exactly once', async ({ request, page }) => {
  const projectId = await coverageProject(request), root = `/api/v2/projects/${projectId}`;
  await signIn(page, 'owner', `/projects/${projectId}/settings`, /^Issue configuration$/);
  await page.getByRole('button', { name: 'Priorities', exact: true }).click(); await page.getByRole('button', { name: 'Add priority', exact: true }).click();
  const name = 'Native uncertain priority'; await page.getByLabel('Priority name', { exact: true }).fill(name);
  const submissions: Array<{ reference: string; payload: string | null; path: string }> = [];
  await page.route(`**${root}/priorities/*`, async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    submissions.push({ reference: route.request().headers()['idempotency-key'] ?? '', payload: route.request().postData(), path: new URL(route.request().url()).pathname });
    const response = await route.fetch(); expect(response.status()).toBe(201); const saved = zSavedPrioritySaved.parse(await response.json());
    if (submissions.length === 1) { expect(saved.receipt.replayed).toBe(false); await route.abort('failed'); }
    else { expect(saved.receipt.replayed).toBe(true); await route.fulfill({ response }); }
  });
  await webCase('UC-CFG-0071', async () => {
    await page.getByRole('button', { name: 'Save priority', exact: true }).click();
    await expect(page.getByLabel('Priority name', { exact: true })).toBeDisabled(); await expect(page.getByLabel('Priority name', { exact: true })).toHaveValue(name);
    await page.getByRole('button', { name: 'Retry original save', exact: true }).click();
    await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(1);
    expect(submissions).toHaveLength(2); expect(submissions[0]!.reference).not.toBe(''); expect(submissions[1]).toEqual(submissions[0]);
    const priorities = await coverageGet(request, root + '/priorities', zPagePriorityView); expect(priorities.items.filter(value => value.name === name)).toHaveLength(1);
  });
});

for (const [id, discard] of [['UC-CFG-0072', false], ['UC-CFG-0073', true]] as const) test('native taxonomy navigation ' + (discard ? 'requires an explicit discard' : 'can be cancelled with the draft intact'), async ({ request, page }) => {
  const projectId = await coverageProject(request), path = `/projects/${projectId}/settings`;
  await signIn(page, 'owner', path, /^Issue configuration$/); await editTask(page, 'Native navigation draft');
  await webCase(id, async () => {
    let prompted = false;
    page.once('dialog', async dialog => { prompted = true; expect(dialog.type()).toBe('confirm'); expect(dialog.message()).toContain('unsaved'); if (discard) await dialog.accept(); else await dialog.dismiss(); });
    await page.getByRole('link', { name: 'Project', exact: true }).click();
    await expect.poll(() => prompted, { message: 'Leaving a dirty taxonomy form must request explicit confirmation.' }).toBe(true);
    if (discard) { await expect(page).toHaveURL(new RegExp(`/projects/${projectId}$`)); await expect(page.getByRole('heading', { level: 1, name: /^Isolated workflow/ })).toBeVisible(); await expect(page.getByLabel('Type name', { exact: true })).toHaveCount(0); }
    else { await expect(page).toHaveURL(new RegExp(path + '$')); await expect(page.getByLabel('Type name', { exact: true })).toHaveValue('Native navigation draft'); await expect(page.getByRole('heading', { name: 'Issue configuration', exact: true })).toBeVisible(); }
  });
});

test('native project settings prevent a previous project draft, options and late configuration review from crossing the route', async ({ request, page }) => {
  const a = await coverageProject(request), b = await coverageProject(request);
  const unique = async (projectId: string, key: string, name: string) => coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/issue-types/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, key, name, behavior: 'standard', retired: false }, zSavedTypeSaved, 201);
  await unique(a, 'a_private', 'Project A private type'); await unique(b, 'b_private', 'Project B private type');
  await signIn(page, 'owner', `/projects/${a}/settings`, /^Issue configuration$/); await expect(page.getByRole('row').filter({ hasText: 'Project A private type' })).toBeVisible();
  await editTask(page, 'Project A private draft'); await addPriority(request, a, 'Concurrent project A priority');
  await page.getByRole('button', { name: 'Save issue type', exact: true }).click(); await expect(page.getByRole('button', { name: 'Review latest configuration', exact: true })).toBeVisible();
  let held = false, returned = false, release = () => {}; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.pathname === `/api/v2/projects/${a}/configuration`, async route => { const response = await route.fetch(); expect(response.status()).toBe(200); held = true; await gate; await route.fulfill({ response }); returned = true; }, { times: 1 });
  await page.getByRole('button', { name: 'Review latest configuration', exact: true }).click(); await expect.poll(() => held).toBe(true);
  try {
    await webCase('UC-CFG-0074', async () => {
      page.once('dialog', dialog => dialog.accept()); await spa(page, `/projects/${b}/settings`);
      await expect(page.getByRole('row').filter({ hasText: 'Project B private type' })).toBeVisible(); await expect(page.getByRole('row').filter({ hasText: 'Project A private type' })).toHaveCount(0); await expect(page.getByLabel('Type name', { exact: true })).toHaveCount(0);
      release(); await expect.poll(() => returned).toBe(true);
      await expect(page).toHaveURL(new RegExp(`/projects/${b}/settings$`)); await expect(page.getByRole('row').filter({ hasText: 'Project B private type' })).toBeVisible(); await expect(page.getByRole('row').filter({ hasText: 'Project A private type' })).toHaveCount(0); await expect(page.getByLabel('Type name', { exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Add issue type', exact: true }).click(); await expect(page.getByLabel('Type name', { exact: true })).toHaveValue('');
    });
  } finally { release(); }
});

for (const [id, shape, message] of readinessCases) test('native activation readiness explains ' + shape + ' without enabling unsafe activation', async ({ request, page }) => {
  const projectId = await isolatedProject(request);
  if (shape === 'canonical_references') await coverageWrite(request, 'POST', `/api/v1/projects/${projectId}/issues`, { title: 'Retained pre-cutover issue' }, zSavedIssueView, 201, 'member');
  const restore=await readinessFixture(projectId, shape);
  try{await signIn(page, 'owner', `/projects/${projectId}/settings`, /^Issue configuration$/);
  const section = page.locator('gg-project-activation');
  const review = await webCase(id, async () => {
    const received = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === `/api/v2/projects/${projectId}/configuration/activation`);
    await section.getByRole('button', { name: 'Review activation', exact: true }).click();
    const response = await received; expect(response.status()).toBe(200); const data = zActivationReadiness.parse(await response.json());
    expect(data.ready).toBe(false); expect(data.problems).toContainEqual({ code: shape, message });
    await expect(section.locator('.review li').filter({ hasText: message })).toHaveText(message); await expect(section.getByRole('checkbox', { name: 'Confirm new issue mode', exact: true })).toBeDisabled(); await expect(section.getByRole('button', { name: 'Activate new issue mode', exact: true })).toBeDisabled();
    return data;
  });
  if (shape === 'default_filters') await webCase('UC-CFG-0087', async () => {
    await expect(section.getByRole('button', { name: 'Activate new issue mode', exact: true })).toBeDisabled();
    const response = await request.post(apiOrigin + `/api/v2/projects/${projectId}/configuration/activation`, { headers: await coverageHeaders(), data: { expectedRevision: review.configuration.revision, expectedProjectRevision: review.projectRevision, expectedBoardId: review.defaultBoardId, expectedBoardRevision: review.defaultBoardRevision, confirm: true } });
    await coverageFailure(response, 422, 'validation_failed'); expect(await response.text()).toContain('Resolve the readiness problems and review this project again before activation.');
    expect((await coverageConfiguration(request, projectId)).mode).toBe('legacy'); await expect(section.locator('.review li').filter({ hasText: message })).toBeVisible();
  });
  }finally{await restore();}
});
