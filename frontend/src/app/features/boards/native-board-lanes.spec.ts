import { describe, it, expect } from 'vitest';
import type { ModernIssueSummary } from '../../api/generated/types.gen';
import type { NativeBoardColumn } from './modern-boards.store';
import { nativeBoardLanes } from './native-board-lanes';
import { boardFilterKey } from './board-filter-key';
function issue(number: number): ModernIssueSummary {
  return {
    id: String(number),
    projectId: 'project',
    number: String(number),
    key: 'GG-' + number,
    title: 'Work ' + number,
    type: { id: 'type', key: 'story', name: 'Story', behavior: 'standard', retired: false },
    priority: {
      id: 'priority',
      key: 'urgent',
      name: 'Urgent',
      sortOrder: '9007199254740993',
      retired: false,
    },
    workflow: { id: 'flow', name: 'Delivery', revision: '2', retired: false },
    stage: {
      id: 'stage',
      name: 'QA',
      category: 'review',
      position: '9007199254740993',
      initial: false,
      acceptsEntries: true,
      retired: false,
    },
    assignee: number % 2 ? { id: 'a', displayName: 'بشير' } : null,
    dueDate: null,
    overdue: false,
    labels: [],
    blocked: false,
    unfinishedBlockerCount: 0,
    parent: null,
    subtaskProgress: { total: 0, done: 0 },
    revision: '1',
    archived: false,
    backlog: false,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };
}
function column(items: ModernIssueSummary[]): NativeBoardColumn {
  return {
    summary: {
      id: 'column',
      name: 'Grouped QA',
      position: '1',
      stages: [],
      wipLimit: 2,
      wipMode: 'block',
      savedMatchCount: 100000,
      visibleMatchCount: 5000,
      limitExceeded: true,
      orderRevision: '9007199254740993',
    },
    items,
    epics: [],
    cursor: 'next',
    loaded: true,
    loading: false,
    skipped: 100,
  };
}
describe('native lane windows retain identifiers and server capacity', () => {
  it('partitions once and preserves issue stage, order, precision and full counts', () => {
    const original = column(Array.from({ length: 100 }, (_, index) => issue(index)));
    const before = structuredClone(original);
    const lanes = nativeBoardLanes([original], 'assignee');
    const ids = lanes.flatMap(lane => lane.cells[0]?.target.items.map(item => item.id) ?? []);
    expect(ids).toHaveLength(100);
    expect(new Set(ids).size).toBe(100);
    expect(lanes.at(-1)?.name).toBe('Unassigned');
    for (const lane of lanes) {
      expect(lane.cells[0]?.column.summary).toBe(original.summary);
      expect(lane.cells[0]?.target.summary.savedMatchCount).toBe(100000);
      expect(lane.cells[0]?.target.items.every(item => item.stage.id === 'stage')).toBe(true);
    }
    expect(original).toEqual(before);
  });
  it('uses scoped returned-page epic metadata without replacing board columns', () => {
    const original = column([issue(1), issue(2)]);
    original.epics = [{ issueId: '1', epicId: 'epic', epicName: 'الإطلاق' }];
    const lanes = nativeBoardLanes([original], 'epic');
    expect(lanes.map(lane => lane.name)).toEqual(['الإطلاق', 'No epic']);
    expect(lanes[0]?.cells[0]?.target.items.map(item => item.id)).toEqual(['1']);
    expect(lanes[1]?.cells[0]?.target.items.map(item => item.id)).toEqual(['2']);
    expect(lanes[0]?.cells[0]?.target.summary.id).toBe('column');
  });
  it('distinguishes canonical quick-filter IDs and normalizes their ordering', () => {
    expect(boardFilterKey({ priorityIds: ['urgent'] })).not.toBe(
      boardFilterKey({ priorityIds: ['high'] }),
    );
    expect(boardFilterKey({ stageIds: ['a', 'b'] })).toBe(boardFilterKey({ stageIds: ['b', 'a'] }));
    expect(boardFilterKey({ workflowIds: ['one'] })).not.toBe(
      boardFilterKey({ workflowIds: ['two'] }),
    );
  });
});
