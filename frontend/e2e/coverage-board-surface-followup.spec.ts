import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { localFixturesAvailable, signIn } from './support/session';
import { mcpSuccess, mcpFailure, memberId } from './support/coverage-access';
import { restSuccess, restFailure } from './support/coverage-rest';
import { coverageBoard, coverageGet, coverageIssue, coverageLayout, coverageLayoutDraft, coverageProject, coverageReadIssue, coverageSaveLayout, coverageWrite } from './support/coverage-boards';
import type { IssueFilter, LayoutView, ModernCreateFields, ModernMoveFields, ModernSearchInput, NativeMoveFields, PageRequest, SaveIssueSearchRequest, SavedSearch } from '../src/app/api/generated/types.gen';
import { zBoardFailureBody, zKanbanReport, zLayoutView, zNativeCardPage, zPageModernIssueSummary, zPagePriorityView, zPageTypeView, zSavedDependencyView, zSavedLabelView, zSavedModernIssueView, zSavedSavedSearch, zSavedSearchList, zSearchIssuesV2Body } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires isolated real Go/PostgreSQL fixtures and both published service transports.');
test.use({ trace: 'off' });
test.describe.configure({ timeout: 120000 });
type Channel = 'rest' | 'mcp';
type Inputs = {
  get_board_v2: { boardId: string; temporaryFilters?: IssueFilter };
  list_board_cards_v2: { boardId: string; columnId: string; temporaryFilters?: IssueFilter; page?: PageRequest };
  list_saved_searches: Record<string, never>;
  save_issue_search: SaveIssueSearchRequest & { searchId: string; retryReference: string };
  create_issue_v2: ModernCreateFields & { projectId: string; retryReference: string };
  move_issue_v2: ModernMoveFields & { issueId: string; retryReference: string };
  move_board_card_v2: NativeMoveFields & { boardId: string; retryReference: string };
  search_issues_v2: ModernSearchInput;
  get_kanban_report: { projectId: string; from: string; through: string; page?: PageRequest };
};
function success<N extends keyof Inputs, S extends z.ZodType>(request: APIRequestContext, channel: Channel, name: N, args: Inputs[N], schema: S, role = 'member'): Promise<z.output<S>> {
  return channel === 'rest' ? restSuccess(request, name, args, schema, role) : mcpSuccess(request, name, args, schema, role);
}
function rejectedMove(request: APIRequestContext, channel: Channel, args: Inputs['move_board_card_v2']) {
  return channel === 'rest'
    ? restFailure(request, 'move_board_card_v2', args, zBoardFailureBody, 'prerequisite_unfinished', 'member')
    : mcpFailure(request, 'move_board_card_v2', args, zBoardFailureBody, 'prerequisite_unfinished', 'member');
}
const record = <T>(channel: Channel, id: string, body: () => Promise<T>) => useCase(id, body, channel);
function moveFields(layout: LayoutView, issueId: string, revision: string): Inputs['move_board_card_v2'] {
  const source = layout.columns.find(column => column.stages.some(mapping => mapping.stage.category === 'todo'))!;
  const target = layout.columns.find(column => column.stages.some(mapping => mapping.stage.category === 'done'))!;
  return { boardId: layout.board.id, retryReference: crypto.randomUUID(), issueId, expectedIssueRevision: revision, expectedBoardRevision: layout.board.revision, sourceColumnId: source.id, expectedSourceOrderRevision: source.orderRevision, targetColumnId: target.id, expectedTargetOrderRevision: target.orderRevision, targetStageId: target.stages.find(mapping => mapping.stage.category === 'done')!.stage.id, neighborIssueId: null, placement: 'last', temporaryFilters: {} };
}
function previousUtcDay(day: string): string { return new Date(new Date(day + 'T12:00:00Z').getTime() - 86400000).toISOString().slice(0, 10); }

for (const channel of ['rest', 'mcp'] as const) {
  test(channel + ' board opening exposes ordered columns, complete counts and bounded distinct card pages', async ({ request }) => {
    const projectId = await coverageProject(request), board = await coverageBoard(request, projectId, 'Bounded service board ' + channel);
    const expected: string[] = [];
    for (let index = 0; index < 27; index++) expected.push((await coverageIssue(request, projectId, { title: 'Bounded service card ' + index })).summary.id);
    await record(channel, 'UC-BRD-0004', async () => {
      const layout = await success(request, channel, 'get_board_v2', { boardId: board.board.id }, zLayoutView, 'viewer');
      expect(layout.columns.map(column => column.id)).toEqual(board.columns.map(column => column.id));
      expect(layout.columns.map(column => BigInt(column.position))).toEqual(layout.columns.map(column => BigInt(column.position)).sort((a, b) => a < b ? -1 : a > b ? 1 : 0));
      const todo = layout.columns.find(column => column.stages.some(mapping => mapping.stage.category === 'todo'))!;
      expect(todo).toMatchObject({ savedMatchCount: 27, visibleMatchCount: 27 });
      expect(layout.columns.filter(column => column.id !== todo.id).every(column => column.savedMatchCount === 0)).toBe(true);
      const first = await success(request, channel, 'list_board_cards_v2', { boardId: board.board.id, columnId: todo.id, page: { limit: 25 } }, zNativeCardPage, 'viewer');
      expect(first.items).toHaveLength(25); expect(first.nextCursor).not.toBeNull(); expect(first.terminal).toBe(false); expect(first.column.savedMatchCount).toBe(27);
      const next = await success(request, channel, 'list_board_cards_v2', { boardId: board.board.id, columnId: todo.id, page: { limit: 25, cursor: first.nextCursor! } }, zNativeCardPage, 'viewer');
      expect(next.items).toHaveLength(2); expect(next.nextCursor).toBeNull(); expect(next.terminal).toBe(true); expect(next.column.savedMatchCount).toBe(27);
      const actual = [...first.items, ...next.items].map(issue => issue.id);
      expect(actual).toHaveLength(27); expect(new Set(actual)).toEqual(new Set(expected));
    });
  });

  test(channel + ' project-scoped personal board criteria stay private and removal preserves the other active choice', async ({ request }) => {
    const projectId = await coverageProject(request), created: SavedSearch[] = [], marker = crypto.randomUUID();
    try {
      const target = (await success(request, channel, 'save_issue_search', { searchId: crypto.randomUUID(), retryReference: crypto.randomUUID(), expectedRevision: '0', name: 'Private board filter ' + marker.slice(0, 8), filters: { projectIds: [projectId], query: 'private-board-' + marker, statuses: ['todo'], assignee: { kind: 'self' } } }, zSavedSavedSearch)).result; created.push(target);
      const control = (await success(request, channel, 'save_issue_search', { searchId: crypto.randomUUID(), retryReference: crypto.randomUUID(), expectedRevision: '0', name: 'Retained board filter ' + marker.slice(0, 8), filters: { projectIds: [projectId], blocked: false } }, zSavedSavedSearch)).result; created.push(control);
      await record(channel, 'UC-BRD-0043', async () => {
        const own = await success(request, channel, 'list_saved_searches', {}, zSavedSearchList);
        expect(own.items.find(item => item.id === target.id)).toEqual(target);
        const other = await success(request, channel, 'list_saved_searches', {}, zSavedSearchList, 'owner');
        expect(other.items.some(item => item.id === target.id || item.id === control.id)).toBe(false);
        expect(other.items.some(item => item.name === target.name || item.filters.query === target.filters.query)).toBe(false);
      });
      await record(channel, 'UC-BRD-0042', async () => {
        const removed = await success(request, channel, 'save_issue_search', { searchId: target.id, retryReference: crypto.randomUUID(), expectedRevision: target.revision, name: target.name, filters: target.filters, removed: true }, zSavedSavedSearch);
        expect(removed.result).toMatchObject({ id: target.id, removed: true });
        const current = await success(request, channel, 'list_saved_searches', {}, zSavedSearchList);
        expect(current.items.some(item => item.id === target.id || item.name === target.name)).toBe(false);
        expect(current.items.find(item => item.id === control.id)).toEqual(control);
      });
    } finally {
      const own = await success(request, channel, 'list_saved_searches', {}, zSavedSearchList);
      for (const item of own.items.filter(item => created.some(value => value.id === item.id))) await success(request, channel, 'save_issue_search', { searchId: item.id, retryReference: crypto.randomUUID(), expectedRevision: item.revision, name: item.name, filters: item.filters, removed: true }, zSavedSavedSearch);
    }
  });

  test(channel + ' completion refusal exposes all unfinished prerequisite records through bounded service pages', async ({ request }) => {
    const projectId = await coverageProject(request), board = await coverageBoard(request, projectId, 'Prerequisite service board ' + channel), dependent = await coverageIssue(request, projectId, { title: 'Cannot complete before prerequisites' }), blockers: string[] = [];
    for (let index = 0; index < 26; index++) {
      const blocker = await coverageIssue(request, projectId, { title: 'Service prerequisite ' + index, assigneeId: memberId }), current = await coverageReadIssue(request, dependent.summary.id);
      await coverageWrite(request, 'POST', `/api/v1/issues/${dependent.summary.id}/dependencies`, { expectedIssueRevision: current.summary.revision, expectedGraphRevision: current.graphRevision, blockerId: blocker.summary.id }, zSavedDependencyView, 200, 'member');
      blockers.push(blocker.summary.id);
    }
    await record(channel, 'UC-BRD-0078', async () => {
      const before = await coverageReadIssue(request, dependent.summary.id), layout = await success(request, channel, 'get_board_v2', { boardId: board.board.id }, zLayoutView);
      const failure = await rejectedMove(request, channel, moveFields(layout, dependent.summary.id, before.summary.revision));
      expect(failure.error).toMatchObject({ code: 'prerequisite_unfinished', retryable: false, nextAction: 'finish_prerequisites' });
      const filters = { projectIds: [projectId], prerequisiteFor: dependent.summary.id };
      const first = await success(request, channel, 'search_issues_v2', { filters, page: { limit: 25 } }, zPageModernIssueSummary);
      expect(first.items).toHaveLength(25); expect(first.nextCursor).not.toBeNull(); expect(first.totalMatching).toBe(26);
      const next = await success(request, channel, 'search_issues_v2', { filters, page: { limit: 25, cursor: first.nextCursor! } }, zPageModernIssueSummary);
      expect(next.items).toHaveLength(1); expect(next.nextCursor).toBeNull(); expect(next.totalMatching).toBe(26);
      const actual = [...first.items, ...next.items]; expect(new Set(actual.map(item => item.id))).toEqual(new Set(blockers));
      expect(actual.every(item => item.assignee?.id === memberId && item.stage.category !== 'done')).toBe(true);
      expect((await coverageReadIssue(request, dependent.summary.id)).summary).toEqual(before.summary);
      expect((await success(request, channel, 'get_board_v2', { boardId: board.board.id }, zLayoutView)).columns.map(column => [column.id, column.orderRevision])).toEqual(layout.columns.map(column => [column.id, column.orderRevision]));
    });
  });

  test(channel + ' report windows recompute real completion history with inclusive same-day endpoints', async ({ request }) => {
    const projectId = await coverageProject(request), board = await coverageBoard(request, projectId), done = board.columns.flatMap(column => column.stages).find(mapping => mapping.stage.category === 'done')!.stage;
    const created = (await success(request, channel, 'create_issue_v2', { projectId, title: 'Actual windowed completion', retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result;
    const completed = (await success(request, channel, 'move_issue_v2', { issueId: created.summary.id, expectedRevision: created.summary.revision, targetStageId: done.id, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result;
    const day = new Date(completed.summary.updatedAt).toISOString().slice(0, 10), previous = previousUtcDay(day);
    await record(channel, 'UC-PLN-0040', async () => {
      const inside = await success(request, channel, 'get_kanban_report', { projectId, from: day, through: day }, zKanbanReport);
      expect(inside).toMatchObject({ from: day, through: day, completedCycles: 1 }); expect(inside.days).toEqual([{ day, completedCycles: 1 }]);
      const outside = await success(request, channel, 'get_kanban_report', { projectId, from: previous, through: previous }, zKanbanReport);
      expect(outside).toMatchObject({ from: previous, through: previous, completedCycles: 0 }); expect(outside.days).toEqual([]);
      const restored = await success(request, channel, 'get_kanban_report', { projectId, from: day, through: day }, zKanbanReport);
      expect(restored.completedCycles).toBe(1); expect(restored.days).toEqual(inside.days);
    });
  });
}

async function nativeWindow(page: Page, projectId: string, day: string) {
  await page.getByLabel('From', { exact: true }).fill(day); await page.getByLabel('Through', { exact: true }).fill(day);
  const loaded = page.waitForResponse(value => value.request().method() === 'GET' && new URL(value.url()).pathname === `/api/v1/projects/${projectId}/kanban-report` && new URL(value.url()).searchParams.get('from') === day && new URL(value.url()).searchParams.get('through') === day);
  await page.getByRole('button', { name: 'Update report', exact: true }).click();
  return zKanbanReport.parse(await (await loaded).json());
}
test('native report date changes recompute the completion metric and UTC throughput rows', async ({ request, page }) => {
  const projectId = await coverageProject(request), board = await coverageBoard(request, projectId), done = board.columns.flatMap(column => column.stages).find(mapping => mapping.stage.category === 'done')!.stage;
  const created = await coverageIssue(request, projectId, { title: 'Native inclusive report completion' });
  const completed = (await coverageWrite(request, 'POST', `/api/v2/issues/${created.summary.id}/move`, { expectedRevision: created.summary.revision, targetStageId: done.id }, zSavedModernIssueView, 200, 'member')).result;
  const day = new Date(completed.summary.updatedAt).toISOString().slice(0, 10), previous = previousUtcDay(day);
  await signIn(page, 'member', `/projects/${projectId}/reports`, /^Kanban reports$/);
  const metric = page.locator('.metric-grid article').filter({ has: page.locator('span').filter({ hasText: /^Completed cycles$/ }) }).locator('strong');
  await expect(metric).toHaveText('1');
  await useCase('UC-PLN-0040', async () => {
    expect((await nativeWindow(page, projectId, day)).completedCycles).toBe(1);
    await expect(metric).toHaveText('1'); await expect(page.getByRole('table', { name: 'Completed cycles by UTC day', exact: true }).locator('tbody th')).toHaveText([day]); await expect(page.getByRole('table', { name: 'Completed cycles by UTC day', exact: true }).locator('tbody td').first()).toHaveText('1');
    expect((await nativeWindow(page, projectId, previous)).completedCycles).toBe(0);
    await expect(metric).toHaveText('0'); await expect(page.getByText('No recorded completions in this date range.', { exact: false })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Completed cycles by UTC day', exact: true })).toHaveCount(0);
    expect((await nativeWindow(page, projectId, day)).completedCycles).toBe(1);
    await expect(metric).toHaveText('1'); await expect(page.getByRole('table', { name: 'Completed cycles by UTC day', exact: true }).locator('tbody th')).toHaveText([day]);
  }, 'web');
});

test('native board opening retains column order and full counts while loading bounded card pages', async ({ request, page }) => {
  const projectId = await coverageProject(request), board = await coverageBoard(request, projectId, 'Native full counts and bounded pages'), expected: string[] = [];
  for (let index = 0; index < 27; index++) expected.push((await coverageIssue(request, projectId, { title: 'Native bounded card ' + index })).summary.id);
  await signIn(page, 'viewer', `/boards/${board.board.id}`, /^Native full counts and bounded pages$/);
  await useCase('UC-BRD-0004', async () => {
    const columns = page.locator('.kanban-column');
    await expect(columns).toHaveCount(board.columns.length);
    expect(await columns.evaluateAll(elements => elements.map(element => element.getAttribute('data-column-id')))).toEqual(board.columns.map(column => column.id));
    const todo = board.columns.find(column => column.stages.some(mapping => mapping.stage.category === 'todo'))!;
    const target = page.locator(`.kanban-column[data-column-id="${todo.id}"]`), count = target.locator('.column-count'), cards = target.locator('gg-native-issue-card');
    await expect(target.getByRole('heading', { level: 2 })).toContainText(todo.name);
    await expect(count).toHaveText('27'); await expect(cards).toHaveCount(25);
    await expect(target.getByRole('button', { name: 'More ' + todo.name + ' issues', exact: true })).toBeEnabled();
    await target.getByRole('button', { name: 'More ' + todo.name + ' issues', exact: true }).click();
    await expect(cards).toHaveCount(27); await expect(count).toHaveText('27');
    await expect(target.getByRole('button', { name: 'More ' + todo.name + ' issues', exact: true })).toHaveCount(0);
    const actual = await cards.evaluateAll(elements => elements.map(element => element.getAttribute('data-issue-id')));
    expect(actual).toHaveLength(27); expect(new Set(actual)).toEqual(new Set(expected));
    for (const column of board.columns.filter(column => column.id !== todo.id)) await expect(page.locator(`.kanban-column[data-column-id="${column.id}"] .column-count`)).toHaveText('0');
  }, 'web');
});


test('native Clear filters restores a restricted permanent board view without exposing excluded work', async ({ request, page }) => {
  const projectId = await coverageProject(request), marker = 'permanent-' + crypto.randomUUID();
  const first = await coverageIssue(request, projectId, { title: marker + ' first' });
  const second = await coverageIssue(request, projectId, { title: marker + ' second' });
  const outside = await coverageIssue(request, projectId, { title: 'Outside the permanent saved board view' });
  const board = await coverageBoard(request, projectId, 'Restricted permanent board view'), draft = coverageLayoutDraft(board);
  draft.savedFilters = { query: marker };
  const saved = await coverageSaveLayout(request, board.board.id, draft);
  await signIn(page, 'member', `/boards/${board.board.id}`, /^Restricted permanent board view$/);
  const cards = page.locator('gg-native-issue-card'), query = page.getByRole('searchbox', { name: 'Search this board', exact: true });
  await expect(cards).toHaveCount(2);
  expect(new Set(await cards.evaluateAll(elements => elements.map(element => element.getAttribute('data-issue-id'))))).toEqual(new Set([first.summary.id, second.summary.id]));
  await expect(page.locator(`gg-native-issue-card[data-issue-id="${outside.summary.id}"]`)).toHaveCount(0);
  await query.fill(first.summary.key);
  await expect(cards).toHaveCount(1); await expect(cards).toHaveAttribute('data-issue-id', first.summary.id);
  await useCase('UC-BRD-0037', async () => {
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await expect(query).toHaveValue(''); await expect(cards).toHaveCount(2);
    expect(new Set(await cards.evaluateAll(elements => elements.map(element => element.getAttribute('data-issue-id'))))).toEqual(new Set([first.summary.id, second.summary.id]));
    await expect(page.locator(`gg-native-issue-card[data-issue-id="${outside.summary.id}"]`)).toHaveCount(0);
    const current = await coverageLayout(request, board.board.id);
    expect(current.board.savedFilters).toEqual(saved.board.savedFilters);
    expect(current.board.revision).toBe(saved.board.revision);
    expect(current.columns.reduce((count, column) => count + column.visibleMatchCount, 0)).toBe(2);
  }, 'web');
});

test('native Reset clears an active multivalue saved-search overlay and every advanced restriction', async ({ request, page }) => {
  const projectId = await coverageProject(request), marker = 'saved-overlay-' + crypto.randomUUID();
  const types = (await coverageGet(request, `/api/v2/projects/${projectId}/issue-types`, zPageTypeView)).items;
  const priorities = (await coverageGet(request, `/api/v2/projects/${projectId}/priorities`, zPagePriorityView)).items;
  const task = types.find(value => value.key === 'task'), bug = types.find(value => value.key === 'bug');
  const medium = priorities.find(value => value.key === 'medium'), high = priorities.find(value => value.key === 'high'), low = priorities.find(value => value.key === 'low');
  if (!task || !bug || !medium || !high || !low) throw new Error('Missing seeded type/priority choices for saved-search reset fixture.');
  const label = (await coverageWrite(request, 'POST', `/api/v1/projects/${projectId}/labels`, { name: 'Reset overlay label' }, zSavedLabelView, 201, 'member')).result;
  const first = await coverageIssue(request, projectId, { title: marker + ' task', typeId: task.id, priorityId: medium.id, assigneeId: memberId, dueDate: '2000-01-01', labelIds: [label.id] });
  let second = await coverageIssue(request, projectId, { title: marker + ' bug', typeId: bug.id, priorityId: high.id, assigneeId: memberId, dueDate: '2000-01-02', labelIds: [label.id] });
  const outside = await coverageIssue(request, projectId, { title: 'Excluded from selected saved-search overlay', typeId: task.id, priorityId: low.id, dueDate: '2999-01-01' });
  const board = await coverageBoard(request, projectId), review = board.columns.flatMap(column => column.stages).find(mapping => mapping.stage.category === 'review')!.stage;
  second = (await coverageWrite(request, 'POST', `/api/v2/issues/${second.summary.id}/move`, { expectedRevision: second.summary.revision, targetStageId: review.id }, zSavedModernIssueView, 200, 'member')).result;
  const filters: IssueFilter = { projectIds: [projectId], query: marker, statuses: ['todo', 'review'], typeIds: [task.id, bug.id], priorityIds: [medium.id, high.id], assignee: { kind: 'self' }, dueFrom: '1999-01-01', dueTo: '2001-01-01', labelIds: [label.id], blocked: false, sort: 'due' };
  const saved = (await success(request, 'rest', 'save_issue_search', { searchId: crypto.randomUUID(), retryReference: crypto.randomUUID(), expectedRevision: '0', name: 'Native reset overlay ' + marker.slice(-8), filters }, zSavedSavedSearch)).result;
  try {
    await signIn(page, 'member', `/issues?projectId=${projectId}`, /^Issues$/);
    const keys = page.getByRole('list', { name: 'Issue results list', exact: true }).locator('.issue-key');
    await expect(keys).toHaveCount(3);
    const panel = page.locator('gg-saved-searches details');
    await panel.locator('summary').click();
    const appliedResponse = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === '/api/v2/issues/search' && zSearchIssuesV2Body.parse(value.request().postDataJSON()).filters.priorityIds?.length === 2);
    await page.getByRole('combobox', { name: 'Saved search', exact: true }).selectOption(saved.id);
    const applied = await appliedResponse;
    expect(applied.status()).toBe(200);
    const appliedFilters = zSearchIssuesV2Body.parse(applied.request().postDataJSON()).filters;
    for (const field of ['statuses', 'typeIds', 'priorityIds'] as const) {
      expect(appliedFilters[field]).toHaveLength(2); expect(new Set(appliedFilters[field])).toEqual(new Set(filters[field]));
    }
    expect(appliedFilters).toMatchObject({ projectIds: [projectId], query: marker, dueFrom: filters.dueFrom, dueTo: filters.dueTo, labelIds: [label.id], assignee: { kind: 'self' }, blocked: false, sort: 'due' });
    expect(new Set(zPageModernIssueSummary.parse(await applied.json()).items.map(issue => issue.id))).toEqual(new Set([first.summary.id, second.summary.id]));
    await expect(keys).toHaveText([first.summary.key, second.summary.key]);
    const notice = page.getByText(/The complete saved filters remain active, including all values/);
    await expect(notice).toBeVisible();
    await page.locator('details.advanced-filters > summary').click();
    for (const name of ['Status', 'Type', 'Priority']) await expect(page.getByRole('combobox', { name, exact: true })).toHaveValue('__saved');
    await expect(page.getByText('1 / 10 labels selected', { exact: true })).toBeVisible();
    await useCase('UC-ISS-0068', async () => {
      const resetResponse = page.waitForResponse(value => {
        if (value.request().method() !== 'POST' || new URL(value.url()).pathname !== '/api/v2/issues/search') return false;
        const outgoing = zSearchIssuesV2Body.parse(value.request().postDataJSON()).filters;
        return outgoing.query === '' && !outgoing.projectIds && !outgoing.priorityIds;
      });
      await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
      const reset = await resetResponse; expect(reset.status()).toBe(200); zPageModernIssueSummary.parse(await reset.json());
      expect(zSearchIssuesV2Body.parse(reset.request().postDataJSON()).filters).toEqual({ query: '', assignee: { kind: 'any' }, sort: 'updated', archived: false });
      await expect(notice).toHaveCount(0);
      await expect(page.getByRole('searchbox', { name: 'Search by title or issue key', exact: true })).toHaveValue('');
      for (const name of ['Project', 'Status', 'Type', 'Priority', 'Blocked', 'Overdue']) await expect(page.getByRole('combobox', { name, exact: true })).toHaveValue('');
      await expect(page.getByRole('combobox', { name: 'Assigned to', exact: true })).toHaveValue('any');
      await expect(page.getByRole('combobox', { name: 'View', exact: true })).toHaveValue('active');
      await expect(page.getByRole('combobox', { name: 'Sort', exact: true })).toHaveValue('updated');
      await expect(page.getByLabel('Due from', { exact: true })).toHaveValue(''); await expect(page.getByLabel('Due through', { exact: true })).toHaveValue('');
      await expect(page.getByText('0 / 10 labels selected', { exact: true })).toBeVisible();
      // Reset intentionally returns to all accessible projects. Reapply only the
      // project scope, then prove none of the saved query/advanced overlays return.
      const scopedResponse = page.waitForResponse(value => {
        if (value.request().method() !== 'POST' || new URL(value.url()).pathname !== '/api/v2/issues/search') return false;
        return zSearchIssuesV2Body.parse(value.request().postDataJSON()).filters.projectIds?.[0] === projectId;
      });
      await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption(projectId);
      const scoped = await scopedResponse; expect(scoped.status()).toBe(200);
      expect(zSearchIssuesV2Body.parse(scoped.request().postDataJSON()).filters).toEqual({ query: '', projectIds: [projectId], assignee: { kind: 'any' }, sort: 'updated', archived: false });
      expect(new Set(zPageModernIssueSummary.parse(await scoped.json()).items.map(issue => issue.id))).toEqual(new Set([first.summary.id, second.summary.id, outside.summary.id]));
      await expect(keys).toHaveCount(3);
      expect(new Set(await keys.allTextContents())).toEqual(new Set([first.summary.key, second.summary.key, outside.summary.key]));
    }, 'web');
    const own = await success(request, 'rest', 'list_saved_searches', {}, zSavedSearchList);
    expect(own.items.find(item => item.id === saved.id)).toEqual(saved);
  } finally {
    const own = await success(request, 'rest', 'list_saved_searches', {}, zSavedSearchList), current = own.items.find(item => item.id === saved.id);
    if (current) await success(request, 'rest', 'save_issue_search', { searchId: current.id, retryReference: crypto.randomUUID(), expectedRevision: current.revision, name: current.name, filters: current.filters, removed: true }, zSavedSavedSearch);
  }
});
