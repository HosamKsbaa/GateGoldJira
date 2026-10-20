import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { isolatedProject, useModernIssues } from './support/project';
import { addFixtureStages } from './support/workflow-fixture';
import { dragBoardCard } from './support/board-drag';
import { coverageBoard, coverageSwitchAccount, coverageFailure, coverageGet, coverageHeaders, coverageIssue, coverageLayout, coverageLayoutDraft, coverageProject, coverageReadIssue, coverageSaveLayout, coverageWrite, coverageDenseBacklog } from './support/coverage-boards';
import { zBacklogPage, zNativeCardPage, zPageBoardSummary, zPagePriorityView, zPageTypeView, zSavedBacklogChange, zSavedBoardSummary, zSavedDependencyView, zSavedIssueView, zSavedLabelView, zSavedModernIssueView, zSavedNativeMoveResult, zSavedAssetView, zPageAssetView, zSavedMembershipView, } from '../src/app/api/generated/zod.gen';
import type { IssueFilter, LayoutView, ModernIssueView, NativeMoveFields, SaveLayoutFields } from '../src/app/api/generated/types.gen';
test.skip(!localFixturesAvailable, 'Requires isolated Go/PostgreSQL fixtures.');
test.use({ trace: 'off' });
const memberId = '10000000-0000-4000-8000-000000000002';
async function cards(request: APIRequestContext, view: LayoutView, temporaryFilters: IssueFilter = {}) {
    const items = [];
    for (const column of view.columns) {
        const page = await coverageWrite(request, 'POST', `/api/v2/boards/${view.board.id}/columns/${column.id}/search`, { temporaryFilters, page: { limit: 100 } }, zNativeCardPage, 200, 'member');
        items.push(...page.items);
    }
    return items;
}
function moveFields(view: LayoutView, issue: ModernIssueView, targetColumnId: string, targetStageId: string | null = null): NativeMoveFields {
    const source = view.columns.find(column => column.stages.some(mapping => mapping.stage.id === issue.summary.stage.id));
    const target = view.columns.find(column => column.id === targetColumnId);
    if (!target)
        throw new Error('Missing target');
    return { issueId: issue.summary.id, expectedIssueRevision: issue.summary.revision, expectedBoardRevision: view.board.revision, sourceColumnId: source?.id ?? null, expectedSourceOrderRevision: source?.orderRevision ?? null, targetColumnId: target.id, expectedTargetOrderRevision: target.orderRevision, targetStageId, neighborIssueId: null, placement: 'last' };
}
test('board layouts persist every small column action and preserve archive/default boundaries', async ({ request }) => {
    const projectId = await coverageProject(request);
    let board = await useCase('UC-BRD-0003', async () => {
        const saved = await coverageBoard(request, projectId, 'Independent coverage board');
        expect(saved.board).toMatchObject({ projectId, name: 'Independent coverage board', default: false, archived: false, canManage: true });
        expect(saved.columns).toHaveLength(4);
        return saved;
    }, 'rest');
    await useCase('UC-BRD-0001', async () => {
        const list = await coverageGet(request, `/api/v1/projects/${projectId}/boards`, zPageBoardSummary, 'viewer');
        expect(list.items.map(value => value.id)).toContain(board.board.id);
        expect(list.items.filter(value => value.default)).toHaveLength(1);
    }, 'rest');
    await useCase("UC-BRD-0095", async () => {
        const path = `/api/v1/projects/${projectId}/boards?limit=1`, first = await coverageGet(request, path, zPageBoardSummary);
        expect(first.items).toHaveLength(1);
        expect(first.nextCursor).not.toBeNull();
        const next = await coverageGet(request, path + '&cursor=' + encodeURIComponent(first.nextCursor!), zPageBoardSummary);
        expect(next.items).toHaveLength(1);
        expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
    }, 'rest');
    board = await useCase('UC-BRD-0005', async () => {
        const body = coverageLayoutDraft(board);
        body.name = 'Renamed independent board';
        const saved = await coverageSaveLayout(request, board.board.id, body);
        expect(saved.board.name).toBe(body.name);
        return saved;
    }, 'rest');
    const extraId = crypto.randomUUID();
    board = await useCase('UC-BRD-0006', async () => {
        const body = coverageLayoutDraft(board);
        body.columns.push({ id: extraId, name: 'Optional stage group', stageIds: [], wipLimit: null, wipMode: 'warn' });
        const saved = await coverageSaveLayout(request, board.board.id, body);
        expect(saved.columns).toHaveLength(5);
        expect(saved.columns[4]?.id).toBe(extraId);
        return saved;
    }, 'rest');
    board = await useCase('UC-BRD-0007', async () => {
        const body = coverageLayoutDraft(board);
        body.columns[4]!.name = 'Renamed optional group';
        const saved = await coverageSaveLayout(request, board.board.id, body);
        expect(saved.columns[4]?.name).toBe('Renamed optional group');
        return saved;
    }, 'rest');
    board = await useCase("UC-BRD-0096", async () => {
        const body = coverageLayoutDraft(board), extra = body.columns.pop();
        if (!extra)
            throw new Error('Missing extra');
        body.columns.splice(2, 0, extra);
        const saved = await coverageSaveLayout(request, board.board.id, body);
        expect(saved.columns[2]?.id).toBe(extraId);
        return saved;
    }, 'rest');
    board = await useCase("UC-BRD-0097", async () => {
        const body = coverageLayoutDraft(board), extra = body.columns.splice(2, 1)[0];
        if (!extra)
            throw new Error('Missing extra');
        body.columns.push(extra);
        const saved = await coverageSaveLayout(request, board.board.id, body);
        expect(saved.columns[4]?.id).toBe(extraId);
        return saved;
    }, 'rest');
    const retainedIssue = await coverageIssue(request, projectId, { title: 'Retained issue during REST column removal' });
    board = await useCase('UC-BRD-0010', async () => {
        const before = await coverageReadIssue(request, retainedIssue.summary.id);
        const body = coverageLayoutDraft(board);
        body.columns = body.columns.filter(column => column.id !== extraId);
        const saved = await coverageSaveLayout(request, board.board.id, body);
        expect(saved.columns).toHaveLength(4);
        expect(saved.columns.some(column => column.id === extraId)).toBe(false);
        const fresh = await coverageReadIssue(request, retainedIssue.summary.id);
        expect(fresh.summary.stage).toEqual(before.summary.stage);
        expect(fresh.summary.workflow).toEqual(before.summary.workflow);
        expect(fresh.summary.revision).toBe(before.summary.revision);
        return saved;
    }, 'rest');
    board = await useCase('UC-BRD-0011', async () => {
        const body = coverageLayoutDraft(board), review = body.columns.splice(2, 1)[0];
        if (!review)
            throw new Error('Missing Review');
        body.columns[1]!.stageIds.push(...review.stageIds);
        const saved = await coverageSaveLayout(request, board.board.id, body);
        expect(saved.columns[1]?.stages).toHaveLength(2);
        expect(saved.columns).toHaveLength(3);
        return saved;
    }, 'rest');
    for (const [id, limit, mode] of [['UC-BRD-0014', 2, 'warn'], ['UC-BRD-0015', 3, 'block'], ['UC-BRD-0016', null, 'warn']] as const) {
        board = await useCase(id, async () => {
            const body = coverageLayoutDraft(board);
            body.columns[0]!.wipLimit = limit;
            body.columns[0]!.wipMode = mode;
            const saved = await coverageSaveLayout(request, board.board.id, body);
            expect(saved.columns[0]).toMatchObject({ wipLimit: limit, wipMode: mode });
            return saved;
        }, 'rest');
    }
    board = await useCase('UC-BRD-0013', async () => {
        const body = coverageLayoutDraft(board);
        body.savedFilters = { priorities: ['high'], query: 'permanent view' };
        const saved = await coverageSaveLayout(request, board.board.id, body);
        expect(saved.board.savedFilters).toEqual(body.savedFilters);
        return saved;
    }, 'rest');
    await useCase('UC-BRD-0061', async () => {
        const before = await coverageLayout(request, board.board.id);
        await coverageFailure(await request.put(apiOrigin + `/api/v2/boards/${board.board.id}/layout`, { headers: await coverageHeaders('viewer'), data: coverageLayoutDraft(before) }), 403, 'forbidden');
        expect((await coverageLayout(request, board.board.id)).board.revision).toBe(before.board.revision);
    }, 'rest');
    const archived = await useCase('UC-BRD-0017', async () => {
        const saved = await coverageWrite(request, 'POST', `/api/v1/boards/${board.board.id}/archive`, { expectedRevision: board.board.revision }, zSavedBoardSummary, 200, 'member');
        expect(saved.result.archived).toBe(true);
        expect((await coverageGet(request, `/api/v1/projects/${projectId}/boards`, zPageBoardSummary)).items.some(value => value.id === board.board.id)).toBe(false);
        return saved.result;
    }, 'rest');
    await useCase('UC-BRD-0062', async () => {
        const view = await coverageLayout(request, board.board.id);
        await coverageFailure(await request.put(apiOrigin + `/api/v2/boards/${board.board.id}/layout`, { headers: await coverageHeaders('member'), data: coverageLayoutDraft(view) }), 403, 'forbidden');
        expect((await coverageLayout(request, board.board.id)).board.archived).toBe(true);
    }, 'rest');
    await useCase('UC-BRD-0018', async () => {
        const saved = await coverageWrite(request, 'POST', `/api/v1/boards/${board.board.id}/restore`, { expectedRevision: archived.revision }, zSavedBoardSummary, 200, 'member');
        expect(saved.result.archived).toBe(false);
        expect((await coverageGet(request, `/api/v1/projects/${projectId}/boards`, zPageBoardSummary)).items.some(value => value.id === board.board.id)).toBe(true);
    }, 'rest');
});
test('a backlog attachment retry retains one created issue and one accepted file', async ({ page, request }) => {
    const projectId = await coverageProject(request);
    await signIn(page, 'member', `/backlog/${projectId}`, /^Backlog$/);
    await useCase('UC-BLG-0032', async () => {
        await page.getByRole('button', { name: 'New issue', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
        await dialog.getByLabel('Issue title', { exact: true }).fill('Backlog upload retry');
        const chooser = page.waitForEvent('filechooser');
        await dialog.getByRole('button', { name: 'Attach files or pictures', exact: true }).click();
        await (await chooser).setFiles({ name: 'planned-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Retained planned attachment') });
        await expect(dialog.getByRole('list', { name: 'Queued attachments' })).toContainText('planned-notes.txt');
        let creates = 0, finalized = 0;
        page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname === `/api/v2/projects/${projectId}/issues`)
            creates++; });
        await page.route('**/api/v1/asset-uploads/*/finalize', async (route) => {
            const response = await route.fetch();
            expect(response.status()).toBe(201);
            expect(zSavedAssetView.parse(await response.json()).result.filename).toBe('planned-notes.txt');
            if (++finalized === 1)
                await route.abort('failed');
            else
                await route.fulfill({ response });
        });
        await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
        await expect(dialog).toContainText('Upload failed; retry Save');
        await dialog.getByRole('button', { name: 'Retry original create', exact: true }).click();
        await expect(dialog).not.toBeVisible();
        const planned = await coverageGet(request, `/api/v1/projects/${projectId}/backlog`, zBacklogPage);
        expect(planned.totalMatching).toBe(1);
        expect(creates).toBe(1);
        const issue = planned.items[0];
        if (!issue)
            throw new Error('Missing planned work');
        const assets = await coverageGet(request, `/api/v1/issues/${issue.id}/assets`, zPageAssetView);
        expect(assets.items).toHaveLength(1);
        expect(assets.items[0]?.filename).toBe('planned-notes.txt');
    }, 'web');
});
test('backlog refuses an oversized selection and bounded rank maintenance refuses a dense 2001-item rebalance', async ({ request, page }) => {
    test.setTimeout(60000);
    const projectId = await coverageProject(request), template = await coverageIssue(request, projectId, { title: 'Dense tail issue', backlog: true });
    await coverageDenseBacklog(projectId, template.summary.id);
    await useCase('UC-BLG-0035', async () => {
        const before = await coverageGet(request, `/api/v1/projects/${projectId}/backlog?limit=2`, zBacklogPage);
        expect(before.totalMatching).toBe(2001);
        expect(before.items).toHaveLength(2);
        const neighbor = before.items[1];
        if (!neighbor)
            throw new Error('Missing dense neighbor');
        const response = await request.post(apiOrigin + `/api/v1/issues/${template.summary.id}/backlog-order`, { headers: await coverageHeaders('member'), data: { expectedRevision: template.summary.revision, expectedOrderRevision: before.orderRevision, neighborId: neighbor.id, before: true } });
        await coverageFailure(response);
        expect(await response.json()).toMatchObject({ error: { message: 'This planning order exceeds the bounded rebalance size.' } });
        const after = await coverageGet(request, `/api/v1/projects/${projectId}/backlog?limit=2`, zBacklogPage);
        expect(after.orderRevision).toBe(before.orderRevision);
        expect(after.items.map(value => value.id)).toEqual(before.items.map(value => value.id));
    }, 'rest');
    await signIn(page, 'member', `/backlog/${projectId}`, /^Backlog$/);
    await useCase('UC-BLG-0035', async () => {
        const list = page.getByRole('list', { name: 'Ranked backlog', exact: true });
        await expect(list.getByRole('listitem')).toHaveCount(25); const beforeKeys = await list.locator('.planned-work small').allTextContents();
        const before = await coverageGet(request, `/api/v1/projects/${projectId}/backlog?limit=25`, zBacklogPage);
        const rejected = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/backlog-order'));
        await list.getByRole('listitem').first().getByRole('button', { name: /^Rank .+ later$/ }).click();
        const response = await rejected; expect(response.status()).toBe(422); await expect(page.getByRole('alert')).toContainText('bounded rebalance size');
        await expect(list.locator('.planned-work small')).toHaveText(beforeKeys); const after = await coverageGet(request, `/api/v1/projects/${projectId}/backlog?limit=25`, zBacklogPage); expect(after.orderRevision).toBe(before.orderRevision); expect(after.items.map(value => value.id)).toEqual(before.items.map(value => value.id));
    }, 'web');
    await useCase('UC-BLG-0023', async () => {
        const list = page.getByRole('list', { name: 'Ranked backlog', exact: true });
        for (const count of [50, 75, 100, 125]) {
            await page.getByRole('button', { name: 'More planned work', exact: true }).click();
            await expect(list.getByRole('listitem')).toHaveCount(count);
        }
        await page.getByRole('checkbox', { name: 'Select loaded (up to 100)', exact: true }).check();
        const extra = list.getByRole('listitem').nth(100).getByRole('checkbox');
        await expect(extra).not.toBeChecked();
        await extra.click();
        await expect(extra).not.toBeChecked();
        await expect(page.getByRole('alert')).toContainText('Select at most 100 issues per move.');
        await expect(page.getByRole('button', { name: 'Move 100 to board', exact: true })).toBeEnabled();
    }, 'web');
});
test('invalid board layout changes are rejected atomically with original mappings retained', async ({ request }) => {
    const projectId = await coverageProject(request), board = await coverageBoard(request, projectId);
    const foreignProject = await coverageProject(request), foreignBoard = await coverageBoard(request, foreignProject), foreignStageId = foreignBoard.columns[0]?.stages[0]?.stage.id;
    if (!foreignStageId)
        throw new Error('Missing foreign stage');
    await coverageIssue(request, projectId, { title: 'Occupancy A' });
    await coverageIssue(request, projectId, { title: 'Occupancy B' });
    const invalids: Array<[
        string,
        (body: SaveLayoutFields) => void
    ]> = [
        ['UC-BRD-0063', body => { body.columns[1]!.id = body.columns[0]!.id; }],
        ['UC-BRD-0064', body => { body.columns[1]!.name = body.columns[0]!.name.toUpperCase(); }],
        ['UC-BRD-0065', body => { body.columns[1]!.stageIds.push(...body.columns[0]!.stageIds); }],
        ['UC-BRD-0066', body => { body.columns[0]!.stageIds = [foreignStageId]; }],
        ['UC-BRD-0067', body => { body.columns = []; }],
        ['UC-BRD-0071', body => { body.columns[0]!.wipMode = 'block'; body.columns[0]!.wipLimit = 1; }],
        ['UC-BRD-0072', body => { body.columns[0]!.wipMode = 'block'; body.columns[0]!.wipLimit = null; }],
        ['UC-BRD-0073', body => { body.columns[0]!.wipMode = 'block'; body.columns[0]!.wipLimit = 3; body.savedFilters = { assignee: { kind: 'self' } }; }],
        ['UC-BRD-0074', body => { body.columns[0]!.wipMode = 'block'; body.columns[0]!.wipLimit = 3; body.savedFilters = { blocked: true }; }],
        ['UC-BRD-0075', body => { body.columns[0]!.wipLimit = 0; }],
    ];
    for (const [id, mutate] of invalids) {
        await useCase(id, async () => {
            const before = await coverageLayout(request, board.board.id), body = coverageLayoutDraft(before);
            mutate(body);
            await coverageFailure(await request.put(apiOrigin + `/api/v2/boards/${board.board.id}/layout`, { headers: await coverageHeaders('member'), data: body }));
            const after = await coverageLayout(request, board.board.id);
            expect(after.board.revision).toBe(before.board.revision);
            expect(after.columns).toEqual(before.columns);
        }, 'rest');
    }
    const listed = await coverageGet(request, `/api/v1/projects/${projectId}/boards`, zPageBoardSummary), defaultId = listed.items.find(value => value.default)?.id;
    if (!defaultId)
        throw new Error('Missing default board');
    for (const [id, mutate] of [
        ['UC-BRD-0068', (body: SaveLayoutFields) => { body.name = 'Rename default'; }],
        ['UC-BRD-0069', (body: SaveLayoutFields) => { body.savedFilters = { query: 'hide default work' }; }],
        ['UC-BRD-0070', (body: SaveLayoutFields) => { body.columns[0]!.stageIds = []; }],
    ] as const) {
        await useCase(id, async () => {
            const before = await coverageLayout(request, defaultId), body = coverageLayoutDraft(before);
            mutate(body);
            await coverageFailure(await request.put(apiOrigin + `/api/v2/boards/${defaultId}/layout`, { headers: await coverageHeaders(), data: body }));
            expect((await coverageLayout(request, defaultId)).board.revision).toBe(before.board.revision);
        }, 'rest');
    }
    await useCase('UC-BRD-0076', async () => {
        const before = await coverageLayout(request, defaultId);
        await coverageFailure(await request.post(apiOrigin + `/api/v1/boards/${defaultId}/archive`, { headers: await coverageHeaders(), data: { expectedRevision: before.board.revision } }), 403, 'forbidden');
        expect((await coverageLayout(request, defaultId)).board.archived).toBe(false);
    }, 'rest');
});
test('each board filter returns its actual matching issue identities', async ({ request }) => {
    const projectId = await coverageProject(request), board = await coverageBoard(request, projectId);
    const priorities = await coverageGet(request, `/api/v2/projects/${projectId}/priorities`, zPagePriorityView), types = await coverageGet(request, `/api/v2/projects/${projectId}/issue-types`, zPageTypeView);
    const high = priorities.items.find(value => value.key === 'high'), bug = types.items.find(value => value.key === 'bug');
    if (!high || !bug)
        throw new Error('Missing taxonomy');
    const label = (await coverageWrite(request, 'POST', `/api/v1/projects/${projectId}/labels`, { name: 'Coverage label' }, zSavedLabelView, 201, 'member')).result;
    const a = await coverageIssue(request, projectId, { title: 'عطل البوابة المميز', assigneeId: memberId, priorityId: high.id, typeId: bug.id, dueDate: '2020-01-01', labelIds: [label.id] });
    const b = await coverageIssue(request, projectId, { title: 'Future delivery', dueDate: '2099-12-01' });
    const c = await coverageIssue(request, projectId, { title: 'No due date delivery' });
    const all = [a.summary.id, b.summary.id, c.summary.id].sort();
    const criteria: Array<[
        string,
        IssueFilter,
        string[]
    ]> = [
        ["UC-BRD-0098", { query: a.summary.number }, [a.summary.id]], ["UC-BRD-0099", { query: a.summary.key }, [a.summary.id]],
        ["UC-BRD-0100", { query: 'Future delivery' }, [b.summary.id]], ["UC-BRD-0101", { query: 'البوابة' }, [a.summary.id]],
        ['UC-BRD-0023', { assignee: { kind: 'self' } }, [a.summary.id]], ['UC-BRD-0024', { statuses: ['todo'] }, all],
        ['UC-BRD-0025', { typeIds: [bug.id] }, [a.summary.id]], ['UC-BRD-0026', { priorityIds: [high.id] }, [a.summary.id]],
        ['UC-BRD-0027', { assignee: { kind: 'unassigned' } }, [b.summary.id, c.summary.id]], ['UC-BRD-0028', { assignee: { kind: 'user', userId: memberId } }, [a.summary.id]],
        ['UC-BRD-0031', { dueFrom: '2099-01-01', dueTo: '2099-12-31' }, [b.summary.id]], ['UC-BRD-0032', { overdue: true }, [a.summary.id]],
        ['UC-BRD-0033', { overdue: false }, [b.summary.id, c.summary.id]], ['UC-BRD-0035', { labelIds: [label.id] }, [a.summary.id]],
    ];
    for (const [id, filters, expected] of criteria) {
        await useCase(id, async () => { expect((await cards(request, board, filters)).map(value => value.id).sort()).toEqual([...expected].sort()); }, 'rest');
    }
    const current = await coverageReadIssue(request, a.summary.id);
    await coverageWrite(request, 'POST', `/api/v1/issues/${a.summary.id}/dependencies`, { expectedIssueRevision: current.summary.revision, expectedGraphRevision: current.graphRevision, blockerId: b.summary.id }, zSavedDependencyView, 200, 'member');
    await useCase('UC-BRD-0029', async () => { expect((await cards(request, board, { blocked: true })).map(value => value.id)).toEqual([a.summary.id]); }, 'rest');
    await useCase('UC-BRD-0030', async () => { expect((await cards(request, board, { blocked: false })).map(value => value.id).sort()).toEqual([b.summary.id, c.summary.id].sort()); }, 'rest');
    await useCase('UC-BRD-0034', async () => {
        const parent = await coverageReadIssue(request, c.summary.id);
        const child = await coverageIssue(request, projectId, { title: 'Parent-filter child', parentId: parent.summary.id, expectedParentRevision: parent.summary.revision });
        const matches = await cards(request, board, { parentId: parent.summary.id });
        expect(matches.map(value => value.id)).toEqual([child.summary.id]);
        expect(matches[0]?.parent?.id).toBe(parent.summary.id);
    }, 'rest');
});
test('board browser live search, drawer, filter keyboard and creation cancellation work independently', async ({ page, request }) => {
    const projectId = await coverageProject(request), board = await coverageBoard(request, projectId), first = await coverageIssue(request, projectId, { title: 'قضية واجهة فريدة' });
    await coverageIssue(request, projectId, { title: 'Different card' });
    await signIn(page, 'member', `/boards/${board.board.id}`, /^Coverage board$/);
    await useCase('UC-BRD-0004', async () => { await expect(page.locator('gg-native-issue-card')).toHaveCount(2); await expect(page.getByRole('heading', { name: board.board.name, exact: true })).toBeVisible(); }, 'web');
    for (const [id, value] of [['UC-BRD-0019', first.summary.number], ['UC-BRD-0020', first.summary.key], ['UC-BRD-0022', 'واجهة']] as const) {
        await useCase(id, async () => {
            await page.getByRole('searchbox', { name: 'Search this board', exact: true }).fill(value);
            await expect(page.locator('gg-native-issue-card')).toHaveCount(1);
            await expect(page.locator('gg-native-issue-card')).toContainText(first.summary.title);
        }, 'web');
    }
    await useCase('UC-BRD-0037', async () => { await page.getByRole('button', { name: 'Clear filters', exact: true }).click(); await expect(page.locator('gg-native-issue-card')).toHaveCount(2); await expect(page.getByRole('searchbox', { name: 'Search this board' })).toHaveValue(''); }, 'web');
    await useCase('UC-BRD-0084', async () => {
        await page.locator('.board-filters > summary').click();
        await expect(page.getByRole('combobox', { name: 'Stage category', exact: true })).toBeVisible();
        await page.getByRole('combobox', { name: 'Stage category', exact: true }).focus();
        await page.keyboard.press('Escape');
        await expect(page.getByRole('combobox', { name: 'Stage category', exact: true })).not.toBeVisible();
    }, 'web');
    const preview = page.locator('dialog.issue-preview');
    await useCase('UC-BRD-0054', async () => { await page.locator(`gg-native-issue-card[data-issue-id="${first.summary.id}"] .card-open`).click(); await expect(preview).toBeVisible(); await expect(preview.getByRole('heading', { name: first.summary.title, exact: true })).toBeVisible(); }, 'web');
    await useCase('UC-BRD-0057', async () => { await preview.getByRole('button', { name: 'Close issue', exact: true }).click(); await expect(preview).not.toBeVisible(); }, 'web');
    await useCase('UC-BRD-0059', async () => {
        await page.locator('#board-create-trigger').click();
        const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
        await dialog.getByLabel('Issue title', { exact: true }).fill('Cancelled board draft');
        page.once('dialog', confirmation => confirmation.accept());
        await dialog.getByRole('button', { name: 'Cancel create', exact: true }).click();
        await expect(dialog).not.toBeVisible();
        expect((await cards(request, board)).map(value => value.title)).not.toContain('Cancelled board draft');
    }, 'web');
    await useCase('UC-BRD-0058', async () => {
        await page.locator('#board-create-trigger').click();
        const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
        await dialog.getByLabel('Issue title', { exact: true }).fill('Created directly from board');
        await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
        await expect(dialog).not.toBeVisible();
        await expect(page.locator('gg-native-issue-card')).toHaveCount(3);
        expect((await cards(request, board)).filter(value => value.title === 'Created directly from board')).toHaveLength(1);
    }, 'web');
    await signIn(page, 'viewer', `/boards/${board.board.id}`, /^Coverage board$/);
    await useCase('UC-BRD-0060', async () => { await expect(page.getByText('Read-only board', { exact: true })).toBeVisible(); await expect(page.locator('gg-native-issue-card')).toHaveCount(3); await expect(page.locator('gg-native-issue-card summary')).toHaveCount(0); await expect(page.locator('#board-create-trigger')).toHaveCount(0); }, 'web');
});
test('board rejects an empty destination and exposes every unfinished completion prerequisite', async ({ request, page }) => {
    test.setTimeout(60000);
    const projectId = await coverageProject(request), original = await coverageBoard(request, projectId), issue = await coverageIssue(request, projectId, { title: 'Prerequisite board target' });
    const body = coverageLayoutDraft(await coverageLayout(request, original.board.id)), emptyId = crypto.randomUUID();
    body.columns.push({ id: emptyId, name: 'No eligible stages', stageIds: [], wipLimit: null, wipMode: 'warn' });
    const board = await coverageSaveLayout(request, original.board.id, body);
    await page.setViewportSize({ width: 1900, height: 1000 });
    await signIn(page, 'member', `/boards/${board.board.id}`, /^Coverage board$/);
    await useCase('UC-BRD-0077', async () => {
        const source = page.locator(`.draggable-card[data-issue-id="${issue.summary.id}"]`), target = page.locator(`.kanban-column[data-column-id="${emptyId}"] .card-list`);
        await dragBoardCard(page, source, target);
        await expect(page.getByRole('alert')).toContainText('This workflow has no eligible move to that column.');
        expect((await coverageReadIssue(request, issue.summary.id)).summary.stage.id).toBe(issue.summary.stage.id);
    }, 'web');
    const blockers: string[] = [];
    for (let index = 0; index < 26; index++) {
        const blocker = await coverageIssue(request, projectId, { title: 'Prerequisite ' + String(index + 1).padStart(2, '0') }), current = await coverageReadIssue(request, issue.summary.id);
        await coverageWrite(request, 'POST', `/api/v1/issues/${issue.summary.id}/dependencies`, { expectedIssueRevision: current.summary.revision, expectedGraphRevision: current.graphRevision, blockerId: blocker.summary.id }, zSavedDependencyView, 200, 'member');
        blockers.push(blocker.summary.id);
    }
    await useCase('UC-BRD-0078', async () => {
        await page.getByRole('button', { name: 'Reload board', exact: true }).click();
        await expect(page.getByRole('region', { name: 'To do column', exact: true }).getByRole('heading', { level: 2 })).toContainText('27');
        const card = page.locator(`gg-native-issue-card[data-issue-id="${issue.summary.id}"]`), done = board.columns.find(column => column.stages.some(value => value.stage.category === 'done'));
        if (!done)
            throw new Error('Missing Done');
        await card.locator('summary').click();
        await card.getByRole('combobox', { name: 'Destination column', exact: true }).selectOption(done.id);
        await card.getByRole('button', { name: 'Choose destination', exact: true }).click();
        const unfinished = page.getByRole('region', { name: 'Unfinished prerequisites', exact: true });
        await expect(unfinished).toBeVisible();
        await expect(unfinished.locator('li')).toHaveCount(25);
        await unfinished.getByRole('button', { name: 'More unfinished work', exact: true }).click();
        await expect(unfinished.locator('li')).toHaveCount(26);
        const linkedIds = await unfinished.getByRole('link').evaluateAll(links => links.map(link => link.getAttribute('href')?.split('/').at(-1)));
        expect(new Set(linkedIds)).toEqual(new Set(blockers));
        expect((await coverageReadIssue(request, issue.summary.id)).summary.stage.id).toBe(issue.summary.stage.id);
    }, 'web');
});
test('board foreground refresh waits for the local create modal to close', async ({ request, page }) => {
    const projectId = await coverageProject(request), board = await coverageBoard(request, projectId);
    await coverageIssue(request, projectId, { title: 'Idle board work' });
    await page.clock.install();
    await signIn(page, 'member', `/boards/${board.board.id}`, /^Coverage board$/);
    await expect(page.locator('gg-native-issue-card')).toHaveCount(1);
    let reads = 0;
    page.on('request', request => { if (request.method() === 'GET' && new URL(request.url()).pathname === `/api/v2/boards/${board.board.id}`)
        reads++; });
    await useCase('UC-BRD-0091', async () => {
        await page.locator('#board-create-trigger').click();
        const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
        await expect(dialog).toBeVisible();
        const before = reads;
        await page.clock.runFor(31000);
        expect(reads).toBe(before);
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: 'Cancel create', exact: true }).click();
        await expect(dialog).not.toBeVisible();
        await page.clock.runFor(30000);
        await expect.poll(() => reads).toBeGreaterThan(before);
    }, 'web');
});
test('board browser destination chooser, pointer drop, grouping and full issue navigation', async ({ page, request }) => {
    const projectId = await coverageProject(request), original = await coverageBoard(request, projectId);
    const first = await coverageIssue(request, projectId, { title: 'Interactive owned work', assigneeId: memberId }), second = await coverageIssue(request, projectId, { title: 'Interactive unassigned work' });
    const body = coverageLayoutDraft(await coverageLayout(request, original.board.id)), review = body.columns.splice(2, 1)[0];
    if (!review)
        throw new Error('Missing Review');
    body.columns[1]!.name = 'Delivery';
    body.columns[1]!.stageIds.push(...review.stageIds);
    const board = await coverageSaveLayout(request, original.board.id, body), delivery = board.columns[1];
    if (!delivery)
        throw new Error('Missing Delivery');
    await signIn(page, 'member', `/boards/${board.board.id}`, /^Coverage board$/);
    const firstCard = page.locator(`gg-native-issue-card[data-issue-id="${first.summary.id}"]`);
    const chooser = page.getByRole('dialog', { name: 'Choose destination stage', exact: true });
    await firstCard.locator('summary').click();
    await firstCard.getByRole('combobox', { name: 'Destination column', exact: true }).selectOption(delivery.id);
    await useCase('UC-BRD-0050', async () => {
        await firstCard.getByRole('button', { name: 'Choose destination', exact: true }).click();
        await expect(chooser).toBeVisible();
        await chooser.getByRole('button', { name: 'Cancel move', exact: true }).click();
        await expect(chooser).not.toBeVisible();
        expect((await coverageReadIssue(request, first.summary.id)).summary.stage.id).toBe(first.summary.stage.id);
    }, 'web');
    await useCase('UC-BRD-0049', async () => {
        await firstCard.getByRole('button', { name: 'Choose destination', exact: true }).click();
        await expect(chooser).toBeVisible();
        await expect(chooser.getByRole('button', { name: 'In progress', exact: true })).toBeVisible();
        await expect(chooser.getByRole('button', { name: 'Review', exact: true })).toBeVisible();
        await chooser.getByRole('button', { name: 'Review', exact: true }).click();
        await expect(chooser).not.toBeVisible();
        await expect(page.getByText('Board updated.', { exact: true })).toBeVisible();
        expect((await coverageReadIssue(request, first.summary.id)).summary.stage.category).toBe('review');
    }, 'web');
    await useCase('UC-BRD-0051', async () => {
        const card = page.locator(`gg-native-issue-card[data-issue-id="${second.summary.id}"]`);
        await card.locator('summary').click();
        const done = board.columns.find(column => column.stages.some(mapping => mapping.stage.category === 'done'));
        if (!done)
            throw new Error('Missing Done');
        await card.getByRole('combobox', { name: 'Destination column', exact: true }).selectOption(done.id);
        await card.getByRole('button', { name: 'Choose destination', exact: true }).click();
        await expect(page.locator('.kanban-column[aria-label="Done column"]')).toContainText(second.summary.title);
        expect((await coverageReadIssue(request, second.summary.id)).summary.stage.category).toBe('done');
    }, 'web');
    await useCase('UC-BRD-0044', async () => {
        await page.getByRole('combobox', { name: 'Group board by', exact: true }).selectOption('assignee');
        await expect(page.locator('.swimlane-heading')).toHaveCount(2);
        await expect(page.locator('gg-native-issue-card')).toHaveCount(2);
        await expect(page.getByRole('button', { name: 'Collapse Unassigned group', exact: true })).toBeVisible();
    }, 'web');
    await useCase('UC-BRD-0046', async () => { await page.getByRole('button', { name: 'Collapse Unassigned group', exact: true }).click(); await expect(page.locator(`gg-native-issue-card[data-issue-id="${second.summary.id}"]`)).toHaveCount(0); await expect(page.getByRole('button', { name: 'Expand Unassigned group', exact: true })).toHaveAttribute('aria-expanded', 'false'); }, 'web');
    await useCase('UC-BRD-0047', async () => { await page.getByRole('button', { name: 'Expand Unassigned group', exact: true }).click(); await expect(page.locator(`gg-native-issue-card[data-issue-id="${second.summary.id}"]`)).toBeVisible(); await expect(page.getByRole('button', { name: 'Collapse Unassigned group', exact: true })).toHaveAttribute('aria-expanded', 'true'); }, 'web');
    await page.getByRole('combobox', { name: 'Group board by', exact: true }).selectOption('none');
    await useCase('UC-BRD-0048', async () => {
        const source = page.locator(`.draggable-card[data-issue-id="${second.summary.id}"]`), target = page.locator('.kanban-column[aria-label="To do column"] .card-list');
        // Close a card menu before pointer dragging so its expanded controls do not obscure the card body.
        const menu = source.locator('details');
        if (await menu.getAttribute('open') !== null)
            await menu.locator('summary').click();
        const from = await source.boundingBox(), to = await target.boundingBox();
        if (!from || !to)
            throw new Error('Missing drag geometry');
        await page.mouse.move(from.x + 30, from.y + 25);
        await page.mouse.down();
        await page.mouse.move(from.x + 45, from.y + 35, { steps: 4 });
        await page.mouse.move(to.x + 45, to.y + 40, { steps: 18 });
        await page.mouse.up();
        await expect(target.locator('gg-native-issue-card')).toContainText(second.summary.title);
        expect((await coverageReadIssue(request, second.summary.id)).summary.stage.category).toBe('todo');
    }, 'web');
    await useCase('UC-BRD-0055', async () => {
        await expect(firstCard.locator('.card-open')).toHaveAttribute('href', '/issues/' + first.summary.id);
        const popupPromise = page.context().waitForEvent('page');
        await firstCard.locator('.card-open').click({ button: 'middle' });
        const popup = await popupPromise;
        await expect(popup).toHaveURL(/\/(issues\/|sign-in)/);
        const destination = new URL(popup.url());
        expect(destination.pathname === '/issues/' + first.summary.id || destination.pathname === '/sign-in' && destination.searchParams.get('returnTo') === '/issues/' + first.summary.id).toBe(true);
        await popup.close();
    }, 'web');
    await useCase('UC-BRD-0056', async () => {
        await firstCard.locator('.card-open').click();
        const preview = page.locator('dialog.issue-preview');
        await expect(preview).toBeVisible();
        await preview.getByRole('link', { name: 'Open full issue', exact: true }).click();
        await expect(page).toHaveURL(new RegExp('/issues/' + first.summary.id + '$'));
        await expect(page.getByRole('heading', { name: first.summary.title, exact: true })).toBeVisible();
    }, 'web');
});
test('personal quick filters support save, replace, apply, toggle, private ownership and removal', async ({ page, request }) => {
    const projectId = await coverageProject(request), board = await coverageBoard(request, projectId), a = await coverageIssue(request, projectId, { title: 'Quick filter A' }), b = await coverageIssue(request, projectId, { title: 'Quick filter B' });
    await signIn(page, 'member', `/boards/${board.board.id}`, /^Coverage board$/);
    const manager = page.locator('.quick-filter-manager'), search = page.getByRole('searchbox', { name: 'Search this board', exact: true }), button = page.getByRole('group', { name: 'My quick filters', exact: true }).getByRole('button', { name: 'My saved quick filter', exact: true });
    await search.fill(a.summary.number);
    await expect(page.locator('gg-native-issue-card')).toHaveCount(1);
    await useCase('UC-BRD-0038', async () => {
        await manager.locator('summary').click();
        await manager.getByLabel('Quick filter name', { exact: true }).fill('My saved quick filter');
        await manager.getByRole('button', { name: 'Save current filters', exact: true }).click();
        await expect(button).toBeVisible();
        await expect(manager.getByText('Personal quick filter saved.', { exact: true })).toBeVisible();
    }, 'web');
    await manager.getByRole('button', { name: 'Close quick filter manager', exact: true }).click();
    await useCase('UC-BRD-0040', async () => {
        await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
        await expect(page.locator('gg-native-issue-card')).toHaveCount(2);
        await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('gg-native-issue-card')).toHaveCount(1);
        await expect(page.locator('gg-native-issue-card')).toContainText(a.summary.title);
    }, 'web');
    await useCase('UC-BRD-0041', async () => { await button.click(); await expect(button).toHaveAttribute('aria-pressed', 'false'); await expect(page.locator('gg-native-issue-card')).toHaveCount(2); }, 'web');
    await useCase('UC-BRD-0039', async () => {
        await search.fill(b.summary.number);
        await expect(page.locator('gg-native-issue-card')).toHaveCount(1);
        await manager.locator('summary').click();
        await manager.getByLabel('Quick filter name', { exact: true }).fill('My saved quick filter');
        await manager.getByRole('button', { name: 'Save current filters', exact: true }).click();
        await expect(manager.getByText('Personal quick filter saved.', { exact: true })).toBeVisible();
        await expect(button).toHaveCount(1);
        await manager.getByRole('button', { name: 'Close quick filter manager', exact: true }).click();
        await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
        await button.click();
        await expect(page.locator('gg-native-issue-card')).toContainText(b.summary.title);
    }, 'web');
    await useCase('UC-BRD-0043', async () => { await signIn(page, 'owner', `/boards/${board.board.id}`, /^Coverage board$/); await expect(button).toHaveCount(0); await expect(page.locator('gg-native-issue-card')).toHaveCount(2); }, 'web');
    await signIn(page, 'member', `/boards/${board.board.id}`, /^Coverage board$/);
    await useCase('UC-BRD-0042', async () => { await manager.locator('summary').click(); await manager.getByRole('button', { name: 'Remove quick filter My saved quick filter', exact: true }).click(); await expect(button).toHaveCount(0); }, 'web');
});
test('backlog browser selection, keyboard ranking, cancellation, activation and read-only access', async ({ page, request }) => {
    const projectId = await coverageProject(request), a = await coverageIssue(request, projectId, { title: 'Backlog browser A', backlog: true }), b = await coverageIssue(request, projectId, { title: 'Backlog browser B', backlog: true });
    const activeBoard = await coverageBoard(request, projectId, 'Active order remains independent');
    await coverageIssue(request, projectId, { title: 'First active control' });
    await coverageIssue(request, projectId, { title: 'Second active control' });
    const activeOrder = (await cards(request, activeBoard)).map(issue => issue.id);
    expect(activeOrder).toHaveLength(2);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'member', `/backlog/${projectId}`, /^Backlog$/);
    const list = page.getByRole('list', { name: 'Ranked backlog', exact: true }), selectA = page.getByRole('checkbox', { name: 'Select ' + a.summary.key, exact: true });
    await useCase('UC-BLG-0003', async () => {
        await list.getByRole('link').filter({ hasText: a.summary.key }).click();
        await expect(page).toHaveURL(new RegExp('/issues/' + a.summary.id + '$'));
        await expect(page.getByRole('heading', { name: a.summary.title, exact: true })).toBeVisible();
        await page.goBack();
        await expect(list.locator('.planned-work small')).toHaveText([a.summary.key, b.summary.key]);
    }, 'web');
    await useCase('UC-BLG-0013', async () => { await selectA.check(); await expect(selectA).toBeChecked(); await expect(page.getByRole('button', { name: 'Move 1 to board', exact: true })).toBeEnabled(); }, 'web');
    await useCase('UC-BLG-0014', async () => { await selectA.uncheck(); await expect(selectA).not.toBeChecked(); await expect(page.getByRole('button', { name: 'Move to board', exact: true })).toBeDisabled(); }, 'web');
    await useCase('UC-BLG-0015', async () => { await page.getByRole('checkbox', { name: 'Select loaded (up to 100)', exact: true }).check(); await expect(selectA).toBeChecked(); await expect(page.getByRole('checkbox', { name: 'Select ' + b.summary.key, exact: true })).toBeChecked(); await expect(page.getByRole('button', { name: 'Move 2 to board', exact: true })).toBeEnabled(); }, 'web');
    await useCase('UC-BLG-0016', async () => { await page.getByRole('checkbox', { name: 'Select loaded (up to 100)', exact: true }).uncheck(); await expect(selectA).not.toBeChecked(); await expect(page.getByRole('checkbox', { name: 'Select ' + b.summary.key, exact: true })).not.toBeChecked(); }, 'web');
    await useCase('UC-BLG-0010', async () => { await page.getByRole('button', { name: 'Rank ' + b.summary.key + ' earlier', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(list.locator('.planned-work small')).toHaveText([b.summary.key, a.summary.key]); }, 'web');
    await useCase('UC-BLG-0012', async () => { await page.getByRole('button', { name: 'Rank ' + b.summary.key + ' later', exact: true }).focus(); await page.keyboard.press('Enter'); await expect(list.locator('.planned-work small')).toHaveText([a.summary.key, b.summary.key]); }, 'web');
    for (const [id, destinationIndex, expected] of [['UC-BLG-0009', 0, [b.summary.key, a.summary.key]], ['UC-BLG-0011', 1, [a.summary.key, b.summary.key]]] as const) {
        await useCase(id, async () => {
            const grip = page.getByRole('button', { name: 'Drag ' + b.summary.key, exact: true }), target = list.getByRole('listitem').filter({ has: page.getByRole('link').filter({ hasText: a.summary.key }) });
            await expect(grip).toBeEnabled();
            await expect(page.locator('.cdk-drag-animating, .cdk-drop-list-dragging')).toHaveCount(0);
            const ranked = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/v1/issues/${b.summary.id}/backlog-order`);
            const from = await grip.boundingBox(), to = await target.boundingBox();
            if (!from || !to)
                throw new Error('Missing backlog row geometry');
            // Sorting moves the neighboring row away. Release at its original list position,
            // rather than following that row as a cross-column board helper would do.
            await page.mouse.move(from.x + 12, from.y + 16);
            await page.mouse.down();
            await page.mouse.move(from.x + 20, from.y + 4, { steps: 3 });
            await page.mouse.move(to.x + 60, destinationIndex === 0 ? to.y + 10 : to.y + to.height - 10, { steps: 15 });
            await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
            await page.mouse.up();
            expect((await ranked).status()).toBe(200);
            await expect(list.locator('.planned-work small')).toHaveText([...expected]);
            const refreshed = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === `/api/v1/projects/${projectId}/backlog`);
            await page.getByRole('button', { name: 'Refresh backlog', exact: true }).click();
            expect((await refreshed).status()).toBe(200);
            await expect(page.getByRole('button', { name: 'Refresh backlog', exact: true })).toBeEnabled();
            await expect(list.locator('.planned-work small')).toHaveText([...expected]);
            expect((await cards(request, await coverageLayout(request, activeBoard.board.id))).map(issue => issue.id)).toEqual(activeOrder);
        }, 'web');
    }
    await useCase('UC-BLG-0008', async () => { await page.getByRole('button', { name: 'New issue', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true }); await dialog.getByLabel('Issue title', { exact: true }).fill('Discarded backlog draft'); page.once('dialog', confirmation => confirmation.accept()); await dialog.getByRole('button', { name: 'Close create issue', exact: true }).click(); await expect(dialog).not.toBeVisible(); await expect(page.getByRole('button', { name: 'New issue', exact: true })).toBeFocused(); expect((await coverageGet(request, `/api/v1/projects/${projectId}/backlog`, zBacklogPage)).totalMatching).toBe(2); }, 'web');
    await useCase('UC-BLG-0006', async () => {
        await page.getByRole('button', { name: 'New issue', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
        await dialog.getByLabel('Issue title', { exact: true }).fill('Created planned browser work');
        const submitted = page.waitForRequest(value => value.method() === 'POST' && new URL(value.url()).pathname === `/api/v2/projects/${projectId}/issues`);
        await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
        // The real create itself is planned, so no later organization request can
        // expose an intermediate active issue to another board reader.
        expect((await submitted).postDataJSON().backlog).toBe(true);
        await expect(list).toContainText('Created planned browser work');
        const current = await coverageGet(request, `/api/v1/projects/${projectId}/backlog`, zBacklogPage);
        const planned = current.items.find(value => value.title === 'Created planned browser work');
        expect(planned?.backlog).toBe(true);
        const active = await cards(request, await coverageLayout(request, activeBoard.board.id));
        expect(active.map(issue => issue.id)).toEqual(activeOrder);
        expect(active.map(issue => issue.id)).not.toContain(planned?.id);
    }, 'web');
    await useCase('UC-BLG-0018', async () => {
        let releaseSecond!: () => void;
        const second = new Promise<void>(resolve => { releaseSecond = resolve; });
        const secondPath = `/api/v1/issues/${b.summary.id}/organize`;
        await page.route(url => url.pathname === secondPath, async route => { await second; await route.continue(); });
        try {
            await selectA.check();
            await page.getByRole('checkbox', { name: 'Select ' + b.summary.key, exact: true }).check();
            await page.getByRole('button', { name: 'Move 2 to board', exact: true }).click();
            await expect(page.getByRole('status').filter({ hasText: /^1 moved to the board\.$/ })).toBeVisible();
            await expect(list.getByRole('link').filter({ hasText: a.summary.key })).toHaveCount(0);
            await expect(list.getByRole('link').filter({ hasText: b.summary.key })).toBeVisible();
            expect((await coverageReadIssue(request, a.summary.id)).summary.backlog).toBe(false);
            expect((await coverageReadIssue(request, b.summary.id)).summary.backlog).toBe(true);
            releaseSecond();
            await expect(page.getByRole('status').filter({ hasText: /^2 moved to the board\.$/ })).toBeVisible();
            await expect(list.locator('.planned-work small')).toHaveCount(1);
            expect((await coverageReadIssue(request, b.summary.id)).summary.backlog).toBe(false);
        } finally { releaseSecond(); await page.unroute(url => url.pathname === secondPath); }
    }, 'web');
    await signIn(page, 'viewer', `/backlog/${projectId}`, /^Backlog$/);
    await useCase('UC-BLG-0021', async () => { await expect(list).toContainText('Created planned browser work'); await expect(page.getByRole('button', { name: 'New issue', exact: true })).toHaveCount(0); await expect(page.locator('.drag-handle')).toHaveCount(0); await expect(page.getByRole('checkbox', { name: 'Select loaded (up to 100)', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: /^(Move .*to board|Rank .* (earlier|later))$/ })).toHaveCount(0); }, 'web');
});
test('backlog partial activation preserves confirmed items and stage assignment runs atomically', async ({ request, page }) => {
    const projectId = await coverageProject(request), board = await coverageBoard(request, projectId), todo = board.columns.flatMap(column => column.stages).find(value => value.stage.category === 'todo')?.stage;
    if (!todo)
        throw new Error('Missing To do');
    await coverageWrite(request, 'PUT', `/api/v1/projects/${projectId}/automation-rules/${crypto.randomUUID()}`, { expectedRevision: '0', name: 'Backlog intake owner', stageId: todo.id, assigneeId: memberId, enabled: true }, (await import('../src/app/api/generated/zod.gen')).zSavedAutomationRuleView, 201);
    const a = await coverageIssue(request, projectId, { title: 'Partial activation A', backlog: true }), b = await coverageIssue(request, projectId, { title: 'Partial activation B', backlog: true });
    await signIn(page, 'member', `/backlog/${projectId}`, /^Backlog$/);
    await useCase('UC-BLG-0019', async () => {
        await page.route(`**/api/v1/issues/${b.summary.id}/organize`, route => route.abort('failed'), { times: 1 });
        await page.getByRole('checkbox', { name: 'Select loaded (up to 100)', exact: true }).check();
        await page.getByRole('button', { name: 'Move 2 to board', exact: true }).click();
        await expect(page.getByRole('list', { name: 'Ranked backlog' }).locator('.planned-work small')).toHaveText([b.summary.key]);
        await expect(page.getByRole('alert')).toBeVisible();
        expect((await coverageReadIssue(request, a.summary.id)).summary.backlog).toBe(false);
        expect((await coverageReadIssue(request, b.summary.id)).summary.backlog).toBe(true);
        await page.getByRole('button', { name: 'Move 1 to board', exact: true }).click();
        await expect(page.getByRole('list', { name: 'Ranked backlog' }).getByRole('listitem')).toHaveCount(0);
        expect((await coverageReadIssue(request, b.summary.id)).summary.backlog).toBe(false);
    }, 'web');
    await useCase('UC-BLG-0020', async () => {
        // A fresh planned item proves the assignment happens on activation, not on backlog creation.
        const planned = await coverageIssue(request, projectId, { title: 'Assignment on activation', backlog: true });
        expect(planned.summary.assignee).toBeNull();
        const activated = await coverageWrite(request, 'POST', `/api/v1/issues/${planned.summary.id}/organize`, { expectedRevision: planned.summary.revision, backlog: false }, zSavedIssueView, 200, 'member');
        expect(activated.result.summary.assignee?.id).toBe(memberId);
        expect((await coverageReadIssue(request, planned.summary.id)).summary.backlog).toBe(false);
    }, 'rest');
});
test('backlog project changes discard old pending reads and selection', async ({ request, page }) => {
    const projectA = await coverageProject(request), projectB = await coverageProject(request), a = await coverageIssue(request, projectA, { title: 'Pending project A', backlog: true }), b = await coverageIssue(request, projectB, { title: 'Current project B', backlog: true });
    await signIn(page, 'member', `/backlog/${projectA}`, /^Backlog$/);
    let held = false, returned = false, release = (): void => { };
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/api/v1/projects/${projectA}/backlog?*`, async (route) => { const response = await route.fetch(); held = true; await gate; await route.fulfill({ response }); returned = true; });
    await useCase('UC-BLG-0034', async () => {
        await page.getByRole('checkbox', { name: 'Select ' + a.summary.key, exact: true }).check();
        await page.getByRole('button', { name: 'Refresh backlog', exact: true }).click();
        await expect.poll(() => held).toBe(true);
        try {
            await page.evaluate(projectId => { history.pushState({}, '', '/backlog/' + projectId); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }, projectB);
            await expect(page.getByRole('list', { name: 'Ranked backlog' }).locator('.planned-work small')).toHaveText([b.summary.key]);
        }
        finally {
            release();
        }
        await expect.poll(() => returned).toBe(true);
        await expect(page.getByRole('list', { name: 'Ranked backlog' })).toContainText(b.summary.title);
        await expect(page.getByRole('list', { name: 'Ranked backlog' })).not.toContainText(a.summary.title);
        await expect(page.getByRole('checkbox', { name: 'Select ' + b.summary.key, exact: true })).not.toBeChecked();
        await expect(page.getByRole('button', { name: 'Move to board', exact: true })).toBeDisabled();
    }, 'web');
});
test('card ordering, moving and retry preserve independent board ranks and revision conflicts', async ({ request }) => {
    const projectId = await coverageProject(request), board = await coverageBoard(request, projectId), other = await coverageBoard(request, projectId, 'Other order');
    const first = await coverageIssue(request, projectId, { title: 'First rank' }), second = await coverageIssue(request, projectId, { title: 'Second rank' });
    let current = await coverageLayout(request, board.board.id);
    const todo = current.columns.find(column => column.stages.some(mapping => mapping.stage.category === 'todo'));
    const review = current.columns.find(column => column.stages.some(mapping => mapping.stage.category === 'review'));
    if (!todo || !review)
        throw new Error('Missing columns');
    await useCase('UC-BRD-0052', async () => {
        const fields = moveFields(current, second, todo.id);
        fields.neighborIssueId = first.summary.id;
        fields.placement = 'before';
        await coverageWrite(request, 'POST', `/api/v2/boards/${board.board.id}/cards/reorder`, fields, zSavedNativeMoveResult, 200, 'member');
        current = await coverageLayout(request, board.board.id);
        expect((await cards(request, current)).map(value => value.id)).toEqual([second.summary.id, first.summary.id]);
        expect((await cards(request, other)).map(value => value.id)).toEqual([first.summary.id, second.summary.id]);
    }, 'rest');
    await useCase('UC-BRD-0053', async () => {
        const fields = moveFields(current, await coverageReadIssue(request, second.summary.id), todo.id);
        fields.neighborIssueId = first.summary.id;
        fields.placement = 'after';
        await coverageWrite(request, 'POST', `/api/v2/boards/${board.board.id}/cards/reorder`, fields, zSavedNativeMoveResult, 200, 'member');
        current = await coverageLayout(request, board.board.id);
        expect((await cards(request, current)).map(value => value.id)).toEqual([first.summary.id, second.summary.id]);
    }, 'rest');
    const staleFields = moveFields(current, await coverageReadIssue(request, second.summary.id), review.id);
    await useCase('UC-BRD-0080', async () => {
        const reference = crypto.randomUUID(), fields = moveFields(current, await coverageReadIssue(request, second.summary.id), review.id);
        const accepted = await coverageWrite(request, 'POST', `/api/v2/boards/${board.board.id}/cards/move`, fields, zSavedNativeMoveResult, 200, 'member', reference);
        const replay = await coverageWrite(request, 'POST', `/api/v2/boards/${board.board.id}/cards/move`, fields, zSavedNativeMoveResult, 200, 'member', reference);
        expect(replay.receipt.replayed).toBe(true);
        expect(replay.result).toEqual(accepted.result);
        expect(accepted.result.issue.summary.stage.category).toBe('review');
    }, 'rest');
    await useCase('UC-BRD-0081', async () => {
        await coverageFailure(await request.post(apiOrigin + `/api/v2/boards/${board.board.id}/cards/move`, { headers: await coverageHeaders('member'), data: staleFields }), 409, 'conflict');
        expect((await coverageReadIssue(request, second.summary.id)).summary.stage.category).toBe('review');
    }, 'rest');
});
test('backlog contract covers empty state, paging, precise reorders, stale cursors and invalid anchors', async ({ request }) => {
    const projectId = await coverageProject(request), path = `/api/v1/projects/${projectId}/backlog`;
    await test.step('service precondition for UC-BLG-0005', async () => { expect(await coverageGet(request, path, zBacklogPage)).toMatchObject({ items: [], totalMatching: 0, nextCursor: null }); });
    const a = await coverageIssue(request, projectId, { title: 'خطة عربية', backlog: true }), b = await coverageIssue(request, projectId, { title: 'Planned B', backlog: true }), c = await coverageIssue(request, projectId, { title: 'Planned C', backlog: true });
    const active = await coverageIssue(request, projectId, { title: 'Active anchor' });
    const list = await coverageGet(request, path, zBacklogPage);
    await useCase('UC-BLG-0001', async () => { const read = await coverageGet(request, path, zBacklogPage, 'viewer'); expect(read.items.map(value => value.id)).toEqual([a.summary.id, b.summary.id, c.summary.id]); }, 'rest');
    await test.step('service precondition for UC-BLG-0002', async () => { const read = await coverageGet(request, path, zBacklogPage); expect(read.modernItems?.[0]).toMatchObject({ id: a.summary.id, title: a.summary.title, backlog: true, archived: false }); expect(read.orderRevision).toMatch(/^[1-9][0-9]*$/); });
    await useCase("UC-BLG-0041", async () => { const read = await coverageGet(request, path, zBacklogPage); expect(read.modernItems?.find(value => value.id === a.summary.id)?.title).toBe('خطة عربية'); }, 'rest');
    const firstPage = await coverageGet(request, path + '?limit=1', zBacklogPage);
    await useCase("UC-BLG-0037", async () => {
        expect(firstPage.items).toHaveLength(1);
        expect(firstPage.nextCursor).not.toBeNull();
        const next = await coverageGet(request, path + '?limit=1&cursor=' + encodeURIComponent(firstPage.nextCursor!), zBacklogPage);
        expect(next.items.map(value => value.id)).toEqual([b.summary.id]);
    }, 'rest');
    const reorder = { expectedRevision: c.summary.revision, expectedOrderRevision: list.orderRevision, neighborId: a.summary.id, before: true };
    await coverageWrite(request, 'POST', `/api/v1/issues/${c.summary.id}/backlog-order`, reorder, zSavedBacklogChange, 200, 'member');
    await useCase('UC-BLG-0029', async () => {
        await coverageFailure(await request.post(apiOrigin + `/api/v1/issues/${b.summary.id}/backlog-order`, { headers: await coverageHeaders('member'), data: { ...reorder, expectedRevision: b.summary.revision } }), 409, 'conflict');
        expect((await coverageGet(request, path, zBacklogPage)).items.map(value => value.id)).toEqual([c.summary.id, a.summary.id, b.summary.id]);
    }, 'rest');
    await useCase('UC-BLG-0030', async () => { await coverageFailure(await request.get(apiOrigin + path + '?limit=1&cursor=' + encodeURIComponent(firstPage.nextCursor!), { headers: await coverageHeaders() })); }, 'rest');
    const latest = await coverageGet(request, path, zBacklogPage);
    for (const [id, issue, neighborId, role, status, code] of [
        ['UC-BLG-0022', b, a.summary.id, 'viewer', 403, 'forbidden'], ['UC-BLG-0024', b, b.summary.id, 'member', 422, 'validation_failed'],
        ['UC-BLG-0025', active, a.summary.id, 'member', 422, 'validation_failed'], ['UC-BLG-0027', b, active.summary.id, 'member', 422, 'validation_failed'],
    ] as const) {
        await useCase(id, async () => {
            await coverageFailure(await request.post(apiOrigin + `/api/v1/issues/${issue.summary.id}/backlog-order`, { headers: await coverageHeaders(role), data: { expectedRevision: issue.summary.revision, expectedOrderRevision: latest.orderRevision, neighborId, before: true } }), status, code);
            expect((await coverageGet(request, path, zBacklogPage)).items.map(value => value.id)).toEqual([c.summary.id, a.summary.id, b.summary.id]);
        }, 'rest');
    }
    const foreignProject = await coverageProject(request), foreign = await coverageIssue(request, foreignProject, { title: 'Foreign anchor', backlog: true });
    await useCase('UC-BLG-0028', async () => {
        await coverageFailure(await request.post(apiOrigin + `/api/v1/issues/${b.summary.id}/backlog-order`, { headers: await coverageHeaders('member'), data: { expectedRevision: b.summary.revision, expectedOrderRevision: latest.orderRevision, neighborId: foreign.summary.id, before: true } }), 404, 'unavailable_record');
    }, 'rest');
    await useCase('UC-BLG-0017', async () => {
        const saved = await coverageWrite(request, 'POST', `/api/v1/issues/${a.summary.id}/organize`, { expectedRevision: a.summary.revision, backlog: false }, zSavedIssueView, 200, 'member');
        expect((await coverageReadIssue(request, a.summary.id)).summary.backlog).toBe(false);
        expect((await coverageGet(request, path, zBacklogPage)).items.some(value => value.id === a.summary.id)).toBe(false);
    }, 'rest');
    await useCase('UC-BLG-0026', async () => {
        await coverageWrite(request, 'POST', `/api/v1/issues/${b.summary.id}/organize`, { expectedRevision: b.summary.revision, archived: true }, zSavedIssueView, 200, 'member');
        const current = await coverageReadIssue(request, b.summary.id), currentList = await coverageGet(request, path, zBacklogPage);
        await coverageFailure(await request.post(apiOrigin + `/api/v1/issues/${b.summary.id}/backlog-order`, { headers: await coverageHeaders('member'), data: { expectedRevision: current.summary.revision, expectedOrderRevision: currentList.orderRevision, neighborId: c.summary.id, before: true } }));
    }, 'rest');
});
test('many-column boards bound initial fan-out and load moved or scrolled destinations explicitly', async ({ request, page }) => {
    const projectId = await isolatedProject(request), boards = await coverageGet(request, `/api/v1/projects/${projectId}/boards`, zPageBoardSummary), defaultBoard = boards.items.find(value => value.default);
    if (!defaultBoard)
        throw new Error('Missing default board');
    const view = await addFixtureStages(request, defaultBoard.id, ['Later QA 1', 'Later QA 2', 'Later QA 3', 'Later QA 4', 'Later QA 5', 'Later QA 6']);
    await useModernIssues(projectId);
    const target = view.columns.at(-1), middle = view.columns[5];
    if (!target || !middle)
        throw new Error('Missing distant columns');
    const first = await coverageIssue(request, projectId, { title: 'Move to unvisited column' });
    const lazy = await coverageIssue(request, projectId, { title: 'Lazy middle work' });
    await coverageWrite(request, 'POST', `/api/v2/issues/${lazy.summary.id}/move`, { expectedRevision: lazy.summary.revision, targetStageId: middle.stages[0]!.stage.id }, zSavedModernIssueView, 200, 'member');
    const reads: string[] = [];
    let active = 0, maximum = 0, release = (): void => { };
    const gate = new Promise<void>(resolve => { release = resolve; });
    let initial = true;
    await page.route(`**/api/v2/boards/${view.board.id}/columns/*/search`, async (route) => {
        reads.push(new URL(route.request().url()).pathname.split('/').at(-2)!);
        active++;
        maximum = Math.max(maximum, active);
        try {
            const response = await route.fetch();
            if (initial)
                await gate;
            await route.fulfill({ response });
        }
        finally {
            active--;
        }
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await signIn(page, 'owner', `/boards/${view.board.id}`, /^All Issues$/);
    await useCase('UC-BRD-0086', async () => {
        try {
            await expect.poll(() => reads.length).toBe(3);
            expect(maximum).toBe(3);
        }
        finally {
            initial = false;
            release();
        }
        await expect.poll(() => view.columns.slice(0, 4).every(column => reads.includes(column.id))).toBe(true);
        expect(maximum).toBe(3);
        await expect(page.locator('gg-native-issue-card')).toHaveCount(1);
    }, 'web');
    await useCase('UC-BRD-0090', async () => {
        expect(reads).not.toContain(target.id);
        const card = page.locator(`gg-native-issue-card[data-issue-id="${first.summary.id}"]`);
        await card.locator('summary').click();
        await card.getByRole('combobox', { name: 'Destination column', exact: true }).selectOption(target.id);
        await card.getByRole('button', { name: 'Choose destination', exact: true }).click();
        await expect.poll(() => reads.includes(target.id)).toBe(true);
        expect((await coverageReadIssue(request, first.summary.id)).summary.stage.id).toBe(target.stages[0]?.stage.id);
    }, 'web');
    await page.setViewportSize({ width: 390, height: 844 });
    const jump = page.getByRole('combobox', { name: 'Jump to column', exact: true });
    await useCase('UC-BRD-0087', async () => {
        expect(reads).not.toContain(middle.id);
        await jump.selectOption(middle.id);
        await expect.poll(() => reads.includes(middle.id)).toBe(true);
        await expect(page.locator(`.kanban-column[data-column-id="${middle.id}"]`)).toContainText('Lazy middle work');
    }, 'web');
    await useCase('UC-BRD-0085', async () => {
        await jump.selectOption(view.columns[0]!.id);
        await expect.poll(() => page.locator('.kanban-scroll').evaluate(element => element.scrollLeft)).toBeLessThan(3);
        await jump.selectOption(target.id);
        await expect.poll(() => page.locator('.kanban-scroll').evaluate(element => element.scrollLeft)).toBeGreaterThan(1500);
        await expect(jump).toHaveValue(target.id);
    }, 'web');
});
test('project navigation follows the default board beyond the first directory page', async ({ request, page }) => {
    const projectId = await coverageProject(request), initial = await coverageGet(request, `/api/v1/projects/${projectId}/boards`, zPageBoardSummary), defaultBoard = initial.items.find(value => value.default);
    if (!defaultBoard)
        throw new Error('Missing default board');
    for (let index = 0; index < 26; index++)
        await coverageBoard(request, projectId, 'A' + String(index).padStart(3, '0') + ' earlier named board');
    const firstPage = await coverageGet(request, `/api/v1/projects/${projectId}/boards?limit=25`, zPageBoardSummary);
    expect(firstPage.items.some(value => value.default)).toBe(false);
    expect(firstPage.nextCursor).not.toBeNull();
    await useCase('UC-SHL-0080', async () => {
        await signIn(page, 'member', `/projects/${projectId}`, /^Isolated workflow/);
        const boardLink = page.getByRole('navigation', { name: 'Project navigation', exact: true }).getByRole('link', { name: 'Board', exact: true });
        await expect(boardLink).toHaveAttribute('href', '/boards/' + defaultBoard.id);
        await boardLink.click();
        await expect(page).toHaveURL(new RegExp('/boards/' + defaultBoard.id + '$'));
        await expect(page.getByRole('heading', { name: 'All Issues', exact: true })).toBeVisible();
    }, 'web');
});
test('visible-column observers share the three-reader queue after the initial board warmup', async ({ request, page }) => {
    const projectId = await isolatedProject(request), boards = await coverageGet(request, `/api/v1/projects/${projectId}/boards`, zPageBoardSummary), board = boards.items.find(value => value.default);
    if (!board)
        throw new Error('Missing default board');
    await addFixtureStages(request, board.id, Array.from({ length: 12 }, (_, index) => 'Queued column ' + (index + 1)));
    await useModernIssues(projectId);
    await coverageIssue(request, projectId, { title: 'Wide observer work' });
    await page.setViewportSize({ width: 390, height: 900 });
    await signIn(page, 'owner', `/boards/${board.id}`, /^All Issues$/);
    await expect(page.getByRole('searchbox', { name: 'Search this board', exact: true })).toHaveAttribute('aria-busy', 'false');
    let requests = 0, completed = 0, active = 0, maximum = 0, release = (): void => { };
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/api/v2/boards/${board.id}/columns/*/search`, async (route) => {
        requests++;
        active++;
        maximum = Math.max(maximum, active);
        try {
            const response = await route.fetch();
            await gate;
            await route.fulfill({ response });
            completed++;
        }
        finally {
            active--;
        }
    });
    try {
        await page.setViewportSize({ width: 6400, height: 900 });
        await expect.poll(() => requests).toBe(3);
        expect(maximum).toBe(3);
    }
    finally {
        release();
    }
    await expect.poll(() => completed).toBe(12);
    expect(requests).toBe(12);
    expect(maximum).toBe(3);
    await expect(page.locator('gg-native-issue-card')).toHaveCount(1);
});
test('a scoped project administrator can discover Automation and open its management page', async ({ request, page }) => {
    const projectId = await coverageProject(request);
    await coverageWrite(request, 'PUT', `/api/v1/projects/${projectId}/memberships/${memberId}`, { expectedRevision: '1', role: 'project_admin' }, zSavedMembershipView);
    await useCase('UC-SHL-0081', async () => {
        await signIn(page, 'member', `/projects/${projectId}`, /^Isolated workflow/);
        const automation = page.getByRole('navigation', { name: 'Project navigation', exact: true }).getByRole('link', { name: 'Automation', exact: true });
        await expect(automation).toHaveAttribute('href', `/projects/${projectId}/automation`);
        await automation.click();
        await expect(page).toHaveURL(new RegExp('/projects/' + projectId + '/automation$'));
        await expect(page.getByRole('heading', { name: 'Automation', exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Create assignment rule', exact: true })).toBeEnabled();
    }, 'web');
});
test('empty backlog explains planned work and populated rows display their actual issue metadata', async ({ page, request }) => {
    const projectId = await coverageProject(request);
    await signIn(page, 'member', `/backlog/${projectId}`, /^Backlog$/);
    await useCase('UC-BLG-0005', async () => { await expect(page.getByRole('heading', { name: 'Make room for the next idea', exact: true })).toBeVisible(); await expect(page.getByText(/Create planned work here, or send an unstarted issue to the backlog/)).toBeVisible(); await expect(page.getByRole('list', { name: 'Ranked backlog' }).getByRole('listitem')).toHaveCount(0); }, 'web');
    const label = (await coverageWrite(request, 'POST', `/api/v1/projects/${projectId}/labels`, { name: 'خطة مهمة' }, zSavedLabelView, 201, 'member')).result;
    const blocker = await coverageIssue(request, projectId, { title: 'Metadata blocker' }), planned = await coverageIssue(request, projectId, { title: 'Metadata planned', backlog: true, assigneeId: memberId, dueDate: '2000-01-01', labelIds: [label.id] });
    await coverageWrite(request, 'POST', `/api/v1/issues/${planned.summary.id}/dependencies`, { blockerId: blocker.summary.id, expectedIssueRevision: planned.summary.revision, expectedGraphRevision: planned.graphRevision }, zSavedDependencyView, 200, 'member');
    await page.getByRole('button', { name: 'Refresh backlog', exact: true }).click();
    await useCase('UC-BLG-0002', async () => { const row = page.getByRole('list', { name: 'Ranked backlog' }).getByRole('listitem'); await expect(row).toContainText(planned.summary.key); await expect(row).toContainText(planned.summary.title); await expect(row.locator('.status-badge')).toHaveText('To do'); await expect(row).toContainText('مطور تجريبي'); await expect(row.locator('.overdue')).toHaveText('Due 2000-01-01'); await expect(row.locator('.blocked')).toHaveText('Blocked'); await expect(row.locator('.label-chip')).toHaveText('خطة مهمة'); }, 'web');
});

test('a new personal quick-filter save clears the previous success notice while its acknowledgement is delayed',async({page,request})=>{
 const projectId=await coverageProject(request),board=await coverageBoard(request,projectId);await signIn(page,'member',`/boards/${board.board.id}`,/^Coverage board$/);const manager=page.locator('gg-board-quick-filters');await manager.locator('summary').click();await manager.getByLabel('Quick filter name',{exact:true}).fill('First latency filter');await manager.getByRole('button',{name:'Save current filters',exact:true}).click();await expect(manager.getByText('Personal quick filter saved.',{exact:true})).toBeVisible();
 let accepted=false,returned=false,release=()=>{};const gate=new Promise<void>(done=>{release=done;});await page.route('**/api/v1/issue-searches/*',async route=>{const response=await route.fetch();expect(response.status()).toBe(200);accepted=true;await gate;await route.fulfill({response});returned=true;},{times:1});
 await useCase('UC-BRD-0093',async()=>{try{await manager.getByLabel('Quick filter name',{exact:true}).fill('Second latency filter');await manager.getByRole('button',{name:'Save current filters',exact:true}).click();await expect.poll(()=>accepted).toBe(true);await expect(manager.getByText('Personal quick filter saved.',{exact:true})).not.toBeVisible();await expect(manager.getByRole('button',{name:'Save current filters',exact:true})).toBeDisabled();}finally{release();}await expect.poll(()=>returned).toBe(true);await expect(manager.getByText('Personal quick filter saved.',{exact:true})).toBeVisible();await expect(manager.getByRole('button',{name:'Second latency filter',exact:true})).toBeVisible();},'web');
});

test('rapid expanded-filter typing emits one final board read and preserves the complete input',async({page,request})=>{
 const projectId=await coverageProject(request),board=await coverageBoard(request,projectId),issue=await coverageIssue(request,projectId,{title:'Typing final selection'});await signIn(page,'member',`/boards/${board.board.id}`,/^Coverage board$/);await expect(page.locator('gg-native-issue-card')).toHaveCount(1);await page.locator('details.board-filters > summary').click();const input=page.getByRole('searchbox',{name:'Title, key or number',exact:true});
 await page.clock.install();let metadataReads=0;page.on('request',r=>{if(r.method()==='GET'&&new URL(r.url()).pathname===`/api/v2/boards/${board.board.id}`)metadataReads++;});
 await useCase('UC-BRD-0094',async()=>{await input.pressSequentially('Typing final');await expect(input).toHaveValue('Typing final');expect(metadataReads).toBe(0);await page.clock.runFor(150);await expect.poll(()=>metadataReads).toBe(1);await expect(page.locator('gg-native-issue-card')).toHaveCount(1);await expect(page.locator('gg-native-issue-card')).toContainText(issue.summary.key);await expect(input).toHaveValue('Typing final');},'web');
});

test('same-SPA account switch clears a restored private board layout draft',async({page,request})=>{
 const projectId=await coverageProject(request),board=await coverageBoard(request,projectId);await signIn(page,'member',`/boards/${board.board.id}/settings`,/^Board settings$/);await page.getByLabel('Board name',{exact:true}).fill('Previous account board draft');await page.getByRole('textbox',{name:'Column 1',exact:true}).fill('Previous account column draft');
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('link',{name:'Issues',exact:true}).click();await expect(page.getByRole('heading',{name:'Issues',exact:true})).toBeVisible();await expect(page).toHaveURL(/\/issues$/);await page.goBack();await expect(page).toHaveURL(new RegExp('/boards/'+board.board.id+'/settings$'));await expect(page.getByLabel('Board name',{exact:true})).toHaveValue('Previous account board draft');await expect(page.getByRole('textbox',{name:'Column 1',exact:true})).toHaveValue('Previous account column draft');
 await useCase('UC-SHL-0089',async()=>{await coverageSwitchAccount(page,'owner',`/boards/${board.board.id}/settings`);await expect(page.getByLabel('Board name',{exact:true})).toHaveValue(board.board.name);await expect(page.getByRole('textbox',{name:'Column 1',exact:true})).toHaveValue(board.columns[0]!.name);expect((await coverageLayout(request,board.board.id)).board.name).toBe(board.board.name);},'web');
});
