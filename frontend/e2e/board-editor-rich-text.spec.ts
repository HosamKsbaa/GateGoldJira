import { useCase } from './support/use-case';
import { readLayout } from './support/native-boards';
import { isolatedProject } from './support/project';
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { zBoardView, zModernIssueView, zSavedBoardSummary, zSavedIssueView, } from '../src/app/api/generated/zod.gen';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
const projectId = '20000000-0000-4000-8000-000000000001';
test.skip(!localFixturesAvailable, 'Requires isolated local PostgreSQL and approved accounts.');
async function headers() {
    return {
        Authorization: 'Bearer ' + (await token('member')),
        'Idempotency-Key': crypto.randomUUID(),
    };
}
async function fixture(request: APIRequestContext) {
    const projectId = await isolatedProject(request);
    const title = 'Delivery عربي ' + crypto.randomUUID().slice(0, 8);
    const created = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
        headers: await headers(),
        data: { title, description: '<h2>Legacy plain text</h2>\nالمهمة' },
    });
    expect(created.status()).toBe(201);
    const issue = zSavedIssueView.parse(await created.json()).result;
    const saved = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
        headers: await headers(),
        data: { name: title, savedFilters: { query: title } },
    });
    expect(saved.status()).toBe(201);
    return { title, issue, board: zSavedBoardSummary.parse(await saved.json()).result };
}
test('descriptions and comments accept HTML with Arabic formatting and retain safe visual editing', async ({ page, request, }) => {
    const { title, issue } = await fixture(request);
    let remoteRequests = 0;
    page.on('request', request => {
        if (request.url().includes('remote.invalid'))
            remoteRequests++;
    });
    await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
    await expect(page.locator('.issue-description')).toContainText('<h2>Legacy plain text</h2>');
    await expect(page.locator('.issue-description h2')).toHaveCount(1);
    await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit ' + issue.summary.key });
    await dialog
        .getByRole('group', { name: 'Description editing mode' })
        .getByRole('button', { name: 'HTML source', exact: true })
        .click();
    await dialog
        .getByLabel('Description HTML')
        .fill('<h2 dir="rtl">خطة التسليم</h2><p><b>متطلبات الفريق</b><script>alert(1)</script><img src="https://remote.invalid/x"></p><ul><li>مراجعة الكود</li></ul>');
    await dialog.getByRole('button', { name: 'Preview HTML', exact: true }).click();
    await expect(dialog.locator('.description-host strong')).toHaveText('متطلبات الفريق');
    await dialog.getByRole('button', { name: 'Save issue', exact: true }).click();
    await expect(page.locator('.issue-description').getByRole('heading', { name: 'خطة التسليم', exact: true })).toBeVisible();
    await expect(page.locator('.issue-description ul li')).toHaveText('مراجعة الكود');
    const commentMode = page.getByRole('group', { name: 'Comment editing mode' });
    await commentMode.getByRole('button', { name: 'HTML source', exact: true }).click();
    await page
        .getByLabel('Comment HTML')
        .fill('<h3 dir="rtl">ملاحظات المراجعة</h3><p><strong>التغيير جاهز</strong> <u>عربي</u><script>alert(1)</script><img src="https://remote.invalid/comment"></p>');
    await page.getByRole('button', { name: 'Post comment', exact: true }).click();
    const thread = page.getByRole('region', { name: 'Issue discussion', exact: true });
    await expect(thread.getByRole('heading', { name: 'ملاحظات المراجعة', exact: true })).toBeVisible();
    await expect(thread.locator('.comment-content strong')).toHaveText('التغيير جاهز');
    await expect(thread.locator('.comment-content u')).toHaveText('عربي');
    await expect(page.locator('.issue-description script,.issue-description img,.comment-content script,.comment-content img')).toHaveCount(0);
    const saved = zModernIssueView.parse(await (await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
        headers: await headers(),
    })).json());
    expect(saved.descriptionFormat).toBe('html');
    expect(saved.description).not.toContain('script');
    expect(remoteRequests).toBe(0);
    await page.setViewportSize({ width: 1440, height: 1100 });
    if (process.env['GATEGOLD_E2E_EVIDENCE'])
        await page.screenshot({
            path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/rich-text-issue.png',
            fullPage: true,
        });
    await signIn(page, 'viewer', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
    await expect(page.locator('.issue-description strong')).toHaveText('متطلبات الفريق');
    await expect(page.getByRole('button', { name: 'Edit issue', exact: true })).toHaveCount(0);
});
test('board editor persists independent names and order while project workflow restrictions remain authoritative', async ({ page, request, }) => {
    const { title, issue, board } = await fixture(request);
    const original = zBoardView.parse(await (await request.get(apiOrigin + '/api/v1/boards/' + board.id, { headers: await headers() })).json()).board;
    if (!original.workflow)
        throw new Error('Missing fixture workflow');
    const restricted = await request.put(apiOrigin + '/api/v1/boards/' + board.id, {
        headers: await headers(),
        data: {
            expectedRevision: original.revision,
            name: original.name,
            savedFilters: original.savedFilters,
            wipLimits: original.wipLimits,
            workflow: {
                columns: original.workflow.columns.map(column => ({
                    ...column,
                    allowedTargets: [
                        column.status === 'todo'
                            ? 'in_progress'
                            : column.status === 'in_progress'
                                ? 'review'
                                : column.status === 'review'
                                    ? 'done'
                                    : 'in_progress',
                    ],
                })),
            },
        },
    });
    expect(restricted.status()).toBe(200);
    await signIn(page, 'member', '/boards/' + board.id + '/settings', /^Board settings$/);
    const columns = page.locator('.native-column');
    for (const [index, name] of ['Ready جاهز', 'Building', 'Quality review', 'Shipped'].entries())
        await columns
            .nth(index)
            .getByRole('textbox', { name: 'Column ' + (index + 1), exact: true })
            .fill(name);
    await columns.nth(2).getByRole('button', { name: 'Move column left', exact: true }).click();
    await expect(columns.nth(1).getByRole('textbox')).toHaveValue('Quality review');
    await expect(page.getByRole('link', { name: 'Edit project workflows', exact: true })).toHaveAttribute('href', '/projects/' + issue.summary.projectId + '/workflows');
    await page.getByRole('button', { name: 'Save board settings', exact: true }).click();
    await expect(page.getByText('Board settings saved.', { exact: true })).toBeVisible();
    expect((await readLayout(request, board.id)).columns.map(column => column.name)).toEqual([
        'Ready جاهز',
        'Quality review',
        'Building',
        'Shipped',
    ]);
    await page.getByRole('link', { name: 'Open Kanban board', exact: true }).click();
    const card = page
        .locator('gg-native-issue-card')
        .filter({ has: page.getByRole('link', { name: title, exact: true }) });
    await card.locator('summary').click();
    await card.getByLabel('Destination column').selectOption({ label: 'Quality review' });
    await card.getByRole('button', { name: 'Choose destination', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('no eligible move');
    await card.getByLabel('Destination column').selectOption({ label: 'Building' });
    await card.getByRole('button', { name: 'Choose destination', exact: true }).click();
    await expect(page
        .getByRole('region', { name: 'Building column', exact: true })
        .getByRole('link', { name: title, exact: true })).toBeVisible();
    const saved = zModernIssueView.parse(await (await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
        headers: await headers(),
    })).json());
    expect(saved.summary.stage.category).toBe('in_progress');
    await signIn(page, 'viewer', '/boards/' + board.id + '/settings', /^Board settings$/);
    await expect(page.getByRole('textbox', { name: 'Column 1', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save board settings', exact: true })).toHaveCount(0);
});
test('a stale board editor retains its draft until current settings are explicitly reviewed', async ({ page, request, }) => {
    await useCase('UC-BRD-0082', async () => {
        const { board } = await fixture(request);
        await signIn(page, 'member', '/boards/' + board.id + '/settings', /^Board settings$/);
        await page.getByRole('textbox', { name: 'Column 3', exact: true }).fill('Unsaved عربي');
        const current = zBoardView.parse(await (await request.get(apiOrigin + '/api/v1/boards/' + board.id, { headers: await headers() })).json()).board;
        const update = await request.put(apiOrigin + '/api/v1/boards/' + board.id, {
            headers: await headers(),
            data: {
                expectedRevision: current.revision,
                name: current.name + ' remote',
                savedFilters: current.savedFilters,
                wipLimits: current.wipLimits,
            },
        });
        expect(update.status()).toBe(200);
        await page.getByRole('button', { name: 'Save board settings', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText('changed');
        await expect(page.getByRole('textbox', { name: 'Column 3', exact: true })).toHaveValue('Unsaved عربي');
        await page.getByRole('button', { name: 'Review current board', exact: true }).click();
        await expect(page.getByRole('textbox', { name: 'Column 3', exact: true })).toHaveValue('Unsaved عربي');
        await page.getByRole('textbox', { name: 'Column 3', exact: true }).fill('Reviewed عربي');
        await page.getByRole('button', { name: 'Save board settings', exact: true }).click();
        await expect(page.getByText('Board settings saved.', { exact: true })).toBeVisible();
    }, 'web');
});
test('paste pictures into both rich editors, retain private descriptions and download arbitrary files', async ({ page, request, }) => {
    const { title, issue } = await fixture(request);
    await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
    // Clipboard events use a real PNG file in the isolated browser, then the real private upload API.
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGN8tsWNgYGBiYGBgYGBAQAXSgHkeDr16gAAAABJRU5ErkJggg==';
    async function paste(selector: string, name: string) {
        await page.locator(selector).evaluate((element, { png, name }) => {
            const bytes = Uint8Array.from(atob(png), char => char.charCodeAt(0));
            const data = new DataTransfer();
            data.items.add(new File([bytes], name, { type: 'image/png' }));
            element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
        }, { png, name });
    }
    await useCase('UC-COM-0025', async () => {
        await page.getByRole('button', { name: 'Edit issue', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Edit ' + issue.summary.key });
        await dialog.getByLabel('Description', { exact: true }).fill('وصف مع صورة');
        await paste('.description-host .tiptap', 'شرح.png');
        await expect(dialog.locator('.editor-picture img')).toBeVisible();
        await dialog.getByRole('button', { name: 'Save issue', exact: true }).click();
        await expect(page.getByText('Issue saved.', { exact: true })).toBeVisible();
        await expect(page.locator('.issue-description gg-picture-image img')).toBeVisible();
        const read = zModernIssueView.parse(await (await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
            headers: await headers(),
        })).json());
        expect(read.description).toContain('data-picture-id');
        expect(read.description).not.toContain('src=');
    }, 'web');
    await useCase('UC-COM-0055', async () => {
        await page.getByRole('button', { name: 'Add comment', exact: true }).click();
        await page.getByLabel('Comment text', { exact: true }).fill('مراجعة مع صورة');
        await paste('.editor-host .tiptap', 'review.png');
        await expect(page.locator('.editor-host .editor-picture img')).toBeVisible();
        await page.getByRole('button', { name: 'Post comment', exact: true }).click();
        await expect(page.locator('.comment-content gg-picture-image img').first()).toBeVisible();
    }, 'web');
    await page.getByRole('button', { name: 'Add files', exact: true }).click();
    await page
        .locator('gg-issue-attachments')
        .getByRole('group', { name: 'Attach pictures and files', exact: true })
        .getByLabel('Choose files')
        .setInputFiles({
        name: 'design.zip',
        mimeType: 'application/zip',
        buffer: Buffer.from('opaque archive bytes'),
    });
    await page
        .locator('gg-issue-attachments')
        .getByRole('group', { name: 'Attach pictures and files', exact: true })
        .getByRole('button', { name: 'Upload queued files', exact: true })
        .click();
    await expect(page.locator('gg-issue-attachments')).toContainText('design.zip');
    await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
    await expect(page.locator('.issue-description gg-picture-image img')).toBeVisible();
    await signIn(page, 'viewer', '/issues/' + issue.summary.id, new RegExp('^' + title + '$'));
    await expect(page.locator('.issue-description gg-picture-image img')).toBeVisible();
});
