import '@angular/compiler';
import { signal } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import type { AgingIssue, KanbanReport } from '../../api/generated/types.gen';
import { KanbanReportPage } from './kanban-report.page';
import type { PlanningApi } from './planning.api';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  return { promise: new Promise<T>((done, failed) => { resolve = done; reject = failed; }), resolve: (value: T) => resolve(value), reject: (error: unknown) => reject(error) };
}
function work(id: string): AgingIssue {
  return { id, key: 'GG-' + id, title: 'Aging ' + id, status: 'review:historical-stage', stageName: 'قبول الفريق', assignee: null, cycleAgeDays: null, workAgeDays: 2.5, startedAt: null, unfinishedBlockers: 0 };
}
function report(ids = ['first'], cursor: string | null = null): KanbanReport {
  return { projectId: 'project', from: '2026-09-01', through: '2026-09-30', completedCycles: 4, measuredCycles: 3, averageCycleDays: 2.5, blockedCount: 1, activeCount: 9, days: [{ day: '2026-09-10', completedCycles: 1 }, { day: '2026-09-11', completedCycles: 3 }], snapshotAt: '2026-10-01T00:30:00Z', definition: 'Recorded completion cycles', work: { items: ids.map(work), nextCursor: cursor, totalMatching: 9 } };
}
function setup() {
  const projectId = signal('project'), fetch = vi.fn<PlanningApi['report']>();
  // Exercise the actual pagination/generation methods without creating route
  // resources or a DOM. This harness does not count constructor/template proof.
  const page: KanbanReportPage = Object.create(KanbanReportPage.prototype);
  Object.assign(page, {
    api: { report: fetch }, projectId, loadGeneration: 0, report: signal<KanbanReport | null>(null), loading: signal(false), error: signal(''),
    dates: new FormGroup({ from: new FormControl('2026-09-01', { nonNullable: true, validators: [Validators.required] }), through: new FormControl('2026-09-30', { nonNullable: true, validators: [Validators.required] }) }),
  });
  return { page, fetch, projectId };
}

describe('Kanban report pagination preserves its loaded snapshot and request ownership', () => {
  it('does not send invalid dates or erase the last useful report', async () => {
    const f = setup(), previous = report(); f.page.report.set(previous); f.page.error.set('Keep the current explanation'); f.page.dates.controls.from.setValue('');
    await f.page.load(false);
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.page.report()).toBe(previous); expect(f.page.error()).toBe('Keep the current explanation'); expect(f.page.loading()).toBe(false);
  });

  it('rejects duplicate append requests while a report request is in flight', async () => {
    const f = setup(), pending = deferred<KanbanReport>(); f.page.report.set(report(['first'], 'page-2')); f.fetch.mockReturnValue(pending.promise);
    const initial = f.page.load(false); await f.page.load(true);
    expect(f.fetch).toHaveBeenCalledTimes(1); expect(f.page.loading()).toBe(true);
    pending.resolve(report()); await initial; expect(f.page.loading()).toBe(false);
  });

  it('appends using the accepted date window and cursor even after the range inputs change', async () => {
    const f = setup(); f.page.report.set(report(['first'], 'accepted-cursor'));
    f.page.dates.setValue({ from: '2026-10-01', through: '2026-10-20' });
    const next = { ...report(['second']), activeCount: 11, snapshotAt: '2026-10-01T00:31:00Z' }; f.fetch.mockResolvedValue(next);
    await f.page.load(true);
    expect(f.fetch).toHaveBeenCalledExactlyOnceWith('project', '2026-09-01', '2026-09-30', 'accepted-cursor');
    expect(f.page.report()?.work.items.map(item => item.id)).toEqual(['first','second']);
    expect(f.page.report()).toMatchObject({ activeCount: 11, snapshotAt: next.snapshotAt, work: { nextCursor: null, totalMatching: 9 } });
    expect(f.page.dates.getRawValue()).toEqual({ from: '2026-10-01', through: '2026-10-20' });
  });

  it('replaces old rows and starts a new cursor scope after applying a new range', async () => {
    const f = setup(); f.page.report.set(report(['outdated'], 'old-cursor')); f.page.error.set('Previous failure');
    f.page.dates.setValue({ from: '2026-10-01', through: '2026-10-20' });
    f.fetch.mockResolvedValue({ ...report(['new-first'], 'new-cursor'), from: '2026-10-01', through: '2026-10-20' });
    await f.page.load(false);
    expect(f.fetch).toHaveBeenCalledExactlyOnceWith('project', '2026-10-01', '2026-10-20', undefined);
    expect(f.page.report()?.work.items.map(item => item.id)).toEqual(['new-first']); expect(f.page.report()?.work.nextCursor).toBe('new-cursor');
    expect(f.page.error()).toBe(''); expect(f.page.loading()).toBe(false);
  });

  it('does not let an older successful response overwrite a later range', async () => {
    const f = setup(), first = deferred<KanbanReport>(), second = deferred<KanbanReport>(); f.fetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const oldRead = f.page.load(false); f.page.dates.controls.from.setValue('2026-09-10'); const currentRead = f.page.load(false);
    second.resolve({ ...report(['current']), from: '2026-09-10' }); await currentRead;
    first.resolve(report(['stale'])); await oldRead;
    expect(f.page.report()?.work.items.map(item => item.id)).toEqual(['current']); expect(f.page.report()?.from).toBe('2026-09-10'); expect(f.page.error()).toBe('');
  });

  it('an older rejected request cannot release a newer spinner or expose its stale error', async () => {
    const f = setup(), first = deferred<KanbanReport>(), second = deferred<KanbanReport>(); f.fetch.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const oldRead = f.page.load(false), currentRead = f.page.load(false);
    first.reject(new Error('Old range failure')); await oldRead;
    expect(f.page.loading()).toBe(true); expect(f.page.error()).toBe(''); expect(f.page.report()).toBeNull();
    second.resolve(report(['current'])); await currentRead;
    expect(f.page.loading()).toBe(false); expect(f.page.report()?.work.items[0]?.id).toBe('current');
  });

  it('does not publish a late response whose project no longer owns the page', async () => {
    const f = setup(), pending = deferred<KanbanReport>(); f.fetch.mockReturnValue(pending.promise);
    const reading = f.page.load(false); f.projectId.set('other-project'); pending.resolve(report(['private-old-project'])); await reading;
    expect(f.page.report()).toBeNull(); expect(f.page.error()).toBe(''); expect(f.fetch.mock.calls[0]?.[0]).toBe('project');
  });

  it.each([new Error('Choose an inclusive range up to 366 days.'), 'unexpected transport value'])('keeps accepted rows after a current request fails with %s', async error => {
    const f = setup(), accepted = report(['useful']); f.page.report.set(accepted); f.fetch.mockRejectedValue(error);
    await f.page.load(false);
    expect(f.page.report()).toBe(accepted); expect(f.page.loading()).toBe(false);
    expect(f.page.error()).toBe(error instanceof Error ? error.message : 'The report could not be loaded.');
  });

  it('can start a first page through the append entry point without fabricating a cursor', async () => {
    const f = setup(); f.fetch.mockResolvedValue(report()); await f.page.load(true);
    expect(f.fetch).toHaveBeenCalledExactlyOnceWith('project', '2026-09-01', '2026-09-30', undefined);
    expect(f.page.report()?.work.items.map(item => item.id)).toEqual(['first']);
  });
});

describe('report presentation keeps recorded stage names and UTC semantics', () => {
  it('uses the actual custom stage name ahead of a coarse legacy category', () => {
    const { page } = setup(); expect(page.stageLabel('review:old-id', 'قبول الفريق')).toBe('قبول الفريق');
    expect(page.stageLabel('todo:retained-id')).toBe('To do'); expect(page.stageLabel('done')).toBe('Done'); expect(page.stageLabel('unknown:retained-id')).toBe('In progress');
  });
  it('normalizes each daily bar against the loaded report maximum rather than its position', () => {
    const { page } = setup(); expect(page.barWidth(0)).toBe(0); expect(page.barWidth(1)).toBe(100);
    page.report.set(report()); expect(page.barWidth(3)).toBe(100); expect(page.barWidth(1)).toBeCloseTo(100 / 3);
    page.report.set({ ...report(), days: [] }); expect(page.barWidth(0)).toBe(0);
  });
  it('formats snapshot timestamps in explicit UTC and rounds durations to one decimal', () => {
    const { page } = setup(); expect(page.snapshot('2026-10-01T23:30:00-05:00')).toBe('Oct 2, 2026, 4:30 AM UTC'); expect(page.number(1.26)).toBe('1.3'); expect(page.number(12345.04)).toBe('12,345');
  });
});
