import { expect, type APIRequestContext,type Response } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { isolatedProject, useModernIssues } from './support/project';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { authorization, read, save, rejected, memberId, viewerId } from './support/coverage-access';
import {
  zImportPreview, zSavedImportResult, zIssueExport, zPageModernIssueSummary,
  zConfigurationView, zSavedTypeSaved, zSavedPrioritySaved, zPagePriorityView,
  zPageTypeView, zModernIssueView, zProjectView, zSavedProjectView,
  zPageBindingView, zSavedConfigurationView,
  zSavedUserView, zSavedMembershipView, zSavedModernIssueView, zSavedIssueView,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires isolated real service, identities and database.');
test.use({ trace: 'off' });

async function preview(request: APIRequestContext, projectId: string, csv: string, mapping: object = {}) {
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues/import-preview', {
    headers: await authorization('member'), data: { csv, mapping },
  });
  expect(response.status()).toBe(200);
  return zImportPreview.parse(await response.json());
}
async function exported(request: APIRequestContext, projectId: string, filters: object = {}, cursor?: string, limit = 100) {
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues/export', {
    headers: await authorization('viewer'), data: { filters, page: { limit, ...(cursor ? { cursor } : {}) } },
  });
  expect(response.status()).toBe(200);
  return zIssueExport.parse(await response.json());
}

test('CSV parser rejects every structural boundary before creating issues', async ({ request }) => {
  const projectId = await isolatedProject(request);
  for (const [id, csv, mapping, explanation] of [
    ['UC-CSV-0011', '"Unclosed\nTitle\n', {}, /header/i],
    ['UC-CSV-0012', 'Title\n', {}, /data row/i],
    ['UC-CSV-0013', Array.from({ length: 31 }, (_, n) => 'c' + n).join(',') + '\n' + Array(31).fill('v').join(','), {}, /30/i],
    ['UC-CSV-0014', 'Title,\nValid,empty\n', {}, /nonempty|unique/i],
    ['UC-CSV-0015', 'Title,title\nValid,duplicate\n', {}, /nonempty|unique/i],
    ['UC-CSV-0016', 'Title,Notes\nValid,"unclosed\n', {}, /quoting|column count/i],
    ['UC-CSV-0017', 'Title,Notes\nOne\n', {}, /quoting|column count/i],
    ['UC-CSV-0018', 'Title\n' + Array.from({ length: 101 }, (_, n) => 'Row ' + n).join('\n'), {}, /100/i],
    ['UC-CSV-0022', 'Title\nValid\n', { title: 'Missing heading' }, /selected column/i],
    ['UC-CSV-0023', 'Work\nValid\n', {}, /Title|Summary/i],
  ] as const) {
    await useCase(id, async () => {
      const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues/import-preview', {
        headers: await authorization('member'), data: { csv, mapping },
      });
      await rejected(response, 422, explanation);
    }, 'rest');
  }
  const empty = await request.post(apiOrigin + '/api/v2/issues/search', { headers: await authorization('member'), data: { filters: { projectIds: [projectId] }, page: { limit: 1 } } });
  expect(zPageModernIssueSummary.parse(await empty.json()).totalMatching).toBe(0);
});

test('CSV mappings and row validation preserve explicit identities, Arabic, quoted cells and exact fields', async ({ request }) => {
  const projectId = await isolatedProject(request);
  await useModernIssues(projectId);
  await useCase('UC-CSV-0009', async () => {
    const result = await preview(request, projectId, '\uFEFFTitle\r\nBOM accepted\r\n');
    expect(result.validCount).toBe(1n); expect(result.headers).toEqual(['Title']); expect(result.rows[0]?.title).toBe('BOM accepted');
  }, 'rest');
  await useCase('UC-CSV-0019', async () => {
    const result = await preview(request, projectId, 'Summary,Description\nAutomatic heading,Content\n');
    expect(result.validCount).toBe(1n); expect(result.rows[0]?.title).toBe('Automatic heading');
  }, 'rest');
  await useCase('UC-CSV-0020', async () => {
    const result = await preview(request, projectId, 'Work,Notes\nCustom heading,Content\n', { title: 'Work', description: 'Notes' });
    expect(result.validCount).toBe(1n); expect(result.rows[0]?.title).toBe('Custom heading');
  }, 'rest');
  await useCase('UC-CSV-0021', async () => {
    const result = await preview(request, projectId, 'Title,Priority\nSkip priority,unknown priority\n', { priority: '-' });
    expect(result.validCount).toBe(1n); expect(result.errorCount).toBe(0n);
  }, 'rest');
  for (const [id, csv, field, message] of [
    ['UC-CSV-0031', 'Title,Type\nChild without parent,subtask\n', 'type', /parent|standard/i],
    ['UC-CSV-0034', 'Title,Assignee\nViewer assignment,' + viewerId + '\n', 'assignee', /eligible/i],
    ['UC-CSV-0035', 'Title,Due date\nImpossible date,2026-02-30\n', 'dueDate', /YYYY-MM-DD/i],
    ['UC-CSV-0037', 'Title,SourceKey\nLong source,' + 'x'.repeat(201) + '\n', 'sourceKey', /200/i],
    ['UC-CSV-0040', 'Title,sourceKey,sourceKeyEncoding\nWrong encoding,eA,base64-v2\n', 'sourceKey', /encoding/i],
  ] as const) {
    await useCase(id, async () => {
      const result = await preview(request, projectId, csv);
      expect(result.validCount).toBe(0n); expect(result.errorCount).toBe(1n);
      expect(result.rows[0]?.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field, message: expect.stringMatching(message) })]));
    }, 'rest');
  }
  await useCase('UC-CSV-0038', async () => {
    const result = await preview(request, projectId, 'Title,SourceKey\nOne,SAME-1\nTwo,SAME-1\n');
    expect(result.validCount).toBe(1n); expect(result.rows[1]?.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'sourceKey', message: expect.stringContaining('row 2') })]));
  }, 'rest');
  await useCase('UC-CSV-0039', async () => {
    const original = 'معرف، خاص =1';
    const result = await preview(request, projectId, 'Title,sourceKey,sourceKeyEncoding\nDecoded,' + Buffer.from(original).toString('base64url') + ',base64url-v1\n');
    expect(result.rows[0]?.sourceKey).toBe(original); expect(result.validCount).toBe(1n);
  }, 'rest');
  await useCase('UC-CSV-0025', async () => {
    const result = await preview(request, projectId, 'Title\nPreview must not create\n'); expect(result.validCount).toBe(1n);
    const response = await request.post(apiOrigin + '/api/v2/issues/search', { headers: await authorization('member'), data: { filters: { projectIds: [projectId] }, page: { limit: 1 } } });
    expect(zPageModernIssueSummary.parse(await response.json()).totalMatching).toBe(0);
  }, 'rest');
  await useCase('UC-CSV-0071', async () => {
    const result = await preview(request, projectId, 'Title,SourceKey\nFirst row,SOURCE-1\n,INVALID-2\nThird row,SOURCE-3\n');
    expect(result.validCount).toBe(2n); expect(result.errorCount).toBe(1n);
    expect(result.rows.map(value => ({ rowNumber: value.rowNumber, title: value.title, sourceKey: value.sourceKey }))).toEqual([
      { rowNumber: 2n, title: 'First row', sourceKey: 'SOURCE-1' }, { rowNumber: 3n, title: '', sourceKey: 'INVALID-2' }, { rowNumber: 4n, title: 'Third row', sourceKey: 'SOURCE-3' },
    ]);
    expect(result.rows[0]?.errors).toEqual([]); expect(result.rows[1]?.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'title' })])); expect(result.rows[2]?.errors).toEqual([]);
  }, 'rest');
  const importOne = async (csv: string) => {
    const saved = await save(request, '/api/v1/projects/' + projectId + '/issues/import', { csv, mapping: {}, backlog: false, batchId: crypto.randomUUID() }, zSavedImportResult, { method: 'POST', role: 'member' });
    expect(saved.result.createdCount).toBe(1n);
    return read(request, '/api/v2/issues/' + saved.result.rows[0]!.issueId, zModernIssueView, 'member');
  };
  await useCase('UC-CSV-0010', async () => {
    const csv = 'Title,Description\r\n"Quoted, ""value""","Line one\nLine two"\r\n';
    const result = await preview(request, projectId, csv); expect(result.validCount).toBe(1n); expect(result.rows[0]?.title).toBe('Quoted, "value"');
    const issue = await importOne(csv); expect(issue.summary.title).toBe('Quoted, "value"'); expect(issue.description).toBe('Line one\nLine two');
  }, 'rest');
  await useCase('UC-CSV-0032', async () => {
    for (const assignee of [memberId, 'مطور تجريبي', 'member@example.test']) {
      const csv = 'Title,Assignee\nEligible assignment,' + assignee + '\n';
      const result = await preview(request, projectId, csv); expect(result.validCount).toBe(1n); expect(result.rows[0]?.errors).toEqual([]);
      expect((await importOne(csv)).summary.assignee?.id).toBe(memberId);
    }
  }, 'rest');
  await useCase('UC-CSV-0041', async () => {
    const csv = 'Title,Description,Labels,SourceKey\nمهمة عربية 😀,وصف عربي,واجهة;عاجل,معرف-١\n';
    const result = await preview(request, projectId, csv); expect(result.rows[0]).toMatchObject({ title: 'مهمة عربية 😀', sourceKey: 'معرف-١', errors: [] });
    const issue = await importOne(csv); expect(issue.summary.title).toBe('مهمة عربية 😀'); expect(issue.description).toBe('وصف عربي'); expect(issue.summary.labels.map(value => value.name).sort()).toEqual(['واجهة', 'عاجل'].sort());
  }, 'rest');
});

test('CSV canonical type, priority IDs, custom keys and ambiguous names use current project configuration', async ({ request }) => {
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  const root = '/api/v2/projects/' + projectId;
  let config = await read(request, root + '/configuration', zConfigurationView);
  const typeId = crypto.randomUUID();
  let savedType = await save(request, root + '/issue-types/' + typeId, { expectedRevision: config.revision, key: 'story', name: 'User story', behavior: 'standard', retired: false }, zSavedTypeSaved, { status: 201 });
  config = savedType.result.configuration;
  // Bind this new standard type to the already proven project workflow.
  const defaults = await read(request, root + '/issue-types', zPageTypeView);
  const bindings = await read(request, root + '/issue-types/' + defaults.items.find(v => v.default && v.behavior === 'standard')!.id + '/workflows', zPageBindingView);
  const binding = bindings.items.find(v => v.default)!;
  await save(request, root + '/issue-types/' + typeId + '/workflows/' + binding.workflowId, { expectedRevision: config.revision, default: true, acceptsNew: true }, zSavedConfigurationView);
  config = await read(request, root + '/configuration', zConfigurationView);
  const priorityId = crypto.randomUUID();
  const savedPriority = await save(request, root + '/priorities/' + priorityId, { expectedRevision: config.revision, key: 'critical', name: 'Critical team', sortOrder: '6', retired: false }, zSavedPrioritySaved, { status: 201 });
  config = savedPriority.result.configuration;
  const importChoices = async (csv: string) => {
    const saved = await save(request, '/api/v1/projects/' + projectId + '/issues/import', { csv, mapping: {}, backlog: false, batchId: crypto.randomUUID() }, zSavedImportResult, { method: 'POST', role: 'member' });
    expect(saved.result.createdCount).toBe(1n);
    return read(request, '/api/v2/issues/' + saved.result.rows[0]!.issueId, zModernIssueView, 'member');
  };
  await useCase('UC-CSV-0026', async () => {
    const csv = 'Title,Type\nStory via key,story\n'; const result = await preview(request, projectId, csv);
    expect(result.validCount).toBe(1n); expect(result.rows[0]?.errors).toEqual([]);
    expect((await importChoices(csv)).summary.type.id).toBe(typeId);
  }, 'rest');
  await useCase('UC-CSV-0027', async () => {
    const csv = 'Title,typeId,priorityId\nUUID choices,' + typeId + ',' + priorityId + '\n'; const result = await preview(request, projectId, csv);
    expect(result.validCount).toBe(1n); expect(result.rows[0]?.errors).toEqual([]);
    const issue = await importChoices(csv); expect(issue.summary.type.id).toBe(typeId); expect(issue.summary.priority.id).toBe(priorityId);
  }, 'rest');
  await useCase('UC-CSV-0028', async () => {
    const csv = 'Title,Type,Priority\nNames,User story,Critical team\n'; const result = await preview(request, projectId, csv);
    expect(result.validCount).toBe(1n);
    const issue = await importChoices(csv); expect(issue.summary.type.id).toBe(typeId); expect(issue.summary.priority.id).toBe(priorityId);
  }, 'rest');
  const extra = await save(request, root + '/priorities/' + crypto.randomUUID(), { expectedRevision: config.revision, key: 'same_name', name: 'Critical team', sortOrder: '7', retired: false }, zSavedPrioritySaved, { status: 201 });
  config = extra.result.configuration;
  await useCase('UC-CSV-0029', async () => {
    const result = await preview(request, projectId, 'Title,Priority\nAmbiguous,Critical team\n');
    expect(result.validCount).toBe(0n); expect(result.rows[0]?.errors.some(v => /unique|ambiguous/i.test(v.message))).toBe(true);
  }, 'rest');
  await useCase('UC-CSV-0030', async () => {
    const result = await preview(request, projectId, 'Title,priorityId\nForeign UUID,' + crypto.randomUUID() + '\n');
    expect(result.validCount).toBe(0n); expect(result.rows[0]?.errors.length).toBeGreaterThan(0);
  }, 'rest');
});

test('CSV imports are partial, repeatable, source-deduplicated and safe to round-trip', async ({ request }) => {
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  const root = '/api/v1/projects/' + projectId + '/issues';
  const csv = 'Title,Description,descriptionFormat,Labels,SourceKey,Assignee,Due date\n' +
    'مهمة عربية,=2+2,plain,backend;واجهة;backend,SOURCE-1,' + memberId + ',2026-10-19\n' +
    'Safe HTML,"<p>Safe <strong>content</strong></p><script>alert(1)</script>",html,,SOURCE-2,,\n' +
    ',Invalid,plain,,SOURCE-3,,\n';
  const body = { csv, mapping: {}, batchId: crypto.randomUUID(), backlog: true };
  const reference = crypto.randomUUID();
  const saved = await save(request, root + '/import', body, zSavedImportResult, { method: 'POST', role: 'member', reference });
  await useCase('UC-CSV-0051', async () => {
    expect(saved.result.createdCount).toBe(2n); expect(saved.result.rows.filter(v => v.status === 'created')).toHaveLength(2);
  }, 'rest');
  await useCase('UC-CSV-0055', async () => {
    expect(saved.result.failedCount).toBe(1n); expect(saved.result.rows[2]?.status).toBe('failed');
    for (const row of saved.result.rows.filter(v => v.status === 'created')) expect((await read(request, '/api/v2/issues/' + row.issueId, zModernIssueView, 'member')).summary.title).toBe(row.title);
  }, 'rest');
  const firstId = saved.result.rows[0]!.issueId!;
  const issue = await read(request, '/api/v2/issues/' + firstId, zModernIssueView, 'member');
  await useCase('UC-CSV-0052', async () => { expect(issue.summary.backlog).toBe(true); }, 'rest');
  await useCase('UC-CSV-0036', async () => { expect(issue.summary.labels.map(v => v.name).sort()).toEqual(['backend', 'واجهة'].sort()); }, 'rest');
  await useCase('UC-CSV-0042', async () => {
    const html = await read(request, '/api/v2/issues/' + saved.result.rows[1]!.issueId, zModernIssueView, 'member');
    expect(html.description).toContain('<strong>content</strong>'); expect(html.description).not.toContain('<script'); expect(html.description).not.toContain('alert(1)');
  }, 'rest');
  await useCase('UC-CSV-0056', async () => {
    const replay = await save(request, root + '/import', body, zSavedImportResult, { method: 'POST', role: 'member', reference });
    expect(replay.receipt.replayed).toBe(true); expect(replay.result).toEqual(saved.result);
  }, 'rest');
  await useCase('UC-CSV-0053', async () => {
    const next = await save(request, root + '/import', { ...body, batchId: crypto.randomUUID() }, zSavedImportResult, { method: 'POST', role: 'member' });
    expect(next.result.createdCount).toBe(0n); expect(next.result.existingCount).toBe(2n); expect(next.result.rows[0]?.issueId).toBe(firstId);
  }, 'rest');
  await useCase('UC-CSV-0054', async () => {
    const sourceLess = { csv: 'Title\nNo source identity\n', mapping: {}, batchId: crypto.randomUUID(), backlog: false };
    const a = await save(request, root + '/import', sourceLess, zSavedImportResult, { method: 'POST', role: 'member' });
    const b = await save(request, root + '/import', sourceLess, zSavedImportResult, { method: 'POST', role: 'member' });
    expect(a.result.createdCount).toBe(1n); expect(b.result.rows[0]?.issueId).toBe(a.result.rows[0]?.issueId);
    expect((await exported(request, projectId, { query: 'No source identity' })).totalMatching).toBe(1);
  }, 'rest');
  const all = await exported(request, projectId);
  await useCase('UC-CSV-0059', async () => { expect(all.totalMatching).toBe(3); expect(all.csv).toContain('مهمة عربية'); expect(all.csv).toContain('No source identity'); }, 'rest');
  await useCase('UC-CSV-0060', async () => { const active = await exported(request, projectId, { backlog: false, archived: false }); expect(active.totalMatching).toBe(1); expect(active.csv).toContain('No source identity'); expect(active.csv).not.toContain('مهمة عربية'); }, 'rest');
  await useCase('UC-CSV-0061', async () => { const backlog = await exported(request, projectId, { backlog: true, archived: false }); expect(backlog.totalMatching).toBe(2); expect(backlog.csv).toContain('مهمة عربية'); expect(backlog.csv).not.toContain('No source identity'); }, 'rest');
  await useCase('UC-CSV-0063', async () => { const filtered = await exported(request, projectId, { query: 'مهمة عربية' }); expect(filtered.totalMatching).toBe(1); expect(filtered.csv).toContain('مهمة عربية'); expect(filtered.csv).not.toContain('Safe HTML'); }, 'rest');
  await useCase('UC-CSV-0072', async () => {
    let cursor: string | undefined; const pages: string[] = [];
    do { const page = await exported(request, projectId, {}, cursor, 1); pages.push(page.csv); cursor = page.nextCursor ?? undefined; } while (cursor);
    expect(pages).toHaveLength(3); expect(new Set(pages).size).toBe(3); expect(pages.join('\n')).toContain('No source identity');
  }, 'rest');
  await useCase('UC-CSV-0065', async () => { expect(all.csv).toContain("'=2+2"); expect(all.csv).toContain(Buffer.from('SOURCE-1').toString('base64url')); expect(all.csv).toContain('base64url-v1'); }, 'rest');
  await useCase('UC-CSV-0070', async () => {
    const result = await preview(request, projectId, all.csv); expect(result.validCount).toBe(3n); expect(result.rows.every(v => !!v.duplicateIssueId)).toBe(true);
    const imported = await save(request, root + '/import', { csv: all.csv, mapping: {}, batchId: crypto.randomUUID(), backlog: false }, zSavedImportResult, { method: 'POST', role: 'member' });
    expect(imported.result.createdCount).toBe(0n); expect(imported.result.existingCount).toBe(3n);
    expect((await read(request, '/api/v2/issues/' + firstId, zModernIssueView, 'member')).description).toBe('=2+2');
  }, 'rest');
  await useCase('UC-CSV-0062', async () => {
    const latest = await read(request, '/api/v2/issues/' + firstId, zModernIssueView, 'member');
    await save(request, '/api/v1/issues/' + firstId + '/organize', { expectedRevision: latest.summary.revision, archived: true }, zSavedIssueView, { method: 'POST', role: 'member' });
    const archived = await exported(request, projectId, { archived: true });
    expect(archived.totalMatching).toBe(1); expect(archived.csv).toContain('مهمة عربية'); expect(archived.csv).not.toContain('No source identity');
  }, 'rest');
  await useCase('UC-CSV-0066', async () => {
    const response = await request.post(apiOrigin + root + '/export', { headers: await authorization('viewer'), data: { filters: { projectIds: [crypto.randomUUID()] } } });
    await rejected(response, 422, /one.*project/i);
  }, 'rest');
});

test('CSV page handles file boundaries, replacement, preview consent and draft lifecycle', async ({ page, request }) => {
  const projectId = await isolatedProject(request);
  const destination = '/projects/' + projectId + '/import-export';
  await signIn(page, 'member', destination, /^Import and export$/);
  await useCase('UC-CSV-0001', async () => { await expect(page.getByRole('heading', { name: 'Import issues', exact: true })).toBeVisible(); await expect(page.getByRole('heading', { name: 'Export issues', exact: true })).toBeVisible(); }, 'web');
  for (const [id, buffer, message] of [
    ['UC-CSV-0006', Buffer.alloc(0), /nonempty/i],
    ['UC-CSV-0007', Buffer.alloc(1024 * 1024 + 1, 120), /1 MiB/i],
    ['UC-CSV-0008', Buffer.from([0xff, 0xfe, 0xff]), /UTF-8/i],
  ] as const) {
    await useCase(id, async () => {
      await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer });
      await expect(page.getByRole('alert')).toContainText(message);
      await expect(page.getByRole('button', { name: 'Preview import', exact: true })).toHaveCount(0);
    }, 'web');
  }
  await useCase('UC-CSV-0004', async () => {
    await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles({ name: 'valid.csv', mimeType: 'text/csv', buffer: Buffer.from('Title,Notes\nFirst,Description\nSecond,More\n') });
    await expect(page.getByText('valid.csv', { exact: true })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Title · Required', exact: true })).toBeVisible();
  }, 'web');
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await useCase('UC-CSV-0024', async () => {
    const rows = page.getByRole('table', { name: 'Import preview', exact: true }).locator('tbody tr');
    await expect(rows).toHaveCount(2); await expect(rows.nth(0)).toContainText('First'); await expect(rows.nth(1)).toContainText('Second');
  }, 'web');
  await useCase('UC-CSV-0045', async () => {
    await expect(page.getByRole('button', { name: 'Import valid rows', exact: true })).toBeDisabled();
    await page.getByRole('checkbox', { name: 'I reviewed this preview and want to import its valid rows.', exact: true }).check();
    await expect(page.getByRole('button', { name: 'Import valid rows', exact: true })).toBeEnabled();
  }, 'web');
  await useCase('UC-CSV-0043', async () => {
    await page.getByRole('combobox', { name: 'Description', exact: true }).selectOption('Notes');
    await expect(page.getByRole('table', { name: 'Import preview', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Import valid rows', exact: true })).toHaveCount(0);
  }, 'web');
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await expect(page.getByText('2 valid rows', { exact: true })).toBeVisible();
  await useCase('UC-CSV-0044', async () => {
    await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles({ name: 'replacement.csv', mimeType: 'text/csv', buffer: Buffer.from('Title\nReplacement\n') });
    await expect(page.getByRole('table', { name: 'Import preview', exact: true })).toHaveCount(0);
    await expect(page.getByText('replacement.csv', { exact: true })).toBeVisible();
  }, 'web');
  await useCase('UC-CSV-0047', async () => {
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Projects', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
    await page.goBack();
    await expect(page.getByText('Your import draft was restored in this tab.', { exact: false })).toBeVisible();
    await expect(page.getByText('replacement.csv', { exact: true })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Import preview', exact: true })).toHaveCount(0);
  }, 'web');
  await useCase('UC-CSV-0046', async () => {
    await page.getByRole('button', { name: 'Start a new import', exact: true }).click();
    await expect(page.getByText('replacement.csv', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Title · Required', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Choose CSV file', { exact: true })).toBeEnabled();
  }, 'web');
  await useCase('UC-CSV-0005', async () => {
    const transfer = await page.evaluateHandle(() => {
      const data = new DataTransfer(); data.items.add(new File(['Title\nDropped file\n'], 'dropped.csv', { type: 'text/csv' })); return data;
    });
    await page.locator('.csv-drop').dispatchEvent('drop', { dataTransfer: transfer });
    await expect(page.getByText('dropped.csv', { exact: true })).toBeVisible();
    await transfer.dispose();
  }, 'web');
  await useCase('UC-CSV-0058', async () => {
    await page.getByText('Accepted values and repeat imports', { exact: true }).click();
    await expect(page.getByText('Map Source key to a stable unique ID', { exact: false })).toBeVisible();
    // Current fixed-choice guidance is catalogued as GAP-CSV-001, not certified as correct taxonomy guidance.
    await expect(page.getByText('Use task or bug, low/medium/high priority, and dates in YYYY-MM-DD format.', { exact: true })).toBeVisible();
  }, 'web');
  await useCase('UC-CSV-0048', async () => {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to GateGoldJira', exact: true })).toBeVisible();
    await signIn(page, 'member', destination, /^Import and export$/);
    await expect(page.getByText('dropped.csv', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Your import draft was restored in this tab.', { exact: false })).toHaveCount(0);
  }, 'web');
});

test('current role and archived project are enforced for import and export controls', async ({ page, request }) => {
  const projectId = await isolatedProject(request), root = '/api/v1/projects/' + projectId;
  await signIn(page, 'viewer', '/projects/' + projectId + '/import-export', /^Import and export$/);
  await useCase('UC-CSV-0002', async () => {
    await expect(page.getByLabel('Choose CSV file', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Your current access is read-only.', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Export CSV', exact: true })).toBeEnabled();
  }, 'web');
  await useCase('UC-CSV-0068', async () => {
    const denied = await request.post(apiOrigin + root + '/issues/import-preview', { headers: await authorization('viewer'), data: { csv: 'Title\nDenied\n', mapping: {} } });
    await rejected(denied, 403, /permission|access|forbidden|reading only/i);
    expect((await exported(request, projectId)).totalMatching).toBe(0);
  }, 'rest');
  const project = await read(request, root, zProjectView);
  await save(request, root + '/archive', { expectedRevision: project.revision }, zSavedProjectView, { method: 'POST' });
  await signIn(page, 'member', '/projects/' + projectId + '/import-export', /^Import and export$/);
  await useCase('UC-CSV-0003', async () => {
    await expect(page.getByText('Restore this project before importing work.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Choose CSV file', { exact: true })).toHaveCount(0);
  }, 'web');
  await useCase('UC-CSV-0057', async () => {
    const denied = await request.post(apiOrigin + root + '/issues/import', { headers: await authorization('member'), data: { csv: 'Title\nDenied\n', mapping: {}, backlog: false, batchId: crypto.randomUUID() } });
    await rejected(denied, 403, /archived|read.only/i);
  }, 'rest');
});

test('CSV assignee names must resolve uniquely among current eligible project people', async ({ request }) => {
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  const name = 'Ambiguous person ' + crypto.randomUUID().slice(0, 8), users: string[] = [];
  for (let n = 0; n < 2; n++) {
    const user = (await save(request, '/api/v1/admin/users', { email: 'ambiguous-' + crypto.randomUUID() + '@example.test', displayName: name, administrator: false }, zSavedUserView, { method: 'POST', status: 201 })).result;
    users.push(user.id);
    await save(request, '/api/v1/projects/' + projectId + '/memberships/' + user.id, { expectedRevision: '0', role: 'member' }, zSavedMembershipView);
  }
  await useCase('UC-CSV-0033', async () => {
    const ambiguous = await preview(request, projectId, 'Title,Assignee\nAmbiguous assignment,' + name + '\n');
    expect(ambiguous.validCount).toBe(0n); expect(ambiguous.rows[0]?.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'assignee', message: expect.stringMatching(/unique eligible/i) })]));
    const identified = await preview(request, projectId, 'Title,Assignee\nExact assignment,' + users[0] + '\n');
    expect(identified.validCount).toBe(1n);
  }, 'rest');
});

test('import result opens the created issue and cancelling export never starts a download', async ({ page, request }) => {
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  const title = 'Open imported result ' + crypto.randomUUID().slice(0, 8);
  await signIn(page, 'member', '/projects/' + projectId + '/import-export', /^Import and export$/);
  await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles({ name: 'open-result.csv', mimeType: 'text/csv', buffer: Buffer.from('Title\n' + title + '\n') });
  await page.getByRole('button', { name: 'Preview import', exact: true }).click();
  await page.getByRole('checkbox', { name: 'I reviewed this preview and want to import its valid rows.', exact: true }).check();
  const result = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/issues/import'));
  await page.getByRole('button', { name: 'Import valid rows', exact: true }).click();
  const imported = zSavedImportResult.parse(await (await result).json()).result.rows[0]!;
  await useCase('UC-CSV-0050', async () => {
    await page.getByRole('region', { name: 'Import result', exact: true }).getByRole('link', { name: imported.key!, exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp('/issues/' + imported.issueId + '$'));
  }, 'web');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Import and export', exact: true })).toBeVisible();
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let downloads = 0; page.on('download', () => { downloads++; });
  await page.route('**/api/v1/projects/' + projectId + '/issues/export', async route => {
    const response = await route.fetch(); expect(response.status()).toBe(200); await held;
    await route.fulfill({ response }).catch(() => {});
  });
  try {
    await useCase('UC-CSV-0069', async () => {
      await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Cancel export', exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Cancel export', exact: true }).click();
      await expect(page.getByText('Export cancelled.', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Export CSV', exact: true })).toBeEnabled();
      release();
      expect(downloads).toBe(0);
    }, 'web');
  } finally { release(); await page.unroute('**/api/v1/projects/' + projectId + '/issues/export'); }
});

test('oversized CSV export pages reject safely and the browser collects a smaller complete download', async ({ page, request }) => {
  test.setTimeout(60_000);
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  const description = '"'.repeat(10_000);
  for (let n = 0; n < 60; n++) await save(request, '/api/v2/projects/' + projectId + '/issues', { title: 'Export page target ' + String(n).padStart(2, '0'), description }, zSavedModernIssueView, { method: 'POST', status: 201, role: 'member' });
  await useCase('UC-CSV-0067', async () => {
    const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues/export', { headers: await authorization('viewer'), data: { filters: {}, page: { limit: 100 } } });
    await rejected(response, 422, /smaller page|MiB/i);
    const smaller = await exported(request, projectId, {}, undefined, 20); expect(smaller.totalMatching).toBe(60); expect(smaller.nextCursor).toBeTruthy(); expect(Buffer.byteLength(smaller.csv)).toBeLessThanOrEqual(1024 * 1024);
  }, 'rest');
  await signIn(page, 'viewer', '/projects/' + projectId + '/import-export', /^Import and export$/);
  const wirePages: Response[] = [];
  page.on('response', response => { if (response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/projects/' + projectId + '/issues/export') wirePages.push(response); });
  await useCase('UC-CSV-0064', async () => {
    const downloaded = page.waitForEvent('download'); await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
    const file = await downloaded, path = await file.path(); expect(path).toBeTruthy();
    const csv = await readFile(path!, 'utf8');
    expect(csv.split('\n').filter(v => v.startsWith('key,title,description,')).length).toBe(1);
    expect(csv.split('\n').filter(v => v.includes('Export page target ')).length).toBe(60);
    await expect(page.getByText('CSV downloaded with 60 matching issues.', { exact: true })).toBeVisible();
  }, 'web');
  await useCase('UC-CSV-0067', async () => {
    const refused = wirePages.filter(response => response.status() === 422);
    expect(refused.length).toBeGreaterThan(0);
    for (const response of refused) expect(await response.json()).toMatchObject({ error: { code: 'validation_failed', fieldErrors: expect.arrayContaining([expect.objectContaining({field:'page.limit'})]) } });
    const accepted = wirePages.filter(response => response.status() === 200); expect(accepted.length).toBeGreaterThan(1);
    expect(accepted.every(response => response.request().postDataJSON().page.limit < refused[0]!.request().postDataJSON().page.limit)).toBe(true);
    await expect(page.getByText('CSV downloaded with 60 matching issues.', { exact: true })).toBeVisible();
  }, 'web');
});

test('a delayed CSV preview cannot populate a different project transfer page', async ({ page, request }) => {
  const first = await isolatedProject(request), second = await isolatedProject(request);
  const destination = await read(request, '/api/v1/projects/' + second, zProjectView);
  await signIn(page, 'member', '/projects/' + first + '/import-export', /^Import and export$/);
  await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles({ name: 'obsolete-project.csv', mimeType: 'text/csv', buffer: Buffer.from('Title\nOld project only\n') });
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let finished = false;
  await page.route('**/api/v1/projects/' + first + '/issues/import-preview', async route => {
    const response = await route.fetch(); expect(response.status()).toBe(200); await held;
    await route.fulfill({ response }).catch(() => {}); finished = true;
  });
  try {
    await useCase('UC-CSV-0049', async () => {
      await page.getByRole('button', { name: 'Preview import', exact: true }).click();
      page.once('dialog', dialog => dialog.accept());
      await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Projects', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled();
      const link = page.getByRole('main').getByRole('link', { name: destination.key + ' · ' + destination.name, exact: true });
      for (let attempts = 0; attempts < 10 && await link.count() === 0; attempts++) {
        await expect(page.getByRole('button', { name: 'More projects', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'More projects', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled();
      }
      await expect(link).toBeVisible();
      await link.click();
      await page.getByRole('navigation', { name: 'Project views', exact: true }).getByRole('link', { name: 'Import & export', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Import and export', exact: true })).toBeVisible();
      release(); await expect.poll(() => finished).toBe(true);
      await expect(page.getByText('obsolete-project.csv', { exact: true })).toHaveCount(0);
      await expect(page.getByRole('table', { name: 'Import preview', exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Choose CSV file', { exact: true })).toBeEnabled();
      await expect(page).toHaveURL(new RegExp('/projects/' + second + '/import-export$'));
    }, 'web');
  } finally { release(); }
});
