import { useCase } from './support/use-case';
import { readLayout } from './support/native-boards';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import { dragBoardCard } from './support/board-drag';
import { zBoardView, zNativeCardPage, zModernIssueView, zPageUserSummary, zSavedBoardSummary, zSavedIssueView, zSavedPlanningItemView, zSavedSearchList, } from '../src/app/api/generated/zod.gen';
import type { BoardSummary, CreateIssueFields, IssueView, } from '../src/app/api/generated/types.gen';
test.skip(!localFixturesAvailable, 'Requires the isolated local company.');
const memberId = '10000000-0000-4000-8000-000000000002';
const ownerId = '10000000-0000-4000-8000-000000000001';
async function headers(role = 'owner') {
    return { Authorization: 'Bearer ' + (await token(role)), 'Idempotency-Key': crypto.randomUUID() };
}
function gate() {
    let resolve = (): void => { };
    const promise = new Promise<void>(done => {
        resolve = done;
    });
    return { promise, resolve };
}
async function createBoard(request: APIRequestContext, projectId: string, name: string, query = ''): Promise<BoardSummary> {
    const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
        headers: await headers(),
        data: { name, savedFilters: query ? { query } : {} },
    });
    expect(response.status()).toBe(201);
    return zSavedBoardSummary.parse(await response.json()).result;
}
async function createIssue(request: APIRequestContext, projectId: string, fields: CreateIssueFields): Promise<IssueView> {
    const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
        headers: await headers(),
        data: fields,
    });
    expect(response.status()).toBe(201);
    return zSavedIssueView.parse(await response.json()).result;
}
async function boardView(request: APIRequestContext, board: BoardSummary) {
    const response = await request.get(apiOrigin + '/api/v1/boards/' + board.id, {
        headers: await headers(),
    });
    expect(response.status()).toBe(200);
    return zBoardView.parse(await response.json());
}
function stage(board: BoardSummary, category: string): string {
    const value = board.workflow?.columns.find(column => column.status.split(':')[0] === category)?.status;
    if (!value)
        throw new Error('Missing fixture workflow category: ' + category);
    return value;
}
function card(scope: Page | Locator, title: string): Locator {
    const page = 'page' in scope ? scope.page() : scope;
    return scope
        .locator('gg-native-issue-card')
        .filter({ has: page.getByRole('link', { name: title, exact: true }) });
}
async function cards(request: APIRequestContext, board: BoardSummary, status: string) {
    const view = await readLayout(request, board.id);
    const column = view.columns.find(c => c.stages.some(mapping => mapping.stage.category === status.split(':')[0]));
    if (!column)
        throw new Error('Fixture column missing');
    const response = await request.post(apiOrigin + '/api/v2/boards/' + board.id + '/columns/' + column.id + '/search', { headers: await headers(), data: { page: { limit: 100 } } });
    expect(response.status()).toBe(200);
    return zNativeCardPage.parse(await response.json());
}
test('board assignee searches all eligible teammates as typed, follows real cursors and rejects stale replies', async ({ page, request, }) => {
    await useCase('UC-BRD-0036', async () => {
        const projectId = await isolatedProject(request);
        const board = await createBoard(request, projectId, 'Teammate board ' + crypto.randomUUID().slice(0, 8));
        const work = await createIssue(request, projectId, { title: 'Unassigned lookup fixture' });
        const peopleResponse = await request.get(apiOrigin + '/api/v1/projects/' + projectId + '/assignees?limit=25', { headers: await headers() });
        expect(peopleResponse.status()).toBe(200);
        const people = zPageUserSummary.parse(await peopleResponse.json()).items;
        const teammate = people.find(person => person.id === memberId), owner = people.find(person => person.id === ownerId);
        if (!teammate || !owner)
            throw new Error('Eligible fixture teammates missing.');
        expect(people.some(person => person.id === '10000000-0000-4000-8000-000000000003')).toBe(false);
        const oldReply = gate();
        let started = false, staleReturned = false;
        const cursors: string[] = [];
        await page.route('**/api/v1/projects/' + projectId + '/assignees?*', async (route) => {
            const url = new URL(route.request().url());
            if (url.searchParams.get('cursor'))
                cursors.push(url.searchParams.get('cursor') ?? '');
            if (!url.searchParams.get('query') && !url.searchParams.get('cursor'))
                url.searchParams.set('limit', '1');
            const response = await route.fetch({ url: url.toString() });
            expect(response.status()).toBe(200);
            if (url.searchParams.get('query') === teammate.displayName) {
                started = true;
                await oldReply.promise;
            }
            await route.fulfill({ response });
            if (url.searchParams.get('query') === teammate.displayName)
                staleReturned = true;
        });
        await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + board.name + '$'));
        await expect(page.locator('.board-people button')).toHaveCount(0);
        await page.locator('.board-filters summary').click();
        await page
            .locator('gg-native-board-filters')
            .getByRole('combobox', { name: 'Assignment filter', exact: true })
            .selectOption('user');
        const picker = page.locator('gg-native-board-filters gg-board-assignee-picker');
        const query = picker.getByRole('combobox', { name: 'Project teammate', exact: true });
        await query.click();
        await picker
            .getByRole('button', { name: 'Load more project teammate choices', exact: true })
            .click();
        await expect(picker.getByRole('option', { name: teammate.displayName, exact: true })).toBeVisible();
        expect(cursors).toHaveLength(1);
        await query.fill(teammate.displayName);
        await expect.poll(() => started).toBe(true);
        await query.fill(owner.displayName);
        await expect(picker.getByRole('option', { name: owner.displayName, exact: true })).toBeVisible();
        oldReply.resolve();
        await expect.poll(() => staleReturned).toBe(true);
        await expect(query).toHaveAttribute('aria-busy', 'false');
        await expect(picker.getByRole('option', { name: teammate.displayName, exact: true })).toHaveCount(0);
        await picker
            .getByRole('option', { name: owner.displayName, exact: true })
            .getByRole('button')
            .click();
        await expect(card(page, work.summary.title)).toHaveCount(0);
        await page.locator('.board-filters > summary').click();
        await expect(page.locator('.board-filters summary')).toBeFocused();
        await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
        await expect(card(page, work.summary.title)).toBeVisible();
    }, 'web');
});
test('named quick filters are reusable within a project, personal to the user and close with keyboard focus returned', async ({ page, request, }) => {
    const projectId = await isolatedProject(request), marker = 'Quick ' + crypto.randomUUID().slice(0, 8);
    const first = await createBoard(request, projectId, marker + ' one'), second = await createBoard(request, projectId, marker + ' two');
    const one = await createIssue(request, projectId, { title: marker + ' urgent' }), two = await createIssue(request, projectId, { title: marker + ' later' });
    const name = 'عملي العاجل ' + crypto.randomUUID().slice(0, 6);
    await signIn(page, 'member', '/boards/' + first.id, new RegExp('^' + first.name + '$'));
    await page
        .getByRole('searchbox', { name: 'Search this board', exact: true })
        .fill(one.summary.title);
    await page.getByRole('searchbox', { name: 'Search this board', exact: true }).press('Enter');
    await expect(page.getByRole('heading', { name: first.name, exact: true })).toBeVisible();
    await expect(card(page, two.summary.title)).toHaveCount(0);
    const quick = page.locator('gg-board-quick-filters'), manager = quick.locator('summary');
    await manager.click();
    await quick.getByLabel('Quick filter name', { exact: true }).fill(name);
    await quick.getByRole('button', { name: 'Save current filters', exact: true }).click();
    await expect(quick.getByText('Personal quick filter saved.', { exact: true })).toBeVisible();
    await quick.getByRole('button', { name: 'Close quick filter manager', exact: true }).click();
    await expect(manager).toBeFocused();
    await manager.click();
    await quick.getByLabel('Quick filter name', { exact: true }).press('Escape');
    await expect(manager).toBeFocused();
    await expect(quick.locator('details')).not.toHaveAttribute('open', '');
    await page.getByRole('link', { name: 'Project boards', exact: true }).click();
    await page.getByRole('link', { name: second.name, exact: true }).click();
    const named = quick.getByRole('button', { name, exact: true });
    await named.click();
    await expect(named).toHaveAttribute('aria-pressed', 'true');
    await expect(card(page, one.summary.title)).toBeVisible();
    await expect(card(page, two.summary.title)).toHaveCount(0);
    const ownResponse = await request.get(apiOrigin + '/api/v1/issue-searches', {
        headers: await headers('member'),
    });
    const own = zSavedSearchList
        .parse(await ownResponse.json())
        .items.find(item => item.name === name);
    expect(own?.filters.projectIds).toEqual([projectId]);
    expect(own?.filters.query).toBe(one.summary.title);
    const otherResponse = await request.get(apiOrigin + '/api/v1/issue-searches', {
        headers: await headers('owner'),
    });
    expect(zSavedSearchList.parse(await otherResponse.json()).items.some(item => item.name === name)).toBe(false);
    await signIn(page, 'viewer', '/boards/' + second.id, new RegExp('^' + second.name + '$'));
    await expect(quick.getByRole('button', { name, exact: true })).toHaveCount(0);
    await signIn(page, 'member', '/boards/' + second.id, new RegExp('^' + second.name + '$'));
    await manager.click();
    await quick.getByRole('button', { name: 'Remove quick filter ' + name, exact: true }).click();
    await expect(quick.getByText('Personal quick filter removed.', { exact: true })).toBeVisible();
    await expect(quick.getByRole('button', { name, exact: true })).toHaveCount(0);
});
test('assignee and epic swimlanes retain shared rank, soft full-view WIP and safe keyboard and drag moves', async ({ page, request, }) => {
    await useCase('UC-BRD-0079', async () => {
        await page.setViewportSize({ width: 1440, height: 1100 });
        const projectId = await isolatedProject(request), marker = 'Grouped ' + crypto.randomUUID().slice(0, 8);
        let board = await createBoard(request, projectId, marker, marker);
        const other = await createBoard(request, projectId, marker + ' shared', marker);
        const todo = stage(board, 'todo'), review = stage(board, 'review');
        const a = await createIssue(request, projectId, {
            title: marker + ' A',
            assigneeId: memberId,
            initialStatus: todo,
        });
        const c = await createIssue(request, projectId, {
            title: marker + ' C',
            assigneeId: memberId,
            initialStatus: todo,
        });
        await createIssue(request, projectId, {
            title: marker + ' B',
            assigneeId: ownerId,
            initialStatus: review,
        });
        await createIssue(request, projectId, {
            title: marker + ' D',
            assigneeId: memberId,
            initialStatus: review,
        });
        const epicResponse = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/planning', {
            headers: await headers(),
            data: {
                kind: 'epic',
                name: 'إطلاق الفريق',
                description: '',
                status: 'active',
                targetDate: null,
            },
        });
        expect(epicResponse.status()).toBe(201);
        const epic = zSavedPlanningItemView.parse(await epicResponse.json()).result;
        for (const work of [a, c]) {
            const response = await request.put(apiOrigin + '/api/v1/issues/' + work.summary.id + '/planning', {
                headers: await headers(),
                data: { expectedRevision: '0', epicId: epic.id, releaseId: null },
            });
            expect(response.status()).toBe(200);
        }
        const changed = await request.put(apiOrigin + '/api/v1/boards/' + board.id, {
            headers: await headers(),
            data: {
                expectedRevision: board.revision,
                name: board.name,
                savedFilters: board.savedFilters,
                wipLimits: { inProgress: null, review: 1 },
            },
        });
        expect(changed.status()).toBe(200);
        board = zSavedBoardSummary.parse(await changed.json()).result;
        const layout = await readLayout(request, board.id);
        const todoColumn = layout.columns.find(c => c.stages.some(m => m.stage.category === 'todo'))!.id;
        const reviewColumn = layout.columns.find(c => c.stages.some(m => m.stage.category === 'review'))!.id;
        let planningReads = 0, moves = 0;
        page.on('request', request => {
            if (request.method() === 'GET' &&
                /\/issues\/[^/]+\/planning$/.test(new URL(request.url()).pathname))
                planningReads++;
            if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/move'))
                moves++;
        });
        await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + marker + '$'));
        await page
            .getByRole('combobox', { name: 'Group board by', exact: true })
            .selectOption('assignee');
        const memberLane = page.locator('[data-lane="assignee-' + memberId + '"]'), ownerLane = page.locator('[data-lane="assignee-' + ownerId + '"]');
        await expect(memberLane.locator('gg-native-issue-card')).toHaveCount(3);
        await expect(ownerLane.locator('gg-native-issue-card')).toHaveCount(1);
        await expect(page
            .locator('.column-summary')
            .filter({ hasText: 'Review' })
            .getByText(/exceeds its WIP warning/)).toBeVisible();
        const item = card(memberLane, c.summary.title);
        await item.locator('summary').click();
        await item
            .getByRole('combobox', { name: 'Same-column neighbor', exact: true })
            .selectOption(a.summary.id);
        await item.getByRole('button', { name: 'Move before', exact: true }).click();
        await expect(page.getByText('Board updated.', { exact: true })).toBeVisible();
        // Ordering belongs to this board; another board retains its independent rank.
        expect((await cards(request, board, todo)).items.slice(0, 2).map(issue => issue.id)).toEqual([
            c.summary.id,
            a.summary.id,
        ]);
        expect((await cards(request, other, todo)).items.slice(0, 2).map(issue => issue.id)).toEqual([
            a.summary.id,
            c.summary.id,
        ]);
        await dragBoardCard(page, card(memberLane, a.summary.title).locator('.issue-card'), memberLane.locator('.kanban-column[data-column-id="' + reviewColumn + '"] .card-list'));
        await expect(memberLane
            .locator('.kanban-column[data-column-id="' + reviewColumn + '"]')
            .getByRole('link', { name: a.summary.title, exact: true })).toBeVisible();
        await expect(page
            .locator('.column-summary')
            .filter({ hasText: 'Review' })
            .getByText(/exceeds its WIP warning/)).toBeVisible();
        const beforeCross = moves;
        await dragBoardCard(page, card(memberLane, a.summary.title).locator('.issue-card'), ownerLane.locator('.kanban-column[data-column-id="' + todoColumn + '"] .card-list'));
        await expect(memberLane
            .locator('.kanban-column[data-column-id="' + reviewColumn + '"]')
            .getByRole('link', { name: a.summary.title, exact: true })).toBeVisible();
        const read = await request.get(apiOrigin + '/api/v2/issues/' + a.summary.id, {
            headers: await headers(),
        });
        const confirmed = zModernIssueView.parse(await read.json());
        expect(confirmed.summary.stage.category).toBe('review');
        expect(confirmed.summary.assignee?.id).toBe(memberId);
        expect(moves).toBe(beforeCross);
        await page
            .getByRole('searchbox', { name: 'Search this board', exact: true })
            .fill(a.summary.title);
        await expect(page.locator('gg-native-issue-card')).toHaveCount(1);
        await expect(page
            .locator('.column-summary')
            .filter({ hasText: 'Review' })
            .getByText(/exceeds its WIP warning/)).toBeVisible();
        await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
        await expect(page.locator('gg-native-issue-card')).toHaveCount(4);
        await page.getByRole('combobox', { name: 'Group board by', exact: true }).selectOption('epic');
        await expect(page.locator('[data-lane="epic-' + epic.id + '"]')).toContainText('إطلاق الفريق');
        await expect(page.locator('[data-lane="no-epic"]')).toContainText('No epic');
        expect(planningReads).toBe(0);
        if (process.env['GATEGOLD_E2E_EVIDENCE'])
            await page.screenshot({
                path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/board-epic-swimlanes-desktop.png',
                fullPage: true,
            });
        await page.setViewportSize({ width: 390, height: 844 });
        await expect
            .poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
            message: 'The grouped board must fit its 390px mobile viewport after responsive layout updates.',
        })
            .toBeLessThanOrEqual(390);
        if (process.env['GATEGOLD_E2E_EVIDENCE'])
            await page.screenshot({
                path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/board-epic-swimlanes-mobile.png',
            });
    }, 'web');
});
test('grouped pagination partitions a single bounded column window and does not duplicate cards per teammate', async ({ page, request, }) => {
    await useCase('UC-BRD-0089', async () => {
        test.setTimeout(60000);
        const projectId = await isolatedProject(request), marker = 'Lane window ' + crypto.randomUUID().slice(0, 8);
        const board = await createBoard(request, projectId, marker, marker);
        for (let index = 0; index < 205; index++)
            await createIssue(request, projectId, {
                title: marker + ' ' + index,
                assigneeId: index % 3 === 0 ? null : index % 3 === 1 ? memberId : ownerId,
            });
        const receivedPages: Array<Promise<ReturnType<typeof zNativeCardPage.parse>>> = [];
        page.on('response', response => {
            if (response.url().includes('/boards/' + board.id + '/columns/'))
                receivedPages.push(response.json().then((body: unknown) => zNativeCardPage.parse(body)));
        });
        await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + marker + '$'));
        await page
            .getByRole('combobox', { name: 'Group board by', exact: true })
            .selectOption('assignee');
        await expect(page.locator('gg-native-issue-card')).toHaveCount(25);
        await useCase('UC-BRD-0088', async () => {
            for (const count of [50, 75, 100, 125, 150, 175, 200, 200]) {
                await page.getByRole('button', { name: 'More To do issues', exact: true }).click();
                await expect(page.locator('gg-native-issue-card')).toHaveCount(count);
            }
            await expect(page.getByText('Showing the latest 200 loaded cards.', { exact: true })).toBeVisible();
            await expect(page.locator('.column-summary').filter({ hasText: 'To do' }).getByRole('heading')).toContainText('205');
            const ids = await page.locator('.issue-key').allTextContents();
            expect(new Set(ids).size).toBe(200);
        }, 'web');
        await page.getByRole('combobox', { name: 'Group board by', exact: true }).selectOption('epic');
        await expect(page.locator('gg-native-issue-card')).toHaveCount(200);
        await page.getByRole('button', { name: 'Collapse No epic group', exact: true }).click();
        await expect(page.locator('gg-native-issue-card')).toHaveCount(0);
        await page.getByRole('button', { name: 'Expand No epic group', exact: true }).click();
        await expect(page.locator('gg-native-issue-card')).toHaveCount(200);
        await page.getByRole('button', { name: 'Reload board', exact: true }).click();
        await expect(page.locator('gg-native-issue-card')).toHaveCount(25);
        const pages = await Promise.all(receivedPages);
        expect(pages.length).toBeGreaterThanOrEqual(6);
        for (const result of pages) {
            expect(result.items.length).toBeLessThanOrEqual(25);
            expect((result.epics ?? []).every(epic => result.items.some(issue => issue.id === epic.issueId))).toBe(true);
        }
    }, 'web');
});
