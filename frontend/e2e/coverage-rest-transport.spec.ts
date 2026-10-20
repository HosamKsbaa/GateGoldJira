import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { restPlan } from './support/coverage-rest';

test('HTTP query planning substitutes scoped IDs and flattens only query pagination', () => {
  const plan = restPlan('list_comments', { issueId: 'issue/with space', page: { limit: 2, cursor: 'a+b/=opaque' } });
  const url = new URL(plan.url);
  expect(plan.method).toBe('GET');
  expect(url.pathname).toBe('/api/v1/issues/issue%2Fwith%20space/comments');
  expect(url.searchParams.get('limit')).toBe('2');
  expect(url.searchParams.get('cursor')).toBe('a+b/=opaque');
  expect(url.searchParams.has('page')).toBe(false);
  expect(plan.body).toBeUndefined();
});

test('HTTP JSON planning preserves nested search pages and unknown validation fields', () => {
  const filters = { projectIds: ['scope'], query: 'العربية', unknownFilter: 'must reach service' };
  const page = { limit: 2, cursor: 'opaque cursor', deliberatelyUnknownPageField: 9 };
  const plan = restPlan('search_issues_v2', { filters, page, unrecognizedBodyField: { exact: true } });
  expect(plan.method).toBe('POST');
  expect(new URL(plan.url).search).toBe('');
  expect(plan.body).toEqual({ filters, page, unrecognizedBodyField: { exact: true } });
  expect(filters.unknownFilter).toBe('must reach service');
});

test('HTTP mutation planning moves retry ownership to the declared header and keeps invalid extra body properties', () => {
  const reference = crypto.randomUUID(), args = { projectId: 'project', title: 'Native transport', retryReference: reference, unknownBodyField: 'reject me' };
  const plan = restPlan('create_issue_v2', args);
  expect(plan.headers['Idempotency-Key']).toBe(reference);
  expect(plan.body).toEqual({ title: 'Native transport', unknownBodyField: 'reject me' });
  expect(args).toEqual({ projectId: 'project', title: 'Native transport', retryReference: reference, unknownBodyField: 'reject me' });
});

test('HTTP planning rejects unsupported legacy multipart adapters instead of crediting a different transport', () => {
  expect(() => restPlan('upload_picture', { issueId: 'picture-scope' })).toThrow('explicit binary adapter');
  expect(() => restPlan('upload_attachment', { issueId: 'file-scope' })).toThrow('explicit binary adapter');
});
