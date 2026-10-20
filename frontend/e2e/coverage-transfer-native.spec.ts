import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { isolatedProject, useModernIssues } from './support/project';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { read, save, authorization, memberId, viewerId } from './support/coverage-access';
import { zImportPreview, zSavedImportResult, zModernIssueView, zSavedModernIssueView, zSavedIssueView, zSavedMembershipView, zSavedUserView, zConfigurationView, zSavedTypeSaved, zPageTypeView, zPageBindingView, zSavedConfigurationView, zSavedPrioritySaved, zIssueFailureBody } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable, 'Requires the real isolated web application, PostgreSQL and local accounts.');
test.use({ trace: 'off' });
const web = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
const importEndpoint = (projectId: string) => '/api/v1/projects/' + projectId + '/issues/import';
async function load(page: Page, csv: string, mapping: Record<string, string> = {}) {
    const reset = page.getByRole('button', { name: 'Start a new import', exact: true });
    if (await reset.count())
        await reset.click();
    await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles({ name: 'owned-native.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await expect(page.getByText('owned-native.csv', { exact: true })).toBeVisible();
    for (const [field, column] of Object.entries(mapping))
        await page.locator('#map-' + field).selectOption(column);
}
async function preview(page: Page, projectId: string) {
    const reply = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/projects/' + projectId + '/issues/import-preview');
    await page.getByRole('button', { name: 'Preview import', exact: true }).click();
    const response = await reply;
    expect(response.status()).toBe(200);
    const data = zImportPreview.parse(await response.json());
    await expect(page.getByRole('table', { name: 'Import preview', exact: true }).locator('tbody tr')).toHaveCount(data.rows.length);
    await expect(page.locator('.preview-summary')).toContainText(data.validCount + ' valid rows');
    await expect(page.locator('.preview-summary')).toContainText(data.errorCount + ' rows need attention');
    return data;
}
async function importRows(page: Page, projectId: string, backlog = false) {
    await page.getByRole('checkbox', { name: 'Put imported unstarted work in Backlog', exact: true }).setChecked(backlog);
    await page.getByRole('checkbox', { name: 'I reviewed this preview and want to import its valid rows.', exact: true }).check();
    const reply = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === importEndpoint(projectId));
    await page.getByRole('button', { name: /^(Import valid rows|Retry failed rows)$/ }).click();
    const response = await reply;
    expect(response.status()).toBe(200);
    const data = zSavedImportResult.parse(await response.json());
    const result = page.getByRole('region', { name: 'Import result', exact: true });
    await expect(result).toBeVisible();
    await expect(result.locator('.result-rows >li')).toHaveCount(data.result.rows.length);
    await expect(result.getByRole('status')).toContainText(data.result.createdCount + ' created');
    await expect(result.getByRole('status')).toContainText(data.result.existingCount + ' existing');
    await expect(result.getByRole('status')).toContainText(data.result.failedCount + ' failed');
    return data;
}
async function download(page: Page) {
    const ready = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const file = await ready;
    const stream = await file.createReadStream();
    if (!stream)
        throw new Error('Expected a real downloaded CSV stream.');
    const chunks: Buffer[] = [];
    for await (const chunk of stream)
        chunks.push(Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
}
for (const [id, csv, message, rejectedAtIntake] of [
    ['UC-CSV-0011', '"Unclosed\nTitle\n', /header|heading|quoted/i, true],
    ['UC-CSV-0012', 'Title\n', /data row/i, false],
    ['UC-CSV-0013', Array.from({ length: 31 }, (_, n) => 'c' + n).join(',') + '\n' + Array(31).fill('v').join(','), /30/i, false],
    ['UC-CSV-0014', 'Title,\nValid,empty\n', /nonempty|unique|empty|heading/i, true],
    ['UC-CSV-0015', 'Title,title\nValid,duplicate\n', /nonempty|unique|duplicate/i, false],
    ['UC-CSV-0016', 'Title,Notes\nValid,"unclosed\n', /quoting|column count/i, false],
    ['UC-CSV-0017', 'Title,Notes\nOne\n', /quoting|column count/i, false],
    ['UC-CSV-0018', 'Title\n' + Array.from({ length: 101 }, (_, n) => 'Row ' + n).join('\n'), /100/i, false],
    ['UC-CSV-0023', 'Work\nValid\n', /Title|Summary/i, false],
] as const)
    test('native CSV structural rejection ' + id + ' preserves its exact boundary without accepting work', async ({ page, request }) => {
        // Each parser boundary starts with its own page/project so an earlier
        // invalid file or delayed File.arrayBuffer cannot satisfy this outcome.
        const projectId = await isolatedProject(request);
        await signIn(page, 'member', '/projects/' + projectId + '/import-export', /^Import and export$/);
        await web(id, async () => {
            const filename = id.toLowerCase() + '.csv';
            await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles({ name: filename, mimeType: 'text/csv', buffer: Buffer.from(csv) });
            if (rejectedAtIntake) {
                await expect(page.getByRole('alert')).toContainText(message);
                await expect(page.getByText(filename, { exact: true })).toHaveCount(0);
                await expect(page.getByRole('button', { name: 'Preview import', exact: true })).toHaveCount(0);
            } else {
                await expect(page.getByText(filename, { exact: true })).toBeVisible();
                const reply = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/projects/' + projectId + '/issues/import-preview');
                await page.getByRole('button', { name: 'Preview import', exact: true }).click();
                const response = await reply;
                expect(response.status()).toBe(422);
                const failure = zIssueFailureBody.parse(await response.json());
                expect(failure.error.code).toBe('validation_failed');
                expect(failure.error.nextAction).toBe('review_fields');
                await expect(page.getByRole('alert')).toContainText(message);
            }
            await expect(page.getByRole('table', { name: 'Import preview', exact: true })).toHaveCount(0);
            await expect(page.getByRole('button', { name: 'Import valid rows', exact: true })).toHaveCount(0);
        });
    });
test('native preview maps real headings and explains exact invalid row values as the user sees them', async ({ page, request }) => {
    const projectId = await isolatedProject(request);
    await useModernIssues(projectId);
    await signIn(page, 'member', '/projects/' + projectId + '/import-export', /^Import and export$/);
    for (const [id, csv, title, mapping] of [
        ['UC-CSV-0009', '\uFEFFTitle\r\nBOM accepted\r\n', 'BOM accepted', {}],
        ['UC-CSV-0019', 'Summary,Description\nAutomatic heading,Content\n', 'Automatic heading', {}],
        ['UC-CSV-0020', 'Work,Notes\nCustom heading,Content\n', 'Custom heading', { title: 'Work', description: 'Notes' }],
        ['UC-CSV-0010', 'Title,Description\r\n"Quoted, ""value""","Line one\nLine two"\r\n', 'Quoted, "value"', {}],
    ] as const)
        await web(id, async () => {
            await load(page, csv, mapping);
            const result = await preview(page, projectId);
            expect(result.headers[0]).not.toContain('\uFEFF');
            expect(result.rows[0]?.errors).toEqual([]);
            await expect(page.getByRole('table', { name: 'Import preview', exact: true }).locator('tbody tr').first().locator('td').nth(1)).toHaveText(title);
            if (id === 'UC-CSV-0010') {
                const saved = await importRows(page, projectId);
                const issue = await read(request, '/api/v2/issues/' + saved.result.rows[0]!.issueId, zModernIssueView);
                expect(issue.description).toBe('Line one\nLine two');
            }
        });
    for (const [id, csv, field, message] of [
        ['UC-CSV-0031', 'Title,Type\nChild without parent,subtask\n', 'type', /parent|standard/i],
        ['UC-CSV-0034', 'Title,Assignee\nViewer assignment,' + viewerId + '\n', 'assignee', /eligible/i],
        ['UC-CSV-0035', 'Title,Due date\nImpossible date,2026-02-30\n', 'dueDate', /YYYY-MM-DD/i],
        ['UC-CSV-0037', 'Title,SourceKey\nLong source,' + 'x'.repeat(201) + '\n', 'sourceKey', /200/i],
        ['UC-CSV-0040', 'Title,sourceKey,sourceKeyEncoding\nWrong encoding,eA,base64-v2\n', 'sourceKey', /encoding/i],
        ['UC-CSV-0030', 'Title,priorityId\nForeign UUID,' + crypto.randomUUID() + '\n', 'priority', /priority|eligible|available|project/i],
    ] as const)
        await web(id, async () => {
            await load(page, csv);
            const result = await preview(page, projectId);
            expect(result.validCount).toBe(0n);
            expect(result.errorCount).toBe(1n);
            const errors = page.locator('.row-errors');
            await expect(errors).toContainText(field + ':');
            await expect(errors).toContainText(message);
            await expect(page.getByRole('button', { name: 'Import valid rows', exact: true })).toBeDisabled();
        });
    await web('UC-CSV-0038', async () => {
        await load(page, 'Title,SourceKey\nOne,SAME-1\nTwo,SAME-1\n');
        const result = await preview(page, projectId);
        expect(result.validCount).toBe(1n);
        await expect(page.getByRole('table', { name: 'Import preview', exact: true }).locator('tbody tr').nth(1)).toContainText('row 2');
    });
    await web('UC-CSV-0039', async () => {
        const original = 'معرف، خاص =1';
        await load(page, 'Title,sourceKey,sourceKeyEncoding\nDecoded,' + Buffer.from(original).toString('base64url') + ',base64url-v1\n');
        const result = await preview(page, projectId);
        expect(result.validCount).toBe(1n);
        await expect(page.getByRole('table', { name: 'Import preview', exact: true }).locator('tbody tr').first().locator('td').nth(2)).toHaveText(original);
    });
});
test('native confirmed import retains Unicode labels, safe rich text, partial failures, source identity and export views', async ({ page, request }) => {
    const projectId = await isolatedProject(request);
    await useModernIssues(projectId);
    await signIn(page, 'member', '/projects/' + projectId + '/import-export', /^Import and export$/);
    const csv = 'Title,Description,descriptionFormat,Labels,SourceKey\nمهمة عربية 😀,وصف عربي,plain,واجهة;عاجل;واجهة,ARABIC-1\nSafe HTML,"<p>Safe <strong>content</strong></p><script>alert(1)</script>",html,,HTML-1\n,Invalid,plain,,INVALID-1\n';
    await load(page, csv);
    await preview(page, projectId);
    const saved = await web('UC-CSV-0051', async () => {
        const data = await importRows(page, projectId, true);
        expect(data.result.createdCount).toBe(2n);
        expect(data.result.failedCount).toBe(1n);
        for (const row of data.result.rows.filter(value => value.status === 'created'))
            await expect(page.getByRole('region', { name: 'Import result', exact: true }).getByRole('link', { name: row.key!, exact: true })).toHaveAttribute('href', '/issues/' + row.issueId);
        return data;
    });
    const firstId = saved.result.rows[0]!.issueId!, secondId = saved.result.rows[1]!.issueId!;
    await web('UC-CSV-0055', async () => {
        await expect(page.locator('.result-rows >li').nth(2)).toContainText('failed');
        await expect(page.locator('.result-rows >li').nth(2).locator('.row-errors')).toContainText('title:');
        for (const row of saved.result.rows.slice(0, 2))
            expect((await read(request, '/api/v2/issues/' + row.issueId, zModernIssueView)).summary.title).toBe(row.title);
    });
    await web('UC-CSV-0052', async () => {
        await expect(page.getByRole('checkbox', { name: 'Put imported unstarted work in Backlog', exact: true })).toBeChecked();
        for (const id of [firstId, secondId])
            expect((await read(request, '/api/v2/issues/' + id, zModernIssueView)).summary.backlog).toBe(true);
    });
    await web('UC-CSV-0041', async () => {
        await expect(page.locator('.result-rows >li').first().locator('strong[dir=auto]')).toHaveText('مهمة عربية 😀');
        const issue = await read(request, '/api/v2/issues/' + firstId, zModernIssueView);
        expect(issue.summary.title).toBe('مهمة عربية 😀');
        expect(issue.description).toBe('وصف عربي');
        expect(issue.summary.labels.map(value => value.name).sort()).toEqual(['واجهة', 'عاجل'].sort());
    });
    await web('UC-CSV-0036', async () => {
        await expect(page.locator('.result-rows >li').first().locator('.row-state')).toHaveText('created');
        const issue = await read(request, '/api/v2/issues/' + firstId, zModernIssueView);
        expect(issue.summary.labels.map(value => value.name).sort()).toEqual(['واجهة', 'عاجل'].sort());
    });
    await web('UC-CSV-0042', async () => {
        const issue = await read(request, '/api/v2/issues/' + secondId, zModernIssueView);
        expect(issue.descriptionFormat).toBe('html');
        expect(issue.description).toContain('<strong>content</strong>');
        expect(issue.description).not.toContain('<script');
        expect(issue.description).not.toContain('alert(1)');
        await expect(page.locator('.result-rows >li').nth(1).locator('.row-state')).toHaveText('created');
    });
    await web('UC-CSV-0053', async () => {
        await load(page, 'Title,SourceKey\nRetained source,ARABIC-1\n');
        await preview(page, projectId);
        await expect(page.getByRole('link', { name: 'Existing issue · will reuse', exact: true })).toHaveAttribute('href', '/issues/' + firstId);
        const replay = await importRows(page, projectId);
        expect(replay.result.existingCount).toBe(1n);
        expect(replay.result.createdCount).toBe(0n);
        expect(replay.result.rows[0]?.issueId).toBe(firstId);
        await expect(page.locator('.result-rows >li').first().locator('.row-state')).toHaveText('existing');
    });
    const active = (await save(request, '/api/v2/projects/' + projectId + '/issues', { title: 'Only active work ' + crypto.randomUUID(), description: '=2+2', descriptionFormat: 'plain' }, zSavedModernIssueView, { method: 'POST', status: 201 })).result;
    for (const [id, view, present, absent] of [
        ['UC-CSV-0059', 'all', ['مهمة عربية 😀', 'Safe HTML', active.summary.title], []],
        ['UC-CSV-0060', 'active', [active.summary.title], ['مهمة عربية 😀', 'Safe HTML']],
        ['UC-CSV-0061', 'backlog', ['مهمة عربية 😀', 'Safe HTML'], [active.summary.title]],
    ] as const)
        await web(id, async () => {
            await page.getByRole('combobox', { name: 'Work to export', exact: true }).selectOption(view);
            const csv = await download(page);
            for (const text of present)
                expect(csv).toContain(text);
            for (const text of absent)
                expect(csv).not.toContain(text);
            await expect(page.getByText('CSV downloaded with ' + present.length + ' matching issues.', { exact: true })).toBeVisible();
        });
    await web('UC-CSV-0065', async () => {
        await page.getByRole('combobox', { name: 'Work to export', exact: true }).selectOption('all');
        const csv = await download(page);
        expect(csv).toContain("'=2+2");
        expect(csv).toContain(Buffer.from('ARABIC-1').toString('base64url'));
        expect(csv).toContain('base64url-v1');
    });
    await web('UC-CSV-0063', async () => {
        await page.getByLabel('Issue key or title', { exact: true }).fill('مهمة عربية');
        const csv = await download(page);
        expect(csv).toContain('مهمة عربية 😀');
        expect(csv).not.toContain('Safe HTML');
        expect(csv).not.toContain(active.summary.title);
        await expect(page.getByText('CSV downloaded with 1 matching issues.', { exact: true })).toBeVisible();
    });
    await page.getByLabel('Issue key or title', { exact: true }).fill('');
    const latest = await read(request, '/api/v2/issues/' + firstId, zModernIssueView);
    await save(request, '/api/v1/issues/' + firstId + '/organize', { expectedRevision: latest.summary.revision, archived: true }, zSavedIssueView, { method: 'POST' });
    await web('UC-CSV-0062', async () => {
        await page.getByRole('combobox', { name: 'Work to export', exact: true }).selectOption('archived');
        const csv = await download(page);
        expect(csv).toContain('مهمة عربية 😀');
        expect(csv).not.toContain('Safe HTML');
        expect(csv).not.toContain(active.summary.title);
        await expect(page.getByText('CSV downloaded with 1 matching issues.', { exact: true })).toBeVisible();
    });
});
test('native preview and actual confirmed import resolve scoped custom choices and eligible people without guessing', async ({ page, request }) => {
    const projectId = await isolatedProject(request);
    await useModernIssues(projectId);
    const root = '/api/v2/projects/' + projectId;
    let config = await read(request, root + '/configuration', zConfigurationView);
    const typeId = crypto.randomUUID();
    config = (await save(request, root + '/issue-types/' + typeId, { expectedRevision: config.revision, key: 'story', name: 'User story', behavior: 'standard', retired: false }, zSavedTypeSaved, { status: 201 })).result.configuration;
    const defaults = await read(request, root + '/issue-types', zPageTypeView);
    const binding = (await read(request, root + '/issue-types/' + defaults.items.find(v => v.default && v.behavior === 'standard')!.id + '/workflows', zPageBindingView)).items.find(v => v.default)!;
    config = (await save(request, root + '/issue-types/' + typeId + '/workflows/' + binding.workflowId, { expectedRevision: config.revision, default: true, acceptsNew: true }, zSavedConfigurationView)).result;
    const priorityId = crypto.randomUUID();
    config = (await save(request, root + '/priorities/' + priorityId, { expectedRevision: config.revision, key: 'critical', name: 'Critical team', sortOrder: '6', retired: false }, zSavedPrioritySaved, { status: 201 })).result.configuration;
    await signIn(page, 'member', '/projects/' + projectId + '/import-export', /^Import and export$/);
    for (const [id, csv] of [
        ['UC-CSV-0026', 'Title,Type\nStory via key,story\n'],
        ['UC-CSV-0027', 'Title,typeId,priorityId\nScoped UUID choices,' + typeId + ',' + priorityId + '\n'],
        ['UC-CSV-0028', 'Title,Type,Priority\nUnique display names,User story,Critical team\n'],
    ] as const)
        await web(id, async () => {
            await load(page, csv);
            const valid = await preview(page, projectId);
            expect(valid.validCount).toBe(1n);
            await expect(page.locator('.valid-row')).toHaveText('Ready to import');
            const saved = await importRows(page, projectId);
            const issue = await read(request, '/api/v2/issues/' + saved.result.rows[0]!.issueId, zModernIssueView);
            expect(issue.summary.type.id).toBe(typeId);
            if (id !== 'UC-CSV-0026')
                expect(issue.summary.priority.id).toBe(priorityId);
        });
    config = (await save(request, root + '/priorities/' + crypto.randomUUID(), { expectedRevision: config.revision, key: 'same_name', name: 'Critical team', sortOrder: '7', retired: false }, zSavedPrioritySaved, { status: 201 })).result.configuration;
    await web('UC-CSV-0029', async () => {
        await load(page, 'Title,Priority\nAmbiguous name,Critical team\n');
        const data = await preview(page, projectId);
        expect(data.validCount).toBe(0n);
        await expect(page.locator('.row-errors')).toContainText(/unique|ambiguous/i);
        await expect(page.getByRole('button', { name: 'Import valid rows', exact: true })).toBeDisabled();
    });
    await web('UC-CSV-0032', async () => {
        for (const value of [memberId, 'مطور تجريبي', 'member@example.test']) {
            await load(page, 'Title,Assignee\nIntended person,' + value + '\n');
            expect((await preview(page, projectId)).validCount).toBe(1n);
            const saved = await importRows(page, projectId);
            expect((await read(request, '/api/v2/issues/' + saved.result.rows[0]!.issueId, zModernIssueView)).summary.assignee?.id).toBe(memberId);
        }
    });
    const displayName = 'Shared name ' + crypto.randomUUID().slice(0, 8), ownedUsers: string[] = [];
    for (let n = 0; n < 2; n++) {
        const user = (await save(request, '/api/v1/admin/users', { email: crypto.randomUUID() + '@example.test', displayName, administrator: false }, zSavedUserView, { method: 'POST', status: 201 })).result;
        ownedUsers.push(user.id);
        await save(request, '/api/v1/projects/' + projectId + '/memberships/' + user.id, { expectedRevision: '0', role: 'member' }, zSavedMembershipView);
    }
    await web('UC-CSV-0033', async () => {
        await load(page, 'Title,Assignee\nAmbiguous person,' + displayName + '\n');
        expect((await preview(page, projectId)).validCount).toBe(0n);
        await expect(page.locator('.row-errors')).toContainText(/unique eligible/i);
        await load(page, 'Title,Assignee\nExact person,' + ownedUsers[0] + '\n');
        expect((await preview(page, projectId)).validCount).toBe(1n);
        await expect(page.locator('.valid-row')).toHaveText('Ready to import');
    });
});
test('native uncertain source-less import retries the actual accepted frozen batch without duplicate work', async ({ page, request }) => {
    const projectId = await isolatedProject(request);
    await useModernIssues(projectId);
    await signIn(page, 'member', '/projects/' + projectId + '/import-export', /^Import and export$/);
    await load(page, 'Title\nSource-less accepted work\n');
    await preview(page, projectId);
    await page.getByRole('checkbox', { name: 'I reviewed this preview and want to import its valid rows.', exact: true }).check();
    const submissions: Array<{
        reference: string;
        payload: unknown;
        issueId: string;
    }> = [];
    await page.route('**' + importEndpoint(projectId), async (route) => {
        if (route.request().method() !== 'POST')
            return route.continue();
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        const saved = zSavedImportResult.parse(await response.json());
        submissions.push({ reference: route.request().headers()['idempotency-key'] ?? '', payload: route.request().postDataJSON(), issueId: saved.result.rows[0]!.issueId! });
        if (submissions.length === 1) {
            expect(saved.receipt.replayed).toBe(false);
            await route.abort('failed');
        }
        else {
            expect(saved.receipt.replayed).toBe(true);
            await route.fulfill({ response });
        }
    });
    await web('UC-CSV-0056', async () => {
        await page.getByRole('button', { name: 'Import valid rows', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText(/connection|try again/i);
        await expect(page.getByText('This import is locked to its original file and mappings so retries preserve identity.', { exact: false })).toBeVisible();
        await expect(page.getByLabel('Choose CSV file', { exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: 'Import valid rows', exact: true }).click();
        await expect(page.getByRole('region', { name: 'Import result', exact: true })).toBeVisible();
        expect(submissions).toHaveLength(2);
        expect(submissions[0]!.reference).not.toBe('');
        expect(submissions[1]).toEqual(submissions[0]);
    });
    await web('UC-CSV-0054', async () => {
        expect(submissions[1]!.issueId).toBe(submissions[0]!.issueId);
        expect(submissions[1]!.payload).toEqual(submissions[0]!.payload);
        const result = page.getByRole('region', { name: 'Import result', exact: true });
        await expect(result.locator('.result-rows >li')).toHaveCount(1);
        await expect(result.locator('.result-rows >li').getByRole('link')).toHaveAttribute('href', '/issues/' + submissions[0]!.issueId);
        const csv = await download(page);
        expect(csv.match(/Source-less accepted work/g)).toHaveLength(1);
    });
});
test('native transfer rechecks a removed role before allowing a retained preview to create work', async ({ page, request }) => {
    const projectId = await isolatedProject(request);
    await useModernIssues(projectId);
    await signIn(page, 'member', '/projects/' + projectId + '/import-export', /^Import and export$/);
    await load(page, 'Title\nNo longer authorized\n');
    await preview(page, projectId);
    await page.getByRole('checkbox', { name: 'I reviewed this preview and want to import its valid rows.', exact: true }).check();
    await save(request, '/api/v1/projects/' + projectId + '/memberships/' + memberId + '/remove', { expectedRevision: '1' }, zSavedMembershipView, { method: 'POST' });
    await web('UC-CSV-0068', async () => {
        const reply = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === importEndpoint(projectId));
        await page.getByRole('button', { name: 'Import valid rows', exact: true }).click();
        const response = await reply;
        expect(response.status()).toBe(404);
        expect(await response.json()).toMatchObject({ error: { code: 'unavailable_record' } });
        await expect(page.getByRole('alert')).toContainText(/available|access|record/i);
        await expect(page.getByRole('region', { name: 'Import result', exact: true })).toHaveCount(0);
    });
});
