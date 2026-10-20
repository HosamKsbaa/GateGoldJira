import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { coverageBoard, coverageConfiguration, coverageFailure, coverageGet, coverageHeaders, coverageIssue, coverageLayout, coverageLayoutDraft, coverageProject, coverageReadIssue, coverageSaveLayout, coverageWrite } from './support/coverage-boards';
import { zPageBoardSummary, zPageBindingView, zPageTypeView, zPageWorkflowView, zPageTransitionView, zSavedAutomationRuleView, zSavedBoardSummary, zSavedConfigurationView, zSavedDevelopmentLinkView, zSavedIssuePlanningView, zSavedPlanningItemView, zSavedStageSaved, zSavedTransitionPolicyView, zSavedTransitionSaved, zSavedWorkflowSaved, zTransitionPolicyView } from '../src/app/api/generated/zod.gen';
import type { PlanningCreateFields, StageView } from '../src/app/api/generated/types.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated real Go/PostgreSQL browser environment.');
test.use({ trace: 'off' });
test.describe.configure({ timeout: 120000 });
const webCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
const memberId = '10000000-0000-4000-8000-000000000002';

/** Keep response contents real; use the public smaller page size to expose native append controls. */
async function smallPages(page: Page, paths: string[]) {
  const seen: Array<{ path: string; cursor: string | null; from: string | null; through: string | null }> = [];
  let enabled = true;
  await page.route(url => paths.includes(url.pathname), async route => {
    if (!enabled || route.request().method() !== 'GET') return route.continue();
    const url = new URL(route.request().url());
    url.searchParams.set('limit', '1');
    seen.push({ path: url.pathname, cursor: url.searchParams.get('cursor'), from: url.searchParams.get('from'), through: url.searchParams.get('through') });
    const response = await route.fetch({ url: url.toString() });
    expect(response.status(), url.pathname).toBe(200);
    await route.fulfill({ response });
  });
  return { seen, disable: () => { enabled = false; } };
}
async function spa(page: Page, path: string) {
  await page.evaluate(next => { history.pushState({}, '', next); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }, path);
  await expect(page).toHaveURL(url => url.pathname + url.search === path);
}
async function assertDistinctLinks(rows: Locator, expectedCount: number) {
  await expect(rows).toHaveCount(expectedCount);
  const identities = await rows.evaluateAll(elements => elements.map(element => element.getAttribute('href')));
  expect(identities.every(Boolean)).toBe(true);
  expect(new Set(identities).size).toBe(expectedCount);
}
async function createPlanning(request: APIRequestContext, projectId: string, fields: Partial<PlanningCreateFields> = {}) {
  return (await coverageWrite(request, 'POST', `/api/v1/projects/${projectId}/planning`, { kind: 'epic', name: 'Native epic', description: '', targetDate: null, status: 'planned', ...fields }, zSavedPlanningItemView, 201, 'member')).result;
}
async function boundWorkflow(request: APIRequestContext, projectId: string) {
  const workflows = await coverageGet(request, `/api/v2/projects/${projectId}/workflows`, zPageWorkflowView);
  const primary = workflows.items[0]!;
  await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/workflows/${primary.id}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, name: 'A native primary', retired: false }, zSavedWorkflowSaved);
  const alternate = (await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/workflows/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, name: 'Z native alternate', retired: false }, zSavedWorkflowSaved)).result.workflow;
  const stages: StageView[] = [];
  for (const [index, category] of (['todo', 'done'] as const).entries()) stages.push((await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/workflows/${alternate.id}/stages/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, name: 'Native ' + category, category, position: String(index + 1), initial: index === 0, acceptsEntries: true, retired: false }, zSavedStageSaved)).result.stage);
  await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/workflows/${alternate.id}/transitions/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, fromStageId: stages[0]!.id, toStageId: stages[1]!.id, requiredPermission: null, retired: false }, zSavedTransitionSaved);
  const directory = await coverageGet(request, `/api/v1/projects/${projectId}/boards`, zPageBoardSummary);
  const defaultId = directory.items.find(value => value.default)!.id;
  const layout = await coverageLayout(request, defaultId), draft = coverageLayoutDraft(layout);
  for (const choice of stages) draft.columns.find(column => layout.columns.find(value => value.id === column.id)!.stages.some(mapping => mapping.stage.category === choice.category))!.stageIds.push(choice.id);
  await coverageSaveLayout(request, defaultId, draft, 'owner');
  const task = (await coverageGet(request, `/api/v2/projects/${projectId}/issue-types`, zPageTypeView)).items.find(value => value.key === 'task')!;
  await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/issue-types/${task.id}/workflows/${alternate.id}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, default: false, acceptsNew: true }, zSavedConfigurationView);
  return { primary, alternate, task };
}

test('native workflow pages append bounded real lists and disabling approval serializes the null reviewer role', async ({ request, page }) => {
  const projectId = await coverageProject(request), fixture = await boundWorkflow(request, projectId), root = `/api/v2/projects/${projectId}`;
  const transition = (await coverageGet(request, `${root}/workflows/${fixture.primary.id}/transitions?limit=1`, zPageTransitionView)).items[0]!;
  const policyPath = `${root}/workflows/${fixture.primary.id}/transitions/${transition.id}/policy`;
  await coverageWrite(request, 'PUT', policyPath, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, policy: { requiredSystemFields: [], requiredFieldIds: [], approvalsRequired: 1, approverRole: 'member', excludeIssueReporter: false } }, zSavedTransitionPolicyView);
  await smallPages(page, [`${root}/workflows`, `${root}/workflows/${fixture.primary.id}/stages`, `${root}/workflows/${fixture.primary.id}/transitions`, `${root}/issue-types/${fixture.task.id}/workflows`]);
  await signIn(page, 'owner', `/projects/${projectId}/workflows`, /^Workflows$/);
  const nav = page.getByRole('navigation', { name: 'Workflows', exact: true });
  const workflowOrder = (await coverageGet(request, `${root}/workflows`, zPageWorkflowView)).items.map(value => value.name);
  await webCase('UC-WFL-0002', async () => {
    await expect(nav.locator('button strong')).toHaveText(workflowOrder.slice(0, 1));
    await nav.getByRole('button', { name: 'More workflows', exact: true }).click();
    await expect(nav.locator('button strong')).toHaveText(workflowOrder);
  });
  await nav.getByRole('button', { name: /^A native primary / }).click();
  await expect(page.getByRole('region', { name: 'Selected workflow', exact: true }).getByRole('heading', { name: 'A native primary', exact: true })).toBeVisible();
  await webCase('UC-WFL-0004', async () => {
    const headings = page.locator('.stage-grid .stage-card h4');
    await expect(headings).toHaveCount(1); const first = await headings.first().textContent();
    await page.getByRole('button', { name: 'More stages', exact: true }).click();
    await expect(headings).toHaveCount(2); await expect(headings.first()).toHaveText(first!);
    expect(new Set(await headings.allTextContents()).size).toBe(2);
  });
  await webCase('UC-WFL-0006', async () => {
    const rows = page.locator('.table-scroll tbody tr');
    await expect(rows).toHaveCount(1); const firstFrom = await rows.first().locator('td').nth(0).textContent(), firstTo = await rows.first().locator('td').nth(1).textContent();
    const firstEditName = await rows.first().getByRole('button', { name: /^Edit move from/ }).getAttribute('aria-label');
    await page.getByRole('button', { name: 'More moves', exact: true }).click();
    await expect(rows).toHaveCount(2);
    await expect(rows.first().locator('td').nth(0)).toHaveText(firstFrom!); await expect(rows.first().locator('td').nth(1)).toHaveText(firstTo!);
    await expect(rows.first().getByRole('button', { name: /^Edit move from/ })).toHaveAttribute('aria-label', firstEditName!);
    expect(new Set(await rows.getByRole('button', { name: /^Edit move from/ }).evaluateAll(elements => elements.map(element => element.getAttribute('aria-label')))).size).toBe(2);
  });
  await webCase('UC-WFL-0008', async () => {
    const loaded = page.waitForResponse(value => value.request().method() === 'GET' && new URL(value.url()).pathname === `${root}/issue-types/${fixture.task.id}/workflows` && !new URL(value.url()).searchParams.has('cursor'));
    await page.getByRole('combobox', { name: 'Issue type', exact: true }).selectOption(fixture.task.id);
    const firstPage = zPageBindingView.parse(await (await loaded).json());
    const bindings = page.locator('.binding-list li');
    const expectedName = firstPage.items[0]!.workflowId === fixture.primary.id ? 'A native primary' : 'Z native alternate';
    await expect(bindings).toHaveCount(1); await expect(bindings.first().locator('strong')).toHaveText(expectedName); const retained = expectedName;
    await page.getByRole('button', { name: 'More bindings', exact: true }).click();
    await expect(bindings).toHaveCount(2); await expect(bindings.first().locator('strong')).toHaveText(retained!);
    expect(new Set(await bindings.locator('strong').allTextContents())).toEqual(new Set(['A native primary', 'Z native alternate']));
  });
  await webCase('UC-WFL-0048', async () => {
    await page.locator('.table-scroll tbody tr').first().getByRole('button', { name: /^Requirements for move to/ }).click();
    const editor = page.getByRole('region', { name: 'Transition requirements', exact: true });
    await expect(editor.getByLabel('Approvals needed', { exact: true })).toHaveValue('1');
    await editor.getByLabel('Approvals needed', { exact: true }).fill('0');
    const submitted = page.waitForRequest(value => value.method() === 'PUT' && new URL(value.url()).pathname === policyPath);
    const accepted = page.waitForResponse(value => value.request().method() === 'PUT' && new URL(value.url()).pathname === policyPath && value.status() === 200);
    await editor.getByRole('button', { name: 'Save requirements', exact: true }).click();
    expect((await submitted).postDataJSON()).toMatchObject({ policy: { approvalsRequired: 0, approverRole: null } });
    await accepted;
    const fresh = await coverageGet(request, policyPath, zTransitionPolicyView);
    expect(fresh.policy.approvalsRequired).toBe(0); expect(fresh.policy.approverRole).toBeNull();
  });
  // The page can start related first-page reads after a settings refresh. Drain
  // real forwarding handlers before the isolated context disposes their bodies.
  await page.unrouteAll({ behavior: 'wait' });
});

test('native board directory appends, earlier column moves persist and title search updates without submit', async ({ request, page }) => {
  const projectId = await coverageProject(request), board = await coverageBoard(request, projectId, 'Native board editing');
  await coverageBoard(request, projectId, 'Native other board');
  const directory = await smallPages(page, [`/api/v1/projects/${projectId}/boards`]);
  await signIn(page, 'member', `/boards/project/${projectId}`, /^Project boards$/);
  await webCase('UC-BRD-0002', async () => {
    const links = page.locator('.boards-list .records > li > div > a');
    await expect(links).toHaveCount(1); const firstHref = await links.first().getAttribute('href'), firstName = await links.first().textContent();
    await page.getByRole('button', { name: 'More boards', exact: true }).click();
    await assertDistinctLinks(links, 2); await expect(links.first()).toHaveAttribute('href', firstHref!); await expect(links.first()).toHaveText(firstName!);
    expect(directory.seen.filter(value => value.cursor).length).toBeGreaterThan(0);
  });
  directory.disable();
  await spa(page, `/boards/${board.board.id}/settings`);
  await expect(page.getByRole('heading', { name: 'Board settings', exact: true, level: 1 })).toBeVisible();
  await webCase('UC-BRD-0008', async () => {
    const before = board.columns.map(value => value.name), desired = [before[1]!, before[0]!, ...before.slice(2)];
    await page.locator('.native-columns .native-column').nth(1).getByRole('button', { name: 'Move column left', exact: true }).click();
    await expect(page.getByLabel('Column 1', { exact: true })).toHaveValue(desired[0]!);
    await expect(page.getByLabel('Column 2', { exact: true })).toHaveValue(desired[1]!);
    await page.getByRole('button', { name: 'Save board settings', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Board settings saved.' })).toBeVisible();
    expect((await coverageLayout(request, board.board.id)).columns.map(value => value.name)).toEqual(desired);
    await signIn(page, 'member', `/boards/${board.board.id}/settings`, /^Board settings$/);
    for (const [index, name] of desired.entries()) await expect(page.getByLabel('Column ' + (index + 1), { exact: true })).toHaveValue(name);
  });
  await webCase('UC-BRD-0009', async () => {
    await page.locator('.native-columns .native-column').first().getByRole('button', { name: 'Move column right', exact: true }).click();
    await expect(page.getByLabel('Column 1', { exact: true })).toHaveValue(board.columns[0]!.name);
    await expect(page.getByLabel('Column 2', { exact: true })).toHaveValue(board.columns[1]!.name);
    await page.getByRole('button', { name: 'Save board settings', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Board settings saved.' })).toBeVisible();
    expect((await coverageLayout(request, board.board.id)).columns.map(value => value.id)).toEqual(board.columns.map(value => value.id));
    await signIn(page, 'member', `/boards/${board.board.id}/settings`, /^Board settings$/);
    for (const [index, column] of board.columns.entries()) await expect(page.getByLabel('Column ' + (index + 1), { exact: true })).toHaveValue(column.name);
  });
  const needle = 'Native celestial search ' + crypto.randomUUID().slice(0, 8);
  await coverageIssue(request, projectId, { title: needle }); await coverageIssue(request, projectId, { title: 'Unrelated native board result' });
  await page.getByRole('link', { name: 'Open Kanban board', exact: true }).click();
  await expect(page.locator('gg-native-issue-card')).toHaveCount(2);
  await webCase('UC-BRD-0021', async () => {
    await page.getByRole('searchbox', { name: 'Search this board', exact: true }).fill(needle.slice(7));
    const cards = page.locator('gg-native-issue-card'); await expect(cards).toHaveCount(1); await expect(cards).toContainText(needle);
    await expect(page.getByRole('button', { name: /^(Search|Find)$/ })).toHaveCount(0);
  });
});

test('native backlog pages retain rank identities and a newly created Arabic title uses automatic direction', async ({ request, page }) => {
  const projectId = await coverageProject(request);
  const a = await coverageIssue(request, projectId, { title: 'Native planned A', backlog: true }), b = await coverageIssue(request, projectId, { title: 'Native planned B', backlog: true });
  const pagination = await smallPages(page, [`/api/v1/projects/${projectId}/backlog`]);
  await signIn(page, 'member', `/backlog/${projectId}`, /^Backlog$/);
  const list = page.getByRole('list', { name: 'Ranked backlog', exact: true });
  await webCase('UC-BLG-0004', async () => {
    await expect(list.locator('.planned-work small')).toHaveText([a.summary.key]);
    await page.getByRole('button', { name: 'More planned work', exact: true }).click();
    await expect(list.locator('.planned-work small')).toHaveText([a.summary.key, b.summary.key]);
    await assertDistinctLinks(list.locator('.planned-work a'), 2);
  });
  pagination.disable();
  await webCase('UC-BLG-0036', async () => {
    const title = 'خطة عربية للبوابة الذهبية';
    await page.getByRole('button', { name: 'New issue', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
    await dialog.getByLabel('Issue title', { exact: true }).fill(title);
    await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const text = list.locator('bdi').filter({ hasText: title }); await expect(text).toHaveText(title);
    expect(await text.evaluate(element => getComputedStyle(element).direction)).toBe('rtl');
    await page.getByRole('button', { name: 'Refresh backlog', exact: true }).click();
    await expect(list.locator('bdi').filter({ hasText: title })).toHaveText(title);
  });
});

test('native planning cards, linked pages, date edits and Arabic values remain observable after saving', async ({ request, page }) => {
  const projectId = await coverageProject(request), epic = await createPlanning(request, projectId, { name: 'A native epic' }), release = await createPlanning(request, projectId, { kind: 'release', name: 'B native release' });
  const issues = [await coverageIssue(request, projectId, { title: 'Native linked first' }), await coverageIssue(request, projectId, { title: 'Native linked second' })];
  for (const issue of issues) await coverageWrite(request, 'PUT', `/api/v1/issues/${issue.summary.id}/planning`, { expectedRevision: '0', epicId: epic.id, releaseId: null }, zSavedIssuePlanningView, 200, 'member');
  const pagination = await smallPages(page, [`/api/v1/projects/${projectId}/planning`, `/api/v1/projects/${projectId}/planning/${epic.id}/issues`]);
  await signIn(page, 'member', `/projects/${projectId}/planning`, /^Planning$/);
  const cards = page.locator('.planning-list > .planning-card');
  await webCase('UC-PLN-0003', async () => {
    await expect(cards).toHaveCount(1); const first = await cards.first().locator('h2').textContent();
    await page.getByRole('button', { name: 'Load more planning items', exact: true }).click();
    await expect(cards).toHaveCount(2); await expect(cards.first().locator('h2')).toHaveText(first!);
    expect(new Set(await cards.locator('h2').allTextContents())).toEqual(new Set([epic.name, release.name]));
  });
  // Subsequent saves deliberately use the ordinary application page size again.
  pagination.disable();
  for (const [item, setId, clearId] of [[epic, 'UC-PLN-0007', 'UC-PLN-0008'], [release, 'UC-PLN-0015', 'UC-PLN-0016']] as const) {
    const card = cards.filter({ has: page.getByRole('heading', { name: item.name, exact: true }) });
    await webCase(setId, async () => {
      await card.getByRole('button', { name: 'Edit ' + item.kind, exact: true }).click();
      const editor = page.getByRole('region', { name: 'Planning editor', exact: true });
      await editor.getByLabel('Target date', { exact: true }).fill('2027-02-28'); await editor.getByRole('button', { name: 'Save planning item', exact: true }).click();
      await expect(editor).not.toBeVisible(); await expect(card.locator('.card-footer > span')).toHaveText('Target 2027-02-28');
    });
    await webCase(clearId, async () => {
      await card.getByRole('button', { name: 'Edit ' + item.kind, exact: true }).click();
      const editor = page.getByRole('region', { name: 'Planning editor', exact: true });
      await editor.getByLabel('Target date', { exact: true }).fill(''); await editor.getByRole('button', { name: 'Save planning item', exact: true }).click();
      await expect(editor).not.toBeVisible(); await expect(card.locator('.card-footer > span')).toHaveText('No target date');
    });
  }
  const linkedPages = await smallPages(page, [`/api/v1/projects/${projectId}/planning/${epic.id}/issues`]);
  await webCase('UC-PLN-0023', async () => {
    await cards.filter({ has: page.getByRole('heading', { name: epic.name, exact: true }) }).getByRole('button', { name: 'View issues', exact: true }).click();
    const links = page.locator('.linked-work li a'); await expect(links).toHaveCount(1); const first = await links.first().getAttribute('href');
    await page.getByRole('button', { name: 'Load more linked issues', exact: true }).click();
    await assertDistinctLinks(links, 2); await expect(links.first()).toHaveAttribute('href', first!);
    expect(new Set(await links.evaluateAll(elements => elements.map(element => element.getAttribute('href'))))).toEqual(new Set(issues.map(issue => '/issues/' + issue.summary.id)));
  });
  linkedPages.disable();
  await webCase('UC-PLN-0075', async () => {
    const name = 'إطلاق البوابة الذهبية', description = 'خطة التسليم والتنسيق مع الفريق';
    await page.getByRole('button', { name: 'Create epic or release', exact: true }).click();
    const editor = page.getByRole('region', { name: 'Planning editor', exact: true });
    await editor.getByLabel('Name', { exact: true }).fill(name); await editor.getByLabel('Description', { exact: true }).fill(description);
    await editor.getByRole('button', { name: 'Save planning item', exact: true }).click(); await expect(editor).not.toBeVisible();
    const arabic = cards.filter({ has: page.getByRole('heading', { name, exact: true }) });
    await expect(arabic.locator('h2')).toHaveText(name); await expect(arabic.locator('.description')).toHaveText(description);
    for (const element of [arabic.locator('h2'), arabic.locator('.description')]) { await expect(element).toHaveAttribute('dir', 'auto'); expect(await element.evaluate(node => getComputedStyle(node).direction)).toBe('rtl'); }
  });
});

test('native aging pagination retains the report window and viewer planning exposes reads while denying each mutation', async ({ request, page }) => {
  const projectId = await coverageProject(request), epic = await createPlanning(request, projectId, { name: 'Native viewer epic' });
  const a = await coverageIssue(request, projectId, { title: 'Native aging A' }); await coverageIssue(request, projectId, { title: 'Native aging B' });
  const pagination = await smallPages(page, [`/api/v1/projects/${projectId}/kanban-report`]);
  await signIn(page, 'member', `/projects/${projectId}/reports`, /^Kanban reports$/);
  await webCase('UC-PLN-0049', async () => {
    const rows = page.locator('.table-scroll tbody tr'); await expect(rows).toHaveCount(1);
    const before = { from: await page.getByLabel('From', { exact: true }).inputValue(), through: await page.getByLabel('Through', { exact: true }).inputValue() }, retained = await rows.first().locator('a').getAttribute('href');
    // Editing an unsubmitted window must not change the scope of an existing page cursor.
    await page.getByLabel('From', { exact: true }).fill('2025-01-01'); await page.getByLabel('Through', { exact: true }).fill('2025-01-31');
    await page.getByRole('button', { name: 'Load more active work', exact: true }).click();
    await expect(rows).toHaveCount(2); await assertDistinctLinks(rows.locator('a'), 2); await expect(rows.first().locator('a')).toHaveAttribute('href', retained!);
    await expect(page.getByLabel('From', { exact: true })).toHaveValue('2025-01-01'); await expect(page.getByLabel('Through', { exact: true })).toHaveValue('2025-01-31');
    await expect(page.locator('.metric-grid > article').first().locator('small')).toHaveText(`During ${before.from} – ${before.through}`);
    const subsequent = pagination.seen.filter(value => value.cursor); expect(subsequent.length).toBeGreaterThan(0); expect(subsequent.every(value => value.from === before.from && value.through === before.through)).toBe(true);
  });
  pagination.disable();
  await signIn(page, 'viewer', `/projects/${projectId}/planning`, /^Planning$/);
  await webCase('UC-PLN-0064', async () => {
    await expect(page.locator('.planning-card h2')).toHaveText([epic.name]);
    await expect(page.getByRole('button', { name: 'Create epic or release', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: /^Edit (epic|release)$/ })).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Planning editor', exact: true })).toHaveCount(0);
    await coverageFailure(await request.post(apiOrigin + `/api/v1/projects/${projectId}/planning`, { headers: await coverageHeaders('viewer'), data: { kind: 'epic', name: 'Denied native viewer create', description: '', targetDate: null, status: 'planned' } }), 403, 'forbidden');
    await coverageFailure(await request.put(apiOrigin + `/api/v1/projects/${projectId}/planning/${epic.id}`, { headers: await coverageHeaders('viewer'), data: { expectedRevision: epic.revision, name: 'Denied native viewer edit', description: '', targetDate: null, status: 'planned' } }), 403, 'forbidden');
    await coverageFailure(await request.put(apiOrigin + `/api/v1/issues/${a.summary.id}/planning`, { headers: await coverageHeaders('viewer'), data: { expectedRevision: '0', epicId: epic.id, releaseId: null } }), 403, 'forbidden');
    await expect(page.locator('.planning-card h2')).toHaveText([epic.name]);
  });
});

test('native development links append, expose metadata and update URL hostname and Arabic title', async ({ request, page }) => {
  const projectId = await coverageProject(request), issue = await coverageIssue(request, projectId, { title: 'Native development work' }), path = `/api/v1/issues/${issue.summary.id}/development-links`;
  for (const [index, kind] of (['pull_request', 'commit'] as const).entries()) await coverageWrite(request, 'PUT', path + '/' + crypto.randomUUID(), { expectedRevision: '0', title: 'Native link ' + index, url: 'https://example.com/native/' + index, kind, removed: false }, zSavedDevelopmentLinkView, 201, 'member');
  const pagination = await smallPages(page, [path]);
  await signIn(page, 'member', `/issues/${issue.summary.id}`, /^Native development work$/);
  const section = page.locator('gg-development-links .development'), rows = section.locator('ul > li');
  await webCase('UC-INT-0001', async () => {
    await expect(section.getByRole('heading', { name: 'Development', exact: true })).toBeVisible(); await expect(rows).toHaveCount(1);
    const title = await rows.first().locator('a').textContent(), href = await rows.first().locator('a').getAttribute('href');
    expect(['Native link 0 ↗', 'Native link 1 ↗']).toContain(title?.trim()); expect(href).toMatch(/^https:\/\/example\.com\/native\/[01]$/);
    await expect(rows.first().locator('small')).toHaveText('example.com'); await expect(rows.first().locator('.kind')).toHaveText(title?.includes('link 0') ? 'Pull request' : 'Commit');
  });
  await webCase('UC-INT-0003', async () => {
    const first = await rows.first().locator('a').getAttribute('href');
    await section.getByRole('button', { name: 'Load more development links', exact: true }).click();
    await assertDistinctLinks(rows.locator('a'), 2); await expect(rows.first().locator('a')).toHaveAttribute('href', first!);
    expect(new Set(await rows.locator('a').allTextContents())).toEqual(new Set(['Native link 0 ↗', 'Native link 1 ↗']));
  });
  pagination.disable();
  const title = (await rows.first().locator('a').textContent())!.trim();
  await webCase('UC-INT-0009', async () => {
    await rows.first().getByRole('button', { name: 'Edit', exact: true }).click(); await section.getByLabel('URL', { exact: true }).fill('https://example.org/updated-destination');
    await section.getByRole('button', { name: 'Save development link', exact: true }).click();
    const updated = rows.filter({ has: page.getByRole('link', { name: title, exact: true }) });
    await expect(updated.locator('a')).toHaveAttribute('href', 'https://example.org/updated-destination'); await expect(updated.locator('small')).toHaveText('example.org');
  });
  await webCase('UC-INT-0013', async () => {
    const current = rows.filter({ has: page.getByRole('link', { name: title, exact: true }) }); await current.getByRole('button', { name: 'Edit', exact: true }).click();
    const arabic = 'طلب دمج للبوابة الذهبية'; await section.getByLabel('Title', { exact: true }).fill(arabic); await section.getByRole('button', { name: 'Save development link', exact: true }).click();
    const link = section.getByRole('link', { name: arabic + ' ↗', exact: true }); await expect(link).toBeVisible(); await expect(link).toHaveAttribute('dir', 'auto'); await expect(link).toHaveAttribute('href', 'https://example.org/updated-destination'); expect(await link.evaluate(node => getComputedStyle(node).direction)).toBe('rtl');
  });
});

test('native assignment-rule paging appends independent disabled rules', async ({ request, page }) => {
  const projectId = await coverageProject(request), directory = await coverageGet(request, `/api/v1/projects/${projectId}/boards`, zPageBoardSummary), board = await coverageLayout(request, directory.items.find(value => value.default)!.id), review = board.columns.flatMap(value => value.stages).find(value => value.stage.category === 'review')!.stage;
  for (const name of ['Native rule A', 'Native rule B']) await coverageWrite(request, 'PUT', `/api/v1/projects/${projectId}/automation-rules/${crypto.randomUUID()}`, { expectedRevision: '0', name, stageId: review.id, assigneeId: memberId, enabled: false }, zSavedAutomationRuleView, 201);
  const pagination = await smallPages(page, [`/api/v1/projects/${projectId}/automation-rules`]);
  await signIn(page, 'owner', `/projects/${projectId}/automation`, /^Automation$/);
  await webCase('UC-INT-0015', async () => {
    const rows = page.locator('.rules > article'); await expect(rows).toHaveCount(1); const first = await rows.first().locator('h2').textContent();
    await page.getByRole('button', { name: 'Load more rules', exact: true }).click();
    await expect(rows).toHaveCount(2); await expect(rows.first().locator('h2')).toHaveText(first!); expect(new Set(await rows.locator('h2').allTextContents())).toEqual(new Set(['Native rule A', 'Native rule B']));
    await expect(rows.locator('.rule-state')).toHaveText(['Disabled', 'Disabled']); expect(pagination.seen.some(value => value.cursor)).toBe(true);
  });
});

async function chooseNative(scope: Page | Locator, label: string, option: string) {
  await scope.getByRole('combobox', { name: label, exact: true }).click();
  await scope.getByRole('option', { name: option, exact: true }).getByRole('button').click();
  const done = scope.getByRole('button', { name: 'Done choosing', exact: true });
  if (await done.isVisible()) await done.click();
}

test('native named board creation, settings, saved view and archive controls persist independent state', async ({ request, page }) => {
  const projectId = await coverageProject(request), other = await coverageBoard(request, projectId, 'Independent comparison board');
  const keep = await coverageIssue(request, projectId, { title: 'Native permanent visible' });
  await coverageIssue(request, projectId, { title: 'Other work hidden by saved view' });
  await coverageWrite(request, 'POST', `/api/v1/boards/${other.board.id}/archive`, { expectedRevision: other.board.revision }, zSavedBoardSummary, 200, 'member');
  await signIn(page, 'member', `/boards/project/${projectId}`, /^Project boards$/);
  await webCase('UC-BRD-0001', async () => {
    const rows = page.locator('.boards-list .records > li');
    await expect(rows).toHaveCount(2); await expect(rows.filter({ hasText: other.board.name })).toContainText('Created by'); await expect(rows.filter({ hasText: other.board.name })).toContainText('Archived');
    await expect(rows.getByRole('link', { name: 'Settings', exact: true })).toHaveCount(2);
  });
  const name = 'Native created board ' + crypto.randomUUID().slice(0, 8);
  let boardId = '';
  await webCase('UC-BRD-0003', async () => {
    await page.getByLabel('New board name', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Create board', exact: true }).click();
    const row = page.locator('.boards-list .records > li').filter({ has: page.getByRole('link', { name, exact: true }) });
    await expect(row).toBeVisible(); boardId = (await row.getByRole('link', { name, exact: true }).getAttribute('href'))!.split('/').pop()!;
    const fresh = await coverageLayout(request, boardId);
    expect(fresh.board).toMatchObject({ name, default: false, archived: false });
    expect(fresh.columns.map(value => value.stages.map(mapping => mapping.stage.category))).toEqual(other.columns.map(value => value.stages.map(mapping => mapping.stage.category)));
    expect(fresh.columns.some(value => other.columns.some(otherColumn => otherColumn.id === value.id))).toBe(false);
    await row.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Board settings', exact: true, level: 1 })).toBeVisible();
  });
  const save = async () => {
    const accepted = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === `/api/v2/boards/${boardId}/layout` && response.status() === 200);
    await page.getByRole('button', { name: 'Save board settings', exact: true }).click(); await accepted;
    await expect(page.getByRole('status').filter({ hasText: 'Board settings saved.' })).toBeVisible();
  };
  await webCase('UC-BRD-0005', async () => {
    await page.getByLabel('Board name', { exact: true }).fill(name + ' renamed'); await save();
    await signIn(page, 'member', `/boards/${boardId}/settings`, /^Board settings$/); await expect(page.getByLabel('Board name', { exact: true })).toHaveValue(name + ' renamed');
  });
  let addedId = '';
  await webCase('UC-BRD-0006', async () => {
    await page.getByRole('button', { name: 'Add column', exact: true }).click();
    await page.getByLabel('Column 5', { exact: true }).fill('Optional independent group'); await save();
    const fresh = await coverageLayout(request, boardId); expect(fresh.columns).toHaveLength(5); addedId = fresh.columns[4]!.id;
    await signIn(page, 'member', `/boards/${boardId}/settings`, /^Board settings$/); await expect(page.getByLabel('Column 5', { exact: true })).toHaveValue('Optional independent group');
  });
  await webCase('UC-BRD-0007', async () => {
    const before = await coverageLayout(request, boardId);
    await page.getByLabel('Column 5', { exact: true }).fill('Renamed native group'); await save();
    const fresh = await coverageLayout(request, boardId); expect(fresh.columns[4]).toMatchObject({ id: addedId, name: 'Renamed native group' });
    expect(fresh.columns.flatMap(value => value.stages)).toEqual(before.columns.flatMap(value => value.stages));
    await signIn(page, 'member', `/boards/${boardId}/settings`, /^Board settings$/); await expect(page.getByLabel('Column 5', { exact: true })).toHaveValue('Renamed native group');
  });
  await webCase('UC-BRD-0010', async () => {
    const before = await coverageReadIssue(request, keep.summary.id);
    await page.locator('.native-columns .native-column').nth(4).getByRole('button', { name: 'Remove column', exact: true }).click();
    await expect(page.locator('.native-columns .native-column')).toHaveCount(4);
    await save();
    const fresh = await coverageLayout(request, boardId);
    expect(fresh.columns.map(column => column.id)).not.toContain(addedId);
    expect((await coverageReadIssue(request, keep.summary.id)).summary.stage).toEqual(before.summary.stage);
    await signIn(page, 'member', `/boards/${boardId}/settings`, /^Board settings$/);
    await expect(page.locator('.native-columns .native-column')).toHaveCount(4);
    await expect(page.getByRole('textbox', { name: 'Column 5', exact: true })).toHaveCount(0);
  });
  await webCase('UC-BRD-0013', async () => {
    await page.locator('gg-native-board-filters').getByRole('searchbox', { name: 'Title, key or number', exact: true }).fill('Native permanent'); await save();
    await page.getByRole('link', { name: 'Open Kanban board', exact: true }).click();
    await expect(page.locator('gg-native-issue-card')).toHaveCount(1); await expect(page.locator('gg-native-issue-card')).toContainText(keep.summary.key);
    await signIn(page, 'member', `/boards/${boardId}`, new RegExp('^' + name + ' renamed$')); await expect(page.locator('gg-native-issue-card')).toHaveCount(1); await expect(page.locator('gg-native-issue-card')).toContainText(keep.summary.title);
    await spa(page, `/boards/${boardId}/settings`); await expect(page.getByLabel('Board name', { exact: true })).toHaveValue(name + ' renamed');
  });
  await webCase('UC-BRD-0017', async () => {
    await page.getByRole('button', { name: 'Archive board', exact: true }).click();
    await expect(page.locator('.general-settings')).toContainText('Archived');
    await expect(page.getByRole('button', { name: 'Save board settings', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Board name', { exact: true })).toBeDisabled();
    await page.getByRole('link', { name: 'Open Kanban board', exact: true }).click();
    await expect(page.getByRole('heading', { name: name + ' renamed', exact: true })).toBeVisible(); await expect(page.locator('gg-native-issue-card')).toHaveCount(1);
    await expect(page.locator('.draggable-card')).toHaveClass(/cdk-drag-disabled/);
    await spa(page, `/boards/${boardId}/settings`); await expect(page.getByRole('button', { name: 'Restore board', exact: true })).toBeVisible();
  });
  await webCase('UC-BRD-0018', async () => {
    await page.getByRole('button', { name: 'Restore board', exact: true }).click();
    await expect(page.getByLabel('Board name', { exact: true })).toBeEnabled(); await expect(page.getByRole('button', { name: 'Save board settings', exact: true })).toBeVisible();
    expect((await coverageLayout(request, boardId)).board.archived).toBe(false);
  });
});

test('native board filters intersect actual cards for every supported criterion', async ({ request, page }) => {
  const projectId = await coverageProject(request), board = await coverageBoard(request, projectId, 'Native filter matrix');
  const types = await coverageGet(request, `/api/v2/projects/${projectId}/issue-types`, zPageTypeView);
  const priorities = await coverageGet(request, `/api/v2/projects/${projectId}/priorities`, (await import('../src/app/api/generated/zod.gen')).zPagePriorityView);
  const bug = types.items.find(value => value.key === 'bug')!, high = priorities.items.find(value => value.key === 'high')!;
  const label = (await coverageWrite(request, 'POST', `/api/v1/projects/${projectId}/labels`, { name: 'Native matrix label' }, (await import('../src/app/api/generated/zod.gen')).zSavedLabelView, 201, 'member')).result;
  const a = await coverageIssue(request, projectId, { title: 'Native assigned high bug', assigneeId: memberId, typeId: bug.id, priorityId: high.id, dueDate: '2020-01-01', labelIds: [label.id] });
  const b = await coverageIssue(request, projectId, { title: 'Native future unassigned', dueDate: '2099-12-01' }), c = await coverageIssue(request, projectId, { title: 'Native undated parent' });
  const child = await coverageIssue(request, projectId, { title: 'Native filtered child', parentId: c.summary.id, expectedParentRevision: c.summary.revision });
  const extra = await coverageIssue(request, projectId, { title: 'Native non-todo owner work', assigneeId: '10000000-0000-4000-8000-000000000001' });
  const extraStage = board.columns.flatMap(column => column.stages).find(mapping => mapping.stage.category === 'in_progress')!.stage;
  const d = (await coverageWrite(request, 'POST', `/api/v2/issues/${extra.summary.id}/move`, { expectedRevision: extra.summary.revision, targetStageId: extraStage.id }, (await import('../src/app/api/generated/zod.gen')).zSavedModernIssueView, 200, 'member')).result;
  const currentA = await (await import('./support/coverage-boards')).coverageReadIssue(request, a.summary.id);
  await coverageWrite(request, 'POST', `/api/v1/issues/${a.summary.id}/dependencies`, { expectedIssueRevision: currentA.summary.revision, expectedGraphRevision: currentA.graphRevision, blockerId: b.summary.id }, (await import('../src/app/api/generated/zod.gen')).zSavedDependencyView, 200, 'member');
  await signIn(page, 'member', `/boards/${board.board.id}`, /^Native filter matrix$/);
  const cards = page.locator('gg-native-issue-card'), filters = page.locator('gg-native-board-filters');
  const assertCards = async (expected: typeof a[]) => { await expect(cards).toHaveCount(expected.length); await expect.poll(async () => (await cards.evaluateAll(elements => elements.map(element => element.getAttribute('data-issue-id')))).sort()).toEqual(expected.map(value => value.summary.id).sort()); };
  const reset = async () => { await page.getByRole('button', { name: 'Clear filters', exact: true }).click(); await assertCards([a, b, c, child, d]); if (!await filters.getByRole('combobox', { name: 'Stage category', exact: true }).isVisible()) await page.locator('.board-filters > summary').click(); };
  await expect(cards).toHaveCount(5); await page.locator('.board-filters > summary').click();
  const cases: Array<[string, () => Promise<unknown>, typeof a[]]> = [
    ['UC-BRD-0023', () => filters.getByRole('combobox', { name: 'Assignment filter', exact: true }).selectOption('self'), [a]],
    ['UC-BRD-0024', () => filters.getByRole('combobox', { name: 'Stage category', exact: true }).selectOption('todo'), [a, b, c, child]],
    ['UC-BRD-0025', () => chooseNative(filters, 'Issue types', bug.name), [a]],
    ['UC-BRD-0026', () => chooseNative(filters, 'Priorities', high.name), [a]],
    ['UC-BRD-0027', () => filters.getByRole('combobox', { name: 'Assignment filter', exact: true }).selectOption('unassigned'), [b, c, child]],
    ['UC-BRD-0029', () => filters.getByRole('combobox', { name: 'Blocked filter', exact: true }).selectOption('true'), [a]],
    ['UC-BRD-0030', () => filters.getByRole('combobox', { name: 'Blocked filter', exact: true }).selectOption('false'), [b, c, child, d]],
    ['UC-BRD-0031', async () => { await filters.getByLabel('Due from', { exact: true }).fill('2099-01-01'); await filters.getByLabel('Due through', { exact: true }).fill('2099-12-31'); }, [b]],
    ['UC-BRD-0032', () => filters.getByRole('combobox', { name: 'Overdue filter', exact: true }).selectOption('true'), [a]],
    ['UC-BRD-0033', () => filters.getByRole('combobox', { name: 'Overdue filter', exact: true }).selectOption('false'), [b, c, child, d]],
    ['UC-BRD-0035', () => chooseNative(filters, 'Labels', label.name), [a]],
  ];
  for (const [id, action, expected] of cases) { await webCase(id, async () => { await action(); await assertCards(expected); }); await reset(); }
  await webCase('UC-BRD-0028', async () => {
    const people = await coverageGet(request, `/api/v1/projects/${projectId}/assignees`, (await import('../src/app/api/generated/zod.gen')).zPageUserSummary);
    const member = people.items.find(value => value.id === memberId)!;
    await filters.getByRole('combobox', { name: 'Assignment filter', exact: true }).selectOption('user');
    await chooseNative(filters, 'Project teammate', member.displayName); await assertCards([a]);
  }); await reset();
  await webCase('UC-BRD-0034', async () => {
    await filters.getByRole('searchbox', { name: 'Find a parent by title or issue key', exact: true }).fill(c.summary.key);
    await filters.getByRole('button', { name: 'Filter by parent ' + c.summary.key, exact: true }).click(); await assertCards([child]);
    await expect(cards).toContainText(child.summary.title);
  });
});

test('native epic and release CRUD and issue assignments preserve independent identities and content', async ({ request, page }) => {
  const projectId = await coverageProject(request), work = await coverageIssue(request, projectId, { title: 'Native planning linked issue', description: '<p>Independent issue description</p>', descriptionFormat: 'html' });
  await signIn(page, 'member', `/projects/${projectId}/planning`, /^Planning$/);
  const ids: { epic?: string; release?: string } = {}, names = { epic: 'Native epic CRUD', release: 'Native release CRUD' };
  const editor = page.getByRole('region', { name: 'Planning editor', exact: true });
  for (const [kind, createId, renameId, descriptionId, statuses] of [
    ['epic', 'UC-PLN-0004', 'UC-PLN-0005', 'UC-PLN-0006', [['active', 'UC-PLN-0010'], ['complete', 'UC-PLN-0011'], ['planned', 'UC-PLN-0009']]],
    ['release', 'UC-PLN-0012', 'UC-PLN-0013', 'UC-PLN-0014', [['active', 'UC-PLN-0018'], ['complete', 'UC-PLN-0019'], ['planned', 'UC-PLN-0017']]],
  ] as const) {
    const card = () => page.locator('.planning-card').filter({ has: page.getByRole('heading', { name: names[kind], exact: true }) });
    await webCase(createId, async () => {
      await page.getByRole('button', { name: /Create (your first )?epic or release/ }).first().click();
      await editor.getByRole('combobox', { name: 'Kind', exact: true }).selectOption(kind); await editor.getByLabel('Name', { exact: true }).fill(names[kind]);
      await editor.getByRole('button', { name: 'Save planning item', exact: true }).click(); await expect(editor).not.toBeVisible(); await expect(card()).toBeVisible();
      const list = await coverageGet(request, `/api/v1/projects/${projectId}/planning`, (await import('../src/app/api/generated/zod.gen')).zPagePlanningItemView);
      ids[kind] = list.items.find(value => value.name === names[kind])!.id; expect(ids[kind]).toBeTruthy();
    });
    const linkedBeforeRename = await coverageGet(request, `/api/v1/issues/${work.summary.id}/planning`, zSavedIssuePlanningView.shape.result);
    await coverageWrite(request, 'PUT', `/api/v1/issues/${work.summary.id}/planning`, { expectedRevision: linkedBeforeRename.revision, epicId: kind === 'epic' ? ids.epic! : linkedBeforeRename.epicId, releaseId: kind === 'release' ? ids.release! : linkedBeforeRename.releaseId }, zSavedIssuePlanningView, 200, 'member');
    await webCase(renameId, async () => {
      const before = (await coverageGet(request, `/api/v1/projects/${projectId}/planning`, (await import('../src/app/api/generated/zod.gen')).zPagePlanningItemView)).items.find(item => item.id === ids[kind])!;
      await card().getByRole('button', { name: 'Edit ' + kind, exact: true }).click(); names[kind] += ' renamed';
      await editor.getByLabel('Name', { exact: true }).fill(names[kind]); await editor.getByRole('button', { name: 'Save planning item', exact: true }).click(); await expect(card()).toBeVisible();
      const fresh = (await coverageGet(request, `/api/v1/projects/${projectId}/planning`, (await import('../src/app/api/generated/zod.gen')).zPagePlanningItemView)).items.find(item => item.id === ids[kind])!;
      expect(before.issueCount).toBe(1); expect(fresh).toMatchObject({ id: before.id, name: names[kind], issueCount: 1, completedCount: before.completedCount });
    });
    await webCase(descriptionId, async () => {
      await card().getByRole('button', { name: 'Edit ' + kind, exact: true }).click();
      await editor.getByLabel('Description', { exact: true }).fill('Planning-only ' + kind + ' description'); await editor.getByRole('button', { name: 'Save planning item', exact: true }).click();
      await expect(card().locator('.description')).toHaveText('Planning-only ' + kind + ' description');
      expect((await (await import('./support/coverage-boards')).coverageReadIssue(request, work.summary.id)).description).toBe(work.description);
    });
    for (const [status, id] of statuses) await webCase(id, async () => {
      await card().getByRole('button', { name: 'Edit ' + kind, exact: true }).click(); await editor.getByRole('combobox', { name: 'Status', exact: true }).selectOption(status);
      await editor.getByRole('button', { name: 'Save planning item', exact: true }).click(); await expect(card().locator('.status')).toHaveText(status);
      expect((await (await import('./support/coverage-boards')).coverageReadIssue(request, work.summary.id)).summary.stage).toEqual(work.summary.stage);
    });
  }
  await spa(page, `/issues/${work.summary.id}`); await expect(page.getByRole('heading', { name: work.summary.title, exact: true })).toBeVisible();
  const assignments = page.getByRole('region', { name: 'Issue planning', exact: true });
  const assignment = () => coverageGet(request, `/api/v1/issues/${work.summary.id}/planning`, (zSavedIssuePlanningView.shape.result));
  await webCase('UC-PLN-0027', async () => { await expect(assignments.getByRole('combobox', { name: 'Issue epic', exact: true })).toHaveValue(ids.epic!); await expect(assignments.getByRole('combobox', { name: 'Issue release', exact: true })).toHaveValue(ids.release!); await expect(assignments.getByRole('combobox', { name: 'Issue epic', exact: true }).locator('option:checked')).toHaveText(names.epic); await expect(assignments.getByRole('combobox', { name: 'Issue release', exact: true }).locator('option:checked')).toHaveText(names.release); expect((await assignment()).revision).toBe('2'); expect((await (await import('./support/coverage-boards')).coverageReadIssue(request, work.summary.id)).summary.revision).toBe(work.summary.revision); });
  const alternateEpic = await createPlanning(request, projectId, { name: 'Native replacement epic' }), alternateRelease = await createPlanning(request, projectId, { kind: 'release', name: 'Native replacement release' });
  ids.epic = alternateEpic.id; ids.release = alternateRelease.id; names.epic = alternateEpic.name; names.release = alternateRelease.name;
  // Refresh native choices from the real directory after the new replacement fixtures exist.
  await spa(page, `/projects/${projectId}/planning`); await expect(page.getByRole('heading', { name: 'Planning', exact: true, level: 1 })).toBeVisible(); await spa(page, `/issues/${work.summary.id}`); await expect(page.getByRole('heading', { name: work.summary.title, exact: true })).toBeVisible();
  for (const [kind, selected, cleared] of [['epic', 'UC-PLN-0029', 'UC-PLN-0030'], ['release', 'UC-PLN-0032', 'UC-PLN-0033']] as const) {
    await webCase(selected, async () => {
      const before = await assignment(), other = kind === 'epic' ? 'release' : 'epic';
      await assignments.getByRole('combobox', { name: 'Issue ' + kind, exact: true }).selectOption(ids[kind]!);
      await expect(assignments.getByRole('status').filter({ hasText: 'Planning updated.' })).toBeVisible();
      const fresh = await assignment(); expect(fresh[kind === 'epic' ? 'epicId' : 'releaseId']).toBe(ids[kind]); expect(fresh[other === 'epic' ? 'epicId' : 'releaseId']).toEqual(before[other === 'epic' ? 'epicId' : 'releaseId']);
      expect(fresh.revision).not.toBe(before.revision);
    });
    if (kind === 'release') await webCase('UC-PLN-0022', async () => { await spa(page, `/projects/${projectId}/planning`); const releaseCard = page.locator('.planning-card').filter({ has: page.getByRole('heading', { name: names.release, exact: true }) }); await releaseCard.getByRole('button', { name: 'View issues', exact: true }).click(); await expect(page.locator('.linked-work li')).toHaveCount(1); await expect(page.locator('.linked-work li')).toContainText(work.summary.key); await expect(page.locator('.linked-work li')).toContainText(work.summary.title); await spa(page, `/issues/${work.summary.id}`); await expect(assignments.getByRole('combobox', { name: 'Issue release', exact: true })).toHaveValue(ids.release!); });
    await webCase(cleared, async () => {
      const before = await assignment(), other = kind === 'epic' ? 'release' : 'epic';
      await assignments.getByRole('combobox', { name: 'Issue ' + kind, exact: true }).selectOption('');
      await expect.poll(async () => (await assignment())[kind === 'epic' ? 'epicId' : 'releaseId']).toBeNull(); expect((await assignment())[other === 'epic' ? 'epicId' : 'releaseId']).toEqual(before[other === 'epic' ? 'epicId' : 'releaseId']);
      await expect(assignments.getByRole('combobox', { name: 'Issue ' + kind, exact: true })).toHaveValue('');
    });
  }
});

test('native planning progress and report metrics follow actual issue completions and reopened cycles', async ({ request, page }) => {
  const projectId = await coverageProject(request), board = await coverageBoard(request, projectId), epic = await createPlanning(request, projectId, { name: 'Native measured epic' });
  const work = await coverageIssue(request, projectId, { title: 'Native measured report issue', assigneeId: memberId }), planned = await coverageIssue(request, projectId, { title: 'Excluded planned report issue', backlog: true });
  void planned;
  await coverageWrite(request, 'PUT', `/api/v1/issues/${work.summary.id}/planning`, { expectedRevision: '0', epicId: epic.id, releaseId: null }, zSavedIssuePlanningView, 200, 'member');
  const { coverageReadIssue } = await import('./support/coverage-boards');
  const { zSavedModernIssueView, zSavedDependencyView, zKanbanReport, zSavedIssueView } = await import('../src/app/api/generated/zod.gen');
  const stage = (category: string) => board.columns.flatMap(column => column.stages).find(mapping => mapping.stage.category === category)!.stage;
  const move = async (id: string, category: string) => coverageWrite(request, 'POST', `/api/v2/issues/${id}/move`, { expectedRevision: (await coverageReadIssue(request, id)).summary.revision, targetStageId: stage(category).id }, zSavedModernIssueView, 200, 'member');
  const today = new Date().toISOString().slice(0, 10), reportPath = `/api/v1/projects/${projectId}/kanban-report?from=${today}&through=${today}`;
  const report = () => coverageGet(request, reportPath, zKanbanReport);
  const refresh = async () => {
    const accepted = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === `/api/v1/projects/${projectId}/kanban-report` && response.status() === 200);
    await page.getByRole('button', { name: 'Update report', exact: true }).click(); await accepted;
    await expect(page.getByRole('button', { name: 'Update report', exact: true })).toBeEnabled();
  };
  const metric = (name: string) => page.locator('.metric-grid article').filter({ has: page.locator('span').filter({ hasText: new RegExp('^' + name + '$') }) });
  await signIn(page, 'member', `/projects/${projectId}/reports`, /^Kanban reports$/);
  await page.getByLabel('From', { exact: true }).fill(today); await page.getByLabel('Through', { exact: true }).fill(today); await refresh();
  await webCase('UC-PLN-0046', async () => { await expect(metric('Active board work').locator('strong')).toHaveText('1'); await expect(page.locator('.report-section .table-scroll tbody tr')).toHaveCount(1); await expect(page.locator('.report-section .table-scroll tbody tr')).toContainText(work.summary.key); await expect(page.locator('.report-section .table-scroll tbody tr')).not.toContainText('Excluded planned'); });
  await move(work.summary.id, 'in_progress'); await refresh();
  await webCase('UC-PLN-0048', async () => {
    const row = page.locator('.report-section .table-scroll tbody tr').filter({ hasText: work.summary.key });
    await expect(row.locator('td').nth(1)).toHaveText(work.summary.assignee!.displayName); await expect(row.locator('td').nth(2)).toHaveText(/^\d+(\.\d+)? d$/); await expect(row.locator('td').nth(3)).toHaveText(/^\d+(\.\d+)? d$/); await expect(row.locator('td').nth(4)).toHaveText('None');
  });
  await webCase('UC-PLN-0045', async () => {
    const startedAt = (await report()).work.items.find(item => item.id === work.summary.id)!.startedAt; expect(startedAt).not.toBeNull();
    await move(work.summary.id, 'todo'); await refresh();
    const row = page.locator('.report-section .table-scroll tbody tr').filter({ hasText: work.summary.key }); await expect(row.locator('small')).toHaveText(stage('todo').name); await expect(row.locator('td').nth(2)).not.toHaveText('—');
    expect((await report()).work.items.find(item => item.id === work.summary.id)!.startedAt).toBe(startedAt);
  });
  await move(work.summary.id, 'done'); await refresh();
  await webCase('UC-PLN-0041', async () => { await expect(page.locator('table.throughput tbody tr')).toHaveCount(1); await expect(page.locator('table.throughput tbody tr th')).toHaveText(today); await expect(page.locator('table.throughput tbody tr td').first()).toHaveText('1'); await expect(metric('Completed cycles').locator('strong')).toHaveText('1'); });
  await webCase('UC-PLN-0043', async () => { await expect(metric('Average cycle time').locator('strong')).toHaveText(/^\d+(\.\d+)? days$/); await expect(metric('Average cycle time').locator('small')).toHaveText('1 cycles with a recorded start'); expect((await report()).averageCycleDays).toBeGreaterThanOrEqual(0); });
  await spa(page, `/projects/${projectId}/planning`); const card = page.locator('.planning-card').filter({ has: page.getByRole('heading', { name: epic.name, exact: true }) });
  await webCase('UC-PLN-0001', async () => { await expect(card).toContainText('Epic'); await expect(card.locator('.status')).toHaveText('planned'); await expect(card.locator('.description')).toHaveText('No description yet.'); await expect(card.locator('.card-footer')).toContainText('No target date'); await expect(card.locator('progress')).toHaveAttribute('value', '1'); });
  await webCase('UC-PLN-0036', async () => { await expect(card.locator('.progress-label')).toContainText('1 / 1 issues done'); await expect(card.locator('.progress-label strong')).toHaveText('100%'); });
  await webCase('UC-PLN-0021', async () => { await card.getByRole('button', { name: 'View issues', exact: true }).click(); const linked = page.locator('.linked-work'); await expect(linked.locator('li')).toHaveCount(1); await expect(linked.locator('li')).toContainText(work.summary.key); await expect(linked.locator('li')).toContainText(stage('done').name); await linked.getByRole('button', { name: 'Close issues', exact: true }).click(); });
  await webCase('UC-PLN-0037', async () => { await move(work.summary.id, 'todo'); await signIn(page, 'member', `/projects/${projectId}/planning`, /^Planning$/); await expect(card.locator('.progress-label')).toContainText('0 / 1 issues done'); await expect(card.locator('.progress-label strong')).toHaveText('0%'); });
  await move(work.summary.id, 'done'); await spa(page, `/projects/${projectId}/reports`); await refresh();
  await webCase('UC-PLN-0042', async () => { await expect(metric('Completed cycles').locator('strong')).toHaveText('2'); await expect(page.locator('table.throughput tbody tr td').first()).toHaveText('2'); });
  await webCase('UC-PLN-0044', async () => {
    const unstarted = await coverageIssue(request, projectId, { title: 'Native unstarted completion' }); await move(unstarted.summary.id, 'done'); await refresh();
    await expect(metric('Completed cycles').locator('strong')).toHaveText('3'); await expect(metric('Average cycle time').locator('small')).toHaveText('2 cycles with a recorded start');
  });
  await webCase('UC-PLN-0038', async () => {
    await coverageWrite(request, 'POST', `/api/v1/issues/${work.summary.id}/organize`, { expectedRevision: (await coverageReadIssue(request, work.summary.id)).summary.revision, archived: true }, zSavedIssueView, 200, 'member');
    await spa(page, `/projects/${projectId}/planning`); await expect(card.locator('.progress-label')).toContainText('0 / 0 issues done'); await card.getByRole('button', { name: 'View issues', exact: true }).click(); await expect(page.locator('.linked-work li')).toHaveCount(0); await expect(page.locator('.linked-work')).toContainText('No issues assigned yet.');
  });
  const blocked = await coverageIssue(request, projectId, { title: 'Native blocked metric' }), blocker = await coverageIssue(request, projectId, { title: 'Native metric prerequisite' });
  await coverageWrite(request, 'POST', `/api/v1/issues/${blocked.summary.id}/dependencies`, { blockerId: blocker.summary.id, expectedIssueRevision: blocked.summary.revision, expectedGraphRevision: blocked.graphRevision }, zSavedDependencyView, 200, 'member');
  await spa(page, `/projects/${projectId}/reports`); await refresh();
  await webCase('UC-PLN-0047', async () => { await expect(metric('Blocked work').locator('strong')).toHaveText('1'); const row = page.locator('.report-section .table-scroll tbody tr').filter({ hasText: blocked.summary.key }); await expect(row).toHaveClass(/is-blocked/); await expect(row.locator('td').nth(4)).toHaveText('1 unfinished'); });
});

test('native development links add each kind, edit identity, reject stale edits and replay an uncertain save once', async ({ request, page }) => {
  const projectId = await coverageProject(request), issue = await coverageIssue(request, projectId, { title: 'Native integration lifecycle' }), path = `/api/v1/issues/${issue.summary.id}/development-links`;
  const { zPageDevelopmentLinkView } = await import('../src/app/api/generated/zod.gen');
  await signIn(page, 'member', `/issues/${issue.summary.id}`, /^Native integration lifecycle$/);
  const section = page.locator('gg-development-links .development');
  let selectedId = '', selectedTitle = '';
  for (const [id, kind, label] of [['UC-INT-0004', 'pull_request', 'Pull request'], ['UC-INT-0005', 'commit', 'Commit'], ['UC-INT-0006', 'other', 'Link']] as const) await webCase(id, async () => {
    selectedTitle = 'Native typed ' + kind; await section.getByRole('button', { name: 'Add link', exact: true }).click(); await section.getByRole('combobox', { name: 'Link type', exact: true }).selectOption(kind); await section.getByLabel('Title', { exact: true }).fill(selectedTitle); await section.getByLabel('URL', { exact: true }).fill('https://example.com/native/' + kind); await section.getByRole('button', { name: 'Save development link', exact: true }).click();
    const row = section.locator('li').filter({ has: page.getByRole('link', { name: selectedTitle + ' ↗', exact: true }) }); await expect(row).toBeVisible(); await expect(row.locator('.kind')).toHaveText(label); await expect(row.locator('a')).toHaveAttribute('href', 'https://example.com/native/' + kind);
    const saved = (await coverageGet(request, path, zPageDevelopmentLinkView)).items.find(value => value.title === selectedTitle)!; expect(saved.kind).toBe(kind); selectedId = saved.id;
  });
  const row = () => section.locator('li').filter({ has: page.getByRole('link', { name: selectedTitle + ' ↗', exact: true }) });
  await webCase('UC-INT-0008', async () => { await row().getByRole('button', { name: 'Edit', exact: true }).click(); selectedTitle = 'Native link retained identity'; await section.getByLabel('Title', { exact: true }).fill(selectedTitle); await section.getByRole('button', { name: 'Save development link', exact: true }).click(); await expect(row()).toBeVisible(); expect((await coverageGet(request, path, zPageDevelopmentLinkView)).items.find(value => value.id === selectedId)?.title).toBe(selectedTitle); });
  await webCase('UC-INT-0010', async () => { await row().getByRole('button', { name: 'Edit', exact: true }).click(); await section.getByRole('combobox', { name: 'Link type', exact: true }).selectOption('commit'); await section.getByRole('button', { name: 'Save development link', exact: true }).click(); await expect(row().locator('.kind')).toHaveText('Commit'); expect((await coverageGet(request, path, zPageDevelopmentLinkView)).items.find(value => value.id === selectedId)?.kind).toBe('commit'); });
  await webCase('UC-INT-0047', async () => {
    await row().getByRole('button', { name: 'Edit', exact: true }).click(); await section.getByLabel('Title', { exact: true }).fill('Native stale link draft'); const before = (await coverageGet(request, path, zPageDevelopmentLinkView)).items.find(value => value.id === selectedId)!;
    await coverageWrite(request, 'PUT', path + '/' + selectedId, { expectedRevision: before.revision, title: 'Accepted competing link title', url: before.url, kind: before.kind, removed: false }, zSavedDevelopmentLinkView, 200, 'member');
    const rejected = page.waitForResponse(value => value.request().method() === 'PUT' && new URL(value.url()).pathname === path + '/' + selectedId); await section.getByRole('button', { name: 'Save development link', exact: true }).click(); expect((await rejected).status()).toBe(409); await expect(section.getByRole('alert')).toBeVisible(); await expect(section.getByLabel('Title', { exact: true })).toHaveValue('Native stale link draft'); expect((await coverageGet(request, path, zPageDevelopmentLinkView)).items.find(value => value.id === selectedId)?.title).toBe('Accepted competing link title'); await section.getByRole('button', { name: 'Cancel', exact: true }).click(); await section.getByRole('button', { name: 'Reload links', exact: true }).click(); selectedTitle = 'Accepted competing link title'; await expect(row()).toBeVisible();
  });
  await webCase('UC-INT-0049', async () => {
    const attempts: Array<{ reference: string; body: unknown; path: string }> = []; let count = 0;
    await page.route(url => url.pathname.startsWith(path + '/'), async route => { if (route.request().method() !== 'PUT') return route.continue(); attempts.push({ reference: route.request().headers()['idempotency-key']!, body: route.request().postDataJSON(), path: new URL(route.request().url()).pathname }); const response = await route.fetch(); expect(response.status()).toBe(201); if (++count === 1) return route.abort('failed'); expect(zSavedDevelopmentLinkView.parse(await response.json()).receipt.replayed).toBe(true); await route.fulfill({ response }); }, { times: 2 });
    await section.getByRole('button', { name: 'Add link', exact: true }).click(); await section.getByLabel('Title', { exact: true }).fill('Native uncertain link'); await section.getByLabel('URL', { exact: true }).fill('https://example.com/native/replay'); await section.getByRole('button', { name: 'Save development link', exact: true }).click(); await expect(section.getByRole('alert')).toBeVisible(); await section.getByRole('button', { name: 'Save development link', exact: true }).click(); await expect(section.getByRole('link', { name: 'Native uncertain link ↗', exact: true })).toBeVisible(); expect(attempts).toHaveLength(2); expect(attempts[0]).toEqual(attempts[1]); expect(attempts[0]!.reference).toBeTruthy(); expect((await coverageGet(request, path, zPageDevelopmentLinkView)).items.filter(value => value.title === 'Native uncertain link')).toHaveLength(1);
  });
  await webCase('UC-INT-0011', async () => { await row().getByRole('button', { name: 'Remove', exact: true }).click(); await expect(row()).toHaveCount(0); expect((await coverageGet(request, path, zPageDevelopmentLinkView)).items.some(value => value.id === selectedId)).toBe(false); expect((await (await import('./support/coverage-boards')).coverageReadIssue(request, issue.summary.id)).summary.id).toBe(issue.summary.id); });
});

test('native assignment-rule create and updates retain rule identity and control later stage-entry assignment', async ({ request, page }) => {
  const projectId = await coverageProject(request), board = await coverageBoard(request, projectId), path = `/api/v1/projects/${projectId}/automation-rules`;
  const { zPageAutomationRuleView, zPageUserSummary, zSavedModernIssueView } = await import('../src/app/api/generated/zod.gen');
  const { coverageReadIssue } = await import('./support/coverage-boards');
  const review = board.columns.flatMap(value => value.stages).find(value => value.stage.category === 'review')!.stage, doing = board.columns.flatMap(value => value.stages).find(value => value.stage.category === 'in_progress')!.stage;
  const people = (await coverageGet(request, `/api/v1/projects/${projectId}/assignees`, zPageUserSummary)).items, member = people.find(value => value.id === memberId)!, owner = people.find(value => value.id === '10000000-0000-4000-8000-000000000001')!;
  await signIn(page, 'owner', `/projects/${projectId}/automation`, /^Automation$/);
  let name = 'Native assignment owner', ruleId = '';
  const row = () => page.locator('.rules article').filter({ has: page.getByRole('heading', { name, exact: true }) }), editor = page.locator('.editor');
  const save = async () => { await editor.getByRole('button', { name: 'Save assignment rule', exact: true }).click(); await expect(editor).toHaveCount(0); await expect(row()).toBeVisible(); };
  const rules = () => coverageGet(request, path, zPageAutomationRuleView);
  await webCase('UC-INT-0017', async () => { await page.getByRole('button', { name: 'Create assignment rule', exact: true }).click(); await editor.getByLabel('Rule name', { exact: true }).fill(name); await editor.getByRole('combobox', { name: 'When issue enters', exact: true }).selectOption(review.id); await chooseNative(editor, 'Assign to', member.displayName); await save(); await expect(row().locator('.rule-state')).toHaveText('Enabled'); const saved = (await rules()).items.find(value => value.name === name)!; ruleId = saved.id; expect(saved).toMatchObject({ stageId: review.id, assignee: { id: memberId }, enabled: true }); });
  await webCase('UC-INT-0018', async () => { await page.getByRole('button', { name: 'Create assignment rule', exact: true }).click(); await editor.getByLabel('Rule name', { exact: true }).fill('Native disabled retained rule'); await editor.getByRole('combobox', { name: 'When issue enters', exact: true }).selectOption(doing.id); await chooseNative(editor, 'Assign to', owner.displayName); await editor.getByLabel('Enable this rule', { exact: true }).uncheck(); await editor.getByRole('button', { name: 'Save assignment rule', exact: true }).click(); await expect(editor).toHaveCount(0); const disabled = page.locator('.rules article').filter({ has: page.getByRole('heading', { name: 'Native disabled retained rule', exact: true }) }); await expect(disabled.locator('.rule-state')).toHaveText('Disabled'); expect((await rules()).items.find(value => value.name === 'Native disabled retained rule')?.enabled).toBe(false); const work = await coverageIssue(request, projectId, { title: 'New disabled rule remains inert' }); await coverageWrite(request, 'POST', `/api/v2/issues/${work.summary.id}/move`, { expectedRevision: work.summary.revision, targetStageId: doing.id }, zSavedModernIssueView, 200, 'member'); expect((await coverageReadIssue(request, work.summary.id)).summary.assignee).toBeNull(); });
  await webCase('UC-INT-0014', async () => { await expect(page.locator('.rules article')).toHaveCount(2); await expect(row()).toContainText(review.name); await expect(row()).toContainText(member.displayName); await expect(page.locator('.rule-state')).toHaveText(['Enabled', 'Disabled']); });
  await webCase('UC-INT-0019', async () => { await row().getByRole('button', { name: 'Edit rule', exact: true }).click(); name = 'Renamed native assignment owner'; await editor.getByLabel('Rule name', { exact: true }).fill(name); await save(); expect((await rules()).items.find(value => value.id === ruleId)?.name).toBe(name); });
  await webCase('UC-INT-0020', async () => { await row().getByRole('button', { name: 'Edit rule', exact: true }).click(); await editor.getByRole('combobox', { name: 'When issue enters', exact: true }).selectOption(doing.id); await save(); await expect(row()).toContainText(doing.name); expect((await rules()).items.find(value => value.id === ruleId)?.stageId).toBe(doing.id); const work = await coverageIssue(request, projectId, { title: 'Changed native rule stage entry' }); await coverageWrite(request, 'POST', `/api/v2/issues/${work.summary.id}/move`, { expectedRevision: work.summary.revision, targetStageId: doing.id }, zSavedModernIssueView, 200, 'member'); expect((await coverageReadIssue(request, work.summary.id)).summary.assignee?.id).toBe(memberId); });
  await webCase('UC-INT-0021', async () => { await row().getByRole('button', { name: 'Edit rule', exact: true }).click(); await chooseNative(editor, 'Assign to', owner.displayName); await save(); await expect(row()).toContainText(owner.displayName); expect((await rules()).items.find(value => value.id === ruleId)?.assignee.id).toBe(owner.id); const work = await coverageIssue(request, projectId, { title: 'Changed native rule assignee entry' }); await coverageWrite(request, 'POST', `/api/v2/issues/${work.summary.id}/move`, { expectedRevision: work.summary.revision, targetStageId: doing.id }, zSavedModernIssueView, 200, 'member'); expect((await coverageReadIssue(request, work.summary.id)).summary.assignee?.id).toBe(owner.id); });
  await webCase('UC-INT-0022', async () => { await row().getByRole('button', { name: 'Edit rule', exact: true }).click(); await editor.getByLabel('Enable this rule', { exact: true }).uncheck(); await save(); await expect(row().locator('.rule-state')).toHaveText('Disabled'); const work = await coverageIssue(request, projectId, { title: 'Native disabled stage entry' }); await coverageWrite(request, 'POST', `/api/v2/issues/${work.summary.id}/move`, { expectedRevision: work.summary.revision, targetStageId: doing.id }, zSavedModernIssueView, 200, 'member'); expect((await coverageReadIssue(request, work.summary.id)).summary.assignee).toBeNull(); });
  await webCase('UC-INT-0023', async () => { await row().getByRole('button', { name: 'Edit rule', exact: true }).click(); await editor.getByLabel('Enable this rule', { exact: true }).check(); await save(); await expect(row().locator('.rule-state')).toHaveText('Enabled'); const work = await coverageIssue(request, projectId, { title: 'Native enabled stage entry' }); await coverageWrite(request, 'POST', `/api/v2/issues/${work.summary.id}/move`, { expectedRevision: work.summary.revision, targetStageId: doing.id }, zSavedModernIssueView, 200, 'member'); expect((await coverageReadIssue(request, work.summary.id)).summary.assignee?.id).toBe(owner.id); });
  await webCase('UC-INT-0054', async () => { await row().getByRole('button', { name: 'Edit rule', exact: true }).click(); name = 'تعيين مطور المراجعة'; await editor.getByLabel('Rule name', { exact: true }).fill(name); await save(); await expect(row().locator('h2')).toHaveAttribute('dir', 'auto'); expect(await row().locator('h2').evaluate(element => getComputedStyle(element).direction)).toBe('rtl'); await signIn(page, 'owner', `/projects/${projectId}/automation`, /^Automation$/); await expect(row().locator('h2')).toHaveText(name); });
});

test('native column mappings group stages from one or several workflows without reassigning their issues', async ({ request, page }) => {
  const projectId = await coverageProject(request), fixture = await boundWorkflow(request, projectId), board = await coverageBoard(request, projectId, 'Native mapped processes');
  const { zSavedModernIssueView } = await import('../src/app/api/generated/zod.gen'); const { coverageReadIssue } = await import('./support/coverage-boards');
  const stages = board.columns.flatMap(column => column.stages), doing = stages.find(mapping => mapping.workflow.id === fixture.primary.id && mapping.stage.category === 'in_progress')!.stage, review = stages.find(mapping => mapping.workflow.id === fixture.primary.id && mapping.stage.category === 'review')!.stage;
  const a = await coverageIssue(request, projectId, { title: 'Native mapped doing issue' }), b = await coverageIssue(request, projectId, { title: 'Native mapped review issue' }), alternate = await coverageIssue(request, projectId, { title: 'Native alternate workflow issue', workflowId: fixture.alternate.id });
  await coverageWrite(request, 'POST', `/api/v2/issues/${a.summary.id}/move`, { expectedRevision: a.summary.revision, targetStageId: doing.id }, zSavedModernIssueView, 200, 'member'); await coverageWrite(request, 'POST', `/api/v2/issues/${b.summary.id}/move`, { expectedRevision: b.summary.revision, targetStageId: review.id }, zSavedModernIssueView, 200, 'member');
  const columnIndex = board.columns.findIndex(column => column.stages.some(mapping => mapping.stage.id === doing.id)), reviewIndex = board.columns.findIndex(column => column.stages.some(mapping => mapping.stage.id === review.id)), destinationId = board.columns[columnIndex]!.id;
  const settings = async () => signIn(page, 'member', `/boards/${board.board.id}/settings`, /^Board settings$/);
  const save = async () => { const accepted = page.waitForResponse(value => value.request().method() === 'PUT' && new URL(value.url()).pathname === `/api/v2/boards/${board.board.id}/layout` && value.status() === 200); await page.getByRole('button', { name: 'Save board settings', exact: true }).click(); await accepted; await page.getByRole('link', { name: 'Open Kanban board', exact: true }).click(); };
  await settings();
  await webCase('UC-BRD-0011', async () => { await page.locator('.native-column').nth(reviewIndex).getByRole('button', { name: 'Remove ' + review.name, exact: true }).click(); await chooseNative(page.locator('.native-column').nth(columnIndex), 'Mapped workflow stages', review.name); await save(); const column = page.locator(`.kanban-column[data-column-id="${destinationId}"]`); await expect(column.locator('gg-native-issue-card')).toHaveCount(2); expect((await column.locator('gg-native-issue-card').evaluateAll(elements => elements.map(element => element.getAttribute('data-issue-id')))).sort()).toEqual([a.summary.id, b.summary.id].sort()); expect((await coverageReadIssue(request, a.summary.id)).summary.stage.id).toBe(doing.id); expect((await coverageReadIssue(request, b.summary.id)).summary.stage.id).toBe(review.id); });
  await settings();
  await webCase('UC-BRD-0012', async () => { const layout = await coverageLayout(request, board.board.id), previousIndex = layout.columns.findIndex(column => column.stages.some(mapping => mapping.stage.id === alternate.summary.stage.id)); if (previousIndex >= 0) await page.locator('.native-column').nth(previousIndex).getByRole('button', { name: 'Remove ' + alternate.summary.stage.name, exact: true }).click(); await page.getByRole('combobox', { name: 'Workflow choices', exact: true }).selectOption(fixture.alternate.id); await chooseNative(page.locator('.native-column').nth(columnIndex), 'Mapped workflow stages', alternate.summary.stage.name); await save(); const column = page.locator(`.kanban-column[data-column-id="${destinationId}"]`); await expect(column.locator('gg-native-issue-card')).toHaveCount(3); expect((await column.locator('gg-native-issue-card').evaluateAll(elements => elements.map(element => element.getAttribute('data-issue-id')))).sort()).toEqual([a.summary.id, b.summary.id, alternate.summary.id].sort()); expect((await coverageReadIssue(request, a.summary.id)).summary.workflow.id).toBe(fixture.primary.id); expect((await coverageReadIssue(request, b.summary.id)).summary.workflow.id).toBe(fixture.primary.id); expect((await coverageReadIssue(request, alternate.summary.id)).summary.workflow.id).toBe(fixture.alternate.id); });
});

test('native report initially requests one bounded payload and exposes the continuation instead of all thirty issues', async ({ request, page }) => {
  const projectId = await coverageProject(request);
  for (let index = 0; index < 30; index++) await coverageIssue(request, projectId, { title: 'Native report bounded issue ' + index });
  const response = page.waitForResponse(value => value.request().method() === 'GET' && new URL(value.url()).pathname === `/api/v1/projects/${projectId}/kanban-report` && value.status() === 200);
  await signIn(page, 'member', `/projects/${projectId}/reports`, /^Kanban reports$/);
  await webCase('UC-PLN-0076', async () => { const incoming = await response; expect(new URL(incoming.request().url()).searchParams.get('limit')).toBe('25'); const report = (await import('../src/app/api/generated/zod.gen')).zKanbanReport.parse(await incoming.json()); expect(report.work.items).toHaveLength(25); expect(report.work.totalMatching).toBe(30); expect(report.work.nextCursor).not.toBeNull(); await expect(page.locator('.report-section .table-scroll tbody tr')).toHaveCount(25); await expect(page.getByRole('button', { name: 'Load more active work', exact: true })).toBeVisible(); expect(new Set(report.work.items.map(value => value.id)).size).toBe(25); });
});
