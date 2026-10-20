import { useCase } from './support/use-case';
import { addFixtureStages } from './support/workflow-fixture';
import { readLayout } from './support/native-boards';
import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject } from './support/project';
import { zModernIssueView, zSavedBoardSummary, zSavedIssueView, } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable, 'Requires disposable project data and local identities.');
async function headers() {
    return {
        Authorization: 'Bearer ' + (await token('member')),
        'Idempotency-Key': crypto.randomUUID(),
    };
}
test('compact creation keeps actions visible and searchable pickers support keyboard and all label pages', async ({ page, request, }) => {
    const projectId = await isolatedProject(request);
    for (let index = 1; index <= 30; index++) {
        const made = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/labels', {
            headers: await headers(),
            data: { name: 'Audit label ' + String(index).padStart(2, '0') },
        });
        expect(made.status()).toBe(201);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await signIn(page, 'member', '/issues?projectId=' + projectId, /^Issues$/);
    await page.getByRole('button', { name: 'New issue', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Issue title', { exact: true })).toBeFocused();
    await expect(dialog.locator('.optional-fields')).not.toHaveAttribute('open');
    await expect(dialog.getByRole('button', { name: 'Create issue', exact: true })).toBeInViewport();
    await dialog.getByLabel('Issue title', { exact: true }).fill('Keyboard planning · تخطيط');
    if (process.env['GATEGOLD_E2E_EVIDENCE'])
        await page.screenshot({ path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/compact-create.png' });
    await dialog.locator('.optional-fields > summary').click();
    const assignee = dialog.getByRole('combobox', { name: 'Assignee', exact: true });
    await assignee.fill('مطور');
    await expect(dialog.getByRole('option', { name: 'مطور تجريبي', exact: true })).toBeVisible();
    await assignee.press('Home');
    await assignee.press('Enter');
    await expect(dialog.getByRole('button', { name: 'Remove مطور تجريبي', exact: true })).toBeVisible();
    await useCase('UC-ISS-0014', async () => {
        const labels = dialog.getByRole('combobox', { name: 'Labels', exact: true });
        await labels.focus();
        const list = dialog.getByRole('listbox', { name: 'Labels choices', exact: true });
        await expect(list.getByRole('option')).toHaveCount(25);
        await dialog.getByRole('button', { name: 'Load more labels choices', exact: true }).click();
        await expect(list.getByRole('option')).toHaveCount(30);
        await labels.focus();
        await labels.press('End');
        await labels.press('Enter');
        await expect(dialog.getByRole('button', { name: 'Remove Audit label 30', exact: true })).toBeVisible();
        await dialog.getByRole('button', { name: 'Done choosing', exact: true }).click();
        await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Keyboard planning · تخطيط', exact: true })).toBeVisible();
        const id = new URL(page.url()).pathname.split('/').at(-1);
        const saved = zModernIssueView.parse(await (await request.get(apiOrigin + '/api/v2/issues/' + id, { headers: await headers() })).json());
        expect(saved.summary.assignee?.displayName).toBe('مطور تجريبي');
        expect(saved.summary.labels.map(label => label.name)).toEqual(['Audit label 30']);
    }, 'web');
});
test('ten-stage board keeps one save action, independent WIP settings and precise column ordering', async ({ page, request, }) => {
    const projectId = await isolatedProject(request);
    const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
        headers: await headers(),
        data: { name: 'Large workflow', savedFilters: {} },
    });
    expect(response.status()).toBe(201);
    const board = zSavedBoardSummary.parse(await response.json()).result;
    await addFixtureStages(request, board.id, Array.from({ length: 6 }, (_, index) => 'QA عربي ' + (index + 1)));
    await signIn(page, 'member', '/boards/' + board.id + '/settings', /^Board settings$/);
    const columns = page.locator('.native-column');
    await expect(columns).toHaveCount(10);
    await expect(page.getByRole('button', { name: 'Save board settings', exact: true })).toHaveCount(1);
    await expect(page.locator('.settings-save-bar')).toContainText('Changes apply to this board.');
    await columns.nth(2).getByLabel('Work-in-progress limit', { exact: true }).fill('2');
    await columns.nth(9).getByRole('button', { name: 'Move column left', exact: true }).click();
    await page.getByRole('button', { name: 'Save board settings', exact: true }).click();
    await expect(page.getByText('Board settings saved.', { exact: true })).toBeVisible();
    await expect(page.locator('.settings-save-bar')).toContainText('All settings saved');
    const saved = await readLayout(request, board.id);
    expect(saved.columns).toHaveLength(10);
    expect(saved.columns[8]?.name).toBe('QA عربي 6');
    expect(saved.columns[2]?.wipLimit).toBe(2);
    if (process.env['GATEGOLD_E2E_EVIDENCE']) {
        await page.evaluate(() => scrollTo(0, 0));
        await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
        await page.screenshot({
            path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/focused-workflow.png',
            fullPage: true,
        });
    }
});
test('blocker search runs as you type and keyboard selection links the chosen issue', async ({ page, request, }) => {
    const projectId = await isolatedProject(request), suffix = crypto.randomUUID().slice(0, 8);
    const issue = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
        headers: await headers(),
        data: { title: 'Waiting ' + suffix },
    });
    const blocker = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
        headers: await headers(),
        data: { title: 'مراجعة ' + suffix },
    });
    const root = zSavedIssueView.parse(await issue.json()).result, candidate = zSavedIssueView.parse(await blocker.json()).result;
    await signIn(page, 'member', '/issues/' + root.summary.id, new RegExp('^Waiting ' + suffix + '$'));
    await page.getByRole('button', { name: 'Add blocker', exact: true }).click();
    const query = page.getByRole('combobox', { name: 'Find a same-project issue', exact: true });
    await query.fill('مراجعة ' + suffix);
    await expect(page.getByRole('option', { name: new RegExp(candidate.summary.key) })).toBeVisible();
    await query.press('ArrowDown');
    await query.press('Enter');
    await page.getByRole('button', { name: 'Add selected blocker', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Remove blocker ' + candidate.summary.key, exact: true })).toBeVisible();
});
