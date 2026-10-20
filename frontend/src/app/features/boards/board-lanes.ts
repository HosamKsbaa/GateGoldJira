import type { BoardCardEpic, BoardView, IssueSummary } from '../../api/generated/types.gen';
import type { Status } from './boards.api';

export type BoardColumn = {
  summary: BoardView['columns'][number];
  items: IssueSummary[];
  epics: BoardCardEpic[];
  cursor: string | null;
  loading: boolean;
  skipped: number;
};
export type BoardGrouping = 'none' | 'assignee' | 'epic';
export interface BoardDropTarget {
  status: Status;
  laneId: string;
  items: IssueSummary[];
}
export interface BoardLaneCell {
  column: BoardColumn;
  target: BoardDropTarget;
}
export interface BoardLane {
  id: string;
  name: string;
  count: number;
  cells: BoardLaneCell[];
}
export function boardEpicMap(columns: { epics: BoardCardEpic[] }[]): Map<string, BoardCardEpic> {
  return new Map(columns.flatMap(column => column.epics).map(epic => [epic.issueId, epic]));
}
export function issueLaneId(
  issue: Pick<IssueSummary, 'id' | 'assignee'>,
  grouping: BoardGrouping,
  epics: Map<string, BoardCardEpic>,
): string {
  if (grouping === 'assignee')
    return issue.assignee ? 'assignee-' + issue.assignee.id : 'unassigned';
  if (grouping === 'epic')
    return epics.has(issue.id) ? 'epic-' + epics.get(issue.id)!.epicId : 'no-epic';
  return 'all';
}
/** Partitions the existing column windows; grouping never requests or duplicates cards. */
export function boardLanes(columns: BoardColumn[], grouping: BoardGrouping): BoardLane[] {
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
  const entries = [...groups.entries()].sort(([leftId, left], [rightId, right]) => {
    if (leftId === 'unassigned' || leftId === 'no-epic') return 1;
    if (rightId === 'unassigned' || rightId === 'no-epic') return -1;
    return left.localeCompare(right) || leftId.localeCompare(rightId);
  });
  return entries.map(([id, name]) => {
    const cells = columns.map(column => ({
      column,
      target: {
        status: column.summary.status,
        laneId: id,
        items: column.items.filter(issue => issueLaneId(issue, grouping, epics) === id),
      },
    }));
    return {
      id,
      name,
      cells,
      count: cells.reduce((count, cell) => count + cell.target.items.length, 0),
    };
  });
}
