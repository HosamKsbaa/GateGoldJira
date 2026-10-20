import { useCase } from './support/use-case';
import { addFixtureStages } from './support/workflow-fixture';
import { readLayout } from './support/native-boards';
import { readNativeIssue, fixturePriority } from './support/native-issues';
import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { isolatedProject, useModernIssues } from './support/project';
import { zSavedAssetView, zSavedIssueView, zPageModernIssueSummary, zModernIssueView, zPageBoardSummary, zBoardView, zSavedBoardSummary, } from '../src/app/api/generated/zod.gen';
import type { ModernEditable } from '../src/app/api/generated/types.gen';
test.skip(!localFixturesAvailable, 'Requires the isolated local company.');
async function headers() {
    return {
        Authorization: 'Bearer ' + (await token('member')),
        'Idempotency-Key': crypto.randomUUID(),
    };
}
async function create(request: APIRequestContext, projectId: string, title: string) {
    const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
        headers: await headers(),
        data: { title },
    });
    expect(response.status()).toBe(201);
    return zSavedIssueView.parse(await response.json()).result;
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGN8tsWNgYGBiYGBgYGBAQAXSgHkeDr16gAAAABJRU5ErkJggg==', 'base64');
test('quick actions, related work, history, backlog, archive and private saved searches', async ({ page, request, }) => {
    const projectId = await isolatedProject(request), work = await create(request, projectId, 'Daily work'), other = await create(request, projectId, 'Related work');
    await signIn(page, 'member', '/issues/' + work.summary.id, /^Daily work$/);
    await page.getByRole('button', { name: 'Issue status: To do', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Review', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Issue status: Review', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Watch issue', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Watching', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Edit priority', exact: true }).click();
    await page
        .getByRole('group', { name: 'Edit priority', exact: true })
        .getByRole('option', { name: 'High', exact: true })
        .click();
    await expect(page.locator('.priority-value')).toContainText('High');
    await page.locator('summary').filter({ hasText: 'Related issues' }).click();
    await page.getByLabel('Related issue search').fill('Related work');
    await page.getByRole('button', { name: 'Link issue', exact: true }).click();
    await expect(page.getByRole('link', { name: other.summary.key + ' · Related work', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Issue activity', exact: true })).toContainText('set issue link');
    await page.getByRole('button', { name: 'Issue status: Review', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'To do', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Issue status: To do', exact: true })).toBeVisible();
    await page.locator('summary').filter({ hasText: 'More actions' }).click();
    await page.getByRole('button', { name: 'Move to backlog', exact: true }).click();
    await expect(page.getByText('In backlog · Add to the board when it is ready to start.', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'All issues', exact: true }).click();
    await page.locator('summary').filter({ hasText: 'Advanced filters' }).click();
    await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('backlog');
    await expect(page.getByRole('heading', { name: 'Results · 1', exact: true })).toBeVisible();
    await page.locator('summary').filter({ hasText: 'Saved searches' }).click();
    await page.getByLabel('Saved search name').fill('My backlog');
    await page.getByRole('button', { name: 'Save as new search', exact: true }).click();
    await expect(page.getByLabel('Saved search', { exact: true })).toContainText('My backlog');
    await page
        .getByRole('checkbox', { name: 'Select issue ' + work.summary.key, exact: true })
        .check();
    await page.getByLabel('Bulk action').selectOption('archive');
    await page.getByRole('button', { name: 'Apply to selected', exact: true }).click();
    await expect(page.getByText('1 issue(s) saved; 0 need attention.', { exact: true })).toBeVisible();
    await page.getByRole('combobox', { name: 'View', exact: true }).selectOption('archived');
    await page.getByRole('link', { name: work.summary.key + ' · Daily work', exact: true }).click();
    await page.locator('summary').filter({ hasText: 'More actions' }).click();
    await page.getByRole('button', { name: 'Restore issue', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Archive issue', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Clone issue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Copy of Daily work', exact: true })).toBeVisible();
    await signIn(page, 'viewer', '/issues?projectId=' + projectId, /^Issues$/);
    await expect(page.getByLabel('Saved search', { exact: true })).not.toContainText('My backlog');
    await page.getByRole('link', { name: work.summary.key + ' · Daily work', exact: true }).click();
    await page.getByRole('tab', { name: 'History', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Issue activity', exact: true })).toContainText('organize issue');
    await expect(page.getByRole('button', { name: /^Issue status:/ })).toHaveCount(0);
});
test('creation keeps a draft and retries partial picture/file uploads without duplicate issues', async ({ page, request, }) => {
    const projectId = await isolatedProject(request);
    await signIn(page, 'member', '/issues?projectId=' + projectId, /^Issues$/);
    await page.getByRole('button', { name: 'New issue', exact: true }).click();
    await page.getByLabel('Issue title', { exact: true }).fill('Draft with uploads');
    await page.getByLabel('Description', { exact: true }).fill('وصف محفوظ');
    const dialog = page.getByRole('dialog');
    page.once('dialog', prompt => prompt.accept());
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'New issue', exact: true }).click();
    await expect(page.getByLabel('Issue title', { exact: true })).toHaveValue('Draft with uploads');
    const chooserEvent = page.waitForEvent('filechooser');
    await dialog
        .locator('gg-description-editor')
        .getByRole('button', { name: 'Attach files or pictures', exact: true })
        .click();
    await (await chooserEvent).setFiles([
        { name: 'picture.png', mimeType: 'image/png', buffer: png },
        { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('file content') },
    ]);
    await expect(dialog.getByRole('list', { name: 'Queued attachments', exact: true })).toContainText('notes.txt');
    let uploads = 0;
    const refs: string[] = [];
    await page.route('**/api/v1/asset-uploads/*/finalize', async (route) => {
        if (route.request().method() !== 'POST') {
            await route.continue();
            return;
        }
        const response = await route.fetch();
        expect(response.status()).toBe(201);
        const asset = zSavedAssetView.parse(await response.json()).result;
        if (asset.kind === 'file') {
            refs.push(route.request().headers()['idempotency-key'] ?? '');
            if (++uploads === 1) {
                await route.abort('failed');
                return;
            }
        }
        await route.fulfill({ response });
    });
    await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
    await expect(dialog).toContainText('Upload failed; retry Save');
    await expect(page.getByLabel('Issue title', { exact: true })).toHaveValue('Draft with uploads');
    await dialog.getByRole('button', { name: 'Retry original create', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Draft with uploads', exact: true })).toBeVisible();
    await expect(page.locator('.issue-description gg-picture-image img')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download notes.txt', exact: true })).toBeVisible();
    expect(refs).toHaveLength(1);
    expect(refs[0]).toBeTruthy();
    const search = zPageModernIssueSummary.parse(await (await request.post(apiOrigin + '/api/v2/issues/search', {
        headers: await headers(),
        data: { filters: { projectIds: [projectId], query: 'Draft with uploads' } },
    })).json());
    expect(search.totalMatching).toBe(1);
});
test('comment draft survives navigation and foreground refresh preserves local editing', async ({ page, request, }) => {
    const projectId = await isolatedProject(request), work = await create(request, projectId, 'Polling work');
    await signIn(page, 'member', '/issues/' + work.summary.id, /^Polling work$/);
    await page.clock.install();
    const editor = page.getByRole('textbox', { name: 'Comment text', exact: true });
    await page
        .locator('gg-comment-editor')
        .getByRole('button', { name: 'HTML source', exact: true })
        .click();
    await page
        .getByLabel('Comment HTML', { exact: true })
        .fill('<p dir="rtl">تعليق لم يتم إرساله</p>');
    let leaveWarning = false;
    page.once('dialog', dialog => {
        leaveWarning = true;
        return dialog.accept();
    });
    await page.getByRole('link', { name: 'All issues', exact: true }).click();
    expect(leaveWarning).toBe(true);
    await page.getByRole('link', { name: work.summary.key + ' · Polling work', exact: true }).click();
    await expect(editor).toContainText('تعليق لم يتم إرساله');
    const current = zModernIssueView.parse(await (await request.get(apiOrigin + '/api/v2/issues/' + work.summary.id, {
        headers: await headers(),
    })).json());
    const editable: ModernEditable = {
        title: 'Polling work updated',
        description: current.description,
        descriptionFormat: current.descriptionFormat,
        typeId: current.summary.type.id,
        priorityId: current.summary.priority.id,
        assigneeId: null,
        dueDate: null,
        labelIds: [],
    };
    expect((await request.put(apiOrigin + '/api/v2/issues/' + work.summary.id, {
        headers: await headers(),
        data: { expectedRevision: current.summary.revision, editable },
    })).status()).toBe(200);
    await page.clock.runFor(31000);
    await expect(page.getByRole('heading', { name: 'Polling work', exact: true })).toBeVisible();
    await expect(editor).toContainText('تعليق لم يتم إرساله');
    await page.getByRole('button', { name: 'Post comment', exact: true }).click();
    await expect(page.getByText('Comment posted.', { exact: true })).toBeVisible();
    await page.clock.runFor(31000);
    await expect(page.getByRole('heading', { name: 'Polling work updated', exact: true })).toBeVisible();
});
test('closed workflow stages migrate occupied work explicitly before retirement without losing issues', async ({ page, request, }) => {
    await useCase('UC-WFL-0037', async () => {
        const projectId = await isolatedProject(request);
        const listed = zPageBoardSummary.parse(await (await request.get(apiOrigin + '/api/v1/projects/' + projectId + '/boards', {
            headers: await headers(),
        })).json());
        const board = listed.items[0]!;
        const layout = await addFixtureStages(request, board.id, ['QA عربي']);
        const qa = layout.columns.find(column => column.name === 'QA عربي')!.stages[0]!.stage;
        const historic = zBoardView.parse(await (await request.get(apiOrigin + '/api/v1/boards/' + board.id, { headers: await headers() })).json());
        const initialStatus = historic.board.workflow!.columns.find(column => column.name === 'QA عربي')!.status;
        const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
            headers: await headers(),
            data: { title: 'QA work', initialStatus },
        });
        expect(response.status()).toBe(201);
        const work = zSavedIssueView.parse(await response.json()).result;
        await useModernIssues(projectId);
        await signIn(page, 'owner', '/projects/' + projectId + '/workflows', /^Workflows$/);
        await page.getByRole('button', { name: 'Edit stage QA عربي', exact: true }).click();
        await page.getByLabel('Accept new entries', { exact: true }).uncheck();
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0);
        expect((await readNativeIssue(request, work.summary.id)).summary.stage.id).toBe(qa.id);
        await page.getByRole('button', { name: 'Migrate issues', exact: true }).click();
        await page
            .getByRole('combobox', { name: 'Closed source stage', exact: true })
            .selectOption(qa.id);
        await page
            .getByRole('combobox', { name: 'Target stage', exact: true })
            .selectOption({ label: 'Review · review' });
        await page.getByRole('button', { name: 'Migrate batch', exact: true }).click();
        await expect
            .poll(async () => (await readNativeIssue(request, work.summary.id)).summary.stage.name)
            .toBe('Review');
        await page.getByRole('button', { name: 'Edit stage QA عربي', exact: true }).click();
        await page.getByLabel('Retire this empty stage', { exact: true }).check();
        await page.getByRole('button', { name: 'Save changes', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toHaveCount(0);
        const saved = await readNativeIssue(request, work.summary.id);
        expect(saved.summary.id).toBe(work.summary.id);
        expect(saved.summary.title).toBe('QA work');
        expect(saved.summary.stage.category).toBe('review');
        expect((await readLayout(request, board.id)).columns
            .flatMap(column => column.stages)
            .find(mapping => mapping.stage.id === qa.id)?.stage.retired).toBe(true);
    }, 'web');
});
test('inline and bulk edits keep newer server changes until explicit review', async ({ page, request, }) => {
    const projectId = await isolatedProject(request), work = await create(request, projectId, 'Concurrent work');
    await signIn(page, 'member', '/issues/' + work.summary.id, /^Concurrent work$/);
    await page.getByRole('button', { name: 'Edit priority', exact: true }).click();
    const editable: ModernEditable = {
        title: 'Concurrent work changed',
        description: 'Saved by another developer',
        descriptionFormat: 'plain',
        typeId: (await readNativeIssue(request, work.summary.id)).summary.type.id,
        priorityId: await fixturePriority(request, projectId, 'low'),
        assigneeId: null,
        dueDate: null,
        labelIds: [],
    };
    const updated = await request.put(apiOrigin + '/api/v2/issues/' + work.summary.id, {
        headers: await headers(),
        data: { expectedRevision: work.summary.revision, editable },
    });
    expect(updated.status()).toBe(200);
    await page
        .getByRole('group', { name: 'Edit priority', exact: true })
        .getByRole('option', { name: 'High', exact: true })
        .click();
    await expect(page.getByRole('button', { name: 'Review latest and keep my draft', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Review latest and keep my draft', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Concurrent work changed', exact: true })).toBeVisible();
    await expect(page
        .getByRole('group', { name: 'Edit priority', exact: true })
        .getByRole('option', { name: 'High', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page
        .getByRole('group', { name: 'Edit priority', exact: true })
        .getByRole('button', { name: 'Apply reviewed change', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('group', { name: 'Edit priority', exact: true })).toHaveCount(0);
    await page.getByRole('link', { name: 'All issues', exact: true }).click();
    await page
        .getByRole('checkbox', { name: 'Select issue ' + work.summary.key, exact: true })
        .check();
    const current = zModernIssueView.parse(await (await request.get(apiOrigin + '/api/v2/issues/' + work.summary.id, {
        headers: await headers(),
    })).json());
    expect((await request.put(apiOrigin + '/api/v2/issues/' + work.summary.id, {
        headers: await headers(),
        data: {
            expectedRevision: current.summary.revision,
            editable: {
                ...editable,
                priorityId: await fixturePriority(request, projectId, 'medium'),
            },
        },
    })).status()).toBe(200);
    await page.getByLabel('Bulk priority').selectOption({ label: 'High' });
    await page.getByRole('button', { name: 'Apply to selected', exact: true }).click();
    await expect(page.getByText('0 issue(s) saved; 1 need attention.', { exact: true })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Select issue ' + work.summary.key, exact: true })).toBeChecked();
    const final = zModernIssueView.parse(await (await request.get(apiOrigin + '/api/v2/issues/' + work.summary.id, {
        headers: await headers(),
    })).json());
    expect(final.summary.priority.key).toBe('medium');
    expect(final.description).toBe('Saved by another developer');
});
test('multiple document references publish inside Arabic rich comments and open private previews', async ({ page, request, }) => {
    const projectId = await isolatedProject(request), work = await create(request, projectId, 'Inline files');
    await signIn(page, 'member', '/issues/' + work.summary.id, /^Inline files$/);
    const composer = page.locator('gg-comment-editor');
    await composer.getByRole('textbox', { name: 'Comment text', exact: true }).fill('راجع الملفات: ');
    await composer.getByRole('button', { name: 'Attach files or pictures', exact: true }).click();
    const queue = composer.locator('gg-file-queue');
    await queue.getByLabel('Choose files').setInputFiles([
        { name: 'متطلبات.txt', mimeType: 'text/plain', buffer: Buffer.from('Arabic requirements') },
        { name: 'data.csv', mimeType: 'text/csv', buffer: Buffer.from('name,value\nfirst,1') },
    ]);
    await queue.getByRole('button', { name: 'Upload queued files', exact: true }).click();
    await expect(queue.getByRole('button', { name: 'Upload queued files', exact: true })).toBeDisabled();
    await expect(composer.getByRole('textbox', { name: 'Comment text', exact: true })).toContainText('data.csv');
    await page.getByRole('button', { name: 'Post comment', exact: true }).click();
    await expect(page.getByText('Comment posted.', { exact: true })).toBeVisible();
    const reference = page
        .locator('gg-attachment-reference')
        .getByRole('button', { name: 'متطلبات.txt', exact: true });
    await reference.click();
    const preview = page.getByRole('dialog', { name: 'Attachment preview', exact: true });
    await expect(preview.getByRole('link', { name: 'Download file', exact: true })).toHaveAttribute('href', /^blob:/);
    await preview.getByRole('button', { name: 'Close attachment preview', exact: true }).click();
    await signIn(page, 'viewer', '/issues/' + work.summary.id, /^Inline files$/);
    await reference.click();
    await expect(preview.getByRole('link', { name: 'Download file', exact: true })).toHaveAttribute('href', /^blob:/);
});
test('foreground refresh waits for an in-flight quick edit', async ({ page, request }) => {
    const projectId = await isolatedProject(request), work = await create(request, projectId, 'Pending action');
    await page.clock.install();
    await signIn(page, 'member', '/issues/' + work.summary.id, /^Pending action$/);
    let issueReads = 0;
    page.on('request', request => {
        if (request.method() === 'GET' && request.url().endsWith('/api/v2/issues/' + work.summary.id))
            issueReads++;
    });
    let release: () => void = () => { };
    const held = new Promise<void>(resolve => {
        release = resolve;
    });
    let started: () => void = () => { };
    const intercepted = new Promise<void>(resolve => {
        started = resolve;
    });
    await page.route('**/api/v2/issues/' + work.summary.id + '/fields', async (route) => {
        if (route.request().method() !== 'PATCH') {
            await route.continue();
            return;
        }
        started();
        await held;
        await route.continue();
    });
    await page.getByRole('button', { name: 'Edit priority', exact: true }).click();
    await page
        .getByRole('group', { name: 'Edit priority', exact: true })
        .getByRole('option', { name: 'High', exact: true })
        .click();
    await intercepted;
    await expect(page.getByRole('button', { name: 'Edit priority', exact: true })).toBeDisabled();
    try {
        await page.clock.runFor(31000);
        expect(issueReads).toBe(0);
    }
    finally {
        release();
    }
    await expect(page.getByRole('button', { name: 'Edit priority', exact: true })).toBeEnabled();
    await expect(page.locator('.priority-value')).toContainText('High');
    await expect(page.getByRole('group', { name: 'Edit priority', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Refresh attachments', exact: true })).toBeEnabled();
    await page.clock.runFor(31000);
    await expect.poll(() => issueReads).toBeGreaterThan(0);
});
