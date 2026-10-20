import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import type { IssueFilter } from '../src/app/api/generated/types.gen';
import {
  zConfigurationView, zModernIssueView, zSavedModernIssueView,
  zPageModernIssueSummary, zPageStageView, zSavedLabelView,
  zSavedSavedSearch, zSavedSearchList, zSavedIssueView,
  zSavedDependencyView, zPageDependencyView, zPageBindingView, zPagePriorityView,
} from '../src/app/api/generated/zod.gen';
import { modernEditable } from '../src/app/features/issues/issue-model';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { useCase } from './support/use-case';
const restCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'rest');
const webCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
import { coverageCreate, coverageHeaders, coverageProject, coverageRead } from './support/coverage-issues';

test.skip(!localFixturesAvailable, 'Requires isolated real Go/PostgreSQL fixtures.');
test.use({ trace: 'off' });
test.setTimeout(90_000);
const memberId = '10000000-0000-4000-8000-000000000002';
async function search(request: APIRequestContext, filters: IssueFilter, limit = 100, cursor?: string) {
  const response = await request.post(`${apiOrigin}/api/v2/issues/search`, { headers: await coverageHeaders(), data: { filters, page: { limit, ...(cursor ? { cursor } : {}) } } });
  expect(response.status()).toBe(200); return zPageModernIssueSummary.parse(await response.json());
}
async function move(request: APIRequestContext, issueId: string, category: string) {
  const issue = await coverageRead(request, issueId);
  const response = await request.get(`${apiOrigin}/api/v2/projects/${issue.summary.projectId}/workflows/${issue.summary.workflow.id}/stages?limit=100`, { headers: await coverageHeaders() });
  expect(response.status()).toBe(200); const target = zPageStageView.parse(await response.json()).items.find(s => s.category === category && !s.retired && s.acceptsEntries);
  if (!target) throw new Error('Missing stage ' + category);
  return request.post(`${apiOrigin}/api/v2/issues/${issueId}/move`, { headers: await coverageHeaders(), data: { expectedRevision: issue.summary.revision, targetStageId: target.id } });
}

test('native creation defaults, explicit fields, validation and retry receipts are preserved', async ({ request }) => {
  const projectId = await coverageProject(request);
  const cfgResponse = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/configuration`, { headers: await coverageHeaders('owner') });
  expect(cfgResponse.status()).toBe(200); const cfg = zConfigurationView.parse(await cfgResponse.json());
  const first = await restCase('UC-ISS-0003', async () => {
    const issue = await coverageCreate(request, projectId, { title: 'Title only' });
    expect(issue.summary.title).toBe('Title only'); expect(issue.summary.revision).toBe('1'); expect(issue.description).toBe(''); return issue;
  });
  await restCase('UC-ISS-0004', async () => { expect(first.summary.type.id).toBe(cfg.defaults.standardTypeId); expect(first.summary.type.behavior).toBe('standard'); });
  await restCase('UC-ISS-0006', async () => { expect(first.summary.priority.id).toBe(cfg.defaults.priorityId); });
  await restCase('UC-ISS-0008', async () => { const response = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/issue-types/${first.summary.type.id}/workflows?limit=100`, { headers: await coverageHeaders() }); expect(response.status()).toBe(200); const binding = zPageBindingView.parse(await response.json()).items.find(item => item.default); expect(first.summary.workflow.id).toBe(binding?.workflowId); expect(first.summary.stage.initial).toBe(true); });
  await restCase('UC-ISS-0011', async () => { const issue = await coverageCreate(request, projectId, { assigneeId: memberId }); expect(issue.summary.assignee?.id).toBe(memberId); });
  await restCase('UC-ISS-0012', async () => { const issue = await coverageCreate(request, projectId, { assigneeId: null }); expect(issue.summary.assignee).toBeNull(); });
  await restCase('UC-ISS-0013', async () => { const issue = await coverageCreate(request, projectId, { dueDate: '2028-02-29' }); expect(issue.summary.dueDate).toBe('2028-02-29'); });
  await restCase('UC-ISS-0015', async () => { const issue = await coverageCreate(request, projectId, { backlog: true }); expect(issue.summary.backlog).toBe(true); });
  const reference = crypto.randomUUID(); const createData = { title: 'Idempotent native creation' };
  const accepted = await request.post(`${apiOrigin}/api/v2/projects/${projectId}/issues`, { headers: await coverageHeaders('member', reference), data: createData });
  expect(accepted.status()).toBe(201); const saved = zSavedModernIssueView.parse(await accepted.json());
  await restCase('UC-ISS-0022', async () => {
    const replay = await request.post(`${apiOrigin}/api/v2/projects/${projectId}/issues`, { headers: await coverageHeaders('member', reference), data: createData });
    expect(replay.status()).toBe(201); const result = zSavedModernIssueView.parse(await replay.json()); expect(result.receipt.replayed).toBe(true); expect(result.result.summary.id).toBe(saved.result.summary.id);
    expect((await search(request, { projectIds: [projectId], query: createData.title })).items).toHaveLength(1);
  });
  await restCase('UC-ISS-0029', async () => {
    const response = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/workflows/${first.summary.workflow.id}/stages?limit=100`, { headers: await coverageHeaders() }); expect(response.status()).toBe(200); const review = zPageStageView.parse(await response.json()).items.find(stage => stage.category === 'review'); if (!review) throw new Error('Missing review stage');
    const denied = await request.post(`${apiOrigin}/api/v2/projects/${projectId}/issues`, { headers: await coverageHeaders(), data: { title: 'Skip intake', stageId: review.id } }); expect(denied.status()).toBe(422);
  });
  await restCase('UC-ISS-0030', async () => {
    const sourceKey = 'import-' + crypto.randomUUID();
    const imported = await coverageCreate(request, projectId, { title: 'External source identity', importSourceKey: sourceKey });
    const again = await request.post(`${apiOrigin}/api/v2/projects/${projectId}/issues`, { headers: await coverageHeaders(), data: { title: 'Do not duplicate this imported issue', importSourceKey: sourceKey } }); expect(again.status()).toBe(200);
    expect(zSavedModernIssueView.parse(await again.json()).result.summary.id).toBe(imported.summary.id); expect((await search(request, { projectIds: [projectId], query: 'External source identity' })).items).toHaveLength(1);
  });
  await restCase('UC-ISS-0023', async () => {
    const priorities = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/priorities?limit=100`, { headers: await coverageHeaders() }); expect(priorities.status()).toBe(200); const high = zPagePriorityView.parse(await priorities.json()).items.find(p => p.key === 'high'); if (!high) throw new Error('Missing High priority');
    const changed = await request.put(`${apiOrigin}/api/v2/projects/${projectId}/configuration/defaults`, { headers: await coverageHeaders('owner'), data: { expectedRevision: cfg.revision, defaults: { ...cfg.defaults, priorityId: high.id } } }); expect(changed.status()).toBe(200);
    const replay = await request.post(`${apiOrigin}/api/v2/projects/${projectId}/issues`, { headers: await coverageHeaders('member', reference), data: createData }); expect(replay.status()).toBe(201); const original = zSavedModernIssueView.parse(await replay.json()); expect(original.result.summary.priority.id).toBe(saved.result.summary.priority.id); expect(original.receipt.replayed).toBe(true);
    expect((await coverageCreate(request, projectId)).summary.priority.id).toBe(high.id);
  });
  for (const scenario of [{ id: 'UC-ISS-0024', title: '  ' }, { id: 'UC-ISS-0188', title: 'x'.repeat(201) }]) await restCase(scenario.id, async () => {
    const response = await request.post(`${apiOrigin}/api/v2/projects/${projectId}/issues`, { headers: await coverageHeaders(), data: { title: scenario.title } }); expect(response.status()).toBe(422);
  });
  await test.step('Viewer cannot write the native issue API', async () => {
    const response = await request.put(`${apiOrigin}/api/v2/issues/${first.summary.id}`, { headers: await coverageHeaders('viewer'), data: { expectedRevision: first.summary.revision, editable: { ...modernEditable(first), title: 'Viewer edit' } } }); expect(response.status()).toBe(403); expect((await coverageRead(request, first.summary.id)).summary.title).toBe('Title only');
  });
  await restCase('UC-ISS-0173', async () => {
    const response = await request.patch(`${apiOrigin}/api/v2/issues/${first.summary.id}/fields`, { headers: await coverageHeaders(), data: { field: 'assigneeId', assignee: { prior: null, value: '10000000-0000-4000-8000-000000000003' } } }); expect(response.status()).toBe(422); expect((await coverageRead(request, first.summary.id)).summary.assignee).toBeNull();
  });
});

test('issue discovery combines identity, category, assignment, date, label and parent filters', async ({ request }) => {
  const projectId = await coverageProject(request);
  const labelResponse = await request.post(`${apiOrigin}/api/v1/projects/${projectId}/labels`, { headers: await coverageHeaders(), data: { name: 'Urgent' } }); expect(labelResponse.status()).toBe(201); const label = zSavedLabelView.parse(await labelResponse.json()).result;
  const a = await coverageCreate(request, projectId, { title: 'Unique needle العربية', assigneeId: memberId, dueDate: '2001-01-01', labelIds: [label.id] });
  const b = await coverageCreate(request, projectId, { title: 'Unassigned backlog', backlog: true });
  const c = await coverageCreate(request, projectId, { title: 'Completed needle', dueDate: '2001-01-01' });
  expect((await move(request, c.summary.id, 'done')).status()).toBe(200);
  const d = await coverageCreate(request, projectId, { title: 'Review item', dueDate: '2099-01-01' }); expect((await move(request, d.summary.id, 'review')).status()).toBe(200);
  const e = await coverageCreate(request, projectId, { title: 'In progress item' }); expect((await move(request, e.summary.id, 'in_progress')).status()).toBe(200);
  const parent = await coverageRead(request, a.summary.id);
  const child = await coverageCreate(request, projectId, { title: 'One child', parentId: parent.summary.id, expectedParentRevision: parent.summary.revision });
  const scenarios: { id: string; filters: IssueFilter; expected: string[] }[] = [
    { id: 'UC-ISS-0031', filters: { backlog: false }, expected: [a.summary.id, c.summary.id, d.summary.id, e.summary.id, child.summary.id] },
    { id: 'UC-ISS-0039', filters: { statuses: ['todo'], backlog: false }, expected: [a.summary.id, child.summary.id] },
    { id: 'UC-ISS-0040', filters: { statuses: ['in_progress'] }, expected: [e.summary.id] },
    { id: 'UC-ISS-0041', filters: { statuses: ['review'] }, expected: [d.summary.id] },
    { id: 'UC-ISS-0042', filters: { statuses: ['done'] }, expected: [c.summary.id] },
    { id: 'UC-ISS-0043', filters: { assignee: { kind: 'self' } }, expected: [a.summary.id] },
    { id: 'UC-ISS-0045', filters: { assignee: { kind: 'unassigned' } }, expected: [b.summary.id, c.summary.id, d.summary.id, e.summary.id, child.summary.id] },
    { id: 'UC-ISS-0047', filters: { assignee: { kind: 'user', userId: memberId } }, expected: [a.summary.id] },
    { id: 'UC-ISS-0050', filters: { dueFrom: '2099-01-01' }, expected: [d.summary.id] },
    { id: 'UC-ISS-0051', filters: { dueTo: '2001-01-01' }, expected: [a.summary.id, c.summary.id] },
    { id: 'UC-ISS-0052', filters: { overdue: true }, expected: [a.summary.id] },
    { id: 'UC-ISS-0056', filters: { labelIds: [label.id] }, expected: [a.summary.id] },
    { id: 'UC-ISS-0058', filters: { parentId: a.summary.id }, expected: [child.summary.id] },
    { id: 'UC-ISS-0061', filters: { backlog: true }, expected: [b.summary.id] },
    { id: 'UC-ISS-0067', filters: { query: 'needle', labelIds: [label.id], assignee: { kind: 'self' }, overdue: true }, expected: [a.summary.id] },
    { id: 'UC-ISS-0191', filters: { query: 'no matching unique issue 4867' }, expected: [] },
    { id: 'UC-ISS-0080', filters: { query: 'العربية' }, expected: [a.summary.id] },
  ];
  for (const scenario of scenarios) await restCase(scenario.id, async () => {
    const result = await search(request, { projectIds: [projectId], ...scenario.filters });
    expect(result.items.map(i => i.id).sort()).toEqual(scenario.expected.sort()); expect(result.totalMatching).toBe(scenario.expected.length);
  });
  await restCase('UC-ISS-0190', async () => {
    let cursor: string | undefined; const ids: string[] = [];
    do { const result = await search(request, { projectIds: [projectId] }, 2, cursor); expect(result.items.length).toBeLessThanOrEqual(2); ids.push(...result.items.map(i => i.id)); cursor = result.nextCursor ?? undefined; } while (cursor);
    expect(ids).toHaveLength(6); expect(new Set(ids).size).toBe(6);
  });
});

test('inline fields merge unrelated writes, reject same-field conflicts and do not advance no-op revisions', async ({ request }) => {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  const original = modernEditable(issue);
  const edit = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}`, { headers: await coverageHeaders(), data: { expectedRevision: issue.summary.revision, editable: { ...original, title: 'Parallel title' } } }); expect(edit.status()).toBe(200);
  const reference = crypto.randomUUID(); const body = { field: 'dueDate', dueDate: { prior: null, value: '2028-05-01' } };
  await restCase('UC-ISS-0157', async () => {
    const response = await request.patch(`${apiOrigin}/api/v2/issues/${issue.summary.id}/fields`, { headers: await coverageHeaders('member', reference), data: body }); expect(response.status()).toBe(200);
    const current = zSavedModernIssueView.parse(await response.json()).result; expect(current.summary.title).toBe('Parallel title'); expect(current.summary.dueDate).toBe('2028-05-01');
  });
  await restCase('UC-ISS-0159', async () => {
    const current = await coverageRead(request, issue.summary.id);
    const response = await request.patch(`${apiOrigin}/api/v2/issues/${issue.summary.id}/fields`, { headers: await coverageHeaders('member', reference), data: body }); expect(response.status()).toBe(200);
    expect(zSavedModernIssueView.parse(await response.json()).receipt.replayed).toBe(true); expect((await coverageRead(request, issue.summary.id)).summary.revision).toBe(current.summary.revision);
  });
  await test.step('API rejects stale selected-field write', async () => {
    const response = await request.patch(`${apiOrigin}/api/v2/issues/${issue.summary.id}/fields`, { headers: await coverageHeaders(), data: { field: 'dueDate', dueDate: { prior: null, value: '2028-05-02' } } }); expect(response.status()).toBe(409); expect((await coverageRead(request, issue.summary.id)).summary.dueDate).toBe('2028-05-01');
  });
  await restCase('UC-ISS-0161', async () => {
    const current = await coverageRead(request, issue.summary.id);
    const response = await request.patch(`${apiOrigin}/api/v2/issues/${issue.summary.id}/fields`, { headers: await coverageHeaders(), data: { field: 'dueDate', dueDate: { prior: current.summary.dueDate, value: current.summary.dueDate } } }); expect(response.status()).toBe(200);
    const result = zSavedModernIssueView.parse(await response.json()); expect(result.result.summary.revision).toBe(current.summary.revision); expect(result.receipt.eventId).toBeNull();
  });
  await test.step('API rejects stale full issue write', async () => {
    const response = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}`, { headers: await coverageHeaders(), data: { expectedRevision: issue.summary.revision, editable: { ...original, title: 'Obsolete full edit' } } }); expect(response.status()).toBe(409); expect((await coverageRead(request, issue.summary.id)).summary.title).toBe('Parallel title');
  });
});

test('saved-search identity, name, privacy and removal are enforced by the real service', async ({ request }) => {
  const projectId = await coverageProject(request); const id = crypto.randomUUID(); const name = 'Coverage ' + id.slice(0, 8);
  const filters = { projectIds: [projectId], statuses: ['todo', 'review'], priorities: ['low', 'high'], assignee: { kind: 'self' } };
  const save = async (data: unknown, role = 'member', target = id) => request.put(`${apiOrigin}/api/v1/issue-searches/${target}`, { headers: await coverageHeaders(role), data });
  let revision = '0';
  await restCase('UC-ISS-0144', async () => {
    const response = await save({ expectedRevision: revision, name, filters }); expect(response.status()).toBe(200); const result = zSavedSavedSearch.parse(await response.json()).result; revision = result.revision; expect(result.id).toBe(id); expect(result.name).toBe(name);
  });
  await restCase('UC-ISS-0192', async () => {
    const response = await request.get(`${apiOrigin}/api/v1/issue-searches`, { headers: await coverageHeaders() }); expect(response.status()).toBe(200); const result = zSavedSearchList.parse(await response.json()).items.find(i => i.id === id); expect(new Set(result?.filters.statuses)).toEqual(new Set(['todo', 'review'])); expect(new Set(result?.filters.priorities)).toEqual(new Set(['low', 'high']));
  });
  await restCase('UC-ISS-0156', async () => {
    const response = await request.get(`${apiOrigin}/api/v1/issue-searches`, { headers: await coverageHeaders('viewer') }); expect(response.status()).toBe(200); expect(zSavedSearchList.parse(await response.json()).items.some(i => i.id === id)).toBe(false);
    const update = await save({ expectedRevision: revision, name: 'Steal search', filters }, 'viewer'); expect(update.status()).toBe(422);
  });
  for (const scenario of [{ id: 'UC-ISS-0152', name: '   ' }, { id: 'UC-ISS-0153', name: 'x'.repeat(81) }]) await restCase(scenario.id, async () => { const response = await save({ expectedRevision: '0', name: scenario.name, filters }, 'member', crypto.randomUUID()); expect(response.status()).toBe(422); });
  await restCase('UC-ISS-0154', async () => { const response = await save({ expectedRevision: '0', name, filters }, 'member', crypto.randomUUID()); expect(response.status()).toBe(422); });
  await restCase('UC-ISS-0147', async () => { const response = await save({ expectedRevision: revision, name: name + ' renamed', filters }); expect(response.status()).toBe(200); const result = zSavedSavedSearch.parse(await response.json()).result; revision = result.revision; expect(result.name).toBe(name + ' renamed'); });
  await restCase('UC-ISS-0146', async () => { const response = await save({ expectedRevision: revision, name: name + ' renamed', filters: { projectIds: [projectId], query: 'updated exact filter' } }); expect(response.status()).toBe(200); const result = zSavedSavedSearch.parse(await response.json()).result; revision = result.revision; expect(result.filters.query).toBe('updated exact filter'); expect(result.filters.statuses).toBeUndefined(); });
  await test.step('API rejects stale saved-search revision', async () => { const response = await save({ expectedRevision: '1', name: 'stale rename', filters }); expect(response.status()).toBe(422); const listed = await request.get(`${apiOrigin}/api/v1/issue-searches`, { headers: await coverageHeaders() }); expect(zSavedSearchList.parse(await listed.json()).items.find(i => i.id === id)?.name).toBe(name + ' renamed'); });
  await restCase('UC-ISS-0148', async () => { const response = await save({ expectedRevision: revision, name: name + ' renamed', filters, removed: true }); expect(response.status()).toBe(200); expect(zSavedSavedSearch.parse(await response.json()).result.removed).toBe(true); const listed = await request.get(`${apiOrigin}/api/v1/issue-searches`, { headers: await coverageHeaders() }); expect(zSavedSearchList.parse(await listed.json()).items.some(i => i.id === id)).toBe(false); });
});

test('subtask structure and completion preserve independent work and protect parent invariants', async ({ request, page }) => {
  const projectId = await coverageProject(request); let parent = await coverageCreate(request, projectId);
  let child = await restCase('UC-REL-0002', async () => {
    const issue = await coverageCreate(request, projectId, { title: 'Independent child', parentId: parent.summary.id, expectedParentRevision: parent.summary.revision });
    expect(issue.summary.parent?.id).toBe(parent.summary.id); expect(issue.summary.type.behavior).toBe('subtask'); expect(issue.summary.assignee).toBeNull(); return issue;
  });
  await restCase('UC-REL-0022', async () => {
    const response = await request.post(`${apiOrigin}/api/v2/projects/${projectId}/issues`, { headers: await coverageHeaders(), data: { title: 'Forbidden grandchild', parentId: child.summary.id, expectedParentRevision: child.summary.revision } }); expect(response.status()).toBe(422);
  });
  await restCase('UC-REL-0026', async () => {
    const response = await request.post(`${apiOrigin}/api/v2/projects/${projectId}/issues`, { headers: await coverageHeaders(), data: { title: 'Stale parent', parentId: parent.summary.id, expectedParentRevision: '999999' } }); expect(response.status()).toBe(409);
  });
  await restCase('UC-REL-0085', async () => {
    const current = await coverageRead(request, parent.summary.id);
    const response = await request.post(`${apiOrigin}/api/v2/projects/${projectId}/issues`, { headers: await coverageHeaders('viewer'), data: { title: 'Viewer child', parentId: parent.summary.id, expectedParentRevision: current.summary.revision } }); expect(response.status()).toBe(403);
  });
  await restCase('UC-REL-0021', async () => {
    const response = await move(request, parent.summary.id, 'done'); expect(response.status()).toBe(409); expect((await coverageRead(request, parent.summary.id)).summary.stage.category).toBe('todo');
  });
  await signIn(page, 'member', '/issues/' + child.summary.id, /^Independent child$/);
  await webCase('UC-REL-0003', async () => {
    await page.getByRole('button', { name: 'Edit assignee', exact: true }).click();
    const field = page.getByRole('group', { name: 'Edit assignee', exact: true });
    await field.getByRole('option', { name: 'مطور تجريبي', exact: true }).click();
    await expect(field).toHaveCount(0);
    expect((await coverageRead(request, child.summary.id)).summary.assignee?.id).toBe(memberId); expect((await coverageRead(request, parent.summary.id)).summary.assignee).toBeNull();
  });
  await webCase('UC-REL-0005', async () => {
    await page.getByRole('button', { name: 'Edit due date', exact: true }).click();
    const field = page.getByRole('group', { name: 'Edit due date', exact: true });
    await field.getByLabel('due date', { exact: true }).fill('2028-01-01');
    await expect(field).toHaveCount(0);
    expect((await coverageRead(request, child.summary.id)).summary.dueDate).toBe('2028-01-01'); expect((await coverageRead(request, parent.summary.id)).summary.dueDate).toBeNull();
  });
  await restCase('UC-REL-0018', async () => {
    expect((await move(request, child.summary.id, 'done')).status()).toBe(200); const current = await coverageRead(request, parent.summary.id);
    expect(current.summary.subtaskProgress).toEqual({ total: 1, done: 1 }); expect(current.summary.stage.category).toBe('todo');
  });
  await restCase('UC-REL-0020', async () => { expect((await move(request, parent.summary.id, 'done')).status()).toBe(200); expect((await coverageRead(request, parent.summary.id)).summary.stage.category).toBe('done'); });
  await restCase('UC-REL-0024', async () => { const response = await move(request, child.summary.id, 'todo'); expect(response.status()).toBe(409); expect((await coverageRead(request, child.summary.id)).summary.stage.category).toBe('done'); });
  await restCase('UC-REL-0023', async () => {
    parent = await coverageRead(request, parent.summary.id); const response = await request.post(`${apiOrigin}/api/v2/projects/${projectId}/issues`, { headers: await coverageHeaders(), data: { title: 'Done parent child', parentId: parent.summary.id, expectedParentRevision: parent.summary.revision } }); expect(response.status()).toBe(409);
  });
  expect((await move(request, parent.summary.id, 'todo')).status()).toBe(200);
  await restCase('UC-REL-0019', async () => { expect((await move(request, child.summary.id, 'todo')).status()).toBe(200); expect((await coverageRead(request, parent.summary.id)).summary.subtaskProgress).toEqual({ total: 1, done: 0 }); });
  await signIn(page, 'member', '/issues/' + child.summary.id, /^Independent child$/);
  await webCase('UC-REL-0015', async () => { await page.getByRole('link', { name: new RegExp(parent.summary.key) }).first().click(); await expect(page.getByRole('heading', { name: parent.summary.title, exact: true })).toBeVisible(); });
  await webCase('UC-REL-0001', async () => { await page.getByRole('button', { name: 'Add subtask', exact: true }).click(); await expect(page.locator('.subtask-form')).toBeVisible(); });
  await webCase('UC-REL-0010', async () => { await page.locator('.subtask-form').getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(page.locator('.subtask-form')).toHaveCount(0); });
});

test('dependency graph validates cycles, inverse edges, completion and removal', async ({ request }) => {
  const projectId = await coverageProject(request);
  const a = await coverageCreate(request, projectId, { title: 'Dependent A' });
  const b = await coverageCreate(request, projectId, { title: 'Blocker B' });
  const c = await coverageCreate(request, projectId, { title: 'Blocker C' });
  const add = async (issueId: string, blockerId: string) => {
    const current = await coverageRead(request, issueId);
    return request.post(`${apiOrigin}/api/v1/issues/${issueId}/dependencies`, { headers: await coverageHeaders(), data: { blockerId, expectedIssueRevision: current.summary.revision, expectedGraphRevision: current.graphRevision } });
  };
  let edge: ReturnType<typeof zSavedDependencyView.parse>['result'];
  await restCase('UC-REL-0036', async () => { const response = await add(a.summary.id, b.summary.id); expect(response.status()).toBe(200); edge = zSavedDependencyView.parse(await response.json()).result; expect(edge.dependent.id).toBe(a.summary.id); expect(edge.blocker.id).toBe(b.summary.id); expect(edge.removed).toBe(false); expect((await coverageRead(request, a.summary.id)).summary.unfinishedBlockerCount).toBe(1); });
  await restCase('UC-REL-0037', async () => { const response = await request.get(`${apiOrigin}/api/v1/issues/${b.summary.id}/dependencies?direction=blocks`, { headers: await coverageHeaders() }); expect(response.status()).toBe(200); expect(zPageDependencyView.parse(await response.json()).items.map(i => i.dependent.id)).toEqual([a.summary.id]); });
  await restCase('UC-REL-0050', async () => { const response = await add(a.summary.id, a.summary.id); expect(response.status()).toBe(422); });
  await restCase('UC-REL-0051', async () => { const response = await add(b.summary.id, a.summary.id); expect(response.status()).toBe(422); });
  expect((await add(b.summary.id, c.summary.id)).status()).toBe(200);
  await restCase('UC-REL-0052', async () => { const response = await add(c.summary.id, a.summary.id); expect(response.status()).toBe(422); });
  await restCase('UC-REL-0049', async () => { const response = await move(request, a.summary.id, 'done'); expect(response.status()).toBe(409); expect((await coverageRead(request, a.summary.id)).summary.stage.category).toBe('todo'); });
  expect((await move(request, c.summary.id, 'done')).status()).toBe(200);
  await restCase('UC-REL-0046', async () => { expect((await move(request, b.summary.id, 'done')).status()).toBe(200); expect((await coverageRead(request, a.summary.id)).summary.unfinishedBlockerCount).toBe(0); });
  await restCase('UC-REL-0048', async () => { expect((await move(request, a.summary.id, 'done')).status()).toBe(200); expect((await coverageRead(request, a.summary.id)).summary.stage.category).toBe('done'); });
  await restCase('UC-REL-0054', async () => { const unfinished = await coverageCreate(request, projectId); const response = await add(a.summary.id, unfinished.summary.id); expect(response.status()).toBe(409); });
  await restCase('UC-REL-0080', async () => { const current = await coverageRead(request, a.summary.id); const response = await request.post(`${apiOrigin}/api/v1/issues/${a.summary.id}/dependencies`, { headers: await coverageHeaders(), data: { blockerId: c.summary.id, expectedIssueRevision: current.summary.revision, expectedGraphRevision: '1' } }); expect(response.status()).toBe(409); });
  await restCase('UC-REL-0042', async () => {
    const current = await coverageRead(request, a.summary.id);
    const response = await request.post(`${apiOrigin}/api/v1/issues/${a.summary.id}/dependencies/${b.summary.id}/remove`, { headers: await coverageHeaders(), data: { expectedIssueRevision: current.summary.revision, expectedGraphRevision: current.graphRevision, expectedDependencyRevision: edge!.revision } });
    expect(response.status()).toBe(200); expect(zSavedDependencyView.parse(await response.json()).result.removed).toBe(true);
    const list = await request.get(`${apiOrigin}/api/v1/issues/${a.summary.id}/dependencies?direction=blocked_by`, { headers: await coverageHeaders() }); expect(zPageDependencyView.parse(await list.json()).items).toHaveLength(0);
  });
  const foreignProject = await coverageProject(request); const foreign = await coverageCreate(request, foreignProject);
  await restCase('UC-REL-0055', async () => { const response = await add(a.summary.id, foreign.summary.id); expect(response.status()).toBe(404); });
});

test('related issues keep symmetric and directional links while rejecting invalid destinations', async ({ request }) => {
  const projectId = await coverageProject(request); const a = await coverageCreate(request, projectId); const b = await coverageCreate(request, projectId);
  const link = async (targetId: string, kind: string, enabled: boolean) => {
    const current = await coverageRead(request, a.summary.id); return request.post(`${apiOrigin}/api/v1/issues/${a.summary.id}/links`, { headers: await coverageHeaders(), data: { expectedRevision: current.summary.revision, targetId, kind, enabled } });
  };
  for (const scenario of [{ kind: 'relates_to', add: 'UC-REL-0066', remove: 'UC-REL-0068' }, { kind: 'duplicates', add: 'UC-REL-0067', remove: 'UC-REL-0069' }]) {
    await restCase(scenario.add, async () => { const response = await link(b.summary.id, scenario.kind, true); expect(response.status()).toBe(200); expect((await coverageRead(request, a.summary.id)).links.some(l => (l.issueId === a.summary.id ? l.targetId : l.issueId) === b.summary.id && l.kind === scenario.kind)).toBe(true); expect((await coverageRead(request, b.summary.id)).links.some(l => (l.issueId === b.summary.id ? l.targetId : l.issueId) === a.summary.id && l.kind === scenario.kind)).toBe(true); });
    await restCase(scenario.remove, async () => { const response = await link(b.summary.id, scenario.kind, false); expect(response.status()).toBe(200); expect((await coverageRead(request, a.summary.id)).links).toHaveLength(0); expect((await coverageRead(request, b.summary.id)).links).toHaveLength(0); });
  }
  await restCase('UC-REL-0071', async () => { const response = await link(a.summary.id, 'relates_to', true); expect(response.status()).toBe(422); });
  await restCase('UC-REL-0073', async () => { const response = await link(b.summary.id, 'blocks', true); expect(response.status()).toBe(422); });
  const foreignProject = await coverageProject(request); const foreign = await coverageCreate(request, foreignProject);
  await restCase('UC-REL-0072', async () => { const response = await link(foreign.summary.id, 'relates_to', true); expect(response.status()).toBe(422); });
  await restCase('UC-REL-0081', async () => {
    const original = await coverageRead(request, a.summary.id); expect((await link(b.summary.id, 'relates_to', true)).status()).toBe(200);
    const response = await request.post(`${apiOrigin}/api/v1/issues/${a.summary.id}/links`, { headers: await coverageHeaders(), data: { expectedRevision: original.summary.revision, targetId: b.summary.id, kind: 'relates_to', enabled: false } }); expect(response.status()).toBe(409); expect((await coverageRead(request, a.summary.id)).links).toHaveLength(1);
  });
});
