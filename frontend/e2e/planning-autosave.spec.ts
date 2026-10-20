import { useCase } from './support/use-case';
import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import { zIssuePlanningFields, zIssuePlanningView, zPageBoardSummary, zSavedIssuePlanningView, zSavedIssueView, zSavedPlanningItemView, } from '../src/app/api/generated/zod.gen';
import type { IssuePlanningFields, IssuePlanningView, IssueView, PlanningItemView, } from '../src/app/api/generated/types.gen';
test.skip(!localFixturesAvailable, 'Requires the isolated local company.');
interface RecordedSave {
    reference: string;
    body: IssuePlanningFields;
}
function gate() {
    let resolve = (): void => { };
    const promise = new Promise<void>(done => {
        resolve = done;
    });
    return { promise, resolve };
}
async function headers(role = 'member') {
    return { Authorization: 'Bearer ' + (await token(role)), 'Idempotency-Key': crypto.randomUUID() };
}
async function createIssue(request: APIRequestContext, projectId: string): Promise<IssueView> {
    const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
        headers: await headers(),
        data: { title: 'Planning autosave ' + crypto.randomUUID().slice(0, 8) },
    });
    expect(response.status()).toBe(201);
    return zSavedIssueView.parse(await response.json()).result;
}
async function createItem(request: APIRequestContext, projectId: string, kind: 'epic' | 'release', name: string): Promise<PlanningItemView> {
    const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/planning', {
        headers: await headers('owner'),
        data: { kind, name, description: '', status: 'planned', targetDate: null },
    });
    expect(response.status()).toBe(201);
    return zSavedPlanningItemView.parse(await response.json()).result;
}
async function fixture(request: APIRequestContext) {
    const projectId = await isolatedProject(request);
    const issue = await createIssue(request, projectId);
    const epic = await createItem(request, projectId, 'epic', 'تحسين تجربة الفريق');
    const otherEpic = await createItem(request, projectId, 'epic', 'Next epic');
    const release = await createItem(request, projectId, 'release', 'Release one');
    const otherRelease = await createItem(request, projectId, 'release', 'Release two');
    return { projectId, issue, epic, otherEpic, release, otherRelease };
}
async function readPlanning(request: APIRequestContext, issueId: string): Promise<IssuePlanningView> {
    const response = await request.get(apiOrigin + '/api/v1/issues/' + issueId + '/planning', {
        headers: await headers(),
    });
    expect(response.status()).toBe(200);
    return zIssuePlanningView.parse(await response.json());
}
async function setPlanning(request: APIRequestContext, issueId: string, body: IssuePlanningFields): Promise<IssuePlanningView> {
    const response = await request.put(apiOrigin + '/api/v1/issues/' + issueId + '/planning', {
        headers: await headers(),
        data: body,
    });
    expect(response.status()).toBe(200);
    return zSavedIssuePlanningView.parse(await response.json()).result;
}
function recordSaves(page: Page, issueId: string): RecordedSave[] {
    const saves: RecordedSave[] = [];
    page.on('request', request => {
        if (request.method() === 'PUT' &&
            new URL(request.url()).pathname === '/api/v1/issues/' + issueId + '/planning') {
            saves.push({
                reference: request.headers()['idempotency-key'] ?? '',
                body: zIssuePlanningFields.parse(request.postDataJSON()),
            });
        }
    });
    return saves;
}
function planning(scope: Page | Locator): Locator {
    return scope.locator('gg-issue-planning');
}
async function ready(scope: Page | Locator, data: Awaited<ReturnType<typeof fixture>>): Promise<Locator> {
    const panel = planning(scope);
    await expect(panel.getByRole('combobox', { name: 'Issue epic', exact: true })).toBeEnabled();
    await expect(panel
        .getByRole('combobox', { name: 'Issue epic', exact: true })
        .getByRole('option', { name: data.epic.name, exact: true })).toHaveCount(1);
    await expect(panel
        .getByRole('combobox', { name: 'Issue release', exact: true })
        .getByRole('option', { name: data.release.name, exact: true })).toHaveCount(1);
    await expect(panel.getByRole('button', { name: 'Save planning', exact: true })).toHaveCount(0);
    return panel;
}
async function openDrawer(page: Page, request: APIRequestContext, data: Awaited<ReturnType<typeof fixture>>): Promise<Locator> {
    const response = await request.get(apiOrigin + '/api/v1/projects/' + data.projectId + '/boards', {
        headers: await headers(),
    });
    expect(response.status()).toBe(200);
    const board = zPageBoardSummary
        .parse(await response.json())
        .items.find(candidate => candidate.default);
    if (!board)
        throw new Error('Missing isolated default board');
    await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + board.name + '$'));
    await page.getByRole('link', { name: data.issue.summary.title, exact: true }).click();
    const drawer = page.getByRole('dialog', { name: 'Issue preview', exact: true });
    await expect(drawer).toBeVisible();
    return drawer;
}
test('epic and release choices save immediately, preserve each other, clear independently and enforce viewer access', async ({ page, request, }) => {
    const data = await fixture(request);
    await signIn(page, 'member', '/issues/' + data.issue.summary.id, new RegExp('^' + data.issue.summary.title + '$'));
    const panel = await ready(page, data);
    const epic = panel.getByRole('combobox', { name: 'Issue epic', exact: true });
    const release = panel.getByRole('combobox', { name: 'Issue release', exact: true });
    const saves = recordSaves(page, data.issue.summary.id);
    await epic.selectOption(data.epic.id);
    await expect(epic).toBeEnabled();
    let current = await readPlanning(request, data.issue.summary.id);
    expect(current.epicId).toBe(data.epic.id);
    expect(current.releaseId).toBeNull();
    expect(saves).toHaveLength(1);
    await release.selectOption(data.release.id);
    await expect(release).toBeEnabled();
    current = await readPlanning(request, data.issue.summary.id);
    expect(current.epicId).toBe(data.epic.id);
    expect(current.releaseId).toBe(data.release.id);
    expect(saves).toHaveLength(2);
    await epic.selectOption('');
    await expect(epic).toBeEnabled();
    current = await readPlanning(request, data.issue.summary.id);
    expect(current.epicId).toBeNull();
    expect(current.releaseId).toBe(data.release.id);
    expect(saves).toHaveLength(3);
    await release.selectOption('');
    await expect(release).toBeEnabled();
    current = await readPlanning(request, data.issue.summary.id);
    expect(current.epicId).toBeNull();
    expect(current.releaseId).toBeNull();
    expect(current.revision).toBe('4');
    expect(saves).toHaveLength(4);
    await epic.selectOption('');
    await expect(epic).toBeEnabled();
    expect(saves).toHaveLength(4);
    expect(new Set(saves.map(save => save.reference)).size).toBe(4);
    await signIn(page, 'viewer', '/issues/' + data.issue.summary.id, new RegExp('^' + data.issue.summary.title + '$'));
    await expect(planning(page).getByRole('combobox', { name: 'Issue epic', exact: true })).toBeDisabled();
    await expect(planning(page).getByRole('combobox', { name: 'Issue release', exact: true })).toBeDisabled();
    const denied = await request.put(apiOrigin + '/api/v1/issues/' + data.issue.summary.id + '/planning', {
        headers: await headers('viewer'),
        data: { expectedRevision: current.revision, epicId: data.epic.id, releaseId: null },
    });
    expect(denied.status()).toBe(403);
    expect((await readPlanning(request, data.issue.summary.id)).revision).toBe(current.revision);
});
test('pending planning locks both choices and a lost accepted response retries the exact original write once', async ({ page, request, }) => {
    await useCase('UC-PLN-0066', async () => {
        const data = await fixture(request);
        await signIn(page, 'member', '/issues/' + data.issue.summary.id, new RegExp('^' + data.issue.summary.title + '$'));
        const panel = await ready(page, data);
        const epic = panel.getByRole('combobox', { name: 'Issue epic', exact: true });
        const release = panel.getByRole('combobox', { name: 'Issue release', exact: true });
        const saves = recordSaves(page, data.issue.summary.id);
        const accepted = gate(), returnResponse = gate();
        let attempts = 0;
        await page.route('**/api/v1/issues/' + data.issue.summary.id + '/planning', async (route) => {
            if (route.request().method() !== 'PUT') {
                await route.continue();
                return;
            }
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            zSavedIssuePlanningView.parse(await response.json());
            if (++attempts === 1) {
                accepted.resolve();
                await returnResponse.promise;
                await route.abort('failed');
            }
            else
                await route.fulfill({ response });
        });
        await useCase('UC-PLN-0065', async () => {
            try {
                await epic.selectOption(data.epic.id);
                await accepted.promise;
                await expect(epic).toBeDisabled();
                await expect(release).toBeDisabled();
                await expect(panel.getByRole('status')).toContainText('Saving planning');
                expect(saves).toHaveLength(1);
                expect((await readPlanning(request, data.issue.summary.id)).revision).toBe('1');
            }
            finally {
                returnResponse.resolve();
            }
        }, 'web');
        await expect(panel.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
        await expect(epic).toHaveValue(data.epic.id);
        await expect(epic).toBeDisabled();
        await expect(release).toBeDisabled();
        await panel.getByRole('button', { name: 'Retry save', exact: true }).click();
        await expect(epic).toBeEnabled();
        expect(saves).toHaveLength(2);
        expect(saves[1]).toEqual(saves[0]);
        const current = await readPlanning(request, data.issue.summary.id);
        expect(current.epicId).toBe(data.epic.id);
        expect(current.releaseId).toBeNull();
        expect(current.revision).toBe('1');
    }, 'web');
});
test('a stale epic autosave requires review and explicit apply while retaining a teammate’s newest release', async ({ page, request, }) => {
    await useCase('UC-PLN-0067', async () => {
        const data = await fixture(request);
        await setPlanning(request, data.issue.summary.id, {
            expectedRevision: '0',
            epicId: data.epic.id,
            releaseId: data.release.id,
        });
        await signIn(page, 'member', '/issues/' + data.issue.summary.id, new RegExp('^' + data.issue.summary.title + '$'));
        const panel = await ready(page, data);
        const epic = panel.getByRole('combobox', { name: 'Issue epic', exact: true });
        const release = panel.getByRole('combobox', { name: 'Issue release', exact: true });
        const saves = recordSaves(page, data.issue.summary.id);
        const requested = gate(), sendRequest = gate();
        let held = false;
        await page.route('**/api/v1/issues/' + data.issue.summary.id + '/planning', async (route) => {
            if (route.request().method() === 'PUT' && !held) {
                held = true;
                requested.resolve();
                await sendRequest.promise;
            }
            await route.continue();
        });
        try {
            await epic.selectOption(data.otherEpic.id);
            await requested.promise;
            await setPlanning(request, data.issue.summary.id, {
                expectedRevision: '1',
                epicId: data.epic.id,
                releaseId: data.otherRelease.id,
            });
        }
        finally {
            sendRequest.resolve();
        }
        await expect(panel.getByRole('button', { name: 'Review latest planning', exact: true })).toBeVisible();
        await expect(epic).toHaveValue(data.otherEpic.id);
        await expect(release).toHaveValue(data.release.id);
        await expect(epic).toBeDisabled();
        await expect(release).toBeDisabled();
        expect(saves).toHaveLength(1);
        await panel.getByRole('button', { name: 'Review latest planning', exact: true }).click();
        await expect(panel.getByRole('button', { name: 'Apply reviewed change', exact: true })).toBeVisible();
        await expect(epic).toHaveValue(data.otherEpic.id);
        await expect(release).toHaveValue(data.otherRelease.id);
        expect(saves).toHaveLength(1);
        expect((await readPlanning(request, data.issue.summary.id)).revision).toBe('2');
        await panel.getByRole('button', { name: 'Apply reviewed change', exact: true }).click();
        await expect(epic).toBeEnabled();
        const current = await readPlanning(request, data.issue.summary.id);
        expect(current.epicId).toBe(data.otherEpic.id);
        expect(current.releaseId).toBe(data.otherRelease.id);
        expect(current.revision).toBe('3');
        expect(saves).toHaveLength(2);
        expect(saves[1]?.reference).not.toBe(saves[0]?.reference);
        expect(saves[1]?.body).toEqual({
            expectedRevision: '2',
            epicId: data.otherEpic.id,
            releaseId: data.otherRelease.id,
        });
    }, 'web');
});
test('failed planning drafts ask before leaving, restore through navigation and keep their original retry reference', async ({ page, request, }) => {
    await useCase('UC-PLN-0069', async () => {
        const data = await fixture(request);
        await signIn(page, 'member', '/issues/' + data.issue.summary.id, new RegExp('^' + data.issue.summary.title + '$'));
        let panel = await ready(page, data);
        const saves = recordSaves(page, data.issue.summary.id);
        const endpoint = '**/api/v1/issues/' + data.issue.summary.id + '/planning';
        await page.route(endpoint, async (route) => {
            if (route.request().method() === 'PUT')
                await route.abort('failed');
            else
                await route.continue();
        });
        await panel.getByRole('combobox', { name: 'Issue epic', exact: true }).selectOption(data.epic.id);
        await expect(panel.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
        await page.unroute(endpoint);
        let confirmations = 0;
        page.once('dialog', async (dialog) => {
            confirmations++;
            expect(dialog.message()).toContain('Leave this editor?');
            await dialog.dismiss();
        });
        await page.getByRole('link', { name: 'All issues', exact: true }).click();
        await expect(page.getByRole('heading', { name: data.issue.summary.title, exact: true, level: 1 })).toBeVisible();
        expect(confirmations).toBe(1);
        page.once('dialog', async (dialog) => {
            confirmations++;
            await dialog.accept();
        });
        await page.getByRole('link', { name: 'All issues', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Issues', exact: true, level: 1 })).toBeVisible();
        expect(confirmations).toBe(2);
        let rejectedChoices = false;
        await page.route('**/api/v1/projects/' + data.projectId + '/planning*', async (route) => {
            if (route.request().method() === 'GET' && !rejectedChoices) {
                rejectedChoices = true;
                await route.abort('failed');
            }
            else
                await route.continue();
        });
        await page
            .getByRole('link', {
            name: data.issue.summary.key + ' · ' + data.issue.summary.title,
            exact: true,
        })
            .click();
        panel = planning(page);
        await expect(panel.getByRole('combobox', { name: 'Issue epic', exact: true })).toHaveValue(data.epic.id);
        await expect(panel.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
        expect(saves).toHaveLength(1);
        expect((await readPlanning(request, data.issue.summary.id)).epicId).toBeNull();
        const readRequested = gate(), returnRead = gate();
        await page.route(endpoint, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue();
                return;
            }
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            zIssuePlanningView.parse(await response.json());
            readRequested.resolve();
            await returnRead.promise;
            await route.fulfill({ response });
        });
        try {
            await panel.getByRole('button', { name: 'Retry choices', exact: true }).click();
            await readRequested.promise;
            await expect(panel.getByRole('button', { name: 'Retry save', exact: true })).toBeDisabled();
            await expect(panel.getByRole('combobox', { name: 'Issue epic', exact: true })).toHaveValue(data.epic.id);
            expect(saves).toHaveLength(1);
        }
        finally {
            returnRead.resolve();
        }
        await expect(panel.getByRole('button', { name: 'Retry save', exact: true })).toBeEnabled();
        await panel.getByRole('button', { name: 'Retry save', exact: true }).click();
        await expect(panel.getByRole('combobox', { name: 'Issue epic', exact: true })).toBeEnabled();
        expect(saves).toHaveLength(2);
        expect(saves[1]).toEqual(saves[0]);
        expect((await readPlanning(request, data.issue.summary.id)).epicId).toBe(data.epic.id);
    }, 'web');
});
test('closing the mobile drawer protects failed planning, restores it on reopening and Cancel discards it explicitly', async ({ page, request, }) => {
    await useCase('UC-PLN-0068', async () => {
        const data = await fixture(request);
        await page.setViewportSize({ width: 390, height: 844 });
        const drawer = await openDrawer(page, request, data);
        let panel = await ready(drawer, data);
        const saves = recordSaves(page, data.issue.summary.id);
        const endpoint = '**/api/v1/issues/' + data.issue.summary.id + '/planning';
        await page.route(endpoint, async (route) => {
            if (route.request().method() === 'PUT')
                await route.abort('failed');
            else
                await route.continue();
        });
        await panel
            .getByRole('combobox', { name: 'Issue release', exact: true })
            .selectOption(data.release.id);
        await expect(panel.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
        await page.unroute(endpoint);
        let confirmations = 0;
        page.once('dialog', async (dialog) => {
            confirmations++;
            await dialog.dismiss();
        });
        await drawer.getByRole('button', { name: 'Close issue', exact: true }).click();
        await expect(drawer).toBeVisible();
        expect(confirmations).toBe(1);
        page.once('dialog', async (dialog) => {
            confirmations++;
            await dialog.accept();
        });
        await drawer.getByRole('button', { name: 'Close issue', exact: true }).click();
        await expect(drawer).toHaveCount(0);
        expect(confirmations).toBe(2);
        await page.getByRole('link', { name: data.issue.summary.title, exact: true }).click();
        await expect(drawer).toBeVisible();
        panel = planning(drawer);
        await expect(panel.getByRole('combobox', { name: 'Issue release', exact: true })).toHaveValue(data.release.id);
        await expect(panel.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
        expect(saves).toHaveLength(1);
        const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
        if (evidence)
            await page.screenshot({ path: evidence + '/planning-autosave-mobile-restored.png' });
        const confirmationRequested = gate(), returnConfirmation = gate();
        await page.route(endpoint, async (route) => {
            if (route.request().method() !== 'GET') {
                await route.continue();
                return;
            }
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            zIssuePlanningView.parse(await response.json());
            confirmationRequested.resolve();
            await returnConfirmation.promise;
            await route.fulfill({ response });
        });
        try {
            await panel.getByRole('button', { name: 'Cancel', exact: true }).click();
            await confirmationRequested.promise;
            await expect(panel.getByRole('combobox', { name: 'Issue release', exact: true })).toBeDisabled();
            await expect(panel.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0);
            expect(saves).toHaveLength(1);
        }
        finally {
            returnConfirmation.resolve();
        }
        await expect(panel.getByRole('combobox', { name: 'Issue release', exact: true })).toBeEnabled();
        await expect(panel.getByRole('combobox', { name: 'Issue release', exact: true })).toHaveValue('');
        await expect(panel.getByRole('combobox', { name: 'Issue release', exact: true })).toBeFocused();
        await expect(panel.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0);
        await drawer.getByRole('button', { name: 'Close issue', exact: true }).click();
        await expect(drawer).toHaveCount(0);
        expect(confirmations).toBe(2);
        const current = await readPlanning(request, data.issue.summary.id);
        expect(current.releaseId).toBeNull();
        expect(current.revision).toBe('0');
        expect(saves).toHaveLength(1);
    }, 'web');
});
test('an older accepted planning response cannot replace another issue after a same-route context switch', async ({ page, request, }) => {
    await useCase('UC-PLN-0070', async () => {
        const data = await fixture(request);
        const other = await createIssue(request, data.projectId);
        const linked = await request.post(apiOrigin + '/api/v1/issues/' + data.issue.summary.id + '/links', {
            headers: await headers(),
            data: {
                expectedRevision: data.issue.summary.revision,
                targetId: other.summary.id,
                kind: 'relates_to',
                enabled: true,
            },
        });
        expect(linked.status()).toBe(200);
        zSavedIssueView.parse(await linked.json());
        await signIn(page, 'member', '/issues/' + data.issue.summary.id, new RegExp('^' + data.issue.summary.title + '$'));
        const panel = await ready(page, data);
        await page.getByText('Related issues (1)', { exact: true }).click();
        const accepted = gate(), returnResponse = gate();
        const otherAccepted = gate(), returnOtherResponse = gate();
        const oldSaves = recordSaves(page, data.issue.summary.id), newSaves = recordSaves(page, other.summary.id);
        const endpoint = '**/api/v1/issues/' + data.issue.summary.id + '/planning';
        await page.route(endpoint, async (route) => {
            if (route.request().method() !== 'PUT') {
                await route.continue();
                return;
            }
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            accepted.resolve();
            await returnResponse.promise;
            await route.fulfill({ response });
        });
        await page.route('**/api/v1/issues/' + other.summary.id + '/planning', async (route) => {
            if (route.request().method() !== 'PUT') {
                await route.continue();
                return;
            }
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            otherAccepted.resolve();
            await returnOtherResponse.promise;
            await route.fulfill({ response });
        });
        try {
            await panel
                .getByRole('combobox', { name: 'Issue epic', exact: true })
                .selectOption(data.epic.id);
            await accepted.promise;
            page.once('dialog', dialog => dialog.accept());
            await page
                .getByRole('link', { name: other.summary.key + ' · ' + other.summary.title, exact: true })
                .click();
            await expect(page.getByRole('heading', { name: other.summary.title, exact: true, level: 1 })).toBeVisible();
            await ready(page, data);
            await expect(planning(page).getByRole('combobox', { name: 'Issue epic', exact: true })).toHaveValue('');
            await planning(page)
                .getByRole('combobox', { name: 'Issue release', exact: true })
                .selectOption(data.otherRelease.id);
            await otherAccepted.promise;
            const oldFinished = page.waitForEvent('requestfinished', {
                predicate: request => request.method() === 'PUT' &&
                    new URL(request.url()).pathname === '/api/v1/issues/' + data.issue.summary.id + '/planning',
            });
            returnResponse.resolve();
            await oldFinished;
            // Completing the old issue must not unlock or reset the newer pending edit.
            await expect(planning(page).getByRole('combobox', { name: 'Issue epic', exact: true })).toHaveValue('');
            await expect(planning(page).getByRole('combobox', { name: 'Issue release', exact: true })).toHaveValue(data.otherRelease.id);
            await expect(planning(page).getByRole('combobox', { name: 'Issue epic', exact: true })).toBeDisabled();
            await expect(planning(page).getByRole('combobox', { name: 'Issue release', exact: true })).toBeDisabled();
            await expect(planning(page).getByRole('status')).toContainText('Saving planning');
            expect((await readPlanning(request, other.summary.id)).epicId).toBeNull();
            await expect(planning(page).getByRole('combobox', { name: 'Issue release', exact: true })).toBeDisabled();
            returnOtherResponse.resolve();
            await expect(planning(page).getByRole('combobox', { name: 'Issue release', exact: true })).toBeEnabled();
            const current = await readPlanning(request, other.summary.id);
            expect(current.issueId).toBe(other.summary.id);
            expect(current.epicId).toBeNull();
            expect(current.releaseId).toBe(data.otherRelease.id);
            expect(oldSaves).toHaveLength(1);
            expect(newSaves).toHaveLength(1);
            expect(newSaves[0]?.body).toEqual({
                expectedRevision: '0',
                epicId: null,
                releaseId: data.otherRelease.id,
            });
            expect((await readPlanning(request, data.issue.summary.id)).epicId).toBe(data.epic.id);
        }
        finally {
            returnResponse.resolve();
            returnOtherResponse.resolve();
        }
    }, 'web');
});
