import { expect, type APIRequestContext } from '@playwright/test';
import { test } from './support/browser-test';
import type { FieldAssignment, FieldDefinition, LabelView, TransitionPolicy } from '../src/app/api/generated/types.gen';
import {
  zSavedCustomFieldsView, zPageTransitionView, zCustomFieldsView, zSavedBackfillFieldResult, zPageActivityView,
  zSavedLabelView,
  zPageLabelView,
  zSavedFieldOptionSaved,
  zConfigurationView, zModernIssueView, zPageIssueTransitionOption, zSavedTransitionPolicyView, zApprovalContextView, zSavedApprovalContextView,
} from '../src/app/api/generated/zod.gen';
import { modernEditable } from '../src/app/features/issues/issue-model';
import { apiOrigin, localFixturesAvailable, signIn, fillCredentials } from './support/session';
import { useCase } from './support/use-case';
const restCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'rest');
const webCase = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
import {
  coverageCreate, coverageDefinition, coverageFields, coverageHeaders, coverageProject, coverageRead, coverageIneligiblePeople, coverageStoredChanges,
} from './support/coverage-issues';

test.skip(!localFixturesAvailable, 'Requires isolated real Go/PostgreSQL fixtures.');
test.use({ trace: 'off' });
test.setTimeout(90_000);
const memberId = '10000000-0000-4000-8000-000000000002';
const viewerId = '10000000-0000-4000-8000-000000000003';

test('typed custom values create, edit and clear all five kinds without lossy conversion', async ({ request }) => {
  const projectId = await coverageProject(request);
  const definitions: FieldDefinition[] = [];
  for (const kind of ['text', 'number', 'date', 'user', 'choice'] as const)
    definitions.push(await coverageDefinition(request, projectId, { kind }));
  const choice = definitions.find(d => d.kind === 'choice');
  if (!choice) throw new Error('Missing choice definition');
  const cfgResponse = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/configuration`, { headers: await coverageHeaders('owner') });
  expect(cfgResponse.status()).toBe(200);
  let cfg = zConfigurationView.parse(await cfgResponse.json());
  const optionIds: string[] = [];
  for (const name of ['Alpha', 'Beta']) {
    const id = crypto.randomUUID();
    const response = await request.put(`${apiOrigin}/api/v2/projects/${projectId}/fields/${choice.id}/options/${id}`, {
      headers: await coverageHeaders('owner'),
      data: { expectedRevision: cfg.revision, name, position: String(optionIds.length + 1), retired: false },
    });
    expect(response.status()).toBe(201);
    const saved = zSavedFieldOptionSaved.parse(await response.json()).result;
    cfg = saved.configuration;
    optionIds.push(id);
  }
  const cases: { kind: FieldDefinition['kind']; ids: [string, string, string]; initial: FieldAssignment['value']; next: FieldAssignment['value'] }[] = [
    { kind: 'text', ids: ['UC-FLD-0006', 'UC-FLD-0007', 'UC-FLD-0008'], initial: { kind: 'text', text: 'العربية\nsecond paragraph' }, next: { kind: 'text', text: 'Updated exact text' } },
    { kind: 'number', ids: ['UC-FLD-0009', 'UC-FLD-0010', 'UC-FLD-0011'], initial: { kind: 'number', number: '9007199254740993.123456789' }, next: { kind: 'number', number: '-123.5' } },
    { kind: 'date', ids: ['UC-FLD-0012', 'UC-FLD-0013', 'UC-FLD-0014'], initial: { kind: 'date', date: '2028-02-29' }, next: { kind: 'date', date: '2028-03-01' } },
    { kind: 'choice', ids: ['UC-FLD-0015', 'UC-FLD-0016', 'UC-FLD-0017'], initial: { kind: 'choice', optionId: optionIds[0]! }, next: { kind: 'choice', optionId: optionIds[1]! } },
    { kind: 'user', ids: ['UC-FLD-0018', 'UC-FLD-0019', 'UC-FLD-0020'], initial: { kind: 'user', userId: memberId }, next: { kind: 'user', userId: viewerId } },
  ];
  for (const scenario of cases) {
    const field = definitions.find(d => d.kind === scenario.kind)!;
    const issue = await restCase(scenario.ids[0], async () => {
      const created = await coverageCreate(request, projectId, { fieldValues: [{ fieldId: field.id, value: scenario.initial }] });
      expect((await coverageFields(request, created.summary.id)).values).toContainEqual({ fieldId: field.id, value: scenario.initial });
      return created;
    });
    await restCase(scenario.ids[1], async () => {
      const response = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, {
        headers: await coverageHeaders(), data: { expectedRevision: issue.summary.revision, values: [{ fieldId: field.id, value: scenario.next }] },
      });
      expect(response.status()).toBe(200);
      expect((await coverageFields(request, issue.summary.id)).values).toContainEqual({ fieldId: field.id, value: scenario.next });
    });
    await restCase(scenario.ids[2], async () => {
      const current = await coverageRead(request, issue.summary.id);
      const response = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, {
        headers: await coverageHeaders(), data: { expectedRevision: current.summary.revision, values: [{ fieldId: field.id, value: null }] },
      });
      expect(response.status()).toBe(200);
      expect((await coverageFields(request, issue.summary.id)).values.some(v => v.fieldId === field.id)).toBe(false);
    });
  }
});

test('custom numeric and malformed-value boundaries reject writes atomically', async ({ request }) => {
  const projectId = await coverageProject(request);
  const number = await coverageDefinition(request, projectId, { kind: 'number' });
  const text = await coverageDefinition(request, projectId, { kind: 'text' });
  const date = await coverageDefinition(request, projectId, { kind: 'date' });
  const marker = await coverageDefinition(request, projectId, { kind: 'text' });
  const issue = await coverageCreate(request, projectId);
  const invalid: { id: string; fieldId: string; value: unknown }[] = [
    { id: 'UC-FLD-0024', fieldId: number.id, value: { kind: 'number', number: 123 } },
    { id: 'UC-FLD-0025', fieldId: number.id, value: { kind: 'number', number: '1'.repeat(29) } },
    { id: 'UC-FLD-0026', fieldId: number.id, value: { kind: 'number', number: '0.12345678901' } },
    { id: 'UC-FLD-0027', fieldId: number.id, value: { kind: 'number', number: '1e3' } },
    { id: 'UC-FLD-0075', fieldId: number.id, value: { kind: 'number', number: '--1' } },
    { id: 'UC-FLD-0029', fieldId: text.id, value: { kind: 'text', text: 'x'.repeat(5001) } },
    { id: 'UC-FLD-0030', fieldId: date.id, value: { kind: 'date', date: '2027-02-29' } },
    { id: 'UC-FLD-0031', fieldId: text.id, value: { kind: 'number', number: '1' } },
    { id: 'UC-FLD-0032', fieldId: text.id, value: { kind: 'text', text: 'bad', number: '1' } },
    { id: 'UC-FLD-0033', fieldId: text.id, value: { kind: 'boolean', boolean: true } },
    { id: 'UC-FLD-0067', fieldId: '00000000-0000-0000-0000-000000000000', value: null },
  ];
  for (const scenario of invalid) await restCase(scenario.id, async () => {
    const response = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, {
      headers: await coverageHeaders(), data: { expectedRevision: issue.summary.revision, values: [{ fieldId: marker.id, value: { kind: 'text', text: 'must roll back' } }, { fieldId: scenario.fieldId, value: scenario.value }] },
    });
    expect(response.status()).toBe(422);
    const after = await coverageFields(request, issue.summary.id);
    expect(after.revision).toBe(issue.summary.revision);
    expect(after.values).toEqual([]);
  });
  for (const scenario of [
    { id: 'UC-FLD-0068', values: [{ fieldId: text.id, value: null }, { fieldId: text.id, value: null }] },
    { id: 'UC-FLD-0069', values: [] },
    { id: 'UC-FLD-0070', values: Array.from({ length: 101 }, () => ({ fieldId: crypto.randomUUID(), value: null })) },
  ]) await restCase(scenario.id, async () => {
    const response = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, {
      headers: await coverageHeaders(), data: { expectedRevision: issue.summary.revision, values: scenario.values },
    });
    expect(response.status()).toBe(422);
    expect((await coverageRead(request, issue.summary.id)).summary.revision).toBe(issue.summary.revision);
  });
  for (const scenario of [
    { id: 'UC-FLD-0021', number: '9999999999999999999999999999.1234567890', expected: '9999999999999999999999999999.123456789' },
    { id: 'UC-FLD-0022', number: '123.4500000000', expected: '123.45' },
    { id: 'UC-FLD-0023', number: '-0.0000000000', expected: '0' },
  ]) await restCase(scenario.id, async () => {
    const current = await coverageRead(request, issue.summary.id);
    const response = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, {
      headers: await coverageHeaders(), data: { expectedRevision: current.summary.revision, values: [{ fieldId: number.id, value: { kind: 'number', number: scenario.number } }] },
    });
    expect(response.status()).toBe(200);
    expect((await coverageFields(request, issue.summary.id)).values).toContainEqual({ fieldId: number.id, value: { kind: 'number', number: scenario.expected } });
  });
});

test('field defaults distinguish omitted, explicit override and explicit null', async ({ request, page }) => {
  const projectId = await coverageProject(request);
  const field = await coverageDefinition(request, projectId, { kind: 'text', name: 'Acceptance default', defaultValue: { kind: 'text', text: 'Default acceptance' } });
  await webCase('UC-FLD-0002', async () => {
    await signIn(page, 'member', '/issues?projectId=' + projectId + '&create=true', /^Issues$/);
    await expect(page.getByRole('dialog', { name: 'Create issue', exact: true }).getByLabel(field.name, { exact: true })).toHaveValue('Default acceptance');
  });
  for (const scenario of [
    { id: 'UC-FLD-0003', fieldValues: undefined, expected: [{ fieldId: field.id, value: field.defaultValue }] },
    { id: 'UC-FLD-0004', fieldValues: [{ fieldId: field.id, value: { kind: 'text' as const, text: 'Override' } }], expected: [{ fieldId: field.id, value: { kind: 'text', text: 'Override' } }] },
    { id: 'UC-FLD-0005', fieldValues: [{ fieldId: field.id, value: null }], expected: [] },
  ]) await restCase(scenario.id, async () => {
    const issue = await coverageCreate(request, projectId, scenario.fieldValues ? { fieldValues: scenario.fieldValues } : {});
    expect((await coverageFields(request, issue.summary.id)).values).toEqual(scenario.expected);
  });
  const issue = await coverageCreate(request, projectId);
  await restCase('UC-FLD-0060', async () => {
    const response = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, {
      headers: await coverageHeaders(), data: { expectedRevision: issue.summary.revision, values: [{ fieldId: field.id, value: field.defaultValue }] },
    });
    expect(response.status()).toBe(200);
    const saved = zSavedCustomFieldsView.parse(await response.json());
    expect(saved.result.revision).toBe(issue.summary.revision);
    expect(saved.receipt.eventId).toBeNull();
  });
  await restCase('UC-FLD-0082', async () => {
    const response = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, {
      headers: await coverageHeaders('viewer'), data: { expectedRevision: issue.summary.revision, values: [{ fieldId: field.id, value: { kind: 'text', text: 'forbidden' } }] },
    });
    expect(response.status()).toBe(403);
    expect((await coverageFields(request, issue.summary.id)).values).toEqual([{ fieldId: field.id, value: field.defaultValue }]);
  });
});

test('reusable labels preserve Arabic, trim and serialize equivalent names', async ({ request }) => {
  const projectId = await coverageProject(request);
  const create = async (name: string, role = 'member') => request.post(`${apiOrigin}/api/v1/projects/${projectId}/labels`, { headers: await coverageHeaders(role), data: { name } });
  const first = await restCase('UC-LBL-0023', async () => {
    const response = await create('Release'); expect(response.status()).toBe(201);
    const label = zSavedLabelView.parse(await response.json()).result;
    expect(label.name).toBe('Release'); expect(label.projectId).toBe(projectId); return label;
  });
  await restCase('UC-LBL-0024', async () => {
    const response = await create('مراجعة عاجلة'); expect(response.status()).toBe(201);
    expect(zSavedLabelView.parse(await response.json()).result.name).toBe('مراجعة عاجلة');
  });
  await restCase('UC-LBL-0003', async () => {
    const response = await create('  trimmed  '); expect(response.status()).toBe(201);
    expect(zSavedLabelView.parse(await response.json()).result.name).toBe('trimmed');
  });
  await restCase('UC-LBL-0004', async () => {
    const response = await create('release'); expect(response.status()).toBe(200);
    expect(zSavedLabelView.parse(await response.json()).result.id).toBe(first.id);
  });
  await restCase('UC-LBL-0005', async () => {
    const responses = await Promise.all([create('Concurrent'), create('CONCURRENT')]);
    expect(responses.map(r => r.status()).sort()).toEqual([200, 201]);
    const results = await Promise.all(responses.map(async r => zSavedLabelView.parse(await r.json()).result));
    expect(results[0]?.id).toBe(results[1]?.id);
  });
  for (const scenario of [{ id: 'UC-LBL-0006', name: '   ' }, { id: 'UC-LBL-0007', name: 'a'.repeat(41) }, { id: 'UC-LBL-0008', name: 'bad\u0000label' }]) await restCase(scenario.id, async () => {
    const response = await create(scenario.name); expect(response.status()).toBe(422);
  });
  await restCase('UC-LBL-0018', async () => {
    const response = await create('viewer forbidden', 'viewer'); expect(response.status()).toBe(403);
  });
  await test.step('Label API cursor pages without duplicates', async () => {
    const response = await request.get(`${apiOrigin}/api/v1/projects/${projectId}/labels?limit=1`, { headers: await coverageHeaders() });
    expect(response.status()).toBe(200); const firstPage = zPageLabelView.parse(await response.json());
    expect(firstPage.items).toHaveLength(1); expect(firstPage.nextCursor).not.toBeNull();
    const next = await request.get(`${apiOrigin}/api/v1/projects/${projectId}/labels?limit=1&cursor=${encodeURIComponent(firstPage.nextCursor!)}`, { headers: await coverageHeaders() });
    expect(next.status()).toBe(200); const nextPage = zPageLabelView.parse(await next.json());
    expect(nextPage.items).toHaveLength(1); expect(nextPage.items[0]?.id).not.toBe(firstPage.items[0]?.id);
  });
});

test('required and retired custom values cannot be cleared/replaced and save batches roll back', async ({ request }) => {
  const projectId = await coverageProject(request);
  let required = await coverageDefinition(request, projectId, { kind: 'text', required: true, defaultValue: { kind: 'text', text: 'Required baseline' } });
  const optional = await coverageDefinition(request, projectId, { kind: 'text' });
  const issue = await coverageCreate(request, projectId);
  for (const scenario of [
    { id: 'UC-FLD-0046', value: null },
    { id: 'UC-FLD-0047', value: { kind: 'text', text: '   ' } },
  ]) await restCase(scenario.id, async () => {
    const response = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, { headers: await coverageHeaders(), data: { expectedRevision: issue.summary.revision, values: [{ fieldId: required.id, value: scenario.value }] } }); expect(response.status()).toBe(422);
    expect((await coverageFields(request, issue.summary.id)).values).toContainEqual({ fieldId: required.id, value: required.defaultValue });
  });
  await restCase('UC-FLD-0052', async () => {
    const response = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, { headers: await coverageHeaders(), data: { expectedRevision: issue.summary.revision, values: [{ fieldId: optional.id, value: { kind: 'text', text: 'Must roll back' } }, { fieldId: required.id, value: null }] } }); expect(response.status()).toBe(422);
    expect((await coverageFields(request, issue.summary.id)).values.some(v => v.fieldId === optional.id)).toBe(false); expect((await coverageRead(request, issue.summary.id)).summary.revision).toBe(issue.summary.revision);
  });
  required = await coverageDefinition(request, projectId, { ...required, required: false, retired: true });
  await restCase('UC-FLD-0079', async () => { const current = await coverageFields(request, issue.summary.id); expect(current.definitions.find(f => f.id === required.id)?.retired).toBe(true); expect(current.values).toContainEqual({ fieldId: required.id, value: required.defaultValue }); });
  await restCase('UC-FLD-0049', async () => { const response = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, { headers: await coverageHeaders(), data: { expectedRevision: issue.summary.revision, values: [{ fieldId: required.id, value: required.defaultValue }] } }); expect(response.status()).toBe(200); expect(zSavedCustomFieldsView.parse(await response.json()).result.revision).toBe(issue.summary.revision); });
  for (const scenario of [ { id: 'UC-FLD-0050', value: { kind: 'text', text: 'Replacement' } }, { id: 'UC-FLD-0051', value: null } ]) await restCase(scenario.id, async () => { const response = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, { headers: await coverageHeaders(), data: { expectedRevision: issue.summary.revision, values: [{ fieldId: required.id, value: scenario.value }] } }); expect(response.status()).toBe(422); expect((await coverageFields(request, issue.summary.id)).values).toContainEqual({ fieldId: required.id, value: required.defaultValue }); });
  const foreignProject = await coverageProject(request); const foreign = await coverageDefinition(request, foreignProject, { kind: 'text' });
  await restCase('UC-FLD-0066', async () => { const response = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, { headers: await coverageHeaders(), data: { expectedRevision: issue.summary.revision, values: [{ fieldId: foreign.id, value: { kind: 'text', text: 'Foreign assignment' } }] } }); expect(response.status()).toBe(404); expect((await coverageFields(request, issue.summary.id)).values.some(v => v.fieldId === foreign.id)).toBe(false); });
});

async function approvalFixture(request: APIRequestContext, policy: Partial<TransitionPolicy> = {}, category = 'review') {
  const projectId = await coverageProject(request); const issue = await coverageCreate(request, projectId);
  const optionsResponse = await request.get(`${apiOrigin}/api/v2/issues/${issue.summary.id}/transitions`, { headers: await coverageHeaders() }); expect(optionsResponse.status()).toBe(200);
  const edge = zPageIssueTransitionOption.parse(await optionsResponse.json()).items.find(o => o.stage.category === category);
  if (!edge?.transitionId) throw new Error('Missing review transition');
  const root = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/configuration`, { headers: await coverageHeaders('owner') }); expect(root.status()).toBe(200);
  const cfg = zConfigurationView.parse(await root.json());
  const response = await request.put(`${apiOrigin}/api/v2/projects/${projectId}/workflows/${issue.summary.workflow.id}/transitions/${edge.transitionId}/policy`, {
    headers: await coverageHeaders('owner'), data: { expectedRevision: cfg.revision, policy: { requiredSystemFields: [], requiredFieldIds: [], approvalsRequired: 1, approverRole: 'member', excludeIssueReporter: false, ...policy } },
  }); expect(response.status()).toBe(200); zSavedTransitionPolicyView.parse(await response.json());
  const url = `${apiOrigin}/api/v2/issues/${issue.summary.id}/transitions/${edge.transitionId}/approvals`;
  const context = async () => { const r = await request.get(url, { headers: await coverageHeaders() }); expect(r.status()).toBe(200); return zApprovalContextView.parse(await r.json()); };
  const initial = await context();
  const fields = (v = initial) => ({ expectedRevision: v.issueRevision, expectedWorkflowRevision: v.workflowRevision, expectedConfigurationRevision: v.configurationRevision });
  const vote = async (decision: 'approve' | 'reject', role = 'member', overrides: Partial<ReturnType<typeof fields>> = {}) => request.post(url, { headers: await coverageHeaders(role), data: { ...fields(), ...overrides, decision } });
  return { projectId, issue, edge, url, context, initial, fields, vote };
}

test('approval counts distinct simultaneous reviewers, retains immutable decisions and gates the move', async ({ request }) => {
  const f = await approvalFixture(request, { approvalsRequired: 2 });
  await test.step('Approval API returns required and current counts', async () => { expect(f.initial.required).toBe(2); expect(f.initial.approved).toBe(0); expect(f.initial.reviewSatisfied).toBe(false); });
  await restCase('UC-APR-0020', async () => { const response = await request.post(`${apiOrigin}/api/v2/issues/${f.issue.summary.id}/move`, { headers: await coverageHeaders(), data: { expectedRevision: f.issue.summary.revision, targetStageId: f.edge.stage.id } }); expect(response.status()).toBe(422); expect((await coverageRead(request, f.issue.summary.id)).summary.stage.category).toBe('todo'); });
  await restCase('UC-APR-0012', async () => {
    const responses = await Promise.all([f.vote('approve'), f.vote('approve', 'owner')]); expect(responses.map(r => r.status())).toEqual([200, 200]);
    const context = await f.context(); expect(context.approved).toBe(2); expect(context.votes.filter(v => v.current && v.eligible)).toHaveLength(2); expect(new Set(context.votes.map(v => v.approver.id)).size).toBe(2);
  });
  await restCase('UC-APR-0013', async () => { const context = await f.context(); expect(context.reviewSatisfied).toBe(true); expect(context.rejected).toBe(false); });
  await restCase('UC-APR-0010', async () => { const response = await f.vote('approve'); expect(response.status()).toBe(200); const result = zSavedApprovalContextView.parse(await response.json()); expect(result.result.approved).toBe(2); expect(result.result.votes).toHaveLength(2); expect(result.receipt.eventId).toBeNull(); });
  await restCase('UC-APR-0011', async () => { const response = await f.vote('reject'); expect(response.status()).toBe(422); expect((await f.context()).rejected).toBe(false); });
  for (const scenario of [
    { id: 'UC-APR-0040', overrides: { expectedRevision: '999999' } },
    { id: 'UC-APR-0041', overrides: { expectedWorkflowRevision: '999999' } },
    { id: 'UC-APR-0042', overrides: { expectedConfigurationRevision: '999999' } },
  ]) await restCase(scenario.id, async () => { const response = await f.vote('approve', 'member', scenario.overrides); expect(response.status()).toBe(409); expect((await f.context()).approved).toBe(2); });
  await restCase('UC-APR-0062', async () => { const response = await request.post(`${apiOrigin}/api/v2/issues/${f.issue.summary.id}/move`, { headers: await coverageHeaders(), data: { expectedRevision: f.issue.summary.revision, targetStageId: f.edge.stage.id } }); expect(response.status()).toBe(200); expect((await coverageRead(request, f.issue.summary.id)).summary.stage.category).toBe('review'); });
  await restCase('UC-APR-0063', async () => { const context = await f.context(); expect(context.currentContext).toBe(false); expect(context.canVote).toBe(false); expect(context.votes).toHaveLength(2); });
  await restCase('UC-APR-0045', async () => { const current = await f.context(); const vote = await f.vote('approve', 'owner', f.fields(current)); expect(vote.status()).toBe(422); const resubmit = await request.post(f.url.replace('/approvals', '/resubmit'), { headers: await coverageHeaders(), data: f.fields(current) }); expect(resubmit.status()).toBe(422); expect((await f.context()).votes).toHaveLength(2); });
});

test('approval rejection veto, resubmission and content revisions invalidate only the current context', async ({ request }) => {
  const f = await approvalFixture(request);
  await restCase('UC-APR-0061', async () => { const response = await f.vote('reject'); expect(response.status()).toBe(200); const result = zSavedApprovalContextView.parse(await response.json()).result; expect(result.rejected).toBe(true); expect(result.reviewSatisfied).toBe(false); });
  await restCase('UC-APR-0014', async () => { const response = await f.vote('approve', 'owner'); expect(response.status()).toBe(200); const context = await f.context(); expect(context.approved).toBe(1); expect(context.rejected).toBe(true); expect(context.reviewSatisfied).toBe(false); });
  await restCase('UC-APR-0021', async () => { const response = await request.post(`${apiOrigin}/api/v2/issues/${f.issue.summary.id}/move`, { headers: await coverageHeaders(), data: { expectedRevision: f.issue.summary.revision, targetStageId: f.edge.stage.id } }); expect(response.status()).toBe(422); });
  await restCase('UC-APR-0015', async () => { const response = await request.post(f.url.replace('/approvals', '/resubmit'), { headers: await coverageHeaders(), data: f.fields() }); expect(response.status()).toBe(200); const result = zSavedApprovalContextView.parse(await response.json()).result; expect(BigInt(result.issueRevision)).toBe(BigInt(f.initial.issueRevision) + 1n); expect(result.approved).toBe(0); expect(result.rejected).toBe(false); expect(result.votes.filter(v => v.current)).toHaveLength(0); });
  const fresh = await f.context();
  await restCase('UC-APR-0016', async () => { const response = await f.vote('approve', 'member', f.fields(fresh)); expect(response.status()).toBe(200); expect(zSavedApprovalContextView.parse(await response.json()).result.reviewSatisfied).toBe(true); });
  await restCase('UC-APR-0064', async () => { const context = await f.context(); expect(context.votes.filter(v => v.current)).toHaveLength(1); expect(context.votes.filter(v => !v.current)).toHaveLength(2); });
  await restCase('UC-APR-0037', async () => {
    const current = await coverageRead(request, f.issue.summary.id);
    const response = await request.patch(`${apiOrigin}/api/v2/issues/${f.issue.summary.id}/fields`, { headers: await coverageHeaders(), data: { field: 'dueDate', dueDate: { prior: current.summary.dueDate, value: '2028-04-01' } } }); expect(response.status()).toBe(200);
    const context = await f.context(); expect(context.approved).toBe(0); expect(context.reviewSatisfied).toBe(false); expect(context.votes.every(v => !v.current)).toBe(true);
  });
});

test('reviewer roles and excluded reporter cannot bypass transition review', async ({ request }) => {
  const f = await approvalFixture(request, { approverRole: 'project_admin' });
  await restCase('UC-APR-0029', async () => { const response = await f.vote('approve'); expect(response.status()).toBe(403); });
  await restCase('UC-APR-0032', async () => { const response = await f.vote('approve', 'viewer'); expect(response.status()).toBe(403); });
  await restCase('UC-APR-0030', async () => { const response = await f.vote('approve', 'owner'); expect(response.status()).toBe(200); expect(zSavedApprovalContextView.parse(await response.json()).result.approved).toBe(1); });
  const excluded = await approvalFixture(request, { excludeIssueReporter: true });
  await restCase('UC-APR-0028', async () => { const response = await excluded.vote('approve'); expect(response.status()).toBe(403); expect((await excluded.context()).approved).toBe(0); });
  const allowed = await approvalFixture(request);
  await restCase('UC-APR-0031', async () => { const response = await allowed.vote('approve'); expect(response.status()).toBe(200); expect(zSavedApprovalContextView.parse(await response.json()).result.approved).toBe(1); });
});

for (const scenario of [
  { id: 'UC-APR-0022', required: 'assignee' },
  { id: 'UC-APR-0023', required: 'due_date' },
  { id: 'UC-APR-0024', required: 'description' },
] as const) test('transition required system field ' + scenario.required + ' blocks empty work and permits completed data', async ({ request }) => {
  const f = await approvalFixture(request, { approvalsRequired: 0, approverRole: null, requiredSystemFields: [scenario.required] });
  await restCase(scenario.id, async () => {
    const denied = await request.post(`${apiOrigin}/api/v2/issues/${f.issue.summary.id}/move`, { headers: await coverageHeaders(), data: { expectedRevision: f.issue.summary.revision, targetStageId: f.edge.stage.id } }); expect(denied.status()).toBe(422); expect((await coverageRead(request, f.issue.summary.id)).summary.stage.category).toBe('todo');
    const editable = modernEditable(f.issue);
    if (scenario.required === 'assignee') editable.assigneeId = memberId;
    if (scenario.required === 'due_date') editable.dueDate = '2028-04-01';
    if (scenario.required === 'description') { editable.descriptionFormat = 'html'; editable.description = '<p>Meaningful العربية</p>'; }
    const saved = await request.put(`${apiOrigin}/api/v2/issues/${f.issue.summary.id}`, { headers: await coverageHeaders(), data: { expectedRevision: f.issue.summary.revision, editable } }); expect(saved.status()).toBe(200);
    const current = await coverageRead(request, f.issue.summary.id);
    const moved = await request.post(`${apiOrigin}/api/v2/issues/${f.issue.summary.id}/move`, { headers: await coverageHeaders(), data: { expectedRevision: current.summary.revision, targetStageId: f.edge.stage.id } }); expect(moved.status()).toBe(200); expect((await coverageRead(request, f.issue.summary.id)).summary.stage.category).toBe('review');
  });
});

test('transition required custom field and completion guards remain independent of review approval', async ({ request }) => {
  const f = await approvalFixture(request, { approvalsRequired: 0, approverRole: null });
  const field = await coverageDefinition(request, f.projectId, { kind: 'text' });
  const root = await request.get(`${apiOrigin}/api/v2/projects/${f.projectId}/configuration`, { headers: await coverageHeaders('owner') }); expect(root.status()).toBe(200); const cfg = zConfigurationView.parse(await root.json());
  const policy = await request.put(`${apiOrigin}/api/v2/projects/${f.projectId}/workflows/${f.issue.summary.workflow.id}/transitions/${f.edge.transitionId}/policy`, { headers: await coverageHeaders('owner'), data: { expectedRevision: cfg.revision, policy: { requiredSystemFields: [], requiredFieldIds: [field.id], approvalsRequired: 0, approverRole: null, excludeIssueReporter: false } } }); expect(policy.status()).toBe(200);
  await restCase('UC-APR-0025', async () => {
    const denied = await request.post(`${apiOrigin}/api/v2/issues/${f.issue.summary.id}/move`, { headers: await coverageHeaders(), data: { expectedRevision: f.issue.summary.revision, targetStageId: f.edge.stage.id } }); expect(denied.status()).toBe(422);
    const saved = await request.put(`${apiOrigin}/api/v2/issues/${f.issue.summary.id}/custom-fields`, { headers: await coverageHeaders(), data: { expectedRevision: f.issue.summary.revision, values: [{ fieldId: field.id, value: { kind: 'text', text: 'Required acceptance verified' } }] } }); expect(saved.status()).toBe(200);
    const current = await coverageRead(request, f.issue.summary.id);
    const moved = await request.post(`${apiOrigin}/api/v2/issues/${f.issue.summary.id}/move`, { headers: await coverageHeaders(), data: { expectedRevision: current.summary.revision, targetStageId: f.edge.stage.id } }); expect(moved.status()).toBe(200);
  });
  const done = await approvalFixture(request, {}, 'done');
  await coverageCreate(request, done.projectId, { parentId: done.issue.summary.id, expectedParentRevision: done.issue.summary.revision });
  const fresh = await done.context(); const approved = await done.vote('approve', 'member', done.fields(fresh)); expect(approved.status()).toBe(200);
  await restCase('UC-APR-0026', async () => {
    expect((await done.context()).reviewSatisfied).toBe(true);
    const current = await coverageRead(request, done.issue.summary.id);
    const denied = await request.post(`${apiOrigin}/api/v2/issues/${done.issue.summary.id}/move`, { headers: await coverageHeaders(), data: { expectedRevision: current.summary.revision, targetStageId: done.edge.stage.id } }); expect(denied.status()).toBe(409); expect((await coverageRead(request, done.issue.summary.id)).summary.stage.category).toBe('todo');
  });
});

for (const change of ['remove', 'demote'] as const) test('approval eligibility changes immediately after reviewer membership ' + change, async ({ request }) => {
  const f = await approvalFixture(request); expect((await f.vote('approve')).status()).toBe(200);
  await restCase(change === 'remove' ? 'UC-APR-0033' : 'UC-APR-0036', async () => {
    expect((await f.context()).approved).toBe(1);
    const endpoint = `${apiOrigin}/api/v1/projects/${f.projectId}/memberships/${memberId}`;
    const response = change === 'remove'
      ? await request.post(endpoint + '/remove', { headers: await coverageHeaders('owner'), data: { expectedRevision: '1' } })
      : await request.put(endpoint, { headers: await coverageHeaders('owner'), data: { expectedRevision: '1', role: 'viewer' } });
    expect(response.status()).toBe(200);
    const read = await request.get(f.url, { headers: await coverageHeaders('owner') }); expect(read.status()).toBe(200); const context = zApprovalContextView.parse(await read.json());
    expect(context.approved).toBe(0); expect(context.reviewSatisfied).toBe(false); expect(context.votes).toHaveLength(1); expect(context.votes[0]?.eligible).toBe(false);
    const issueResponse = await request.get(`${apiOrigin}/api/v2/issues/${f.issue.summary.id}`, { headers: await coverageHeaders('owner') }); expect(issueResponse.status()).toBe(200); const issue = zModernIssueView.parse(await issueResponse.json());
    const moved = await request.post(`${apiOrigin}/api/v2/issues/${f.issue.summary.id}/move`, { headers: await coverageHeaders('owner'), data: { expectedRevision: issue.summary.revision, targetStageId: f.edge.stage.id } }); expect(moved.status()).toBe(422);
  });
});

test('approval context changes invalidate votes and stale history cursors', async ({ request }) => {
  const f = await approvalFixture(request); expect((await f.vote('approve')).status()).toBe(200);
  await restCase('UC-APR-0039', async () => {
    await coverageDefinition(request, f.projectId, { kind: 'text' });
    const context = await f.context(); expect(context.configurationRevision).not.toBe(f.initial.configurationRevision); expect(context.workflowRevision).toBe(f.initial.workflowRevision); expect(context.approved).toBe(0); expect(context.votes.every(v => !v.current)).toBe(true);
  });
  let fresh = await f.context(); expect((await f.vote('approve', 'member', f.fields(fresh))).status()).toBe(200);
  await restCase('UC-APR-0038', async () => {
    const root = await request.get(`${apiOrigin}/api/v2/projects/${f.projectId}/configuration`, { headers: await coverageHeaders('owner') }); expect(root.status()).toBe(200); const cfg = zConfigurationView.parse(await root.json());
    const changed = await request.put(`${apiOrigin}/api/v2/projects/${f.projectId}/workflows/${f.issue.summary.workflow.id}/transitions/${f.edge.transitionId}/policy`, { headers: await coverageHeaders('owner'), data: { expectedRevision: cfg.revision, policy: { requiredSystemFields: ['due_date'], requiredFieldIds: [], approvalsRequired: 1, approverRole: 'member', excludeIssueReporter: false } } }); expect(changed.status()).toBe(200);
    const context = await f.context(); expect(context.workflowRevision).not.toBe(fresh.workflowRevision); expect(context.approved).toBe(0); expect(context.reviewSatisfied).toBe(false); expect(context.votes.every(v => !v.current)).toBe(true);
  });
  let cursor = '';
  await restCase('UC-APR-0065', async () => {
    const first = await request.get(f.url + '?limit=1', { headers: await coverageHeaders() }); expect(first.status()).toBe(200); const firstPage = zApprovalContextView.parse(await first.json()); expect(firstPage.votes).toHaveLength(1); expect(firstPage.nextCursor).not.toBeNull(); cursor = firstPage.nextCursor!;
    const second = await request.get(f.url + '?limit=1&cursor=' + encodeURIComponent(cursor), { headers: await coverageHeaders() }); expect(second.status()).toBe(200); const secondPage = zApprovalContextView.parse(await second.json()); expect(secondPage.votes).toHaveLength(1); expect(secondPage.votes[0]?.configurationRevision).not.toBe(firstPage.votes[0]?.configurationRevision);
  });
  fresh = await f.context(); const resubmit = await request.post(f.url.replace('/approvals', '/resubmit'), { headers: await coverageHeaders(), data: f.fields(fresh) }); expect(resubmit.status()).toBe(200);
  await restCase('UC-APR-0050', async () => { const stale = await request.get(f.url + '?limit=1&cursor=' + encodeURIComponent(cursor), { headers: await coverageHeaders() }); expect(stale.status()).toBe(422); });
  const none = await approvalFixture(request, { approvalsRequired: 0, approverRole: null });
  await restCase('UC-APR-0046', async () => { const response = await request.post(none.url.replace('/approvals', '/resubmit'), { headers: await coverageHeaders(), data: none.fields() }); expect(response.status()).toBe(422); });
});

test('person values allow readers but reject disabled, unapproved and removed people', async ({ request }) => {
  const projectId = await coverageProject(request); const people = await coverageIneligiblePeople(projectId);
  const person = await coverageDefinition(request, projectId, { kind: 'user' }); const issue = await coverageCreate(request, projectId);
  const save = async (userId: string) => { const current = await coverageRead(request, issue.summary.id); return request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`, { headers: await coverageHeaders(), data: { expectedRevision: current.summary.revision, values: [{ fieldId: person.id, value: { kind: 'user', userId } }] } }); };
  await restCase('UC-FLD-0041', async () => { const response = await save(viewerId); expect(response.status()).toBe(200); expect((await coverageFields(request, issue.summary.id)).values).toContainEqual({ fieldId: person.id, value: { kind: 'user', userId: viewerId } }); });
  for (const scenario of [{ id: 'UC-FLD-0042', userId: people.disabled }, { id: 'UC-FLD-0044', userId: people.unapproved }]) await restCase(scenario.id, async () => { const before = await coverageRead(request, issue.summary.id); const response = await save(scenario.userId); expect(response.status()).toBe(422); expect((await coverageRead(request, issue.summary.id)).summary.revision).toBe(before.summary.revision); expect((await coverageFields(request, issue.summary.id)).values).toContainEqual({ fieldId: person.id, value: { kind: 'user', userId: viewerId } }); });
  const removed = await request.post(`${apiOrigin}/api/v1/projects/${projectId}/memberships/${viewerId}/remove`, { headers: await coverageHeaders('owner'), data: { expectedRevision: '1' } }); expect(removed.status()).toBe(200);
  await restCase('UC-FLD-0043', async () => { const response = await save(viewerId); expect(response.status()).toBe(200); const other = await coverageCreate(request, projectId); const changed = await request.put(`${apiOrigin}/api/v2/issues/${other.summary.id}/custom-fields`, { headers: await coverageHeaders(), data: { expectedRevision: other.summary.revision, values: [{ fieldId: person.id, value: { kind: 'user', userId: viewerId } }] } }); expect(changed.status()).toBe(422); expect((await coverageFields(request, other.summary.id)).values).toEqual([]); });
});

test('optional choice values retain an old retired option but reject new retired and foreign options', async ({ request }) => {
  const projectId = await coverageProject(request); const choice = await coverageDefinition(request, projectId, { kind: 'choice' }); const foreign = await coverageDefinition(request, projectId, { kind: 'choice' });
  const option = async (fieldId: string, id: string, name: string, retired = false) => { const root = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/configuration`, { headers: await coverageHeaders('owner') }); expect(root.status()).toBe(200); const cfg = zConfigurationView.parse(await root.json()); const saved = await request.put(`${apiOrigin}/api/v2/projects/${projectId}/fields/${fieldId}/options/${id}`, { headers: await coverageHeaders('owner'), data: { expectedRevision: cfg.revision, name, position: '1', retired } }); expect([200, 201]).toContain(saved.status()); return zSavedFieldOptionSaved.parse(await saved.json()).result.option; };
  const retained = await option(choice.id, crypto.randomUUID(), 'Retained historical option'); const other = await option(foreign.id, crypto.randomUUID(), 'Other field option');
  const original = await coverageCreate(request, projectId, { fieldValues: [{ fieldId: choice.id, value: { kind: 'choice', optionId: retained.id } }] }); const empty = await coverageCreate(request, projectId);
  await option(choice.id, retained.id, retained.name, true);
  await restCase('UC-FLD-0037', async () => { const response = await request.put(`${apiOrigin}/api/v2/issues/${empty.summary.id}/custom-fields`, { headers: await coverageHeaders(), data: { expectedRevision: empty.summary.revision, values: [{ fieldId: choice.id, value: { kind: 'choice', optionId: retained.id } }] } }); expect(response.status()).toBe(422); expect((await coverageFields(request, empty.summary.id)).values).toEqual([]); });
  await restCase('UC-FLD-0038', async () => { const response = await request.put(`${apiOrigin}/api/v2/issues/${empty.summary.id}/custom-fields`, { headers: await coverageHeaders(), data: { expectedRevision: empty.summary.revision, values: [{ fieldId: choice.id, value: { kind: 'choice', optionId: other.id } }] } }); expect(response.status()).toBe(422); expect((await coverageFields(request, empty.summary.id)).values).toEqual([]); });
  const unchanged = await request.put(`${apiOrigin}/api/v2/issues/${original.summary.id}/custom-fields`, { headers: await coverageHeaders(), data: { expectedRevision: original.summary.revision, values: [{ fieldId: choice.id, value: { kind: 'choice', optionId: retained.id } }] } }); expect(unchanged.status()).toBe(200); expect((await coverageFields(request, original.summary.id)).values).toContainEqual({ fieldId: choice.id, value: { kind: 'choice', optionId: retained.id } });
});

test('custom field drafts can be restored, discarded and corrected after server validation', async ({ page, request }) => {
  const projectId = await coverageProject(request), field = await coverageDefinition(request, projectId, { kind: 'number', name: 'Precise estimate' });
  const issue = await coverageCreate(request, projectId, { fieldValues: [{ fieldId: field.id, value: { kind: 'number', number: '12.5' } }] });
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const custom = page.locator('gg-custom-fields'), input = custom.getByLabel(field.name, { exact: true });
  await webCase('UC-FLD-0001', async () => { await expect(input).toHaveValue('12.5'); expect((await coverageFields(request, issue.summary.id)).values).toEqual([{ fieldId: field.id, value: { kind: 'number', number: '12.5' } }]); });
  await restCase('UC-FLD-0001', async () => { const read = await coverageFields(request, issue.summary.id); expect(read.definitions.map(definition => definition.id)).toContain(field.id); expect(read.values).toEqual([{ fieldId: field.id, value: { kind: 'number', number: '12.5' } }]); });
  await input.fill('45.75');
  await webCase('UC-FLD-0054', async () => {
    page.once('dialog', confirmation => confirmation.accept()); await page.getByRole('link', { name: 'All issues', exact: true }).click();
    await page.getByRole('link', { name: issue.summary.key + ' · ' + issue.summary.title, exact: true }).click();
    await expect(input).toHaveValue('45.75'); await expect(custom.getByRole('button', { name: 'Save fields', exact: true })).toBeVisible();
    expect((await coverageFields(request, issue.summary.id)).values).toEqual([{ fieldId: field.id, value: { kind: 'number', number: '12.5' } }]);
  });
  await webCase('UC-FLD-0053', async () => { await custom.getByRole('button', { name: 'Discard draft', exact: true }).click(); await expect(input).toHaveValue('12.5'); await expect(custom.getByRole('button', { name: 'Save fields', exact: true })).toHaveCount(0); });
  let fieldWrites = 0; page.on('request', outgoing => { if (outgoing.method() === 'PUT' && outgoing.url().endsWith('/issues/' + issue.summary.id + '/custom-fields')) fieldWrites++; });
  await webCase('UC-FLD-0059', async () => {
    await input.fill('1e6'); await custom.getByRole('button', { name: 'Save fields', exact: true }).click();
    await expect(custom.getByRole('alert')).toContainText('Precise estimate'); await expect(custom.getByRole('alert')).toContainText('Exponent notation is not supported.'); await expect(input).toBeEnabled(); await expect(input).toHaveValue('1e6'); expect(fieldWrites).toBe(0);
    expect((await coverageFields(request, issue.summary.id)).values).toEqual([{ fieldId: field.id, value: { kind: 'number', number: '12.5' } }]);
    await input.fill('1000000.25'); await custom.getByRole('button', { name: 'Save fields', exact: true }).click();
    await expect(custom.getByRole('button', { name: 'Save fields', exact: true })).toHaveCount(0);
    await expect.poll(async () => (await coverageFields(request, issue.summary.id)).values).toEqual([{ fieldId: field.id, value: { kind: 'number', number: '1000000.25' } }]); expect(fieldWrites).toBe(1);
  });
});

test('required custom values are enforced at creation by both form and service', async ({ page, request }) => {
  const projectId = await coverageProject(request), field = await coverageDefinition(request, projectId, { kind: 'text', name: 'Acceptance requirement', required: true });
  await restCase('UC-FLD-0045', async () => {
    const missing = await request.post(`${apiOrigin}/api/v2/projects/${projectId}/issues`, { headers: await coverageHeaders(), data: { title: 'Missing required field' } }); expect(missing.status()).toBe(422);
    const present = await coverageCreate(request, projectId, { fieldValues: [{ fieldId: field.id, value: { kind: 'text', text: 'Definition of done' } }] }); expect((await coverageFields(request, present.summary.id)).values).toEqual([{ fieldId: field.id, value: { kind: 'text', text: 'Definition of done' } }]);
  });
  await webCase('UC-FLD-0045', async () => {
    await signIn(page, 'member', '/issues?projectId=' + projectId, /^Issues$/);
    await page.getByRole('button', { name: 'New issue', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
    await dialog.getByLabel('Issue title', { exact: true }).fill('Complete required field form');
    const input = dialog.getByLabel(field.name, { exact: true }); await expect(input).toHaveAttribute('required', '');
    await dialog.getByRole('button', { name: 'Create issue', exact: true }).click(); await expect(dialog).toBeVisible(); await expect(dialog.getByRole('alert')).toContainText(/required/i); await expect(input).toBeEnabled(); await expect(input).toHaveValue('');
    await input.fill('Verified from the form'); await dialog.getByRole('button', { name: 'Create issue', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Complete required field form', exact: true })).toBeVisible();
  });
});

test('field definition paging preserves values, prevents dirty paging and rejects stale cursors', async ({ page, request }) => {
  const projectId = await coverageProject(request), definitions: FieldDefinition[] = [];
  for (let index = 0; index < 101; index++) definitions.push(await coverageDefinition(request, projectId, { kind: 'text', name: 'Paged field ' + String(index).padStart(3, '0') }));
  const issue = await coverageCreate(request, projectId), url = `${apiOrigin}/api/v2/issues/${issue.summary.id}/custom-fields`;
  await restCase('UC-FLD-0081', async () => {
    const first = zCustomFieldsView.parse(await (await request.get(url + '?limit=100', { headers: await coverageHeaders() })).json()); expect(first.definitions).toHaveLength(100); expect(first.nextCursor).not.toBeNull();
    const second = zCustomFieldsView.parse(await (await request.get(url + '?limit=100&cursor=' + encodeURIComponent(first.nextCursor!), { headers: await coverageHeaders() })).json()); expect(second.definitions).toHaveLength(1); expect(new Set([...first.definitions, ...second.definitions].map(field => field.id))).toEqual(new Set(definitions.map(field => field.id)));
  });
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const custom = page.locator('gg-custom-fields');
  await webCase('UC-FLD-0063', async () => {
    await expect(custom.locator('gg-field-value-editor')).toHaveCount(100);
    await custom.getByRole('textbox').first().fill('Do not page while dirty'); await expect(custom.getByRole('button', { name: 'More fields', exact: true })).toBeDisabled();
    await custom.getByRole('button', { name: 'Discard draft', exact: true }).click(); await expect(custom.getByRole('button', { name: 'More fields', exact: true })).toBeEnabled();
  });
  await webCase('UC-FLD-0062', async () => { await custom.getByRole('button', { name: 'More fields', exact: true }).click(); await expect(custom.locator('gg-field-value-editor')).toHaveCount(101); await expect(custom.getByRole('button', { name: 'More fields', exact: true })).toHaveCount(0); });
  await restCase('UC-FLD-0064', async () => {
    const first = zCustomFieldsView.parse(await (await request.get(url + '?limit=2', { headers: await coverageHeaders() })).json()); expect(first.nextCursor).not.toBeNull();
    await coverageDefinition(request, projectId, { kind: 'text', name: 'New definition changes cursor scope' });
    const stale = await request.get(url + '?limit=2&cursor=' + encodeURIComponent(first.nextCursor!), { headers: await coverageHeaders() }); expect(stale.status()).toBe(422);
  });
});

test('bounded default backfill updates only missing values and records accepted changes', async ({ request }) => {
  const projectId = await coverageProject(request), missing = await coverageCreate(request, projectId), explicit = await coverageCreate(request, projectId);
  const field = await coverageDefinition(request, projectId, { kind: 'text', name: 'Delivery evidence', defaultValue: { kind: 'text', text: 'Default evidence' } });
  await restCase('UC-FLD-0061', async () => {
    const response = await request.put(`${apiOrigin}/api/v2/issues/${explicit.summary.id}/custom-fields`, { headers: await coverageHeaders(), data: { expectedRevision: explicit.summary.revision, values: [{ fieldId: field.id, value: { kind: 'text', text: 'Explicit evidence' } }] } }); expect(response.status()).toBe(200); const saved = zSavedCustomFieldsView.parse(await response.json()); expect(saved.result.revision).toBe('2'); expect(saved.receipt.eventId).not.toBeNull();
    const activity = await request.get(`${apiOrigin}/api/v1/admin/activity?projectId=${projectId}&issueKey=${explicit.summary.key}&limit=100`, { headers: await coverageHeaders('owner') }); expect(activity.status()).toBe(200); const events = zPageActivityView.parse(await activity.json());
    expect(events.items.some(event => event.id === saved.receipt.eventId)).toBe(true);
    const retained = await coverageStoredChanges(explicit.summary.id, saved.receipt.eventId!);
    const changed = retained.fields.find(change => change.field === 'customFields.' + field.id); expect(changed?.before).toBe('null'); const after: unknown = JSON.parse(changed?.after ?? 'null'); expect(after).toEqual({ kind: 'text', text: 'Explicit evidence' });
  });
  const root = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/configuration`, { headers: await coverageHeaders('owner') }); const cfg = zConfigurationView.parse(await root.json());
  await restCase('UC-FLD-0071', async () => {
    const response = await request.post(`${apiOrigin}/api/v2/projects/${projectId}/fields/${field.id}/backfill`, { headers: await coverageHeaders('owner'), data: { expectedRevision: cfg.revision, limit: 1 } }); expect(response.status()).toBe(200); const saved = zSavedBackfillFieldResult.parse(await response.json()); expect(saved.result.changed).toBe(1); expect(saved.result.remaining).toBe(0n);
    expect((await coverageFields(request, missing.summary.id)).values).toEqual([{ fieldId: field.id, value: { kind: 'text', text: 'Default evidence' } }]); expect((await coverageRead(request, missing.summary.id)).summary.revision).toBe('2'); expect(saved.receipt.eventId).not.toBeNull();
  });
  await restCase('UC-FLD-0072', async () => { expect((await coverageFields(request, explicit.summary.id)).values).toEqual([{ fieldId: field.id, value: { kind: 'text', text: 'Explicit evidence' } }]); expect((await coverageRead(request, explicit.summary.id)).summary.revision).toBe('2'); });
});

test('label selection supports paging, removal and creating a reusable label at selection capacity', async ({ page, request }) => {
  const projectId = await coverageProject(request), labels: LabelView[] = [];
  for (let index = 0; index < 26; index++) {
    const response = await request.post(`${apiOrigin}/api/v1/projects/${projectId}/labels`, { headers: await coverageHeaders(), data: { name: 'Label cursor ' + String(index).padStart(2, '0') } }); expect(response.status()).toBe(201); labels.push(zSavedLabelView.parse(await response.json()).result);
  }
  const issue = await coverageCreate(request, projectId, { labelIds: labels.slice(0, 10).map(label => label.id) });
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  await page.getByRole('button', { name: 'Edit issue', exact: true }).click(); const dialog = page.getByRole('dialog'); const editor = dialog.locator('gg-date-label-fields');
  const search = editor.getByRole('combobox', { name: 'Labels', exact: true });
  await webCase('UC-LBL-0010', async () => {
    await search.focus(); await expect(editor.getByRole('option')).toHaveCount(25);
    await editor.getByRole('button', { name: 'Load more labels choices', exact: true }).click(); await expect(editor.getByRole('option')).toHaveCount(26);
    await expect(editor.getByRole('option', { name: labels[25]!.name, exact: true })).toBeVisible(); await expect(editor.getByRole('button', { name: 'Load more labels choices', exact: true })).toHaveCount(0);
  });
  await page.getByRole('button', { name: 'Done choosing', exact: true }).click();
  await webCase('UC-LBL-0013', async () => {
    const labelName = 'Extra reusable capacity label', nameInput = editor.getByLabel('New label name', { exact: true });
    await nameInput.fill(labelName);
    const createdResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url() === `${apiOrigin}/api/v1/projects/${projectId}/labels`);
    await editor.getByRole('button', { name: 'Create and select label', exact: true }).click();
    const response = await createdResponse; expect(response.status()).toBe(201);
    const created = zSavedLabelView.parse(await response.json()).result; expect(created.name).toBe(labelName); expect(created.projectId).toBe(projectId);
    await expect(editor.getByRole('alert')).toHaveText('Label saved. Remove one selection before adding another.');
    await expect(nameInput).toHaveValue(''); await expect(editor).toContainText('10 / 10 labels selected');
    const lookup = await request.get(`${apiOrigin}/api/v1/projects/${projectId}/labels?query=Extra%20reusable%20capacity%20label`, { headers: await coverageHeaders() }); expect(lookup.status()).toBe(200); expect(zPageLabelView.parse(await lookup.json()).items.map(label => ({ id: label.id, name: label.name }))).toEqual([{ id: created.id, name: labelName }]);
    await expect(editor.getByRole('button', { name: 'Remove Extra reusable capacity label', exact: true })).toHaveCount(0);
  });
  await webCase('UC-LBL-0012', async () => { await editor.getByRole('button', { name: 'Remove ' + labels[0]!.name, exact: true }).click(); await expect(editor).toContainText('9 / 10 labels selected'); await dialog.getByRole('button', { name: 'Save issue', exact: true }).click(); await expect(dialog).toHaveCount(0); const saved = await coverageRead(request, issue.summary.id); expect(saved.summary.labels.map(label => label.id)).toEqual(expect.arrayContaining(labels.slice(1, 10).map(label => label.id))); expect(saved.summary.labels).toHaveLength(9); });
});

test('foreign label assignment fails without overwriting current labels', async ({ request }) => {
  const projectId = await coverageProject(request), foreignProject = await coverageProject(request), issue = await coverageCreate(request, projectId);
  const response = await request.post(`${apiOrigin}/api/v1/projects/${foreignProject}/labels`, { headers: await coverageHeaders(), data: { name: 'Foreign project label' } }); expect(response.status()).toBe(201); const foreign = zSavedLabelView.parse(await response.json()).result;
  await restCase('UC-LBL-0017', async () => {
    const update = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}`, { headers: await coverageHeaders(), data: { expectedRevision: issue.summary.revision, editable: { ...modernEditable(issue), labelIds: [foreign.id] } } }); expect(update.status()).toBe(422); const after = await coverageRead(request, issue.summary.id); expect(after.summary.labels).toEqual([]); expect(after.summary.revision).toBe(issue.summary.revision);
  });
});

for (const action of ['retry', 'refresh'] as const) test(`uncertain review action can ${action} without duplicating the original vote`, async ({ page, request }) => {
  const f = await approvalFixture(request); await signIn(page, 'member', '/issues/' + f.issue.summary.id, new RegExp('^' + f.issue.summary.title + '$'));
  const review = page.locator('gg-issue-review'), selector = review.getByRole('combobox', { name: 'Move to review', exact: true });
  await webCase('UC-APR-0001', async () => { await expect(selector.locator('option').filter({ hasText: 'To do → Review' })).toHaveAttribute('value', f.edge.transitionId); });
  await selector.selectOption(f.edge.transitionId); await expect(review.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  const attempts: { reference: string; body: string | null }[] = [];
  await page.route('**/api/v2/issues/' + f.issue.summary.id + '/transitions/' + f.edge.transitionId + '/approvals', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    attempts.push({ reference: route.request().headers()['idempotency-key'] ?? '', body: route.request().postData() });
    const response = await route.fetch(); if (attempts.length === 1) await route.abort('failed'); else await route.fulfill({ response });
  });
  await review.getByRole('button', { name: 'Approve', exact: true }).click(); await expect(review.getByRole('button', { name: 'Retry original review action', exact: true })).toBeVisible(); await expect(selector).toBeDisabled();
  await webCase(action === 'retry' ? 'UC-APR-0051' : 'UC-APR-0052', async () => {
    await review.getByRole('button', { name: action === 'retry' ? 'Retry original review action' : 'Review current context', exact: true }).click();
    await expect(review.getByRole('button', { name: 'Retry original review action', exact: true })).toHaveCount(0); await expect(review.getByRole('status').filter({ hasText: 'Review requirements satisfied' })).toBeVisible();
    const context = await f.context(); expect(context.votes).toHaveLength(1); expect(context.approved).toBe(1); expect(context.votes[0]?.approver.id).toBe(memberId);
    if (action === 'retry') { expect(attempts).toHaveLength(2); expect(attempts[1]).toEqual(attempts[0]); } else expect(attempts).toHaveLength(1);
  });
  await webCase('UC-APR-0005', async () => { await selector.selectOption(''); await expect(selector).toHaveValue(''); await expect(review.locator('.review-votes')).toHaveCount(0); await expect(review.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0); });
});

test('transition retirement denies new review decisions and resubmission', async ({ request }) => {
  const f = await approvalFixture(request); expect((await f.vote('approve')).status()).toBe(200);
  const root = await request.get(`${apiOrigin}/api/v2/projects/${f.projectId}/configuration`, { headers: await coverageHeaders('owner') }); const cfg = zConfigurationView.parse(await root.json());
  const retired = await request.put(`${apiOrigin}/api/v2/projects/${f.projectId}/workflows/${f.issue.summary.workflow.id}/transitions/${f.edge.transitionId}`, { headers: await coverageHeaders('owner'), data: { expectedRevision: cfg.revision, fromStageId: f.issue.summary.stage.id, toStageId: f.edge.stage.id, requiredPermission: null, retired: true } }); expect(retired.status()).toBe(200);
  await restCase('UC-APR-0043', async () => {
    const context = await f.context(); expect(context.currentContext).toBe(false); expect(context.canVote).toBe(false);
    const vote = await f.vote('approve', 'owner', f.fields(context)); expect(vote.status()).toBe(422);
    const resubmit = await request.post(f.url.replace('/approvals', '/resubmit'), { headers: await coverageHeaders(), data: f.fields(context) }); expect(resubmit.status()).toBe(422);
    expect((await f.context()).votes).toHaveLength(1);
  });
});

test('enough approvals do not bypass administrator-only transition permission', async ({ request }) => {
  const f = await approvalFixture(request);
  const root = await request.get(`${apiOrigin}/api/v2/projects/${f.projectId}/configuration`, { headers: await coverageHeaders('owner') }); const cfg = zConfigurationView.parse(await root.json());
  const guarded = await request.put(`${apiOrigin}/api/v2/projects/${f.projectId}/workflows/${f.issue.summary.workflow.id}/transitions/${f.edge.transitionId}`, { headers: await coverageHeaders('owner'), data: { expectedRevision: cfg.revision, fromStageId: f.issue.summary.stage.id, toStageId: f.edge.stage.id, requiredPermission: 'project_admin', retired: false } }); expect(guarded.status()).toBe(200);
  const context = await f.context(); const approved = await f.vote('approve', 'owner', f.fields(context)); expect(approved.status()).toBe(200);
  await restCase('UC-APR-0027', async () => {
    expect((await f.context()).reviewSatisfied).toBe(true);
    const denied = await request.post(`${apiOrigin}/api/v2/issues/${f.issue.summary.id}/move`, { headers: await coverageHeaders(), data: { expectedRevision: f.issue.summary.revision, targetStageId: f.edge.stage.id } }); expect(denied.status()).toBe(403); expect((await coverageRead(request, f.issue.summary.id)).summary.stage.id).toBe(f.issue.summary.stage.id);
    const allowed = await request.post(`${apiOrigin}/api/v2/issues/${f.issue.summary.id}/move`, { headers: await coverageHeaders('owner'), data: { expectedRevision: f.issue.summary.revision, targetStageId: f.edge.stage.id } }); expect(allowed.status()).toBe(200); expect((await coverageRead(request, f.issue.summary.id)).summary.stage.id).toBe(f.edge.stage.id);
  });
});

test('retired person and choice values display authorized friendly names instead of database IDs', async ({ page, request }) => {
  const projectId = await coverageProject(request), person = await coverageDefinition(request, projectId, { kind: 'user', name: 'Historical reviewer' }), choice = await coverageDefinition(request, projectId, { kind: 'choice', name: 'Historical outcome' });
  const root = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/configuration`, { headers: await coverageHeaders('owner') }); const cfg = zConfigurationView.parse(await root.json()), optionId = crypto.randomUUID();
  const option = await request.put(`${apiOrigin}/api/v2/projects/${projectId}/fields/${choice.id}/options/${optionId}`, { headers: await coverageHeaders('owner'), data: { expectedRevision: cfg.revision, name: 'Accepted historical outcome', position: '1', retired: false } }); expect(option.status()).toBe(201);
  const issue = await coverageCreate(request, projectId, { fieldValues: [{ fieldId: person.id, value: { kind: 'user', userId: memberId } }, { fieldId: choice.id, value: { kind: 'choice', optionId } }] });
  await coverageDefinition(request, projectId, { ...person, retired: true }); await coverageDefinition(request, projectId, { ...choice, retired: true });
  await signIn(page, 'owner', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  await webCase('UC-FLD-0073', async () => {
    const custom = page.locator('gg-custom-fields'); await expect(custom).toContainText('Historical reviewer · Retired: مطور تجريبي'); await expect(custom).toContainText('Historical outcome · Retired: Accepted historical outcome'); await expect(custom).not.toContainText(memberId); await expect(custom).not.toContainText(optionId);
    const values = await coverageFields(request, issue.summary.id); expect(values.values).toEqual(expect.arrayContaining([{ fieldId: person.id, value: { kind: 'user', userId: memberId } }, { fieldId: choice.id, value: { kind: 'choice', optionId } }]));
  });
});

test('field conflict review refreshes current definitions while keeping the typed draft', async ({ page, request }) => {
  const projectId = await coverageProject(request), field = await coverageDefinition(request, projectId, { kind: 'text', name: 'Original acceptance wording' }), choice = await coverageDefinition(request, projectId, { kind: 'choice', name: 'Current review outcome' });
  const saveOption = async (id: string, name: string, position: string, retired: boolean) => {
    const root = await request.get(`${apiOrigin}/api/v2/projects/${projectId}/configuration`, { headers: await coverageHeaders('owner') }); const cfg = zConfigurationView.parse(await root.json());
    const saved = await request.put(`${apiOrigin}/api/v2/projects/${projectId}/fields/${choice.id}/options/${id}`, { headers: await coverageHeaders('owner'), data: { expectedRevision: cfg.revision, name, position, retired } }); expect([200, 201]).toContain(saved.status());
  };
  const oldOption = crypto.randomUUID(), newOption = crypto.randomUUID(); await saveOption(oldOption, 'Earlier outcome', '1', false);
  const issue = await coverageCreate(request, projectId, { fieldValues: [{ fieldId: choice.id, value: { kind: 'choice', optionId: oldOption } }] });
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const custom = page.locator('gg-custom-fields'); await custom.getByLabel(field.name, { exact: true }).fill('مسودة معيار القبول');
  await coverageDefinition(request, projectId, { ...field, name: 'Current acceptance wording' }); await coverageDefinition(request, projectId, { kind: 'text', name: 'New current field' });
  await saveOption(oldOption, 'Earlier outcome', '1', true); await saveOption(newOption, 'Current eligible outcome', '2', false);
  const changed = await request.put(`${apiOrigin}/api/v2/issues/${issue.summary.id}`, { headers: await coverageHeaders(), data: { expectedRevision: issue.summary.revision, editable: { ...modernEditable(issue), description: 'Concurrent issue change' } } }); expect(changed.status()).toBe(200);
  await custom.getByRole('button', { name: 'Save fields', exact: true }).click();
  await webCase('UC-FLD-0074', async () => {
    await custom.getByRole('button', { name: 'Review current issue', exact: true }).click(); await expect(custom.getByLabel('Current acceptance wording', { exact: true })).toHaveValue('مسودة معيار القبول'); await expect(custom.getByLabel('Original acceptance wording', { exact: true })).toHaveCount(0); await expect(custom.getByLabel('New current field', { exact: true })).toBeVisible();
    await custom.getByRole('combobox', { name: choice.name, exact: true }).focus(); await expect(custom.getByRole('option', { name: 'Current eligible outcome', exact: true })).toBeVisible(); await expect(custom.getByRole('option', { name: 'Earlier outcome', exact: true })).toHaveCount(0); await expect(custom.getByRole('button', { name: 'Remove Earlier outcome', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Done choosing', exact: true }).click();
    await custom.getByRole('button', { name: 'Save fields', exact: true }).click(); await expect.poll(async () => (await coverageFields(request, issue.summary.id)).values).toContainEqual({ fieldId: field.id, value: { kind: 'text', text: 'مسودة معيار القبول' } });
  });
});

test('same-SPA account switching clears the previous custom-field draft', async ({ page, request }) => {
  const projectId = await coverageProject(request), field = await coverageDefinition(request, projectId, { kind: 'text', name: 'Session scoped evidence' }), issue = await coverageCreate(request, projectId, { fieldValues: [{ fieldId: field.id, value: { kind: 'text', text: 'Persisted evidence' } }] });
  await signIn(page, 'member', '/issues/' + issue.summary.id, new RegExp('^' + issue.summary.title + '$'));
  const custom = page.locator('gg-custom-fields'); await custom.getByLabel(field.name, { exact: true }).fill('Previous account private field draft'); await expect(custom.getByRole('button', { name: 'Save fields', exact: true })).toBeVisible();
  const marker = crypto.randomUUID(); await page.locator('html').evaluate((element, value) => element.setAttribute('data-field-session-fixture', value), marker);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await fillCredentials(page, 'owner'); await page.getByRole('button', { name: 'Sign in locally', exact: true }).click(); await expect(page.getByRole('heading', { name: /Welcome,/, level: 1 })).toBeVisible(); await expect(page.locator('html')).toHaveAttribute('data-field-session-fixture', marker);
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Issues', exact: true }).click(); await page.getByRole('link', { name: issue.summary.key + ' · ' + issue.summary.title, exact: true }).click();
  await webCase('UC-SHL-0087', async () => { await expect(custom.getByLabel(field.name, { exact: true })).toHaveValue('Persisted evidence'); await expect(custom.getByRole('button', { name: 'Save fields', exact: true })).toHaveCount(0); await expect(custom).not.toContainText('Previous account private field draft'); });
});
