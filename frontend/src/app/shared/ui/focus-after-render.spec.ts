import { type Injector } from '@angular/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { focusAfterRender } from './focus-after-render';
const render = vi.hoisted(() => ({ callbacks: [] as Array<() => void>, options: [] as unknown[] }));
vi.mock('@angular/core', async original => ({ ...await original<typeof import('@angular/core')>(), afterNextRender: (callback: () => void, options: unknown) => { render.callbacks.push(callback); render.options.push(options); } }));
afterEach(() => { render.callbacks.length = 0; render.options.length = 0; vi.unstubAllGlobals(); });
describe('deferred field focus follows the rendered target', () => {
  it('waits for render and resolves the current element instead of a stale replaced control', () => {
    const old = { focus: vi.fn() }, current = { focus: vi.fn() }, injector = {} as Injector;
    const lookup = vi.fn().mockReturnValue(old); vi.stubGlobal('document', { getElementById: lookup });
    focusAfterRender('due-date', injector); expect(lookup).not.toHaveBeenCalled(); expect(old.focus).not.toHaveBeenCalled();
    lookup.mockReturnValue(current); render.callbacks[0]!(); expect(lookup).toHaveBeenCalledWith('due-date'); expect(current.focus).toHaveBeenCalledOnce(); expect(old.focus).not.toHaveBeenCalled(); expect(render.options).toEqual([{ injector }]);
  });
  it('safely skips focus if route cancellation removed the target before rendering', () => {
    vi.stubGlobal('document', { getElementById: vi.fn().mockReturnValue(null) }); focusAfterRender('removed-field', {} as Injector); expect(() => render.callbacks[0]!()).not.toThrow();
  });
});
