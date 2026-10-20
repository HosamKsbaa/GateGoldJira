import '@angular/compiler';
import { ElementRef, provideZonelessChangeDetection, RendererFactory2, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModernIssueFieldEditorComponent, type ModernEditableField } from './modern-issue-field-editor.component';
import { ModernIssuesApi } from '../../modern-issues.api';
import { IssuesApi } from '../../issues.api';
import { ProjectConfigurationApi } from '../../../projects/project-configuration.api';
import { AuthService } from '../../../../core/auth/auth.service';
import { DraftsService } from '../../../../core/drafts/drafts.service';
import { ApiError } from '../../../../core/api/api-result';
import type { ModernIssueView, PagePriorityView, PageUserSummary, SavedModernIssueView } from '../../../../api/generated/types.gen';
import { modernEditable } from '../../issue-model';

const projectId = '20000000-0000-4000-8000-000000000001';
const issueId = '50000000-0000-4000-8000-000000000001';
const priorityId = '40000000-0000-4000-8000-000000000001';
const nextPriorityId = '40000000-0000-4000-8000-000000000002';
const actor = { id: '10000000-0000-4000-8000-000000000002', displayName: 'Current member' };
function issue(): ModernIssueView {
  return { capabilities: ['read', 'edit'], description: 'Existing description', descriptionFormat: 'plain', graphRevision: '1', links: [], reporter: actor, watching: false,
    summary: { id: issueId, projectId, key: 'GG-1', number: '1', title: 'Existing title', revision: '7',
      archived: false, backlog: false, blocked: false, createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z', dueDate: '2026-12-01', overdue: false,
      assignee: actor, labels: [], parent: null, subtaskProgress: { total: 0, done: 0 }, unfinishedBlockerCount: 0,
      type: { id: '30000000-0000-4000-8000-000000000001', key: 'task', name: 'Task', behavior: 'standard', retired: false },
      priority: { id: priorityId, key: 'medium', name: 'Original priority', sortOrder: '2', retired: false },
      workflow: { id: '80000000-0000-4000-8000-000000000001', name: 'Work', revision: '1', retired: false },
      stage: { id: '90000000-0000-4000-8000-000000000001', name: 'To do', category: 'todo', initial: true, position: '1', retired: false, acceptsEntries: true },
    } };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const saved = (value: ModernIssueView): SavedModernIssueView => ({ result: value, receipt: { replayed: false, eventId: null } });
const priorities = (): PagePriorityView => ({ items: [{ ...issue().summary.priority, projectId, default: true }, { ...issue().summary.priority, id: nextPriorityId, key: 'high', name: 'High', default: false, projectId }], nextCursor: null, totalMatching: 2 });
const failed = () => new ApiError({ error: { code: 'temporarily_unavailable', message: 'Retry the same reference.', fieldErrors: [], retryable: true, nextAction: 'retry_same_reference' }, current: null, unfinished: null }, 503);

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
describe('inline issue editor model request and draft ownership', () => {
  const epoch = signal(0), currentIssue = signal(issue()), field = signal<ModernEditableField>('title'), disabled = signal(false);
  const update = vi.fn<ModernIssuesApi['update']>(), patch = vi.fn<ModernIssuesApi['patch']>();
  const assignees = vi.fn<IssuesApi['assignees']>(), priorityPages = vi.fn<ProjectConfigurationApi['priorities']>();
  let editor: ModernIssueFieldEditorComponent, drafts: DraftsService;
  beforeEach(() => {
    epoch.set(0); currentIssue.set(issue()); field.set('title'); disabled.set(false);
    update.mockReset(); patch.mockReset(); assignees.mockReset().mockResolvedValue({ items: [], nextCursor: null, totalMatching: 0 }); priorityPages.mockReset().mockResolvedValue(priorities());
    const events = Object.assign(new EventTarget(), { confirm: () => true, getSelection: () => null });
    vi.stubGlobal('window', events); vi.stubGlobal('document', Object.assign(new EventTarget(), { activeElement: null }));
    const root = { querySelector: () => null, querySelectorAll: () => [], contains: () => false };
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { sessionEpoch: epoch, me: signal({ userId: actor.id }) } },
      { provide: ModernIssuesApi, useValue: { update, patch } }, { provide: IssuesApi, useValue: { assignees } },
      { provide: ProjectConfigurationApi, useValue: { priorities: priorityPages } },
      { provide: ElementRef, useValue: new ElementRef(root) },
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('This model test does not mount a component.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
    ] });
    drafts = TestBed.inject(DraftsService);
    editor = TestBed.runInInjectionContext(() => new ModernIssueFieldEditorComponent());
    // Public signal-input ports are supplied before the real Angular effects run.
    // No private input nodes, component internals, template or browser UI are mocked.
    Object.defineProperties(editor, { issue: { value: currentIssue.asReadonly() }, field: { value: field.asReadonly() }, label: { value: signal('Field').asReadonly() }, disabled: { value: disabled.asReadonly() } });
    TestBed.tick();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('retains an invalid intermediate title as a draft but never sends it', async () => {
    editor.begin(); editor.value.setValue(''); await editor.save();
    expect(update).not.toHaveBeenCalled(); expect(patch).not.toHaveBeenCalled();
    expect(editor.state.message()).toContain('Titles need 1–200 characters');
    expect(editor.editing()).toBe(true); expect(drafts.modernIssues.get('inline:' + issueId + ':title')?.editable?.title).toBe('');
    expect(drafts.dirtyCount()).toBe(1);
  });

  it.each(['disabled', 'read-only'] as const)('does not start a writable draft when %s', condition => {
    if (condition === 'disabled') disabled.set(true);
    else currentIssue.set({ ...issue(), capabilities: ['read'] });
    TestBed.tick(); editor.begin();
    expect(editor.editing()).toBe(false); expect(drafts.dirtyCount()).toBe(0);
    expect(update).not.toHaveBeenCalled(); expect(patch).not.toHaveBeenCalled();
  });

  it('saves the exact title draft with a fresh retry identity and clears only its owned draft', async () => {
    const result = issue(); result.summary.title = 'Changed title'; result.summary.revision = '8';
    update.mockResolvedValue(saved(result)); const changed: ModernIssueView[] = []; editor.changed.subscribe(value => changed.push(value));
    drafts.comments.set('other-editor', { html: 'Keep unrelated draft', revision: null });
    editor.begin(); editor.value.setValue('Changed title'); await editor.save();
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0]?.slice(0, 3)).toEqual([issueId, '7', { ...modernEditable(issue()), title: 'Changed title' }]);
    expect(update.mock.calls[0]?.[3]).toMatch(/^[0-9a-f-]{36}$/);
    expect(changed).toEqual([result]); expect(editor.editing()).toBe(false);
    expect(drafts.modernIssues.has('inline:' + issueId + ':title')).toBe(false);
    expect(drafts.comments.get('other-editor')?.html).toBe('Keep unrelated draft');
  });

  it('retries the identical unsent title with its original identity but gives an edited intention a new one', async () => {
    update.mockRejectedValue(failed()); editor.begin(); editor.value.setValue('First intention');
    await editor.save(); await editor.save();
    expect(update).toHaveBeenCalledTimes(2);
    expect(update.mock.calls[1]).toEqual(update.mock.calls[0]);
    expect(editor.editing()).toBe(true); expect(editor.value.value).toBe('First intention');
    editor.value.setValue('Corrected intention'); await editor.save();
    expect(update).toHaveBeenCalledTimes(3);
    expect(update.mock.calls[2]?.[2].title).toBe('Corrected intention');
    expect(update.mock.calls[2]?.[3]).not.toBe(update.mock.calls[0]?.[3]);
  });

  it('rebases only the chosen title onto a reviewed snapshot while retaining unrelated latest fields', async () => {
    editor.begin(); editor.value.setValue('My unsent title');
    const latest = issue(); latest.summary.revision = '8'; latest.summary.dueDate = '2027-03-04'; latest.description = 'Other writer description'; latest.summary.assignee = null;
    editor.review(latest);
    expect(editor.value.value).toBe('My unsent title'); expect(editor.revision()).toBe('8');
    expect(editor.state.message()).toContain('Your draft is unchanged');
    update.mockResolvedValue(saved(latest)); await editor.save();
    expect(update.mock.calls[0]?.slice(0, 3)).toEqual([issueId, '8', { ...modernEditable(latest), title: 'My unsent title' }]);
  });

  it('suppresses a late previous-issue save without clearing the new issue editor or draft', async () => {
    const pending = deferred<SavedModernIssueView>(); update.mockReturnValue(pending.promise);
    const changed: ModernIssueView[] = []; editor.changed.subscribe(value => changed.push(value));
    editor.begin(); editor.value.setValue('Old issue private title'); const operation = editor.save();
    const replacement = issue(); replacement.summary.id = '50000000-0000-4000-8000-000000000002'; replacement.summary.title = 'New issue';
    currentIssue.set(replacement); TestBed.tick(); editor.begin(); editor.value.setValue('New issue unsent title');
    pending.resolve(saved(issue())); await operation;
    expect(changed).toEqual([]); expect(editor.editing()).toBe(true); expect(editor.value.value).toBe('New issue unsent title');
    expect(drafts.modernIssues.get('inline:' + replacement.summary.id + ':title')?.editable?.title).toBe('New issue unsent title');
  });

  it('does not let an old-session completion unlock a newer in-flight save or revive a cleared private draft', async () => {
    const first = deferred<SavedModernIssueView>(), second = deferred<SavedModernIssueView>(); update.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const changed: ModernIssueView[] = []; editor.changed.subscribe(value => changed.push(value));
    editor.begin(); editor.value.setValue('Previous account private title'); const oldOperation = editor.save();
    epoch.update(value => value + 1); TestBed.tick();
    expect(editor.editing()).toBe(false); expect(drafts.modernIssues.size).toBe(0);
    editor.begin(); editor.value.setValue('Current account title'); const newOperation = editor.save(); expect(editor.state.busy()).toBe(true);
    first.resolve(saved(issue())); await oldOperation;
    expect(changed).toEqual([]); expect(editor.state.busy()).toBe(true); expect(editor.value.value).toBe('Current account title');
    const latest = issue(); latest.summary.title = 'Current account title'; second.resolve(saved(latest)); await newOperation;
    expect(changed).toEqual([latest]); expect(editor.state.busy()).toBe(false); expect(drafts.modernIssues.size).toBe(0);
    expect(update.mock.calls[0]?.[3]).not.toBe(update.mock.calls[1]?.[3]);
  });

  it('never publishes a successful result after its model injector is destroyed', async () => {
    const pending = deferred<SavedModernIssueView>(); update.mockReturnValue(pending.promise);
    const changed: ModernIssueView[] = []; editor.changed.subscribe(value => changed.push(value));
    editor.begin(); editor.value.setValue('Disposed editor title'); const operation = editor.save();
    TestBed.resetTestingModule(); pending.resolve(saved(issue())); await operation;
    expect(changed).toEqual([]); expect(drafts.dirtyCount()).toBe(0);
  });

  it('keeps an invalid conflict payload out of the trusted review projection', async () => {
    update.mockRejectedValue(new ApiError({ error: { code: 'conflict', message: 'Review current state.', fieldErrors: [], retryable: false, nextAction: 'reload_current_state' }, current: { summary: { id: 'forged' } }, unfinished: null }, 409));
    editor.begin(); editor.value.setValue('Unsent title'); await editor.save();
    expect(editor.conflict()).toBeNull(); expect(editor.value.value).toBe('Unsent title'); expect(editor.editing()).toBe(true);
    expect(editor.state.failure()?.status).toBe(409);
  });

  it('keeps the retained retired priority selectable while excluding other retired priorities', async () => {
    const value = issue(); value.summary.priority.retired = true; currentIssue.set(value); field.set('priorityId'); TestBed.tick();
    const page = priorities(); page.items = page.items.filter(item => item.id !== priorityId); page.items.push({ ...page.items[0]!, id: '40000000-0000-4000-8000-000000000003', retired: true, name: 'Other retired' }); priorityPages.mockResolvedValue(page);
    editor.begin(); await Promise.resolve(); await Promise.resolve();
    expect(editor.choices()).toEqual([{ value: priorityId, label: 'Original priority · Retired' }, { value: nextPriorityId, label: 'High' }]);
    expect(editor.value.value).toBe(priorityId);
  });

  it('closes an unchanged autosave priority without sending a mutation', async () => {
    field.set('priorityId'); TestBed.tick(); editor.begin(); await editor.save();
    expect(update).not.toHaveBeenCalled(); expect(patch).not.toHaveBeenCalled(); expect(editor.editing()).toBe(false);
  });

  it('patches a priority against its prior value, locks an uncertain selection and retries the exact original intention', async () => {
    field.set('priorityId'); TestBed.tick(); patch.mockRejectedValueOnce(failed()).mockResolvedValueOnce(saved(issue()));
    editor.begin(); editor.value.setValue(nextPriorityId); await editor.save();
    expect(patch.mock.calls[0]?.slice(0, 2)).toEqual([issueId, { field: 'priorityId', priority: { prior: priorityId, value: nextPriorityId } }]);
    expect(editor.selectionLocked()).toBe(true); editor.choose({ value: priorityId, label: 'Original' }); expect(editor.value.value).toBe(nextPriorityId);
    await editor.save(); expect(patch.mock.calls[1]).toEqual(patch.mock.calls[0]);
    expect(editor.editing()).toBe(false); expect(update).not.toHaveBeenCalled();
  });

  it('uses the full revision guard for a restored draft lacking its original prior-field snapshot', async () => {
    field.set('priorityId'); TestBed.tick();
    const editable = { ...modernEditable(issue()), priorityId: nextPriorityId };
    drafts.modernIssues.set('inline:' + issueId + ':priorityId', { fields: editable, editable, revision: '6', files: [] });
    update.mockRejectedValue(failed()); editor.begin(); await editor.save();
    expect(patch).not.toHaveBeenCalled(); expect(update.mock.calls[0]?.slice(0, 3)).toEqual([issueId, '6', editable]);
    expect(editor.value.value).toBe(nextPriorityId); expect(editor.editing()).toBe(true);
  });

  it('requires explicit review before rebasing an autosave patch onto a new prior value', async () => {
    field.set('priorityId'); TestBed.tick();
    const latest = issue(); latest.summary.revision = '8'; latest.summary.priority = { ...latest.summary.priority, id: '40000000-0000-4000-8000-000000000003', name: 'Other writer priority' };
    patch.mockRejectedValueOnce(new ApiError({ error: { code: 'conflict', message: 'Review latest.', fieldErrors: [], retryable: false, nextAction: 'reload_current_state' }, current: latest, unfinished: null }, 409)).mockResolvedValueOnce(saved(latest));
    editor.begin(); editor.value.setValue(nextPriorityId); await editor.save(); expect(editor.conflict()).toEqual(latest);
    editor.review(latest); expect(editor.reviewReady()).toBe(true); expect(editor.value.value).toBe(nextPriorityId); expect(patch).toHaveBeenCalledOnce();
    await editor.save();
    expect(patch.mock.calls[1]?.[1]).toEqual({ field: 'priorityId', priority: { prior: latest.summary.priority.id, value: nextPriorityId } });
    expect(patch.mock.calls[1]?.[2]).not.toBe(patch.mock.calls[0]?.[2]);
  });

  it('deduplicates assignee pages by identity while retaining their authorized display names', async () => {
    const second = { id: '10000000-0000-4000-8000-000000000003', displayName: 'Second member' }, third = { id: '10000000-0000-4000-8000-000000000004', displayName: 'Third member' };
    assignees.mockResolvedValueOnce({ items: [actor, second], nextCursor: 'next-owned-page', totalMatching: 3 }).mockResolvedValueOnce({ items: [second, third], nextCursor: null, totalMatching: 3 });
    field.set('assigneeId'); TestBed.tick(); editor.begin(); await Promise.resolve(); await Promise.resolve();
    expect(editor.cursor()).toBe('next-owned-page'); await editor.findAssignees(true);
    expect(assignees.mock.calls[1]?.slice(0, 3)).toEqual([projectId, '', 'next-owned-page']);
    expect(editor.assignees()).toEqual([actor, second, third]); expect(editor.cursor()).toBeNull();
  });

  it('ignores an old assignee response after cancellation and does not reopen the editor', async () => {
    const pending = deferred<PageUserSummary>(); assignees.mockReturnValue(pending.promise); field.set('assigneeId'); TestBed.tick(); editor.begin(); editor.cancel();
    pending.resolve({ items: [{ id: '10000000-0000-4000-8000-000000000009', displayName: 'Late previous request person' }], nextCursor: 'private-old-cursor', totalMatching: 1 }); await Promise.resolve(); await Promise.resolve();
    expect(editor.editing()).toBe(false); expect(editor.assignees()).toEqual([actor]); expect(editor.cursor()).toBeNull(); expect(editor.optionsState.busy()).toBe(false);
  });

  it('prevents a late failed old-query lookup from replacing current successful options with an error', async () => {
    vi.useFakeTimers(); const pending = deferred<PageUserSummary>();
    assignees.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({ items: [actor], nextCursor: null, totalMatching: 1 });
    field.set('assigneeId'); TestBed.tick(); editor.begin(); editor.query.setValue('Current'); await vi.advanceTimersByTimeAsync(120);
    expect(editor.assignees()).toEqual([actor]); pending.reject(failed()); await Promise.resolve(); await Promise.resolve();
    expect(editor.assignees()).toEqual([actor]); expect(editor.optionsState.message()).toBe(''); expect(editor.optionsState.busy()).toBe(false);
  });

  it('cancels a queued old-session assignee search before it can dispatch', async () => {
    vi.useFakeTimers(); field.set('assigneeId'); TestBed.tick(); editor.begin(); await Promise.resolve(); await Promise.resolve(); assignees.mockClear();
    editor.query.setValue('Private old-session query'); expect(editor.searchPending()).toBe(true);
    epoch.update(value => value + 1); TestBed.tick(); await vi.advanceTimersByTimeAsync(120);
    expect(assignees).not.toHaveBeenCalled(); expect(editor.query.value).toBe(''); expect(editor.assignees()).toEqual([]); expect(editor.editing()).toBe(false);
  });


  it('clears a due date using its prior value and a typed null rather than an empty date string', async () => {
    field.set('dueDate'); TestBed.tick(); patch.mockResolvedValue(saved(issue()));
    editor.begin(); editor.clearDueDate(); await Promise.resolve(); await Promise.resolve();
    expect(patch.mock.calls[0]?.slice(0, 2)).toEqual([issueId, { field: 'dueDate', dueDate: { prior: '2026-12-01', value: null } }]);
    expect(update).not.toHaveBeenCalled(); expect(editor.editing()).toBe(false);
  });

  it('does not clear a due date while the field has become disabled', () => {
    field.set('dueDate'); TestBed.tick(); editor.begin(); disabled.set(true); editor.clearDueDate();
    expect(editor.value.value).toBe('2026-12-01'); expect(patch).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });

  it('persists the explicitly selected label identities without altering unrelated fields', async () => {
    field.set('labelIds'); TestBed.tick(); editor.begin();
    const label = '60000000-0000-4000-8000-000000000001'; editor.labels.setValue([label]); update.mockResolvedValue(saved(issue())); await editor.save();
    expect(update.mock.calls[0]?.slice(0, 3)).toEqual([issueId, '7', { ...modernEditable(issue()), labelIds: [label] }]);
    expect(patch).not.toHaveBeenCalled();
  });

  it('retains a failed priorities page and retries its original cursor without dropping prior or retired selections', async () => {
    const firstPage = priorities(); firstPage.nextCursor = 'priority-second-page';
    const additional = { ...firstPage.items[0]!, id: '40000000-0000-4000-8000-000000000004', name: 'Urgent', key: 'urgent' };
    priorityPages.mockResolvedValueOnce(firstPage).mockRejectedValueOnce(failed()).mockResolvedValueOnce({ items: [additional], nextCursor: null, totalMatching: 3 });
    field.set('priorityId'); TestBed.tick(); editor.begin(); await Promise.resolve(); await Promise.resolve();
    await editor.findPriorities(true); expect(editor.priorityCursor()).toBe('priority-second-page');
    expect(editor.priorities()).toEqual(firstPage.items); expect(editor.optionsState.message()).toBe('Retry the same reference.');
    await editor.findPriorities(true); expect(priorityPages.mock.calls[1]).toEqual([projectId, 'priority-second-page']); expect(priorityPages.mock.calls[2]).toEqual(priorityPages.mock.calls[1]);
    expect(editor.priorities()).toEqual([...firstPage.items, additional]); expect(editor.priorityCursor()).toBeNull(); expect(editor.optionsState.message()).toBe('');
  });

  it('ignores a delayed priorities page once that editor was closed', async () => {
    const pending = deferred<PagePriorityView>(); priorityPages.mockReturnValue(pending.promise);
    field.set('priorityId'); TestBed.tick(); editor.begin(); editor.cancel();
    pending.resolve(priorities()); await Promise.resolve(); await Promise.resolve();
    expect(editor.editing()).toBe(false); expect(editor.priorities()).toEqual([]); expect(editor.priorityCursor()).toBeNull();
    expect(editor.optionsState.message()).toBe('');
  });

});
