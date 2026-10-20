import '@angular/compiler';
import { ElementRef, Injector, signal } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SearchablePickerComponent, type PickerOption } from './searchable-picker.component';
import { positionAnchoredPopup } from './position-anchored-popup';

// Execute the component's public interaction methods and actual Angular signals.
// Only the browser/render boundary is simulated; geometry has its own real
// positionAnchoredPopup tests and is not claimed by this suite.
const render = vi.hoisted(() => ({ effects: [] as Array<() => void>, callbacks: [] as Array<() => void> }));
vi.mock('@angular/core', async original => ({
  ...await original<typeof import('@angular/core')>(),
  effect: (body: () => void) => { render.effects.push(body); return { destroy() {} }; },
  afterNextRender: (body: () => void) => { render.callbacks.push(body); },
}));
vi.mock('./position-anchored-popup', () => ({ positionAnchoredPopup: vi.fn() }));
class BrowserNode {}
class BrowserElement extends BrowserNode {
  readonly children = new Set<BrowserNode>();
  popup: BrowserElement | null = null;
  popoverOpen = false;
  width = 190;
  readonly showPopover = vi.fn(() => { this.popoverOpen = true; });
  readonly hidePopover = vi.fn(() => { this.popoverOpen = false; });
  readonly focus = vi.fn<() => void>();
  readonly scrollIntoView = vi.fn<(options: ScrollIntoViewOptions) => void>();
  contains(node: BrowserNode) { return node === this || this.children.has(node); }
  querySelector(selector: string) { return selector === '.picker-results' ? this.popup : null; }
  matches(selector: string) { return selector === ':popover-open' && this.popoverOpen; }
  getBoundingClientRect() { return { width: this.width }; }
}
class BrowserInput extends BrowserElement { value = ''; }
const listeners = () => ({
  addEventListener: vi.fn<(event: string, listener: () => void, options?: unknown) => void>(),
  removeEventListener: vi.fn<(event: string, listener: () => void, options?: unknown) => void>(),
});
const injectors: Array<ReturnType<typeof Injector.create>> = [];
afterEach(() => {
  for (const injector of injectors.splice(0)) injector.destroy();
  render.effects.length = 0; render.callbacks.length = 0;
  vi.unstubAllGlobals(); vi.clearAllMocks();
});
function setup(withViewport = true) {
  const root = new BrowserElement(), panel = new BrowserElement(), input = new BrowserInput();
  root.popup = panel; root.children.add(input); root.children.add(panel);
  const viewport = listeners(), win = { ...listeners(), visualViewport: withViewport ? viewport : undefined };
  const elements = new Map<string, BrowserElement>();
  const doc = { ...listeners(), getElementById: vi.fn((id: string) => elements.get(id) ?? null) };
  vi.stubGlobal('Node', BrowserNode); vi.stubGlobal('HTMLElement', BrowserElement); vi.stubGlobal('HTMLInputElement', BrowserInput);
  vi.stubGlobal('window', win); vi.stubGlobal('document', doc);
  const injector = Injector.create({ providers: [{ provide: ElementRef, useValue: { nativeElement: root } }, { provide: SearchablePickerComponent, useFactory: () => new SearchablePickerComponent() }] });
  injectors.push(injector);
  const picker = injector.get(SearchablePickerComponent), options = signal<PickerOption[]>([{ id: 'a', label: 'Alice' }, { id: 'b', label: 'بشير' }]);
  const value = signal<string[]>([]), selected = signal<PickerOption[]>([]), multiple = signal(false), disabled = signal(false), loading = signal(false), hasMore = signal(false);
  Object.assign(picker, { label: signal('Assignee'), options, value, selected, multiple, disabled, loading, hasMore });
  elements.set(picker.id, input);
  const optionElements = options().map((_, index) => { const element = new BrowserElement(); elements.set(picker.id + '-option-' + index, element); root.children.add(element); return element; });
  return { picker, options, value, selected, multiple, disabled, loading, hasMore, root, panel, input, elements, optionElements, win, doc, viewport, injector,
    changed: vi.spyOn(picker.changed, 'emit'), searched: vi.spyOn(picker.searched, 'emit'), more: vi.spyOn(picker.more, 'emit'),
    destroy: () => { injectors.splice(injectors.indexOf(injector), 1); injector.destroy(); } };
}
function flushRender() { while (render.callbacks.length) render.callbacks.shift()!(); }
function keyboard(key: string) { return { key, preventDefault: vi.fn(), stopPropagation: vi.fn() }; }
async function press(picker: SearchablePickerComponent, key: string) { const event = keyboard(key); picker.key(event as unknown as KeyboardEvent); flushRender(); await Promise.resolve(); return event; }

describe('searchable picker public interaction state', () => {
  it('keeps selected order and retained names, prefers current labels and omits unresolved identities', () => {
    const f = setup(); f.value.set(['retained', 'a', 'missing']); f.selected.set([{ id: 'retained', label: 'Old project teammate' }, { id: 'a', label: 'Old Alice' }]);
    expect(f.picker.selectedOptions()).toEqual([{ id: 'retained', label: 'Old project teammate' }, { id: 'a', label: 'Alice' }]);
    expect(f.value()).toEqual(['retained', 'a', 'missing']); expect(f.selected()[1]?.label).toBe('Old Alice');
  });
  it('opens once only when enabled and positions a visible top-layer popup after render', () => {
    const f = setup(); f.disabled.set(true); f.picker.expand(); expect(f.picker.open()).toBe(false); expect(render.callbacks).toHaveLength(0);
    f.disabled.set(false); f.picker.expand(); f.picker.expand(); expect(f.picker.open()).toBe(true); expect(render.callbacks).toHaveLength(1); expect(f.panel.showPopover).not.toHaveBeenCalled();
    flushRender(); expect(f.panel.showPopover).toHaveBeenCalledOnce(); expect(positionAnchoredPopup).toHaveBeenCalledExactlyOnceWith(f.panel, f.input, 260);
  });
  it.each(['close', 'destroy'] as const)('does not resurrect a popup when %s happens before its queued render', action => {
    const f = setup(); f.picker.expand(); if (action === 'close') f.picker.close(); else f.destroy(); flushRender();
    expect(f.panel.showPopover).not.toHaveBeenCalled(); expect(f.win.addEventListener).not.toHaveBeenCalled(); expect(f.picker.open()).toBe(false);
  });
  it('registers and removes the same viewport listeners, repositions on resize and clears active state on close', () => {
    const f = setup(); f.picker.expand(); flushRender(); f.picker.active.set(1);
    const reposition = f.win.addEventListener.mock.calls[0]![1]; reposition(); f.doc.addEventListener.mock.calls[0]![1]();
    expect(positionAnchoredPopup).toHaveBeenCalledTimes(3);
    expect(f.viewport.addEventListener.mock.calls.map(args => args[0])).toEqual(['resize', 'scroll']);
    f.picker.close(); expect(f.panel.hidePopover).toHaveBeenCalledOnce(); expect(f.picker.active()).toBe(-1); expect(f.picker.open()).toBe(false);
    expect(f.win.removeEventListener).toHaveBeenCalledWith('resize', reposition); expect(f.doc.removeEventListener).toHaveBeenCalledWith('scroll', reposition, true);
    expect(f.viewport.removeEventListener.mock.calls.map(args => args[0])).toEqual(['resize', 'scroll']);
  });
  it('works without a visual viewport and safely closes when no panel remains', () => {
    const f = setup(false); f.input.width = 340; f.picker.expand(); flushRender(); expect(positionAnchoredPopup).toHaveBeenCalledWith(f.panel, f.input, 340);
    f.root.popup = null; expect(() => f.picker.close()).not.toThrow(); expect(f.picker.open()).toBe(false);
  });
  it('repositions after changed choices only while the popup and current input still exist', () => {
    const f = setup(); render.effects[0]!(); flushRender(); expect(positionAnchoredPopup).not.toHaveBeenCalled();
    f.picker.expand(); flushRender(); expect(positionAnchoredPopup).toHaveBeenCalledOnce();
    f.options.set([{ id: 'next', label: 'Next option' }]); render.effects[0]!(); flushRender(); expect(positionAnchoredPopup).toHaveBeenCalledTimes(2);
    f.elements.delete(f.picker.id); render.effects[0]!(); flushRender(); expect(positionAnchoredPopup).toHaveBeenCalledTimes(2);
    f.elements.set(f.picker.id, f.input); f.panel.popoverOpen = false; render.effects[0]!(); flushRender(); expect(positionAnchoredPopup).toHaveBeenCalledTimes(2);
  });
  it('ignores non-input search events and emits exact Arabic text while resetting keyboard selection', () => {
    const f = setup(); f.picker.search({ target: new BrowserElement() } as unknown as Event); expect(f.searched).not.toHaveBeenCalled();
    f.input.value = '  بشير 😀  '; f.picker.active.set(1); f.picker.search({ target: f.input } as unknown as Event);
    expect(f.picker.query()).toBe('  بشير 😀  '); expect(f.searched).toHaveBeenCalledExactlyOnceWith('  بشير 😀  '); expect(f.picker.active()).toBe(-1); expect(f.picker.open()).toBe(true);
  });
  it('blocks disabled/loading selection and restores focus without reopening after single selection', () => {
    const f = setup(); f.picker.expand(); flushRender(); f.disabled.set(true); f.picker.choose('a'); f.disabled.set(false); f.loading.set(true); f.picker.choose('a'); expect(f.changed).not.toHaveBeenCalled();
    f.loading.set(false); f.input.focus.mockImplementation(() => f.picker.expand()); f.picker.choose('a');
    expect(f.changed).toHaveBeenCalledExactlyOnceWith(['a']); expect(f.input.focus).toHaveBeenCalledOnce(); expect(f.picker.open()).toBe(false); expect(render.callbacks).toHaveLength(0); expect(f.value()).toEqual([]);
  });
  it('toggles multiple values without mutating parent state or closing the popup', () => {
    const f = setup(); f.multiple.set(true); f.value.set(['a']); f.picker.expand(); flushRender(); f.picker.choose('b');
    expect(f.changed).toHaveBeenLastCalledWith(['a', 'b']); expect(f.value()).toEqual(['a']); expect(f.picker.open()).toBe(true);
    f.value.set(['a', 'b']); f.picker.choose('a'); expect(f.changed).toHaveBeenLastCalledWith(['b']); expect(f.value()).toEqual(['a', 'b']); expect(f.panel.hidePopover).not.toHaveBeenCalled();
  });
  it('allows removing a retained chip only when editable and preserves the remaining identities', () => {
    const f = setup(); f.value.set(['retired', 'current']); f.disabled.set(true); f.picker.remove('retired'); expect(f.changed).not.toHaveBeenCalled();
    f.disabled.set(false); f.picker.remove('retired'); expect(f.changed).toHaveBeenCalledExactlyOnceWith(['current']); expect(f.value()).toEqual(['retired', 'current']);
  });
  it('focuses the search before asking its parent for more choices and blocks duplicate loading actions', () => {
    const f = setup(), order: string[] = []; f.input.focus.mockImplementation(() => order.push('focus')); f.more.mockImplementation(() => order.push('more'));
    f.disabled.set(true); f.picker.loadMore(); f.disabled.set(false); f.loading.set(true); f.picker.loadMore(); expect(order).toEqual([]);
    f.loading.set(false); f.picker.loadMore(); expect(order).toEqual(['focus', 'more']); expect(f.more).toHaveBeenCalledOnce();
    f.elements.delete(f.picker.id); f.picker.loadMore(); expect(order).toEqual(['focus', 'more', 'more']);
  });
  it('moves through actual choices with bounded arrow/Home/End selection and scrolls only the active option', async () => {
    const f = setup();
    for (const [key, index] of [['ArrowDown', 0], ['ArrowDown', 1], ['ArrowDown', 1], ['ArrowUp', 0], ['ArrowUp', 0], ['End', 1], ['Home', 0]] as const) {
      const event = await press(f.picker, key); expect(event.preventDefault).toHaveBeenCalledOnce(); expect(f.picker.active()).toBe(index); expect(f.optionElements[index]?.scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
    }
    const tab = await press(f.picker, 'Tab'); expect(tab.preventDefault).not.toHaveBeenCalled(); expect(f.picker.open()).toBe(true);
  });
  it('Enter chooses only an existing active option and never submits while open empty results are shown', async () => {
    const f = setup(); const closed = await press(f.picker, 'Enter'); expect(closed.preventDefault).not.toHaveBeenCalled();
    f.options.set([]); f.picker.expand(); flushRender(); const empty = await press(f.picker, 'Enter'); expect(empty.preventDefault).toHaveBeenCalledOnce(); expect(f.changed).not.toHaveBeenCalled();
    f.options.set([{ id: 'a', label: 'Alice' }]); await press(f.picker, 'Home'); const selected = await press(f.picker, 'Enter'); expect(selected.preventDefault).toHaveBeenCalledOnce(); expect(f.changed).toHaveBeenCalledExactlyOnceWith(['a']); expect(f.picker.open()).toBe(false);
  });
  it('Escape owns the open popup, stops bubbling and restores focus while a closed Escape remains untouched', async () => {
    const f = setup(); f.picker.expand(); flushRender(); const open = await press(f.picker, 'Escape'); expect(open.preventDefault).toHaveBeenCalledOnce(); expect(open.stopPropagation).toHaveBeenCalledOnce(); expect(f.input.focus).toHaveBeenCalledOnce(); expect(f.picker.open()).toBe(false);
    const closed = await press(f.picker, 'Escape'); expect(closed.preventDefault).not.toHaveBeenCalled(); expect(closed.stopPropagation).not.toHaveBeenCalled();
  });
  it('keeps internal focus and pointer movement open but closes for external destinations', () => {
    const f = setup(); f.picker.expand(); flushRender();
    f.picker.leave({ currentTarget: f.root, relatedTarget: f.input } as unknown as FocusEvent); expect(f.picker.open()).toBe(true);
    f.picker.outsidePointer({ target: f.panel } as unknown as PointerEvent); expect(f.picker.open()).toBe(true);
    f.picker.outsidePointer({ target: {} } as unknown as PointerEvent); expect(f.picker.open()).toBe(true);
    f.picker.outsidePointer({ target: new BrowserNode() } as unknown as PointerEvent); expect(f.picker.open()).toBe(false);
    f.picker.expand(); flushRender(); f.picker.leave({ currentTarget: f.root, relatedTarget: null } as unknown as FocusEvent); expect(f.picker.open()).toBe(false);
    f.picker.expand(); flushRender(); f.picker.leave({ currentTarget: f.root, relatedTarget: new BrowserNode() } as unknown as FocusEvent); expect(f.picker.open()).toBe(false);
  });
});
