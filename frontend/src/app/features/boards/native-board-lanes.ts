import type { NativeBoardColumn } from './modern-boards.store';
import { boardEpicMap, issueLaneId, type BoardGrouping } from './board-lanes';
export interface NativeLaneCell {
  column: NativeBoardColumn;
  target: NativeBoardColumn & { laneId: string };
}
export interface NativeBoardLane {
  id: string;
  name: string;
  count: number;
  cells: NativeLaneCell[];
}
export function nativeBoardLanes(
  columns: NativeBoardColumn[],
  grouping: BoardGrouping,
): NativeBoardLane[] {
  const epics = boardEpicMap(columns),
    groups = new Map<string, string>();
  if (grouping === 'none') groups.set('all', 'All issues');
  else
    for (const column of columns)
      for (const issue of column.items) {
        const id = issueLaneId(issue, grouping, epics);
        groups.set(
          id,
          grouping === 'assignee'
            ? (issue.assignee?.displayName ?? 'Unassigned')
            : (epics.get(issue.id)?.epicName ?? 'No epic'),
        );
      }
  const sorted = [...groups.entries()].sort(([a, left], [b, right]) => {
    if (a === 'unassigned' || a === 'no-epic') return 1;
    if (b === 'unassigned' || b === 'no-epic') return -1;
    return left.localeCompare(right) || a.localeCompare(b);
  });
  return sorted.map(([id, name]) => {
    const cells = columns.map(column => ({
      column,
      target: {
        ...column,
        laneId: id,
        items: column.items.filter(issue => issueLaneId(issue, grouping, epics) === id),
      },
    }));
    return {
      id,
      name,
      cells,
      count: cells.reduce((total, cell) => total + cell.target.items.length, 0),
    };
  });
}
