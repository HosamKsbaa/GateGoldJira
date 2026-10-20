// Public model units use real Angular resources, route effects and forms with
// typed API ports. No rendered editor, browser or provider acceptance is claimed.
import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, provideZonelessChangeDetection, RendererFactory2, runInInjectionContext, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, ActivatedRouteSnapshot, convertToParamMap } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanningItemView, ProjectView } from '../../api/generated/types.gen';
import { ApiError } from '../../core/api/api-result';
import { AuthService } from '../../core/auth/auth.service';
import { ProjectsApi } from '../projects/projects.api';
import { PlanningApi } from './planning.api';
import { ProjectPlanningPage } from './project-planning.page';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
const receipt = { eventId: null, replayed: false };
function project(id = 'project', changes: Partial<ProjectView> = {}): ProjectView { return { id, name: 'Delivery', key: 'GG', archived: false, effectiveRole: 'member', description: '', revision: '1', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...changes }; }
function item(id = 'epic', changes: Partial<PlanningItemView> = {}): PlanningItemView { return { id, projectId: 'project', kind: 'epic', name: 'تسليم الفريق', description: 'Coordinate work', revision: '4', status: 'planned', targetDate: null, completedCount: 1, issueCount: 3, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...changes }; }
function listed(ids = ['epic'], nextCursor: string | null = null) { return { items: ids.map(id => item(id)), nextCursor, totalMatching: ids.length }; }
function linked(ids = ['first'], nextCursor: string | null = null) { return { items: ids.map(id => ({ id, number: '1', title: 'Work ' + id, status: 'review:retained', stageName: 'قبول الفريق' })), nextCursor, totalMatching: ids.length }; }
function conflict() { return new ApiError({ error: { code: 'conflict', message: 'This planning item changed. Reload current planning.', retryable: false, nextAction: 'reload_current_state', fieldErrors: [] }, current: null, unfinished: null }, 409); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; return { promise: new Promise<T>((yes, no) => { resolve = yes; reject = no; }), resolve: (value: T) => resolve(value), reject: (error: unknown) => reject(error) }; }

describe('Project planning public form, cursor and continuation ownership', () => {
  const epoch = signal(1), scopes: EnvironmentInjector[] = [];
  const getProject = vi.fn<ProjectsApi['get']>(), list = vi.fn<PlanningApi['list']>(), create = vi.fn<PlanningApi['create']>(), update = vi.fn<PlanningApi['update']>(), issues = vi.fn<PlanningApi['issues']>();
  const confirm = vi.fn<(message: string) => boolean>();
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>, windowPort: EventTarget;
  beforeEach(() => {
    epoch.set(1); params = new BehaviorSubject(convertToParamMap({ projectId: 'project' })); getProject.mockReset().mockImplementation(async id => project(id)); list.mockReset().mockResolvedValue(listed()); create.mockReset().mockResolvedValue({ result: item('created'), receipt }); update.mockReset().mockResolvedValue({ result: item('epic', { revision: '5' }), receipt }); issues.mockReset().mockResolvedValue(linked()); confirm.mockReset().mockReturnValue(true);
    windowPort = Object.assign(new EventTarget(), { confirm }); vi.stubGlobal('window', windowPort); vi.stubGlobal('document', { getElementById: () => null });
    const snapshot = new ActivatedRouteSnapshot(); snapshot.params = { projectId: 'project' };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('No rendered UI is claimed.'); } } }, { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
      { provide: ActivatedRoute, useValue: { snapshot, paramMap: params.asObservable() } satisfies Pick<ActivatedRoute, 'snapshot' | 'paramMap'> }, { provide: AuthService, useValue: { sessionEpoch: epoch } satisfies Pick<AuthService, 'sessionEpoch'> },
      { provide: ProjectsApi, useValue: { get: getProject } satisfies Pick<ProjectsApi, 'get'> }, { provide: PlanningApi, useValue: { list, create, update, issues } satisfies Pick<PlanningApi, 'list' | 'create' | 'update' | 'issues'> },
    ] });
  });
  afterEach(() => { for (const scope of scopes.splice(0)) if (!scope.destroyed) scope.destroy(); TestBed.resetTestingModule(); params.complete(); vi.unstubAllGlobals(); });
  async function mount(wait = true) { const scope = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector)); scopes.push(scope); const model = runInInjectionContext(scope, () => new ProjectPlanningPage()); TestBed.tick(); if (wait) { await vi.waitFor(() => expect(model.loading()).toBe(false)); await vi.waitFor(() => expect(model.project.value()?.id).toBe('project')); } return { model, destroy: () => scope.destroy() }; }

  it('loads the actual route project and publishes progress and retained stage names without altering workflow state', async () => {
    const { model } = await mount(); expect(getProject).toHaveBeenCalledExactlyOnceWith('project'); expect(list).toHaveBeenCalledExactlyOnceWith('project', undefined, undefined); expect(model.items()).toEqual([item()]); expect(model.canEdit()).toBe(true); expect(model.percent(item())).toBe(33); expect(model.percent(item('empty', { issueCount: 0, completedCount: 0 }))).toBe(0); expect(model.stageLabel('review:retained', 'قبول الفريق')).toBe('قبول الفريق'); expect(model.stageLabel('review')).toBe('Review');
  });
  it.each([{ effectiveRole: 'viewer' as const }, { archived: true }])('projects read-only editor availability from current permissions %j', async changes => {
    getProject.mockResolvedValueOnce(project('project', changes)); const { model } = await mount(); expect(model.canEdit()).toBe(false); expect(model.items()).toEqual([item()]); expect(create).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });
  it('appends only the requested next cursor and replaces old rows on explicit reload', async () => {
    list.mockResolvedValueOnce(listed(['epic'], 'next-page')); const { model } = await mount(); list.mockResolvedValueOnce(listed(['release'])); await model.loadMore(); expect(list).toHaveBeenLastCalledWith('project', undefined, 'next-page'); expect(model.items().map(value => value.id)).toEqual(['epic', 'release']); expect(model.nextCursor()).toBeNull(); await model.reload(); expect(model.items().map(value => value.id)).toEqual(['epic']); expect(list).toHaveBeenLastCalledWith('project', undefined, undefined);
  });
  it.each([new Error('Temporary planning failure'), 'private unexpected value'])('retains confirmed rows and provides a retryable current read explanation for %s', async error => {
    const { model } = await mount(); list.mockRejectedValueOnce(error); await model.reload(); expect(model.items()).toEqual([item()]); expect(model.loading()).toBe(false); expect(model.error()).toBe(error instanceof Error ? error.message : 'Planning could not be loaded.'); await model.reload(); expect(model.error()).toBe('');
  });
  it('retains form validation boundaries and dispatches no blank or overlong name', async () => {
    const { model } = await mount(); model.create(); expect(model.form.controls.kind.enabled).toBe(true); await model.save(); expect(create).not.toHaveBeenCalled(); model.form.controls.name.setValue('x'.repeat(101)); await model.save(); expect(create).not.toHaveBeenCalled(); expect(model.form.invalid).toBe(true); expect(model.saving()).toBe(false);
  });
  it('creates a trimmed Arabic named release with its exact raw description/status/date and reloads authoritative items', async () => {
    const { model } = await mount(); model.create(); model.form.setValue({ kind: 'release', name: '  إطلاق الفريق  ', description: 'Keep\nthis description', targetDate: '2026-11-01', status: 'active' }); list.mockResolvedValueOnce(listed(['created'])); await model.save(); expect(create.mock.calls[0]?.slice(0, 2)).toEqual(['project', { kind: 'release', name: 'إطلاق الفريق', description: 'Keep\nthis description', targetDate: '2026-11-01', status: 'active' }]); expect(create.mock.calls[0]?.[2]).toMatch(/^[0-9a-f-]{36}$/); expect(model.editing()).toBe(false); expect(model.saving()).toBe(false); expect(model.items().map(value => value.id)).toEqual(['created']);
  });
  it('replays an unchanged uncertain create with the same reference and gives corrected form values a new intention', async () => {
    const { model } = await mount(); model.create(); model.form.controls.name.setValue('Original name'); create.mockRejectedValueOnce(new Error('Acknowledgement unavailable')).mockRejectedValueOnce(new Error('Still unavailable')); await model.save(); const first = create.mock.calls[0]; await model.save(); expect(create.mock.calls[1]).toEqual(first); expect(model.editing()).toBe(true); expect(model.form.controls.name.value).toBe('Original name'); expect(model.saving()).toBe(false);
    model.form.controls.name.setValue('Corrected name'); await model.save(); expect(create.mock.calls[2]?.[2]).not.toBe(first?.[2]); expect(create.mock.calls[2]?.[1].name).toBe('Corrected name'); expect(model.editing()).toBe(false);
  });
  it('updates an immutable planning kind with exact expected revision and a nullable cleared target date', async () => {
    const { model } = await mount(); model.edit(item('release', { kind: 'release', targetDate: '2026-11-01' })); expect(model.form.controls.kind.disabled).toBe(true); model.form.controls.name.setValue('  Updated release  '); model.form.controls.targetDate.setValue(''); model.form.controls.status.setValue('complete'); await model.save(); expect(update.mock.calls[0]?.slice(0, 3)).toEqual(['project', 'release', { expectedRevision: '4', name: 'Updated release', description: 'Coordinate work', targetDate: null, status: 'complete' }]); expect(create).not.toHaveBeenCalled(); expect(model.selected()).toBeNull();
  });
  it('keeps a rejected edit draft and uses a deliberately reopened current revision instead of silently overwriting', async () => {
    const { model } = await mount(); model.edit(item()); model.form.controls.name.setValue('Local draft'); update.mockRejectedValueOnce(conflict()); await model.save(); const rejected = update.mock.calls[0]!; expect(model.error()).toBe('This planning item changed. Reload current planning.'); expect(model.form.controls.name.value).toBe('Local draft'); expect(model.selected()?.revision).toBe('4'); expect(model.editing()).toBe(true);
    model.edit(item('epic', { revision: '8' })); model.form.controls.name.setValue('Local draft'); await model.save(); expect(update.mock.calls[1]?.[2].expectedRevision).toBe('8'); expect(update.mock.calls[1]?.[3]).not.toBe(rejected[3]); expect(model.error()).toBe('');
  });
  it('ignores duplicate save submissions while preserving actual cancel ownership of a replacement editor', async () => {
    const { model } = await mount(), held = deferred<Awaited<ReturnType<PlanningApi['create']>>>(); model.create(); model.form.controls.name.setValue('Old draft'); create.mockReturnValueOnce(held.promise); const saving = model.save(); await model.save(); expect(create).toHaveBeenCalledTimes(1); expect(model.saving()).toBe(true); model.cancel(); model.create(); model.form.controls.name.setValue('Replacement editor'); const reads = list.mock.calls.length; held.resolve({ result: item('old-created'), receipt }); await saving; expect(model.editing()).toBe(true); expect(model.form.controls.name.value).toBe('Replacement editor'); expect(model.saving()).toBe(false); expect(list).toHaveBeenCalledTimes(reads);
  });
  it('does not let a previous project’s failed page release a newer route’s spinner or expose its error', async () => {
    const old = deferred<Awaited<ReturnType<PlanningApi['list']>>>(), next = deferred<Awaited<ReturnType<PlanningApi['list']>>>(); list.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise); const { model } = await mount(false); params.next(convertToParamMap({ projectId: 'replacement' })); TestBed.tick(); old.reject(new Error('private old project')); await Promise.resolve(); await Promise.resolve(); expect(model.loading()).toBe(true); expect(model.items()).toEqual([]); expect(model.error()).toBe(''); next.resolve(listed(['current'])); await vi.waitFor(() => expect(model.loading()).toBe(false)); expect(model.items().map(value => value.id)).toEqual(['current']);
  });
  it('rejects a late save after an authentication epoch change before changing the new editor or starting a follow-up read', async () => {
    const { model } = await mount(), held = deferred<Awaited<ReturnType<PlanningApi['create']>>>(); model.create(); model.form.controls.name.setValue('Private old draft'); create.mockReturnValueOnce(held.promise); const saving = model.save(); epoch.update(value => value + 1); TestBed.tick(); await vi.waitFor(() => expect(model.loading()).toBe(false)); model.create(); model.form.controls.name.setValue('Current session'); const reads = list.mock.calls.length; held.resolve({ result: item('private-old'), receipt }); await saving; expect(model.form.controls.name.value).toBe('Current session'); expect(model.editing()).toBe(true); expect(model.saving()).toBe(false); expect(list).toHaveBeenCalledTimes(reads);
  });
  it('handles actual dirty/saving leave decisions and unregisters the unload guard at destruction', async () => {
    const f = await mount(); expect(f.model.mayLeave()).toBe(true); f.model.create(); expect(f.model.mayLeave()).toBe(true); f.model.form.controls.name.setValue('Dirty editor'); f.model.form.markAsDirty(); confirm.mockReturnValueOnce(false); expect(f.model.mayLeave()).toBe(false); expect(confirm.mock.calls[0]?.[0]).toBe('Discard unsaved planning changes and leave this editor?');
    const event = new Event('beforeunload', { cancelable: true }); windowPort.dispatchEvent(event); expect(event.defaultPrevented).toBe(true); const held = deferred<Awaited<ReturnType<PlanningApi['create']>>>(); create.mockReturnValueOnce(held.promise); const saving = f.model.save(); confirm.mockReturnValueOnce(true); expect(f.model.mayLeave()).toBe(true); expect(confirm.mock.calls[1]?.[0]).toBe('This planning change is still being saved. Leave this editor?'); f.destroy(); const after = new Event('beforeunload', { cancelable: true }); windowPort.dispatchEvent(after); expect(after.defaultPrevented).toBe(false); held.resolve({ result: item('late'), receipt }); await saving; expect(list).toHaveBeenCalledTimes(1);
  });
  it('loads a selected epic’s linked issue cursor and retains the custom workflow stage label', async () => {
    const { model } = await mount(); issues.mockResolvedValueOnce(linked(['first'], 'linked-next')).mockResolvedValueOnce(linked(['second'])); await model.showIssues(item()); await model.loadMoreIssues(); expect(issues.mock.calls).toEqual([['project', 'epic', undefined], ['project', 'epic', 'linked-next']]); expect(model.linkedIssues().map(value => value.id)).toEqual(['first', 'second']); expect(model.stageLabel(model.linkedIssues()[0]!.status, model.linkedIssues()[0]!.stageName)).toBe('قبول الفريق'); expect(model.issueCursor()).toBeNull();
  });
  it('does not publish an old selection’s linked issue failure while the replacement selection is loading', async () => {
    const { model } = await mount(), old = deferred<Awaited<ReturnType<PlanningApi['issues']>>>(), next = deferred<Awaited<ReturnType<PlanningApi['issues']>>>(); issues.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise); const first = model.showIssues(item('old')), current = model.showIssues(item('current')); old.reject(new Error('private old link failure')); await first; expect(model.issueLoading()).toBe(true); expect(model.issueError()).toBe(''); expect(model.linkedIssues()).toEqual([]); next.resolve(linked(['accepted'])); await current; expect(model.issueSelection()?.id).toBe('current'); expect(model.linkedIssues().map(value => value.id)).toEqual(['accepted']);
  });
  it('cancels a linked issue read by closing its public panel and never reopens it on late completion', async () => {
    const { model } = await mount(), held = deferred<Awaited<ReturnType<PlanningApi['issues']>>>(); issues.mockReturnValueOnce(held.promise); const reading = model.showIssues(item()); model.closeIssues(); held.resolve(linked(['private-late'], 'old-cursor')); await reading; await model.loadMoreIssues(); expect(model.issueSelection()).toBeNull(); expect(model.linkedIssues()).toEqual([]); expect(model.issueCursor()).toBeNull(); expect(model.issueLoading()).toBe(false); expect(issues).toHaveBeenCalledTimes(1);
  });
  it('preserves useful linked issues when the next page fails and can explicitly retry its same cursor', async () => {
    const { model } = await mount(); issues.mockResolvedValueOnce(linked(['first'], 'next')); await model.showIssues(item()); issues.mockRejectedValueOnce('private failure'); await model.loadMoreIssues(); expect(model.linkedIssues().map(value => value.id)).toEqual(['first']); expect(model.issueError()).toBe('Linked issues could not be loaded.'); expect(model.issueCursor()).toBe('next'); issues.mockResolvedValueOnce(linked(['second'])); await model.loadMoreIssues(); expect(issues.mock.calls.at(-1)?.[2]).toBe('next'); expect(model.issueError()).toBe(''); expect(model.linkedIssues().map(value => value.id)).toEqual(['first', 'second']);
  });
  it('keeps a current editor draft on a non-Error save failure and ignores a stale rejected update after destruction', async () => {
    const f = await mount(); f.model.edit(item()); f.model.form.controls.name.setValue('Retained local edit'); update.mockRejectedValueOnce('private non-Error response'); await f.model.save(); expect(f.model.error()).toBe('Planning could not be saved.'); expect(f.model.editing()).toBe(true); expect(f.model.form.controls.name.value).toBe('Retained local edit');
    const held = deferred<Awaited<ReturnType<PlanningApi['update']>>>(); update.mockReturnValueOnce(held.promise); const saving = f.model.save(); f.destroy(); held.reject(new Error('private late error')); await saving; expect(f.model.error()).toBe(''); expect(list).toHaveBeenCalledTimes(1);
  });
});
