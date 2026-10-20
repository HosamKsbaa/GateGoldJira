import { expect, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { localFixturesAvailable, signIn } from './support/session';
import { coverageBoard, coverageConfiguration, coverageGet, coverageIssue, coverageProject, coverageReadIssue, coverageWrite } from './support/coverage-boards';
import { zPageModernIssueSummary, zPageLabelView, zSavedLabelView, zSavedModernIssueView, zSavedSearchList, zPageTypeView, zPagePriorityView, zPageBindingView } from '../src/app/api/generated/zod.gen';
import type { ModernIssueView, PageIssueTransitionOption } from '../src/app/api/generated/types.gen';
test.skip(!localFixturesAvailable, 'Requires isolated real Go/PostgreSQL browser environment.');
test.use({ trace: 'off' });
test.describe.configure({ timeout: 120000 });
const webCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
const memberId = '10000000-0000-4000-8000-000000000002';
async function keys(page: Page, expected: ModernIssueView[]) { const result = page.getByRole('list', { name: 'Issue results list', exact: true }).locator('.issue-key'); await expect(result).toHaveCount(expected.length); await expect.poll(async () => (await result.allTextContents()).sort()).toEqual(expected.map(value => value.summary.key).sort()); }

test('native issue title-only creation uses accepted project defaults and optional assignment/date values persist', async ({ request, page }) => {
  const projectId = await coverageProject(request), defaults = (await coverageConfiguration(request, projectId)).defaults;
  await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/);
  let created: ModernIssueView;
  const create = async (title: string, options?: () => Promise<void>) => {
    await page.getByRole('button', { name: 'New issue', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true }); await dialog.getByLabel('Issue title', { exact: true }).fill(title);
    if (options) await options();
    const accepted = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === `/api/v2/projects/${projectId}/issues` && value.status() === 201);
    await dialog.getByRole('button', { name: 'Create issue', exact: true }).click(); const saved = zSavedModernIssueView.parse(await (await accepted).json()).result;
    await expect(page).toHaveURL(new RegExp(`/issues/${saved.summary.id}$`)); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible(); return saved;
  };
  await webCase('UC-ISS-0003', async () => { created = await create('Native title only issue'); expect(created.summary.number).toMatch(/^\d+$/); expect(created.summary.key).toContain('-' + created.summary.number); expect((await coverageWrite(request, 'POST', '/api/v2/issues/search', { filters: { projectIds: [projectId], query: 'Native title only issue' } }, zPageModernIssueSummary, 200, 'member')).totalMatching).toBe(1); });
  await webCase('UC-ISS-0004', async () => { expect(created!.summary.type.id).toBe(defaults.standardTypeId); await expect(page.locator('.issue-breadcrumb .type-marker')).toHaveAttribute('title', created!.summary.type.name); });
  await webCase('UC-ISS-0006', async () => { expect(created!.summary.priority.id).toBe(defaults.priorityId); await expect(page.getByRole('button', { name: 'Edit priority', exact: true }).locator('..').locator('.value-content')).toContainText(created!.summary.priority.name); });
  await webCase('UC-ISS-0008', async () => { const bindings = await coverageGet(request, `/api/v2/projects/${projectId}/issue-types/${created!.summary.type.id}/workflows`, zPageBindingView); expect(created!.summary.workflow.id).toBe(bindings.items.find(value => value.default)!.workflowId); const dialog = await (async () => { await page.getByRole('button', { name: 'Edit issue', exact: true }).click(); return page.getByRole('dialog', { name: 'Edit ' + created!.summary.key, exact: true }); })(); await expect(dialog.getByText('Workflow: ' + created!.summary.workflow.name + ' · Existing work keeps its process.', { exact: true })).toBeVisible(); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); });
  await webCase('UC-ISS-0012', async () => { expect(created!.summary.assignee).toBeNull(); await expect(page.getByRole('button', { name: 'Edit assignee', exact: true }).locator('..').locator('.value-content')).toContainText('Unassigned'); });
  const title = 'Native assigned and due issue';
  await page.getByRole('link', { name: 'All issues', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Issues', exact: true })).toBeVisible();
  await webCase('UC-ISS-0011', async () => {
    created = await create(title, async () => { const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true }); await dialog.locator('.optional-fields > summary').click(); await dialog.getByRole('combobox', { name: 'Assignee', exact: true }).fill('مطور'); await dialog.getByRole('option', { name: 'مطور تجريبي', exact: true }).getByRole('button').click(); await dialog.getByLabel('Due date', { exact: true }).fill('2031-06-21'); }); expect(created.summary.assignee?.id).toBe(memberId); await expect(page.getByRole('button', { name: 'Edit assignee', exact: true }).locator('..').locator('.value-content')).toContainText('مطور تجريبي');
  });
  await webCase('UC-ISS-0013', async () => { expect(created!.summary.dueDate).toBe('2031-06-21'); await expect(page.locator('.due-value')).toContainText('2031-06-21'); await signIn(page, 'member', `/issues/${created!.summary.id}`, /^Native assigned and due issue$/); await expect(page.locator('.due-value')).toContainText('2031-06-21'); });
});

test('native issue list category, assignee, dates, label intersections, parent and Arabic filters return exact results', async ({ request, page }) => {
  const projectId = await coverageProject(request), board = await coverageBoard(request, projectId), statuses = ['todo', 'in_progress', 'review', 'done'] as const;
  const one = (await coverageWrite(request, 'POST', `/api/v1/projects/${projectId}/labels`, { name: 'Native all labels first' }, zSavedLabelView, 201, 'member')).result, two = (await coverageWrite(request, 'POST', `/api/v1/projects/${projectId}/labels`, { name: 'Native all labels second' }, zSavedLabelView, 201, 'member')).result;
  const fixtures: ModernIssueView[] = [];
  for (const [index, category] of statuses.entries()) { let issue = await coverageIssue(request, projectId, { title: index === 0 ? 'قضية عربية للبحث المباشر' : 'Native category ' + category, assigneeId: index === 0 ? memberId : index === 1 ? '10000000-0000-4000-8000-000000000001' : null, dueDate: index === 0 ? '2020-01-01' : index === 1 ? '2099-01-01' : null, labelIds: index === 0 ? [one.id, two.id] : index === 1 ? [one.id] : [] }); if (category !== 'todo') issue = (await coverageWrite(request, 'POST', `/api/v2/issues/${issue.summary.id}/move`, { expectedRevision: issue.summary.revision, targetStageId: board.columns.flatMap(column => column.stages).find(value => value.stage.category === category)!.stage.id }, zSavedModernIssueView, 200, 'member')).result; fixtures.push(issue); }
  const parent = fixtures[0]!, child = await coverageIssue(request, projectId, { title: 'Native parent criteria child', parentId: parent.summary.id, expectedParentRevision: parent.summary.revision }), planned = await coverageIssue(request, projectId, { title: 'Native criteria backlog', backlog: true });
  const all = [...fixtures, child, planned];
  await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/); const result = page.getByRole('list', { name: 'Issue results list', exact: true });
  await webCase('UC-ISS-0031', async () => { await keys(page, all); await expect(page.getByRole('heading', { name: 'Results · 6', exact: true })).toBeVisible(); await expect(page.locator('.results-heading')).toContainText('6 shown'); });
  for (const [id, category, expected] of [['UC-ISS-0039', 'todo', [fixtures[0]!, child, planned]], ['UC-ISS-0040', 'in_progress', [fixtures[1]!]], ['UC-ISS-0041', 'review', [fixtures[2]!]], ['UC-ISS-0042', 'done', [fixtures[3]!]]] as const) { await webCase(id, async () => { await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption(category); await keys(page, [...expected]); }); await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption(''); }
  await webCase('UC-ISS-0043', async () => { await page.getByRole('combobox', { name: 'Assigned to', exact: true }).selectOption('self'); await keys(page, [fixtures[0]!]); });
  await webCase('UC-ISS-0045', async () => { await page.getByRole('combobox', { name: 'Assigned to', exact: true }).selectOption('unassigned'); await keys(page, [fixtures[2]!, fixtures[3]!, child, planned]); });
  await page.locator('details.advanced-filters > summary').click();
  await webCase('UC-ISS-0047', async () => { await page.getByRole('searchbox', { name: 'Filter teammate search', exact: true }).fill('مطور'); await expect(page.getByRole('combobox', { name: 'Assigned to', exact: true }).locator('option[value="' + memberId + '"]')).toHaveCount(1); await page.getByRole('combobox', { name: 'Assigned to', exact: true }).selectOption(memberId); await keys(page, [fixtures[0]!]); }); await page.getByRole('combobox', { name: 'Assigned to', exact: true }).selectOption('any');
  await webCase('UC-ISS-0050', async () => { await page.getByLabel('Due from', { exact: true }).fill('2090-01-01'); await keys(page, [fixtures[1]!]); }); await page.getByLabel('Due from', { exact: true }).clear();
  await webCase('UC-ISS-0051', async () => { await page.getByLabel('Due through', { exact: true }).fill('2025-01-01'); await keys(page, [fixtures[0]!]); }); await page.getByLabel('Due through', { exact: true }).clear();
  await webCase('UC-ISS-0052', async () => { await page.getByRole('combobox', { name: 'Overdue', exact: true }).selectOption('true'); await keys(page, [fixtures[0]!]); }); await page.getByRole('combobox', { name: 'Overdue', exact: true }).selectOption('');
  await webCase('UC-ISS-0056', async () => { const picker = page.locator('gg-date-label-fields'); for (const label of [one, two]) { await picker.getByRole('combobox', { name: 'Labels', exact: true }).click(); await picker.getByRole('option', { name: label.name, exact: true }).getByRole('button').click(); } await picker.getByRole('button', { name: 'Done choosing', exact: true }).click(); await keys(page, [fixtures[0]!]); await expect(picker.getByRole('button', { name: /^Remove Native all labels/ })).toHaveCount(2); });
  await webCase('UC-ISS-0067', async () => { await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('todo'); await page.getByRole('combobox', { name: 'Assigned to', exact: true }).selectOption('self'); await page.getByLabel('Due through', { exact: true }).fill('2025-01-01'); await keys(page, [fixtures[0]!]); await expect(page.getByRole('searchbox', { name: 'Search by title or issue key', exact: true })).toHaveValue(''); });
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click(); await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption(projectId); await keys(page, all); if (!await page.getByRole('searchbox', { name: 'Find a parent by title or issue key', exact: true }).isVisible()) await page.locator('details.advanced-filters > summary').click();
  await webCase('UC-ISS-0058', async () => { await page.getByRole('searchbox', { name: 'Find a parent by title or issue key', exact: true }).fill(parent.summary.key); await page.getByRole('button', { name: 'Filter by parent ' + parent.summary.key, exact: true }).click(); await keys(page, [child]); }); await page.getByRole('button', { name: 'Clear parent filter', exact: true }).click();
  await webCase('UC-ISS-0061', async () => { await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('backlog'); await keys(page, [planned]); }); await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('active');
  await webCase('UC-ISS-0080', async () => { await page.getByRole('searchbox', { name: 'Search by title or issue key', exact: true }).fill('عربية'); await keys(page, [fixtures[0]!]); const title = result.locator('.issue-title'); await expect(title).toHaveText(fixtures[0]!.summary.title); expect(await title.evaluate(element => getComputedStyle(element).direction)).toBe('rtl'); });
});

test('native saved searches create, update complete filters, rename independently, reject duplicates and remain private', async ({ request, page }) => {
  const projectId = await coverageProject(request), a = await coverageIssue(request, projectId, { title: 'Native saved Alpha' }), b = await coverageIssue(request, projectId, { title: 'Native saved Beta' });
  await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/);
  const panel = page.locator('gg-saved-searches'), chooser = panel.getByRole('combobox', { name: 'Saved search', exact: true }), name = panel.getByLabel('Saved search name', { exact: true });
  await panel.locator('summary').click(); const searchName = 'Native private search ' + crypto.randomUUID().slice(0, 8); let id = '';
  const mine = async () => (await coverageGet(request, '/api/v1/issue-searches', zSavedSearchList, 'member')).items;
  await webCase('UC-ISS-0152', async () => { await name.fill('   '); await expect(panel.getByRole('button', { name: 'Save as new search', exact: true })).toBeDisabled(); await expect(name).toHaveValue('   '); await expect(chooser).toHaveValue(''); });
  await webCase('UC-ISS-0200', async () => { await name.clear(); await expect(name).toHaveAttribute('maxlength', '80'); await name.pressSequentially('a'.repeat(81)); await expect(name).toHaveValue('a'.repeat(80)); await expect(panel.getByRole('button', { name: 'Save as new search', exact: true })).toBeEnabled(); await expect(chooser).toHaveValue(''); });
  await page.getByRole('searchbox', { name: 'Search by title or issue key', exact: true }).fill(a.summary.key); await keys(page, [a]);
  await webCase('UC-ISS-0144', async () => { await name.fill(searchName); await panel.getByRole('button', { name: 'Save as new search', exact: true }).click(); await expect(panel.getByRole('status')).toHaveText('Saved search saved.'); id = await chooser.inputValue(); expect(id).toMatch(/^[0-9a-f-]{36}$/); const saved = (await mine()).find(value => value.id === id)!; expect(saved).toMatchObject({ name: searchName, filters: { projectIds: [projectId], query: a.summary.key } }); await expect(chooser.locator('option[value="' + id + '"]')).toHaveText(searchName); });
  await webCase('UC-ISS-0146', async () => { await page.getByRole('searchbox', { name: 'Search by title or issue key', exact: true }).fill(b.summary.key); await keys(page, [b]); const response = page.waitForResponse(value => value.request().method() === 'PUT' && new URL(value.url()).pathname === '/api/v1/issue-searches/' + id); await panel.getByRole('button', { name: 'Update saved search', exact: true }).click(); expect((await response).status()).toBe(200); await expect(panel.getByRole('status')).toHaveText('Saved search saved.'); expect((await mine()).find(value => value.id === id)?.filters).toMatchObject({ projectIds: [projectId], query: b.summary.key }); });
  let retainedFilters: object = {};
  await webCase('UC-ISS-0147', async () => { retainedFilters = (await mine()).find(value => value.id === id)!.filters; await page.getByRole('searchbox', { name: 'Search by title or issue key', exact: true }).fill(a.summary.key); await keys(page, [a]); await name.fill(searchName + ' renamed'); const response = page.waitForResponse(value => value.request().method() === 'PUT' && new URL(value.url()).pathname === '/api/v1/issue-searches/' + id); await panel.getByRole('button', { name: 'Rename saved search', exact: true }).click(); expect((await response).status()).toBe(200); const saved = (await mine()).find(value => value.id === id)!; expect(saved.name).toBe(searchName + ' renamed'); expect(saved.filters).toEqual(retainedFilters); await expect(chooser.locator('option[value="' + id + '"]')).toHaveText(searchName + ' renamed'); });
  await webCase('UC-ISS-0154', async () => { const before = (await mine()).find(value => value.id === id)!; const response = page.waitForResponse(value => value.request().method() === 'PUT' && new URL(value.url()).pathname.startsWith('/api/v1/issue-searches/')); await panel.getByRole('button', { name: 'Save as new search', exact: true }).click(); expect((await response).status()).toBe(422); await expect(panel.getByRole('alert')).toContainText('name'); await expect(name).toHaveValue(searchName + ' renamed'); expect((await mine()).find(value => value.id === id)).toEqual(before); expect((await mine()).filter(value => value.name === before.name)).toHaveLength(1); });
  await webCase('UC-ISS-0156', async () => { await signIn(page, 'owner', `/issues?projectId=${projectId}`, /^Issues$/); await panel.locator('summary').click(); await expect(chooser.locator('option[value="' + id + '"]')).toHaveCount(0); await expect(panel).not.toContainText(searchName); expect((await coverageGet(request, '/api/v1/issue-searches', zSavedSearchList, 'owner')).items.some(value => value.id === id)).toBe(false); });
  await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/); await panel.locator('summary').click(); await chooser.selectOption(id); await keys(page, [b]);
  await webCase('UC-ISS-0148', async () => { await panel.getByRole('button', { name: 'Remove saved search', exact: true }).click(); await expect(panel.getByRole('status')).toHaveText('Saved search removed.'); await expect(chooser.locator('option[value="' + id + '"]')).toHaveCount(0); expect((await mine()).some(value => value.id === id)).toBe(false); expect((await coverageReadIssue(request, a.summary.id)).summary.title).toBe(a.summary.title); expect((await coverageReadIssue(request, b.summary.id)).summary.title).toBe(b.summary.title); });
});

test('native private search cap rejects one additional name and preserves all accepted searches', async ({ request, page }) => {
  const projectId = await coverageProject(request), created: Array<{ id: string; revision: string; name: string; filters: object }> = [];
  const { zSavedSavedSearch } = await import('../src/app/api/generated/zod.gen');
  const baseline = (await coverageGet(request, '/api/v1/issue-searches', zSavedSearchList, 'owner')).items;
  try {
    for (let index = baseline.length; index < 50; index++) { const id = crypto.randomUUID(); const saved = await coverageWrite(request, 'PUT', '/api/v1/issue-searches/' + id, { expectedRevision: '0', name: 'Native capacity ' + id.slice(0, 8), filters: { projectIds: [projectId] } }, zSavedSavedSearch, 200, 'owner'); created.push(saved.result); }
    await signIn(page, 'owner', `/issues?projectId=${projectId}`, /^Issues$/); const panel = page.locator('gg-saved-searches'); await panel.locator('summary').click();
    await webCase('UC-ISS-0155', async () => { const name = 'Rejected native fifty-first ' + crypto.randomUUID().slice(0, 6); await panel.getByLabel('Saved search name', { exact: true }).fill(name); const rejected = page.waitForResponse(value => value.request().method() === 'PUT' && new URL(value.url()).pathname.startsWith('/api/v1/issue-searches/')); await panel.getByRole('button', { name: 'Save as new search', exact: true }).click(); expect((await rejected).status()).toBe(422); await expect(panel.getByRole('alert')).toContainText('the limit is 50'); await expect(panel.getByLabel('Saved search name', { exact: true })).toHaveValue(name); const accepted = (await coverageGet(request, '/api/v1/issue-searches', zSavedSearchList, 'owner')).items; expect(accepted).toHaveLength(50); expect(accepted.some(value => value.name === name)).toBe(false); for (const original of baseline) expect(accepted.find(value => value.id === original.id)).toEqual(original); });
  } finally { for (const item of created) await coverageWrite(request, 'PUT', '/api/v1/issue-searches/' + item.id, { expectedRevision: item.revision, name: item.name, filters: item.filters, removed: true }, zSavedSavedSearch, 200, 'owner'); }
});

test('native uncertain creation retains the accepted original defaults after administrators change current defaults', async ({ request, page }) => {
  const projectId = await coverageProject(request), title = 'Native accepted defaults replay ' + crypto.randomUUID().slice(0, 8), config = await coverageConfiguration(request, projectId);
  const { zSavedConfigurationView } = await import('../src/app/api/generated/zod.gen');
  const types = (await coverageGet(request, `/api/v2/projects/${projectId}/issue-types`, zPageTypeView)).items, priorities = (await coverageGet(request, `/api/v2/projects/${projectId}/priorities`, zPagePriorityView)).items;
  const replacementType = types.find(value => value.behavior === 'standard' && value.id !== config.defaults.standardTypeId && !value.retired)!, replacementPriority = priorities.find(value => value.id !== config.defaults.priorityId && !value.retired)!;
  const attempts: Array<{ reference: string; body: unknown }> = []; let accepted: ModernIssueView | null = null;
  await page.route(url => url.pathname === `/api/v2/projects/${projectId}/issues`, async route => { if (route.request().method() !== 'POST') return route.continue(); attempts.push({ reference: route.request().headers()['idempotency-key']!, body: route.request().postDataJSON() }); const response = await route.fetch(); expect(response.status()).toBe(201); const saved = zSavedModernIssueView.parse(await response.json()); if (attempts.length === 1) { accepted = saved.result; const current = await coverageConfiguration(request, projectId); await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/configuration/defaults`, { expectedRevision: current.revision, defaults: { ...current.defaults, standardTypeId: replacementType.id, priorityId: replacementPriority.id } }, zSavedConfigurationView); return route.abort('failed'); } expect(saved.receipt.replayed).toBe(true); expect(saved.result).toEqual(accepted); await route.fulfill({ response }); });
  await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/); await page.getByRole('button', { name: 'New issue', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
  await webCase('UC-ISS-0024', async () => { await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue(''); await expect(dialog.getByRole('button', { name: 'Create issue', exact: true })).toBeDisabled(); expect((await coverageWrite(request, 'POST', '/api/v2/issues/search', { filters: { projectIds: [projectId] } }, zPageModernIssueSummary, 200, 'member')).totalMatching).toBe(0); });
  await dialog.getByLabel('Issue title', { exact: true }).fill(title); await dialog.getByRole('button', { name: 'Create issue', exact: true }).click(); await expect(dialog.getByRole('button', { name: 'Retry original create', exact: true })).toBeVisible();
  await webCase('UC-ISS-0022', async () => { await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue(title); await dialog.getByRole('button', { name: 'Retry original create', exact: true }).click(); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible(); expect(attempts).toHaveLength(2); expect(attempts[0]).toEqual(attempts[1]); expect(attempts[0]!.reference).toBeTruthy(); const list = await coverageWrite(request, 'POST', '/api/v2/issues/search', { filters: { projectIds: [projectId], query: title } }, zPageModernIssueSummary, 200, 'member'); expect(list.totalMatching).toBe(1); expect(list.items[0]!.id).toBe(accepted!.summary.id); });
  await webCase('UC-ISS-0023', async () => { const fresh = await coverageReadIssue(request, accepted!.summary.id), current = await coverageConfiguration(request, projectId); expect(fresh.summary.type.id).toBe(config.defaults.standardTypeId); expect(fresh.summary.priority.id).toBe(config.defaults.priorityId); expect(fresh.summary.workflow.id).toBe(accepted!.summary.workflow.id); expect(current.defaults.standardTypeId).toBe(replacementType.id); expect(current.defaults.priorityId).toBe(replacementPriority.id); await expect(page.getByRole('button', { name: 'Edit priority', exact: true }).locator('..').locator('.value-content')).toContainText(accepted!.summary.priority.name); await expect(page.locator('.issue-breadcrumb .type-marker')).toHaveAttribute('title', accepted!.summary.type.name); });
});

for (const [id, kind] of [['UC-ISS-0026', 'type'], ['UC-ISS-0027', 'priority'], ['UC-ISS-0028', 'binding']] as const) test('native create rejects an administrator-invalidated selected ' + kind + ' and retains the complete draft', async ({ request, page }) => {
  const projectId = await coverageProject(request), root = `/api/v2/projects/${projectId}`;
  const { zSavedTypeSaved, zSavedPrioritySaved, zSavedWorkflowSaved, zSavedStageSaved, zSavedTransitionSaved, zSavedConfigurationView } = await import('../src/app/api/generated/zod.gen');
  const configuration = () => coverageConfiguration(request, projectId);
  const type = (await coverageWrite(request, 'PUT', `${root}/issue-types/${crypto.randomUUID()}`, { expectedRevision: (await configuration()).revision, key: 'native_race_type', name: 'Native selectable race type', behavior: 'standard', retired: false }, zSavedTypeSaved, 201)).result.type;
  const priority = (await coverageWrite(request, 'PUT', `${root}/priorities/${crypto.randomUUID()}`, { expectedRevision: (await configuration()).revision, key: 'native_race_priority', name: 'Native selectable race priority', sortOrder: '1', retired: false }, zSavedPrioritySaved, 201)).result.priority;
  let alternativeId = '';
  if (kind === 'binding') {
    const flow = (await coverageWrite(request, 'PUT', `${root}/workflows/${crypto.randomUUID()}`, { expectedRevision: (await configuration()).revision, name: 'Native closable intake workflow', retired: false }, zSavedWorkflowSaved)).result.workflow; alternativeId = flow.id;
    const stages = [];
    for (const [index, category] of (['todo', 'done'] as const).entries()) stages.push((await coverageWrite(request, 'PUT', `${root}/workflows/${flow.id}/stages/${crypto.randomUUID()}`, { expectedRevision: (await configuration()).revision, name: 'Native intake ' + category, category, position: String(index + 1), initial: index === 0, acceptsEntries: true, retired: false }, zSavedStageSaved)).result.stage);
    await coverageWrite(request, 'PUT', `${root}/workflows/${flow.id}/transitions/${crypto.randomUUID()}`, { expectedRevision: (await configuration()).revision, fromStageId: stages[0]!.id, toStageId: stages[1]!.id, requiredPermission: null, retired: false }, zSavedTransitionSaved);
    const { coverageLayout, coverageLayoutDraft, coverageSaveLayout } = await import('./support/coverage-boards'); const listed = await coverageGet(request, `/api/v1/projects/${projectId}/boards`, (await import('../src/app/api/generated/zod.gen')).zPageBoardSummary), boardId = listed.items.find(value => value.default)!.id;
    const layout = await coverageLayout(request, boardId), draft = coverageLayoutDraft(layout);
    for (const stage of stages) draft.columns.find(column => layout.columns.find(current => current.id === column.id)!.stages.some(mapping => mapping.stage.category === stage.category))!.stageIds.push(stage.id);
    await coverageSaveLayout(request, boardId, draft, 'owner');
    await coverageWrite(request, 'PUT', `${root}/issue-types/${type.id}/workflows/${flow.id}`, { expectedRevision: (await configuration()).revision, default: false, acceptsNew: true }, zSavedConfigurationView);
  }
  await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/); await page.getByRole('button', { name: 'New issue', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true }), title = 'Native current ' + kind + ' draft';
  await dialog.getByLabel('Issue title', { exact: true }).fill(title); await dialog.getByRole('combobox', { name: 'Issue type', exact: true }).selectOption(type.id); await dialog.locator('.optional-fields > summary').click(); await dialog.getByRole('combobox', { name: 'Priority', exact: true }).selectOption(priority.id); await dialog.getByLabel('Due date', { exact: true }).fill('2032-07-08');
  if (kind === 'binding') await dialog.getByRole('combobox', { name: 'Workflow', exact: true }).selectOption(alternativeId);
  if (kind === 'type') await coverageWrite(request, 'PUT', `${root}/issue-types/${type.id}`, { expectedRevision: (await configuration()).revision, key: type.key, name: type.name, behavior: type.behavior, retired: true }, zSavedTypeSaved);
  else if (kind === 'priority') await coverageWrite(request, 'PUT', `${root}/priorities/${priority.id}`, { expectedRevision: (await configuration()).revision, key: priority.key, name: priority.name, sortOrder: priority.sortOrder, retired: true }, zSavedPrioritySaved);
  else await coverageWrite(request, 'PUT', `${root}/issue-types/${type.id}/workflows/${alternativeId}`, { expectedRevision: (await configuration()).revision, default: false, acceptsNew: false }, zSavedConfigurationView);
  await webCase(id, async () => { const rejected = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === `${root}/issues`); await dialog.getByRole('button', { name: 'Create issue', exact: true }).click(); const response = await rejected; expect(response.status()).toBe(422); expect(await response.json()).toMatchObject({ error: { code: 'validation_failed' } }); await expect(dialog.getByRole('alert')).toBeVisible(); await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue(title); await expect(dialog.getByRole('combobox', { name: 'Issue type', exact: true })).toHaveValue(type.id); await expect(dialog.getByRole('combobox', { name: 'Priority', exact: true })).toHaveValue(priority.id); await expect(dialog.getByLabel('Due date', { exact: true })).toHaveValue('2032-07-08'); expect((await coverageWrite(request, 'POST', '/api/v2/issues/search', { filters: { projectIds: [projectId] } }, zPageModernIssueSummary, 200, 'member')).totalMatching).toBe(0); });
  if (kind === 'binding') {
    page.once('dialog', confirmation => confirmation.accept()); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    const primaryId = (await coverageGet(request, `${root}/issue-types/${type.id}/workflows`, zPageBindingView)).items.find(value => value.default)!.workflowId;
    await coverageWrite(request, 'PUT', `${root}/issue-types/${type.id}/workflows/${alternativeId}`, { expectedRevision: (await configuration()).revision, default: true, acceptsNew: true }, zSavedConfigurationView);
    await coverageWrite(request, 'PUT', `${root}/issue-types/${type.id}/workflows/${primaryId}`, { expectedRevision: (await configuration()).revision, default: false, acceptsNew: false }, zSavedConfigurationView);
    const existing = await coverageIssue(request, projectId, { title: 'Native incompatible current workflow' });
    await signIn(page, 'member', `/issues/${existing.summary.id}`, /^Native incompatible current workflow$/); await page.getByRole('button', { name: 'Edit issue', exact: true }).click(); const editor = page.getByRole('dialog', { name: 'Edit ' + existing.summary.key, exact: true });
    await webCase('UC-ISS-0175', async () => { await editor.getByRole('combobox', { name: 'Issue type', exact: true }).selectOption(type.id); const rejected = page.waitForResponse(value => value.request().method() === 'PUT' && new URL(value.url()).pathname === `/api/v2/issues/${existing.summary.id}`); await editor.getByRole('button', { name: 'Save issue', exact: true }).click(); expect((await rejected).status()).toBe(422); await expect(editor.getByRole('alert')).toContainText('existing workflow'); await expect(editor.getByRole('combobox', { name: 'Issue type', exact: true })).toHaveValue(type.id); const fresh = await coverageReadIssue(request, existing.summary.id); expect(fresh.summary.type.id).toBe(existing.summary.type.id); expect(fresh.summary.workflow.id).toBe(primaryId); });
  }
});

test('native standard type edits preserve workflow and stage-target paging appends current-workflow choices', async ({ request, page }) => {
  page.setDefaultTimeout(15000);
  const projectId = await coverageProject(request), issue = await coverageIssue(request, projectId, { title: 'Native type and stage directory' }), types = (await coverageGet(request, `/api/v2/projects/${projectId}/issue-types`, zPageTypeView)).items;
  await signIn(page, 'member', `/issues/${issue.summary.id}`, /^Native type and stage directory$/);
  await webCase('UC-ISS-0110', async () => { const replacement = types.find(value => value.behavior === 'standard' && value.id !== issue.summary.type.id && !value.retired)!; await page.getByRole('button', { name: 'Edit issue', exact: true }).click(); const editor = page.getByRole('dialog', { name: 'Edit ' + issue.summary.key, exact: true }); await editor.getByRole('combobox', { name: 'Issue type', exact: true }).selectOption(replacement.id); await editor.getByRole('button', { name: 'Save issue', exact: true }).click(); await expect(editor).not.toBeVisible(); await expect(page.locator('.issue-breadcrumb .type-marker')).toHaveAttribute('title', replacement.name); const fresh = await coverageReadIssue(request, issue.summary.id); expect(fresh.summary.type.id).toBe(replacement.id); expect(fresh.summary.workflow).toEqual(issue.summary.workflow); expect(fresh.summary.stage).toEqual(issue.summary.stage); });
  const { zPageIssueTransitionOption } = await import('../src/app/api/generated/zod.gen');
  const targets = (await coverageGet(request, `/api/v2/issues/${issue.summary.id}/transitions`, zPageIssueTransitionOption)).items;
  const pages: Array<{ cursor: string | null; result: PageIssueTransitionOption }> = [];
  await page.route(url => url.pathname === `/api/v2/issues/${issue.summary.id}/transitions`, async route => {
    const url = new URL(route.request().url());
    url.searchParams.set('limit', '1');
    const response = await route.fetch({ url: url.toString() });
    expect(response.status()).toBe(200);
    pages.push({ cursor: url.searchParams.get('cursor'), result: zPageIssueTransitionOption.parse(await response.json()) });
    await route.fulfill({ response });
  });
  await webCase('UC-ISS-0123', async () => {
    await page.getByRole('button', { name: /^Issue status:/ }).click();
    const menu = page.getByRole('menu', { name: 'Issue status', exact: true }), choices = menu.getByRole('menuitemradio');
    await expect(choices).toHaveCount(2);
    expect(pages).toHaveLength(1);
    const firstPage = pages[0]!;
    expect(firstPage.cursor).toBeNull();
    expect(firstPage.result.items).toHaveLength(1);
    expect(firstPage.result.totalMatching).toBe(targets.length);
    expect(firstPage.result.nextCursor).toEqual(expect.any(String));
    const first = firstPage.result.items[0]!.stage.id;
    await expect(choices.nth(1)).toHaveAttribute('data-status', first);
    await page.getByRole('button', { name: 'More stages', exact: true }).click();
    await expect(choices).toHaveCount(3);
    expect(pages).toHaveLength(2);
    const nextPage = pages[1]!;
    expect(nextPage.cursor).toBe(firstPage.result.nextCursor);
    expect(nextPage.result.items).toHaveLength(1);
    expect(nextPage.result.totalMatching).toBe(targets.length);
    const received = [...firstPage.result.items, ...nextPage.result.items];
    expect(new Set(received.map(value => value.stage.id)).size).toBe(2);
    for (const option of received) expect(option).toEqual(targets.find(value => value.transitionId === option.transitionId));
    // The menu places loaded targets in workflow order, independently of cursor page order.
    const ordered = received.map(value => value.stage).sort((left, right) => {
      const a = BigInt(left.position), b = BigInt(right.position);
      return a < b ? -1 : a > b ? 1 : left.id.localeCompare(right.id);
    });
    const actual = await choices.evaluateAll(elements => elements.map(element => element.getAttribute('data-status')));
    expect(actual).toEqual([issue.summary.stage.id, ...ordered.map(value => value.id)]);
    expect(actual).toContain(first);
    expect(new Set(actual).size).toBe(3);
    await expect(choices.first()).toHaveAttribute('aria-checked', 'true');
    const fresh = await coverageReadIssue(request, issue.summary.id);
    expect(fresh.summary.stage).toEqual(issue.summary.stage);
    expect(fresh.summary.workflow).toEqual(issue.summary.workflow);
  });
  await page.keyboard.press('Escape');
  await webCase('UC-ISS-0201', async () => {
    const move = async (name: string) => {
      const matches = (url: string) => new URL(url).pathname === `/api/v2/issues/${issue.summary.id}/transitions`;
      const initial = page.waitForResponse(value => matches(value.url()) && value.request().method() === 'GET' && !new URL(value.url()).searchParams.has('cursor'));
      await page.getByRole('button', { name: /^Issue status:/ }).click();
      const firstPage = zPageIssueTransitionOption.parse(await (await initial).json());
      const menu = page.getByRole('menu', { name: 'Issue status', exact: true }), target = menu.getByRole('menuitemradio', { name, exact: true });
      await expect(menu.getByRole('menuitemradio')).toHaveCount(1 + firstPage.items.length);
      for (let pageIndex = 0; pageIndex < 4 && await target.count() === 0; pageIndex++) {
        const before = await menu.getByRole('menuitemradio').count();
        const appended = page.waitForResponse(value => matches(value.url()) && value.request().method() === 'GET' && new URL(value.url()).searchParams.has('cursor'));
        await page.getByRole('button', { name: 'More stages', exact: true }).click();
        const nextPage = zPageIssueTransitionOption.parse(await (await appended).json());
        await expect(menu).toBeVisible();
        await expect(menu.getByRole('menuitemradio')).toHaveCount(before + nextPage.items.length);
      }
      await expect(target).toBeVisible(); await target.click(); await expect(page.getByRole('button', { name: 'Issue status: ' + name, exact: true })).toBeVisible();
    };
    await move('In progress'); const actions = page.locator('gg-modern-issue-actions .more-actions'); await actions.locator('summary').click(); await expect(actions.getByRole('button', { name: 'Move to backlog', exact: true })).toHaveCount(0); await actions.locator('summary').click();
    await move('To do'); await actions.locator('summary').click(); await expect(actions.getByRole('button', { name: 'Move to backlog', exact: true })).toBeVisible(); expect((await coverageReadIssue(request, issue.summary.id)).summary.backlog).toBe(false);
  });
});

for (const [id, boundary] of [['UC-ISS-0171', 'archived project'], ['UC-ISS-0173', 'revoked assignee'], ['UC-ISS-0176', 'retired priority']] as const) test('native full edit rejects current ' + boundary + ' without replacing the visible draft', async ({ request, page }) => {
  const projectId = await coverageProject(request), issue = await coverageIssue(request, projectId, { title: 'Native edit boundary ' + boundary });
  const { zProjectView, zSavedProjectView, zSavedPrioritySaved, zSavedMembershipView } = await import('../src/app/api/generated/zod.gen');
  let priority: { id: string; key: string; name: string; sortOrder: string } | null = null;
  if (boundary === 'retired priority') priority = (await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/priorities/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, key: 'native_edit_race', name: 'Native transient edit priority', sortOrder: '1', retired: false }, zSavedPrioritySaved, 201)).result.priority;
  await signIn(page, 'owner', `/issues/${issue.summary.id}`, new RegExp('^' + issue.summary.title + '$')); await page.getByRole('button', { name: 'Edit issue', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Edit ' + issue.summary.key, exact: true }); await dialog.getByLabel('Issue title', { exact: true }).fill('Native rejected complete form draft');
  if (boundary === 'archived project') { const project = await coverageGet(request, `/api/v1/projects/${projectId}`, zProjectView); await coverageWrite(request, 'POST', `/api/v1/projects/${projectId}/archive`, { expectedRevision: project.revision }, zSavedProjectView); }
  else if (boundary === 'revoked assignee') { await dialog.getByRole('combobox', { name: 'Assignee', exact: true }).fill('مطور'); await dialog.getByRole('option', { name: 'مطور تجريبي', exact: true }).getByRole('button').click(); await coverageWrite(request, 'PUT', `/api/v1/projects/${projectId}/memberships/${memberId}`, { expectedRevision: '1', role: 'viewer' }, zSavedMembershipView); }
  else { await dialog.getByRole('combobox', { name: 'Priority', exact: true }).selectOption(priority!.id); await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/priorities/${priority!.id}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, key: priority!.key, name: priority!.name, sortOrder: priority!.sortOrder, retired: true }, zSavedPrioritySaved); }
  await webCase(id, async () => { const rejected = page.waitForResponse(value => value.request().method() === 'PUT' && new URL(value.url()).pathname === `/api/v2/issues/${issue.summary.id}`); await dialog.getByRole('button', { name: 'Save issue', exact: true }).click(); const response = await rejected; expect(response.status()).toBe(boundary === 'archived project' ? 403 : 422); expect(await response.json()).toMatchObject({ error: { code: boundary === 'archived project' ? 'forbidden' : 'validation_failed' } }); await expect(dialog.getByRole('alert')).toBeVisible(); await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue('Native rejected complete form draft'); const fresh = await coverageGet(request, `/api/v2/issues/${issue.summary.id}`, (await import('../src/app/api/generated/zod.gen')).zModernIssueView); expect(fresh.summary.title).toBe(issue.summary.title); expect(fresh.summary.assignee).toBeNull(); expect(fresh.summary.priority.id).toBe(issue.summary.priority.id); });
});

test('native direct entry hides every protected issue field after project access is removed', async ({ request, page }) => {
  const projectId = await coverageProject(request), issue = await coverageIssue(request, projectId, { title: 'Secret native inaccessible issue', description: 'Private native description content' });
  await coverageWrite(request, 'POST', `/api/v1/projects/${projectId}/memberships/${memberId}/remove`, { expectedRevision: '1' }, (await import('../src/app/api/generated/zod.gen')).zSavedMembershipView);
  await signIn(page, 'member', '/issues', /^Issues$/);
  await webCase('UC-ISS-0172', async () => { const rejected = page.waitForResponse(value => value.request().method() === 'GET' && new URL(value.url()).pathname === `/api/v2/issues/${issue.summary.id}`); await page.evaluate(path => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }, '/issues/' + issue.summary.id); const response = await rejected; expect(response.status()).toBe(404); expect(await response.json()).toMatchObject({ error: { code: 'unavailable_record' } }); await expect(page.getByRole('main').getByRole('alert')).toBeVisible(); await expect(page.getByRole('main')).not.toContainText(issue.summary.title); await expect(page.getByRole('main')).not.toContainText(issue.description); await expect(page.locator('.issue-detail-heading')).toHaveCount(0); await expect(page.getByRole('button', { name: 'Edit issue', exact: true })).toHaveCount(0); });
});

test('native backlog creation is immediately planned and absent from the actual active board', async ({ request, page }) => {
  const projectId = await coverageProject(request), board = await coverageBoard(request, projectId, 'Native creation separation'), active = await coverageIssue(request, projectId, { title: 'Native existing active control' });
  await signIn(page, 'member', `/backlog/${projectId}`, /^Backlog$/);
  await webCase('UC-ISS-0015', async () => { await page.getByRole('button', { name: 'New issue', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true }); await dialog.getByLabel('Issue title', { exact: true }).fill('Native planned creation separation'); const created = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === `/api/v2/projects/${projectId}/issues` && value.status() === 201); await dialog.getByRole('button', { name: 'Create issue', exact: true }).click(); const saved = zSavedModernIssueView.parse(await (await created).json()).result; expect(saved.summary.backlog).toBe(true); await expect(page.getByRole('list', { name: 'Ranked backlog', exact: true })).toContainText(saved.summary.key); await page.evaluate(path => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }, '/boards/' + board.board.id); await expect(page.getByRole('heading', { name: board.board.name, exact: true })).toBeVisible(); await expect(page.locator('gg-native-issue-card')).toHaveCount(1); await expect(page.locator('gg-native-issue-card')).toContainText(active.summary.key); await expect(page.locator(`gg-native-issue-card[data-issue-id="${saved.summary.id}"]`)).toHaveCount(0); });
});

test('native highest-priority sorting preserves adjacent integer ranks above JavaScript safe precision', async ({ request, page }) => {
  const projectId = await coverageProject(request);
  const createPriority = async (sortOrder: string) => (await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/priorities/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, key: 'precise_' + sortOrder, name: 'Precise priority ' + sortOrder, sortOrder, retired: false }, (await import('../src/app/api/generated/zod.gen')).zSavedPrioritySaved, 201)).result.priority;
  const higher = await createPriority('9007199254740993'), lower = await createPriority('9007199254740992');
  const first = await coverageIssue(request, projectId, { title: 'Higher exact priority created first', priorityId: higher.id });
  const second = await coverageIssue(request, projectId, { title: 'Lower exact priority created later', priorityId: lower.id });
  await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/);
  const result = page.getByRole('list', { name: 'Issue results list', exact: true }).locator('.issue-key');
  await expect(result).toHaveText([second.summary.key, first.summary.key]);
  await webCase('UC-ISS-0066', async () => {
    await page.locator('details.advanced-filters > summary').click();
    await page.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('priority');
    await expect(result).toHaveText([first.summary.key, second.summary.key]);
    expect((await coverageReadIssue(request, first.summary.id)).summary.priority.sortOrder).toBe('9007199254740993');
    expect((await coverageReadIssue(request, second.summary.id)).summary.priority.sortOrder).toBe('9007199254740992');
  });
});
