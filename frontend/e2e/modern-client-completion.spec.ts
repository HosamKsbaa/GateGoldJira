import { zSearchIssuesV2Body } from '../src/app/api/generated/zod.gen';
import { useCase } from './support/use-case';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { isolatedProject, useModernIssues } from './support/project';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { zSavedIssueView, zModernIssueView, zSavedSearchList, zConfigurationView, zPagePriorityView, zModernPatchFields, zModernSearchInput, } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable, 'Requires the isolated local company.');
async function headers() {
    return {
        Authorization: 'Bearer ' + (await token('owner')),
        'Idempotency-Key': crypto.randomUUID(),
    };
}
async function create(request: APIRequestContext, projectId: string, title: string, type: 'task' | 'bug' = 'task', priority: 'medium' | 'high' = 'medium') {
    const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
        headers: await headers(),
        data: { title, type, priority, description: 'وصف محفوظ' },
    });
    expect(response.status()).toBe(201);
    return zSavedIssueView.parse(await response.json()).result;
}
async function current(request: APIRequestContext, id: string) {
    const response = await request.get(apiOrigin + '/api/v2/issues/' + id, {
        headers: await headers(),
    });
    expect(response.status()).toBe(200);
    return zModernIssueView.parse(await response.json());
}
async function searches(request: APIRequestContext, name = 'member') {
    const response = await request.get(apiOrigin + '/api/v1/issue-searches', {
        headers: { Authorization: 'Bearer ' + (await token(name)) },
    });
    expect(response.status()).toBe(200);
    return zSavedSearchList.parse(await response.json()).items;
}
async function searchPanel(page: Page) {
    await page.locator('gg-saved-searches summary').click();
}
async function settle(page: Page) {
    await expect(page.getByText('Searching issues…', { exact: true })).not.toBeVisible();
}
test('administrator reviews and confirms safe activation while member/viewer and stale reviews are denied', async ({ page, request, }) => {
    const projectId = await isolatedProject(request), work = await create(request, projectId, 'Preserved activation work');
    const denied = await request.get(apiOrigin + '/api/v2/projects/' + projectId + '/configuration/activation', { headers: { Authorization: 'Bearer ' + (await token('member')) } });
    expect(denied.status()).toBe(403);
    await signIn(page, 'owner', '/projects/' + projectId + '/settings', /^Issue configuration$/);
    await page.getByRole('button', { name: 'Review activation', exact: true }).click();
    await expect(page.getByLabel('Activation review')).toContainText('1 existing issues');
    await expect(page.getByRole('button', { name: 'Activate new issue mode', exact: true })).toBeDisabled();
    const cfg = zConfigurationView.parse(await (await request.get(apiOrigin + '/api/v2/projects/' + projectId + '/configuration', {
        headers: await headers(),
    })).json());
    const changed = await request.put(apiOrigin + '/api/v2/projects/' + projectId + '/priorities/' + crypto.randomUUID(), {
        headers: await headers(),
        data: {
            expectedRevision: cfg.revision,
            key: 'later',
            name: 'Later',
            sortOrder: '4',
            retired: false,
        },
    });
    expect(changed.status()).toBe(201);
    await page.getByRole('checkbox', { name: 'Confirm new issue mode', exact: true }).check();
    await page.getByRole('button', { name: 'Activate new issue mode', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('configuration changed');
    await expect(page.getByRole('button', { name: 'Activate new issue mode', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Review activation', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Confirm new issue mode', exact: true }).check();
    await page.getByRole('button', { name: 'Activate new issue mode', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'New issue mode is active' })).toBeVisible();
    const retained = await current(request, work.summary.id);
    expect(retained.description).toBe(work.description);
    expect(retained.summary.revision).toBe(work.summary.revision);
    await page.getByRole('link', { name: 'Open issues', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Select issue ' + work.summary.key, exact: true })).toBeVisible();
});
test('lost activation acknowledgement retries the accepted reference after in-app navigation', async ({ page, request, }) => {
    const projectId = await isolatedProject(request);
    await signIn(page, 'owner', '/projects/' + projectId + '/settings', /^Issue configuration$/);
    let attempts = 0;
    const references: string[] = [];
    await page.route('**/api/v2/projects/*/configuration/activation', async (route) => {
        if (route.request().method() !== 'POST') {
            await route.continue();
            return;
        }
        references.push(route.request().headers()['idempotency-key'] ?? '');
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        if (++attempts === 1) {
            await route.abort('failed');
            return;
        }
        await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Review activation', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Confirm new issue mode', exact: true }).check();
    await page.getByRole('button', { name: 'Activate new issue mode', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry original activation', exact: true })).toBeVisible();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('link', { name: 'Project', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('/projects/' + projectId + '$'));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp('/projects/' + projectId + '/settings$'));
    await expect(page.getByRole('button', { name: 'Retry original activation', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Retry original activation', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry original activation', exact: true })).toHaveCount(0);
    expect(references).toHaveLength(2);
    expect(new Set(references).size).toBe(1);
});
test('native saved searches retain all original category values, rename/update/remove and stay private', async ({ page, request, }) => {
    const projectId = await isolatedProject(request);
    const first = await create(request, projectId, 'Saved first'), second = await create(request, projectId, 'Saved second', 'bug', 'high');
    await useModernIssues(projectId);
    const id = crypto.randomUUID(), filters = {
        projectIds: [projectId],
        statuses: ['todo', 'done'],
        types: ['task', 'bug'],
        priorities: ['medium', 'high'],
    };
    const saved = await request.put(apiOrigin + '/api/v1/issue-searches/' + id, {
        headers: {
            Authorization: 'Bearer ' + (await token('member')),
            'Idempotency-Key': crypto.randomUUID(),
        },
        data: { expectedRevision: '0', name: 'فريق العمل', filters },
    });
    expect(saved.status()).toBe(200);
    await signIn(page, 'member', '/issues?projectId=' + projectId, /^Issues$/);
    await searchPanel(page);
    const appliedMultiFilter = page.waitForRequest(outgoing => outgoing.method() === 'POST' && new URL(outgoing.url()).pathname === '/api/v2/issues/search' && (outgoing.postDataJSON() as { filters: { statuses?: string[] } }).filters.statuses?.length === 2);
    await useCase('UC-ISS-0145', async () => {
        await page.getByRole('combobox', { name: 'Saved search', exact: true }).selectOption(id);
        await expect(page.getByRole('heading', { name: 'Results · 2', exact: true })).toBeVisible();
        await expect(page.getByText(/complete saved filters remain active/)).toBeVisible();
    }, 'web');
    await useCase('UC-ISS-0149', async () => {
        const outgoing = await appliedMultiFilter;
        const applied = zSearchIssuesV2Body.parse(outgoing.postDataJSON()).filters;
        // Saved filters canonicalize set-valued choices before readback.
        // Preserve every exact value and cardinality without requiring insertion order.
        for (const field of ['projectIds', 'statuses', 'types', 'priorities'] as const) {
            expect(applied[field]).toHaveLength(filters[field].length);
            expect(new Set(applied[field])).toEqual(new Set(filters[field]));
        }
        await expect(page.getByRole('heading', { name: 'Results · 2', exact: true })).toBeVisible();
        await expect(page.getByText(/complete saved filters remain active/)).toBeVisible();
    }, 'web');
    await page.getByLabel('Saved search name', { exact: true }).fill('Renamed team');
    await page.getByRole('button', { name: 'Rename saved search', exact: true }).click();
    let mine = await searches(request);
    expect(mine
        .find(s => s.id === id)
        ?.filters.statuses?.slice()
        .sort()).toEqual(filters.statuses.slice().sort());
    expect(mine
        .find(s => s.id === id)
        ?.filters.types?.slice()
        .sort()).toEqual(filters.types.slice().sort());
    expect(mine
        .find(s => s.id === id)
        ?.filters.priorities?.slice()
        .sort()).toEqual(filters.priorities.slice().sort());
    await useCase('UC-ISS-0150', async () => {
        await page
            .getByRole('searchbox', { name: 'Search by title or issue key', exact: true })
            .fill('1');
        await expect(page.getByRole('heading', { name: 'Results · 1', exact: true })).toBeVisible();
        let releaseUpdate = (): void => { };
        const updateReleased = new Promise<void>(resolve => {
            releaseUpdate = resolve;
        });
        await page.route('**/api/v1/issue-searches/' + id, async (route) => {
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            await updateReleased;
            await route.fulfill({ response });
        }, { times: 1 });
        try {
            await page.getByRole('button', { name: 'Update saved search', exact: true }).click();
            await useCase('UC-ISS-0168', async () => { await expect(page.getByText('Saved search saved.', { exact: true })).toBeHidden(); }, 'web');
        }
        finally {
            releaseUpdate();
        }
        await expect(page.getByText('Saved search saved.', { exact: true })).toBeVisible();
        mine = await searches(request);
        expect(mine.find(s => s.id === id)?.filters.query).toBe('1');
        expect(mine.find(s => s.id === id)?.name).toBe('Renamed team');
        expect(mine
            .find(s => s.id === id)
            ?.filters.statuses?.slice()
            .sort()).toEqual(filters.statuses.slice().sort());
        expect(mine
            .find(s => s.id === id)
            ?.filters.types?.slice()
            .sort()).toEqual(filters.types.slice().sort());
    }, 'web');
    expect((await searches(request, 'owner')).some(s => s.id === id)).toBe(false);
    expect((await searches(request, 'viewer')).some(s => s.id === id)).toBe(false);
    await page.getByRole('button', { name: 'Remove saved search', exact: true }).click();
    await expect(page.getByText('Saved search removed.', { exact: true })).toBeVisible();
    expect((await searches(request)).some(s => s.id === id)).toBe(false);
    expect((await current(request, first.summary.id)).description).toBe(first.description);
    expect((await current(request, second.summary.id)).summary.priority.key).toBe('high');
});
test('saved-search conflict review retains the name draft and uncertain saves retain their reference', async ({ page, request, }) => {
    const projectId = await isolatedProject(request);
    await create(request, projectId, 'Private search work');
    await useModernIssues(projectId);
    await signIn(page, 'member', '/issues?projectId=' + projectId, /^Issues$/);
    await searchPanel(page);
    let attempts = 0;
    const references: string[] = [];
    await page.route('**/api/v1/issue-searches/*', async (route) => {
        if (route.request().method() !== 'PUT') {
            await route.continue();
            return;
        }
        references.push(route.request().headers()['idempotency-key'] ?? '');
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        if (++attempts === 1) {
            await route.abort('failed');
            return;
        }
        await route.fulfill({ response });
    });
    await useCase('UC-ISS-0166', async () => {
        await page.getByLabel('Saved search name', { exact: true }).fill('Private draft');
        await page.getByRole('button', { name: 'Save as new search', exact: true }).click();
        await expect(page.getByLabel('Saved search name', { exact: true })).toBeDisabled();
        await expect(page.getByRole('combobox', { name: 'Saved search', exact: true })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Retry original saved search', exact: true })).toBeVisible();
    }, 'web');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('link', { name: 'Project overview', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('/projects/' + projectId + '$'));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp('/issues\\?projectId=' + projectId + '$'));
    await useCase('UC-ISS-0151', async () => {
        await searchPanel(page);
        await expect(page.getByLabel('Saved search name', { exact: true })).toHaveValue('Private draft');
        await expect(page.getByRole('button', { name: 'Retry original saved search', exact: true })).toBeVisible();
    }, 'web');
    await page.getByRole('button', { name: 'Retry original saved search', exact: true }).click();
    await expect(page.getByText('Saved search saved.', { exact: true })).toBeVisible();
    expect(references).toHaveLength(2);
    expect(new Set(references).size).toBe(1);
    let saved = (await searches(request)).find(item => item.name === 'Private draft');
    if (!saved)
        throw new Error('Missing private search');
    await page.unroute('**/api/v1/issue-searches/*');
    const changed = await request.put(apiOrigin + '/api/v1/issue-searches/' + saved.id, {
        headers: {
            Authorization: 'Bearer ' + (await token('member')),
            'Idempotency-Key': crypto.randomUUID(),
        },
        data: { expectedRevision: saved.revision, name: 'Other tab', filters: saved.filters },
    });
    expect(changed.status()).toBe(200);
    await useCase('UC-ISS-0167', async () => {
        await page.getByLabel('Saved search name', { exact: true }).fill('My retained name');
        await page.getByRole('button', { name: 'Rename saved search', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Review latest saved searches', exact: true })).toBeVisible();
        await expect(page.getByLabel('Saved search name', { exact: true })).toHaveValue('My retained name');
        await page.getByRole('button', { name: 'Review latest saved searches', exact: true }).click();
        await page.getByRole('button', { name: 'Rename saved search', exact: true }).click();
        await expect(page.getByText('Saved search saved.', { exact: true })).toBeVisible();
        const reviewed = (await searches(request)).find(item => item.name === 'My retained name');
        expect(reviewed?.name).toBe('My retained name');
    }, 'web');
});
test('native bulk applies every scoped action with exact values and preserves discussion', async ({ page, request, }) => {
    const projectId = await isolatedProject(request), one = await create(request, projectId, 'Bulk one'), two = await create(request, projectId, 'Bulk two');
    await useModernIssues(projectId);
    await signIn(page, 'member', '/issues?projectId=' + projectId, /^Issues$/);
    const patches: ReturnType<typeof zModernPatchFields.parse>[] = [];
    page.on('request', r => {
        if (r.method() === 'PATCH' && /\/api\/v2\/issues\/[^/]+\/fields$/.test(r.url()))
            patches.push(zModernPatchFields.parse(r.postDataJSON()));
    });
    const priorities = zPagePriorityView.parse(await (await request.get(apiOrigin + '/api/v2/projects/' + projectId + '/priorities', {
        headers: await headers(),
    })).json());
    const low = priorities.items.find(p => p.key === 'low');
    if (!low)
        throw new Error('Missing low choice');
    async function apply(action: string, value?: string) {
        await settle(page);
        await page.getByRole('button', { name: 'Select visible issues', exact: true }).click();
        await page.getByRole('combobox', { name: 'Bulk action', exact: true }).selectOption(action);
        if (action === 'priority')
            await page
                .getByRole('combobox', { name: 'Bulk priority', exact: true })
                .selectOption(value ?? '');
        if (action === 'assignee')
            await page
                .getByRole('combobox', { name: 'Bulk assignee', exact: true })
                .selectOption(value ?? '');
        if (action === 'due')
            await page.getByLabel('Bulk due date', { exact: true }).fill(value ?? '');
        if (action === 'status')
            await page
                .getByRole('combobox', { name: 'Bulk target stage', exact: true })
                .selectOption({ label: value });
        await page.getByRole('button', { name: 'Apply to selected', exact: true }).click();
        await expect(page.getByText('2 issue(s) saved; 0 need attention.', { exact: true })).toBeVisible();
        await settle(page);
    }
    await useCase('UC-ISS-0125', async () => { await page.getByRole('checkbox', { name: 'Select issue ' + one.summary.key, exact: true }).check(); await expect(page.getByLabel('Bulk issue actions')).toContainText('1 selected'); }, 'web');
    await useCase('UC-ISS-0126', async () => { await page.getByRole('checkbox', { name: 'Select issue ' + one.summary.key, exact: true }).uncheck(); await expect(page.getByLabel('Bulk issue actions')).toHaveCount(0); }, 'web');
    await useCase('UC-ISS-0127', async () => { await page.getByRole('button', { name: 'Select visible issues', exact: true }).click(); await expect(page.getByLabel('Bulk issue actions')).toContainText('2 selected'); }, 'web');
    await useCase('UC-ISS-0128', async () => { await page.getByRole('button', { name: 'Select visible issues', exact: true }).click(); await expect(page.getByLabel('Bulk issue actions')).toHaveCount(0); }, 'web');
    await useCase('UC-ISS-0142', async () => { await page.getByRole('button', { name: 'Select visible issues', exact: true }).click(); await page.getByRole('button', { name: 'Clear selection', exact: true }).click(); await expect(page.getByLabel('Bulk issue actions')).toHaveCount(0); await expect(page.getByRole('checkbox', { name: 'Select issue ' + one.summary.key, exact: true })).not.toBeChecked(); }, 'web');
    await useCase('UC-ISS-0130', async () => { await apply('priority', low.id); for (const work of [one, two])
        expect((await current(request, work.summary.id)).summary.priority.id).toBe(low.id); }, 'web');
    await useCase('UC-ISS-0131', async () => { await apply('assignee', '10000000-0000-4000-8000-000000000002'); for (const work of [one, two])
        expect((await current(request, work.summary.id)).summary.assignee?.id).toBe('10000000-0000-4000-8000-000000000002'); }, 'web');
    await useCase('UC-ISS-0132', async () => { await apply('assignee', ''); for (const work of [one, two])
        expect((await current(request, work.summary.id)).summary.assignee).toBeNull(); }, 'web');
    await useCase('UC-ISS-0133', async () => { await apply('due', '2026-10-31'); for (const work of [one, two])
        expect((await current(request, work.summary.id)).summary.dueDate).toBe('2026-10-31'); }, 'web');
    await useCase('UC-ISS-0134', async () => { await apply('due', ''); for (const work of [one, two])
        expect((await current(request, work.summary.id)).summary.dueDate).toBeNull(); }, 'web');
    expect(patches.filter(p => p.field === 'dueDate').map(p => p.dueDate?.value)).toEqual(['2026-10-31', '2026-10-31', null, null]);
    await useCase('UC-ISS-0138', async () => { await apply('backlog'); for (const work of [one, two])
        expect((await current(request, work.summary.id)).summary.backlog).toBe(true); }, 'web');
    await useCase('UC-ISS-0139', async () => { await apply('board'); for (const work of [one, two])
        expect((await current(request, work.summary.id)).summary.backlog).toBe(false); }, 'web');
    await useCase('UC-ISS-0135', async () => { await apply('status', 'Review'); for (const work of [one, two])
        expect((await current(request, work.summary.id)).summary.stage.category).toBe('review'); }, 'web');
    await useCase('UC-ISS-0136', async () => { await apply('archive'); for (const work of [one, two])
        expect((await current(request, work.summary.id)).summary.archived).toBe(true); }, 'web');
    await page.locator('summary').filter({ hasText: 'Advanced filters' }).click();
    await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('archived');
    await expect(page.getByRole('heading', { name: 'Results · 2', exact: true })).toBeVisible();
    await useCase('UC-ISS-0137', async () => { await apply('restore'); for (const work of [one, two])
        expect((await current(request, work.summary.id)).summary.archived).toBe(false); }, 'web');
    for (const work of [one, two])
        expect((await current(request, work.summary.id)).description).toBe('وصف محفوظ');
    await signIn(page, 'viewer', '/issues?projectId=' + projectId, /^Issues$/);
    await expect(page.getByRole('button', { name: 'Select visible issues', exact: true })).toHaveCount(0);
});
test('native bulk merges unrelated edits and retains selected-field conflicts until explicit review', async ({ page, request, }) => {
    const projectId = await isolatedProject(request), one = await create(request, projectId, 'Bulk merge one'), two = await create(request, projectId, 'Bulk merge two');
    await useModernIssues(projectId);
    await signIn(page, 'member', '/issues?projectId=' + projectId, /^Issues$/);
    await page
        .getByRole('checkbox', { name: 'Select issue ' + one.summary.key, exact: true })
        .check();
    await page
        .getByRole('checkbox', { name: 'Select issue ' + two.summary.key, exact: true })
        .check();
    const choices = zPagePriorityView.parse(await (await request.get(apiOrigin + '/api/v2/projects/' + projectId + '/priorities', {
        headers: await headers(),
    })).json()).items;
    const low = choices.find(p => p.key === 'low'), high = choices.find(p => p.key === 'high');
    if (!low || !high)
        throw new Error('Missing priority choices');
    const unrelated = await request.patch(apiOrigin + '/api/v2/issues/' + one.summary.id + '/fields', {
        headers: await headers(),
        data: { field: 'dueDate', dueDate: { prior: null, value: '2026-11-11' } },
    });
    expect(unrelated.status()).toBe(200);
    const changed = await request.patch(apiOrigin + '/api/v2/issues/' + two.summary.id + '/fields', {
        headers: await headers(),
        data: {
            field: 'priorityId',
            priority: {
                prior: (await current(request, two.summary.id)).summary.priority.id,
                value: high.id,
            },
        },
    });
    expect(changed.status()).toBe(200);
    await useCase('UC-ISS-0140', async () => {
        await page.getByRole('combobox', { name: 'Bulk priority', exact: true }).selectOption(low.id);
        await page.getByRole('button', { name: 'Apply to selected', exact: true }).click();
        await expect(page.getByText('1 issue(s) saved; 1 need attention.', { exact: true })).toBeVisible();
        await expect(page.getByRole('checkbox', { name: 'Select issue ' + two.summary.key, exact: true })).toBeChecked();
        await expect(page.getByRole('checkbox', { name: 'Select issue ' + one.summary.key, exact: true })).not.toBeChecked();
        expect((await current(request, one.summary.id)).summary.priority.id).toBe(low.id);
        expect((await current(request, one.summary.id)).summary.dueDate).toBe('2026-11-11');
        expect((await current(request, two.summary.id)).summary.priority.id).toBe(high.id);
    }, 'web');
    await useCase('UC-ISS-0141', async () => {
        await page.getByRole('button', { name: 'Review ' + two.summary.key, exact: true }).click();
        await page.getByRole('button', { name: 'Apply to selected', exact: true }).click();
        await expect(page.getByText('1 issue(s) saved; 0 need attention.', { exact: true })).toBeVisible();
        expect((await current(request, two.summary.id)).summary.priority.id).toBe(low.id);
    }, 'web');
});
test('uncertain bulk retry survives in-app navigation and reuses the original field intent', async ({ page, request, }) => {
    const projectId = await isolatedProject(request), work = await create(request, projectId, 'Bulk acknowledgement');
    await useModernIssues(projectId);
    await signIn(page, 'member', '/issues?projectId=' + projectId, /^Issues$/);
    const low = zPagePriorityView
        .parse(await (await request.get(apiOrigin + '/api/v2/projects/' + projectId + '/priorities', {
        headers: await headers(),
    })).json())
        .items.find(p => p.key === 'low');
    if (!low)
        throw new Error('Missing low priority');
    let attempts = 0;
    const references: string[] = [];
    await page.route('**/api/v2/issues/*/fields', async (route) => {
        if (route.request().method() !== 'PATCH') {
            await route.continue();
            return;
        }
        references.push(route.request().headers()['idempotency-key'] ?? '');
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        if (++attempts === 1) {
            await route.abort('failed');
            return;
        }
        await route.fulfill({ response });
    });
    await page
        .getByRole('checkbox', { name: 'Select issue ' + work.summary.key, exact: true })
        .check();
    await page.getByRole('combobox', { name: 'Bulk priority', exact: true }).selectOption(low.id);
    await useCase('UC-ISS-0164', async () => {
        await page.getByRole('button', { name: 'Apply to selected', exact: true }).click();
        await expect(page.getByLabel('Bulk action', { exact: true })).toBeDisabled();
        await expect(page.getByRole('searchbox', { name: 'Search by title or issue key', exact: true })).toBeDisabled();
        await expect(page.getByRole('checkbox', { name: 'Select issue ' + work.summary.key, exact: true })).toBeDisabled();
    }, 'web');
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('link', { name: 'Project overview', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('/projects/' + projectId + '$'));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(new RegExp('/issues\\?projectId=' + projectId + '$'));
    await useCase('UC-ISS-0165', async () => {
        await page.getByRole('button', { name: 'Retry original bulk action', exact: true }).click();
        await expect(page.getByText('1 issue(s) saved; 0 need attention.', { exact: true })).toBeVisible();
        expect(references).toHaveLength(2);
        expect(new Set(references).size).toBe(1);
        expect((await current(request, work.summary.id)).summary.priority.id).toBe(low.id);
    }, 'web');
});
test('leaving an active bulk batch stops remaining writes and keeps the in-flight intent recoverable', async ({ page, request, }) => {
    const projectId = await isolatedProject(request), one = await create(request, projectId, 'In-flight bulk one'), two = await create(request, projectId, 'In-flight bulk two');
    await useModernIssues(projectId);
    await signIn(page, 'member', '/issues?projectId=' + projectId, /^Issues$/);
    const low = zPagePriorityView
        .parse(await (await request.get(apiOrigin + '/api/v2/projects/' + projectId + '/priorities', {
        headers: await headers(),
    })).json())
        .items.find(p => p.key === 'low');
    if (!low)
        throw new Error('Missing low priority');
    let release: () => void = () => { };
    const gate = new Promise<void>(resolve => (release = resolve));
    let accepted = false;
    let calls = 0;
    await page.route('**/api/v2/issues/*/fields', async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        if (++calls === 1) {
            accepted = true;
            await gate;
        }
        await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Select visible issues', exact: true }).click();
    await page.getByRole('combobox', { name: 'Bulk priority', exact: true }).selectOption(low.id);
    await page.getByRole('button', { name: 'Apply to selected', exact: true }).click();
    await expect.poll(() => accepted).toBe(true);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('link', { name: 'Project overview', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('/projects/' + projectId + '$'));
    release();
    const values = await Promise.all([
        current(request, one.summary.id),
        current(request, two.summary.id),
    ]);
    expect(values.filter(v => v.summary.priority.id === low.id)).toHaveLength(1);
    expect(calls).toBe(1);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp('/issues\\?projectId=' + projectId + '$'));
    await page.getByRole('button', { name: 'Retry original bulk action', exact: true }).click();
    await expect(page.getByText('2 issue(s) saved; 0 need attention.', { exact: true })).toBeVisible();
    for (const work of [one, two]) {
        const value = await current(request, work.summary.id);
        expect(value.summary.priority.id).toBe(low.id);
        expect(value.summary.revision).toBe('2');
    }
});
test('a late global upgrade response cannot replace a selected legacy project', async ({ page, request, }) => {
    const projectId = await isolatedProject(request);
    await useModernIssues(projectId);
    const created = await request.post(apiOrigin + '/api/v2/projects/' + projectId + '/issues', {
        headers: await headers(),
        data: { title: 'Mixed-mode global fixture' },
    });
    expect(created.status()).toBe(201);
    let held = false;
    let release: () => void = () => { };
    const gate = new Promise<void>(resolve => (release = resolve));
    await page.route('**/api/v2/issues/search', async (route) => {
        const body = zModernSearchInput.parse(route.request().postDataJSON());
        if (!held && !body.filters.projectIds?.length) {
            const response = await route.fetch();
            held = true;
            await gate;
            await route.fulfill({ response });
            return;
        }
        await route.continue();
    });
    await signIn(page, 'member', '/issues', /^Issues$/);
    await expect.poll(() => held).toBe(true);
    await page
        .getByRole('combobox', { name: 'Project', exact: true })
        .selectOption('20000000-0000-4000-8000-000000000001');
    release();
    await expect(page.getByRole('combobox', { name: 'Project', exact: true })).toHaveValue('20000000-0000-4000-8000-000000000001');
    await expect(page.getByRole('button', { name: 'New issue', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'New issue', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
});
