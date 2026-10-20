import '@angular/compiler';
import { ElementRef, provideZonelessChangeDetection, RendererFactory2, signal } from '@angular/core';
import { TestBed, TestComponentRenderer } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IssueTransitionOption, ModernIssueView, PageIssueTransitionOption } from '../../../../api/generated/types.gen';
import { ApiError } from '../../../../core/api/api-result';
import { AuthService } from '../../../../core/auth/auth.service';
import { ModernIssuesApi } from '../../modern-issues.api';
import { ModernIssueStatusMenuComponent } from './modern-issue-status-menu.component';

const issueId = '50000000-0000-4000-8000-000000000001';
const currentStage = '90000000-0000-4000-8000-000000000001';
const activeStage = '90000000-0000-4000-8000-000000000002';
const doneStage = '90000000-0000-4000-8000-000000000003';
const blockedStage = '90000000-0000-4000-8000-000000000004';
const actor = { id: '10000000-0000-4000-8000-000000000002', displayName: 'Member' };
function issue(): ModernIssueView {
  return {
    capabilities: ['read', 'edit', 'move'], description: 'Existing description', descriptionFormat: 'plain',
    graphRevision: '1', links: [], reporter: actor, watching: false,
    summary: {
      id: issueId, projectId: '20000000-0000-4000-8000-000000000001', key: 'GG-1', number: '1', title: 'Existing title', revision: '7',
      archived: false, backlog: false, blocked: false, createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z', dueDate: null, overdue: false,
      assignee: actor, labels: [], parent: null, subtaskProgress: { total: 0, done: 0 }, unfinishedBlockerCount: 0,
      type: { id: '30000000-0000-4000-8000-000000000001', key: 'task', name: 'Task', behavior: 'standard', retired: false },
      priority: { id: '40000000-0000-4000-8000-000000000001', key: 'medium', name: 'Medium', sortOrder: '2', retired: false },
      workflow: { id: '80000000-0000-4000-8000-000000000001', name: 'Work', revision: '1', retired: false },
      stage: { id: currentStage, name: 'To do', category: 'todo', initial: true, position: '1', retired: false, acceptsEntries: true },
    },
  };
}
function transition(id: string, position: string, overrides: Partial<IssueTransitionOption> = {}): IssueTransitionOption {
  return {
    stage: { ...issue().summary.stage, id, name: id === doneStage ? 'Done' : 'In progress', initial: false, position, category: id === doneStage ? 'done' : 'in_progress' },
    transitionId: '60000000-0000-4000-8000-' + id.slice(-12), canRequest: true, requiredPermission: 'member', requiresApproval: false, reviewSatisfied: true,
    ...overrides,
  };
}
const page = (items: IssueTransitionOption[], nextCursor: string | null = null): PageIssueTransitionOption => ({ items, nextCursor, totalMatching: items.length });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const unavailable = () => new ApiError({ error: { code: 'temporarily_unavailable', message: 'Transition discovery is unavailable.', fieldErrors: [], retryable: true, nextAction: 'retry_same_reference' }, current: null, unfinished: null }, 503);
const tickRequest = async () => { await Promise.resolve(); await Promise.resolve(); };
function key(value: string): KeyboardEvent {
  const event = new Event('keydown', { cancelable: true });
  Object.defineProperty(event, 'key', { value });
  return event as KeyboardEvent;
}

TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
afterAll(() => TestBed.resetTestEnvironment());
describe('native issue status menu public state and transition ownership', () => {
  const currentIssue = signal(issue()), disabled = signal(false), epoch = signal(0);
  const transitions = vi.fn<ModernIssuesApi['transitions']>();
  const selected: string[] = [];
  let menu: ModernIssueStatusMenuComponent;
  let root: { querySelector: () => null; querySelectorAll: () => never[]; contains: (node: unknown) => boolean };
  let inside: object, outside: object;
  let windowEvents: EventTarget, documentEvents: EventTarget;
  class TestNode extends EventTarget {}
  beforeEach(() => {
    currentIssue.set(issue()); disabled.set(false); epoch.set(0); selected.length = 0;
    transitions.mockReset().mockResolvedValue(page([transition(activeStage, '2'), transition(doneStage, '3')]));
    inside = new TestNode(); outside = new TestNode();
    root = { querySelector: () => null, querySelectorAll: () => [], contains: node => node === inside };
    windowEvents = new EventTarget(); documentEvents = Object.assign(new EventTarget(), { activeElement: null });
    vi.stubGlobal('window', windowEvents); vi.stubGlobal('document', documentEvents); vi.stubGlobal('Node', TestNode);
    TestBed.configureTestingModule({ providers: [
      provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { sessionEpoch: epoch } },
      { provide: ModernIssuesApi, useValue: { transitions } },
      { provide: ElementRef, useValue: new ElementRef(root) },
      { provide: RendererFactory2, useValue: { createRenderer: () => { throw new Error('This state model test does not mount a component.'); } } },
      { provide: TestComponentRenderer, useValue: { insertRootElement: () => {}, removeAllRootElements: () => {} } },
    ] });
    menu = TestBed.runInInjectionContext(() => new ModernIssueStatusMenuComponent());
    // Supply only public input ports before the real Angular effects first run.
    // This suite tests the model; it makes no template, popover rendering or web claim.
    Object.defineProperties(menu, { issue: { value: currentIssue.asReadonly() }, disabled: { value: disabled.asReadonly() } });
    menu.selected.subscribe(value => selected.push(value));
    TestBed.tick();
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

  it('exposes the retained stage without treating undiscovered destinations as authorized', () => {
    expect(menu.name()).toBe('To do'); expect(menu.opened()).toBe(false);
    expect(menu.allowed(currentStage)).toBe(true); expect(menu.allowed(activeStage)).toBe(false);
    expect(menu.optionsPage()).toEqual([]); expect(menu.cursor()).toBeNull();
    expect(transitions).not.toHaveBeenCalled();
  });

  it('does not discover or select a destination while explicitly disabled', () => {
    disabled.set(true); TestBed.tick(); menu.toggle(); menu.keyboard(key('ArrowDown')); menu.choose(activeStage);
    expect(menu.opened()).toBe(false); expect(transitions).not.toHaveBeenCalled(); expect(selected).toEqual([]);
  });

  it('starts fresh discovery using the exact issue identity without an inherited cursor', async () => {
    menu.toggle(); await tickRequest();
    expect(transitions).toHaveBeenCalledExactlyOnceWith(issueId, undefined);
    expect(menu.opened()).toBe(true); expect(menu.state.busy()).toBe(false);
    expect(menu.optionsPage().map(value => value.stage.id)).toEqual([activeStage, doneStage]);
    expect(menu.allowed(activeStage)).toBe(true); expect(menu.cursor()).toBeNull();
  });

  it('orders paged workflow positions exactly beyond Number precision and breaks position ties by identity', async () => {
    const samePosition = transition(blockedStage, '9007199254740993');
    transitions.mockResolvedValueOnce(page([transition(doneStage, '9007199254740994'), samePosition], 'opaque-page-two'))
      .mockResolvedValueOnce(page([transition(activeStage, '9007199254740993')]));
    menu.toggle(); await tickRequest(); expect(menu.cursor()).toBe('opaque-page-two');
    await menu.load(true);
    expect(transitions.mock.calls).toEqual([[issueId, undefined], [issueId, 'opaque-page-two']]);
    expect(menu.optionsPage().map(value => value.stage.id)).toEqual([activeStage, blockedStage, doneStage]);
    expect(menu.cursor()).toBeNull();
  });

  it('preserves a typed first-page failure for an explicit discovery retry without emitting a move', async () => {
    const failure = unavailable(); transitions.mockRejectedValueOnce(failure);
    menu.toggle(); await tickRequest();
    expect(menu.opened()).toBe(true); expect(menu.state.failure()).toBe(failure);
    expect(menu.state.message()).toBe(failure.message); expect(menu.optionsPage()).toEqual([]); expect(selected).toEqual([]);
    await menu.load();
    expect(transitions.mock.calls).toEqual([[issueId, undefined], [issueId, undefined]]);
    expect(menu.state.failure()).toBeNull(); expect(menu.state.message()).toBe('');
    expect(menu.optionsPage().map(value => value.stage.id)).toEqual([activeStage, doneStage]);
  });

  it('keeps prior choices and the exact continuation cursor when a later page fails, then retries that cursor', async () => {
    const firstPage = page([transition(activeStage, '2')], 'opaque-preserved-cursor');
    transitions.mockResolvedValueOnce(firstPage).mockRejectedValueOnce(unavailable()).mockResolvedValueOnce(page([transition(doneStage, '3')]));
    menu.toggle(); await tickRequest(); await menu.load(true);
    expect(menu.optionsPage()).toEqual(firstPage.items); expect(menu.cursor()).toBe('opaque-preserved-cursor');
    expect(menu.state.failure()?.status).toBe(503); expect(menu.opened()).toBe(true);
    await menu.load(true);
    expect(transitions.mock.calls[1]).toEqual([issueId, 'opaque-preserved-cursor']); expect(transitions.mock.calls[2]).toEqual(transitions.mock.calls[1]);
    expect(menu.optionsPage().map(value => value.stage.id)).toEqual([activeStage, doneStage]);
    expect(menu.cursor()).toBeNull(); expect(menu.state.failure()).toBeNull();
  });

  it('shows an ordinary connection error without inventing transition options or an authorized destination', async () => {
    transitions.mockRejectedValueOnce(new TypeError('Connection closed'));
    menu.toggle(); await tickRequest();
    expect(menu.state.message()).toBe('The request could not be completed. Check your connection and try again.');
    expect(menu.state.failure()).toBeNull(); expect(menu.state.busy()).toBe(false);
    expect(menu.allowed(activeStage)).toBe(false); expect(selected).toEqual([]);
  });

  it.each([
    { canRequest: false, reviewSatisfied: true, reason: 'a forbidden transition' },
    { canRequest: true, reviewSatisfied: false, reason: 'an unsatisfied review requirement' },
  ])('refuses $reason while retaining the open choice state', async ({ canRequest, reviewSatisfied }) => {
    transitions.mockResolvedValueOnce(page([transition(doneStage, '3', { canRequest, reviewSatisfied, requiresApproval: true })]));
    menu.toggle(); await tickRequest(); menu.choose(doneStage); menu.choose('90000000-0000-4000-8000-000000000099');
    expect(menu.allowed(doneStage)).toBe(false); expect(menu.opened()).toBe(true); expect(selected).toEqual([]);
    expect(menu.optionsPage()[0]).toMatchObject({ canRequest, reviewSatisfied, requiresApproval: true });
  });

  it('selects exactly the permitted stage once and closes instead of issuing its own mutation', async () => {
    menu.toggle(); await tickRequest(); menu.choose(activeStage);
    expect(selected).toEqual([activeStage]); expect(menu.opened()).toBe(false);
    expect(menu.state.message()).toBe(''); expect(transitions).toHaveBeenCalledOnce();
  });

  it('closes a retained-current-stage selection without emitting a redundant move', async () => {
    menu.toggle(); await tickRequest(); menu.choose(currentStage);
    expect(selected).toEqual([]); expect(menu.opened()).toBe(false); expect(menu.state.busy()).toBe(false);
  });

  it('does not emit an already-discovered choice after the disabled input changes', async () => {
    menu.toggle(); await tickRequest(); disabled.set(true); menu.choose(activeStage);
    expect(selected).toEqual([]); TestBed.tick(); expect(menu.opened()).toBe(false);
    expect(menu.state.busy()).toBe(false);
  });

  it('reopening discards old pages and errors before fresh discovery can complete', async () => {
    menu.toggle(); await tickRequest(); menu.close();
    const pending = deferred<PageIssueTransitionOption>(); transitions.mockReturnValueOnce(pending.promise);
    menu.state.message.set('An old failed lookup'); menu.toggle();
    expect(menu.optionsPage()).toEqual([]); expect(menu.cursor()).toBeNull(); expect(menu.state.message()).toBe(''); expect(menu.state.busy()).toBe(true);
    pending.resolve(page([transition(doneStage, '3')])); await tickRequest();
    expect(menu.optionsPage().map(value => value.stage.id)).toEqual([doneStage]); expect(menu.state.busy()).toBe(false);
  });

  it('ignores a late closed-menu page and its private continuation cursor', async () => {
    const pending = deferred<PageIssueTransitionOption>(); transitions.mockReturnValueOnce(pending.promise);
    menu.toggle(); menu.toggle(); pending.resolve(page([transition(doneStage, '3')], 'old-private-cursor')); await tickRequest();
    expect(menu.opened()).toBe(false); expect(menu.optionsPage()).toEqual([]); expect(menu.cursor()).toBeNull(); expect(menu.state.busy()).toBe(false);
  });

  it('does not let an old failure clear the busy state or error of a newer discovery request', async () => {
    const old = deferred<PageIssueTransitionOption>(), current = deferred<PageIssueTransitionOption>();
    transitions.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    menu.toggle(); menu.close(); menu.toggle(); old.reject(unavailable()); await tickRequest();
    expect(menu.opened()).toBe(true); expect(menu.state.busy()).toBe(true); expect(menu.state.message()).toBe('');
    current.resolve(page([transition(activeStage, '2')])); await tickRequest();
    expect(menu.optionsPage().map(value => value.stage.id)).toEqual([activeStage]); expect(menu.state.busy()).toBe(false);
  });

  it.each(['issue', 'stage', 'revision', 'session'] as const)('closes and suppresses a late page after the %s context changes', async context => {
    const pending = deferred<PageIssueTransitionOption>(); transitions.mockReturnValueOnce(pending.promise);
    menu.toggle();
    const replacement = issue();
    if (context === 'issue') replacement.summary.id = '50000000-0000-4000-8000-000000000002';
    if (context === 'stage') replacement.summary.stage = { ...replacement.summary.stage, id: activeStage, name: 'Changed by another writer' };
    if (context === 'revision') replacement.summary.revision = '8';
    if (context === 'session') epoch.update(value => value + 1); else currentIssue.set(replacement);
    TestBed.tick(); pending.resolve(page([transition(doneStage, '3')], 'old-context-cursor')); await tickRequest();
    expect(menu.opened()).toBe(false); expect(menu.optionsPage()).toEqual([]); expect(menu.cursor()).toBeNull();
    expect(menu.state.busy()).toBe(false); expect(menu.state.message()).toBe(''); expect(selected).toEqual([]);
  });

  it('updates its public stage name from a refreshed issue projection', () => {
    const replacement = issue(); replacement.summary.stage = { ...replacement.summary.stage, id: activeStage, name: 'Awaiting release' };
    currentIssue.set(replacement); TestBed.tick(); expect(menu.name()).toBe('Awaiting release');
  });

  it('does not start a discovery request when no menu is open', async () => {
    await menu.load(); await menu.load(true);
    expect(transitions).not.toHaveBeenCalled(); expect(menu.state.busy()).toBe(false); expect(menu.opened()).toBe(false);
  });

  it('queues fast keyboard selection until the returned destination is actually eligible', async () => {
    const pending = deferred<PageIssueTransitionOption>(); transitions.mockReturnValueOnce(pending.promise);
    const opening = key('ArrowDown'); menu.keyboard(opening);
    menu.keyboard(key('ArrowDown')); menu.keyboard(key('Enter'));
    expect(opening.defaultPrevented).toBe(true); expect(selected).toEqual([]); expect(menu.state.busy()).toBe(true);
    pending.resolve(page([transition(blockedStage, '2', { canRequest: false }), transition(activeStage, '3')])); await tickRequest();
    expect(selected).toEqual([activeStage]); expect(menu.opened()).toBe(false);
  });

  it('queues opening from the end and a space selection without selecting an unapproved final stage', async () => {
    const pending = deferred<PageIssueTransitionOption>(); transitions.mockReturnValueOnce(pending.promise);
    menu.keyboard(key('ArrowUp')); menu.keyboard(key(' '));
    pending.resolve(page([transition(activeStage, '2'), transition(doneStage, '3', { reviewSatisfied: false, requiresApproval: true })])); await tickRequest();
    expect(selected).toEqual([activeStage]); expect(menu.opened()).toBe(false);
  });

  it.each([
    { keys: ['End', 'Enter'], destination: doneStage, label: 'last eligible target' },
    { keys: ['ArrowUp', 'Enter'], destination: doneStage, label: 'wrapped previous target' },
    { keys: ['ArrowDown', 'Home', 'Enter'], destination: null, label: 'retained first target' },
    { keys: ['End', 'ArrowDown', 'Enter'], destination: null, label: 'wrapped retained target' },
  ])('applies keyboard navigation to the $label after discovery', async ({ keys, destination }) => {
    menu.toggle(); await tickRequest();
    for (const value of keys) menu.keyboard(key(value));
    expect(selected).toEqual(destination ? [destination] : []); expect(menu.opened()).toBe(false);
  });

  it('does not invent a destination when queued navigation returns no permitted transitions', async () => {
    const pending = deferred<PageIssueTransitionOption>(); transitions.mockReturnValueOnce(pending.promise);
    menu.keyboard(key('ArrowDown')); menu.keyboard(key('End')); menu.keyboard(key('Enter'));
    pending.resolve(page([transition(doneStage, '3', { canRequest: false })])); await tickRequest();
    expect(selected).toEqual([]); expect(menu.opened()).toBe(false);
  });

  it('Escape cancels queued keyboard intent before its late transition response arrives', async () => {
    const pending = deferred<PageIssueTransitionOption>(); transitions.mockReturnValueOnce(pending.promise);
    menu.keyboard(key('ArrowDown')); menu.keyboard(key('ArrowDown')); menu.keyboard(key('Enter'));
    const escape = key('Escape'); menu.keyboard(escape);
    pending.resolve(page([transition(activeStage, '2')])); await tickRequest();
    expect(escape.defaultPrevented).toBe(true); expect(selected).toEqual([]); expect(menu.opened()).toBe(false); expect(menu.optionsPage()).toEqual([]);
  });

  it('leaves unrelated keys to their ordinary owner without opening or selecting', async () => {
    const closed = key('Tab'); menu.keyboard(closed); expect(closed.defaultPrevented).toBe(false); expect(transitions).not.toHaveBeenCalled();
    menu.toggle(); await tickRequest(); const opened = key('x'); menu.keyboard(opened);
    expect(opened.defaultPrevented).toBe(false); expect(menu.opened()).toBe(true); expect(selected).toEqual([]);
  });

  it('keeps focus-loss during retry removal open but closes for an actual outside focus target', async () => {
    const pending = deferred<PageIssueTransitionOption>(); transitions.mockReturnValueOnce(pending.promise);
    menu.toggle(); menu.focusLeft({ relatedTarget: null } as FocusEvent); expect(menu.opened()).toBe(true);
    menu.focusLeft({ relatedTarget: inside } as FocusEvent); expect(menu.opened()).toBe(true);
    menu.focusLeft({ relatedTarget: outside } as FocusEvent); expect(menu.opened()).toBe(false);
    pending.resolve(page([transition(activeStage, '2')])); await tickRequest(); expect(menu.optionsPage()).toEqual([]);
  });

  it('closes ordinary null focus loss after loading and ignores inside pointer events', async () => {
    menu.toggle(); await tickRequest();
    menu.outside({ target: inside } as PointerEvent); expect(menu.opened()).toBe(true);
    menu.outside({ target: null } as PointerEvent); expect(menu.opened()).toBe(true);
    menu.outside({ target: outside } as PointerEvent); expect(menu.opened()).toBe(false);
    menu.toggle(); await tickRequest(); menu.focusLeft({ relatedTarget: null } as FocusEvent); expect(menu.opened()).toBe(false);
  });

  it('removes its viewport listeners and refuses late private results when the injector is destroyed', async () => {
    const removeWindow = vi.spyOn(windowEvents, 'removeEventListener'), removeDocument = vi.spyOn(documentEvents, 'removeEventListener');
    const pending = deferred<PageIssueTransitionOption>(); transitions.mockReturnValueOnce(pending.promise);
    menu.toggle(); TestBed.resetTestingModule(); pending.reject(unavailable()); await tickRequest();
    expect(menu.opened()).toBe(false); expect(menu.optionsPage()).toEqual([]); expect(menu.cursor()).toBeNull(); expect(menu.state.message()).toBe(''); expect(menu.state.busy()).toBe(false);
    expect(removeWindow).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith('scroll', expect.any(Function), true); expect(selected).toEqual([]);
  });
});
