// Parent-controller model units: real Angular forms/effects/RequestState and
// typed external ports. Public child queries are stubbed with actual child
// models; no Angular query internals or template/browser rendering is claimed.
import '@angular/compiler';
import { provideZonelessChangeDetection, RendererFactory2, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, convertToParamMap, Router, type ParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigurationView, IssueFilter, Me, ModernIssueView, PageModernIssueSummary, PageProjectView, PageTypeView, PageUserSummary, PriorityView, ProjectView, SavedModernIssueView, TypeView } from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { AssetsApi } from '../../../attachments/assets.api';
import { ProjectConfigurationApi } from '../../../projects/project-configuration.api';
import { ProjectsApi } from '../../../projects/projects.api';
import { ProjectWorkflowsApi } from '../../../projects/project-workflows.api';
import { ModernIssueFormComponent } from '../../components/modern-issue-form/modern-issue-form.component';
import { ModernBulkActionsComponent } from '../../components/bulk-actions/modern-bulk-actions.component';
import { IssuesApi } from '../../issues.api';
import { ModernIssuesApi } from '../../modern-issues.api';
import { ModernIssueListPage } from './modern-issue-list.page';

const projectId = '20000000-0000-4000-8000-000000000001', otherProject = '20000000-0000-4000-8000-000000000002';
const typeId = '30000000-0000-4000-8000-000000000001', priorityId = '40000000-0000-4000-8000-000000000001', workflowId = '80000000-0000-4000-8000-000000000001';
const actor = { id: '10000000-0000-4000-8000-000000000002', displayName: 'Current member' };
const identity: Me = { userId: actor.id, displayName: actor.displayName, email: 'member@example.test', administrator: false, companyTimeZone: 'UTC' };
function project(id = projectId, overrides: Partial<ProjectView> = {}): ProjectView { return { id, name: id === projectId ? 'Selected project' : 'Other project', key: 'UNIT', description: '', archived: false, effectiveRole: 'member', revision: '1', createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z', ...overrides }; }
function issueType(id = typeId): TypeView { return { id, projectId, key: 'task', name: 'Task', behavior: 'standard', default: true, retired: false }; }
function priority(id = priorityId): PriorityView { return { id, projectId, key: 'medium', name: 'Medium', sortOrder: '1', default: true, retired: false }; }
function issue(index = 1): ModernIssueView {
  return { capabilities: ['read', 'edit'], description: '', descriptionFormat: 'plain', graphRevision: '1', links: [], reporter: actor, watching: false,
    summary: { id: '50000000-0000-4000-8000-' + String(index).padStart(12, '0'), projectId, key: 'UNIT-' + index, number: String(index), title: 'Issue ' + index, revision: '7', archived: false, backlog: false, blocked: false,
      createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z', dueDate: null, overdue: false, assignee: null, labels: [], parent: null, subtaskProgress: { total: 0, done: 0 }, unfinishedBlockerCount: 0,
      type: issueType(), priority: priority(), workflow: { id: workflowId, name: 'Delivery', revision: '1', retired: false },
      stage: { id: '90000000-0000-4000-8000-000000000001', name: 'To do', category: 'todo', position: '1', initial: true, retired: false, acceptsEntries: true } } };
}
const resultPage = (items = [issue().summary], cursor: string | null = null, total = items.length): PageModernIssueSummary => ({ items, nextCursor: cursor, totalMatching: total });
const savedIssue = (value = issue()): SavedModernIssueView => ({ result: value, receipt: { eventId: null, replayed: false } });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const unavailable = () => new ApiError({ error: { code: 'temporarily_unavailable', message: 'Keep the original retry identity.', retryable: true, nextAction: 'retry_same_reference', fieldErrors: [] }, current: null, unfinished: null }, 503);
const flush = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
describe('issue-list parent controller owns filters, pages, selection and creation replies', () => {
  const epoch = signal(1), me = signal<Me | null>(identity), confirm = vi.fn<Window['confirm']>();
  const search = vi.fn<ModernIssuesApi['search']>(), create = vi.fn<ModernIssuesApi['create']>(), getIssue = vi.fn<ModernIssuesApi['get']>();
  const listProjects = vi.fn<ProjectsApi['list']>(), getProject = vi.fn<ProjectsApi['get']>();
  const types = vi.fn<ProjectConfigurationApi['types']>(), priorities = vi.fn<ProjectConfigurationApi['priorities']>(), getConfiguration = vi.fn<ProjectConfigurationApi['get']>();
  const assignees = vi.fn<IssuesApi['assignees']>(), navigate = vi.fn<Router['navigate']>();
  const policy = vi.fn<AssetsApi['policy']>(), upload = vi.fn<AssetsApi['uploadFile']>(), workflows = vi.fn<ProjectWorkflowsApi['workflows']>(), bindings = vi.fn<ProjectWorkflowsApi['bindings']>();
  let page: ModernIssueListPage, drafts: DraftsService, parameters: BehaviorSubject<ParamMap>, snapshot: { queryParamMap: ParamMap };
  beforeEach(() => {
    epoch.set(1); me.set(identity); confirm.mockReset().mockReturnValue(true);
    search.mockReset().mockResolvedValue(resultPage()); create.mockReset().mockResolvedValue(savedIssue()); getIssue.mockReset().mockResolvedValue(issue());
    listProjects.mockReset().mockResolvedValue({ items: [project()], nextCursor: null, totalMatching: 1 }); getProject.mockReset().mockImplementation(async id => project(id));
    types.mockReset().mockResolvedValue({ items: [issueType()], nextCursor: null, totalMatching: 1 }); priorities.mockReset().mockResolvedValue({ items: [priority()], nextCursor: null, totalMatching: 1 });
    getConfiguration.mockReset().mockResolvedValue({ projectId, revision: '1', mode: 'modern', canManage: false, defaults: { standardTypeId: typeId, subtaskTypeId: '30000000-0000-4000-8000-000000000002', priorityId } } satisfies ConfigurationView);
    assignees.mockReset().mockResolvedValue({ items: [actor], nextCursor: null, totalMatching: 1 }); navigate.mockReset().mockResolvedValue(true);
    policy.mockReset().mockResolvedValue({ maximumFileBytes: '10485760', maximumImageBytes: '10485760', chunkBytes: '1048576' }); upload.mockReset();
    workflows.mockReset().mockResolvedValue({ items: [{ id: workflowId, projectId, name: 'Delivery', revision: '1', retired: false, legacyBridge: false }], nextCursor: null, totalMatching: 1 });
    bindings.mockReset().mockResolvedValue({ items: [{ projectId, typeId, workflowId, default: true, acceptsNew: true }], nextCursor: null, totalMatching: 1 });
    snapshot = { queryParamMap: convertToParamMap({ projectId }) }; parameters = new BehaviorSubject(snapshot.queryParamMap);
    vi.stubGlobal('window', Object.assign(new EventTarget(), { confirm })); vi.stubGlobal('document', Object.assign(new EventTarget(), { getElementById: () => null, visibilityState: 'hidden' }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { sessionEpoch: epoch, me } satisfies Pick<AuthService, 'sessionEpoch' | 'me'> },
      { provide: ModernIssuesApi, useValue: { search, create, get: getIssue } satisfies Pick<ModernIssuesApi, 'search' | 'create' | 'get'> },
      { provide: ProjectsApi, useValue: { list: listProjects, get: getProject } satisfies Pick<ProjectsApi, 'list' | 'get'> },
      { provide: ProjectConfigurationApi, useValue: { types, priorities, get: getConfiguration } satisfies Pick<ProjectConfigurationApi, 'types' | 'priorities' | 'get'> },
      { provide: ProjectWorkflowsApi, useValue: { workflows, bindings } satisfies Pick<ProjectWorkflowsApi, 'workflows' | 'bindings'> },
      { provide: IssuesApi, useValue: { assignees } satisfies Pick<IssuesApi, 'assignees'> },
      { provide: AssetsApi, useValue: { policy, uploadFile: upload } satisfies Pick<AssetsApi, 'policy' | 'uploadFile'> },
      { provide: ActivatedRoute, useValue: { snapshot, queryParamMap: parameters.asObservable() } },
      { provide: Router, useValue: { navigate } satisfies Pick<Router, 'navigate'> },
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('Controller models are not rendered.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
    ] });
    drafts = TestBed.inject(DraftsService); page = TestBed.runInInjectionContext(() => new ModernIssueListPage()); TestBed.tick();
  });
  afterEach(() => { parameters.complete(); TestBed.resetTestingModule(); vi.unstubAllGlobals(); vi.useRealTimers(); });
  async function loaded() { await flush(); expect(page.state.busy()).toBe(false); expect(page.searchState.busy()).toBe(false); }
  function route(values: Record<string, string>) { snapshot.queryParamMap = convertToParamMap(values); parameters.next(snapshot.queryParamMap); }
  async function childForm(scope = 'controller'): Promise<ModernIssueFormComponent> {
    const model = TestBed.runInInjectionContext(() => new ModernIssueFormComponent());
    Object.defineProperties(model, { projectId: { value: signal(page.filters.controls.projectId.value).asReadonly() }, draftScope: { value: signal(scope).asReadonly() } });
    // Public query-call boundary only; Angular query state is untouched.
    vi.spyOn(page, 'form').mockReturnValue(model); TestBed.tick(); await flush(); return model;
  }
  function frozenBulk(): ModernBulkActionsComponent {
    const bulk = TestBed.runInInjectionContext(() => new ModernBulkActionsComponent());
    Object.defineProperties(bulk, { projectId: { value: signal(projectId).asReadonly() }, selected: { value: page.selected.asReadonly() }, priorities: { value: signal([priority()]).asReadonly() } });
    vi.spyOn(page, 'bulk').mockReturnValue(bulk); TestBed.tick(); vi.spyOn(bulk, 'frozen').mockReturnValue(true); return bulk;
  }

  it('starts exact current-project search, choices and people and exposes the discovered writable project', async () => {
    await loaded(); expect(page.selectedProject()?.id).toBe(projectId); expect(page.writable()).toBe(true);
    expect(search).toHaveBeenCalledExactlyOnceWith({ query: '', projectIds: [projectId], assignee: { kind: 'any' }, sort: 'updated', archived: false }, undefined);
    expect(listProjects).toHaveBeenCalledExactlyOnceWith(true, undefined); expect(types).toHaveBeenCalledExactlyOnceWith(projectId); expect(assignees).toHaveBeenCalledExactlyOnceWith(projectId, '', undefined);
  });

  it('serializes one coherent public filter snapshot and debounces intermediate keystrokes', async () => {
    await loaded(); vi.useFakeTimers(); search.mockClear(); const labelId = '60000000-0000-4000-8000-000000000001';
    page.filters.patchValue({ query: '  Current text  ', status: 'open', assignee: actor.id, typeId, priorityId, parentId: issue(2).summary.id, labelIds: [labelId], dueFrom: '2026-10-01', dueTo: '2026-10-31', overdue: 'false', blocked: 'true', sort: 'due', view: 'backlog' });
    page.filters.controls.query.setValue('  Final query  '); expect(page.searchPending()).toBe(true); await vi.advanceTimersByTimeAsync(119); expect(search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(search).toHaveBeenCalledExactlyOnceWith({ query: 'Final query', projectIds: [projectId], statuses: ['todo', 'in_progress', 'review'], typeIds: [typeId], priorityIds: [priorityId], parentId: issue(2).summary.id, labelIds: [labelId], dueFrom: '2026-10-01', dueTo: '2026-10-31', overdue: false, blocked: true, assignee: { kind: 'user', userId: actor.id }, sort: 'due', archived: false, backlog: true }, undefined);
    expect(page.filterSnapshot()).toEqual(search.mock.calls[0]?.[0]); expect(page.searchPending()).toBe(false);
  });

  it.each(['priority', 'created', 'updated'] as const)('preserves the public %s sort and explicit archived scope', async sort => {
    await loaded(); page.filters.patchValue({ sort, view: 'archived', assignee: 'unassigned', status: 'done' }); await page.search();
    expect(search.mock.calls.at(-1)?.[0]).toMatchObject({ sort, archived: true, statuses: ['done'], assignee: { kind: 'unassigned' } }); expect(search.mock.calls.at(-1)?.[0]).not.toHaveProperty('backlog');
  });

  it('appends only the requested opaque search page and retains the accepted filter during paging', async () => {
    await loaded(); search.mockResolvedValueOnce(resultPage([issue(1).summary], 'opaque-next-page', 2)).mockResolvedValueOnce(resultPage([issue(2).summary], null, 2));
    await page.search(); const accepted = search.mock.calls.at(-1)?.[0]; await page.search(true);
    expect(search.mock.calls.at(-1)).toEqual([accepted, 'opaque-next-page']); expect(page.items().map(value => value.id)).toEqual([issue(1).summary.id, issue(2).summary.id]); expect(page.total()).toBe(2); expect(page.cursor()).toBeNull();
  });

  it('retains previous results and exact continuation cursor after a page failure, then retries explicitly', async () => {
    await loaded(); search.mockResolvedValueOnce(resultPage([issue().summary], 'retry-page', 2)); await page.search(); search.mockRejectedValueOnce(unavailable()); await page.search(true);
    expect(page.items()).toEqual([issue().summary]); expect(page.cursor()).toBe('retry-page'); expect(page.searchState.failure()?.status).toBe(503);
    search.mockResolvedValueOnce(resultPage([issue(2).summary], null, 2)); await page.search(true);
    expect(search.mock.calls.at(-1)).toEqual(search.mock.calls.at(-2)); expect(page.items()).toHaveLength(2); expect(page.searchState.message()).toBe('');
  });

  it('does not let an old success or error replace a newer-query page', async () => {
    await loaded(); const held = deferred<PageModernIssueSummary>(); search.mockReturnValueOnce(held.promise); const previous = page.search();
    page.filters.controls.query.setValue('Current'); search.mockResolvedValueOnce(resultPage([issue(2).summary])); await page.search(); held.reject(unavailable()); await previous;
    expect(page.items()).toEqual([issue(2).summary]); expect(page.searchState.message()).toBe(''); expect(page.searchState.busy()).toBe(false); expect(page.filterSnapshot().query).toBe('Current');
  });

  it.each(['session', 'destroy'] as const)('ignores a late search page after %s ownership changes', async context => {
    await loaded(); const held = deferred<PageModernIssueSummary>(); search.mockReturnValueOnce(held.promise); const previous = page.search();
    if (context === 'session') { me.set(null); epoch.update(value => value + 1); TestBed.tick(); } else TestBed.resetTestingModule();
    held.resolve(resultPage([issue(99).summary], 'private-old-cursor', 99)); await previous;
    expect(page.items().some(value => value.id === issue(99).summary.id)).toBe(false); expect(page.cursor()).not.toBe('private-old-cursor'); expect(page.searchState.message()).toBe('');
  });

  it('merges explicit edits onto a saved multi-project/multi-type snapshot without silently dropping other constraints', async () => {
    await loaded(); const snapshot: IssueFilter = { query: 'Saved query', projectIds: [projectId, otherProject], statuses: ['todo', 'review'], types: ['task', 'bug'], priorities: ['high', 'low'], labelIds: ['60000000-0000-4000-8000-000000000001'], blocked: true, backlog: true, archived: false, assignee: { kind: 'self' }, sort: 'priority', dueFrom: '2026-10-01', dueTo: '2026-10-31', overdue: true };
    await page.applySaved(snapshot); expect(search.mock.calls.at(-1)?.[0]).toEqual(snapshot); expect(page.fullSavedFilter()).toBe(true); expect(page.filters.controls.typeId.value).toBe('__saved'); expect(page.filters.controls.priorityId.value).toBe('__saved');
    page.filters.controls.query.setValue('Only changed query'); await page.search(); expect(search.mock.calls.at(-1)?.[0]).toEqual({ ...snapshot, query: 'Only changed query' });
    page.filters.controls.typeId.setValue(typeId); page.filters.controls.priorityId.setValue(priorityId); await page.search(); const changed = search.mock.calls.at(-1)?.[0]; expect(changed?.typeIds).toEqual([typeId]); expect(changed?.priorityIds).toEqual([priorityId]); expect(changed).not.toHaveProperty('types'); expect(changed).not.toHaveProperty('priorities'); expect(changed?.projectIds).toEqual([projectId, otherProject]);
  });

  it('explicitly resets saved filters rather than retaining invisible multi-value conditions', async () => {
    await loaded(); await page.applySaved({ query: 'Saved', statuses: ['todo', 'done'], projectIds: [projectId], archived: true, backlog: true }); page.reset(); await page.search();
    expect(page.fullSavedFilter()).toBe(false); expect(page.filters.getRawValue()).toEqual({ query: '', projectId: '', status: '', assignee: 'any', typeId: '', priorityId: '', view: 'active', sort: 'updated', blocked: '', parentId: '', labelIds: [], dueFrom: '', dueTo: '', overdue: '' });
    expect(search.mock.calls.at(-1)?.[0]).toEqual({ query: '', assignee: { kind: 'any' }, sort: 'updated', archived: false });
  });

  it('removes explicitly cleared saved constraints while preserving the untouched project scope', async () => {
    await loaded(); const savedFilter: IssueFilter = { projectIds: [projectId], query: 'Private saved text', statuses: ['todo', 'review'], types: ['task', 'bug'], priorities: ['high'], assignee: { kind: 'self' }, parentId: issue(2).summary.id, labelIds: ['60000000-0000-4000-8000-000000000001'], dueFrom: '2026-10-01', dueTo: '2026-10-31', overdue: true, blocked: true, sort: 'due', archived: true, backlog: true };
    const unchanged = structuredClone(savedFilter); await page.applySaved(savedFilter);
    page.filters.patchValue({ query: '', status: '', typeId: '', priorityId: '', assignee: 'any', parentId: '', labelIds: [], dueFrom: '', dueTo: '', overdue: '', blocked: '', sort: 'updated', view: 'active' }); await page.search();
    const actual = search.mock.calls.at(-1)?.[0]; expect(JSON.parse(JSON.stringify(actual))).toEqual({ projectIds: [projectId], query: '', assignee: { kind: 'any' }, sort: 'updated', archived: false });
    expect(savedFilter).toEqual(unchanged); expect(page.filterSnapshot()).toEqual(actual);
  });

  it('contains an initial project-directory failure without treating returned issue rows as write permission', async () => {
    await loaded(); listProjects.mockRejectedValueOnce(unavailable()); const failed = TestBed.runInInjectionContext(() => new ModernIssueListPage()); TestBed.tick(); await flush();
    expect(failed.state.failure()?.status).toBe(503); expect(failed.state.busy()).toBe(false); expect(failed.items()).toEqual([issue().summary]); expect(failed.writable()).toBe(false);
    failed.newIssue(); expect(failed.creating()).toBe(false); expect(create).not.toHaveBeenCalled();
  });

  it('keeps search failures separate from successful configuration discovery and retries the current filter', async () => {
    await loaded(); const failed = unavailable(); search.mockRejectedValueOnce(failed); page.filters.controls.query.setValue('Recoverable current query'); await page.search();
    expect(page.searchState.failure()).toBe(failed); expect(page.optionsState.message()).toBe(''); expect(page.writable()).toBe(true); expect(page.items()).toEqual([issue().summary]);
    search.mockResolvedValueOnce(resultPage([issue(2).summary])); await page.search(); expect(page.items()).toEqual([issue(2).summary]); expect(page.searchState.failure()).toBeNull(); expect(search.mock.calls.at(-1)).toEqual(search.mock.calls.at(-2));
  });

  it('treats a repeated route project change as new discovery without retaining project-specific filters or selection', async () => {
    await loaded(); vi.useFakeTimers(); page.filters.controls.typeId.setValue(typeId); page.filters.controls.priorityId.setValue(priorityId); page.filters.controls.labelIds.setValue(['60000000-0000-4000-8000-000000000001']); page.toggle(issue().summary);
    route({ projectId: otherProject, query: 'Routed', status: 'review', assignee: 'self', blocked: 'false', sort: 'created' }); await flush(); await vi.advanceTimersByTimeAsync(120);
    expect(page.filters.controls.projectId.value).toBe(otherProject); expect(page.filters.controls.typeId.value).toBe(''); expect(page.filters.controls.priorityId.value).toBe(''); expect(page.filters.controls.labelIds.value).toEqual([]); expect(page.selected()).toEqual([]);
    expect(types).toHaveBeenLastCalledWith(otherProject); expect(getProject).toHaveBeenCalledWith(otherProject); expect(search.mock.calls.at(-1)?.[0]).toMatchObject({ projectIds: [otherProject], query: 'Routed', statuses: ['review'], assignee: { kind: 'self' }, blocked: false, sort: 'created' });
  });

  it('keeps an independently retained project when directory pagination later returns that same identity', async () => {
    await loaded(); listProjects.mockResolvedValueOnce({ items: [project(otherProject)], nextCursor: 'projects-next', totalMatching: 2 }); await page.loadProjects();
    expect(getProject).toHaveBeenCalledWith(projectId); expect(page.projects().map(value => value.id)).toEqual([otherProject, projectId]);
    listProjects.mockResolvedValueOnce({ items: [project()], nextCursor: null, totalMatching: 2 }); await page.loadProjects(true);
    expect(listProjects).toHaveBeenLastCalledWith(true, 'projects-next'); expect(page.projects().map(value => value.id)).toEqual([otherProject, projectId]);
  });

  it('does not append an old-session retained project directory result into the new owner', async () => {
    await loaded(); const held = deferred<PageProjectView>(); listProjects.mockReturnValueOnce(held.promise); const previous = page.loadProjects(); me.set(null); epoch.update(value => value + 1); TestBed.tick();
    held.resolve({ items: [project(otherProject)], nextCursor: 'private-old-directory', totalMatching: 1 }); await previous;
    expect(page.projects()).toEqual([]); expect(page.selectedProject()).toBeUndefined(); expect(page.writable()).toBe(false);
  });

  it.each(['types', 'priorities'] as const)('retains failed %s paging and retries the exact cursor', async kind => {
    await loaded();
    if (kind === 'types') types.mockResolvedValueOnce({ items: [issueType()], nextCursor: 'choice-next', totalMatching: 2 }); else priorities.mockResolvedValueOnce({ items: [priority()], nextCursor: 'choice-next', totalMatching: 2 });
    await page.loadChoices(); const port = kind === 'types' ? types : priorities; port.mockRejectedValueOnce(unavailable()); await page.moreChoices(kind);
    expect(page.optionsState.failure()?.status).toBe(503); expect(kind === 'types' ? page.typeCursor() : page.priorityCursor()).toBe('choice-next');
    if (kind === 'types') types.mockResolvedValueOnce({ items: [issueType('30000000-0000-4000-8000-000000000003')], nextCursor: null, totalMatching: 2 }); else priorities.mockResolvedValueOnce({ items: [priority('40000000-0000-4000-8000-000000000003')], nextCursor: null, totalMatching: 2 });
    await page.moreChoices(kind); expect(port.mock.calls.at(-1)).toEqual([projectId, 'choice-next']); expect(port.mock.calls.at(-1)).toEqual(port.mock.calls.at(-2)); expect(kind === 'types' ? page.types() : page.priorities()).toHaveLength(2); expect(page.optionsState.message()).toBe('');
  });

  it('does not let old-project choices replace current successful options or their cursor', async () => {
    await loaded(); const held = deferred<PageTypeView>(); types.mockReturnValueOnce(held.promise); const previous = page.loadChoices();
    page.filters.controls.projectId.setValue(otherProject); await flush(); held.resolve({ items: [issueType('30000000-0000-4000-8000-000000000099')], nextCursor: 'private-old-types', totalMatching: 1 }); await previous;
    expect(page.types().map(value => value.id)).toEqual([typeId]); expect(page.typeCursor()).toBeNull(); expect(page.optionsState.message()).toBe('');
  });

  it.each(['viewer', 'archived'] as const)('refuses selection and creation for a %s project', async condition => {
    await loaded(); listProjects.mockResolvedValueOnce({ items: [project(projectId, condition === 'viewer' ? { effectiveRole: 'viewer' } : { archived: true })], nextCursor: null, totalMatching: 1 }); await page.loadProjects();
    expect(page.writable()).toBe(false); page.toggle(issue().summary); page.selectVisible(); page.newIssue(); expect(page.selected()).toEqual([]); expect(page.creating()).toBe(false);
  });

  it('toggles selection with the public 100-item cap and removes only visible selections on Select visible again', async () => {
    await loaded(); for (let index = 1; index <= 101; index++) page.toggle(issue(index).summary);
    expect(page.selected()).toHaveLength(100); expect(page.chosen(issue(101).summary.id)).toBe(false); page.toggle(issue(1).summary); expect(page.chosen(issue(1).summary.id)).toBe(false);
    search.mockResolvedValueOnce(resultPage([issue(1).summary, issue(101).summary])); await page.search(); page.selectVisible(); expect(page.selected()).toHaveLength(100); expect(page.chosen(issue(1).summary.id)).toBe(true); expect(page.chosen(issue(101).summary.id)).toBe(false);
    search.mockResolvedValueOnce(resultPage([issue(1).summary, issue(2).summary])); await page.search(); page.selectVisible(); expect(page.chosen(issue(1).summary.id)).toBe(false); expect(page.chosen(issue(2).summary.id)).toBe(false); expect(page.chosen(issue(3).summary.id)).toBe(true);
  });

  it('does not change a frozen child bulk selection or substitute another filter intent', async () => {
    await loaded(); page.toggle(issue().summary); frozenBulk(); const previous = page.filters.getRawValue();
    page.toggle(issue(2).summary); page.selectVisible(); page.reset(); page.myIssues(); await page.applySaved({ query: 'Rejected new intent' });
    expect(page.selected()).toEqual([issue().summary]); expect(page.filters.getRawValue()).toEqual(previous); expect(page.fullSavedFilter()).toBe(false);
    page.filters.controls.query.setValue('Explicit filter control'); expect(page.selected()).toEqual([issue().summary]);
  });

  it('loads and continues current people queries with their opaque cursors', async () => {
    await loaded(); assignees.mockResolvedValueOnce({ items: [actor], nextCursor: 'people-next', totalMatching: 2 }).mockResolvedValueOnce({ items: [{ id: '10000000-0000-4000-8000-000000000003', displayName: 'Second member' }], nextCursor: null, totalMatching: 2 });
    page.peopleQuery.setValue('  Current  '); await page.loadPeople(); await page.loadPeople(true);
    expect(assignees.mock.calls.at(-1)).toEqual([projectId, 'Current', 'people-next']); expect(page.people()).toHaveLength(2); expect(page.peopleCursor()).toBeNull();
  });

  it('ignores a previous people query error after the next debounced query succeeds', async () => {
    await loaded(); vi.useFakeTimers(); const held = deferred<PageUserSummary>(); assignees.mockReturnValueOnce(held.promise); const previous = page.loadPeople(); page.peopleQuery.setValue('Current'); await vi.advanceTimersByTimeAsync(120);
    held.reject(unavailable()); await previous; expect(page.people()).toEqual([actor]); expect(page.peopleState.message()).toBe(''); expect(page.peopleState.busy()).toBe(false);
  });

  it('cancels pending query timers on destruction without dispatching another old-owner search', async () => {
    await loaded(); vi.useFakeTimers(); search.mockClear(); assignees.mockClear(); page.filters.controls.query.setValue('Private old search'); page.peopleQuery.setValue('Private old person'); TestBed.resetTestingModule(); await vi.advanceTimersByTimeAsync(120);
    expect(search).not.toHaveBeenCalled(); expect(assignees).not.toHaveBeenCalled(); expect(page.searchPending()).toBe(false);
  });

  it('consumes the public Create route command once and permits a fresh current creation', async () => {
    await loaded(); snapshot.queryParamMap = convertToParamMap({ projectId, create: 'true' }); page.newIssue(); expect(page.creating()).toBe(true);
    expect(navigate).toHaveBeenCalledWith([], expect.objectContaining({ queryParams: { create: null }, queryParamsHandling: 'merge', replaceUrl: true }));
  });

  it('honors the actual child dirty-draft cancellation decision', async () => {
    await loaded(); const form = await childForm(); page.newIssue(); form.form.controls.title.setValue('Keep creation draft'); confirm.mockReturnValue(false); const event = new Event('cancel', { cancelable: true }); page.cancel(event);
    expect(event.defaultPrevented).toBe(true); expect(page.creating()).toBe(true); expect(drafts.modernIssues.get('issue:' + projectId + ':new:controller')?.fields.title).toBe('Keep creation draft');
    confirm.mockReturnValue(true); page.cancel(); expect(page.creating()).toBe(false); expect(page.pending()).toBeNull();
  });

  it('finishes current creation once through the actual child model then navigates to the accepted issue', async () => {
    await loaded(); await childForm(); page.newIssue(); await page.create({ title: 'Accepted current intention' });
    expect(create).toHaveBeenCalledOnce(); expect(create.mock.calls[0]?.slice(0, 2)).toEqual([projectId, { title: 'Accepted current intention' }]); expect(create.mock.calls[0]?.[2]).toMatch(/^[0-9a-f-]{36}$/);
    expect(page.pending()).toBeNull(); expect(page.creating()).toBe(false); expect(navigate).toHaveBeenCalledWith(['/issues', issue().summary.id]); expect(drafts.dirtyCount()).toBe(0);
  });

  it('keeps an uncertain create intention frozen across retries even when another form payload is submitted', async () => {
    await loaded(); await childForm(); create.mockRejectedValueOnce(unavailable()).mockResolvedValueOnce(savedIssue());
    await page.create({ title: 'Original creation' }); expect(page.pending()?.body.title).toBe('Original creation'); expect(page.state.failure()?.status).toBe(503);
    await page.create({ title: 'Must not replace an uncertain intention' }); expect(create.mock.calls[1]).toEqual(create.mock.calls[0]); expect(page.pending()).toBeNull();
  });

  it('drops a definitive creation validation error so a corrected payload receives a fresh retry identity', async () => {
    await loaded(); await childForm(); create.mockRejectedValueOnce(new ApiError({ error: { code: 'validation_failed', message: 'Correct the title.', retryable: false, nextAction: 'none', fieldErrors: [{ field: 'title', message: 'Needs correction.' }] }, current: null, unfinished: null }, 422)).mockResolvedValueOnce(savedIssue());
    await page.create({ title: 'Rejected title' }); expect(page.pending()).toBeNull(); await page.create({ title: 'Corrected title' });
    expect(create.mock.calls[1]?.[1]).toEqual({ title: 'Corrected title' }); expect(create.mock.calls[1]?.[2]).not.toBe(create.mock.calls[0]?.[2]);
  });

  it('recovers an already-created issue through its rightful child draft rather than creating it again', async () => {
    await loaded(); const form = await childForm(); form.markCreated(issue().summary.id); await page.create({ title: 'Resume accepted issue' });
    expect(create).not.toHaveBeenCalled(); expect(getIssue).toHaveBeenCalledWith(issue().summary.id); expect(page.pending()).toBeNull(); expect(navigate).toHaveBeenCalledWith(['/issues', issue().summary.id]);
  });

  it('marks new accepted work as backlog only when the current public view requests backlog creation', async () => {
    await loaded(); await childForm(); page.filters.controls.view.setValue('backlog'); await page.create({ title: 'Planned backlog work' }); expect(create.mock.calls[0]?.[1]).toEqual({ title: 'Planned backlog work', backlog: true });
  });

  it.each(['session', 'destroy', 'project'] as const)('ignores an accepted old creation after %s ownership changes', async context => {
    await loaded(); const form = await childForm(); const held = deferred<SavedModernIssueView>(); create.mockReturnValueOnce(held.promise);
    const completion = page.create({ title: 'Previous owner creation' });
    if (context === 'session') { me.set(null); epoch.update(value => value + 1); TestBed.tick(); }
    if (context === 'destroy') TestBed.resetTestingModule();
    if (context === 'project') { page.filters.controls.projectId.setValue(otherProject); await flush(); }
    held.resolve(savedIssue()); await completion;
    expect(navigate).not.toHaveBeenCalled(); expect(form.createdIssueId()).toBeUndefined(); expect(getIssue).not.toHaveBeenCalled();
    if (context === 'session') { expect(page.pending()).toBeNull(); expect(page.creating()).toBe(false); expect(page.state.busy()).toBe(false); expect(drafts.dirtyCount()).toBe(0); }
  });

  it('does not clear or finish a newer creation when an old-session reply arrives', async () => {
    await loaded(); await childForm('previous'); const old = deferred<SavedModernIssueView>(), current = deferred<SavedModernIssueView>(); create.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const previousCompletion = page.create({ title: 'Old account intention' }); me.set({ ...identity, userId: '10000000-0000-4000-8000-000000000003', displayName: 'Next account' }); epoch.update(value => value + 1); TestBed.tick(); await loaded(); await childForm('current'); const currentCompletion = page.create({ title: 'Current account intention' });
    old.resolve(savedIssue(issue(1))); await previousCompletion; expect(page.state.busy()).toBe(true); expect(page.pending()?.body.title).toBe('Current account intention'); expect(navigate).not.toHaveBeenCalled();
    getIssue.mockResolvedValueOnce(issue(2)); current.resolve(savedIssue(issue(2))); await currentCompletion; expect(page.state.busy()).toBe(false); expect(page.pending()).toBeNull(); expect(navigate).toHaveBeenCalledExactlyOnceWith(['/issues', issue(2).summary.id]); expect(create.mock.calls[1]?.[2]).not.toBe(create.mock.calls[0]?.[2]);
  });
});
