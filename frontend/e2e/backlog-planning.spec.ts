import { useCase } from './support/use-case';
import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import { zPageIssueSummary, zPageModernIssueSummary, zSavedIssueView, zSavedModernIssueView, } from '../src/app/api/generated/zod.gen';
import type { ModernIssueView } from '../src/app/api/generated/types.gen';
test.skip(!localFixturesAvailable, 'Requires disposable projects and ranked backlog operations.');
async function headers() {
    return {
        Authorization: 'Bearer ' + (await token('member')),
        'Idempotency-Key': crypto.randomUUID(),
    };
}
test('backlog ranking persists through refresh, drag ordering and selected activation retain board separation', async ({ page, request, }) => {
    const projectId = await isolatedProject(request), issues = [];
    for (const title of ['Plan A', 'Plan B', 'Plan C']) {
        const created = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
            headers: await headers(),
            data: { title, backlog: true },
        });
        expect(created.status()).toBe(201);
        issues.push(zSavedIssueView.parse(await created.json()).result);
    }
    const [a, b, c] = issues;
    if (!a || !b || !c)
        throw new Error('Missing planned fixtures.');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'member', '/backlog/' + projectId, /^Backlog$/);
    const list = page.getByRole('list', { name: 'Ranked backlog', exact: true });
    await expect(list.locator('.planned-work small')).toHaveText([
        a.summary.key,
        b.summary.key,
        c.summary.key,
    ]);
    await page
        .getByRole('button', { name: 'Rank ' + c.summary.key + ' earlier', exact: true })
        .click();
    await expect(list.locator('.planned-work small')).toHaveText([
        a.summary.key,
        c.summary.key,
        b.summary.key,
    ]);
    await page
        .getByRole('button', { name: 'Rank ' + c.summary.key + ' earlier', exact: true })
        .click();
    await expect(list.locator('.planned-work small')).toHaveText([
        c.summary.key,
        a.summary.key,
        b.summary.key,
    ]);
    const refreshed = page.waitForResponse(response => response.url().includes('/api/v1/projects/' + projectId + '/backlog') &&
        response.request().method() === 'GET' &&
        response.status() === 200);
    await page.getByRole('button', { name: 'Refresh backlog', exact: true }).click();
    await refreshed;
    await expect(page.getByRole('button', { name: 'Refresh backlog', exact: true })).toBeEnabled();
    await expect(list.locator('.planned-work small')).toHaveText([
        c.summary.key,
        a.summary.key,
        b.summary.key,
    ]);
    const grip = page.getByRole('button', { name: 'Drag ' + b.summary.key, exact: true }), first = list.getByRole('listitem').first();
    await expect(grip).toBeEnabled();
    const from = await grip.boundingBox(), to = await first.boundingBox();
    if (!from || !to)
        throw new Error('Backlog drag controls unavailable.');
    await page.mouse.move(from.x + 12, from.y + 16);
    await page.mouse.down();
    await page.mouse.move(from.x + 20, from.y + 4, { steps: 3 });
    await page.mouse.move(to.x + 60, to.y + 10, { steps: 15 });
    await page.mouse.up();
    await expect(list.locator('.planned-work small')).toHaveText([
        b.summary.key,
        c.summary.key,
        a.summary.key,
    ]);
    await page.getByRole('checkbox', { name: 'Select ' + a.summary.key, exact: true }).check();
    await page.getByRole('checkbox', { name: 'Select ' + c.summary.key, exact: true }).check();
    await page.getByRole('button', { name: 'Move 2 to board', exact: true }).click();
    await expect(list.locator('.planned-work small')).toHaveText([b.summary.key]);
    const active = zPageIssueSummary.parse(await (await request.post(apiOrigin + '/api/v1/issues/search', {
        headers: await headers(),
        data: { filters: { projectIds: [projectId], backlog: false, archived: false } },
    })).json());
    expect(active.items.map(issue => issue.id).sort()).toEqual([a.summary.id, c.summary.id].sort());
    if (process.env['GATEGOLD_E2E_EVIDENCE'])
        await page.screenshot({ path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/ranked-backlog.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await signIn(page, 'viewer', '/backlog/' + projectId, /^Backlog$/);
    await expect(page.getByRole('button', { name: /New issue/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Drag ' + b.summary.key, exact: true })).toHaveCount(0);
});
test('new backlog work is created atomically and an uncertain response retries without duplicate active issues', async ({ page, request, }) => {
    await useCase('UC-BLG-0031', async () => {
        const projectId = await isolatedProject(request);
        await signIn(page, 'member', '/backlog/' + projectId, /^Backlog$/);
        await page.getByRole('button', { name: 'New issue', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
        await dialog.getByLabel('Issue title', { exact: true }).fill('Atomic planned work');
        const references: string[] = [];
        let attempts = 0;
        await page.route('**/api/v2/projects/' + projectId + '/issues', async (route) => {
            const body: unknown = route.request().postDataJSON();
            expect(body).toMatchObject({ backlog: true });
            references.push(route.request().headers()['idempotency-key'] ?? '');
            const response = await route.fetch();
            expect(response.status()).toBe(201);
            const saved = zSavedModernIssueView.parse(await response.json());
            expect(saved.result.summary.backlog).toBe(true);
            if (++attempts === 1) {
                await route.abort('failed');
                return;
            }
            expect(saved.receipt.replayed).toBe(true);
            await route.fulfill({ response });
        });
        await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
        await expect(dialog.getByRole('alert')).toContainText('try again');
        await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue('Atomic planned work');
        await dialog.getByRole('button', { name: 'Retry original create', exact: true }).click();
        await expect(page.getByRole('list', { name: 'Ranked backlog', exact: true })).toContainText('Atomic planned work');
        expect(references).toHaveLength(2);
        expect(references[0]).toBe(references[1]);
        const planned = zPageModernIssueSummary.parse(await (await request.post(apiOrigin + '/api/v2/issues/search', {
            headers: await headers(),
            data: { filters: { projectIds: [projectId], query: 'Atomic planned work', backlog: true } },
        })).json());
        expect(planned.totalMatching).toBe(1);
        const active = zPageModernIssueSummary.parse(await (await request.post(apiOrigin + '/api/v2/issues/search', {
            headers: await headers(),
            data: {
                filters: { projectIds: [projectId], query: 'Atomic planned work', backlog: false },
            },
        })).json());
        expect(active.totalMatching).toBe(0);
    }, 'web');
});
test('a delayed creation cannot mark another project draft or upload its queued picture', async ({ page, request, }) => {
    await useCase('UC-BLG-0033', async () => {
        const firstProject = await isolatedProject(request), secondProject = await isolatedProject(request);
        await signIn(page, 'member', '/backlog/' + secondProject, /^Backlog$/);
        // Establish a same-route project change, then use the browser Back action while saving.
        const firstBacklog = page.waitForResponse(response => response.url().includes('/api/v1/projects/' + firstProject + '/backlog') &&
            response.request().method() === 'GET' &&
            response.status() === 200);
        await page.evaluate(projectId => {
            history.pushState({}, '', '/backlog/' + projectId);
            dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
        }, firstProject);
        await expect(page).toHaveURL(new RegExp('/backlog/' + firstProject + '$'));
        // pushState changes the URL before Angular finishes switching the project.
        // Open the draft only after the destination backlog has actually loaded.
        await firstBacklog;
        await expect(page.getByRole('button', { name: 'Refresh backlog', exact: true })).toBeEnabled();
        await expect(page.locator('main').getByRole('link', { name: 'Backlog', exact: true })).toHaveAttribute('href', '/backlog/' + firstProject);
        await page.getByRole('button', { name: 'New issue', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
        await dialog.getByLabel('Issue title', { exact: true }).fill('Delayed project A');
        let committed!: (issue: ModernIssueView) => void, release!: () => void;
        const firstCreated = new Promise<ModernIssueView>(resolve => {
            committed = resolve;
        });
        const releaseResponse = new Promise<void>(resolve => {
            release = resolve;
        });
        await page.route('**/api/v2/projects/' + firstProject + '/issues', async (route) => {
            const response = await route.fetch();
            expect(response.status()).toBe(201);
            committed(zSavedModernIssueView.parse(await response.json()).result);
            await releaseResponse;
            await route.fulfill({ response });
        }, { times: 1 });
        await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
        const issueA = await firstCreated;
        page.once('dialog', confirmation => confirmation.accept());
        await page.goBack();
        await expect(page).toHaveURL(new RegExp('/backlog/' + secondProject + '$'));
        await page.getByRole('button', { name: 'New issue', exact: true }).click();
        await dialog.getByLabel('Issue title', { exact: true }).fill('Independent project B');
        await useCase('UC-BLG-0007', async () => {
            const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGN8tsWNgYGBiYGBgYGBAQAXSgHkeDr16gAAAABJRU5ErkJggg==', 'base64');
            const chooser = page.waitForEvent('filechooser');
            await dialog.getByRole('button', { name: 'Attach files or pictures', exact: true }).click();
            await (await chooser).setFiles({ name: 'project-b.png', mimeType: 'image/png', buffer: png });
            await expect(dialog.getByRole('list', { name: 'Queued attachments' })).toContainText('project-b.png');
            const uploadedToA: string[] = [];
            page.on('request', outgoing => {
                if (outgoing.method() === 'POST' &&
                    outgoing.url().includes('/issues/' + issueA.summary.id + '/'))
                    uploadedToA.push(outgoing.url());
            });
            const completed = page.waitForResponse(response => response.url().endsWith('/projects/' + firstProject + '/issues') &&
                response.request().method() === 'POST');
            release();
            await completed;
            await expect(dialog).toBeVisible();
            await expect(dialog.getByLabel('Issue title', { exact: true })).toHaveValue('Independent project B');
            await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
            await expect(page.getByRole('list', { name: 'Ranked backlog', exact: true })).toContainText('Independent project B');
            const pageB = zPageModernIssueSummary.parse(await (await request.post(apiOrigin + '/api/v2/issues/search', {
                headers: await headers(),
                data: {
                    filters: { projectIds: [secondProject], query: 'Independent project B', backlog: true },
                },
            })).json());
            expect(pageB.totalMatching).toBe(1);
            expect(pageB.items[0]?.projectId).toBe(secondProject);
            expect(uploadedToA).toEqual([]);
            const issueB = pageB.items[0];
            if (!issueB)
                throw new Error('Missing second-project issue.');
            const picturesA = await request.get(apiOrigin + '/api/v1/issues/' + issueA.summary.id + '/pictures', { headers: await headers() });
            const picturesB = await request.get(apiOrigin + '/api/v1/issues/' + issueB.id + '/pictures', {
                headers: await headers(),
            });
            expect(await picturesA.json()).toMatchObject({ items: [], totalMatching: 0 });
            expect(await picturesB.json()).toMatchObject({
                totalMatching: 1,
                items: [{ filename: 'project-b.png' }],
            });
        }, 'web');
    }, 'web');
});
