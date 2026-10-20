import { expect, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn } from './support/session';
import { coverageConfiguration, coverageFailure, coverageGet, coverageHeaders, coverageIssue, coverageProject, coverageReadIssue } from './support/coverage-boards';
import { zPageModernIssueSummary, zSavedModernIssueView, zSavedDependencyView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated real Go/PostgreSQL browser environment.');
test.use({ trace: 'off' });
test.describe.configure({ timeout: 120000 });
const webCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
async function openIssue(page: Page, id: string, title: string) {
  await page.evaluate(path => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate', { state: history.state })); }, '/issues/' + id);
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
async function nativeMove(page: Page, id: string, name: string, status = 200) {
  const response = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === `/api/v2/issues/${id}/move`);
  await page.getByRole('button', { name: /^Issue status:/ }).click();
  await page.getByRole('menu', { name: 'Issue status', exact: true }).getByRole('menuitemradio', { name, exact: true }).click();
  const value = await response; expect(value.status()).toBe(status);
  if (status === 200) { zSavedModernIssueView.parse(await value.json()); await expect(page.getByRole('button', { name: 'Issue status: ' + name, exact: true })).toBeVisible(); }
  else { await expect(page.getByRole('region', { name: 'Issue actions', exact: true }).getByRole('alert')).toBeVisible(); }
  return value;
}
async function addNativeBlocker(page: Page, targetKey: string) {
  const section = page.getByRole('region', { name: 'Dependencies', exact: true });
  await section.getByRole('button', { name: 'Add blocker', exact: true }).click();
  await section.getByRole('combobox', { name: 'Find a same-project issue', exact: true }).fill(targetKey);
  await section.getByRole('button', { name: 'Select blocker ' + targetKey, exact: true }).click();
  await section.getByRole('button', { name: 'Add selected blocker', exact: true }).click();
}

test('native subtasks retain separate identities and explicit completion guards through the entire parent lifecycle', async ({ request, page }) => {
  const projectId = await coverageProject(request), parent = await coverageIssue(request, projectId, { title: 'Native lifecycle parent' });
  await signIn(page, 'member', `/issues/${parent.summary.id}`, /^Native lifecycle parent$/);
  const section = page.getByRole('region', { name: 'Subtasks', exact: true }); let childId = '', childKey = '';
  await webCase('UC-REL-0002', async () => {
    await section.getByRole('button', { name: 'Add subtask', exact: true }).click(); await section.getByLabel('Issue title', { exact: true }).fill('Native lifecycle child');
    const created = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === `/api/v2/projects/${projectId}/issues` && value.status() === 201);
    await section.getByRole('button', { name: 'Create subtask', exact: true }).click(); const child = zSavedModernIssueView.parse(await (await created).json()).result; childId = child.summary.id; childKey = child.summary.key;
    expect(childId).not.toBe(parent.summary.id); expect(childKey).not.toBe(parent.summary.key); expect(child.summary.parent?.id).toBe(parent.summary.id); expect(child.summary.type).toMatchObject({ id: (await coverageConfiguration(request, projectId)).defaults.subtaskTypeId, behavior: 'subtask' });
    await expect(section.locator('.issue-key')).toHaveText(childKey); await expect(section.getByRole('status').filter({ hasText: '0 / 1 subtasks done' })).toBeVisible();
  });
  await webCase('UC-REL-0021', async () => {
    const response = await nativeMove(page, parent.summary.id, 'Done', 409); expect(await response.json()).toMatchObject({ error: { code: 'prerequisite_unfinished' } });
    await expect(page.getByRole('region', { name: 'Issue actions', exact: true }).getByRole('alert')).toContainText('Finish every direct blocker and subtask'); await expect(section.locator('.issue-key')).toHaveText(childKey); await expect(section.locator('.status-pill')).toHaveText('To do');
    expect((await coverageReadIssue(request, parent.summary.id)).summary.stage.category).toBe('todo');
  });
  await openIssue(page, childId, 'Native lifecycle child');
  await webCase('UC-REL-0017', async () => {
    await nativeMove(page, childId, 'Done'); await page.getByRole('link', { name: 'Open parent ' + parent.summary.key, exact: true }).click(); await expect(section.getByRole('status').filter({ hasText: '1 / 1 subtasks done' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Issue status: To do', exact: true })).toBeVisible();
  });
  await webCase('UC-REL-0018', async () => { await expect(section.getByRole('progressbar', { name: 'Subtask completion', exact: true })).toHaveAttribute('value', '1'); await expect(section.getByRole('progressbar', { name: 'Subtask completion', exact: true })).toHaveAttribute('max', '1'); expect((await coverageReadIssue(request, parent.summary.id)).summary.stage.category).toBe('todo'); });
  await openIssue(page, childId, 'Native lifecycle child');
  await webCase('UC-REL-0019', async () => { await nativeMove(page, childId, 'To do'); await page.getByRole('link', { name: 'Open parent ' + parent.summary.key, exact: true }).click(); await expect(section.getByRole('status').filter({ hasText: '0 / 1 subtasks done' })).toBeVisible(); await expect(section.getByRole('progressbar', { name: 'Subtask completion', exact: true })).toHaveAttribute('value', '0'); });
  await openIssue(page, childId, 'Native lifecycle child'); await nativeMove(page, childId, 'Done'); await page.getByRole('link', { name: 'Open parent ' + parent.summary.key, exact: true }).click();
  await webCase('UC-REL-0020', async () => { await expect(page.getByRole('button', { name: 'Issue status: To do', exact: true })).toBeVisible(); await nativeMove(page, parent.summary.id, 'Done'); expect((await coverageReadIssue(request, parent.summary.id)).summary.stage.category).toBe('done'); });
  await webCase('UC-REL-0023', async () => { await expect(section.getByRole('button', { name: 'Add subtask', exact: true })).toHaveCount(0); await expect(section).toContainText('Reopen this parent on its board before adding a subtask.'); });
  await openIssue(page, childId, 'Native lifecycle child');
  await webCase('UC-REL-0024', async () => { const rejected = await nativeMove(page, childId, 'To do', 409); expect(await rejected.json()).toMatchObject({ error: { code: 'prerequisite_unfinished', message: 'Reopen the parent issue before adding or reopening a subtask.' } }); await expect(page.getByRole('button', { name: 'Issue status: Done', exact: true })).toBeVisible(); expect((await coverageReadIssue(request, childId)).summary.stage.category).toBe('done'); });
  await webCase('UC-REL-0090', async () => { await expect(section.getByRole('button', { name: 'Add subtask', exact: true })).toHaveCount(0); await expect(section.getByRole('link', { name: 'Open parent ' + parent.summary.key, exact: true })).toBeVisible(); await expect(section.getByLabel('Issue title', { exact: true })).toHaveCount(0); await expect(section.getByRole('button', { name: 'Create subtask', exact: true })).toHaveCount(0); });
  await signIn(page, 'viewer', `/issues/${parent.summary.id}`, /^Native lifecycle parent$/);
  await webCase('UC-REL-0028', async () => { await expect(section.getByRole('button', { name: 'Add subtask', exact: true })).toHaveCount(0); await expect(section.locator('.issue-key')).toHaveText(childKey); await expect(section.getByRole('link', { name: 'Find these subtasks in Issues', exact: true })).toBeVisible(); await coverageFailure(await request.post(apiOrigin + `/api/v2/projects/${projectId}/issues`, { headers: await coverageHeaders('viewer'), data: { title: 'Forbidden native viewer child', parentId: parent.summary.id, expectedParentRevision: (await coverageReadIssue(request, parent.summary.id)).summary.revision } }), 403, 'forbidden'); });
});

test('native blocker completion, reopening, inverse navigation and removal update visible dependent work', async ({ request, page }) => {
  const projectId = await coverageProject(request), dependent = await coverageIssue(request, projectId, { title: 'Native dependency dependent' }), blocker = await coverageIssue(request, projectId, { title: 'Native dependency blocker', assigneeId: '10000000-0000-4000-8000-000000000002' });
  await signIn(page, 'member', `/issues/${dependent.summary.id}`, /^Native dependency dependent$/);
  const section = page.getByRole('region', { name: 'Dependencies', exact: true });
  await webCase('UC-REL-0087', async () => { const foreign = await coverageIssue(request, await coverageProject(request), { title: 'Foreign native blocker excluded' }); await section.getByRole('button', { name: 'Add blocker', exact: true }).click(); await section.getByRole('combobox', { name: 'Find a same-project issue', exact: true }).fill(foreign.summary.key); await expect(section.getByRole('listbox', { name: 'Blocker candidates', exact: true })).toContainText('No matching other issues.'); await expect(section.getByRole('button', { name: 'Select blocker ' + foreign.summary.key, exact: true })).toHaveCount(0); await section.getByRole('button', { name: 'Cancel adding blocker', exact: true }).click(); expect((await coverageReadIssue(request, dependent.summary.id)).summary.unfinishedBlockerCount).toBe(0); });
  await webCase('UC-REL-0036', async () => { await addNativeBlocker(page, blocker.summary.key); const row = section.locator('li').filter({ hasText: blocker.summary.key }); await expect(row.locator('.status-pill')).toHaveText('To do'); await expect(row.locator('.assignee')).toHaveText(blocker.summary.assignee!.displayName); await expect(page.getByText(/Blocked by 1 unfinished issue/)).toBeVisible(); });
  await webCase('UC-REL-0049', async () => { const rejected = await nativeMove(page, dependent.summary.id, 'Done', 409); expect(await rejected.json()).toMatchObject({ error: { code: 'prerequisite_unfinished' } }); await expect(section.locator('.issue-key')).toHaveText(blocker.summary.key); expect((await coverageReadIssue(request, dependent.summary.id)).summary.stage.category).toBe('todo'); });
  await section.locator('.issue-link').filter({ hasText: blocker.summary.key }).click(); await expect(page.getByRole('heading', { name: blocker.summary.title, exact: true })).toBeVisible();
  await webCase('UC-REL-0037', async () => { const inverse = section.locator('.relationship-group').filter({ has: page.getByRole('heading', { name: 'Blocks', exact: true }) }); await expect(inverse.locator('.issue-key')).toHaveText(dependent.summary.key); await expect(inverse.locator('.status-pill')).toHaveText('To do'); });
  await webCase('UC-REL-0046', async () => { await nativeMove(page, blocker.summary.id, 'Done'); await openIssue(page, dependent.summary.id, dependent.summary.title); await expect(page.getByText(/Blocked by \d+ unfinished issue/)).toHaveCount(0); await expect(section.locator('.status-pill')).toHaveText('Done'); expect((await coverageReadIssue(request, dependent.summary.id)).summary.unfinishedBlockerCount).toBe(0); });
  await openIssue(page, blocker.summary.id, blocker.summary.title);
  await webCase('UC-REL-0047', async () => { await nativeMove(page, blocker.summary.id, 'To do'); await openIssue(page, dependent.summary.id, dependent.summary.title); await expect(page.getByText(/Blocked by 1 unfinished issue/)).toBeVisible(); await expect(section.locator('.status-pill')).toHaveText('To do'); expect((await coverageReadIssue(request, dependent.summary.id)).summary.unfinishedBlockerCount).toBe(1); });
  await openIssue(page, blocker.summary.id, blocker.summary.title); await nativeMove(page, blocker.summary.id, 'Done'); await openIssue(page, dependent.summary.id, dependent.summary.title);
  await webCase('UC-REL-0048', async () => { await expect(page.getByRole('button', { name: 'Issue status: To do', exact: true })).toBeVisible(); await nativeMove(page, dependent.summary.id, 'Done'); expect((await coverageReadIssue(request, dependent.summary.id)).summary.stage.category).toBe('done'); });
  await webCase('UC-REL-0042', async () => { await section.getByRole('button', { name: 'Remove blocker ' + blocker.summary.key, exact: true }).click(); await expect(section.locator('.issue-key')).toHaveCount(0); await expect(page.getByText(/Blocked by \d+ unfinished issue/)).toHaveCount(0); expect((await coverageReadIssue(request, dependent.summary.id)).summary.unfinishedBlockerCount).toBe(0); });
});

test('native related and duplicate links show both directions and unlink without deleting issues', async ({ request, page }) => {
  const projectId = await coverageProject(request), a = await coverageIssue(request, projectId, { title: 'Native link source' }), b = await coverageIssue(request, projectId, { title: 'Native link target' });
  await signIn(page, 'member', `/issues/${a.summary.id}`, /^Native link source$/);
  const related = page.getByRole('region', { name: 'Issue actions', exact: true }).locator('details').filter({ has: page.locator('summary').filter({ hasText: 'Related issues (' }) });
  const open = async () => { if (!await related.evaluate(element => element.hasAttribute('open'))) await related.locator('summary').click(); };
  const link = async (kind: string) => { await open(); await related.getByRole('searchbox', { name: 'Related issue search', exact: true }).fill(b.summary.key); await related.getByRole('combobox', { name: 'Issue relation', exact: true }).selectOption(kind); await related.locator('.related-results li').filter({ hasText: b.summary.key }).getByRole('button', { name: 'Link issue', exact: true }).click(); await expect(related.locator('.related-links li')).toHaveCount(1); };
  await webCase('UC-REL-0086', async () => { await open(); await expect(related.getByRole('combobox', { name: 'Issue relation', exact: true }).locator('option')).toHaveText(['Relates to', 'Duplicates']); expect(await related.getByRole('combobox', { name: 'Issue relation', exact: true }).locator('option').evaluateAll(elements => elements.map(element => (element as HTMLOptionElement).value))).toEqual(['relates_to', 'duplicates']); });
  await webCase('UC-REL-0089', async () => { await related.getByRole('searchbox', { name: 'Related issue search', exact: true }).fill(a.summary.key); await expect(related.getByRole('status').filter({ hasText: 'No matching other issues.' })).toBeVisible(); await expect(related.locator('.related-results li')).toHaveCount(0); });
  await webCase('UC-REL-0088', async () => { const foreign = await coverageIssue(request, await coverageProject(request), { title: 'Foreign native related issue excluded' }); await related.getByRole('searchbox', { name: 'Related issue search', exact: true }).fill(foreign.summary.key); await expect(related.getByRole('status').filter({ hasText: 'No matching other issues.' })).toBeVisible(); await expect(related.locator('.related-results li')).toHaveCount(0); expect((await coverageReadIssue(request, a.summary.id)).links).toEqual([]); });
  await webCase('UC-REL-0066', async () => { await link('relates_to'); await expect(related.locator('.related-links li')).toContainText('Relates to'); await related.locator('.related-links a').click(); await expect(page.getByRole('heading', { name: b.summary.title, exact: true })).toBeVisible(); await open(); await expect(related.locator('.related-links li')).toContainText(a.summary.key); await expect(related.locator('.related-links li')).toContainText('Relates to'); });
  await webCase('UC-REL-0068', async () => { await related.getByRole('button', { name: 'Remove link', exact: true }).click(); await expect(related.locator('.related-links li')).toHaveCount(0); await openIssue(page, a.summary.id, a.summary.title); await open(); await expect(related.locator('.related-links li')).toHaveCount(0); expect((await coverageReadIssue(request, b.summary.id)).summary.id).toBe(b.summary.id); });
  await webCase('UC-REL-0067', async () => { await link('duplicates'); await expect(related.locator('.related-links li')).toContainText('Duplicates'); await related.locator('.related-links a').click(); await expect(page.getByRole('heading', { name: b.summary.title, exact: true })).toBeVisible(); await open(); await expect(related.locator('.related-links li')).toContainText('Duplicated by'); await expect(related.locator('.related-links li')).toContainText(a.summary.key); });
  await webCase('UC-REL-0069', async () => { await openIssue(page, a.summary.id, a.summary.title); await open(); await related.getByRole('button', { name: 'Remove link', exact: true }).click(); await expect(related.locator('.related-links li')).toHaveCount(0); await openIssue(page, b.summary.id, b.summary.title); await open(); await expect(related.locator('.related-links li')).toHaveCount(0); expect((await coverageReadIssue(request, a.summary.id)).summary.id).toBe(a.summary.id); });
});
