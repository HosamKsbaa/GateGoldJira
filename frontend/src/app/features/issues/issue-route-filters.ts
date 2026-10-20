import type { ParamMap } from '@angular/router';
import type { IssueSummary } from '../../api/generated/types.gen';

export function issueFilterStatuses(status: string): IssueSummary['status'][] {
  if (status === 'open') return ['todo', 'in_progress', 'review'];
  if (/^(todo|in_progress|review|done)(:[0-9a-f-]{36})?$/.test(status)) return [status];
  return [];
}

export function issueRouteFilters(params: ParamMap) {
  const requestedStatus = params.get('status') ?? '';
  const requestedAssignee = params.get('assignee');
  const requestedBlocked = params.get('blocked') ?? '';
  return {
    view: ['backlog', 'archived'].includes(params.get('view') ?? '')
      ? params.get('view')!
      : 'active',
    sort: ['created', 'due', 'priority'].includes(params.get('sort') ?? '')
      ? params.get('sort')!
      : 'updated',
    query: params.get('query') ?? '',
    projectId: params.get('projectId') ?? '',
    parentId: params.get('parentId') ?? '',
    status:
      requestedStatus === 'open' || issueFilterStatuses(requestedStatus).length > 0
        ? requestedStatus
        : '',
    assignee:
      requestedAssignee === 'self' || requestedAssignee === 'me'
        ? 'self'
        : requestedAssignee === 'unassigned'
          ? 'unassigned'
          : /^[0-9a-f-]{36}$/.test(requestedAssignee ?? '')
            ? requestedAssignee!
            : 'any',
    blocked: requestedBlocked === 'true' || requestedBlocked === 'false' ? requestedBlocked : '',
  };
}
