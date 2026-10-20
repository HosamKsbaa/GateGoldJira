import { describe, expect, it } from 'vitest';
import type { IssueSummary } from '../../api/generated/types.gen';
import { type BoardColumn, boardLanes, boardEpicMap, issueLaneId } from './board-lanes';
import { boardFilterKey } from './board-filter-key';

function issue(number: number, assignee: IssueSummary['assignee'] = null): IssueSummary {
  return {
    id: String(number),
    projectId: 'project',
    key: 'GG-' + number,
    number: String(number),
    title: 'Issue ' + number,
    type: 'task',
    priority: 'medium',
    status: 'todo',
    assignee,
    dueDate: null,
    overdue: false,
    labels: [],
    blocked: false,
    unfinishedBlockerCount: 0,
    parent: null,
    subtaskProgress: { total: 0, done: 0 },
    revision: '1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}
function column(items: IssueSummary[]): BoardColumn {
  return {
    summary: {
      status: 'todo',
      orderRevision: '4',
      savedMatchCount: 180,
      visibleMatchCount: 120,
      warningLimit: 50,
      limitExceeded: true,
    },
    items,
    epics: [],
    cursor: 'next',
    skipped: 20,
    loading: false,
  };
}
describe('board groups preserve the authoritative shared column window', () => {
  it('partitions one 100-card window without multiplying pages, changing order or counts', () => {
    const members = [
      { id: 'a', displayName: 'Alice' },
      { id: 'b', displayName: 'بشير' },
    ];
    const original = column(
      Array.from({ length: 100 }, (_, number) =>
        issue(number, number % 3 === 0 ? null : members[number % 2]!),
      ),
    );
    const snapshot = structuredClone(original);
    const lanes = boardLanes([original], 'assignee');
    expect(lanes).toHaveLength(3);
    const ids = lanes.flatMap(lane => lane.cells[0]!.target.items.map(item => item.id));
    expect(ids).toHaveLength(100);
    expect(new Set(ids).size).toBe(100);
    for (const lane of lanes) {
      const items = lane.cells[0]!.target.items;
      expect(items.map(item => Number(item.number))).toEqual(
        items.map(item => Number(item.number)).sort((left, right) => left - right),
      );
      expect(lane.cells[0]!.column.summary).toBe(original.summary);
    }
    expect(lanes.at(-1)?.name).toBe('Unassigned');
    expect(original).toEqual(snapshot);
  });
  it('uses returned-card epic metadata and keeps a No epic row and every workflow stage', () => {
    const todo = column([issue(1), issue(2), issue(3)]);
    todo.epics = [
      { issueId: '1', epicId: 'launch', epicName: 'الإطلاق' },
      { issueId: '3', epicId: 'launch', epicName: 'الإطلاق' },
    ];
    const review: BoardColumn = { ...column([]), summary: { ...todo.summary, status: 'review' } };
    const lanes = boardLanes([todo, review], 'epic');
    expect(lanes.map(lane => lane.name)).toEqual(['الإطلاق', 'No epic']);
    expect(lanes[0]?.cells.map(cell => cell.target.items.map(item => item.id))).toEqual([
      ['1', '3'],
      [],
    ]);
    expect(issueLaneId(todo.items[1]!, 'epic', boardEpicMap([todo]))).toBe('no-epic');
    expect(boardLanes([todo], 'none')[0]?.cells[0]?.target.items).toEqual(todo.items);
  });
  it('compares reusable personal criteria independently of project scope and array ordering', () => {
    expect(
      boardFilterKey({
        query: '  urgent ',
        projectIds: ['project'],
        priorities: ['high', 'low'],
        assignee: { kind: 'any' },
      }),
    ).toBe(boardFilterKey({ priorities: ['low', 'high'], query: 'urgent' }));
    expect(boardFilterKey({ blocked: false })).not.toBe(boardFilterKey({}));
    expect(boardFilterKey({ assignee: { kind: 'self' } })).not.toBe(
      boardFilterKey({ assignee: { kind: 'unassigned' } }),
    );
  });
});
