import type { ModernIssueView } from '../src/app/api/generated/types.gen';
import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { coverageBoard, coverageGet, coverageHeaders, coverageIssue, coverageProject, coverageReadIssue, coverageWrite } from './support/coverage-boards';
import { zPageDependencyView, zPageModernIssueSummary, zSavedDependencyView, zSavedModernIssueView, zSavedNativeMoveResult } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable, 'Requires isolated project fixtures and real Go/PostgreSQL services.');
test.use({ trace: 'off' });
async function addBlocker(request: Parameters<typeof coverageIssue>[0], issueId: string, blockerId: string) { const current = await coverageReadIssue(request, issueId); return coverageWrite(request, 'POST', `/api/v1/issues/${issueId}/dependencies`, { blockerId, expectedIssueRevision: current.summary.revision, expectedGraphRevision: current.graphRevision }, zSavedDependencyView, 200, 'member'); }
test('subtask pages refresh exact child metadata and provide child detail and all-children navigation', async ({ page, request }) => {
    const projectId = await coverageProject(request), parent = await coverageIssue(request, projectId, { title: 'Relationship parent' }), children: ModernIssueView[] = [];
    for (let index = 1; index <= 3; index++) {
        const current = await coverageReadIssue(request, parent.summary.id);
        children.push(await coverageIssue(request, projectId, { title: 'Child page ' + index, parentId: parent.summary.id, expectedParentRevision: current.summary.revision }));
    }
    await page.route('**/api/v2/issues/search', async (route) => { const data: unknown = route.request().postDataJSON(); const parsed = (await import('../src/app/api/generated/zod.gen')).zModernSearchInput.parse(data); if (parsed.filters.parentId === parent.summary.id) {
        await route.continue({ postData: JSON.stringify({ ...parsed, page: { ...parsed.page, limit: 1 } }) });
    }
    else
        await route.continue(); });
    await signIn(page, 'member', `/issues/${parent.summary.id}`, /^Relationship parent$/);
    const section = page.getByRole('region', { name: 'Subtasks', exact: true });
    await expect(section.locator('.issue-key')).toHaveCount(1);
    const first = await section.locator('.issue-key').innerText();
    await useCase('UC-REL-0013', async () => { await section.getByRole('button', { name: 'Next subtasks page', exact: true }).click(); await expect(section.locator('.issue-key')).toHaveCount(1); await expect(section.locator('.issue-key')).not.toHaveText(first); expect(children.map(value => value.summary.key)).toContain(await section.locator('.issue-key').innerText()); }, 'web');
    await useCase('UC-REL-0012', async () => { await section.getByRole('button', { name: 'Reload subtasks and progress', exact: true }).click(); await expect(section.locator('.issue-key')).toHaveText(first); await expect(section.getByRole('status')).toContainText('0 / 3 subtasks done'); }, 'web');
    await useCase('UC-REL-0014', async () => { const key = await section.locator('.issue-key').innerText(), child = children.find(value => value.summary.key === key); if (!child)
        throw new Error('Unknown loaded child'); await section.locator('.issue-link').click(); await expect(page).toHaveURL(new RegExp('/issues/' + child.summary.id + '$')); await expect(page.getByRole('heading', { name: child.summary.title, exact: true })).toBeVisible(); await page.getByRole('link', { name: 'Open parent ' + parent.summary.key, exact: true }).click(); await expect(page.getByRole('heading', { name: parent.summary.title, exact: true })).toBeVisible(); }, 'web');
    await useCase('UC-REL-0016', async () => { await section.getByRole('link', { name: 'Find these subtasks in Issues', exact: true }).click(); await expect(page).toHaveURL(new RegExp('parentId=' + parent.summary.id)); await expect(page.getByRole('list', { name: 'Issue results list' }).locator('.issue-key')).toHaveCount(1); await expect(page.getByRole('heading', { name: 'Results · 3', exact: true })).toBeVisible(); await expect(page.locator('gg-parent-filter')).toContainText(parent.summary.key); }, 'web');
});
test('child creation restores its own draft and replays an accepted request without duplicate children', async ({ page, request }) => {
    const projectId = await coverageProject(request), parent = await coverageIssue(request, projectId, { title: 'Draft parent' });
    await signIn(page, 'member', `/issues/${parent.summary.id}`, /^Draft parent$/);
    const section = page.getByRole('region', { name: 'Subtasks', exact: true });
    await useCase('UC-REL-0011', async () => { await section.getByRole('button', { name: 'Add subtask', exact: true }).click(); await section.getByLabel('Issue title', { exact: true }).fill('Retained child draft'); page.once('dialog', dialog => dialog.accept()); await section.getByRole('button', { name: 'Cancel', exact: true }).click(); await section.getByRole('button', { name: 'Add subtask', exact: true }).click(); await expect(section.getByLabel('Issue title', { exact: true })).toHaveValue('Retained child draft'); }, 'web');
    await useCase('UC-REL-0027', async () => { let attempts = 0; const references: string[] = []; await page.route(`**/api/v2/projects/${projectId}/issues`, async (route) => { references.push(route.request().headers()['idempotency-key'] ?? ''); const response = await route.fetch(); expect(response.status()).toBe(201); const saved = zSavedModernIssueView.parse(await response.json()); expect(saved.result.summary.parent?.id).toBe(parent.summary.id); if (++attempts === 1)
        await route.abort('failed');
    else {
        expect(saved.receipt.replayed).toBe(true);
        await route.fulfill({ response });
    } }); await section.getByRole('button', { name: 'Create subtask', exact: true }).click(); await expect(section.getByRole('button', { name: 'Retry original subtask', exact: true })).toBeVisible(); await expect(section.getByLabel('Issue title', { exact: true })).toHaveValue('Retained child draft'); await section.getByRole('button', { name: 'Retry original subtask', exact: true }).click(); await expect(section.locator('.issue-key')).toHaveCount(1); expect(references).toHaveLength(2); expect(references[0]).toBe(references[1]); const children = await coverageWrite(request, 'POST', '/api/v2/issues/search', { filters: { projectIds: [projectId], parentId: parent.summary.id }, page: { limit: 100 } }, zPageModernIssueSummary, 200, 'member'); expect(children.totalMatching).toBe(1); expect(children.items[0]?.title).toBe('Retained child draft'); }, 'web');
});
test('blocker chooser excludes itself, pages real candidates, recovers failed reads and retains selection through conflict review', async ({ page, request }) => {
    const projectId = await coverageProject(request), root = await coverageIssue(request, projectId, { title: 'Blocker chooser root' }), a = await coverageIssue(request, projectId, { title: 'Choose candidate A' }), b = await coverageIssue(request, projectId, { title: 'Choose candidate B' });
    await page.route('**/api/v2/issues/search', async (route) => { const schema = (await import('../src/app/api/generated/zod.gen')).zModernSearchInput; const parsed = schema.parse(route.request().postDataJSON()); if (!parsed.filters.parentId && !parsed.filters.query) {
        await route.continue({ postData: JSON.stringify({ ...parsed, page: { ...parsed.page, limit: 1 } }) });
    }
    else
        await route.continue(); });
    await signIn(page, 'member', `/issues/${root.summary.id}`, /^Blocker chooser root$/);
    const section = page.getByRole('region', { name: 'Dependencies', exact: true });
    await section.getByRole('button', { name: 'Add blocker', exact: true }).click();
    const query = section.getByRole('combobox', { name: 'Find a same-project issue', exact: true });
    await useCase('UC-REL-0034', async () => { await query.fill(root.summary.key); await expect(section.getByRole('listbox', { name: 'Blocker candidates' })).toContainText('No matching other issues.'); await expect(section.getByRole('button', { name: 'Select blocker ' + root.summary.key, exact: true })).toHaveCount(0); }, 'web');
    await useCase('UC-REL-0039', async () => { await query.clear(); await expect(section.getByRole('button', { name: 'More blocker candidates', exact: true })).toBeVisible(); const before = await section.getByRole('option').allTextContents(); await section.getByRole('button', { name: 'More blocker candidates', exact: true }).click(); await expect.poll(async () => await section.getByRole('option').count()).toBeGreaterThan(before.length); }, 'web');
    await useCase('UC-REL-0045', async () => { await page.route('**/api/v2/issues/search', route => route.abort('failed'), { times: 1 }); await query.fill(a.summary.key); await expect(section.getByRole('button', { name: 'Retry search', exact: true })).toBeVisible(); await section.getByRole('button', { name: 'Retry search', exact: true }).click(); await expect(section.getByRole('button', { name: 'Select blocker ' + a.summary.key, exact: true })).toBeVisible(); }, 'web');
    await useCase('UC-REL-0035', async () => { await section.getByRole('button', { name: 'Select blocker ' + a.summary.key, exact: true }).click(); await expect(section.getByRole('button', { name: 'Select blocker ' + a.summary.key, exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(section.getByRole('button', { name: 'Add selected blocker', exact: true })).toBeVisible(); expect((await coverageReadIssue(request, root.summary.id)).summary.unfinishedBlockerCount).toBe(0); }, 'web');
    await useCase('UC-REL-0038', async () => { await section.getByRole('button', { name: 'Cancel adding blocker', exact: true }).click(); await expect(query).toHaveCount(0); expect((await coverageReadIssue(request, root.summary.id)).summary.unfinishedBlockerCount).toBe(0); }, 'web');
    await section.getByRole('button', { name: 'Add blocker', exact: true }).click();
    await query.fill(a.summary.key);
    await section.getByRole('button', { name: 'Select blocker ' + a.summary.key, exact: true }).click();
    await addBlocker(request, root.summary.id, b.summary.id);
    await useCase('UC-REL-0057', async () => { await useCase('UC-REL-0056', async () => { await section.getByRole('button', { name: 'Add selected blocker', exact: true }).click(); await expect(section.getByRole('button', { name: 'Review current relationships', exact: true })).toBeVisible(); await expect(section.getByRole('button', { name: 'Select blocker ' + a.summary.key, exact: true })).toHaveAttribute('aria-pressed', 'true'); expect((await coverageReadIssue(request, root.summary.id)).summary.unfinishedBlockerCount).toBe(1); }, 'web'); await section.getByRole('button', { name: 'Review current relationships', exact: true }).click(); await expect(section.getByRole('button', { name: 'Remove blocker ' + b.summary.key, exact: true })).toBeVisible(); await expect(section.getByRole('button', { name: 'Select blocker ' + a.summary.key, exact: true })).toHaveAttribute('aria-pressed', 'true'); await expect(section.getByText('Current relationships loaded. Your selected blocker is retained.', { exact: true })).toBeVisible(); await section.getByRole('button', { name: 'Add selected blocker', exact: true }).click(); await expect(section.getByRole('button', { name: 'Remove blocker ' + a.summary.key, exact: true })).toBeVisible(); expect((await coverageReadIssue(request, root.summary.id)).summary.unfinishedBlockerCount).toBe(2); }, 'web');
});
test('dependency directions paginate independently and refreshing reflects reopened blocking work', async ({ page, request }) => {
    const projectId = await coverageProject(request), root = await coverageIssue(request, projectId, { title: 'Dependency direction root' }), blockers: ModernIssueView[] = [], dependents: ModernIssueView[] = [];
    for (let index = 1; index <= 3; index++) {
        const blocker = await coverageIssue(request, projectId, { title: 'Blocker direction ' + index }), dependent = await coverageIssue(request, projectId, { title: 'Dependent direction ' + index });
        blockers.push(blocker);
        dependents.push(dependent);
        await addBlocker(request, root.summary.id, blocker.summary.id);
        await addBlocker(request, dependent.summary.id, root.summary.id);
    }
    await page.route(`**/api/v1/issues/${root.summary.id}/dependencies?*`, async (route) => { const url = new URL(route.request().url()); url.searchParams.set('limit', '1'); await route.continue({ url: url.toString() }); });
    await signIn(page, 'member', `/issues/${root.summary.id}`, /^Dependency direction root$/);
    const section = page.getByRole('region', { name: 'Dependencies', exact: true }), blocked = section.locator('.relationship-group').filter({ has: page.getByRole('heading', { name: 'Blocked By', exact: true }) }), blocks = section.locator('.relationship-group').filter({ has: page.getByRole('heading', { name: 'Blocks', exact: true }) });
    await useCase('UC-REL-0040', async () => { await expect(blocked.locator('.issue-key')).toHaveCount(1); await blocked.getByRole('button', { name: 'More blockers', exact: true }).click(); await expect(blocked.locator('.issue-key')).toHaveCount(2); const actual = await blocked.locator('.issue-key').allTextContents(); expect(new Set(actual).size).toBe(2); expect(actual.every(key => blockers.some(value => value.summary.key === key))).toBe(true); }, 'web');
    await useCase('UC-REL-0041', async () => { await expect(blocks.locator('.issue-key')).toHaveCount(1); await blocks.getByRole('button', { name: 'More dependent issues', exact: true }).click(); await expect(blocks.locator('.issue-key')).toHaveCount(2); const actual = await blocks.locator('.issue-key').allTextContents(); expect(new Set(actual).size).toBe(2); expect(actual.every(key => dependents.some(value => value.summary.key === key))).toBe(true); }, 'web');
    await useCase('UC-REL-0043', async () => { await section.getByRole('button', { name: 'Reload dependencies', exact: true }).click(); await expect(blocked.locator('.issue-key')).toHaveCount(1); await expect(blocks.locator('.issue-key')).toHaveCount(1); }, 'web');
    await test.step('blocker row navigation opens the exact issue', async () => { const key = await blocked.locator('.issue-key').innerText(), target = blockers.find(value => value.summary.key === key); if (!target)
        throw new Error('Unknown blocker'); await blocked.locator('.issue-link').click(); await expect(page).toHaveURL(new RegExp('/issues/' + target.summary.id + '$')); await expect(page.getByRole('heading', { name: target.summary.title, exact: true })).toBeVisible(); });
});
test('related-work disclosure searches while typing, pages candidates, and follows the exact linked issue', async ({ page, request }) => {
    const projectId = await coverageProject(request), root = await coverageIssue(request, projectId, { title: 'Related root' }), a = await coverageIssue(request, projectId, { title: 'Related candidate Alpha' }), b = await coverageIssue(request, projectId, { title: 'Related candidate Beta' });
    await page.route('**/api/v2/issues/search', async (route) => { const schema = (await import('../src/app/api/generated/zod.gen')).zModernSearchInput, parsed = schema.parse(route.request().postDataJSON()); if (!parsed.filters.parentId) {
        await route.continue({ postData: JSON.stringify({ ...parsed, page: { ...parsed.page, limit: 1 } }) });
    }
    else
        await route.continue(); });
    await signIn(page, 'member', `/issues/${root.summary.id}`, /^Related root$/);
    const actions = page.getByRole('region', { name: 'Issue actions', exact: true }), disclosure = actions.locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Related issues (' }) });
    await useCase('UC-REL-0063', async () => { await disclosure.locator('summary').click(); await expect(disclosure.getByRole('searchbox', { name: 'Related issue search', exact: true })).toBeVisible(); }, 'web');
    await useCase('UC-REL-0064', async () => { await disclosure.getByRole('searchbox', { name: 'Related issue search', exact: true }).fill(a.summary.key); await expect(disclosure.locator('.related-results')).toContainText(a.summary.title); await expect(disclosure.locator('.related-results')).not.toContainText(b.summary.title); }, 'web');
    await useCase('UC-REL-0065', async () => { await disclosure.getByRole('searchbox', { name: 'Related issue search', exact: true }).fill('Related candidate'); await expect(disclosure.locator('.related-results li')).toHaveCount(1); await disclosure.getByRole('button', { name: 'More related issues', exact: true }).click(); await expect(disclosure.locator('.related-results li')).toHaveCount(2); expect((await disclosure.locator('.related-results').innerText())).toContain(a.summary.key); expect((await disclosure.locator('.related-results').innerText())).toContain(b.summary.key); }, 'web');
    await disclosure.locator('.related-results li').filter({ hasText: a.summary.key }).getByRole('button', { name: 'Link issue', exact: true }).click();
    await useCase('UC-REL-0070', async () => { await disclosure.locator('.related-links').getByRole('link').filter({ hasText: a.summary.key }).click(); await expect(page).toHaveURL(new RegExp('/issues/' + a.summary.id + '$')); await expect(page.getByRole('heading', { name: a.summary.title, exact: true })).toBeVisible(); }, 'web');
});
