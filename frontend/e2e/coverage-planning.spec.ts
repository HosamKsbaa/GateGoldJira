import { isolatedProject, useModernIssues } from './support/project';
import { addFixtureStages } from './support/workflow-fixture';
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { coverageBoard, coverageSwitchAccount, coverageFailure, coverageGet, coverageHeaders, coverageIssue, coverageProject, coverageReadIssue, coverageWrite, coverageRetireHistoricalStage, coverageConfiguration } from './support/coverage-boards';
import { zIssuePlanningView, zKanbanReport, zPageAutomationRuleView, zPageDevelopmentLinkView, zPagePlanningIssueSummary, zPagePlanningItemView, zSavedAutomationRuleView, zSavedDevelopmentLinkView, zSavedIssuePlanningView, zSavedIssueView, zSavedModernIssueView, zSavedPlanningItemView, zSavedMembershipView, zModernIssueView, zPageUserSummary, zSavedDependencyView, zSavedWorkflowSaved, zSavedStageSaved, zSavedNativeMoveResult, zSavedBoardSummary, } from '../src/app/api/generated/zod.gen';
import type { AutomationRuleFields, DevelopmentLinkFields, IssuePlanningView, PlanningCreateFields, PlanningItemView } from '../src/app/api/generated/types.gen';
test.skip(!localFixturesAvailable, 'Requires isolated Go/PostgreSQL fixtures.');
test.use({ trace: 'off' });
const memberId = '10000000-0000-4000-8000-000000000002';
const viewerId = '10000000-0000-4000-8000-000000000003';
async function createPlanning(request: APIRequestContext, projectId: string, fields: Partial<PlanningCreateFields> = {}) {
    return (await coverageWrite(request, 'POST', `/api/v1/projects/${projectId}/planning`, { kind: 'epic', name: 'Coverage epic', description: '', targetDate: null, status: 'planned', ...fields }, zSavedPlanningItemView, 201, 'member')).result;
}
async function updatePlanning(request: APIRequestContext, item: PlanningItemView, fields: Partial<PlanningItemView>) {
    return (await coverageWrite(request, 'PUT', `/api/v1/projects/${item.projectId}/planning/${item.id}`, { expectedRevision: item.revision, name: item.name, description: item.description, targetDate: item.targetDate, status: item.status, ...fields }, zSavedPlanningItemView, 200, 'member')).result;
}
async function issuePlanning(request: APIRequestContext, issueId: string) {
    return coverageGet(request, `/api/v1/issues/${issueId}/planning`, zIssuePlanningView, 'member');
}
async function assignPlanning(request: APIRequestContext, current: IssuePlanningView, epicId: string | null, releaseId: string | null) {
    return (await coverageWrite(request, 'PUT', `/api/v1/issues/${current.issueId}/planning`, { expectedRevision: current.revision, epicId, releaseId }, zSavedIssuePlanningView, 200, 'member')).result;
}
test('epic and release lifecycle handles each edit, exact statuses, paging and validation', async ({ request }) => {
    const projectId = await coverageProject(request), path = `/api/v1/projects/${projectId}/planning`;
    await test.step('service precondition for UC-PLN-0002', async () => {
        const list = await coverageGet(request, path, zPagePlanningItemView);
        expect(list).toMatchObject({ items: [], totalMatching: 0, nextCursor: null });
    });
    const created: PlanningItemView[] = [];
    for (const [kind, ids] of [
        ['epic', ['UC-PLN-0004', 'UC-PLN-0005', 'UC-PLN-0006', "UC-PLN-0083", "UC-PLN-0084", 'UC-PLN-0010', 'UC-PLN-0011', 'UC-PLN-0009']],
        ['release', ['UC-PLN-0012', 'UC-PLN-0013', 'UC-PLN-0014', "UC-PLN-0085", "UC-PLN-0086", 'UC-PLN-0018', 'UC-PLN-0019', 'UC-PLN-0017']],
    ] as const) {
        let item = await useCase(ids[0], async () => {
            const saved = await createPlanning(request, projectId, { kind, name: 'Coverage ' + kind });
            expect(saved).toMatchObject({ projectId, kind, status: 'planned', targetDate: null, issueCount: 0, completedCount: 0 });
            return saved;
        }, 'rest');
        item = await useCase(ids[1], async () => {
            const saved = await updatePlanning(request, item, { name: 'Renamed ' + kind });
            expect(saved.name).toBe('Renamed ' + kind);
            return saved;
        }, 'rest');
        item = await useCase(ids[2], async () => {
            const saved = await updatePlanning(request, item, { description: 'Detailed delivery intent ' + kind });
            expect(saved.description).toBe('Detailed delivery intent ' + kind);
            return saved;
        }, 'rest');
        item = await useCase(ids[3], async () => {
            const saved = await updatePlanning(request, item, { targetDate: '2027-02-28' });
            expect(saved.targetDate).toBe('2027-02-28');
            return saved;
        }, 'rest');
        item = await useCase(ids[4], async () => {
            const saved = await updatePlanning(request, item, { targetDate: null });
            expect(saved.targetDate).toBeNull();
            return saved;
        }, 'rest');
        for (const [index, status] of [[5, 'active'], [6, 'complete'], [7, 'planned']] as const) {
            item = await useCase(ids[index], async () => {
                const saved = await updatePlanning(request, item, { status });
                expect(saved.status).toBe(status);
                return saved;
            }, 'rest');
        }
        created.push(item);
    }
    await useCase("UC-PLN-0091", async () => {
        const saved = await createPlanning(request, projectId, { name: 'إطلاق البوابة', description: 'خطة التسليم العربية' });
        const listed = await coverageGet(request, path, zPagePlanningItemView);
        expect(listed.items.find(item => item.id === saved.id)).toMatchObject({ name: 'إطلاق البوابة', description: 'خطة التسليم العربية' });
    }, 'rest');
    await useCase('UC-PLN-0001', async () => {
        const list = await coverageGet(request, path, zPagePlanningItemView, 'viewer');
        expect(list.items).toHaveLength(3);
        expect(list.totalMatching).toBe(3);
    }, 'rest');
    await useCase("UC-PLN-0080", async () => {
        const first = await coverageGet(request, path + '?limit=1', zPagePlanningItemView);
        expect(first.items).toHaveLength(1);
        expect(first.nextCursor).not.toBeNull();
        const second = await coverageGet(request, path + '?limit=1&cursor=' + encodeURIComponent(first.nextCursor!), zPagePlanningItemView);
        expect(second.items).toHaveLength(1);
        expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    }, 'rest');
    for (const [id, kind] of [['UC-PLN-0025', 'epic'], ['UC-PLN-0026', 'release']] as const) {
        await useCase(id, async () => {
            const list = await coverageGet(request, path + '?kind=' + kind, zPagePlanningItemView);
            expect(list.items.length).toBeGreaterThan(0);
            expect(list.items.every(item => item.kind === kind)).toBe(true);
        }, 'rest');
    }
    const item = created[0];
    if (!item)
        throw new Error('Missing epic');
    await useCase('UC-PLN-0072', async () => {
        const saved = await updatePlanning(request, item, {});
        expect(saved.revision).toBe(item.revision);
        expect(saved.updatedAt).toBe(item.updatedAt);
    }, 'rest');
    await useCase('UC-PLN-0071', async () => {
        const changed = await updatePlanning(request, item, { name: 'Concurrent authoritative title' });
        await coverageFailure(await request.put(apiOrigin + path + '/' + item.id, { headers: await coverageHeaders('member'), data: { expectedRevision: item.revision, name: 'Stale overwrite', description: '', status: item.status, targetDate: null } }), 409, 'conflict');
        const list = await coverageGet(request, path, zPagePlanningItemView);
        expect(list.items.find(value => value.id === item.id)?.name).toBe(changed.name);
    }, 'rest');
    for (const [id, fields] of [
        ['UC-PLN-0052', { name: '  ' }], ['UC-PLN-0053', { name: 'n'.repeat(101) }],
        ['UC-PLN-0054', { description: 'd'.repeat(2001) }], ['UC-PLN-0055', { targetDate: '2027-02-30' }],
        ['UC-PLN-0056', { status: 'cancelled' }], ['UC-PLN-0057', { kind: 'sprint' }],
    ] as const) {
        await useCase(id, async () => {
            await coverageFailure(await request.post(apiOrigin + path, { headers: await coverageHeaders('member'), data: { kind: 'epic', name: 'Valid', description: '', targetDate: null, status: 'planned', ...fields } }));
            expect((await coverageGet(request, path, zPagePlanningItemView)).totalMatching).toBe(3);
        }, 'rest');
    }
    await useCase("UC-PLN-0089", async () => {
        const read = await coverageGet(request, path, zPagePlanningItemView, 'viewer');
        expect(read.totalMatching).toBe(3);
        await coverageFailure(await request.post(apiOrigin + path, { headers: await coverageHeaders('viewer'), data: { kind: 'epic', name: 'Denied viewer creation', description: '', targetDate: null, status: 'planned' } }), 403, 'forbidden');
    }, 'rest');
});
test('revoked assignees and retained retired-stage rules cannot assign work', async ({ request }) => {
    for (const scenario of ['revoked', 'historical_retired'] as const) {
        const projectId = await coverageProject(request), board = await coverageBoard(request, projectId);
        const stage = board.columns.flatMap(column => column.stages).find(value => value.stage.category === (scenario === 'revoked' ? 'review' : 'todo'))?.stage;
        if (!stage)
            throw new Error('Missing rule stage');
        await coverageWrite(request, 'PUT', `/api/v1/projects/${projectId}/automation-rules/${crypto.randomUUID()}`, { expectedRevision: '0', name: 'Retained assignment', stageId: stage.id, assigneeId: memberId, enabled: true }, zSavedAutomationRuleView, 201);
        const issue = await coverageIssue(request, projectId, { title: 'Inert rule boundary', backlog: scenario === 'historical_retired' });
        if (scenario === 'revoked') {
            await useCase('UC-INT-0028', async () => {
                await coverageWrite(request, 'PUT', `/api/v1/projects/${projectId}/memberships/${memberId}`, { expectedRevision: '1', role: 'viewer' }, zSavedMembershipView);
                const moved = await coverageWrite(request, 'POST', `/api/v2/issues/${issue.summary.id}/move`, { expectedRevision: issue.summary.revision, targetStageId: stage.id }, zSavedModernIssueView);
                expect(moved.result.summary.assignee).toBeNull();
                const current = await coverageGet(request, `/api/v2/issues/${issue.summary.id}`, zModernIssueView);
                expect(current.summary.backlog).toBe(false);
                expect(current.summary.assignee).toBeNull();
            }, 'rest');
        }
        else {
            await useCase('UC-INT-0029', async () => {
                await coverageRetireHistoricalStage(projectId, stage.id);
                const activated = await coverageWrite(request, 'POST', `/api/v1/issues/${issue.summary.id}/organize`, { expectedRevision: issue.summary.revision, backlog: false }, zSavedIssueView);
                expect(activated.result.summary.assignee).toBeNull();
                const current = await coverageGet(request, `/api/v2/issues/${issue.summary.id}`, zModernIssueView);
                expect(current.summary.backlog).toBe(false);
                expect(current.summary.assignee).toBeNull();
            }, 'rest');
        }
    }
});
test('automation browser assignee paging, live search, stale replies, cancellation and narrow layout', async ({ request, page }) => {
    const projectId = await coverageProject(request), candidates = await coverageGet(request, `/api/v1/projects/${projectId}/assignees`, zPageUserSummary), member = candidates.items.find(value => value.id === memberId), owner = candidates.items.find(value => value.id !== memberId);
    if (!member || !owner)
        throw new Error('Missing eligible candidates');
    const cursors: string[] = [];
    let holdMember = false, held = false, release = (): void => { }, returned = false;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(`**/api/v1/projects/${projectId}/assignees?*`, async (route) => {
        const url = new URL(route.request().url());
        if (!url.searchParams.get('query') && !url.searchParams.get('cursor'))
            url.searchParams.set('limit', '1');
        if (url.searchParams.get('cursor'))
            cursors.push(url.searchParams.get('cursor')!);
        const response = await route.fetch({ url: url.toString() });
        expect(response.status()).toBe(200);
        if (holdMember && url.searchParams.get('query') === member.displayName) {
            held = true;
            await gate;
        }
        await route.fulfill({ response });
        if (holdMember && url.searchParams.get('query') === member.displayName)
            returned = true;
    });
    await signIn(page, 'owner', `/projects/${projectId}/automation`, /^Automation$/);
    await useCase('UC-INT-0016', async () => { await expect(page.getByRole('heading', { name: 'No assignment rules yet', exact: true })).toBeVisible(); await expect(page.getByText('For example, assign work entering Review to the person responsible for reviewing it.', { exact: true })).toBeVisible(); }, 'web');
    await page.getByRole('button', { name: 'Create assignment rule', exact: true }).click();
    const picker = page.locator('gg-searchable-picker'), input = picker.getByRole('combobox', { name: 'Assign to', exact: true });
    await useCase('UC-INT-0026', async () => {
        await input.click();
        await picker.getByRole('button', { name: 'Load more assign to choices', exact: true }).click();
        await expect(picker.getByRole('option', { name: member.displayName, exact: true })).toBeVisible();
        expect(cursors).toHaveLength(1);
    }, 'web');
    await useCase('UC-INT-0025', async () => {
        await input.fill(member.displayName);
        await expect(picker.getByRole('option', { name: member.displayName, exact: true })).toBeVisible();
        await expect(picker.getByRole('option', { name: owner.displayName, exact: true })).toHaveCount(0);
    }, 'web');
    await useCase('UC-INT-0051', async () => {
        await input.fill('');
        await expect(picker.getByRole('option')).toHaveCount(1);
        holdMember = true;
        try {
            await input.fill(member.displayName);
            await expect.poll(() => held).toBe(true);
            await input.fill(owner.displayName);
            await expect(picker.getByRole('option', { name: owner.displayName, exact: true })).toBeVisible();
        }
        finally {
            release();
        }
        await expect.poll(() => returned).toBe(true);
        await expect(input).toHaveAttribute('aria-busy', 'false');
        await expect(picker.getByRole('option', { name: member.displayName, exact: true })).toHaveCount(0);
    }, 'web');
    await page.getByRole('textbox', { name: 'Rule name', exact: true }).fill('Discard me');
    await useCase('UC-INT-0053', async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.getByRole('textbox', { name: 'Rule name', exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }, 'web');
    await useCase('UC-INT-0024', async () => {
        await page.locator('.editor').getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(page.locator('.editor')).toHaveCount(0);
        expect((await coverageGet(request, `/api/v1/projects/${projectId}/automation-rules`, zPageAutomationRuleView)).totalMatching).toBe(0);
    }, 'web');
});
test('automation stage discovery survives a default board outside the first directory page', async ({ request, page }) => {
    const projectId = await coverageProject(request);
    for (let index = 0; index < 26; index++)
        await coverageBoard(request, projectId, 'A' + String(index).padStart(3, '0') + ' earlier automation board');
    await useCase('UC-INT-0055', async () => {
        await signIn(page, 'owner', `/projects/${projectId}/automation`, /^Automation$/);
        await page.getByRole('button', { name: 'Create assignment rule', exact: true }).click();
        const stages = page.getByRole('combobox', { name: 'When issue enters', exact: true });
        await expect(stages.getByRole('option', { name: 'Review · Default workflow', exact: true })).toHaveCount(1);
        await expect(stages.getByRole('option')).toHaveCount(4);
    }, 'web');
});
test('automation discovers paged active intake stages independently of board mappings', async ({ request, page }) => {
    const projectId = await coverageProject(request), workflowId = crypto.randomUUID();
    const workflow = (await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/workflows/${workflowId}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, name: 'Future automation workflow', retired: false }, zSavedWorkflowSaved)).result.workflow;
    const availableId = crypto.randomUUID(), closedId = crypto.randomUUID();
    for (const [id, name, acceptsEntries] of [[availableId, 'Unmapped ready', true], [closedId, 'Closed future intake', false]] as const) {
        await coverageWrite(request, 'PUT', `/api/v2/projects/${projectId}/workflows/${workflowId}/stages/${id}`, { expectedRevision: (await coverageConfiguration(request, projectId)).revision, name, category: 'review', position: id === availableId ? '1' : '2', initial: false, acceptsEntries, retired: false }, zSavedStageSaved);
    }
    const cursors: string[] = [];
    await page.route(`**/api/v2/projects/${projectId}/workflows**`, async (route) => {
        if (route.request().method() !== 'GET') {
            await route.continue();
            return;
        }
        const url = new URL(route.request().url());
        url.searchParams.set('limit', '1');
        if (url.searchParams.get('cursor'))
            cursors.push(url.pathname + ':' + url.searchParams.get('cursor'));
        const response = await route.fetch({ url: url.toString() });
        expect(response.status()).toBe(200);
        await route.fulfill({ response });
    });
    const people = await coverageGet(request, `/api/v1/projects/${projectId}/assignees`, zPageUserSummary), person = people.items.find(value => value.id === memberId);
    if (!person)
        throw new Error('Missing assignee');
    await useCase('UC-INT-0058', async () => {
        await signIn(page, 'owner', `/projects/${projectId}/automation`, /^Automation$/);
        await page.getByRole('button', { name: 'Create assignment rule', exact: true }).click();
        const stages = page.getByRole('combobox', { name: 'When issue enters', exact: true });
        await expect(stages.getByRole('option', { name: 'Unmapped ready · ' + workflow.name, exact: true })).toHaveCount(1);
        await expect(stages.getByRole('option', { name: 'Closed future intake · ' + workflow.name, exact: true })).toHaveCount(0);
        expect(cursors.some(value => value.includes('/stages:'))).toBe(true);
        expect(cursors.some(value => /\/workflows:/.test(value))).toBe(true);
        await stages.selectOption(availableId);
        await page.getByLabel('Rule name', { exact: true }).fill('Unmapped stage assignment');
        await page.getByRole('combobox', { name: 'Assign to', exact: true }).fill(person.displayName);
        await page.getByRole('option', { name: person.displayName, exact: true }).getByRole('button').click();
        await page.getByRole('button', { name: 'Save assignment rule', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Unmapped stage assignment', exact: true })).toBeVisible();
        const rules = await coverageGet(request, `/api/v1/projects/${projectId}/automation-rules`, zPageAutomationRuleView);
        expect(rules.items[0]).toMatchObject({ stageId: availableId, enabled: true, assignee: { id: memberId } });
    }, 'web');
});
test('issue epic and release assignments preserve choices, no-ops and cross-project boundaries', async ({ request }) => {
    const projectId = await coverageProject(request), issue = await coverageIssue(request, projectId);
    const epicA = await createPlanning(request, projectId, { name: 'Epic A' }), epicB = await createPlanning(request, projectId, { name: 'Epic B' });
    const releaseA = await createPlanning(request, projectId, { name: 'Release A', kind: 'release' }), releaseB = await createPlanning(request, projectId, { name: 'Release B', kind: 'release' });
    let current = await useCase('UC-PLN-0027', async () => {
        const value = await issuePlanning(request, issue.summary.id);
        expect(value).toMatchObject({ issueId: issue.summary.id, revision: '0', epicId: null, releaseId: null, epicName: null, releaseName: null });
        return value;
    }, 'rest');
    for (const [id, epic, release] of [
        ["UC-PLN-0087", epicA, null], ['UC-PLN-0029', epicB, null], ['UC-PLN-0030', null, null],
        ["UC-PLN-0088", null, releaseA], ['UC-PLN-0032', null, releaseB], ['UC-PLN-0033', null, null],
    ] as const) {
        current = await useCase(id, async () => {
            const saved = await assignPlanning(request, current, epic?.id ?? null, release?.id ?? null);
            expect(saved).toMatchObject({ epicId: epic?.id ?? null, releaseId: release?.id ?? null, epicName: epic?.name ?? null, releaseName: release?.name ?? null });
            expect(await issuePlanning(request, issue.summary.id)).toEqual(saved);
            return saved;
        }, 'rest');
    }
    await test.step('service precondition for UC-PLN-0035', async () => {
        const saved = await assignPlanning(request, current, current.epicId, current.releaseId);
        expect(saved.revision).toBe(current.revision);
    });
    for (const [id, epicId, releaseId] of [['UC-PLN-0058', releaseA.id, null], ['UC-PLN-0059', null, epicA.id]] as const) {
        await useCase(id, async () => {
            await coverageFailure(await request.put(apiOrigin + `/api/v1/issues/${issue.summary.id}/planning`, { headers: await coverageHeaders('member'), data: { expectedRevision: current.revision, epicId, releaseId } }));
            expect(await issuePlanning(request, issue.summary.id)).toEqual(current);
        }, 'rest');
    }
    const foreignProject = await coverageProject(request), foreign = await createPlanning(request, foreignProject);
    await useCase('UC-PLN-0060', async () => {
        await coverageFailure(await request.put(apiOrigin + `/api/v1/issues/${issue.summary.id}/planning`, { headers: await coverageHeaders('member'), data: { expectedRevision: current.revision, epicId: foreign.id, releaseId: null } }), 404, 'unavailable_record');
        expect(await issuePlanning(request, issue.summary.id)).toEqual(current);
    }, 'rest');
    current = await assignPlanning(request, current, epicA.id, releaseA.id);
    for (const [id, planning] of [['UC-PLN-0021', epicA], ['UC-PLN-0022', releaseA]] as const) {
        await useCase(id, async () => {
            const linked = await coverageGet(request, `/api/v1/projects/${projectId}/planning/${planning.id}/issues`, zPagePlanningIssueSummary);
            expect(linked.items.map(value => value.id)).toEqual([issue.summary.id]);
            expect(linked.totalMatching).toBe(1);
        }, 'rest');
    }
    const second = await coverageIssue(request, projectId, { title: 'Second linked work' });
    await assignPlanning(request, await issuePlanning(request, second.summary.id), epicA.id, releaseA.id);
    await useCase("UC-PLN-0081", async () => {
        const path = `/api/v1/projects/${projectId}/planning/${epicA.id}/issues`;
        const first = await coverageGet(request, path + '?limit=1', zPagePlanningIssueSummary);
        expect(first.items).toHaveLength(1);
        expect(first.nextCursor).not.toBeNull();
        const next = await coverageGet(request, path + '?limit=1&cursor=' + encodeURIComponent(first.nextCursor!), zPagePlanningIssueSummary);
        expect(new Set([...first.items, ...next.items].map(value => value.id)).size).toBe(2);
    }, 'rest');
    await useCase('UC-PLN-0061', async () => {
        await coverageWrite(request, 'POST', `/api/v1/issues/${issue.summary.id}/organize`, { expectedRevision: issue.summary.revision, archived: true }, zSavedIssueView, 200, 'member');
        await coverageFailure(await request.put(apiOrigin + `/api/v1/issues/${issue.summary.id}/planning`, { headers: await coverageHeaders('member'), data: { expectedRevision: current.revision, epicId: epicB.id, releaseId: null } }));
        expect(await issuePlanning(request, issue.summary.id)).toEqual(current);
    }, 'rest');
});
test('Kanban reports use actual completions, reopened cycles and bounded date windows', async ({ request }) => {
    const projectId = await coverageProject(request), board = await coverageBoard(request, projectId);
    const doing = board.columns.flatMap(column => column.stages).find(mapping => mapping.stage.category === 'in_progress')?.stage;
    const done = board.columns.flatMap(column => column.stages).find(mapping => mapping.stage.category === 'done')?.stage;
    const todo = board.columns.flatMap(column => column.stages).find(mapping => mapping.stage.category === 'todo')?.stage;
    if (!doing || !done || !todo)
        throw new Error('Missing standard stages');
    let issue = await coverageIssue(request, projectId, { title: 'Report measured work' });
    const epic = await createPlanning(request, projectId);
    await assignPlanning(request, await issuePlanning(request, issue.summary.id), epic.id, null);
    async function move(stageId: string) {
        issue = (await coverageWrite(request, 'POST', `/api/v2/issues/${issue.summary.id}/move`, { expectedRevision: issue.summary.revision, targetStageId: stageId }, zSavedModernIssueView, 200, 'member')).result;
    }
    const today = new Date().toISOString().slice(0, 10), reportPath = `/api/v1/projects/${projectId}/kanban-report?from=${today}&through=${today}`;
    await useCase('UC-PLN-0046', async () => {
        const report = await coverageGet(request, reportPath, zKanbanReport);
        expect(report.activeCount).toBe(1);
        expect(report.completedCycles).toBe(0);
        expect(report.work.items.map(value => value.id)).toEqual([issue.summary.id]);
    }, 'rest');
    await move(doing.id);
    await useCase('UC-PLN-0048', async () => {
        const report = await coverageGet(request, reportPath, zKanbanReport);
        expect(report.work.items[0]).toMatchObject({ id: issue.summary.id });
        expect(report.work.items[0]?.startedAt).not.toBeNull();
        expect(report.work.items[0]?.cycleAgeDays).toBeGreaterThanOrEqual(0);
    }, 'rest');
    await useCase('UC-PLN-0045', async () => {
        const prior = await coverageGet(request, reportPath, zKanbanReport), startedAt = prior.work.items.find(value => value.id === issue.summary.id)?.startedAt;
        expect(startedAt).not.toBeNull();
        await move(todo.id);
        const after = await coverageGet(request, reportPath, zKanbanReport);
        expect(after.work.items.find(value => value.id === issue.summary.id)?.startedAt).toBe(startedAt);
        await move(doing.id);
    }, 'rest');
    await move(done.id);
    await useCase('UC-PLN-0041', async () => {
        const report = await coverageGet(request, reportPath, zKanbanReport);
        expect(report.days).toEqual([{ day: today, completedCycles: 1 }]);
        expect(report.completedCycles).toBe(1);
    }, 'rest');
    await useCase('UC-PLN-0043', async () => {
        const report = await coverageGet(request, reportPath, zKanbanReport);
        expect(report.measuredCycles).toBe(1);
        expect(report.averageCycleDays).toBeGreaterThanOrEqual(0);
    }, 'rest');
    await useCase('UC-PLN-0036', async () => {
        const list = await coverageGet(request, `/api/v1/projects/${projectId}/planning`, zPagePlanningItemView);
        expect(list.items.find(value => value.id === epic.id)).toMatchObject({ issueCount: 1, completedCount: 1 });
    }, 'rest');
    await move(todo.id);
    await useCase('UC-PLN-0037', async () => {
        const list = await coverageGet(request, `/api/v1/projects/${projectId}/planning`, zPagePlanningItemView);
        expect(list.items.find(value => value.id === epic.id)).toMatchObject({ issueCount: 1, completedCount: 0 });
    }, 'rest');
    await move(done.id);
    await useCase('UC-PLN-0042', async () => {
        const report = await coverageGet(request, reportPath, zKanbanReport);
        expect(report.completedCycles).toBe(2);
        expect(report.days[0]?.completedCycles).toBe(2);
    }, 'rest');
    await coverageWrite(request, 'POST', `/api/v1/issues/${issue.summary.id}/organize`, { expectedRevision: issue.summary.revision, archived: true }, zSavedIssueView, 200, 'member');
    await useCase('UC-PLN-0038', async () => {
        const list = await coverageGet(request, `/api/v1/projects/${projectId}/planning`, zPagePlanningItemView);
        expect(list.items.find(value => value.id === epic.id)).toMatchObject({ issueCount: 0, completedCount: 0 });
    }, 'rest');
    await useCase('UC-PLN-0044', async () => {
        const unstarted = await coverageIssue(request, projectId, { title: 'Direct completion without start' });
        await coverageWrite(request, 'POST', `/api/v2/issues/${unstarted.summary.id}/move`, { expectedRevision: unstarted.summary.revision, targetStageId: done.id }, zSavedModernIssueView, 200, 'member');
        const report = await coverageGet(request, reportPath, zKanbanReport);
        expect(report.completedCycles).toBe(3);
        expect(report.measuredCycles).toBe(2);
    }, 'rest');
    const blocked = await coverageIssue(request, projectId, { title: 'Blocked reporting work' }), blocker = await coverageIssue(request, projectId, { title: 'Required report blocker' });
    await coverageWrite(request, 'POST', `/api/v1/issues/${blocked.summary.id}/dependencies`, { expectedIssueRevision: blocked.summary.revision, expectedGraphRevision: blocked.graphRevision, blockerId: blocker.summary.id }, zSavedDependencyView, 200, 'member');
    await useCase('UC-PLN-0047', async () => {
        const report = await coverageGet(request, reportPath, zKanbanReport);
        expect(report.blockedCount).toBe(1);
        expect(report.work.items.find(value => value.id === blocked.summary.id)?.unfinishedBlockers).toBe(1);
    }, 'rest');
    await useCase("UC-PLN-0082", async () => {
        const first = await coverageGet(request, reportPath + '&limit=1', zKanbanReport);
        expect(first.work.items).toHaveLength(1);
        expect(first.work.nextCursor).not.toBeNull();
        const next = await coverageGet(request, reportPath + '&limit=1&cursor=' + encodeURIComponent(first.work.nextCursor!), zKanbanReport);
        expect(next.work.items).toHaveLength(1);
        expect(next.work.items[0]?.id).not.toBe(first.work.items[0]?.id);
    }, 'rest');
    await useCase('UC-PLN-0076', async () => {
        const first = await coverageGet(request, reportPath + '&limit=1', zKanbanReport);
        expect(first.work.items).toHaveLength(1);
        expect(first.work.totalMatching).toBe(2);
        expect(first.days.length).toBeLessThanOrEqual(366);
    }, 'rest');
    for (const [id, from, through] of [['UC-PLN-0062', '2026-10-02', '2026-10-01'], ['UC-PLN-0063', '2025-01-01', '2026-01-02']] as const) {
        await useCase(id, async () => {
            await coverageFailure(await request.get(apiOrigin + `/api/v1/projects/${projectId}/kanban-report?from=${from}&through=${through}`, { headers: await coverageHeaders() }));
        }, 'rest');
    }
});
test('planning browser cancellation, linked navigation, autosave and responsive report views', async ({ page, request }) => {
    const projectId = await coverageProject(request), epic = await createPlanning(request, projectId), release = await createPlanning(request, projectId, { name: 'Browser release', kind: 'release' });
    const issue = await coverageIssue(request, projectId, { title: 'Browser planning work' });
    await signIn(page, 'member', `/projects/${projectId}/planning`, /^Planning$/);
    await useCase('UC-PLN-0020', async () => {
        await page.getByRole('button', { name: 'Create epic or release', exact: true }).click();
        await page.getByLabel('Name', { exact: true }).fill('Cancelled planning draft');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(page.getByRole('region', { name: 'Planning editor' })).toHaveCount(0);
        expect((await coverageGet(request, `/api/v1/projects/${projectId}/planning`, zPagePlanningItemView)).totalMatching).toBe(2);
    }, 'web');
    await signIn(page, 'member', `/issues/${issue.summary.id}`, /^Browser planning work$/);
    await useCase('UC-PLN-0028', async () => {
        await page.getByRole('combobox', { name: 'Issue epic', exact: true }).selectOption(epic.id);
        await expect(page.getByText('Planning updated.', { exact: true })).toBeVisible();
        expect((await issuePlanning(request, issue.summary.id)).epicId).toBe(epic.id);
        await expect(page.getByRole('button', { name: 'Save planning', exact: true })).toHaveCount(0);
    }, 'web');
    await useCase('UC-PLN-0031', async () => {
        await page.getByRole('combobox', { name: 'Issue release', exact: true }).selectOption(release.id);
        await expect(page.getByRole('combobox', { name: 'Issue release', exact: true })).toBeEnabled();
        expect((await issuePlanning(request, issue.summary.id)).releaseId).toBe(release.id);
    }, 'web');
    await useCase('UC-PLN-0035', async () => {
        let writes = 0;
        page.on('request', r => { if (r.method() === 'PUT' && new URL(r.url()).pathname === `/api/v1/issues/${issue.summary.id}/planning`)
            writes++; });
        const before = await issuePlanning(request, issue.summary.id);
        await page.getByRole('combobox', { name: 'Issue epic', exact: true }).selectOption(epic.id);
        await page.getByRole('combobox', { name: 'Issue release', exact: true }).focus();
        await expect(page.getByRole('combobox', { name: 'Issue epic', exact: true })).toBeEnabled();
        expect((await issuePlanning(request, issue.summary.id)).revision).toBe(before.revision);
        expect(writes).toBe(0);
    }, 'web');
    await signIn(page, 'member', `/projects/${projectId}/planning`, /^Planning$/);
    await useCase('UC-PLN-0073', async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(page.getByRole('heading', { name: epic.name, exact: true })).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }, 'web');
    await useCase('UC-PLN-0024', async () => {
        await page.locator('.planning-card').filter({ has: page.getByRole('heading', { name: epic.name, exact: true }) }).getByRole('button', { name: 'View issues', exact: true }).click();
        await page.locator('.linked-work').getByRole('link').filter({ hasText: issue.summary.title }).click();
        await expect(page).toHaveURL(new RegExp('/issues/' + issue.summary.id + '$'));
        await expect(page.getByRole('heading', { name: issue.summary.title, exact: true })).toBeVisible();
    }, 'web');
    await signIn(page, 'member', `/projects/${projectId}/reports`, /^Kanban reports$/);
    await useCase('UC-PLN-0039', async () => {
        await expect(page.locator('.metric-grid')).toBeVisible();
        await expect(page.getByLabel('From', { exact: true })).not.toHaveValue('');
    }, 'web');
    await useCase('UC-PLN-0051', async () => {
        await page.getByText('How these numbers are calculated', { exact: true }).click();
        await expect(page.getByText(/No last-updated timestamp is used/)).toBeVisible();
    }, 'web');
    await useCase('UC-PLN-0040', async () => {
        await page.getByLabel('From', { exact: true }).fill('2026-01-01');
        await page.getByLabel('Through', { exact: true }).fill('2026-01-31');
        await page.getByRole('button', { name: 'Update report', exact: true }).click();
        await expect(page.locator('.metric-grid')).toContainText('During 2026-01-01 – 2026-01-31');
    }, 'web');
    await useCase('UC-PLN-0074', async () => {
        const scroller = page.locator('.table-scroll');
        await expect(scroller).toBeVisible();
        expect(await scroller.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
        await scroller.evaluate(element => { element.scrollLeft = element.scrollWidth; });
        expect(await scroller.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    }, 'web');
    await useCase('UC-PLN-0050', async () => {
        await page.locator('.table-scroll').getByRole('link').filter({ hasText: issue.summary.title }).click();
        await expect(page).toHaveURL(new RegExp('/issues/' + issue.summary.id + '$'));
        await expect(page.getByRole('heading', { name: issue.summary.title, exact: true })).toBeVisible();
    }, 'web');
});
test('issue planning pages real choices without duplicating its retained selected item', async ({ page, request }) => {
    const projectId = await coverageProject(request), a = await createPlanning(request, projectId, { name: 'A epic' }), b = await createPlanning(request, projectId, { name: 'B epic' }), selected = await createPlanning(request, projectId, { name: 'Z selected epic' });
    const release = await createPlanning(request, projectId, { name: 'Z release', kind: 'release' }), issue = await coverageIssue(request, projectId, { title: 'Paged planning choices' });
    await assignPlanning(request, await issuePlanning(request, issue.summary.id), selected.id, release.id);
    const cursors: string[] = [];
    await page.route(`**/api/v1/projects/${projectId}/planning?*`, async (route) => {
        const url = new URL(route.request().url());
        url.searchParams.set('limit', '1');
        if (url.searchParams.get('cursor'))
            cursors.push(url.searchParams.get('cursor')!);
        const response = await route.fetch({ url: url.toString() });
        expect(response.status()).toBe(200);
        await route.fulfill({ response });
    });
    await signIn(page, 'member', `/issues/${issue.summary.id}`, /^Paged planning choices$/);
    await useCase('UC-PLN-0034', async () => {
        const panel = page.locator('gg-issue-planning'), epic = panel.getByRole('combobox', { name: 'Issue epic', exact: true }), releaseChoice = panel.getByRole('combobox', { name: 'Issue release', exact: true });
        await expect(epic).toHaveValue(selected.id);
        await expect(epic.getByRole('option', { name: selected.name, exact: true })).toHaveCount(1);
        await expect(releaseChoice).toHaveValue(release.id);
        for (let index = 0; index < 3; index++)
            await panel.getByRole('button', { name: 'Load more epics and releases', exact: true }).click();
        await expect(panel.getByRole('button', { name: 'Load more epics and releases', exact: true })).toHaveCount(0);
        expect(cursors).toHaveLength(3);
        expect(new Set(cursors).size).toBe(3);
        for (const item of [a, b, selected])
            await expect(epic.getByRole('option', { name: item.name, exact: true })).toHaveCount(1);
        await expect(releaseChoice.getByRole('option', { name: release.name, exact: true })).toHaveCount(1);
        await expect(epic).toHaveValue(selected.id);
        await expect(releaseChoice).toHaveValue(release.id);
    }, 'web');
});
test('development links cover every kind, edits, paging, retries and validation', async ({ request }) => {
    const projectId = await coverageProject(request), issue = await coverageIssue(request, projectId), path = `/api/v1/issues/${issue.summary.id}/development-links`;
    await test.step('service precondition for UC-INT-0002', async () => {
        expect(await coverageGet(request, path, zPageDevelopmentLinkView)).toMatchObject({ items: [], totalMatching: 0 });
    });
    let linkId = '', revision = '0';
    const fields: DevelopmentLinkFields = { expectedRevision: '0', title: 'PR delivery', url: 'https://example.com/pull/12', kind: 'pull_request', removed: false };
    for (const [id, kind] of [['UC-INT-0004', 'pull_request'], ['UC-INT-0005', 'commit'], ['UC-INT-0006', 'other']] as const) {
        await useCase(id, async () => {
            const saved = await coverageWrite(request, 'PUT', path + '/' + crypto.randomUUID(), { ...fields, title: 'Link ' + kind, kind }, zSavedDevelopmentLinkView, 201, 'member');
            expect(saved.result).toMatchObject({ issueId: issue.summary.id, kind, removed: false, revision: '1' });
            linkId = saved.result.id;
            revision = saved.result.revision;
        }, 'rest');
    }
    await useCase("UC-INT-0061", async () => {
        const list = await coverageGet(request, path, zPageDevelopmentLinkView, 'viewer');
        expect(list.totalMatching).toBe(3);
        expect(list.items.map(value => value.id)).toContain(linkId);
    }, 'rest');
    await useCase("UC-INT-0059", async () => {
        const first = await coverageGet(request, path + '?limit=1', zPageDevelopmentLinkView);
        expect(first.items).toHaveLength(1);
        expect(first.nextCursor).not.toBeNull();
        const next = await coverageGet(request, path + '?limit=1&cursor=' + encodeURIComponent(first.nextCursor!), zPageDevelopmentLinkView);
        expect(next.items).toHaveLength(1);
        expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
    }, 'rest');
    let current = { ...fields, kind: 'other' as const, title: 'Link other' } as DevelopmentLinkFields;
    for (const [id, change] of [['UC-INT-0008', { title: 'Edited link title' }], ["UC-INT-0062", { url: 'https://example.org/new-path' }], ['UC-INT-0010', { kind: 'commit' }], ["UC-INT-0063", { title: 'رابط التسليم العربي' }]] as const) {
        await useCase(id, async () => {
            current = { ...current, ...change, expectedRevision: revision };
            const saved = await coverageWrite(request, 'PUT', path + '/' + linkId, current, zSavedDevelopmentLinkView, 200, 'member');
            expect(saved.result).toMatchObject(change);
            revision = saved.result.revision;
            expect((await coverageGet(request, path, zPageDevelopmentLinkView)).items.find(value => value.id === linkId)).toMatchObject(change);
        }, 'rest');
    }
    await useCase('UC-INT-0047', async () => {
        await coverageFailure(await request.put(apiOrigin + path + '/' + linkId, { headers: await coverageHeaders('member'), data: { ...current, expectedRevision: '1', title: 'Stale overwrite' } }), 409, 'conflict');
        expect((await coverageGet(request, path, zPageDevelopmentLinkView)).items.find(value => value.id === linkId)?.title).toBe(current.title);
    }, 'rest');
    await useCase('UC-INT-0049', async () => {
        const reference = crypto.randomUUID(), id = crypto.randomUUID();
        const first = await coverageWrite(request, 'PUT', path + '/' + id, fields, zSavedDevelopmentLinkView, 201, 'member', reference);
        const replay = await coverageWrite(request, 'PUT', path + '/' + id, fields, zSavedDevelopmentLinkView, 201, 'member', reference);
        expect(replay.result).toEqual(first.result);
        expect(replay.receipt.replayed).toBe(true);
        expect((await coverageGet(request, path, zPageDevelopmentLinkView)).items.filter(value => value.id === id)).toHaveLength(1);
    }, 'rest');
    for (const [id, change] of [
        ['UC-INT-0032', { title: ' ' }], ['UC-INT-0033', { title: 'x'.repeat(201) }], ['UC-INT-0034', { url: 'javascript:alert(1)' }],
        ['UC-INT-0035', { url: 'https://user:password@example.com/path' }], ['UC-INT-0036', { url: 'https://' }],
        ['UC-INT-0037', { url: 'https://example.com/' + 'x'.repeat(2000) }], ['UC-INT-0038', { kind: 'branch' }], ['UC-INT-0039', { removed: true }],
    ] as const) {
        await useCase(id, async () => {
            await coverageFailure(await request.put(apiOrigin + path + '/' + crypto.randomUUID(), { headers: await coverageHeaders('member'), data: { ...fields, ...change } }));
            expect((await coverageGet(request, path, zPageDevelopmentLinkView)).totalMatching).toBe(4);
        }, 'rest');
    }
    await useCase('UC-INT-0011', async () => {
        const saved = await coverageWrite(request, 'PUT', path + '/' + linkId, { ...current, expectedRevision: revision, removed: true }, zSavedDevelopmentLinkView, 200, 'member');
        expect(saved.result.removed).toBe(true);
        expect((await coverageGet(request, path, zPageDevelopmentLinkView)).items.some(value => value.id === linkId)).toBe(false);
    }, 'rest');
    await coverageWrite(request, 'POST', `/api/v1/issues/${issue.summary.id}/organize`, { expectedRevision: issue.summary.revision, archived: true }, zSavedIssueView, 200, 'member');
    await useCase('UC-INT-0040', async () => {
        await coverageFailure(await request.put(apiOrigin + path + '/' + crypto.randomUUID(), { headers: await coverageHeaders('member'), data: fields }));
    }, 'rest');
});
test('stage assignment rules cover updates, eligibility, conflicts and exact replay', async ({ request }) => {
    const projectId = await coverageProject(request), board = await coverageBoard(request, projectId), path = `/api/v1/projects/${projectId}/automation-rules`;
    const mappings = board.columns.flatMap(column => column.stages), review = mappings.find(value => value.stage.category === 'review'), doing = mappings.find(value => value.stage.category === 'in_progress');
    if (!review || !doing)
        throw new Error('Missing rule stages');
    let current: AutomationRuleFields = { expectedRevision: '0', name: 'Review owner', stageId: review.stage.id, assigneeId: memberId, enabled: true };
    await test.step('service precondition for UC-INT-0016', async () => {
        expect(await coverageGet(request, path, zPageAutomationRuleView)).toMatchObject({ items: [], totalMatching: 0 });
    });
    const ruleId = crypto.randomUUID();
    let savedRule = await useCase('UC-INT-0017', async () => {
        const saved = await coverageWrite(request, 'PUT', path + '/' + ruleId, current, zSavedAutomationRuleView, 201);
        expect(saved.result).toMatchObject({ id: ruleId, stageId: review.stage.id, enabled: true, assignee: { id: memberId } });
        return saved.result;
    }, 'rest');
    for (const [id, change] of [
        ['UC-INT-0019', { name: 'Changed review owner' }], ['UC-INT-0020', { stageId: doing.stage.id }],
        ['UC-INT-0021', { assigneeId: board.board.creator.id }], ['UC-INT-0022', { enabled: false }],
        ['UC-INT-0023', { enabled: true }], ['UC-INT-0054', { name: 'تعيين مطور المراجعة' }],
    ] as const) {
        await useCase(id, async () => {
            current = { ...current, ...change, expectedRevision: savedRule.revision };
            savedRule = (await coverageWrite(request, 'PUT', path + '/' + ruleId, current, zSavedAutomationRuleView)).result;
            expect(savedRule.name).toBe(current.name);
            expect(savedRule.stageId).toBe(current.stageId);
            expect(savedRule.enabled).toBe(current.enabled);
            expect(savedRule.assignee.id).toBe(current.assigneeId);
        }, 'rest');
    }
    await useCase('UC-INT-0018', async () => {
        const saved = await coverageWrite(request, 'PUT', path + '/' + crypto.randomUUID(), { expectedRevision: '0', name: 'Disabled review owner', stageId: review.stage.id, assigneeId: memberId, enabled: false }, zSavedAutomationRuleView, 201);
        expect(saved.result.enabled).toBe(false);
    }, 'rest');
    await useCase('UC-INT-0014', async () => {
        const list = await coverageGet(request, path, zPageAutomationRuleView, 'member');
        expect(list.totalMatching).toBe(2);
        expect(list.items.map(value => value.id)).toContain(ruleId);
    }, 'rest');
    await useCase("UC-INT-0060", async () => {
        const first = await coverageGet(request, path + '?limit=1', zPageAutomationRuleView);
        expect(first.items).toHaveLength(1);
        expect(first.nextCursor).not.toBeNull();
        const next = await coverageGet(request, path + '?limit=1&cursor=' + encodeURIComponent(first.nextCursor!), zPageAutomationRuleView);
        expect(next.items).toHaveLength(1);
        expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
    }, 'rest');
    await useCase('UC-INT-0027', async () => {
        const issue = await coverageIssue(request, projectId, { title: 'Automated stage assignment' });
        const moved = await coverageWrite(request, 'POST', `/api/v2/issues/${issue.summary.id}/move`, { expectedRevision: issue.summary.revision, targetStageId: doing.stage.id }, zSavedModernIssueView, 200, 'member');
        expect(moved.result.summary.assignee?.id).toBe(current.assigneeId);
        expect((await coverageReadIssue(request, issue.summary.id)).summary.assignee?.id).toBe(current.assigneeId);
    }, 'rest');
    for (const [id, change, role, status, code] of [
        ['UC-INT-0041', { name: ' ' }, 'owner', 422, 'validation_failed'], ['UC-INT-0042', { name: 'x'.repeat(101) }, 'owner', 422, 'validation_failed'],
        ['UC-INT-0043', { stageId: doing.stage.id }, 'owner', 422, 'validation_failed'], ['UC-INT-0044', { stageId: review.stage.id, assigneeId: viewerId }, 'owner', 422, 'validation_failed'],
        ['UC-INT-0045', { stageId: crypto.randomUUID() }, 'owner', 404, 'unavailable_record'], ['UC-INT-0046', { stageId: review.stage.id, stage: 'done' }, 'owner', 422, 'validation_failed'],
        ['UC-INT-0031', { stageId: review.stage.id }, 'member', 403, 'forbidden'],
    ] as const) {
        await useCase(id, async () => {
            await coverageFailure(await request.put(apiOrigin + path + '/' + crypto.randomUUID(), { headers: await coverageHeaders(role), data: { ...current, expectedRevision: '0', enabled: true, ...change } }), status, code);
            expect((await coverageGet(request, path, zPageAutomationRuleView)).totalMatching).toBe(2);
        }, 'rest');
    }
    await useCase('UC-INT-0048', async () => {
        await coverageFailure(await request.put(apiOrigin + path + '/' + ruleId, { headers: await coverageHeaders(), data: { ...current, expectedRevision: '1', name: 'Stale rule' } }), 409, 'conflict');
        expect((await coverageGet(request, path, zPageAutomationRuleView)).items.find(value => value.id === ruleId)?.name).toBe(current.name);
    }, 'rest');
    await useCase('UC-INT-0050', async () => {
        const reference = crypto.randomUUID(), id = crypto.randomUUID(), fields = { expectedRevision: '0', name: 'Replay disabled rule', stageId: review.stage.id, assigneeId: memberId, enabled: false };
        const first = await coverageWrite(request, 'PUT', path + '/' + id, fields, zSavedAutomationRuleView, 201, 'owner', reference);
        const second = await coverageWrite(request, 'PUT', path + '/' + id, fields, zSavedAutomationRuleView, 201, 'owner', reference);
        expect(second.result).toEqual(first.result);
        expect(second.receipt.replayed).toBe(true);
    }, 'rest');
});
test('development browser cancel, secure external links, viewer controls and narrow layout', async ({ page, request }) => {
    const projectId = await coverageProject(request), issue = await coverageIssue(request, projectId, { title: 'Browser development work' });
    await signIn(page, 'member', `/issues/${issue.summary.id}`, /^Browser development work$/);
    const section = page.locator('.development');
    await useCase('UC-INT-0002', async () => { await expect(section.getByText('No development links yet.', { exact: true })).toBeVisible(); await expect(section.getByRole('link')).toHaveCount(0); }, 'web');
    await useCase('UC-INT-0012', async () => {
        await section.getByRole('button', { name: 'Add link', exact: true }).click();
        await section.getByLabel('Title', { exact: true }).fill('Discard development draft');
        await section.getByLabel('URL', { exact: true }).fill('https://example.com/discard');
        await section.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(section.getByRole('form')).toHaveCount(0);
        await expect(section.getByText('No development links yet.', { exact: true })).toBeVisible();
    }, 'web');
    await section.getByRole('button', { name: 'Add link', exact: true }).click();
    await section.getByLabel('Title', { exact: true }).fill('رابط مراجعة آمن');
    await section.getByLabel('URL', { exact: true }).fill('https://example.com/pull/123');
    await section.getByRole('button', { name: 'Save development link', exact: true }).click();
    await useCase('UC-INT-0007', async () => {
        const link = section.getByRole('link', { name: 'رابط مراجعة آمن ↗', exact: true });
        await expect(link).toHaveAttribute('href', 'https://example.com/pull/123');
        await expect(link).toHaveAttribute('target', '_blank');
        await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
        // A real browser click is exercised without making an external provider part of the fixture.
        await page.context().route('https://example.com/pull/123', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>Linked development work</title><h1>Linked development work</h1>' }));
        const popupPromise = page.waitForEvent('popup');
        await link.click();
        const popup = await popupPromise;
        await expect(popup.getByRole('heading', { name: 'Linked development work' })).toBeVisible();
        await popup.close();
    }, 'web');
    await useCase('UC-INT-0052', async () => {
        await page.setViewportSize({ width: 390, height: 844 });
        await expect(section.getByRole('link')).toBeVisible();
        expect(await section.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }, 'web');
    await signIn(page, 'viewer', `/issues/${issue.summary.id}`, /^Browser development work$/);
    await useCase('UC-INT-0030', async () => {
        await expect(section.getByRole('link', { name: 'رابط مراجعة آمن ↗', exact: true })).toBeVisible();
        await expect(section.getByRole('button', { name: 'Add link', exact: true })).toHaveCount(0);
        await expect(section.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
        await expect(section.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
    }, 'web');
});
test('empty planning explains epics and releases before the first creation', async ({ page, request }) => {
    const projectId = await coverageProject(request);
    await signIn(page, 'member', `/projects/${projectId}/planning`, /^Planning$/);
    await useCase('UC-PLN-0002', async () => { await expect(page.getByRole('heading', { name: 'Plan the next piece of work', exact: true })).toBeVisible(); await expect(page.getByText(/Create an epic to group a larger goal, or a release to coordinate delivery/)).toBeVisible(); await expect(page.getByRole('button', { name: 'Create your first epic or release', exact: true })).toBeVisible(); await expect(page.locator('.planning-card')).toHaveCount(0); }, 'web');
});

test('late planning-item completion cannot close or replace another project editor', async ({ page, request }) => {
    const source = await coverageProject(request), destination = await coverageProject(request);
    const sourcePath = `/api/v1/projects/${source}/planning`, destinationPath = `/api/v1/projects/${destination}/planning`;
    await signIn(page, 'member', `/projects/${source}/planning`, /^Planning$/);
    await page.getByRole('button', { name: 'Create epic or release', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Accepted source epic');
    let sourceAccepted = false, sourceReturned = false, destinationWaiting = false, destinationReturned = false;
    let releaseSource = () => {}, releaseDestination = () => {};
    const sourceGate = new Promise<void>(done => { releaseSource = done; });
    const destinationGate = new Promise<void>(done => { releaseDestination = done; });
    await page.route(url => url.pathname === sourcePath, async route => {
        if (route.request().method() !== 'POST') return route.continue();
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        sourceAccepted = true;
        await sourceGate;
        await route.fulfill({ response });
        sourceReturned = true;
    });
    await page.route(url => url.pathname === destinationPath, async route => {
        if (route.request().method() !== 'POST') return route.continue();
        destinationWaiting = true;
        await destinationGate;
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        await route.fulfill({ response });
        destinationReturned = true;
    });
    let destinationReads = 0;
    const trackReads = (incoming: import('@playwright/test').Request) => {
        if (incoming.method() === 'GET' && new URL(incoming.url()).pathname === destinationPath) destinationReads++;
    };
    page.on('request', trackReads);
    try {
        await useCase('UC-PLN-0077', async () => {
            const sourceReply = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === sourcePath);
            await page.getByRole('button', { name: 'Save planning item', exact: true }).click();
            await expect.poll(() => sourceAccepted).toBe(true);
            page.once('dialog', dialog => dialog.accept());
            await page.evaluate(path => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }, `/projects/${destination}/planning`);
            await page.getByRole('button', { name: 'Create epic or release', exact: true }).click();
            await page.getByLabel('Name', { exact: true }).fill('Destination epic draft');
            const editor = page.getByRole('region', { name: 'Planning editor', exact: true });
            await expect(editor).toBeVisible();
            await expect(editor.getByRole('button', { name: 'Save planning item', exact: true })).toBeEnabled();
            const destinationReply = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === destinationPath);
            await editor.getByRole('button', { name: 'Save planning item', exact: true }).click();
            await expect.poll(() => destinationWaiting).toBe(true);
            await expect(editor.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
            await expect(editor.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
            const readsBeforeSourceReply = destinationReads;
            releaseSource();
            await (await sourceReply).finished();
            await expect.poll(() => sourceReturned).toBe(true);
            await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
            await expect(page).toHaveURL(new RegExp(`/projects/${destination}/planning$`));
            await expect(editor).toBeVisible();
            await expect(editor.getByLabel('Name', { exact: true })).toHaveValue('Destination epic draft');
            await expect(editor.getByRole('button', { name: 'Saving…', exact: true })).toBeDisabled();
            await expect(editor.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
            expect(destinationReturned).toBe(false);
            expect(destinationReads).toBe(readsBeforeSourceReply);
            expect((await coverageGet(request, sourcePath, zPagePlanningItemView)).items.map(value => value.name)).toEqual(['Accepted source epic']);
            expect((await coverageGet(request, destinationPath, zPagePlanningItemView)).items).toEqual([]);
            releaseDestination();
            await (await destinationReply).finished();
            await expect.poll(() => destinationReturned).toBe(true);
            await expect(editor).toHaveCount(0);
            await expect(page.locator('.planning-card h2')).toHaveText(['Destination epic draft']);
            expect((await coverageGet(request, destinationPath, zPagePlanningItemView)).items.map(value => value.name)).toEqual(['Destination epic draft']);
        }, 'web');
    } finally {
        releaseSource();
        releaseDestination();
        await page.unrouteAll({ behavior: 'wait' });
        page.off('request', trackReads);
    }
});

test('dirty planning navigation requires a deliberate discard and leaves the original draft intact when refused',async({page,request})=>{
 const projectId=await coverageProject(request);await signIn(page,'member',`/projects/${projectId}/planning`,/^Planning$/);await page.getByRole('button',{name:'Create epic or release',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill('Protected planning draft');
 await useCase('UC-PLN-0078',async()=>{expect(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;})).toBe(true);let prompts=0;const refuse=(dialog:import('@playwright/test').Dialog)=>{prompts++;void dialog.dismiss();};page.once('dialog',refuse);await page.getByRole('link',{name:'Reports',exact:true}).click();await expect.poll(()=>prompts).toBe(1);await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/planning$`));await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Protected planning draft');page.once('dialog',dialog=>dialog.accept());await page.getByRole('link',{name:'Reports',exact:true}).click();await expect(page.getByRole('heading',{name:'Kanban reports',exact:true})).toBeVisible();expect((await coverageGet(request,`/api/v1/projects/${projectId}/planning`,zPagePlanningItemView)).items).toEqual([]);},'web');
});

test('late automation completion cannot close the destination project assignment editor',async({page,request})=>{
 const source=await coverageProject(request),destination=await coverageProject(request),board=await coverageBoard(request,source),review=board.columns.flatMap(value=>value.stages).find(value=>value.stage.category==='review')?.stage;if(!review)throw new Error('Missing Review');await signIn(page,'owner',`/projects/${source}/automation`,/^Automation$/);await page.getByRole('button',{name:'Create assignment rule',exact:true}).click();await page.getByLabel('Rule name',{exact:true}).fill('Accepted source rule');await page.getByRole('combobox',{name:'When issue enters',exact:true}).selectOption(review.id);await page.getByRole('combobox',{name:'Assign to',exact:true}).fill('مطور');await page.getByRole('option',{name:'مطور تجريبي',exact:true}).click();
 let accepted=false,returned=false,release=()=>{};const gate=new Promise<void>(done=>{release=done;});await page.route(`**/api/v1/projects/${source}/automation-rules/*`,async route=>{const response=await route.fetch();expect(response.status()).toBe(201);accepted=true;await gate;await route.fulfill({response});returned=true;},{times:1});
 await useCase('UC-INT-0057',async()=>{try{await page.getByRole('button',{name:'Save assignment rule',exact:true}).click();await expect.poll(()=>accepted).toBe(true);await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate',{state:history.state}));},`/projects/${destination}/automation`);await page.getByRole('button',{name:'Create assignment rule',exact:true}).click();await page.getByLabel('Rule name',{exact:true}).fill('Destination rule draft');}finally{release();}await expect.poll(()=>returned).toBe(true);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(page.getByLabel('Rule name',{exact:true})).toHaveValue('Destination rule draft');await expect(page.locator('.editor')).toBeVisible();expect((await coverageGet(request,`/api/v1/projects/${source}/automation-rules`,zPageAutomationRuleView)).items.map(value=>value.name)).toEqual(['Accepted source rule']);expect((await coverageGet(request,`/api/v1/projects/${destination}/automation-rules`,zPageAutomationRuleView)).items).toEqual([]);},'web');
});

test('a late development read failure cannot attach its error or saving state to another issue',async({page,request})=>{
 const projectId=await coverageProject(request),first=await coverageIssue(request,projectId,{title:'Development source'}),second=await coverageIssue(request,projectId,{title:'Development destination'});let started=false,returned=false,release=()=>{};const gate=new Promise<void>(done=>{release=done;});await page.route(`**/api/v1/issues/${first.summary.id}/development-links?*`,async route=>{const response=await route.fetch();expect(response.status()).toBe(200);started=true;await gate;await route.abort('failed');returned=true;},{times:1});
 await signIn(page,'member',`/issues/${first.summary.id}`,/^Development source$/);await expect.poll(()=>started).toBe(true);
 await useCase('UC-INT-0056',async()=>{try{await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate',{state:history.state}));},`/issues/${second.summary.id}`);await expect(page.getByRole('heading',{name:second.summary.title,exact:true})).toBeVisible();await page.locator('.development').getByRole('button',{name:'Add link',exact:true}).click();await page.locator('.development').getByLabel('Title',{exact:true}).fill('Destination link draft');await page.locator('.development').getByLabel('URL',{exact:true}).fill('https://example.com/destination');}finally{release();}await expect.poll(()=>returned).toBe(true);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(page.locator('.development').getByRole('alert')).toHaveCount(0);await expect(page.locator('.development').getByLabel('Title',{exact:true})).toHaveValue('Destination link draft');await expect(page.getByRole('button',{name:'Save development link',exact:true})).toBeEnabled();expect((await coverageGet(request,`/api/v1/issues/${second.summary.id}/development-links`,zPageDevelopmentLinkView)).items).toEqual([]);},'web');
});

test('planning linked work and aging reports show exact current custom stage names',async({page,request})=>{
 const projectId=await isolatedProject(request),board=(await coverageWrite(request,'POST',`/api/v1/projects/${projectId}/boards`,{name:'Custom report board',savedFilters:{}},zSavedBoardSummary,201,'member')).result,layout=await addFixtureStages(request,board.id,['Quality gate · بوابة الجودة']),stage=layout.columns.flatMap(value=>value.stages).find(value=>value.stage.name==='Quality gate · بوابة الجودة')?.stage;if(!stage)throw new Error('Missing custom stage');await useModernIssues(projectId);const issue=await coverageIssue(request,projectId,{title:'Exact custom-stage report'}),epic=await createPlanning(request,projectId);await coverageWrite(request,'POST',`/api/v2/issues/${issue.summary.id}/move`,{expectedRevision:issue.summary.revision,targetStageId:stage.id},zSavedModernIssueView,200,'member');await assignPlanning(request,await issuePlanning(request,issue.summary.id),epic.id,null);
 await useCase('UC-PLN-0079',async()=>{await signIn(page,'member',`/projects/${projectId}/planning`,/^Planning$/);await page.locator('.planning-card').filter({has:page.getByRole('heading',{name:epic.name,exact:true})}).getByRole('button',{name:'View issues',exact:true}).click();await expect(page.locator('.linked-work li')).toContainText(stage.name);await page.getByRole('link',{name:'Reports',exact:true}).click();await expect(page.locator('.table-scroll tr').filter({hasText:issue.summary.key})).toContainText(stage.name);const report=await coverageGet(request,`/api/v1/projects/${projectId}/kanban-report?from=2026-01-01&through=2026-12-31`,zKanbanReport);expect(report.work.items.find(value=>value.id===issue.summary.id)?.status).toContain('review');expect(report.work.items.find(value=>value.id===issue.summary.id)?.stageName).toBe(stage.name);const linked=await coverageGet(request,`/api/v1/projects/${projectId}/planning/${epic.id}/issues`,zPagePlanningIssueSummary);expect(linked.items.find(value=>value.id===issue.summary.id)?.stageName).toBe(stage.name);},'web');
});

test('same-SPA account switch clears a restored uncertain issue-planning draft',async({page,request})=>{
 const projectId=await coverageProject(request),issue=await coverageIssue(request,projectId,{title:'Private planning draft'}),epic=await createPlanning(request,projectId);await signIn(page,'member',`/issues/${issue.summary.id}`,/^Private planning draft$/);const panel=page.locator('gg-issue-planning');await expect(panel.getByRole('combobox',{name:'Issue epic',exact:true}).locator('option[value="'+epic.id+'"]')).toHaveCount(1);await expect(panel.getByRole('combobox',{name:'Issue epic',exact:true})).toBeEnabled();await page.route(`**/api/v1/issues/${issue.summary.id}/planning`,async route=>{if(route.request().method()==='PUT')await route.abort('failed');else await route.continue();},{times:1});await panel.getByRole('combobox',{name:'Issue epic',exact:true}).selectOption(epic.id);await expect(panel.getByRole('button',{name:'Retry save',exact:true})).toBeVisible();page.once('dialog',dialog=>dialog.accept());await page.getByRole('link',{name:'All issues',exact:true}).click();await page.goBack();await expect(panel.getByRole('combobox',{name:'Issue epic',exact:true})).toHaveValue(epic.id);await expect(panel.getByRole('button',{name:'Retry save',exact:true})).toBeVisible();
 await useCase('UC-SHL-0086',async()=>{await coverageSwitchAccount(page,'owner',`/issues/${issue.summary.id}`);await expect(panel.getByRole('combobox',{name:'Issue epic',exact:true})).toHaveValue('');await expect(panel.getByRole('combobox',{name:'Issue epic',exact:true})).toBeEnabled();await expect(panel.getByRole('button',{name:'Retry save',exact:true})).toHaveCount(0);expect((await issuePlanning(request,issue.summary.id)).epicId).toBeNull();},'web');
});

test('development-link saves and obsolete read failures stay isolated across issue and same-SPA session changes',async({page,request})=>{
 const projectId=await coverageProject(request),first=await coverageIssue(request,projectId,{title:'Development pending source'}),second=await coverageIssue(request,projectId,{title:'Development pending destination'});await signIn(page,'member',`/issues/${first.summary.id}`,/^Development pending source$/);const section=page.locator('.development');await section.getByRole('button',{name:'Add link',exact:true}).click();await section.getByLabel('Title',{exact:true}).fill('Accepted source development link');await section.getByLabel('URL',{exact:true}).fill('https://example.com/source');let accepted=false,returned=false,release=()=>{};const gate=new Promise<void>(done=>{release=done;});await page.route(`**/api/v1/issues/${first.summary.id}/development-links/*`,async route=>{const response=await route.fetch();expect(response.status()).toBe(201);accepted=true;await gate;await route.fulfill({response});returned=true;},{times:1});
 await useCase('UC-INT-0056',async()=>{try{await section.getByRole('button',{name:'Save development link',exact:true}).click();await expect.poll(()=>accepted).toBe(true);await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate',{state:history.state}));},`/issues/${second.summary.id}`);await expect(page.getByRole('heading',{name:second.summary.title,exact:true})).toBeVisible();await section.getByRole('button',{name:'Add link',exact:true}).click();await section.getByLabel('Title',{exact:true}).fill('Destination development draft');await section.getByLabel('URL',{exact:true}).fill('https://example.com/destination');}finally{release();}await expect.poll(()=>returned).toBe(true);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(section.getByLabel('Title',{exact:true})).toHaveValue('Destination development draft');await expect(section.getByRole('button',{name:'Save development link',exact:true})).toBeEnabled();expect((await coverageGet(request,`/api/v1/issues/${first.summary.id}/development-links`,zPageDevelopmentLinkView)).items.map(value=>value.title)).toEqual(['Accepted source development link']);expect((await coverageGet(request,`/api/v1/issues/${second.summary.id}/development-links`,zPageDevelopmentLinkView)).items).toEqual([]);
 let readStarted=false,readReturned=false,releaseRead=()=>{};const readGate=new Promise<void>(done=>{releaseRead=done;});await page.route(`**/api/v1/issues/${first.summary.id}/development-links?*`,async route=>{const response=await route.fetch();expect(response.status()).toBe(200);readStarted=true;await readGate;await route.abort('failed');readReturned=true;},{times:1});await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate',{state:history.state}));},`/issues/${first.summary.id}`);await expect.poll(()=>readStarted).toBe(true);try{await coverageSwitchAccount(page,'owner',`/issues/${second.summary.id}`);await expect(page.getByRole('heading',{name:second.summary.title,exact:true})).toBeVisible();await section.getByRole('button',{name:'Add link',exact:true}).click();await section.getByLabel('Title',{exact:true}).fill('New session development draft');await section.getByLabel('URL',{exact:true}).fill('https://example.com/new-session');}finally{releaseRead();}await expect.poll(()=>readReturned).toBe(true);await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(section.getByRole('alert')).toHaveCount(0);await expect(section.getByLabel('Title',{exact:true})).toHaveValue('New session development draft');await expect(section.getByRole('button',{name:'Save development link',exact:true})).toBeEnabled();},'web');
});
