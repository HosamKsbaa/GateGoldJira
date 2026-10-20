import type { IssueFilter } from '../../api/generated/types.gen';

/** Project scope belongs to the board; compare the actual temporary criteria. */
export function boardFilterKey(filter: IssueFilter): string {
  return JSON.stringify({
    query: filter.query?.trim() || undefined,
    typeIds: filter.typeIds?.length ? [...filter.typeIds].sort() : undefined,
    priorityIds: filter.priorityIds?.length ? [...filter.priorityIds].sort() : undefined,
    workflowIds: filter.workflowIds?.length ? [...filter.workflowIds].sort() : undefined,
    stageIds: filter.stageIds?.length ? [...filter.stageIds].sort() : undefined,
    statuses: filter.statuses?.length ? [...filter.statuses].sort() : undefined,
    priorities: filter.priorities?.length ? [...filter.priorities].sort() : undefined,
    types: filter.types?.length ? [...filter.types].sort() : undefined,
    assignee: filter.assignee?.kind === 'any' ? undefined : filter.assignee,
    blocked: filter.blocked,
    overdue: filter.overdue,
    dueFrom: filter.dueFrom,
    dueTo: filter.dueTo,
    labelIds: filter.labelIds?.length ? [...filter.labelIds].sort() : undefined,
    parentId: filter.parentId,
    prerequisiteFor: filter.prerequisiteFor,
    archived: filter.archived || undefined,
    backlog: filter.backlog,
    sort: filter.sort,
  });
}
