import { expect, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { localFixturesAvailable, signIn } from './support/session';
import { coverageBoard, coverageSwitchAccount, coverageConfiguration, coverageLayout, coverageLayoutDraft, coverageSaveLayout, coverageGet, coverageIssue, coverageProject, coverageReadIssue, coverageWrite } from './support/coverage-boards';
import { zPagePriorityView, zPageTypeView, zSavedDependencyView, zSavedIssueView, zSavedModernIssueView, zSavedTypeSaved, zSavedPrioritySaved, zSavedWorkflowSaved, zSavedStageSaved, zSavedTransitionSaved, zSavedConfigurationView, zPageBoardSummary, zPageAssetView, zSavedLabelView } from '../src/app/api/generated/zod.gen';
import type { ModernIssueView } from '../src/app/api/generated/types.gen';
test.skip(!localFixturesAvailable, 'Requires isolated PostgreSQL fixtures and real application services.');
test.use({ trace: 'off' });
const memberId = '10000000-0000-4000-8000-000000000002';
const ownerId = '10000000-0000-4000-8000-000000000001';
function results(page: Page) { return page.getByRole('list', { name: 'Issue results list', exact: true }).locator('.issue-key'); }
async function keys(page: Page, values: ModernIssueView[]) { await expect(results(page)).toHaveText(values.map(value => value.summary.key)); }
async function advanced(page: Page) { const details = page.locator('details.advanced-filters'); if (!await details.evaluate(node => node.hasAttribute('open')))
    await details.locator('summary').click(); }
async function route(page: Page, path: string) { await page.evaluate(next => { history.pushState({}, '', next); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }, path); }
test('issue list live filters cover title, key, projects, ownership, native choices, dates, blockers and parents', async ({ page, request }) => {
    test.setTimeout(120000);
    const projectId = await coverageProject(request), otherProject = await coverageProject(request);
    const board = await coverageBoard(request, projectId), review = board.columns.flatMap(column => column.stages).find(value => value.stage.category === 'review')?.stage, done = board.columns.flatMap(column => column.stages).find(value => value.stage.category === 'done')?.stage;
    const types = await coverageGet(request, `/api/v2/projects/${projectId}/issue-types`, zPageTypeView), priorities = await coverageGet(request, `/api/v2/projects/${projectId}/priorities`, zPagePriorityView);
    const bug = types.items.find(value => value.key === 'bug'), high = priorities.items.find(value => value.key === 'high');
    if (!bug || !high || !review || !done)
        throw new Error('Missing seeded native configuration');
    const suffix = crypto.randomUUID().slice(0, 8);
    const a = await coverageIssue(request, projectId, { title: `Discovery Alpha ${suffix}`, typeId: bug.id, priorityId: high.id, assigneeId: memberId, dueDate: '2000-01-01' });
    const b = await coverageIssue(request, projectId, { title: `Discovery Beta ${suffix}`, assigneeId: ownerId, dueDate: '2999-01-01' });
    let c = await coverageIssue(request, projectId, { title: `Discovery Complete ${suffix}`, priorityId: high.id });
    c = (await coverageWrite(request, 'POST', `/api/v2/issues/${c.summary.id}/move`, { expectedRevision: c.summary.revision, targetStageId: done.id }, zSavedModernIssueView, 200, 'member')).result;
    const backlog = await coverageIssue(request, projectId, { title: `Discovery planned ${suffix}`, backlog: true });
    const archived = await coverageIssue(request, projectId, { title: `Discovery archived ${suffix}` });
    await coverageWrite(request, 'POST', `/api/v1/issues/${archived.summary.id}/organize`, { expectedRevision: archived.summary.revision, archived: true }, zSavedIssueView, 200, 'member');
    const child = await coverageIssue(request, projectId, { title: `Discovery child ${suffix}`, parentId: a.summary.id, expectedParentRevision: a.summary.revision });
    const related = await coverageIssue(request, otherProject, { title: `Discovery other ${suffix}` });
    const latestA = await coverageReadIssue(request, a.summary.id);
    await coverageWrite(request, 'POST', `/api/v1/issues/${a.summary.id}/dependencies`, { blockerId: b.summary.id, expectedIssueRevision: latestA.summary.revision, expectedGraphRevision: latestA.graphRevision }, zSavedDependencyView, 200, 'member');
    await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/);
    const search = page.getByRole('searchbox', { name: 'Search by title or issue key', exact: true });
    await useCase('UC-ISS-0032', async () => { await search.fill(a.summary.title); await keys(page, [a]); await expect(page.getByRole('button', { name: 'Search', exact: true })).toHaveCount(0); }, 'web');
    await useCase('UC-ISS-0033', async () => { await search.fill(b.summary.key); await keys(page, [b]); }, 'web');
    await useCase('UC-ISS-0035', async () => { await search.clear(); await expect(results(page)).toHaveCount(5); expect((await results(page).allTextContents()).sort()).toEqual([a.summary.key, b.summary.key, c.summary.key, child.summary.key, backlog.summary.key].sort()); }, 'web');
    await useCase('UC-ISS-0036', async () => {
        const picker = page.getByRole('combobox', { name: 'Project', exact: true });
        const target = picker.locator('option[value="' + otherProject + '"]');
        // Other suites create projects in this disposable company. A different
        // project may be outside the first directory page; use the real pager.
        for (let index = 0; index < 100 && await target.count() === 0; index++) {
            const before = await picker.locator('option').count();
            const more = page.getByRole('main').getByRole('button', { name: 'More projects', exact: true });
            await expect(more).toBeVisible(); await more.click();
            await expect.poll(() => picker.locator('option').count()).toBeGreaterThan(before);
        }
        await expect(target).toHaveCount(1);
        await picker.selectOption(otherProject); await keys(page, [related]);
        await picker.selectOption(projectId); await expect(results(page)).toHaveCount(5);
    }, 'web');
    await useCase('UC-ISS-0037', async () => { await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption(''); await search.fill(suffix); await expect(results(page)).toHaveCount(6); expect((await results(page).allTextContents()).sort()).toEqual([a, b, c, child, backlog, related].map(value => value.summary.key).sort()); await search.clear(); await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption(projectId); }, 'web');
    await useCase('UC-ISS-0038', async () => { await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('open'); await expect(results(page)).toHaveCount(4); await expect(results(page).filter({ hasText: new RegExp('^' + c.summary.key + '$') })).toHaveCount(0); await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption(''); }, 'web');
    await useCase('UC-ISS-0044', async () => { await page.getByRole('button', { name: 'My Issues', exact: true }).click(); await expect(page.getByRole('combobox', { name: 'Assigned to', exact: true })).toHaveValue('self'); await keys(page, [a]); await page.getByRole('combobox', { name: 'Assigned to', exact: true }).selectOption('any'); }, 'web');
    await advanced(page);
    await useCase('UC-ISS-0046', async () => { await page.getByRole('searchbox', { name: 'Filter teammate search', exact: true }).fill('مطور'); const assignees = page.getByRole('combobox', { name: 'Assigned to', exact: true }); await expect(assignees.locator('option[value="' + memberId + '"]')).toHaveText('مطور تجريبي'); await expect(assignees.locator('option[value="' + ownerId + '"]')).toHaveCount(0); await assignees.selectOption(memberId); await keys(page, [a]); await assignees.selectOption('any'); }, 'web');
    await useCase('UC-ISS-0048', async () => { await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption(bug.id); await keys(page, [a]); await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption(''); }, 'web');
    await useCase('UC-ISS-0049', async () => { await page.getByRole('combobox', { name: 'Priority', exact: true }).selectOption(high.id); await expect(results(page)).toHaveCount(2); expect((await results(page).allTextContents()).sort()).toEqual([a.summary.key, c.summary.key].sort()); await page.getByRole('combobox', { name: 'Priority', exact: true }).selectOption(''); }, 'web');
    await useCase('UC-ISS-0053', async () => { await page.getByRole('combobox', { name: 'Overdue', exact: true }).selectOption('false'); await expect(results(page)).toHaveCount(4); await expect(results(page).filter({ hasText: new RegExp('^' + a.summary.key + '$') })).toHaveCount(0); await page.getByRole('combobox', { name: 'Overdue', exact: true }).selectOption(''); }, 'web');
    await useCase('UC-ISS-0054', async () => { await page.getByRole('combobox', { name: 'Blocked', exact: true }).selectOption('true'); await keys(page, [a]); }, 'web');
    await useCase('UC-ISS-0055', async () => { await page.getByRole('combobox', { name: 'Blocked', exact: true }).selectOption('false'); await expect(results(page)).toHaveCount(4); await expect(results(page).filter({ hasText: new RegExp('^' + a.summary.key + '$') })).toHaveCount(0); await page.getByRole('combobox', { name: 'Blocked', exact: true }).selectOption(''); }, 'web');
    await useCase('UC-ISS-0057', async () => { await page.getByRole('searchbox', { name: 'Find a parent by title or issue key', exact: true }).fill(a.summary.key); await page.getByRole('button', { name: 'Filter by parent ' + a.summary.key, exact: true }).click(); await keys(page, [child]); }, 'web');
    await useCase('UC-ISS-0059', async () => { await page.getByRole('button', { name: 'Clear parent filter', exact: true }).click(); await expect(results(page)).toHaveCount(5); }, 'web');
    await useCase('UC-ISS-0062', async () => { await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('archived'); await keys(page, [archived]); }, 'web');
    await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('backlog');
    await keys(page, [backlog]);
    await useCase('UC-ISS-0060', async () => { await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('active'); await expect(results(page)).toHaveCount(5); }, 'web');
    await useCase('UC-ISS-0064', async () => { await page.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('created'); await keys(page, [child, backlog, c, b, a]); }, 'web');
    await useCase('UC-ISS-0065', async () => { await page.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('due'); await expect(results(page).first()).toHaveText(a.summary.key); await expect(results(page).nth(1)).toHaveText(b.summary.key); }, 'web');
    await useCase('UC-ISS-0066', async () => { await page.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('priority'); await expect.poll(async () => (await results(page).allTextContents()).slice(0, 2).sort()).toEqual([a.summary.key, c.summary.key].sort()); }, 'web');
    await useCase('UC-ISS-0063', async () => { const fresh = await coverageReadIssue(request, b.summary.id); await coverageWrite(request, 'PATCH', `/api/v2/issues/${b.summary.id}/fields`, { field: 'dueDate', dueDate: { prior: fresh.summary.dueDate, value: '2999-02-01' } }, zSavedModernIssueView, 200, 'member'); await page.getByRole('combobox', { name: 'Sort', exact: true }).selectOption('updated'); await expect(results(page).first()).toHaveText(b.summary.key); }, 'web');
    await useCase('UC-ISS-0068', async () => { await search.fill(a.summary.key); await keys(page, [a]); await page.getByRole('button', { name: 'Reset filters', exact: true }).click(); await expect(search).toHaveValue(''); await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue(''); await expect(page.getByRole('combobox', { name: 'Assigned to', exact: true })).toHaveValue('any'); await expect(page.getByRole('combobox', { name: 'Sort', exact: true })).toHaveValue('updated'); await expect(page.getByRole('combobox', { name: 'Project', exact: true })).toHaveValue(''); await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption(projectId); await expect(results(page)).toHaveCount(5); }, 'web');
    await useCase('UC-ISS-0081', async () => { await page.getByRole('list', { name: 'Issue results list' }).locator('.issue-link').filter({ hasText: a.summary.key }).click(); await expect(page).toHaveURL(new RegExp('/issues/' + a.summary.id + '$')); await expect(page.getByRole('heading', { name: a.summary.title, exact: true })).toBeVisible(); }, 'web');
});
test('issue route reuse and failed live reads keep the correct current filters and results', async ({ page, request }) => {
    const projectId = await coverageProject(request), a = await coverageIssue(request, projectId, { title: 'Route Alpha', assigneeId: memberId }), b = await coverageIssue(request, projectId, { title: 'Route Beta' });
    const path = `/issues?projectId=${projectId}&query=Route&status=open&assignee=self&view=active&sort=due&blocked=false`;
    await useCase('UC-ISS-0072', async () => { await signIn(page, 'member', path, /^Issues$/); await advanced(page); await expect(page.getByRole('searchbox', { name: 'Search by title or issue key', exact: true })).toHaveValue('Route'); await expect(page.getByRole('combobox', { name: 'Project', exact: true })).toHaveValue(projectId); await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('open'); await expect(page.getByRole('combobox', { name: 'Assigned to', exact: true })).toHaveValue('self'); await expect(page.getByRole('combobox', { name: 'View', exact: true })).toHaveValue('active'); await expect(page.getByRole('combobox', { name: 'Sort', exact: true })).toHaveValue('due'); await expect(page.getByRole('combobox', { name: 'Blocked', exact: true })).toHaveValue('false'); await keys(page, [a]); }, 'web');
    await useCase('UC-ISS-0073', async () => { await route(page, `/issues?projectId=${projectId}&query=${b.summary.key}&assignee=unassigned`); await expect(page.getByRole('searchbox', { name: 'Search by title or issue key', exact: true })).toHaveValue(b.summary.key); await expect(page.getByRole('combobox', { name: 'Assigned to', exact: true })).toHaveValue('unassigned'); await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue(''); await keys(page, [b]); }, 'web');
    await useCase('UC-ISS-0079', async () => { await page.route('**/api/v2/issues/search', route => route.abort('failed'), { times: 1 }); await page.getByRole('searchbox', { name: 'Search by title or issue key', exact: true }).fill(a.summary.key); await expect(page.getByRole('alert')).toContainText('request could not be completed'); await expect(results(page).filter({ hasText: new RegExp('^' + a.summary.key + '$') })).toHaveCount(0); await page.getByRole('searchbox', { name: 'Search by title or issue key', exact: true }).fill(b.summary.title); await keys(page, [b]); await expect(page.getByRole('alert')).toHaveCount(0); }, 'web');
});
test('creation opens from local and global commands, retains dirty fields/files, and saves explicit native choices', async ({ page, request }) => {
    const projectId = await coverageProject(request);
    const type = (await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/issue-types/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, key: 'discovery_story', name: 'Discovery story', behavior: 'standard', retired: false }, zSavedTypeSaved, 201)).result.type;
    const priority = (await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/priorities/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, key: 'discovery_urgent', name: 'Discovery urgent', sortOrder: '1', retired: false }, zSavedPrioritySaved, 201)).result.priority;
    const flow = (await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/workflows/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, name: 'Alternative creation flow', retired: false }, zSavedWorkflowSaved)).result.workflow;
    const stages = [];
    for (const [index, category] of (['todo', 'done'] as const).entries()) {
        stages.push((await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/workflows/${flow.id}/stages/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, name: category === 'todo' ? 'Ready for discovery' : 'Discovery complete', category, position: String(index + 1), initial: category === 'todo', acceptsEntries: true, retired: false }, zSavedStageSaved)).result.stage);
    }
    const first = stages[0], last = stages[1];
    if (!first || !last)
        throw new Error('Missing alternative stages');
    await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/workflows/${flow.id}/transitions/${crypto.randomUUID()}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, fromStageId: first.id, toStageId: last.id, requiredPermission: null, retired: false }, zSavedTransitionSaved);
    const defaultBoard = (await coverageGet(request, `/api/v1/projects/${projectId}/boards`, zPageBoardSummary)).items.find(value => value.default);
    if (!defaultBoard)
        throw new Error('Missing default board');
    const layout = await coverageLayout(request, defaultBoard.id), draft = coverageLayoutDraft(layout);
    for (const stage of stages) {
        const column = layout.columns.find(value => value.stages.some(mapping => mapping.stage.category === stage.category));
        if (!column)
            throw new Error('Missing category');
        draft.columns.find(value => value.id === column.id)!.stageIds.push(stage.id);
    }
    await coverageSaveLayout(request, defaultBoard.id, draft, 'owner');
    await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/issue-types/${type.id}/workflows/${flow.id}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, default: false, acceptsNew: true }, zSavedConfigurationView);
    await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/);
    const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
    let creates = 0;
    page.on('request', r => { if (r.method() === 'POST' && new URL(r.url()).pathname === `/api/v2/projects/${projectId}/issues`)
        creates++; });
    await useCase('UC-ISS-0001', async () => { await page.getByRole('button', { name: 'New issue', exact: true }).click(); await expect(dialog).toBeVisible(); await expect(dialog.getByLabel('Issue title', { exact: true })).toBeFocused(); }, 'web');
    await useCase('UC-ISS-0016', async () => { await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(dialog).not.toBeVisible(); expect(creates).toBe(0); }, 'web');
    await useCase('UC-ISS-0002', async () => { await page.getByRole('link', { name: 'Create issue', exact: true }).click(); await expect(dialog).toBeVisible(); await expect(page.getByRole('combobox', { name: 'Project', exact: true })).toHaveValue(projectId); }, 'web');
    await dialog.getByLabel('Issue title', { exact: true }).fill('Explicit discovery creation');
    await useCase('UC-ISS-0017', async () => { page.once('dialog', confirmation => confirmation.dismiss()); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(dialog).toBeVisible(); await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue('Explicit discovery creation'); expect(creates).toBe(0); }, 'web');
    await useCase('UC-ISS-0019', async () => { const chooser = page.waitForEvent('filechooser'); await dialog.getByRole('button', { name: 'Attach files or pictures', exact: true }).click(); await (await chooser).setFiles({ name: 'discovery.txt', mimeType: 'text/plain', buffer: Buffer.from('Original creation file') }); await expect(dialog.getByRole('list', { name: 'Queued attachments' })).toContainText('discovery.txt'); expect(creates).toBe(0); }, 'web');
    await useCase('UC-ISS-0018', async () => { page.once('dialog', confirmation => confirmation.accept()); await dialog.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(dialog).not.toBeVisible(); await page.getByRole('button', { name: 'New issue', exact: true }).click(); await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue('Explicit discovery creation'); await expect(dialog.getByRole('list', { name: 'Queued attachments' })).toContainText('discovery.txt'); await expect(dialog.getByText(/Draft restored in this tab/)).toBeVisible(); }, 'web');
    await useCase('UC-ISS-0010', async () => { await dialog.getByLabel('Issue type', { exact: true }).selectOption(type.id); await expect(dialog.getByRole('combobox', { name: 'Workflow', exact: true }).locator('option[value="' + flow.id + '"]')).toHaveText(flow.name); await expect(dialog.getByRole('combobox', { name: 'Workflow', exact: true })).toHaveValue(''); }, 'web');
    await dialog.getByRole('combobox', { name: 'Workflow', exact: true }).selectOption(flow.id);
    await dialog.getByLabel('Priority', { exact: true }).selectOption(priority.id);
    await useCase('UC-ISS-0020', async () => { await dialog.getByRole('button', { name: 'Create issue', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Explicit discovery creation', exact: true })).toBeVisible(); expect(creates).toBe(1); const issueId = new URL(page.url()).pathname.split('/').at(-1); if (!issueId)
        throw new Error('Missing new issue URL'); const assets = await coverageGet(request, `/api/v1/issues/${issueId}/assets`, zPageAssetView); expect(assets.items.map(value => value.filename)).toEqual(['discovery.txt']); await expect(page.locator('gg-issue-attachments')).toContainText('discovery.txt'); }, 'web');
    const issueId = new URL(page.url()).pathname.split('/').at(-1);
    if (!issueId)
        throw new Error('Missing created issue');
    await useCase('UC-ISS-0005', async () => { expect((await coverageReadIssue(request, issueId)).summary.type.id).toBe(type.id); await expect(page.getByRole('complementary', { name: 'Issue metadata' })).toContainText(type.name); }, 'web');
    await useCase('UC-ISS-0007', async () => { expect((await coverageReadIssue(request, issueId)).summary.priority.id).toBe(priority.id); await expect(page.locator('.priority-value')).toContainText(priority.name); }, 'web');
    await useCase('UC-ISS-0009', async () => { const saved = await coverageReadIssue(request, issueId); expect(saved.summary.workflow.id).toBe(flow.id); expect(saved.summary.stage.id).toBe(first.id); await expect(page.getByRole('button', { name: 'Issue status: ' + first.name, exact: true })).toBeVisible(); }, 'web');
});
test('issue result cursors append, reset for changed filters, and enforce the 100-item bulk selection boundary', async ({ page, request }) => {
    test.setTimeout(90000);
    const projectId = await coverageProject(request);
    const created: ModernIssueView[] = [];
    for (let index = 0; index < 102; index++)
        created.push(await coverageIssue(request, projectId, { title: 'Paged issue ' + String(index).padStart(3, '0') }));
    await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/);
    await expect(results(page)).toHaveCount(25);
    await useCase('UC-ISS-0069', async () => { await page.getByRole('button', { name: 'More issues', exact: true }).click(); await expect(results(page)).toHaveCount(50); expect(new Set(await results(page).allTextContents()).size).toBe(50); await expect(page.getByText('50 shown', { exact: true })).toBeVisible(); }, 'web');
    await useCase('UC-ISS-0070', async () => { const target = created[0]; if (!target)
        throw new Error('Missing first issue'); await page.getByRole('searchbox', { name: 'Search by title or issue key', exact: true }).fill(target.summary.key); await keys(page, [target]); await expect(page.getByRole('button', { name: 'More issues', exact: true })).toHaveCount(0); await page.getByRole('searchbox', { name: 'Search by title or issue key', exact: true }).clear(); await expect(results(page)).toHaveCount(25); }, 'web');
    for (let index = 0; index < 4; index++) {
        await page.getByRole('button', { name: 'More issues', exact: true }).click();
        await expect(results(page)).toHaveCount(Math.min(102, 50 + 25 * index));
    }
    await useCase('UC-ISS-0129', async () => { await page.getByRole('button', { name: 'Select visible issues', exact: true }).click(); await expect(page.getByRole('region', { name: 'Bulk issue actions', exact: true })).toContainText('100 selected'); await expect(page.getByRole('list', { name: 'Issue results list' }).getByRole('checkbox', { checked: true })).toHaveCount(100); await expect(page.getByRole('list', { name: 'Issue results list' }).locator('input[type="checkbox"]:disabled')).toHaveCount(2); }, 'web');
});
test('issue filter choices load actual next project, type, priority and teammate pages', async ({ page, request }) => {
    const projectId = await coverageProject(request);
    await coverageProject(request);
    const cursors = { projects: [] as string[], types: [] as string[], priorities: [] as string[], people: [] as string[] };
    await page.route('**/api/v1/projects?*', async (route) => { const url = new URL(route.request().url()); url.searchParams.set('limit', '1'); if (url.searchParams.has('cursor'))
        cursors.projects.push(url.searchParams.get('cursor')!); await route.continue({ url: url.toString() }); });
    for (const [part, name] of [['issue-types', 'types'], ['priorities', 'priorities'], ['assignees', 'people']] as const) {
        const prefix = part === 'assignees' ? 'v1' : 'v2';
        await page.route(`**/api/${prefix}/projects/${projectId}/${part}?*`, async (route) => { const url = new URL(route.request().url()); url.searchParams.set('limit', '1'); if (url.searchParams.has('cursor'))
            cursors[name].push(url.searchParams.get('cursor')!); await route.continue({ url: url.toString() }); });
    }
    await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/);
    await advanced(page);
    await useCase('UC-ISS-0074', async () => { const select = page.getByRole('combobox', { name: 'Project', exact: true }); const before = await select.locator('option').count(); for(let attempt=0;attempt<2 && await select.locator('option').count()===before;attempt++){await page.getByRole('button', { name: 'More projects', exact: true }).click(); await expect.poll(()=>cursors.projects.length).toBe(attempt+1);} await expect.poll(async () => await select.locator('option').count()).toBeGreaterThan(before); expect(cursors.projects.length).toBeGreaterThan(0); await expect(select).toHaveValue(projectId); }, 'web');
    await useCase('UC-ISS-0075', async () => { const select = page.getByRole('combobox', { name: 'Type', exact: true }); await expect(select.locator('option')).toHaveCount(2); await page.getByRole('button', { name: 'More types', exact: true }).click(); await expect(select.locator('option')).toHaveCount(3); expect(cursors.types).toHaveLength(1); expect(new Set(await select.locator('option').evaluateAll(nodes => nodes.map(node => (node as HTMLOptionElement).value))).size).toBe(3); }, 'web');
    await useCase('UC-ISS-0076', async () => { const select = page.getByRole('combobox', { name: 'Priority', exact: true }); await expect(select.locator('option')).toHaveCount(2); await page.getByRole('button', { name: 'More priorities', exact: true }).click(); await expect(select.locator('option')).toHaveCount(3); expect(cursors.priorities).toHaveLength(1); }, 'web');
    await useCase('UC-ISS-0077', async () => { const select = page.getByRole('combobox', { name: 'Assigned to', exact: true }); await expect(select.locator('option')).toHaveCount(4); await page.getByRole('button', { name: 'More teammates', exact: true }).click(); await expect(select.locator('option')).toHaveCount(5); expect(cursors.people).toHaveLength(1); }, 'web');
});
test('detail lifecycle, history tabs and navigation expose the exact current issue', async ({ page, request }) => {
    const projectId = await coverageProject(request);
    const types = await coverageGet(request, `/api/v2/projects/${projectId}/issue-types`, zPageTypeView);
    const priorities = await coverageGet(request, `/api/v2/projects/${projectId}/priorities`, zPagePriorityView);
    const type = types.items.find(value => value.key === 'bug')!;
    const priority = priorities.items.find(value => value.key === 'high')!;
    expect(type.behavior).toBe('standard');
    const label = (await coverageWrite(request, 'POST', `/api/v1/projects/${projectId}/labels`, { name: 'Copy ordinary issue fields' }, zSavedLabelView, 201, 'member')).result;
    const issue = await coverageIssue(request, projectId, { title: 'Detail navigation source', description: '<p><strong>Rich copy</strong> · وصف عربي</p>', descriptionFormat: 'html', typeId: type.id, priorityId: priority.id, assigneeId: ownerId, dueDate: '2999-10-12', labelIds: [label.id] });
    await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/);
    await useCase('UC-ISS-0090', async () => { await page.route(`**/api/v2/issues/${issue.summary.id}`, route => route.abort('failed')); await page.getByRole('list', { name: 'Issue results list' }).locator('.issue-link').click(); await expect(page.getByRole('button', { name: 'Reload issue', exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: issue.summary.title, exact: true })).toHaveCount(0); await page.unroute(`**/api/v2/issues/${issue.summary.id}`); await page.getByRole('button', { name: 'Reload issue', exact: true }).click(); await expect(page.getByRole('heading', { name: issue.summary.title, exact: true })).toBeVisible(); }, 'web');
    await useCase('UC-ISS-0086', async () => { await page.locator('.secondary-metadata > summary').click(); const metadata = page.locator('.secondary-metadata'); await expect(metadata).toContainText(issue.reporter.displayName); await expect(metadata.locator('time').first()).toHaveAttribute('datetime', issue.summary.createdAt); await expect(metadata.locator('time').nth(1)).toHaveAttribute('datetime', issue.summary.updatedAt); }, 'web');
    const more = page.locator('gg-modern-issue-actions .more-actions');
    await more.locator('summary').click();
    await useCase('UC-ISS-0186', async () => { await expect(more.getByRole('button', { name: 'Archive issue', exact: true })).toBeVisible(); await expect(page.getByRole('button', { name: /delete issue/i })).toHaveCount(0); await expect(page.getByRole('link', { name: /delete issue/i })).toHaveCount(0); }, 'web');
    await useCase('UC-ISS-0114', async () => { await more.getByRole('button', { name: 'Move to backlog', exact: true }).click(); await expect(more.getByRole('button', { name: 'Add to board', exact: true })).toBeVisible(); expect((await coverageReadIssue(request, issue.summary.id)).summary.backlog).toBe(true); }, 'web');
    await useCase('UC-ISS-0115', async () => { await more.getByRole('button', { name: 'Add to board', exact: true }).click(); await expect(more.getByRole('button', { name: 'Move to backlog', exact: true })).toBeVisible(); expect((await coverageReadIssue(request, issue.summary.id)).summary.backlog).toBe(false); }, 'web');
    await useCase('UC-ISS-0112', async () => { await more.getByRole('button', { name: 'Archive issue', exact: true }).click(); await expect(page.getByText(/Archived · This issue and its history remain accessible/)).toBeVisible(); expect((await coverageReadIssue(request, issue.summary.id)).summary.archived).toBe(true); }, 'web');
    await useCase('UC-ISS-0113', async () => { await more.getByRole('button', { name: 'Restore issue', exact: true }).click(); await expect(more.getByRole('button', { name: 'Archive issue', exact: true })).toBeVisible(); expect((await coverageReadIssue(request, issue.summary.id)).summary.archived).toBe(false); }, 'web');
    await page.route('**/api/v1/admin/activity?*', async (route) => { const url = new URL(route.request().url()); if (url.searchParams.get('resourceId') === issue.summary.id)
        url.searchParams.set('limit', '1'); await route.continue({ url: url.toString() }); });
    await useCase('UC-ISS-0088', async () => { await page.getByRole('tab', { name: 'History', exact: true }).click(); await expect(page.getByRole('tab', { name: 'History', exact: true })).toHaveAttribute('aria-selected', 'true'); await expect(page.getByRole('tabpanel', { name: 'History', exact: true })).toBeVisible(); await expect(page.locator('.activity-list li')).toHaveCount(1); await expect(page.locator('.activity-list li').first()).toContainText('organize issue'); await expect(page.getByRole('button', { name: 'More activity', exact: true })).toBeEnabled(); }, 'web');
    await useCase('UC-ISS-0089', async () => { const before = await page.locator('.activity-list li').textContent(); await page.getByRole('button', { name: 'More activity', exact: true }).click(); await expect(page.locator('.activity-list li')).toHaveCount(2); expect(await page.locator('.activity-list li').first().textContent()).toBe(before); expect((await page.locator('.activity-list li').allTextContents())[1]).not.toBe(before); }, 'web');
    await useCase('UC-ISS-0087', async () => { await page.getByRole('tab', { name: 'Comments', exact: true }).click(); await expect(page.getByRole('tabpanel', { name: 'Comments', exact: true })).toBeVisible(); await expect(page.getByRole('tabpanel', { name: 'History', exact: true })).not.toBeVisible(); }, 'web');
    await useCase('UC-ISS-0183', async () => { const comments = page.getByRole('tab', { name: 'Comments', exact: true }), history = page.getByRole('tab', { name: 'History', exact: true }); await comments.focus(); await comments.press('ArrowRight'); await expect(history).toBeFocused(); await expect(history).toHaveAttribute('aria-selected', 'true'); await history.press('Home'); await expect(comments).toBeFocused(); await expect(comments).toHaveAttribute('aria-selected', 'true'); }, 'web');
    await useCase('UC-ISS-0083', async () => { await page.getByRole('link', { name: 'All issues', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Issues', exact: true })).toBeVisible(); await expect(page.getByRole('combobox', { name: 'Project', exact: true })).toHaveValue(projectId); await page.getByRole('list', { name: 'Issue results list' }).locator('.issue-link').click(); await expect(page.getByRole('heading', { name: issue.summary.title, exact: true })).toBeVisible(); }, 'web');
    await useCase('UC-ISS-0084', async () => { await page.getByRole('link', { name: 'Open project', exact: true }).click(); await expect(page).toHaveURL(new RegExp('/projects/' + projectId + '$')); await page.goBack(); await expect(page.getByRole('heading', { name: issue.summary.title, exact: true })).toBeVisible(); }, 'web');
    await useCase('UC-ISS-0085', async () => { await page.getByRole('link', { name: 'Kanban boards', exact: true }).click(); await expect(page).toHaveURL(new RegExp('/boards/project/' + projectId + '$')); await page.goBack(); await expect(page.getByRole('heading', { name: issue.summary.title, exact: true })).toBeVisible(); }, 'web');
    await useCase('UC-ISS-0116', async () => { await page.locator('gg-modern-issue-actions .more-actions > summary').click(); await page.getByRole('button', { name: 'Clone issue', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Copy of ' + issue.summary.title, exact: true })).toBeVisible(); const id = new URL(page.url()).pathname.split('/').at(-1); if (!id)
        throw new Error('Missing cloned issue'); expect(id).not.toBe(issue.summary.id); const clone = await coverageReadIssue(request, id); expect(clone.summary.parent).toBeNull(); expect(clone.summary.subtaskProgress.total).toBe(0); expect(clone.links).toEqual([]);
      expect(clone.summary.type.id).toBe(type.id); expect(clone.summary.type.behavior).toBe('standard');
      expect(clone.summary.priority.id).toBe(priority.id); expect(clone.summary.assignee?.id).toBe(ownerId);
      expect(clone.summary.dueDate).toBe('2999-10-12'); expect(clone.summary.labels.map(value => value.id)).toEqual([label.id]);
      expect(clone.descriptionFormat).toBe('plain'); expect(clone.description).toBe('Rich copy · وصف عربي');
      await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
      const editor = page.getByRole('dialog', { name: 'Edit ' + clone.summary.key, exact: true });
      await expect(editor.getByLabel('Issue title', { exact: true })).toHaveValue('Copy of ' + issue.summary.title);
      await expect(editor.getByLabel('Issue title', { exact: true })).toBeEditable();
      await expect(editor.getByLabel('Issue type', { exact: true })).toHaveValue(type.id); await expect(editor.getByLabel('Issue type', { exact: true })).toBeEnabled();
      await expect(editor.getByLabel('Priority', { exact: true })).toHaveValue(priority.id); await expect(editor.getByLabel('Priority', { exact: true })).toBeEnabled();
      await expect(editor.getByRole('button', { name: 'Remove ' + issue.summary.assignee!.displayName, exact: true })).toBeEnabled();
      await expect(editor.getByLabel('Due date', { exact: true })).toHaveValue('2999-10-12'); await expect(editor.getByLabel('Due date', { exact: true })).toBeEditable();
      await expect(editor.getByRole('button', { name: 'Remove ' + label.name, exact: true })).toBeEnabled();
      await editor.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(editor).toHaveCount(0);
    }, 'web');
    await useCase('UC-ISS-0117', async () => { const id = new URL(page.url()).pathname.split('/').at(-1); if (!id)
        throw new Error('Missing clone'); const clone = await coverageReadIssue(request, id); expect(clone.description).toBe('Rich copy · وصف عربي'); expect(clone.descriptionFormat).toBe('plain'); await expect(page.locator('.issue-description')).toContainText('Rich copy · وصف عربي'); }, 'web');
});

test('parent lookup filters standard behavior before pagination and retains an older custom standard parent',async({page,request})=>{
 const projectId=await coverageProject(request),type=(await coverageWrite(request,'PUT',`/api/v2/projects/${projectId}/issue-types/${crypto.randomUUID()}`,{expectedRevision:(await coverageConfiguration(request,projectId)).revision,key:'parent_story',name:'Parent story',behavior:'standard',retired:false},zSavedTypeSaved,201)).result.type;
 const parent=await coverageIssue(request,projectId,{title:'Crowded candidate custom parent',typeId:type.id});for(let index=0;index<26;index++){const current=await coverageReadIssue(request,parent.summary.id);await coverageIssue(request,projectId,{title:'Crowded candidate child '+index,parentId:parent.summary.id,expectedParentRevision:current.summary.revision});}
 await signIn(page,'member',`/issues?projectId=${projectId}`,/^Issues$/);await advanced(page);
 await useCase('UC-ISS-0187',async()=>{await page.getByRole('searchbox',{name:'Find a parent by title or issue key',exact:true}).fill('Crowded candidate');await expect(page.getByRole('button',{name:'Filter by parent '+parent.summary.key,exact:true})).toBeVisible();await expect(page.locator('gg-parent-filter .records li')).toHaveCount(1);await expect(page.locator('gg-parent-filter')).not.toContainText('No matching Task or Bug.');await page.getByRole('button',{name:'Filter by parent '+parent.summary.key,exact:true}).click();await expect(page.getByRole('heading',{name:'Results · 26',exact:true})).toBeVisible();await expect(page.getByRole('list',{name:'Issue results list'}).locator('.issue-key')).toHaveCount(25);},'web');
});

test('same-SPA account switch clears a restored uncertain bulk draft',async({page,request})=>{
 const projectId=await coverageProject(request),issue=await coverageIssue(request,projectId,{title:'Private bulk draft'}),priorities=await coverageGet(request,`/api/v2/projects/${projectId}/priorities`,zPagePriorityView),low=priorities.items.find(value=>value.key==='low');if(!low)throw new Error('Missing low');await signIn(page,'member',`/issues?projectId=${projectId}`,/^Issues$/);
 await page.route(`**/api/v2/issues/${issue.summary.id}/fields`,route=>route.abort('failed'),{times:1});await page.getByRole('checkbox',{name:'Select issue '+issue.summary.key,exact:true}).check();await page.getByRole('combobox',{name:'Bulk priority',exact:true}).selectOption(low.id);await page.getByRole('button',{name:'Apply to selected',exact:true}).click();await expect(page.getByRole('button',{name:'Retry original bulk action',exact:true})).toBeVisible();
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('link',{name:'Project overview',exact:true}).click();await expect(page).toHaveURL(new RegExp('/projects/'+projectId+'$'));await expect(page.getByRole('heading',{name:/^Isolated workflow/,level:1})).toBeVisible();await page.goBack();await expect(page).toHaveURL(new RegExp('/issues\\?projectId='+projectId+'$'));await expect(page.getByRole('button',{name:'Retry original bulk action',exact:true})).toBeVisible();await expect(page.getByRole('combobox',{name:'Bulk priority',exact:true})).toHaveValue(low.id);
 await useCase('UC-SHL-0088',async()=>{await coverageSwitchAccount(page,'owner',`/issues?projectId=${projectId}`);await expect(page.getByRole('checkbox',{name:'Select issue '+issue.summary.key,exact:true})).not.toBeChecked();await expect(page.getByRole('region',{name:'Bulk issue actions',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Retry original bulk action',exact:true})).toHaveCount(0);expect((await coverageReadIssue(request,issue.summary.id)).summary.priority.id).toBe(issue.summary.priority.id);},'web');
});

test('same-SPA account switch clears the restored private saved-search name and pending request',async({page,request})=>{
 const projectId=await coverageProject(request);await coverageIssue(request,projectId,{title:'Private search scope'});await signIn(page,'member',`/issues?projectId=${projectId}`,/^Issues$/);const panel=page.locator('gg-saved-searches');await panel.locator('summary').click();await page.route('**/api/v1/issue-searches/*',route=>route.abort('failed'),{times:1});await panel.getByLabel('Saved search name',{exact:true}).fill('Previous account private draft');await panel.getByRole('button',{name:'Save as new search',exact:true}).click();await expect(panel.getByRole('button',{name:'Retry original saved search',exact:true})).toBeVisible();page.once('dialog',dialog=>dialog.accept());await page.getByRole('link',{name:'Project overview',exact:true}).click();await expect(page).toHaveURL(new RegExp('/projects/'+projectId+'$'));await expect(page.getByRole('heading',{name:/^Isolated workflow/,level:1})).toBeVisible();await page.goBack();await expect(page).toHaveURL(new RegExp('/issues\\?projectId='+projectId+'$'));await panel.locator('summary').click();await expect(panel.getByLabel('Saved search name',{exact:true})).toHaveValue('Previous account private draft');await expect(panel.getByRole('button',{name:'Retry original saved search',exact:true})).toBeVisible();
 await useCase('UC-SHL-0090',async()=>{await coverageSwitchAccount(page,'owner',`/issues?projectId=${projectId}`);await panel.locator('summary').click();await expect(panel.getByLabel('Saved search name',{exact:true})).toHaveValue('');await expect(panel.getByRole('combobox',{name:'Saved search',exact:true})).toHaveValue('');await expect(panel.getByRole('button',{name:'Retry original saved search',exact:true})).toHaveCount(0);await expect(panel).not.toContainText('Previous account private draft');},'web');
});
