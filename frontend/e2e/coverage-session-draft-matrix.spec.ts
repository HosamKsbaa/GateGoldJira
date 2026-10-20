import { expect, type APIRequestContext, type Dialog, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { apiOrigin, localFixturesAvailable, signIn, fillCredentials } from './support/session';
import { coverageProject, coverageCreate, coverageRead, coverageDefinition, coverageFields, coverageHeaders } from './support/coverage-issues';
import { coverageBoard, coverageLayout, coverageGet, coverageWrite } from './support/coverage-boards';
import { zIssuePlanningView, zPageAssetView, zPageCommentView, zPagePriorityView, zSavedPlanningItemView, zSavedSearchList } from '../src/app/api/generated/zod.gen';
import type { ModernIssueView } from '../src/app/api/generated/types.gen';

test.skip(!localFixturesAvailable, 'Requires real local identities, scoped fixtures and the browser SPA.');
test.use({ trace: 'off' });
test.setTimeout(180_000);
type Family = 'issue-comment-upload' | 'planning' | 'field' | 'bulk' | 'board' | 'saved-search';
const families: readonly Family[] = ['issue-comment-upload', 'planning', 'field', 'bulk', 'board', 'saved-search'];

async function openIssueNatively(page: Page, issue: ModernIssueView) {
  const query = page.getByRole('combobox', { name: 'Search all issues', exact: true });
  await query.fill(issue.summary.key);
  const matches = page.getByRole('listbox', { name: 'Matching issues', exact: true });
  await expect(matches.getByRole('option')).toHaveCount(1);
  await expect(matches).toContainText(issue.summary.key);
  await query.press('ArrowDown'); await query.press('Enter');
  await expect(page.getByRole('heading', { name: issue.summary.title, exact: true })).toBeVisible();
}
async function openListNatively(page: Page, issue: ModernIssueView) {
  await openIssueNatively(page, issue);
  await page.getByRole('link', { name: 'All issues', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Issues', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Project', exact: true })).toHaveValue(issue.summary.projectId);
}
async function switchAccountInSameSPA(page: Page) {
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  const marker = crypto.randomUUID();
  await page.locator('html').evaluate((element, value) => element.setAttribute('data-session-draft-matrix', value), marker);
  const accept = (dialog: Dialog) => void dialog.accept();
  page.on('dialog', accept);
  try {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
    await fillCredentials(page, 'owner');
    await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome, Local Owner', exact: true })).toBeVisible();
  } finally { page.off('dialog', accept); }
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  await expect(page.locator('html')).toHaveAttribute('data-session-draft-matrix', marker);
}
async function leaveDirtyAndReturn(page: Page, link: ReturnType<Page['getByRole']>, destination: RegExp) {
  const warning = page.waitForEvent('dialog');
  const navigation = link.click();
  const dialog = await warning;
  expect(dialog.type()).toBe('confirm'); expect(dialog.message()).toContain('Your unsaved draft stays in this tab');
  await dialog.accept(); await navigation;
  await expect(page.getByRole('heading', { name: destination })).toBeVisible();
  await page.goBack();
}
async function fixture(page: Page, request: APIRequestContext, family: Family) {
  const projectId = await coverageProject(request);
  const issue = await coverageCreate(request, projectId, { title: 'Session draft matrix ' + family + ' ' + crypto.randomUUID().slice(0, 8) });
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  return { projectId, issue };
}
async function matrixFamily(page: Page, request: APIRequestContext, family: Family) {
  const f = await fixture(page, request, family);
  if (family === 'issue-comment-upload') {
    await page.getByRole('button', { name: 'Edit title', exact: true }).click();
    const title = page.getByRole('group', { name: 'Edit title', exact: true }).getByLabel('title', { exact: true });
    const text = page.locator('gg-comment-editor').getByRole('textbox', { name: 'Comment text', exact: true });
    const queue = page.locator('gg-issue-attachments').getByRole('group', { name: 'Attach pictures and files', exact: true });
    const privateTitle = 'Previous account issue draft';
    const privateComment = 'Previous account comment draft · مسودة';
    const filename = 'previous-account-selected-file.txt';
    let transfers = 0;
    const transferred = (value: import('@playwright/test').Request) => { if (value.method() === 'POST' && /\/asset-uploads(?:\/|$)/.test(new URL(value.url()).pathname)) transfers++; };
    page.on('request', transferred);
    try {
      await title.fill(privateTitle); await text.fill(privateComment);
      await queue.getByLabel('Choose files', { exact: true }).setInputFiles({ name: filename, mimeType: 'text/plain', buffer: Buffer.from('Previous account bytes') });
      await expect(queue.locator('.queue-items > li')).toHaveCount(1);
      await leaveDirtyAndReturn(page, page.getByRole('link', { name: 'All issues', exact: true }), /^Issues$/);
      await expect(page.getByRole('heading', { name: f.issue.summary.title, exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Edit title', exact: true }).click();
      await expect(title).toHaveValue(privateTitle); await expect(text).toHaveText(privateComment);
      await expect(queue.locator('.queue-items > li')).toContainText(filename);
      await switchAccountInSameSPA(page); await openIssueNatively(page, f.issue);
      await page.getByRole('button', { name: 'Edit title', exact: true }).click();
      await expect(title).toHaveValue(f.issue.summary.title); await expect(title).not.toHaveValue(privateTitle);
      await expect(text).toHaveText(''); await expect(text).not.toContainText(privateComment);
      await expect(queue.locator('.queue-items > li')).toHaveCount(0);
      await expect(queue).not.toContainText(filename); expect(transfers).toBe(0);
      expect((await coverageRead(request, f.issue.summary.id)).summary).toEqual(f.issue.summary);
      const discussion = await request.get(`${apiOrigin}/api/v1/issues/${f.issue.summary.id}/comments`, { headers: await coverageHeaders() });
      expect(discussion.status()).toBe(200); expect(zPageCommentView.parse(await discussion.json()).items).toEqual([]);
      const assets = await request.get(`${apiOrigin}/api/v1/issues/${f.issue.summary.id}/assets?includeOwnDrafts=true`, { headers: await coverageHeaders() });
      expect(assets.status()).toBe(200); expect(zPageAssetView.parse(await assets.json()).items).toEqual([]);
    } finally { page.off('request', transferred); }
    return;
  }
  if (family === 'planning') {
    const epic = (await coverageWrite(request, 'POST', `/api/v1/projects/${f.projectId}/planning`, { kind: 'epic', name: 'Previous account planning target', description: '', targetDate: null, status: 'planned' }, zSavedPlanningItemView, 201, 'member')).result;
    const original = await coverageGet(request, `/api/v1/issues/${f.issue.summary.id}/planning`, zIssuePlanningView, 'member');
    // Refetch choices through the actual component after creating the fixture.
    await page.getByRole('link', { name: 'All issues', exact: true }).click();
    await page.getByRole('link', { name: f.issue.summary.key + ' · ' + f.issue.summary.title, exact: true }).click();
    const panel = page.locator('gg-issue-planning'), choice = panel.getByRole('combobox', { name: 'Issue epic', exact: true });
    await expect(choice.locator('option[value="' + epic.id + '"]')).toHaveCount(1);
    await page.route(`**/api/v1/issues/${f.issue.summary.id}/planning`, async route => { if (route.request().method() === 'PUT') await route.abort('failed'); else await route.continue(); });
    try {
      await choice.selectOption(epic.id); await expect(panel.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
      await leaveDirtyAndReturn(page, page.getByRole('link', { name: 'All issues', exact: true }), /^Issues$/);
      await expect(choice).toHaveValue(epic.id); await expect(panel.getByRole('button', { name: 'Retry save', exact: true })).toBeVisible();
      await switchAccountInSameSPA(page); await openIssueNatively(page, f.issue);
      await expect(choice).toBeEnabled(); await expect(choice).toHaveValue('');
      await expect(panel.getByRole('button', { name: 'Retry save', exact: true })).toHaveCount(0);
      await expect(panel.getByRole('button', { name: 'Apply reviewed change', exact: true })).toHaveCount(0);
      expect(await coverageGet(request, `/api/v1/issues/${f.issue.summary.id}/planning`, zIssuePlanningView, 'member')).toEqual(original);
    } finally { await page.unrouteAll({ behavior: 'wait' }); }
    return;
  }
  if (family === 'field') {
    const field = await coverageDefinition(request, f.projectId, { kind: 'text', name: 'Session-owned custom value', defaultValue: { kind: 'text', text: 'Persisted field evidence' } });
    // This issue predates the definition: display/readback is explicitly empty.
    const original = await coverageFields(request, f.issue.summary.id);
    await page.getByRole('link', { name: 'All issues', exact: true }).click();
    await page.getByRole('link', { name: f.issue.summary.key + ' · ' + f.issue.summary.title, exact: true }).click();
    const panel = page.locator('gg-custom-fields'), value = panel.getByLabel(field.name, { exact: true });
    await value.fill('Previous account private custom field'); await expect(panel.getByRole('button', { name: 'Save fields', exact: true })).toBeVisible();
    await leaveDirtyAndReturn(page, page.getByRole('link', { name: 'All issues', exact: true }), /^Issues$/);
    await expect(value).toHaveValue('Previous account private custom field');
    await switchAccountInSameSPA(page); await openIssueNatively(page, f.issue);
    await expect(value).toHaveValue(''); await expect(panel.getByRole('button', { name: 'Save fields', exact: true })).toHaveCount(0);
    expect(await coverageFields(request, f.issue.summary.id)).toEqual(original);
    return;
  }
  if (family === 'bulk') {
    const priorities = await coverageGet(request, `/api/v2/projects/${f.projectId}/priorities`, zPagePriorityView, 'member');
    const low = priorities.items.find(value => value.key === 'low')!;
    await page.getByRole('link', { name: 'All issues', exact: true }).click();
    await page.route(`**/api/v2/issues/${f.issue.summary.id}/fields`, route => route.abort('failed'));
    const selection = page.getByRole('checkbox', { name: 'Select issue ' + f.issue.summary.key, exact: true });
    try {
      await selection.check(); await page.getByRole('combobox', { name: 'Bulk priority', exact: true }).selectOption(low.id);
      await page.getByRole('button', { name: 'Apply to selected', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Retry original bulk action', exact: true })).toBeVisible();
      await leaveDirtyAndReturn(page, page.getByRole('link', { name: 'Project overview', exact: true }), /^Isolated workflow/);
      await expect(selection).toBeChecked(); await expect(page.getByRole('combobox', { name: 'Bulk priority', exact: true })).toHaveValue(low.id);
      await expect(page.getByRole('button', { name: 'Retry original bulk action', exact: true })).toBeVisible();
      await switchAccountInSameSPA(page); await openListNatively(page, f.issue);
      await expect(selection).not.toBeChecked(); await expect(page.getByRole('region', { name: 'Bulk issue actions', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Retry original bulk action', exact: true })).toHaveCount(0);
      expect((await coverageRead(request, f.issue.summary.id)).summary).toEqual(f.issue.summary);
    } finally { await page.unrouteAll({ behavior: 'wait' }); }
    return;
  }
  if (family === 'board') {
    const board = await coverageBoard(request, f.projectId, 'Session-owned board layout');
    await page.getByRole('link', { name: 'Kanban boards', exact: true }).click();
    const row = page.locator('.boards-list li').filter({ has: page.getByRole('link', { name: board.board.name, exact: true }) });
    await row.getByRole('link', { name: 'Settings', exact: true }).click();
    const name = page.getByLabel('Board name', { exact: true }), column = page.getByRole('textbox', { name: 'Column 1', exact: true });
    await name.fill('Previous account board layout'); await column.fill('Previous account private stage group');
    await leaveDirtyAndReturn(page, page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Issues', exact: true }), /^Issues$/);
    await expect(name).toHaveValue('Previous account board layout'); await expect(column).toHaveValue('Previous account private stage group');
    await switchAccountInSameSPA(page); await openIssueNatively(page, f.issue);
    await page.getByRole('link', { name: 'Kanban boards', exact: true }).click(); await row.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(name).toHaveValue(board.board.name); await expect(column).toHaveValue(board.columns[0]!.name);
    await expect(page.getByText('All settings saved', { exact: true })).toBeVisible();
    expect(await coverageLayout(request, board.board.id)).toEqual(board);
    return;
  }
  const privateName = 'Previous account private saved-search';
  await page.getByRole('link', { name: 'All issues', exact: true }).click();
  const saved = page.locator('gg-saved-searches'); await saved.locator('summary').click();
  await page.route('**/api/v1/issue-searches/*', async route => { if (route.request().method() === 'PUT') await route.abort('failed'); else await route.continue(); });
  try {
    await saved.getByLabel('Saved search name', { exact: true }).fill(privateName);
    await saved.getByRole('button', { name: 'Save as new search', exact: true }).click();
    await expect(saved.getByRole('button', { name: 'Retry original saved search', exact: true })).toBeVisible();
    await leaveDirtyAndReturn(page, page.getByRole('link', { name: 'Project overview', exact: true }), /^Isolated workflow/);
    await saved.locator('summary').click(); await expect(saved.getByLabel('Saved search name', { exact: true })).toHaveValue(privateName);
    await expect(saved.getByRole('button', { name: 'Retry original saved search', exact: true })).toBeVisible();
    await switchAccountInSameSPA(page); await openListNatively(page, f.issue); await saved.locator('summary').click();
    await expect(saved.getByLabel('Saved search name', { exact: true })).toHaveValue('');
    await expect(saved.getByRole('combobox', { name: 'Saved search', exact: true })).toHaveValue('');
    await expect(saved.getByRole('button', { name: 'Retry original saved search', exact: true })).toHaveCount(0);
    await expect(saved).not.toContainText(privateName);
    const persisted = await request.get(`${apiOrigin}/api/v1/issue-searches`, { headers: await coverageHeaders() });
    expect(persisted.status()).toBe(200); expect(zSavedSearchList.parse(await persisted.json()).items.map(value => value.name)).not.toContain(privateName);
  } finally { await page.unrouteAll({ behavior: 'wait' }); }
}

test('same-SPA session changes clear every registered draft family through native UI', async ({ page, request }) => {
  await useCase('UC-SHL-0073', async () => {
    // One encompassing step must complete every named family. A filtered single
    // parameter can never turn this eight-family umbrella into a partial pass.
    for (const family of families) await test.step('registered draft family: ' + family, async () => matrixFamily(page, request, family));
  }, 'web');
});
