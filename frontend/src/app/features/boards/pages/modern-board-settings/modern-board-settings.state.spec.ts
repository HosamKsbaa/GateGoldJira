// Public presentation-model tests with real Angular forms, effects, RequestState
// and DraftsService. Typed API/query/input ports isolate rendering and transport;
// no browser, template bindings, or live-service acceptance is claimed.
import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, provideZonelessChangeDetection, RendererFactory2, runInInjectionContext, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, ActivatedRouteSnapshot, convertToParamMap, type Params } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardSummary, IssueFilter, LayoutView, Me, ProjectView, SaveLayoutFields, StageView, WorkflowView } from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { ProjectWorkflowsApi } from '../../../projects/project-workflows.api';
import { BoardsApi } from '../../boards.api';
import { ModernBoardsApi } from '../../modern-boards.api';
import type { NativeBoardFiltersComponent } from '../../components/native-board-filters/native-board-filters.component';
import { ModernBoardSettingsPage } from './modern-board-settings.page';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
const projectId = 'project-a', boardId = 'board-a', workflowId = 'delivery';
const receipt = { eventId: null, replayed: false };
const account: Me = { userId: 'member', displayName: 'Member', email: 'member@example.test', administrator: false, companyTimeZone: 'Africa/Cairo' };
function project(id = projectId, changes: Partial<ProjectView> = {}): ProjectView {
  return { id, key: 'GG', name: 'Delivery', archived: false, effectiveRole: 'project_admin', description: '', revision: '2', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...changes };
}
function workflow(id = workflowId): WorkflowView { return { id, projectId, name: id === workflowId ? 'Delivery workflow' : id, revision: '3', retired: false, legacyBridge: false }; }
function stage(id = 'ready', changes: Partial<StageView> = {}): StageView {
  return { id, projectId, workflowId, name: id === 'ready' ? 'Ready' : id, category: 'todo', position: '1', initial: true, acceptsEntries: true, retired: false, ...changes };
}
function layout(id = boardId, revision = '4', changes: Partial<LayoutView['board']> = {}): LayoutView {
  return { board: { id, projectId, revision, name: 'Engineering board', savedFilters: { blocked: true }, default: false, archived: false, canManage: true, creator: { id: account.userId, displayName: account.displayName }, ...changes },
    columns: [
      { id: 'intake', name: 'Intake', position: '1', orderRevision: '2', savedMatchCount: 2, visibleMatchCount: 2, limitExceeded: false, wipLimit: null, wipMode: 'warn', stages: [{ stage: stage(), workflow: workflow() }] },
      { id: 'retained', name: 'Retained work', position: '2', orderRevision: '1', savedMatchCount: 1, visibleMatchCount: 1, limitExceeded: false, wipLimit: 3, wipMode: 'block', stages: [{ stage: stage('retired-stage', { name: 'Historic QA', retired: true, acceptsEntries: false }), workflow: workflow() }] },
    ], companyToday: '2026-10-20' };
}
function summary(id = boardId, changes: Partial<BoardSummary> = {}): BoardSummary { return { ...layout(id).board, wipLimits: { inProgress: null, review: null }, ...changes }; }
function fields(view = layout()): SaveLayoutFields { return { expectedRevision: view.board.revision, name: view.board.name, savedFilters: view.board.savedFilters, columns: view.columns.map(column => ({ id: column.id, name: column.name, stageIds: column.stages.map(mapping => mapping.stage.id), wipLimit: column.wipLimit, wipMode: column.wipMode })) }; }
function failure(code: 'conflict' | 'validation_failed' | 'forbidden' | 'temporarily_unavailable', retryable = false) {
  return new ApiError({ error: { code, message: 'Board settings could not be saved.', retryable, nextAction: code === 'conflict' ? 'reload_current_state' : 'none', fieldErrors: [] }, current: null, unfinished: null }, code === 'conflict' ? 409 : code === 'validation_failed' ? 422 : code === 'forbidden' ? 403 : 503);
}
function deferred<T>() { let resolve!: (value: T) => void; return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) }; }

describe('native board settings public form and retry state', () => {
  const epoch = signal(1), me = signal<Me | null>(account);
  const get = vi.fn<ModernBoardsApi['get']>(), save = vi.fn<ModernBoardsApi['save']>(), create = vi.fn<ModernBoardsApi['create']>();
  const readProject = vi.fn<BoardsApi['project']>(), list = vi.fn<BoardsApi['list']>(), archive = vi.fn<BoardsApi['archive']>(), restore = vi.fn<BoardsApi['restore']>();
  const workflows = vi.fn<ProjectWorkflowsApi['workflows']>(), stages = vi.fn<ProjectWorkflowsApi['stages']>();
  const scopes: EnvironmentInjector[] = [];
  let drafts: DraftsService, params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  beforeEach(() => {
    epoch.set(1); me.set(account); params = new BehaviorSubject(convertToParamMap({ boardId }));
    get.mockReset().mockImplementation(async id => layout(id)); save.mockReset().mockResolvedValue({ result: layout(boardId, '5'), receipt }); create.mockReset().mockResolvedValue({ result: layout('created-board', '1'), receipt });
    readProject.mockReset().mockImplementation(async id => project(id)); list.mockReset().mockResolvedValue({ items: [summary()], nextCursor: null, totalMatching: 1 }); archive.mockReset().mockResolvedValue({ result: summary(boardId, { archived: true }), receipt }); restore.mockReset().mockResolvedValue({ result: summary(), receipt });
    workflows.mockReset().mockResolvedValue({ items: [workflow()], nextCursor: null, totalMatching: 1 }); stages.mockReset().mockResolvedValue({ items: [stage()], nextCursor: null, totalMatching: 1 });
    vi.stubGlobal('window', Object.assign(new EventTarget(), { confirm: () => true })); vi.stubGlobal('document', {});
    const snapshot = new ActivatedRouteSnapshot(); snapshot.params = { boardId };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('Model units must not render components.'); } } }, { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
      { provide: ActivatedRoute, useValue: { snapshot, paramMap: params.asObservable() } satisfies Pick<ActivatedRoute, 'snapshot' | 'paramMap'> },
      { provide: AuthService, useValue: { sessionEpoch: epoch, me } satisfies Pick<AuthService, 'sessionEpoch' | 'me'> },
      { provide: ModernBoardsApi, useValue: { get, save, create } satisfies Pick<ModernBoardsApi, 'get' | 'save' | 'create'> },
      { provide: BoardsApi, useValue: { project: readProject, list, archive, restore } satisfies Pick<BoardsApi, 'project' | 'list' | 'archive' | 'restore'> },
      { provide: ProjectWorkflowsApi, useValue: { workflows, stages } satisfies Pick<ProjectWorkflowsApi, 'workflows' | 'stages'> },
    ] }); drafts = TestBed.inject(DraftsService);
  });
  afterEach(() => { for (const scope of scopes.splice(0)) if (!scope.destroyed) scope.destroy(); TestBed.resetTestingModule(); params.complete(); vi.unstubAllGlobals(); });
  async function mount(route: Params = { boardId }, wait = true) {
    params.next(convertToParamMap(route));
    const scope = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector)); scopes.push(scope);
    const page = runInInjectionContext(scope, () => new ModernBoardSettingsPage());
    // Inputs are public typed model ports before the first effect tick; the real
    // route ParamMap stream remains independently active beneath these overrides.
    const inputBoard = signal(''), inputProject = signal(''); Object.assign(page, { boardIdInput: inputBoard, projectIdInput: inputProject }); TestBed.tick();
    if (wait) await vi.waitFor(() => expect(page.state.busy()).toBe(false));
    return { page, inputBoard, inputProject, destroy: () => scope.destroy() };
  }

  it('loads the route-owned board and project, preserving mapped retired stages without creating a dirty draft', async () => {
    const f = await mount(); expect(get).toHaveBeenCalledExactlyOnceWith(boardId); expect(readProject).toHaveBeenCalledExactlyOnceWith(projectId); expect(workflows).toHaveBeenCalledExactlyOnceWith(projectId, undefined); expect(stages).toHaveBeenCalledExactlyOnceWith(projectId, workflowId, undefined);
    expect(f.page.form.getRawValue()).toEqual({ name: 'Engineering board', columns: fields().columns }); expect(f.page.editable()).toBe(true); expect(f.page.dirty()).toBe(false); expect(drafts.dirtyCount()).toBe(0); expect(f.page.stages()).toContainEqual({ id: 'retired-stage', label: 'Historic QA', detail: 'Delivery workflow · Retired' });
  });

  it('records real form edits, stage choices, reordered columns and saved-filter changes in the in-memory draft', async () => {
    const f = await mount(); f.page.form.controls.name.setValue('  Team delivery  '); f.page.chooseStages(f.page.form.controls.columns.at(0), ['ready', 'review']); f.page.reorder(1, -1);
    f.page.filtersChanged({ blocked: false, statuses: ['review'], query: 'keep' }); f.page.filterQuery('  Arabic مراجعة  ');
    expect(drafts.modernBoards.get('native-board:' + boardId)).toEqual({ expectedRevision: '4', name: 'Team delivery', savedFilters: { blocked: false, statuses: ['review'], query: 'Arabic مراجعة' }, columns: [fields().columns[1], { ...fields().columns[0]!, stageIds: ['ready', 'review'] }] }); expect(drafts.dirtyCount()).toBe(1); expect(f.page.dirty()).toBe(true);
    f.page.filterQuery('   '); expect(f.page.savedFilters()).toEqual({ blocked: false, statuses: ['review'] });
  });

  it('adds independent UUID columns, retains at least one column and ignores reorder boundaries', async () => {
    const f = await mount(); f.page.addColumn(); const column = f.page.form.controls.columns.at(2); expect(column.getRawValue()).toMatchObject({ name: 'New column', stageIds: [], wipLimit: null, wipMode: 'warn' }); expect(column.controls.id.value).toMatch(/^[0-9a-f-]{36}$/);
    f.page.reorder(0, -1); f.page.reorder(2, 1); expect(f.page.form.controls.columns.at(2)).toBe(column);
    f.page.removeColumn(2); f.page.removeColumn(1); f.page.removeColumn(0); expect(f.page.form.controls.columns.length).toBe(1); expect(f.page.form.controls.columns.at(0).controls.id.value).toBe('intake');
  });

  it.each(['name', 'column', 'wip_low', 'wip_high'] as const)('does not dispatch an invalid %s form and permits a corrected save', async kind => {
    const f = await mount(); if (kind === 'name') f.page.form.controls.name.setValue('x'.repeat(101)); if (kind === 'column') f.page.form.controls.columns.at(0).controls.name.setValue(''); if (kind === 'wip_low') f.page.form.controls.columns.at(0).controls.wipLimit.setValue(0); if (kind === 'wip_high') f.page.form.controls.columns.at(0).controls.wipLimit.setValue(1001);
    expect(f.page.form.invalid).toBe(true); await f.page.save(); expect(save).not.toHaveBeenCalled(); expect(f.page.pending()).toBeNull();
    f.page.form.controls.name.setValue('Corrected board'); f.page.form.controls.columns.at(0).controls.name.setValue('Ready'); f.page.form.controls.columns.at(0).controls.wipLimit.setValue(1000); await f.page.save(); expect(save).toHaveBeenCalledTimes(1); expect(f.page.state.failure()).toBeNull();
  });

  it.each(['board_archived', 'project_archived', 'permission'] as const)('refuses a save when %s makes the loaded board read-only', async kind => {
    get.mockResolvedValueOnce(layout(boardId, '4', kind === 'board_archived' ? { archived: true } : kind === 'permission' ? { canManage: false } : {})); if (kind === 'project_archived') readProject.mockResolvedValueOnce(project(projectId, { archived: true }));
    const f = await mount(); expect(f.page.editable()).toBe(false); f.page.form.controls.name.setValue('Unauthorized local edit'); f.page.addColumn(); f.page.removeColumn(0); await f.page.save();
    expect(save).not.toHaveBeenCalled(); expect(f.page.form.controls.columns.length).toBe(2); expect(drafts.modernBoards.size).toBe(0); expect(drafts.dirtyCount()).toBe(0);
  });

  it('saves a cloned exact revision, filters and complete stage mappings, then adopts authoritative returned settings', async () => {
    const f = await mount(); f.page.form.controls.name.setValue('  Saved board  '); const next = layout(boardId, '5', { name: 'Saved board', savedFilters: { blocked: false } }); save.mockResolvedValueOnce({ result: next, receipt }); f.page.filtersChanged({ blocked: false }); await f.page.save();
    expect(save.mock.calls[0]!.slice(0, 2)).toEqual([boardId, { ...fields(), name: 'Saved board', savedFilters: { blocked: false } }]); expect(save.mock.calls[0]![2]).toMatch(/^[0-9a-f-]{36}$/);
    expect(f.page.current()).toEqual(next); expect(f.page.pending()).toBeNull(); expect(f.page.dirty()).toBe(false); expect(drafts.dirtyCount()).toBe(0); expect(drafts.modernBoards.has('native-board:' + boardId)).toBe(false); expect(f.page.notice()).toBe('Board settings saved.');
  });

  it('honors public filter-editor validation and uses its validated value on a subsequent save', async () => {
    const f = await mount(), value = vi.fn<NativeBoardFiltersComponent['value']>().mockReturnValue(null); const port: Pick<NativeBoardFiltersComponent, 'value'> = { value }; Object.assign(f.page, { filtersEditor: signal(port) });
    await f.page.save(); expect(save).not.toHaveBeenCalled(); expect(f.page.state.message()).toBe('Check the saved-view filters before saving.');
    value.mockReturnValue({ labelIds: ['delivery-label'], blocked: true }); await f.page.save(); expect(save.mock.calls[0]![1].savedFilters).toEqual({ labelIds: ['delivery-label'], blocked: true });
  });

  it('retains the immutable original settings body and reference after an uncertain save, freezing structural actions until replay', async () => {
    const f = await mount(); f.page.form.controls.name.setValue('Original intention'); save.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await f.page.save();
    const original = save.mock.calls[0]!; expect(f.page.pending()).toMatchObject({ kind: 'settings', id: boardId, body: original[1], reference: original[2] }); expect(f.page.state.failure()?.status).toBe(503);
    const column = f.page.form.controls.columns.at(0), before = f.page.form.getRawValue(); f.page.addColumn(); f.page.removeColumn(0); f.page.reorder(0, 1); f.page.chooseStages(column, ['forged-after-pending']); expect(f.page.form.getRawValue()).toEqual(before);
    save.mockResolvedValueOnce({ result: layout(boardId, '5', { name: 'Original intention' }), receipt: { ...receipt, replayed: true } }); await f.page.retry(); expect(save.mock.calls[1]).toEqual(original); expect(f.page.pending()).toBeNull(); expect(f.page.state.failure()).toBeNull(); expect(f.page.notice()).toBe('Original settings confirmed.');
  });

  it('keeps an unknown transport outcome pending and displays the safe shared request message', async () => {
    const f = await mount(); save.mockRejectedValueOnce(new TypeError('private socket detail')); await f.page.save(); expect(f.page.pending()?.kind).toBe('settings'); expect(f.page.state.failure()).toBeNull(); expect(f.page.state.message()).toBe('The request could not be completed. Check your connection and try again.');
  });

  it('requires successful explicit conflict review, retaining local columns and filters while refreshing the revision', async () => {
    const f = await mount(); f.page.form.controls.name.setValue('My unsaved board'); f.page.chooseStages(f.page.form.controls.columns.at(0), ['ready', 'review']); f.page.filtersChanged({ blocked: false }); save.mockRejectedValueOnce(failure('conflict')); await f.page.save();
    const first = save.mock.calls[0]!; expect(f.page.pending()).toBeNull(); expect(f.page.reviewRequired()).toBe(true); await f.page.save(); expect(save).toHaveBeenCalledTimes(1);
    get.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await f.page.reviewCurrent(); expect(f.page.reviewRequired()).toBe(true); expect(f.page.form.controls.name.value).toBe('My unsaved board');
    get.mockResolvedValueOnce(layout(boardId, '9')); await f.page.reviewCurrent(); expect(f.page.reviewRequired()).toBe(false); expect(f.page.form.getRawValue()).toMatchObject({ name: 'My unsaved board', columns: [{ stageIds: ['ready', 'review'] }, { stageIds: ['retired-stage'] }] }); expect(f.page.savedFilters()).toEqual({ blocked: false });
    await f.page.save(); expect(save.mock.calls[1]![1]).toMatchObject({ expectedRevision: '9', name: 'My unsaved board' }); expect(save.mock.calls[1]![2]).not.toBe(first[2]);
  });

  it('releases a definite rejected intention for correction without discarding the local draft', async () => {
    const f = await mount(); f.page.form.controls.name.setValue('Rejected name'); save.mockRejectedValueOnce(failure('validation_failed')); await f.page.save(); const first = save.mock.calls[0]!;
    expect(f.page.pending()).toBeNull(); expect(f.page.reviewRequired()).toBe(false); expect(f.page.form.controls.name.value).toBe('Rejected name'); expect(drafts.dirtyCount()).toBe(1);
    f.page.form.controls.name.setValue('Corrected name'); await f.page.save(); expect(save.mock.calls[1]![1].name).toBe('Corrected name'); expect(save.mock.calls[1]![2]).not.toBe(first[2]);
  });

  it('restores a same-tab board draft and blocks saving a stale baseline until review', async () => {
    drafts.modernBoards.set('native-board:' + boardId, { ...fields(layout(boardId, '1')), name: 'Retained board draft' }); const f = await mount();
    expect(f.page.form.controls.name.value).toBe('Retained board draft'); expect(f.page.reviewRequired()).toBe(true); expect(f.page.dirty()).toBe(true); expect(drafts.dirtyCount()).toBe(1); await f.page.save(); expect(save).not.toHaveBeenCalled();
    await f.page.reviewCurrent(); expect(f.page.reviewRequired()).toBe(false); await f.page.save(); expect(save.mock.calls[0]![1]).toMatchObject({ expectedRevision: '4', name: 'Retained board draft' });
  });

  it('loads project board listings including archive state and follows only the explicit next cursor', async () => {
    list.mockResolvedValueOnce({ items: [summary()], nextCursor: 'next-boards', totalMatching: 2 }); const f = await mount({ projectId }); expect(f.page.current()).toBeNull(); expect(list).toHaveBeenCalledExactlyOnceWith(projectId, true); expect(f.page.boardCursor()).toBe('next-boards');
    list.mockResolvedValueOnce({ items: [summary('archived-board', { archived: true })], nextCursor: null, totalMatching: 2 }); await f.page.moreBoards(); expect(list).toHaveBeenLastCalledWith(projectId, true, 'next-boards'); expect(f.page.boards().map(value => value.id)).toEqual([boardId, 'archived-board']); expect(f.page.boards()[1]?.archived).toBe(true); await f.page.moreBoards(); expect(list).toHaveBeenCalledTimes(2);
  });

  it('creates a trimmed named board and prepends its authoritative returned listing', async () => {
    const f = await mount({ projectId }); await f.page.create(); expect(create).not.toHaveBeenCalled(); f.page.createName.setValue('  Team board  '); await f.page.create(); expect(create.mock.calls[0]!.slice(0, 3)).toEqual([projectId, 'Team board', {}]); expect(f.page.boards().map(value => value.id)).toEqual(['created-board', boardId]); expect(f.page.createName.value).toBe(''); expect(f.page.pending()).toBeNull(); expect(f.page.notice()).toBe('Board created. Open Settings to customize its columns.');
  });

  it.each(['archived', 'viewer'] as const)('blocks creating a board for an %s project', async kind => {
    readProject.mockResolvedValueOnce(project(projectId, kind === 'archived' ? { archived: true } : { effectiveRole: 'viewer' })); const f = await mount({ projectId }); f.page.createName.setValue('Forbidden board'); await f.page.create(); expect(create).not.toHaveBeenCalled(); expect(f.page.pending()).toBeNull();
  });

  it('replays the original uncertain board creation despite later local input changes', async () => {
    const f = await mount({ projectId }); f.page.createName.setValue('Original board'); create.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await f.page.create(); const original = create.mock.calls[0]!; expect(f.page.pending()?.kind).toBe('create'); f.page.createName.setValue('Different local name'); await f.page.retry(); expect(create.mock.calls[1]).toEqual(original); expect(f.page.pending()).toBeNull();
  });

  it.each([true, false])('uses exact revision/reference for archive=%s and reloads the authoritative board', async archiveValue => {
    const f = await mount(); await f.page.setArchive(archiveValue); const call = (archiveValue ? archive : restore).mock.calls[0]!; expect(call.slice(0, 2)).toEqual([boardId, '4']); expect(call[2]).toMatch(/^[0-9a-f-]{36}$/); expect(get).toHaveBeenCalledTimes(2); expect(f.page.pending()).toBeNull();
  });

  it('does not archive a default board or a board without management permission', async () => {
    get.mockResolvedValueOnce(layout(boardId, '4', { default: true })); const f = await mount(); await f.page.setArchive(true); expect(archive).not.toHaveBeenCalled();
    get.mockResolvedValueOnce(layout(boardId, '4', { canManage: false })); await f.page.load(); await f.page.setArchive(true); expect(archive).not.toHaveBeenCalled();
  });

  it('preserves mapped retired stage labels while appending workflow and stage pages and filtering by workflow detail', async () => {
    workflows.mockResolvedValueOnce({ items: [workflow()], nextCursor: 'next-workflow', totalMatching: 2 }); stages.mockResolvedValueOnce({ items: [stage()], nextCursor: 'next-stage', totalMatching: 2 }); const f = await mount();
    expect(f.page.workflowCursor()).toBe('next-workflow'); expect(f.page.stageCursor()).toBe('next-stage'); stages.mockResolvedValueOnce({ items: [stage('review', { name: 'مراجعة', category: 'review' })], nextCursor: null, totalMatching: 2 }); await f.page.loadStages(true); expect(stages).toHaveBeenLastCalledWith(projectId, workflowId, 'next-stage'); expect(f.page.stages().map(value => value.id)).toEqual(['ready', 'retired-stage', 'review']);
    workflows.mockResolvedValueOnce({ items: [workflow('second-flow')], nextCursor: null, totalMatching: 2 }); await f.page.loadWorkflows(true); expect(workflows).toHaveBeenLastCalledWith(projectId, 'next-workflow'); expect(f.page.workflows().map(value => value.id)).toEqual([workflowId, 'second-flow']);
    f.page.query.set('  مراجعة  '); expect(f.page.stageOptions().map(value => value.id)).toEqual(['review']); f.page.query.set('RETIRED'); expect(f.page.stageOptions().map(value => value.id)).toEqual(['retired-stage']);
  });

  it('supports explicit load retry after an initial read failure without inventing a board draft', async () => {
    get.mockRejectedValueOnce(failure('temporarily_unavailable', true)); const f = await mount(); expect(f.page.current()).toBeNull(); expect(f.page.state.failure()?.status).toBe(503); expect(drafts.dirtyCount()).toBe(0); await f.page.load(); expect(f.page.current()?.board.id).toBe(boardId); expect(f.page.state.failure()).toBeNull();
  });

  it('does not publish a held old-board save after destruction', async () => {
    const f = await mount(), held = deferred<Awaited<ReturnType<ModernBoardsApi['save']>>>(); f.page.form.controls.name.setValue('Private old draft'); save.mockReturnValueOnce(held.promise); const saving = f.page.save(); f.destroy(); held.resolve({ result: layout('old-private-board', '99'), receipt }); await saving;
    expect(f.page.current()?.board.id).toBe(boardId); expect(f.page.notice()).not.toBe('Board settings saved.'); expect(drafts.dirtyCount()).toBe(0); expect(drafts.modernBoards.get('native-board:' + boardId)?.name).toBe('Private old draft');
  });

  it('ignores held stage choices once the editor is destroyed', async () => {
    const f = await mount(), held = deferred<Awaited<ReturnType<ProjectWorkflowsApi['stages']>>>(); stages.mockReturnValueOnce(held.promise); const loading = f.page.loadStages(); const before = f.page.stages(); f.destroy(); held.resolve({ items: [stage('private-late-stage')], nextCursor: null, totalMatching: 1 }); await loading; expect(f.page.stages()).toEqual(before);
  });

  it('starts no requests without a signed-in identity or a board/project context', async () => {
    me.set(null); const f = await mount({}, false); expect(get).not.toHaveBeenCalled(); expect(readProject).not.toHaveBeenCalled(); await f.page.retry(); await f.page.reviewCurrent(); await f.page.moreBoards(); expect(save).not.toHaveBeenCalled(); expect(f.page.current()).toBeNull();
  });
  it('loads a replacement route while old choices are pending and stale completion cannot release its busy ownership', async () => {
    const oldChoices = deferred<Awaited<ReturnType<ProjectWorkflowsApi['workflows']>>>(), nextChoices = deferred<Awaited<ReturnType<ProjectWorkflowsApi['workflows']>>>();
    workflows.mockReturnValueOnce(oldChoices.promise).mockReturnValueOnce(nextChoices.promise);
    const loads = vi.spyOn(ModernBoardSettingsPage.prototype, 'load'), nextFlow = workflow('next-flow');
    const f = await mount({ boardId }, false);
    try {
      await vi.waitFor(() => expect(workflows).toHaveBeenCalledTimes(1)); expect(f.page.state.busy()).toBe(true); expect(f.page.choicesState.busy()).toBe(true);
      params.next(convertToParamMap({ boardId: 'board-next' })); TestBed.tick();
      await vi.waitFor(() => expect(workflows).toHaveBeenCalledTimes(2)); expect(get.mock.calls.map(call => call[0])).toEqual([boardId, 'board-next']);
      oldChoices.resolve({ items: [workflow('old-private-flow')], nextCursor: 'old-cursor', totalMatching: 1 }); await loads.mock.results[0]!.value;
      expect(f.page.current()?.board.id).toBe('board-next'); expect(f.page.state.busy()).toBe(true); expect(f.page.choicesState.busy()).toBe(true); expect(f.page.workflows()).toEqual([]); expect(f.page.workflowCursor()).toBeNull();
      nextChoices.resolve({ items: [nextFlow], nextCursor: null, totalMatching: 1 }); await loads.mock.results[1]!.value;
      expect(f.page.state.busy()).toBe(false); expect(f.page.choicesState.busy()).toBe(false); expect(f.page.current()?.board.id).toBe('board-next'); expect(f.page.workflows()).toEqual([nextFlow]); expect(f.page.selectedWorkflow.value).toBe(nextFlow.id);
    } finally {
      oldChoices.resolve({ items: [], nextCursor: null, totalMatching: 0 }); nextChoices.resolve({ items: [], nextCursor: null, totalMatching: 0 }); await Promise.all(loads.mock.results.map(result => result.value));
    }
  });

});
