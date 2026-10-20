import { useCase } from './support/use-case';
import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import { zConfigurationView, zPageWorkflowView, zPageStageView, zPageTransitionView, zSavedWorkflowSaved, } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable, 'Requires isolated local company fixtures.');
async function headers() {
    return {
        Authorization: 'Bearer ' + (await token('owner')),
        'Idempotency-Key': crypto.randomUUID(),
    };
}
test('workflow settings prepare Arabic stages and directed moves with precise positions', async ({ page, request, }) => {
    const projectId = await isolatedProject(request);
    await signIn(page, 'owner', '/projects/' + projectId + '/workflows', /^Workflows$/);
    await expect(page.getByRole('button', { name: 'Create workflow', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Create workflow', exact: true }).click();
    await page.getByLabel('Workflow name', { exact: true }).fill('تسليم الفريق');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'تسليم الفريق', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add stage', exact: true }).click();
    await page.getByLabel('Stage name', { exact: true }).fill('جاهز');
    await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('todo');
    await page.getByLabel('Initial stage for new issues', { exact: true }).check();
    await page.getByLabel('Accept new entries', { exact: true }).check();
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'جاهز', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Add stage', exact: true }).click();
    await page.getByLabel('Stage name', { exact: true }).fill('تم');
    await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('done');
    await useCase('UC-WFL-0089', async () => {
        await page.getByLabel('Position', { exact: true }).fill('9007199254740993');
        await page.getByLabel('Accept new entries', { exact: true }).check();
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'تم', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Add move', exact: true }).click();
        await page
            .getByRole('combobox', { name: 'From stage', exact: true })
            .selectOption({ label: 'جاهز' });
        await page.getByRole('combobox', { name: 'To stage', exact: true }).selectOption({ label: 'تم' });
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(page.getByRole('row').filter({ hasText: 'جاهز' }).filter({ hasText: 'تم' })).toBeVisible();
        const flows = await request.get(apiOrigin + '/api/v2/projects/' + projectId + '/workflows', {
            headers: await headers(),
        });
        const flow = zPageWorkflowView
            .parse(await flows.json())
            .items.find(v => v.name === 'تسليم الفريق');
        expect(flow).toBeDefined();
        const stages = await request.get(apiOrigin + '/api/v2/projects/' + projectId + '/workflows/' + flow!.id + '/stages', { headers: await headers() });
        expect(zPageStageView.parse(await stages.json()).items.find(v => v.name === 'تم')?.position).toBe('9007199254740993');
    }, 'web');
    const flowId = zPageWorkflowView.parse(await (await request.get(apiOrigin + '/api/v2/projects/' + projectId + '/workflows', { headers: await headers() })).json()).items.find(v => v.name === 'تسليم الفريق')?.id;
    const moves = await request.get(apiOrigin + '/api/v2/projects/' + projectId + '/workflows/' + flowId + '/transitions', { headers: await headers() });
    expect(zPageTransitionView.parse(await moves.json()).totalMatching).toBe(1);
    await page.screenshot({ path: test.info().outputPath('workflow-settings.png'), fullPage: true });
});
test('lost workflow response freezes the draft and repeats the original reference', async ({ page, request, }) => {
    await useCase('UC-WFL-0085', async () => {
        const projectId = await isolatedProject(request);
        await signIn(page, 'owner', '/projects/' + projectId + '/workflows', /^Workflows$/);
        await page.getByRole('button', { name: 'Create workflow', exact: true }).click();
        await page.getByLabel('Workflow name', { exact: true }).fill('Retry workflow');
        let accepted = false;
        const references: string[] = [];
        await page.route('**/api/v2/projects/' + projectId + '/workflows/*', async (route) => {
            if (route.request().method() !== 'PUT') {
                await route.continue();
                return;
            }
            references.push(route.request().headers()['idempotency-key'] ?? '');
            if (!accepted) {
                const response = await route.fetch();
                expect(response.status()).toBe(200);
                zSavedWorkflowSaved.parse(await response.json());
                accepted = true;
                await route.abort('failed');
                return;
            }
            await route.continue();
        });
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(page.getByLabel('Workflow name', { exact: true })).toBeDisabled();
        await page.getByRole('button', { name: 'Retry original save', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Retry workflow', exact: true })).toBeVisible();
        expect(references).toHaveLength(2);
        expect(references[0]).not.toBe('');
        expect(references[1]).toBe(references[0]);
        const response = await request.get(apiOrigin + '/api/v2/projects/' + projectId + '/configuration', { headers: await headers() });
        expect(zConfigurationView.parse(await response.json()).revision).toBe('2');
    }, 'web');
});
test('workflow conflict review preserves the draft and blocks stale saves', async ({ page, request, }) => {
    await useCase('UC-WFL-0086', async () => {
        const projectId = await isolatedProject(request);
        await signIn(page, 'owner', '/projects/' + projectId + '/workflows', /^Workflows$/);
        await page.getByRole('button', { name: 'Create workflow', exact: true }).click();
        await page.getByLabel('Workflow name', { exact: true }).fill('Preserve my workflow');
        const peer = await request.put(apiOrigin + '/api/v2/projects/' + projectId + '/priorities/' + crypto.randomUUID(), {
            headers: await headers(),
            data: {
                expectedRevision: '1',
                key: 'peer',
                name: 'Peer priority',
                sortOrder: '4',
                retired: false,
            },
        });
        expect(peer.status()).toBe(201);
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
        await page.getByRole('button', { name: 'Review current configuration', exact: true }).click();
        await expect(page.getByLabel('Workflow name', { exact: true })).toHaveValue('Preserve my workflow');
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Preserve my workflow', exact: true })).toBeVisible();
    }, 'web');
});
