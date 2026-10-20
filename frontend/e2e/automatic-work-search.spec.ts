import { useCase } from './support/use-case';
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import { zPageBoardSummary, zSavedIssueView, zSearchIssuesBody, } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable, 'Requires the disposable local company.');
async function headers() {
    return {
        Authorization: 'Bearer ' + (await token('member')),
        'Idempotency-Key': crypto.randomUUID(),
    };
}
async function create(request: APIRequestContext, projectId: string, title: string) {
    const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
        headers: await headers(),
        data: { title },
    });
    expect(response.status()).toBe(201);
    return zSavedIssueView.parse(await response.json()).result;
}
async function fixture(request: APIRequestContext) {
    const projectId = await isolatedProject(request);
    const root = await create(request, projectId, 'Automatic search root');
    const first = await create(request, projectId, 'Automatic search first');
    const second = await create(request, projectId, 'البحث التلقائي الثاني');
    const response = await request.get(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
        headers: await headers(),
    });
    const board = zPageBoardSummary.parse(await response.json()).items[0];
    if (!board)
        throw new Error('Missing isolated board.');
    return { projectId, root, first, second, board };
}
function gate() {
    let resolve = (): void => { };
    const promise = new Promise<void>(done => {
        resolve = done;
    });
    return { promise, resolve };
}
test('issue searches apply numbers, filters and resets automatically and ignore a slow earlier query', async ({ page, request, }) => {
    const data = await fixture(request);
    await signIn(page, 'member', '/issues?projectId=' + data.projectId, /^Issues$/);
    const results = page.getByRole('region', { name: 'Issue results', exact: true });
    await expect(results.getByRole('heading', { name: 'Results · 3', exact: true })).toBeVisible();
    const input = page.getByLabel('Search by title or issue key', { exact: true });
    await expect(page.getByRole('button', { name: 'Search issues', exact: true })).toHaveCount(0);
    const started = gate(), release = gate();
    let earlierReturned = false;
    await page.route('**/api/v2/issues/search', async (route) => {
        const body = zSearchIssuesBody.parse(route.request().postDataJSON());
        const response = await route.fetch();
        if (body.filters.query === '2') {
            started.resolve();
            await release.promise;
        }
        await route.fulfill({ response });
        if (body.filters.query === '2')
            earlierReturned = true;
    });
    await useCase('UC-ISS-0078', async () => {
        try {
            await input.fill('2');
            await expect(input).toHaveAttribute('aria-busy', 'true');
            await started.promise;
            await input.fill('003');
            await expect(results.getByRole('heading', { name: 'Results · 1', exact: true })).toBeVisible();
            await expect(results.getByRole('link', {
                name: data.second.summary.key + ' · ' + data.second.summary.title,
                exact: true,
            })).toBeVisible();
            await expect(input).toHaveAttribute('aria-busy', 'false');
        }
        finally {
            release.resolve();
        }
        await expect.poll(() => earlierReturned).toBe(true);
        await expect(results.getByRole('link', {
            name: data.first.summary.key + ' · ' + data.first.summary.title,
            exact: true,
        })).toHaveCount(0);
    }, 'web');
    await input.clear();
    await expect(results.getByRole('heading', { name: 'Results · 3', exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption({ label: 'Done' });
    await expect(results.getByRole('heading', { name: 'Results · 0', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
    await expect(input).toHaveValue('');
    await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toHaveValue('');
    await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption(data.projectId);
    await expect(results.getByRole('heading', { name: 'Results · 3', exact: true })).toBeVisible();
});
test('board typing keeps focus and renders the latest query while an earlier read is delayed', async ({ page, request, }) => {
    await useCase('UC-BRD-0092', async () => {
        const data = await fixture(request);
        await signIn(page, 'member', '/boards/' + data.board.id, new RegExp('^' + data.board.name + '$'));
        await expect(page.locator('gg-native-issue-card')).toHaveCount(3);
        const input = page.getByRole('searchbox', { name: 'Search this board', exact: true });
        await expect(page.getByRole('button', { name: 'Search board', exact: true })).toHaveCount(0);
        const started = gate(), release = gate();
        let projectReads = 0;
        page.on('request', request => {
            if (new URL(request.url()).pathname === '/api/v1/projects/' + data.projectId)
                projectReads++;
        });
        await page.route('**/api/v2/boards/' + data.board.id + '?*', async (route) => {
            const url = new URL(route.request().url());
            const response = await route.fetch();
            if (url.searchParams.get('temporaryFilters') === '{"query":"2"}') {
                started.resolve();
                await release.promise;
            }
            await route.fulfill({ response });
        });
        try {
            await input.fill('2');
            await started.promise;
            await expect(input).toBeFocused();
            await input.fill('3');
            await expect(page.locator('gg-native-issue-card')).toHaveCount(1);
            await expect(page.locator('gg-native-issue-card')).toContainText(data.second.summary.key);
            await expect(input).toBeFocused();
            await expect(input).toHaveValue('3');
            await expect(input).toHaveAttribute('aria-busy', 'false');
        }
        finally {
            release.resolve();
        }
        await expect(page.locator('gg-native-issue-card')).toContainText(data.second.summary.key);
        await input.clear();
        await expect(page.locator('gg-native-issue-card')).toHaveCount(3);
        await page.locator('details.board-filters > summary').click();
        await page
            .getByRole('combobox', { name: 'Stage category', exact: true })
            .selectOption({ label: 'Done' });
        await expect(page.locator('gg-native-issue-card')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Apply temporary filters', exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
        await expect(page.locator('gg-native-issue-card')).toHaveCount(3);
        expect(projectReads).toBe(0);
    }, 'web');
});
test('parent, teammate and related issue pickers search as typed and selecting a parent applies its filter', async ({ page, request, }) => {
    const data = await fixture(request);
    const subtaskResponse = await request.post(apiOrigin + '/api/v1/issues/' + data.first.summary.id + '/subtasks', {
        headers: await headers(),
        data: {
            title: 'Child of automatic parent',
            expectedParentRevision: data.first.summary.revision,
        },
    });
    expect(subtaskResponse.status()).toBe(201);
    const child = zSavedIssueView.parse(await subtaskResponse.json()).result;
    await signIn(page, 'member', '/issues?projectId=' + data.projectId, /^Issues$/);
    await expect(page.getByRole('heading', { name: 'Results · 4', exact: true })).toBeVisible();
    await page.locator('summary').filter({ hasText: 'Advanced filters' }).click();
    await page.getByLabel('Find a parent by title or issue key', { exact: true }).fill('2');
    await expect(page.getByRole('button', { name: 'Filter by parent ' + data.first.summary.key, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Find parents', exact: true })).toHaveCount(0);
    await page
        .getByRole('button', { name: 'Filter by parent ' + data.first.summary.key, exact: true })
        .click();
    await expect(page.getByRole('heading', { name: 'Results · 1', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: child.summary.key + ' · ' + child.summary.title, exact: true })).toBeVisible();
    await page.getByLabel('Filter teammate search', { exact: true }).fill('مطور');
    await expect(page.getByLabel('Filter teammate search', { exact: true })).toHaveAttribute('aria-busy', 'false');
    await expect(page
        .getByRole('combobox', { name: 'Assigned to', exact: true })
        .getByRole('option', { name: 'مطور تجريبي', exact: true })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Find teammate', exact: true })).toHaveCount(0);
    await signIn(page, 'member', '/issues/' + data.root.summary.id, /^Automatic search root$/);
    await page.locator('summary').filter({ hasText: 'Related issues' }).click();
    await page.getByLabel('Related issue search', { exact: true }).fill('2');
    await expect(page.locator('.related-results li')).toHaveCount(1);
    await expect(page.locator('.related-results li')).toContainText(data.first.summary.key);
    await expect(page.getByRole('button', { name: 'Find related issues', exact: true })).toHaveCount(0);
    await page.getByLabel('Related issue search', { exact: true }).fill('البحث');
    await expect(page.locator('.related-results li')).toHaveCount(1);
    await expect(page.locator('.related-results li')).toContainText(data.second.summary.key);
});
