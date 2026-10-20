// Presentation-model units only: typed API ports, real forms/effects/request state.
// These do not claim browser, REST, or managed-provider integration coverage.
import '@angular/compiler';
import { provideZonelessChangeDetection, RendererFactory2, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import type { FormControl } from '@angular/forms';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigurationView, PriorityView, TypeView } from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { ProjectConfigurationApi } from '../../project-configuration.api';
import { ProjectConfigurationPage } from './project-configuration.page';

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
const projectId = '20000000-0000-4000-8000-000000000001';
const defaults = { standardTypeId: 'standard', subtaskTypeId: 'subtask', priorityId: 'medium' };
const savedReceipt = { eventId: null, replayed: false };
function userValue(control: FormControl<string>, value: string): void { control.markAsDirty(); control.setValue(value); }
function configuration(revision = '1', override: Partial<ConfigurationView> = {}): ConfigurationView {
  return { projectId, revision, canManage: true, mode: 'modern', defaults: { ...defaults }, ...override };
}
function issueType(id = 'standard', override: Partial<TypeView> = {}): TypeView {
  return { id, projectId, key: id, name: id, behavior: id === 'subtask' ? 'subtask' : 'standard', default: id === 'standard' || id === 'subtask', retired: false, ...override };
}
function priority(id = 'medium', override: Partial<PriorityView> = {}): PriorityView {
  return { id, projectId, key: id, name: id, sortOrder: '3', default: id === 'medium', retired: false, ...override };
}
function failure(code: 'conflict' | 'validation_failed' | 'temporarily_unavailable', retryable = false) {
  return new ApiError({ error: { code, message: 'The configuration could not be saved.', retryable, nextAction: code === 'conflict' ? 'reload_current_state' : 'none', fieldErrors: [] }, current: null, unfinished: null }, code === 'conflict' ? 409 : code === 'validation_failed' ? 422 : 503);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  return { promise: new Promise<T>(done => { resolve = done; }), resolve: (value: T) => resolve(value) };
}

describe('project configuration preserves review, retry, and session ownership', () => {
  const epoch = signal(1), me = signal(null);
  const get = vi.fn<ProjectConfigurationApi['get']>();
  const types = vi.fn<ProjectConfigurationApi['types']>();
  const priorities = vi.fn<ProjectConfigurationApi['priorities']>();
  const saveType = vi.fn<ProjectConfigurationApi['saveType']>();
  const savePriority = vi.fn<ProjectConfigurationApi['savePriority']>();
  const saveDefaults = vi.fn<ProjectConfigurationApi['defaults']>();
  let page: ProjectConfigurationPage, drafts: DraftsService;

  beforeEach(() => {
    epoch.set(1);
    for (const port of [get, types, priorities, saveType, savePriority, saveDefaults]) port.mockReset();
    get.mockResolvedValue(configuration());
    types.mockResolvedValue({ items: [issueType(), issueType('subtask')], nextCursor: null, totalMatching: 2 });
    priorities.mockResolvedValue({ items: [priority()], nextCursor: null, totalMatching: 1 });
    vi.stubGlobal('window', Object.assign(new EventTarget(), { confirm: () => true }));
    vi.stubGlobal('document', Object.assign(new EventTarget(), { visibilityState: 'hidden' }));
    TestBed.configureTestingModule({ providers: [
      provideZonelessChangeDetection(),
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('This model unit must not render a component.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
      { provide: AuthService, useValue: { sessionEpoch: epoch, me } satisfies Pick<AuthService, 'sessionEpoch' | 'me'> },
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ projectId }) } } },
      { provide: ProjectConfigurationApi, useValue: { get, types, priorities, saveType, savePriority, defaults: saveDefaults } satisfies Pick<ProjectConfigurationApi, 'get' | 'types' | 'priorities' | 'saveType' | 'savePriority' | 'defaults'> },
    ] });
    drafts = TestBed.inject(DraftsService);
    page = TestBed.runInInjectionContext(() => new ProjectConfigurationPage());
    TestBed.tick();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });
  async function loaded() { await vi.waitFor(() => expect(page.configuration()?.revision).toBe('1')); }
  async function loadActiveDefaultChoices() {
    types.mockResolvedValueOnce({ items: [issueType(), issueType('subtask'), issueType('bug', { default: false }), issueType('child', { behavior: 'subtask', default: false })], nextCursor: null, totalMatching: 4 });
    priorities.mockResolvedValueOnce({ items: [priority(), priority('high', { default: false }), priority('urgent', { default: false })], nextCursor: null, totalMatching: 3 });
    expect(await page.reload()).toBe(true);
  }


  it('contains a typed reload failure and allows a fresh explicit retry', async () => {
    await loaded();
    get.mockRejectedValueOnce(failure('temporarily_unavailable', true));
    expect(await page.reload()).toBe(false);
    expect(page.state.failure()?.status).toBe(503); expect(page.state.busy()).toBe(false);
    get.mockResolvedValueOnce(configuration('2'));
    expect(await page.reload()).toBe(true); expect(page.configuration()?.revision).toBe('2');
    expect(page.state.failure()).toBeNull(); expect(page.state.message()).toBe('');
  });

  it('does not restore a completed private load after a session change', async () => {
    await loaded(); const held = deferred<ConfigurationView>(); get.mockReturnValueOnce(held.promise);
    const loading = page.reload(); epoch.set(2); TestBed.tick();
    expect(page.configuration()).toBeNull(); expect(page.types()).toEqual([]); expect(page.priorities()).toEqual([]);
    held.resolve(configuration('private-old')); expect(await loading).toBe(false);
    expect(page.configuration()).toBeNull(); expect(page.state.busy()).toBe(false); expect(drafts.dirtyCount()).toBe(0);
  });

  it('does not fetch absent cursors and appends only explicitly requested follow-up pages', async () => {
    await loaded(); await page.moreTypes(); await page.morePriorities();
    expect(types).toHaveBeenCalledTimes(1); expect(priorities).toHaveBeenCalledTimes(1);
    page.typeCursor.set('type-page'); page.priorityCursor.set('priority-page');
    types.mockResolvedValueOnce({ items: [issueType('bug')], nextCursor: null, totalMatching: 3 });
    priorities.mockResolvedValueOnce({ items: [priority('high')], nextCursor: null, totalMatching: 2 });
    await page.moreTypes(); await page.morePriorities();
    expect(types).toHaveBeenLastCalledWith(projectId, 'type-page'); expect(priorities).toHaveBeenLastCalledWith(projectId, 'priority-page');
    expect(page.types().map(v => v.id)).toEqual(['standard', 'subtask', 'bug']);
    expect(page.priorities().map(v => v.id)).toEqual(['medium', 'high']);
    expect(page.typeCursor()).toBeNull(); expect(page.priorityCursor()).toBeNull();
  });

  it('retries an uncertain type save with the exact body and reference, then releases its draft', async () => {
    await loaded(); page.openType(); page.typeForm.controls.name.setValue('Customer Bug');
    saveType.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await page.saveType();
    const original = saveType.mock.calls[0]!;
    expect(original[2]).toEqual({ expectedRevision: '1', key: 'customer_bug', name: 'Customer Bug', behavior: 'standard', retired: false });
    expect(original[1]).toMatch(/^[0-9a-f-]{36}$/); expect(original[3]).toMatch(/^[0-9a-f-]{36}$/);
    expect(page.typeFrozen()).toBe(true); expect(drafts.dirtyCount()).toBe(1);
    saveType.mockResolvedValueOnce({ result: { configuration: configuration('2'), type: issueType(original[1], { key: 'customer_bug', name: 'Customer Bug', default: false }) }, receipt: { eventId: null, replayed: true } });
    await page.saveType(); expect(saveType.mock.calls[1]).toEqual(original);
    expect(page.typeOpen()).toBe(false); expect(page.typeFrozen()).toBe(false); expect(page.notice()).toBe('Issue type saved.');
    expect(page.configuration()?.revision).toBe('2'); expect(drafts.dirtyCount()).toBe(0);
    expect(page.types().find(v => v.id === original[1])?.name).toBe('Customer Bug');
  });

  it('requires explicit successful conflict review while retaining the type draft and refreshed revision', async () => {
    await loaded(); const originalType = page.types()[0]!; page.openType(originalType);
    page.typeForm.controls.name.setValue('My local draft'); saveType.mockRejectedValueOnce(failure('conflict'));
    await page.saveType(); expect(page.reviewRequired()).toBe(true);
    await page.saveType(); expect(saveType).toHaveBeenCalledTimes(1);
    get.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await page.review();
    expect(page.reviewRequired()).toBe(true); expect(page.typeForm.controls.name.value).toBe('My local draft');
    get.mockResolvedValueOnce(configuration('9'));
    types.mockResolvedValueOnce({ items: [issueType('standard', { name: 'Server name' }), issueType('subtask')], nextCursor: null, totalMatching: 2 });
    await page.review();
    expect(page.reviewRequired()).toBe(false); expect(page.selectedType()?.name).toBe('Server name');
    expect(page.typeForm.controls.name.value).toBe('My local draft'); expect(page.notice()).toContain('Your draft is preserved');
    saveType.mockResolvedValueOnce({ result: { configuration: configuration('10'), type: issueType('standard', { name: 'My local draft' }) }, receipt: { eventId: null, replayed: false } });
    await page.saveType(); const retry = saveType.mock.calls[1]!;
    expect(retry[2].expectedRevision).toBe('9'); expect(retry[2].key).toBe('standard');
    expect(retry[3]).not.toBe(saveType.mock.calls[0]![3]);
  });

  it('cancels a frozen uncertain intent so a new draft receives a new operation identity', async () => {
    await loaded(); page.openType(); page.typeForm.controls.name.setValue('First');
    saveType.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await page.saveType();
    const previous = saveType.mock.calls[0]!; page.cancel();
    expect(page.typeOpen()).toBe(false); expect(page.reviewRequired()).toBe(false); expect(page.state.failure()).toBeNull(); expect(drafts.dirtyCount()).toBe(0);
    page.openType(); page.typeForm.controls.name.setValue('Second');
    saveType.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await page.saveType();
    expect(saveType.mock.calls[1]![1]).not.toBe(previous[1]); expect(saveType.mock.calls[1]![3]).not.toBe(previous[3]);
    expect(saveType.mock.calls[1]![2].name).toBe('Second');
  });

  it('releases a rejected priority intention so corrected fields create a fresh retry identity', async () => {
    await loaded(); page.openPriority(priority()); page.priorityForm.controls.name.setValue('Urgent');
    savePriority.mockRejectedValueOnce(failure('validation_failed')); await page.savePriority();
    const rejected = savePriority.mock.calls[0]!; expect(page.priorityFrozen()).toBe(false); expect(page.priorityOpen()).toBe(true);
    page.priorityForm.controls.name.setValue('Critical');
    savePriority.mockResolvedValueOnce({ result: { configuration: configuration('2'), priority: priority('medium', { name: 'Critical' }) }, receipt: { eventId: null, replayed: false } });
    await page.savePriority(); expect(savePriority.mock.calls[1]![2].name).toBe('Critical');
    expect(savePriority.mock.calls[1]![3]).not.toBe(rejected[3]); expect(page.priorityOpen()).toBe(false); expect(page.notice()).toBe('Priority saved.');
  });

  it('updates creation defaults after an exact uncertain retry without rewriting existing type identities', async () => {
    await loaded(); const changed = { standardTypeId: 'bug', subtaskTypeId: 'subtask', priorityId: 'high' };
    page.types.update(values => [...values, issueType('bug', { default: false })]); page.priorities.update(values => [...values, priority('high', { default: false })]);
    page.defaultsForm.setValue(changed); saveDefaults.mockRejectedValueOnce(failure('temporarily_unavailable', true));
    await page.saveDefaults(); const original = saveDefaults.mock.calls[0]!; expect(page.defaultFrozen()).toBe(true);
    expect(original[1]).toEqual({ expectedRevision: '1', defaults: changed });
    saveDefaults.mockResolvedValueOnce({ result: configuration('2', { defaults: changed }), receipt: { eventId: null, replayed: true } });
    await page.saveDefaults(); expect(saveDefaults.mock.calls[1]).toEqual(original);
    expect(page.types().filter(v => v.default).map(v => v.id)).toEqual(['subtask', 'bug']);
    expect(page.priorities().filter(v => v.default).map(v => v.id)).toEqual(['high']);
    expect(page.defaultsForm.getRawValue()).toEqual(changed); expect(drafts.dirtyCount()).toBe(0);
    expect(page.notice()).toContain('Existing issues keep their current values');
  });

  it('prevents invalid, unavailable, read-only, and legacy-default writes before the API port', async () => {
    await loaded(); page.openType(); await page.saveType(); page.openPriority(); page.priorityForm.controls.sortOrder.setValue('0'); await page.savePriority();
    page.defaultsForm.controls.standardTypeId.setValue(''); await page.saveDefaults();
    page.configuration.set(configuration('1', { canManage: false })); page.typeForm.controls.name.setValue('Task'); await page.saveType();
    page.configuration.set(configuration('1', { mode: 'legacy' })); page.defaultsForm.setValue(defaults); await page.saveDefaults();
    page.configuration.set(null); await page.saveType(); await page.savePriority(); await page.saveDefaults();
    expect(saveType).not.toHaveBeenCalled(); expect(savePriority).not.toHaveBeenCalled(); expect(saveDefaults).not.toHaveBeenCalled();
  });

  it('does not publish a completed save or retain its frozen draft after the account changes', async () => {
    await loaded(); page.openType(); page.typeForm.controls.name.setValue('Old account draft');
    const held = deferred<Awaited<ReturnType<ProjectConfigurationApi['saveType']>>>(); saveType.mockReturnValueOnce(held.promise);
    const saving = page.saveType(); const sent = saveType.mock.calls[0]!; epoch.set(2); TestBed.tick();
    expect(page.configuration()).toBeNull(); expect(page.typeOpen()).toBe(false); expect(drafts.dirtyCount()).toBe(0);
    held.resolve({ result: { configuration: configuration('old-private'), type: issueType(sent[1], { name: 'Old account draft' }) }, receipt: { eventId: null, replayed: false } }); await saving;
    expect(page.configuration()).toBeNull(); expect(page.types()).toEqual([]); expect(page.notice()).toBe(''); expect(page.state.busy()).toBe(false);
  });

  it('keeps Arabic type names while generating a valid stable fallback key for an uncertain retry', async () => {
    await loaded(); page.openType(); page.typeForm.controls.name.setValue('مراجعة التصميم');
    saveType.mockRejectedValue(failure('temporarily_unavailable', true)); await page.saveType(); await page.saveType();
    expect(saveType).toHaveBeenCalledTimes(2); expect(saveType.mock.calls[1]).toEqual(saveType.mock.calls[0]);
    const sent = saveType.mock.calls[0]![2]; expect(sent.name).toBe('مراجعة التصميم');
    expect(sent.key).toMatch(/^type_[0-9a-f]{8}$/);
  });

  it('replaces a retiring default and orders priorities exactly above the JavaScript safe-integer limit', async () => {
    await loaded();
    page.priorities.set([
      priority('older-high', { sortOrder: '9007199254740993', default: false }),
      priority('same-a', { sortOrder: '9007199254740992', default: false }),
      priority('medium'),
    ]);
    page.openPriority(priority());
    page.priorityForm.patchValue({ retired: true, replacement: 'same-a', sortOrder: '9007199254740992' });
    const next = configuration('2', { defaults: { ...defaults, priorityId: 'same-a' } });
    savePriority.mockResolvedValueOnce({ result: { configuration: next, priority: priority('medium', { retired: true, default: false, sortOrder: '9007199254740992' }) }, receipt: { eventId: null, replayed: false } });
    await page.savePriority();
    expect(savePriority.mock.calls[0]![2]).toEqual({ expectedRevision: '1', key: 'medium', name: 'medium', sortOrder: '9007199254740992', retired: true, replacementDefaultId: 'same-a' });
    expect(page.priorities().map(v => v.id)).toEqual(['medium', 'same-a', 'older-high']);
    expect(page.priorities().filter(v => v.default).map(v => v.id)).toEqual(['same-a']);
    expect(page.defaultsForm.getRawValue().priorityId).toBe('same-a'); expect(page.priorityOpen()).toBe(false);
  });

  it('releases its draft on destruction and refuses a held private reload result', async () => {
    await loaded(); page.openType(); page.typeForm.controls.name.setValue('Local draft'); page.typeForm.markAsDirty();
    page.typeForm.controls.name.setValue('Local dirty draft'); expect(drafts.dirtyCount()).toBe(1);
    const held = deferred<ConfigurationView>(); get.mockReturnValueOnce(held.promise); const loading = page.reload();
    TestBed.resetTestingModule(); expect(drafts.dirtyCount()).toBe(0);
    held.resolve(configuration('late-private')); expect(await loading).toBe(false);
    expect(page.configuration()?.revision).toBe('1'); expect(page.notice()).toBe('');
  });

  it('keeps off-page defaults selected and exposes only active behavior-compatible choices after explicit paging', async () => {
    await loaded(); types.mockResolvedValueOnce({ items: [issueType('bug', { default: false }), issueType('retired-type', { retired: true, default: false })], nextCursor: 'type-default-page', totalMatching: 5 }); priorities.mockResolvedValueOnce({ items: [priority('retired-priority', { retired: true, default: false })], nextCursor: 'priority-default-page', totalMatching: 3 }); await page.reload();
    expect(page.defaultsForm.getRawValue()).toEqual(defaults); expect(page.hasStandardDefault()).toBe(false); expect(page.hasSubtaskDefault()).toBe(false); expect(page.hasPriorityDefault()).toBe(false);
    expect(page.standardTypes().map(value => value.id)).toEqual(['bug']); expect(page.subtaskTypes()).toEqual([]); expect(page.activePriorities()).toEqual([]);
    types.mockResolvedValueOnce({ items: [issueType(), issueType('subtask'), issueType('child', { behavior: 'subtask', default: false })], nextCursor: null, totalMatching: 5 }); priorities.mockResolvedValueOnce({ items: [priority(), priority('high', { default: false })], nextCursor: null, totalMatching: 3 });
    await page.moreTypes(); await page.morePriorities(); expect(page.hasStandardDefault()).toBe(true); expect(page.hasSubtaskDefault()).toBe(true); expect(page.hasPriorityDefault()).toBe(true); expect(page.defaultsForm.getRawValue()).toEqual(defaults);
    page.openType(issueType()); expect(page.typeReplacements().map(value => value.id)).toEqual(['bug']); page.openType(issueType('subtask')); expect(page.typeReplacements().map(value => value.id)).toEqual(['child']); page.openPriority(priority()); expect(page.priorityReplacements().map(value => value.id)).toEqual(['high']);
    expect(saveDefaults).not.toHaveBeenCalled(); expect(drafts.dirtyCount()).toBe(0);
  });

  it.each(['standard', 'subtask'] as const)('retires a default %s type with an explicit compatible replacement without changing its identity', async id => {
    await loaded(); const original = issueType(id), replacement = issueType('replacement-' + id, { behavior: original.behavior, default: false }); types.mockResolvedValueOnce({ items: [issueType(), issueType('subtask'), replacement], nextCursor: null, totalMatching: 3 }); await page.reload(); page.openType(original); page.typeForm.markAsDirty(); page.typeForm.patchValue({ name: 'Retained historical name', retired: true, replacement: replacement.id });
    const nextDefaults = { ...defaults, ...(id === 'standard' ? { standardTypeId: replacement.id } : { subtaskTypeId: replacement.id }) };
    saveType.mockResolvedValueOnce({ result: { configuration: configuration('2', { defaults: nextDefaults }), type: issueType(id, { retired: true, default: false, name: 'Retained historical name' }) }, receipt: savedReceipt }); await page.saveType();
    expect(saveType.mock.calls[0]!.slice(0, 3)).toEqual([projectId, id, { expectedRevision: '1', key: original.key, name: 'Retained historical name', behavior: original.behavior, retired: true, replacementDefaultId: replacement.id }]);
    expect(page.types().find(value => value.id === id)).toMatchObject({ key: original.key, retired: true, default: false }); expect(page.typeReplacements().map(value => value.id)).toEqual([replacement.id]); expect(page.defaultsForm.getRawValue()).toEqual(nextDefaults); expect(drafts.dirtyCount()).toBe(0);
  });

  it.each(['Release impact', '123 urgency', 'أولوية عاجلة'])('creates a stable priority key and exact retry identity for %s', async name => {
    await loaded(); page.openPriority(); userValue(page.priorityForm.controls.name, name); expect(page.priorityForm.controls.sortOrder.value).toBe('2'); savePriority.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await page.savePriority(); const sent = savePriority.mock.calls[0]!;
    expect(sent[0]).toBe(projectId); expect(sent[1]).toMatch(/^[0-9a-f-]{36}$/); expect(sent[2]).toMatchObject({ expectedRevision: '1', name, sortOrder: '2', retired: false }); expect(sent[2]).not.toHaveProperty('replacementDefaultId');
    expect(sent[2].key).toMatch(name === 'Release impact' ? /^release_impact$/ : /^priority_[0-9a-f]{8}$/); expect(page.priorityFrozen()).toBe(true);
    savePriority.mockResolvedValueOnce({ result: { configuration: configuration('2'), priority: priority(sent[1], { key: sent[2].key, name, sortOrder: '2', default: false }) }, receipt: { ...savedReceipt, replayed: true } }); await page.savePriority();
    expect(savePriority.mock.calls[1]).toEqual(sent); expect(page.priorityFrozen()).toBe(false); expect(page.priorities().find(value => value.id === sent[1])?.name).toBe(name); expect(drafts.dirtyCount()).toBe(0);
  });

  it.each(['current-page', 'off-page'] as const)('preserves the priority draft and immutable key during %s conflict review', async location => {
    await loaded(); page.openPriority(priority()); userValue(page.priorityForm.controls.name, 'My priority draft'); page.priorityForm.controls.sortOrder.setValue('9223372036854775807'); savePriority.mockRejectedValueOnce(failure('conflict')); await page.savePriority(); const original = savePriority.mock.calls[0]!;
    expect(page.reviewRequired()).toBe(true); expect(page.priorityFrozen()).toBe(false); await page.savePriority(); expect(savePriority).toHaveBeenCalledTimes(1);
    const currentDefaults = { ...defaults, priorityId: 'high' }; get.mockResolvedValueOnce(configuration('9', { defaults: currentDefaults })); priorities.mockResolvedValueOnce({ items: [priority('high', { default: true }), ...(location === 'current-page' ? [priority('medium', { name: 'Server priority', default: false })] : [])], nextCursor: location === 'off-page' ? 'retained-default-page' : null, totalMatching: 2 });
    await page.review(); expect(page.reviewRequired()).toBe(false); expect(page.priorityOpen()).toBe(true); expect(page.priorityForm.getRawValue()).toEqual({ name: 'My priority draft', sortOrder: '9223372036854775807', retired: false, replacement: '' }); expect(page.selectedPriority()).toMatchObject({ id: 'medium', key: 'medium', default: false }); expect(page.selectedPriority()?.name).toBe(location === 'current-page' ? 'Server priority' : 'medium');
    savePriority.mockResolvedValueOnce({ result: { configuration: configuration('10', { defaults: currentDefaults }), priority: priority('medium', { name: 'My priority draft', default: false, sortOrder: '9223372036854775807' }) }, receipt: savedReceipt }); await page.savePriority();
    expect(savePriority.mock.calls[1]!.slice(0, 3)).toEqual([projectId, 'medium', { expectedRevision: '9', key: 'medium', name: 'My priority draft', sortOrder: '9223372036854775807', retired: false }]); expect(savePriority.mock.calls[1]![3]).not.toBe(original[3]); expect(drafts.dirtyCount()).toBe(0);
  });

  it('preserves deliberate default choices through failed and successful review before using the refreshed revision', async () => {
    await loaded(); await loadActiveDefaultChoices(); page.tab.set('defaults'); const local = { standardTypeId: 'bug', subtaskTypeId: 'child', priorityId: 'high' }; page.defaultsForm.setValue(local); saveDefaults.mockRejectedValueOnce(failure('conflict')); await page.saveDefaults(); const original = saveDefaults.mock.calls[0]!;
    expect(page.reviewRequired()).toBe(true); expect(page.defaultFrozen()).toBe(false); await page.saveDefaults(); expect(saveDefaults).toHaveBeenCalledTimes(1); get.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await page.review(); expect(page.reviewRequired()).toBe(true); expect(page.defaultsForm.getRawValue()).toEqual(local);
    get.mockResolvedValueOnce(configuration('9')); await page.review(); expect(page.reviewRequired()).toBe(false); expect(page.defaultsForm.getRawValue()).toEqual(local); expect(drafts.dirtyCount()).toBe(1);
    saveDefaults.mockResolvedValueOnce({ result: configuration('10', { defaults: local }), receipt: savedReceipt }); await page.saveDefaults(); expect(saveDefaults.mock.calls[1]![1]).toEqual({ expectedRevision: '9', defaults: local }); expect(saveDefaults.mock.calls[1]![2]).not.toBe(original[2]); expect(drafts.dirtyCount()).toBe(0);
  });

  it('releases definite defaults rejection so correcting the selection uses a fresh reference', async () => {
    await loaded(); await loadActiveDefaultChoices(); page.tab.set('defaults'); page.defaultsForm.controls.priorityId.setValue('high'); saveDefaults.mockRejectedValueOnce(failure('validation_failed')); await page.saveDefaults(); const original = saveDefaults.mock.calls[0]!;
    expect(page.defaultFrozen()).toBe(false); expect(page.reviewRequired()).toBe(false); expect(page.defaultsForm.controls.priorityId.value).toBe('high'); page.defaultsForm.controls.priorityId.setValue('urgent'); saveDefaults.mockResolvedValueOnce({ result: configuration('2', { defaults: { ...defaults, priorityId: 'urgent' } }), receipt: savedReceipt }); await page.saveDefaults();
    expect(saveDefaults.mock.calls[1]![1]).toEqual({ expectedRevision: '1', defaults: { ...defaults, priorityId: 'urgent' } }); expect(saveDefaults.mock.calls[1]![2]).not.toBe(original[2]); expect(page.state.failure()).toBeNull();
  });

  it('adopts the public activation result while retaining the already displayed type and priority catalog', async () => {
    await loaded(); get.mockResolvedValueOnce(configuration('6', { mode: 'legacy' })); await page.reload(); const priorTypes = page.types(), priorPriorities = page.priorities(); const activated = configuration('7', { mode: 'modern' }); page.activated(activated);
    expect(page.configuration()).toEqual(activated); expect(page.types()).toBe(priorTypes); expect(page.priorities()).toBe(priorPriorities); expect(page.notice()).toBe('New issue mode activated. Existing work is preserved.'); expect(saveType).not.toHaveBeenCalled(); expect(savePriority).not.toHaveBeenCalled(); expect(saveDefaults).not.toHaveBeenCalled();
  });

  it.each(['priority', 'defaults'] as const)('does not dispatch a duplicate %s submission while its first request owns the busy state', async kind => {
    await loaded(); await loadActiveDefaultChoices(); const gate = deferred<void>();
    if (kind === 'priority') { page.openPriority(priority()); userValue(page.priorityForm.controls.name, 'Held priority'); savePriority.mockImplementationOnce(async () => { await gate.promise; return { result: { configuration: configuration('2'), priority: priority('medium', { name: 'Held priority' }) }, receipt: savedReceipt }; }); }
    else { page.defaultsForm.controls.priorityId.setValue('high'); saveDefaults.mockImplementationOnce(async () => { await gate.promise; return { result: configuration('2', { defaults: { ...defaults, priorityId: 'high' } }), receipt: savedReceipt }; }); }
    const submitting = kind === 'priority' ? page.savePriority() : page.saveDefaults(); expect(page.state.busy()).toBe(true); expect(page.writable()).toBe(false); expect(drafts.dirtyCount()).toBe(1);
    if (kind === 'priority') { await page.savePriority(); expect(savePriority).toHaveBeenCalledTimes(1); } else { await page.saveDefaults(); expect(saveDefaults).toHaveBeenCalledTimes(1); }
    gate.resolve(undefined); await submitting; expect(page.state.busy()).toBe(false); expect(page.writable()).toBe(true); expect(drafts.dirtyCount()).toBe(0);
  });

  for (const kind of ['priority', 'defaults'] as const) it.each(['success', 'failure'] as const)('refuses a held previous-session ' + kind + ' %s result without retaining its intent or failure', async outcome => {
    await loaded(); await loadActiveDefaultChoices(); const gate = deferred<void>();
    if (kind === 'priority') { page.openPriority(priority()); userValue(page.priorityForm.controls.name, 'Previous account priority'); savePriority.mockImplementationOnce(async () => { await gate.promise; if (outcome === 'failure') throw failure('conflict'); return { result: { configuration: configuration('99'), priority: priority('private-priority') }, receipt: savedReceipt }; }); }
    else { page.defaultsForm.controls.priorityId.setValue('high'); saveDefaults.mockImplementationOnce(async () => { await gate.promise; if (outcome === 'failure') throw failure('conflict'); return { result: configuration('99'), receipt: savedReceipt }; }); }
    const saving = kind === 'priority' ? page.savePriority() : page.saveDefaults(); epoch.set(2); TestBed.tick(); gate.resolve(undefined); await saving;
    expect(page.configuration()).toBeNull(); expect(page.types()).toEqual([]); expect(page.priorities()).toEqual([]); expect(page.priorityOpen()).toBe(false); expect(page.priorityFrozen()).toBe(false); expect(page.defaultFrozen()).toBe(false); expect(page.reviewRequired()).toBe(false); expect(page.state.failure()).toBeNull(); expect(page.notice()).toBe(''); expect(drafts.dirtyCount()).toBe(0);
  });

  it.each(['types', 'priorities'] as const)('refuses a previous-session %s follow-up page without restoring its cursor', async kind => {
    await loaded(); await loadActiveDefaultChoices(); const gate = deferred<void>(); types.mockResolvedValueOnce({ items: [issueType()], nextCursor: 'more-types', totalMatching: 3 }); priorities.mockResolvedValueOnce({ items: [priority()], nextCursor: 'more-priorities', totalMatching: 2 }); await page.reload();
    if (kind === 'types') types.mockImplementationOnce(async () => { await gate.promise; return { items: [issueType('private-old')], nextCursor: 'private-cursor', totalMatching: 3 }; });
    else priorities.mockImplementationOnce(async () => { await gate.promise; return { items: [priority('private-old')], nextCursor: 'private-cursor', totalMatching: 2 }; });
    const loading = kind === 'types' ? page.moreTypes() : page.morePriorities(); epoch.set(2); TestBed.tick(); gate.resolve(undefined); await loading;
    expect(page.types()).toEqual([]); expect(page.priorities()).toEqual([]); expect(page.typeCursor()).toBeNull(); expect(page.priorityCursor()).toBeNull(); expect(page.configuration()).toBeNull(); expect(page.state.failure()).toBeNull(); expect(page.state.busy()).toBe(false);
  });

  it.each(['priority', 'defaults'] as const)('releases destroyed-editor ownership and ignores a late %s acknowledgement', async kind => {
    await loaded(); await loadActiveDefaultChoices(); const gate = deferred<void>();
    if (kind === 'priority') { page.openPriority(priority()); userValue(page.priorityForm.controls.name, 'Unsent priority'); savePriority.mockImplementationOnce(async () => { await gate.promise; return { result: { configuration: configuration('99'), priority: priority('private-late') }, receipt: savedReceipt }; }); }
    else { page.defaultsForm.controls.priorityId.setValue('high'); saveDefaults.mockImplementationOnce(async () => { await gate.promise; return { result: configuration('99'), receipt: savedReceipt }; }); }
    const saving = kind === 'priority' ? page.savePriority() : page.saveDefaults(); expect(drafts.dirtyCount()).toBe(1); TestBed.resetTestingModule(); expect(drafts.dirtyCount()).toBe(0); gate.resolve(undefined); await saving;
    expect(page.configuration()?.revision).toBe('1'); expect(page.notice()).toBe(''); expect(drafts.dirtyCount()).toBe(0); expect(page.priorities().some(value => value.id === 'private-late')).toBe(false);
  });

  it.each(['type', 'priority'] as const)('validates %s names by Unicode code points and preserves an over-limit unsent name', async kind => {
    await loaded(); const overLimit = '😀'.repeat(61), atLimit = '😀'.repeat(60);
    if (kind === 'type') {
      page.openType(); userValue(page.typeForm.controls.name, overLimit); expect(page.typeForm.controls.name.errors).toEqual({ unicodeLength: { maximum: 60 } }); await page.saveType(); expect(saveType).not.toHaveBeenCalled(); expect(page.typeForm.controls.name.value).toBe(overLimit);
      userValue(page.typeForm.controls.name, atLimit); expect(page.typeForm.valid).toBe(true); saveType.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await page.saveType(); expect(saveType.mock.calls[0]![2].name).toBe(atLimit);
    } else {
      page.openPriority(); userValue(page.priorityForm.controls.name, overLimit); expect(page.priorityForm.controls.name.errors).toEqual({ unicodeLength: { maximum: 60 } }); await page.savePriority(); expect(savePriority).not.toHaveBeenCalled(); expect(page.priorityForm.controls.name.value).toBe(overLimit);
      userValue(page.priorityForm.controls.name, atLimit); expect(page.priorityForm.valid).toBe(true); savePriority.mockRejectedValueOnce(failure('temporarily_unavailable', true)); await page.savePriority(); expect(savePriority.mock.calls[0]![2].name).toBe(atLimit);
    }
  });

  it('retains a new-priority draft across a definite revision conflict without inventing an existing priority identity', async () => {
    await loaded(); page.openPriority(); userValue(page.priorityForm.controls.name, 'New critical severity'); savePriority.mockRejectedValueOnce(failure('conflict')); await page.savePriority(); const original = savePriority.mock.calls[0]!;
    get.mockResolvedValueOnce(configuration('9')); await page.review(); expect(page.priorityOpen()).toBe(true); expect(page.selectedPriority()).toBeNull(); expect(page.priorityForm.controls.name.value).toBe('New critical severity'); expect(page.reviewRequired()).toBe(false);
    savePriority.mockImplementationOnce(async (_project, id, body) => ({ result: { configuration: configuration('10'), priority: priority(id, { name: body.name, key: body.key, sortOrder: body.sortOrder, default: false }) }, receipt: savedReceipt })); await page.savePriority();
    expect(savePriority.mock.calls[1]![1]).not.toBe(original[1]); expect(savePriority.mock.calls[1]![2]).toEqual({ expectedRevision: '9', key: 'new_critical_severity', name: 'New critical severity', sortOrder: '2', retired: false }); expect(savePriority.mock.calls[1]![3]).not.toBe(original[3]); expect(page.priorityOpen()).toBe(false); expect(drafts.dirtyCount()).toBe(0);
  });

});
