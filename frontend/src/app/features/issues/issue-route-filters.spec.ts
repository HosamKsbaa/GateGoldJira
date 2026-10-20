import '@angular/compiler';
import { convertToParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { issueRouteFilters, issueFilterStatuses } from './issue-route-filters';

describe('workspace links to issue filters', () => {
  it('opens the selected project, subtasks, review and blocked work', () => {
    expect(
      issueRouteFilters(
        convertToParamMap({
          projectId: 'project',
          parentId: 'parent',
          status: 'review',
          blocked: 'true',
          assignee: 'me',
        }),
      ),
    ).toEqual({
      view: 'active',
      sort: 'updated',
      query: '',
      projectId: 'project',
      parentId: 'parent',
      status: 'review',
      blocked: 'true',
      assignee: 'self',
    });
  });
  it('accepts the API self assignment name and preserves explicit unblocked work', () => {
    expect(
      issueRouteFilters(convertToParamMap({ assignee: 'self', blocked: 'false' })),
    ).toMatchObject({ assignee: 'self', blocked: 'false' });
    expect(issueRouteFilters(convertToParamMap({ assignee: 'unassigned' }))).toMatchObject({
      assignee: 'unassigned',
    });
  });
  it('restores custom stages, teammate and backlog routes', () => {
    const id = '10000000-0000-4000-8000-000000000002';
    expect(
      issueRouteFilters(
        convertToParamMap({
          status: 'review:' + id,
          assignee: id,
          view: 'backlog',
          sort: 'priority',
        }),
      ),
    ).toMatchObject({ status: 'review:' + id, assignee: id, view: 'backlog', sort: 'priority' });
  });
  it('keeps open dashboard totals aligned with the issue search', () => {
    const filters = issueRouteFilters(convertToParamMap({ status: 'open', assignee: 'self' }));
    expect(issueFilterStatuses(filters.status)).toEqual(['todo', 'in_progress', 'review']);
    expect(issueFilterStatuses('done')).toEqual(['done']);
  });
  it('preserves global search text across navigation into the issues page', () => {
    expect(issueRouteFilters(convertToParamMap({ query: 'Build API' })).query).toBe('Build API');
    expect(issueRouteFilters(convertToParamMap({ query: 'بحث عربي DEMO-2' })).query).toBe(
      'بحث عربي DEMO-2',
    );
  });
  it('ignores unsupported query values instead of sending invalid enums to the API', () => {
    expect(
      issueRouteFilters(
        convertToParamMap({ status: 'closed', blocked: 'anything', assignee: 'someone' }),
      ),
    ).toEqual({
      view: 'active',
      sort: 'updated',
      query: '',
      projectId: '',
      parentId: '',
      status: '',
      blocked: '',
      assignee: 'any',
    });
  });
});
