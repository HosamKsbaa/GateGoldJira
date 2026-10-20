import { useCase } from './support/use-case';
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject, useModernIssues } from './support/project';
import { zSavedLayoutView, zLayoutView, zSavedModernIssueView, zModernIssueView, zSavedNativeMoveResult, zSavedPlanningItemView, zSavedIssuePlanningView, } from '../src/app/api/generated/zod.gen';
import type { SaveLayoutFields } from '../src/app/api/generated/types.gen';
test.skip(!localFixturesAvailable, 'Requires isolated company fixtures.');
async function headers(role = 'owner') {
    return { Authorization: 'Bearer ' + (await token(role)), 'Idempotency-Key': crypto.randomUUID() };
}
async function fixture(request: APIRequestContext) {
    const projectId = await isolatedProject(request);
    await useModernIssues(projectId);
    const created = await request.post(apiOrigin + '/api/v2/projects/' + projectId + '/boards', {
        headers: await headers('member'),
        data: { name: 'Native board ' + crypto.randomUUID().slice(0, 6), savedFilters: {} },
    });
    expect(created.status()).toBe(201);
    const board = zSavedLayoutView.parse(await created.json()).result;
    const issues = [];
    for (const title of ['First native card', 'Second native card']) {
        const response = await request.post(apiOrigin + '/api/v2/projects/' + projectId + '/issues', {
            headers: await headers('member'),
            data: { title },
        });
        expect(response.status()).toBe(201);
        issues.push(zSavedModernIssueView.parse(await response.json()).result);
    }
    return { projectId, board, issues };
}
async function layout(request: APIRequestContext, id: string) {
    const response = await request.get(apiOrigin + '/api/v2/boards/' + id, {
        headers: await headers('member'),
    });
    expect(response.status()).toBe(200);
    return zLayoutView.parse(await response.json());
}
function draft(view: ReturnType<typeof zLayoutView.parse>): SaveLayoutFields {
    return {
        expectedRevision: view.board.revision,
        name: view.board.name,
        savedFilters: view.board.savedFilters,
        columns: view.columns.map(column => ({
            id: column.id,
            name: column.name,
            stageIds: column.stages.map(mapping => mapping.stage.id),
            wipLimit: column.wipLimit,
            wipMode: column.wipMode,
        })),
    };
}
test('native board searches issue numbers as typed and opens the issue drawer', async ({ page, request, }, testInfo) => {
    const f = await fixture(request), second = f.issues[1];
    if (!second)
        throw new Error('Missing fixture issue');
    await signIn(page, 'member', '/boards/' + f.board.board.id, new RegExp('^' + f.board.board.name + '$'));
    await expect(page.locator('gg-native-issue-card')).toHaveCount(2);
    await page
        .getByRole('searchbox', { name: 'Search this board', exact: true })
        .fill(second.summary.number);
    await expect(page.locator('gg-native-issue-card')).toHaveCount(1);
    await expect(page.locator('gg-native-issue-card')).toContainText(second.summary.title);
    await page.locator('gg-native-issue-card .card-open').click();
    const preview = page.locator('dialog.issue-preview');
    await expect(preview).toBeVisible();
    await expect(preview.getByRole('heading', { name: second.summary.title, exact: true })).toBeVisible();
    await expect(preview.getByRole('button', { name: 'Edit priority', exact: true })).toBeVisible();
    await preview.getByRole('button', { name: 'Close issue', exact: true }).click();
    await expect(preview).not.toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('native-board.png'), fullPage: true });
});
test('native board settings rename reorder and add independent columns', async ({ page, request, }, testInfo) => {
    const f = await fixture(request);
    await signIn(page, 'member', '/boards/' + f.board.board.id + '/settings', /^Board settings$/);
    const columns = page.locator('.native-column');
    await expect(columns).toHaveCount(4);
    await columns.nth(0).getByRole('textbox', { name: 'Column 1', exact: true }).fill('جاهز للفريق');
    await columns.nth(0).getByRole('button', { name: 'Move column right', exact: true }).click();
    await page.getByRole('button', { name: 'Add column', exact: true }).click();
    await expect(columns).toHaveCount(5);
    await columns
        .nth(4)
        .getByRole('textbox', { name: 'Column 5', exact: true })
        .fill('Waiting for external work');
    await page.getByRole('button', { name: 'Save board settings', exact: true }).click();
    await expect(page.getByText('Board settings saved.', { exact: true })).toBeVisible();
    const saved = await layout(request, f.board.board.id);
    expect(saved.columns).toHaveLength(5);
    expect(saved.columns[1]?.name).toBe('جاهز للفريق');
    expect(saved.columns[4]?.name).toBe('Waiting for external work');
    const response = await request.get(apiOrigin + '/api/v2/issues/' + f.issues[0]?.summary.id, {
        headers: await headers('member'),
    });
    expect(zModernIssueView.parse(await response.json()).summary.revision).toBe(f.issues[0]?.summary.revision);
    await page.screenshot({ path: testInfo.outputPath('native-board-settings.png'), fullPage: true });
});
test('native grouped destination offers a stage chooser and does not guess a transition', async ({ page, request, }) => {
    const f = await fixture(request), issue = f.issues[0];
    if (!issue)
        throw new Error('Missing fixture issue');
    const current = await layout(request, f.board.board.id), body = draft(current);
    const doing = body.columns[1], review = body.columns[2];
    if (!doing || !review)
        throw new Error('Missing columns');
    doing.name = 'Delivery work';
    doing.stageIds.push(...review.stageIds);
    body.columns.splice(2, 1);
    const changed = await request.put(apiOrigin + '/api/v2/boards/' + current.board.id + '/layout', {
        headers: await headers('member'),
        data: body,
    });
    expect(changed.status()).toBe(200);
    await signIn(page, 'member', '/boards/' + current.board.id, new RegExp('^' + current.board.name + '$'));
    const card = page.locator('gg-native-issue-card[data-issue-id="' + issue.summary.id + '"]');
    await card.locator('summary').click();
    await card
        .getByRole('combobox', { name: 'Destination column', exact: true })
        .selectOption(doing.id);
    await card.getByRole('button', { name: 'Choose destination', exact: true }).click();
    const dialog = page
        .locator('dialog')
        .filter({ has: page.getByRole('heading', { name: 'Choose destination stage', exact: true }) });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Review', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText('Board updated.', { exact: true })).toBeVisible();
    const response = await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
        headers: await headers('member'),
    });
    expect(zModernIssueView.parse(await response.json()).summary.stage.category).toBe('review');
});
test('native board preserves a lost accepted move reference and viewer controls remain read only', async ({ page, request, }) => {
    const f = await fixture(request), issue = f.issues[0];
    if (!issue)
        throw new Error('Missing fixture issue');
    await useCase('UC-BRD-0080', async () => {
    await signIn(page, 'member', '/boards/' + f.board.board.id, new RegExp('^' + f.board.board.name + '$'));
    const references: string[] = [], bodies: unknown[] = [];
    await page.route('**/api/v2/boards/' + f.board.board.id + '/cards/move', async (route) => {
        references.push(route.request().headers()['idempotency-key'] ?? '');
        bodies.push(route.request().postDataJSON());
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        const saved = zSavedNativeMoveResult.parse(await response.json());
        if (references.length > 1) expect(saved.receipt.replayed).toBe(true);
        if (references.length === 1)
            await route.abort('failed');
        else
            await route.fulfill({ response });
    });
    const card = page.locator('gg-native-issue-card[data-issue-id="' + issue.summary.id + '"]');
    await card.locator('summary').click();
    const review = f.board.columns.find(column => column.name === 'Review');
    if (!review)
        throw new Error('Missing Review');
    await card
        .getByRole('combobox', { name: 'Destination column', exact: true })
        .selectOption(review.id);
    await card.getByRole('button', { name: 'Choose destination', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry original move', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Retry original move', exact: true }).click();
    await expect(page.getByText('Original move confirmed.', { exact: true })).toBeVisible();
    expect(references).toHaveLength(2);
    expect(references[0]).toBe(references[1]);
    expect(references[0]).toBeTruthy(); expect(bodies[0]).toEqual(bodies[1]);
    const response = await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
        headers: await headers('member'),
    });
    expect(zModernIssueView.parse(await response.json()).summary.revision).toBe((BigInt(issue.summary.revision) + 1n).toString());
    }, 'web');
    await signIn(page, 'viewer', '/boards/' + f.board.board.id, new RegExp('^' + f.board.board.name + '$'));
    await expect(page.getByText('Read-only board', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create issue', exact: true })).toHaveCount(0);
    await expect(page.locator('gg-native-issue-card summary')).toHaveCount(0);
});
test('native CDK drop moves a card and independent board reordering stays separate', async ({ page, request, }) => {
    const f = await fixture(request), first = f.issues[0], second = f.issues[1];
    if (!first || !second)
        throw new Error('Missing issues');
    const otherResponse = await request.post(apiOrigin + '/api/v2/projects/' + f.projectId + '/boards', {
        headers: await headers('member'),
        data: { name: 'Independent team order', savedFilters: {} },
    });
    expect(otherResponse.status()).toBe(201);
    const other = zSavedLayoutView.parse(await otherResponse.json()).result;
    await signIn(page, 'member', '/boards/' + f.board.board.id, new RegExp('^' + f.board.board.name + '$'));
    const card = page.locator('gg-native-issue-card[data-issue-id="' + second.summary.id + '"]');
    const originalIssue = zModernIssueView.parse(await (await request.get(apiOrigin + '/api/v2/issues/' + second.summary.id, { headers: await headers('member') })).json());
    await useCase('UC-BRD-0052', async () => {
    await card.locator('summary').click();
    await card
        .getByRole('combobox', { name: 'Same-column neighbor', exact: true })
        .selectOption(first.summary.id);
    await card.getByRole('button', { name: 'Move before', exact: true }).click();
    await expect(page.getByText('Board updated.', { exact: true })).toBeVisible();
    await expect(page.locator('gg-native-issue-card').first()).toContainText(second.summary.title);
    await signIn(page, 'member', '/boards/' + other.board.id, /^Independent team order$/);
    await expect(page.locator('gg-native-issue-card').first()).toContainText(first.summary.title);
    expect(zModernIssueView.parse(await (await request.get(apiOrigin + '/api/v2/issues/' + second.summary.id, { headers: await headers('member') })).json())).toEqual(originalIssue);
    }, 'web');
    await useCase('UC-BRD-0053', async () => {
      await signIn(page, 'member', '/boards/' + f.board.board.id, new RegExp('^' + f.board.board.name + '$'));
      await card.locator('summary').click(); await card.getByRole('combobox', { name: 'Same-column neighbor', exact: true }).selectOption(first.summary.id);
      const accepted = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v2/boards/' + f.board.board.id + '/cards/reorder' && response.status() === 200);
      await card.getByRole('button', { name: 'Move after', exact: true }).click(); await accepted;
      await expect(page.locator('gg-native-issue-card .issue-key')).toHaveText([first.summary.key, second.summary.key]);
      expect(zModernIssueView.parse(await (await request.get(apiOrigin + '/api/v2/issues/' + second.summary.id, { headers: await headers('member') })).json())).toEqual(originalIssue);
      await signIn(page, 'member', '/boards/' + other.board.id, /^Independent team order$/);
      await expect(page.locator('gg-native-issue-card .issue-key')).toHaveText([first.summary.key, second.summary.key]);
    }, 'web');
    const source = page.locator('.draggable-card[data-issue-id="' + second.summary.id + '"]');
    const destination = page
        .locator('.kanban-column[aria-label="Review column"]')
        .locator('.card-list');
    const from = await source.boundingBox(), to = await destination.boundingBox();
    if (!from || !to)
        throw new Error('Missing drag coordinates');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 15, from.y + from.height / 2 + 15, { steps: 4 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
    await page.mouse.up();
    await expect(destination.locator('gg-native-issue-card')).toContainText(second.summary.title);
    const response = await request.get(apiOrigin + '/api/v2/issues/' + second.summary.id, {
        headers: await headers('member'),
    });
    expect(zModernIssueView.parse(await response.json()).summary.stage.category).toBe('review');
});
test('native hard-limit editor and two browser creates preserve the final slot', async ({ page, context, request, }) => {
    await useCase('UC-BRD-0083', async () => {
        const f = await fixture(request), view = await layout(request, f.board.board.id), body = draft(view);
        const todo = body.columns[0];
        if (!todo)
            throw new Error('Missing Todo');
        todo.wipMode = 'block';
        todo.wipLimit = 3;
        const configured = await request.put(apiOrigin + '/api/v2/boards/' + view.board.id + '/layout', {
            headers: await headers('member'),
            data: body,
        });
        expect(configured.status()).toBe(200);
        const other = await context.newPage();
        try {
            await signIn(page, 'member', '/boards/' + view.board.id, new RegExp('^' + view.board.name + '$'));
            await signIn(other, 'member', '/boards/' + view.board.id, new RegExp('^' + view.board.name + '$'));
            for (const [client, title] of [
                [page, 'Concurrent A'],
                [other, 'Concurrent B'],
            ] as const) {
                await client.locator('#board-create-trigger').click();
                const dialog = client.getByRole('dialog', { name: 'Create issue', exact: true });
                await expect(dialog).toBeVisible();
                await dialog.getByLabel('Issue title', { exact: true }).fill(title);
            }
            await Promise.all([
                page
                    .getByRole('dialog', { name: 'Create issue', exact: true })
                    .getByRole('button', { name: 'Create issue', exact: true })
                    .click(),
                other
                    .getByRole('dialog', { name: 'Create issue', exact: true })
                    .getByRole('button', { name: 'Create issue', exact: true })
                    .click(),
            ]);
            await expect
                .poll(async () => {
                const current = await layout(request, view.board.id);
                return current.columns.find(column => column.id === todo.id)?.savedMatchCount;
            })
                .toBe(3);
            await expect
                .poll(async () => Number(await page.getByText(/would exceed the hard work-in-progress limit/).count()) +
                Number(await other.getByText(/would exceed the hard work-in-progress limit/).count()))
                .toBe(1);
        }
        finally {
            await other.close();
        }
    }, 'web');
});
test('native assignee and epic groups retain quick filters and loaded card ownership', async ({ page, request, }) => {
    const f = await fixture(request), first = f.issues[0], second = f.issues[1];
    if (!first || !second)
        throw new Error('Missing issues');
    const assigned = await request.patch(apiOrigin + '/api/v2/issues/' + first.summary.id + '/fields', {
        headers: await headers('member'),
        data: {
            field: 'assigneeId',
            assignee: { prior: null, value: '10000000-0000-4000-8000-000000000002' },
        },
    });
    expect(assigned.status()).toBe(200);
    const current = zSavedModernIssueView.parse(await assigned.json()).result;
    const created = await request.post(apiOrigin + '/api/v1/projects/' + f.projectId + '/planning', {
        headers: await headers('member'),
        data: { kind: 'epic', name: 'الإطلاق', description: '', status: 'active', targetDate: null },
    });
    expect(created.status()).toBe(201);
    const epic = zSavedPlanningItemView.parse(await created.json()).result;
    const planned = await request.put(apiOrigin + '/api/v1/issues/' + first.summary.id + '/planning', {
        headers: await headers('member'),
        data: { expectedRevision: '0', epicId: epic.id, releaseId: null },
    });
    expect(planned.status()).toBe(200);
    zSavedIssuePlanningView.parse(await planned.json());
    await signIn(page, 'member', '/boards/' + f.board.board.id, new RegExp('^' + f.board.board.name + '$'));
    await page
        .getByRole('combobox', { name: 'Group board by', exact: true })
        .selectOption('assignee');
    await expect(page.locator('.swimlane-heading')).toHaveCount(2);
    await expect(page.locator('gg-native-issue-card')).toHaveCount(2);
    await useCase('UC-BRD-0045', async () => {
        await page.getByRole('combobox', { name: 'Group board by', exact: true }).selectOption('epic');
        await expect(page.locator('.swimlane-heading').filter({ hasText: 'الإطلاق' })).toHaveCount(1);
        await expect(page.locator('.swimlane-heading').filter({ hasText: 'No epic' })).toHaveCount(1);
        await expect(page.locator('gg-native-issue-card')).toHaveCount(2);
    }, 'web');
    await page.getByRole('combobox', { name: 'Group board by', exact: true }).selectOption('none');
    await page
        .getByRole('searchbox', { name: 'Search this board', exact: true })
        .fill(second.summary.number);
    await expect(page.locator('gg-native-issue-card')).toHaveCount(1);
    await page.locator('.quick-filter-manager summary').click();
    await page.getByLabel('Quick filter name', { exact: true }).fill('Native numeric filter');
    await page.getByRole('button', { name: 'Save current filters', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Native numeric filter', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close quick filter manager', exact: true }).click();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(page.locator('gg-native-issue-card')).toHaveCount(2);
    await page.getByRole('button', { name: 'Native numeric filter', exact: true }).click();
    await expect(page.locator('gg-native-issue-card')).toHaveCount(1);
    await expect(page.locator('gg-native-issue-card')).toContainText(second.summary.title);
});
