// Public model units with real forms, Angular effects and the shared choice
// cache. Typed service ports are isolated; no template or browser claim is made.
import '@angular/compiler';
import { Injector, provideZonelessChangeDetection, RendererFactory2, signal, type DestroyableInjector } from '@angular/core';
import { FormControl } from '@angular/forms';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LabelView, PageLabelView, SavedLabelView } from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { IssueChoiceCache } from '../../issue-choice-cache.service';
import { IssuesApi } from '../../issues.api';
import { DateLabelFieldsComponent } from './date-label-fields.component';

const projectA = '20000000-0000-4000-8000-000000000001';
const projectB = '20000000-0000-4000-8000-000000000002';
function label(number: number, projectId = projectA): LabelView { return { id: '60000000-0000-4000-8000-' + String(number).padStart(12, '0'), projectId, name: 'Label ' + number }; }
const first = label(1), second = label(2);
const page = (items: LabelView[], nextCursor: string | null = null): PageLabelView => ({ items, nextCursor, totalMatching: items.length });
const saved = (value: LabelView): SavedLabelView => ({ result: value, receipt: { eventId: null, replayed: false } });
function deferred<T>() { let resolve!: (value: T) => void, reject!: (reason: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const flush = async () => { for (let index = 0; index < 10; index++) await Promise.resolve(); };
const unavailable = () => new ApiError({ error: { code: 'temporarily_unavailable', message: 'Retry the original label request.', fieldErrors: [], retryable: true, nextAction: 'retry_same_reference' }, current: null, unfinished: null }, 503);
TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());

describe('date and label field public selection, discovery and retry ownership', () => {
  const project = signal(projectA), epoch = signal(1), initial = signal<LabelView[]>([]), disabled = signal(false), allowCreate = signal(true);
  const labels = vi.fn<IssuesApi['labels']>(), createLabel = vi.fn<IssuesApi['createLabel']>();
  let fields: DateLabelFieldsComponent, cache: IssueChoiceCache, controller: DestroyableInjector, alive: boolean;
  let selected: FormControl<string[]>, due: FormControl<string>;
  const destroy = () => { if (alive) { alive = false; controller.destroy(); } };
  beforeEach(async () => {
    project.set(projectA); epoch.set(1); initial.set([]); disabled.set(false); allowCreate.set(true);
    labels.mockReset().mockResolvedValue(page([first, second])); createLabel.mockReset().mockResolvedValue(saved(label(3)));
    selected = new FormControl<string[]>([], { nonNullable: true }); due = new FormControl('', { nonNullable: true });
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { sessionEpoch: epoch } },
      { provide: IssuesApi, useValue: { labels, createLabel } satisfies Pick<IssuesApi, 'labels' | 'createLabel'> },
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('Public-model units do not render a template.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
    ] });
    cache = TestBed.inject(IssueChoiceCache);
    controller = Injector.create({ parent: TestBed.inject(Injector), providers: [{ provide: DateLabelFieldsComponent, useFactory: () => new DateLabelFieldsComponent() }] }); alive = true;
    fields = controller.get(DateLabelFieldsComponent);
    Object.defineProperties(fields, { projectId: { value: project.asReadonly() }, labelsControl: { value: signal(selected).asReadonly() }, dueDateControl: { value: signal(due).asReadonly() }, initialLabels: { value: initial.asReadonly() }, disabled: { value: disabled.asReadonly() }, allowCreate: { value: allowCreate.asReadonly() } });
    TestBed.tick(); await flush();
  });
  afterEach(() => { destroy(); TestBed.resetTestingModule(); vi.useRealTimers(); });

  it('loads typed first-page choices without changing the bound form or date', () => {
    expect(labels).toHaveBeenCalledExactlyOnceWith(projectA, '', undefined); expect(fields.pickerOptions()).toEqual([{ id: first.id, label: first.name }, { id: second.id, label: second.name }]);
    expect(fields.state.busy()).toBe(false); expect(selected.value).toEqual([]); expect(selected.pristine).toBe(true); expect(due.value).toBe(''); expect(createLabel).not.toHaveBeenCalled();
  });
  it('retains friendly selected names from the shared cache even when search returns another page', async () => {
    selected.setValue([first.id]); initial.set([first]); labels.mockResolvedValueOnce(page([second])); TestBed.tick(); await flush();
    expect(fields.selectedOptions()).toEqual([{ id: first.id, label: first.name }]); expect(fields.choices()).toEqual([first, second]); expect(fields.unlistedSelections()).toEqual([]);
  });
  it('exposes unresolved selections so their IDs remain removable without an unauthorized lookup', () => {
    const missing = label(99).id; selected.setValue([missing]); expect(fields.unlistedSelections()).toEqual([missing]); expect(fields.selectedOptions()).toEqual([]);
    fields.remove(missing); expect(selected.value).toEqual([]); expect(selected.dirty).toBe(true); expect(labels).toHaveBeenCalledOnce();
  });
  it('updates the actual parent label control immediately and marks it dirty once selected', () => {
    const observed: string[][] = []; selected.valueChanges.subscribe(value => observed.push(value)); fields.choose([first.id]);
    expect(selected.value).toEqual([first.id]); expect(selected.dirty).toBe(true); expect(observed).toEqual([[first.id]]); expect(fields.selectedOptions()).toEqual([{ id: first.id, label: first.name }]); expect(createLabel).not.toHaveBeenCalled();
  });
  it('leaves date saving to the bound parent control rather than dispatching an unrelated label command', () => {
    const observed: string[] = []; due.valueChanges.subscribe(value => observed.push(value)); fields.dueDateControl()!.setValue('2031-06-21'); fields.dueDateControl()!.setValue('');
    expect(observed).toEqual(['2031-06-21', '']); expect(due.value).toBe(''); expect(createLabel).not.toHaveBeenCalled(); expect(selected.value).toEqual([]);
  });
  it('rejects an eleventh selection without replacing or dirtying the accepted control', () => {
    const ids = Array.from({ length: 10 }, (_, index) => label(index + 1).id); selected.setValue(ids); selected.markAsPristine(); fields.choose([...ids, label(11).id]);
    expect(selected.value).toEqual(ids); expect(selected.pristine).toBe(true); expect(fields.state.message()).toContain('at most ten labels');
  });
  it('does not select or remove labels while the owning editor is disabled', () => {
    fields.choose([first.id]); selected.markAsPristine(); disabled.set(true); fields.choose([second.id]); fields.remove(first.id);
    expect(selected.value).toEqual([first.id]); expect(selected.pristine).toBe(true); expect(fields.selectedOptions()).toEqual([{ id: first.id, label: first.name }]);
  });
  it('removes one selected label while preserving the other selected friendly name', () => {
    fields.choose([first.id, second.id]); fields.remove(first.id); expect(selected.value).toEqual([second.id]); expect(fields.selectedOptions()).toEqual([{ id: second.id, label: second.name }]);
  });
  it('debounces a burst into the exact latest query and immediately clears stale choices', async () => {
    vi.useFakeTimers(); labels.mockClear(); fields.query.setValue('a'); fields.query.setValue('ab'); fields.query.setValue('عربي'); expect(fields.searchPending()).toBe(true); expect(fields.choices()).toEqual([]);
    await vi.advanceTimersByTimeAsync(119); expect(labels).not.toHaveBeenCalled(); await vi.advanceTimersByTimeAsync(1); await flush();
    expect(labels).toHaveBeenCalledExactlyOnceWith(projectA, 'عربي', undefined); expect(fields.searchPending()).toBe(false); expect(fields.choices()).toEqual([first, second]);
  });
  it('validates forty Unicode code points rather than UTF-16 units for label search', async () => {
    vi.useFakeTimers(); labels.mockClear(); const accepted = '😀'.repeat(40); fields.query.setValue(accepted); expect(fields.query.valid).toBe(true); await vi.advanceTimersByTimeAsync(120);
    expect(labels).toHaveBeenCalledExactlyOnceWith(projectA, accepted, undefined); fields.query.setValue(accepted + '😀'); expect(fields.query.invalid).toBe(true); expect(fields.searchPending()).toBe(false); await vi.advanceTimersByTimeAsync(120); expect(labels).toHaveBeenCalledOnce();
  });
  it('cancels a queued lookup before destruction and never dispatches after the view is gone', async () => {
    vi.useFakeTimers(); labels.mockClear(); fields.query.setValue('pending'); destroy(); await vi.advanceTimersByTimeAsync(120); expect(labels).not.toHaveBeenCalled(); expect(fields.searchPending()).toBe(false);
  });
  it('does not schedule or directly dispatch an invalid query or missing project', async () => {
    vi.useFakeTimers(); labels.mockClear(); fields.query.setValue('x'.repeat(41)); await fields.find(); await vi.advanceTimersByTimeAsync(120); expect(labels).not.toHaveBeenCalled();
    project.set(''); TestBed.tick(); fields.query.setValue('valid'); await fields.find(); await vi.advanceTimersByTimeAsync(120); expect(labels).not.toHaveBeenCalled(); expect(fields.searchPending()).toBe(false);
  });
  it('does not schedule typed lookups while the parent is disabled', async () => {
    vi.useFakeTimers(); labels.mockClear(); disabled.set(true); fields.query.setValue('not dispatched'); await vi.advanceTimersByTimeAsync(120); expect(labels).not.toHaveBeenCalled(); expect(fields.searchPending()).toBe(false);
  });
  it('appends opaque cursor pages with ID deduplication and retains selected labels', async () => {
    fields.choose([first.id]); labels.mockResolvedValueOnce(page([second], 'opaque-next')); await fields.find(); expect(fields.choices()).toEqual([first, second]);
    const third = label(3); labels.mockResolvedValueOnce(page([second, third])); await fields.find('opaque-next');
    expect(labels).toHaveBeenLastCalledWith(projectA, '', 'opaque-next'); expect(fields.choices()).toEqual([first, second, third]); expect(fields.cursor()).toBeNull(); expect(fields.selectedOptions()).toEqual([{ id: first.id, label: first.name }]);
  });
  it('keeps a failed page cursor and previous choices for a precise retry', async () => {
    labels.mockResolvedValueOnce(page([first], 'failed-cursor')); await fields.find(); labels.mockRejectedValueOnce(unavailable()); await fields.find('failed-cursor');
    expect(fields.cursor()).toBe('failed-cursor'); expect(fields.choices()).toEqual([first]); expect(fields.state.failure()?.payload.error.code).toBe('temporarily_unavailable');
    labels.mockResolvedValueOnce(page([second])); await fields.find(fields.cursor()!); expect(labels.mock.calls.slice(-2)).toEqual([[projectA, '', 'failed-cursor'], [projectA, '', 'failed-cursor']]); expect(fields.choices()).toEqual([first, second]); expect(fields.state.failure()).toBeNull();
  });
  for (const boundary of ['project', 'query', 'epoch', 'destroy'] as const) for (const outcome of ['success', 'failure'] as const) {
    it('ignores a stale discovery ' + outcome + ' after ' + boundary + ' changes', async () => {
      vi.useFakeTimers(); const pending = deferred<PageLabelView>(); labels.mockReturnValueOnce(pending.promise); const request = fields.find(); const privateLabel = label(77);
      if (boundary === 'project') project.set(projectB);
      else if (boundary === 'query') fields.query.setValue('new query');
      else if (boundary === 'epoch') epoch.set(2);
      else destroy();
      if (outcome === 'success') pending.resolve(page([privateLabel], 'private-cursor'));
      else pending.reject(new Error('Old private search failed'));
      await request;
      expect(fields.choices()).not.toContainEqual(privateLabel); expect(fields.cursor()).not.toBe('private-cursor'); expect(cache.labels.has(privateLabel.id)).toBe(false); expect(fields.state.message()).not.toContain('Old private');
    });
  }
  it('creates and selects a trimmed label using a typed idempotent command', async () => {
    const created = label(3); fields.name.setValue('  جديد  '); await fields.create();
    const [projectId, name, reference] = createLabel.mock.calls[0]!; expect(projectId).toBe(projectA); expect(name).toBe('جديد'); expect(reference).toMatch(/^[0-9a-f-]{36}$/);
    expect(selected.value).toEqual([created.id]); expect(selected.dirty).toBe(true); expect(fields.name.value).toBe(''); expect(fields.choices()[0]).toEqual(created); expect(fields.selectedOptions()).toEqual([{ id: created.id, label: created.name }]); expect(cache.labels.get(created.id)).toEqual(created);
  });
  for (const guard of ['not allowed', 'disabled', 'invalid Unicode length', 'blank name', 'no project'] as const) {
    it('does not create a label when ' + guard, async () => {
      fields.name.setValue('New label');
      if (guard === 'not allowed') allowCreate.set(false);
      else if (guard === 'disabled') disabled.set(true);
      else if (guard === 'invalid Unicode length') fields.name.setValue('😀'.repeat(41));
      else if (guard === 'blank name') fields.name.setValue('   ');
      else project.set('');
      await fields.create(); expect(createLabel).not.toHaveBeenCalled(); expect(selected.value).toEqual([]); expect(selected.pristine).toBe(true);
    });
  }
  it('retains exact create retry identity after an uncertain response and gives corrected intent a new reference', async () => {
    fields.name.setValue('Original intention'); createLabel.mockRejectedValueOnce(unavailable()).mockRejectedValueOnce(unavailable()); await fields.create(); const reference = createLabel.mock.calls[0]![2];
    expect(fields.name.value).toBe('Original intention'); expect(fields.state.failure()?.payload.error.code).toBe('temporarily_unavailable'); await fields.create(); expect(createLabel.mock.calls[1]).toEqual([projectA, 'Original intention', reference]);
    fields.name.setValue('Corrected intention'); await fields.create(); expect(createLabel.mock.calls[2]?.[2]).not.toBe(reference); expect(fields.name.value).toBe(''); expect(selected.value).toEqual([label(3).id]);
  });
  it('uses a fresh reference for a later accepted command even when the next name is the same', async () => {
    fields.name.setValue('Repeat after confirmed success'); await fields.create(); const reference = createLabel.mock.calls[0]![2]; fields.name.setValue('Repeat after confirmed success'); await fields.create(); expect(createLabel.mock.calls[1]?.[2]).not.toBe(reference); expect(selected.value).toEqual([label(3).id]);
  });
  it('keeps a rejected label name and accepted selections visible for correction', async () => {
    fields.choose([first.id]); fields.name.setValue('Rejected duplicate'); const failure = new ApiError({ error: { code: 'validation_failed', message: 'Choose another label name.', fieldErrors: [], retryable: false, nextAction: 'review_fields' }, current: null, unfinished: null }, 422); createLabel.mockRejectedValueOnce(failure); await fields.create();
    expect(fields.name.value).toBe('Rejected duplicate'); expect(selected.value).toEqual([first.id]); expect(fields.state.failure()).toBe(failure); expect(fields.state.message()).toContain('Choose another'); expect(fields.state.busy()).toBe(false);
  });
  it('creates a reusable label at selection capacity without adding an eleventh value', async () => {
    const accepted = Array.from({ length: 10 }, (_, index) => label(index + 10).id), newLabel = label(33); selected.setValue(accepted); selected.markAsPristine(); createLabel.mockResolvedValueOnce(saved(newLabel)); fields.name.setValue(newLabel.name); await fields.create();
    expect(selected.value).toEqual(accepted); expect(selected.pristine).toBe(true); expect(fields.name.value).toBe(''); expect(fields.choices()[0]).toEqual(newLabel); expect(cache.labels.get(newLabel.id)).toEqual(newLabel); expect(fields.state.message()).toContain('Remove one selection');
  });
  it('bounds the visible creation choices while retaining existing selected identity metadata', async () => {
    const firstPage = Array.from({ length: 25 }, (_, index) => label(index + 1)), secondPage = Array.from({ length: 25 }, (_, index) => label(index + 26));
    labels.mockResolvedValueOnce(page(firstPage, 'page-two')); await fields.find(); fields.choose([first.id]); labels.mockResolvedValueOnce(page(secondPage)); await fields.find('page-two'); expect(fields.choices()).toHaveLength(50);
    const created = label(99); createLabel.mockResolvedValueOnce(saved(created)); fields.name.setValue('Bounded new label'); await fields.create(); expect(fields.choices()).toHaveLength(35); expect(fields.choices()[0]).toEqual(created); expect(selected.value).toEqual([first.id, created.id]); expect(fields.selectedOptions()).toContainEqual({ id: first.id, label: first.name });
  });
  it('does not duplicate an already selected label on a replayed successful create result', async () => {
    fields.choose([first.id]); createLabel.mockResolvedValueOnce(saved(first)); fields.name.setValue(first.name); await fields.create(); expect(selected.value).toEqual([first.id]); expect(fields.choices().filter(value => value.id === first.id)).toHaveLength(1); expect(fields.name.value).toBe('');
  });
  it('does not dispatch a second create while the first command is still outstanding', async () => {
    const pending = deferred<SavedLabelView>(); createLabel.mockReturnValueOnce(pending.promise); fields.name.setValue('In progress'); const request = fields.create(); await fields.create(); expect(createLabel).toHaveBeenCalledOnce(); expect(fields.state.busy()).toBe(true); pending.resolve(saved(label(3))); await request; expect(fields.state.busy()).toBe(false);
  });
  for (const boundary of ['project', 'query', 'epoch', 'destroy'] as const) for (const outcome of ['success', 'failure'] as const) {
    it('ignores a stale create ' + outcome + ' after ' + boundary + ' changes', async () => {
      vi.useFakeTimers(); const pending = deferred<SavedLabelView>(); createLabel.mockReturnValueOnce(pending.promise); fields.name.setValue('Old private name'); const request = fields.create(), created = label(77);
      if (boundary === 'project') project.set(projectB);
      else if (boundary === 'query') fields.query.setValue('current search');
      else if (boundary === 'epoch') epoch.set(2);
      else destroy();
      if (outcome === 'success') pending.resolve(saved(created)); else pending.reject(new Error('Old private create failed'));
      await request; expect(selected.value).toEqual([]); expect(fields.name.value).toBe('Old private name'); expect(cache.labels.has(created.id)).toBe(false); expect(fields.choices()).not.toContainEqual(created); expect(fields.state.message()).not.toContain('Old private');
    });
  }
  it('keeps a newly entered name draft when an earlier accepted create acknowledgement arrives', async () => {
    const pending = deferred<SavedLabelView>(); createLabel.mockReturnValueOnce(pending.promise); fields.name.setValue('First submitted name'); const request = fields.create();
    fields.name.setValue('Next unsent name'); fields.name.markAsDirty(); pending.resolve(saved(label(3))); await request;
    expect(selected.value).toEqual([label(3).id]); expect(fields.name.value).toBe('Next unsent name'); expect(fields.name.dirty).toBe(true);
  });
  it('clears an acknowledged name when only insignificant surrounding whitespace changed', async () => {
    const pending = deferred<SavedLabelView>(); createLabel.mockReturnValueOnce(pending.promise); fields.name.setValue('Submitted name'); const request = fields.create();
    fields.name.setValue('  Submitted name  '); fields.name.markAsDirty(); pending.resolve(saved(label(3))); await request;
    expect(fields.name.value).toBe(''); expect(fields.name.pristine).toBe(true); expect(selected.value).toEqual([label(3).id]);
  });
});
