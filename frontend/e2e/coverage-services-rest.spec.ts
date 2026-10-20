// Draft only: each command uses the published HTTP path/method, real REST identity, exact status/schema and readbacks.
import { expect, type APIRequestContext } from '@playwright/test';
import { z } from 'zod';
import { test } from './support/browser-test';
import { localFixturesAvailable } from './support/session';
import { memberId, viewerId, ownerId } from './support/coverage-access';
import { restSuccess, restFailure, restCase as step } from './support/coverage-rest';
import {
  zMe, zSavedProjectView, zProjectView, zPageProjectView, zProjectFailureBody,
  zPageBoardSummary, zSavedMembershipView, zPageMembershipView,
  zPageMembershipCandidateView, zPageUserSummary, zIdentityFailureBody,
  zSavedUserView, zPageUserView, zSavedIssueView, zIssueView,
  zNotificationPreferencesView, zSavedNotificationPreferencesView,
  zNotificationFailureBody, zSavedWatchView, zSavedCommentView,
  zPageNotificationView, zNotificationView, zInboxSummary,
  zSavedNotificationView, zSavedMarkAllResult, zImportPreview,
  zIssueFailureBody, zSavedImportResult, zIssueExport,
  zActivationReadiness, zSavedConfigurationView, zModernIssueView,
  zPageModernIssueSummary, zConfigurationView, zSavedTypeSaved, zPageTypeView,
  zSavedPrioritySaved, zPageBindingView, zSavedModernIssueView,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated real REST server, approved local identities and PostgreSQL.');
test.use({ trace: 'off' });

const projectKey = () => 'M' + crypto.randomUUID().replaceAll('-', '').slice(0, 8);

async function project(request: APIRequestContext, modern = false) {
  const created = await restSuccess(request, 'create_project', { key: projectKey(), name: 'REST service fixture ' + crypto.randomUUID(), retryReference: crypto.randomUUID() }, zSavedProjectView);
  const projectId = created.result.id;
  for (const [userId, role] of [[memberId, 'member'], [viewerId, 'viewer']] as const) {
    await restSuccess(request, 'set_membership', { projectId, userId, role, expectedRevision: '0', retryReference: crypto.randomUUID() }, zSavedMembershipView);
  }
  if (modern) {
    const ready = await restSuccess(request, 'get_project_activation', { projectId }, zActivationReadiness);
    expect(ready.ready).toBe(true);
    const activated = await restSuccess(request, 'activate_project_core', {
      projectId, expectedRevision: ready.configuration.revision, expectedProjectRevision: ready.projectRevision,
      expectedBoardId: ready.defaultBoardId, expectedBoardRevision: ready.defaultBoardRevision,
      confirm: true, retryReference: crypto.randomUUID(),
    }, zSavedConfigurationView);
    expect(activated.result.mode).toBe('modern');
  }
  return created.result;
}

async function allProjects(request: APIRequestContext, role = 'owner', includeArchived = false) {
  const items: z.infer<typeof zProjectView>[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: z.infer<typeof zPageProjectView> = await restSuccess(request, 'list_projects', { includeArchived, page: { limit: 100, ...(cursor ? { cursor } : {}) } }, zPageProjectView, role);
    items.push(...page.items); cursor = page.nextCursor;
    if (cursor) { expect(cursors.has(cursor)).toBe(false); cursors.add(cursor); }
  } while (cursor);
  return items;
}

async function allUsers(request: APIRequestContext) {
  const items: z.infer<typeof zPageUserView>['items'] = []; const cursors = new Set<string>();
  let cursor: string | null = null;
  do {
    const page: z.infer<typeof zPageUserView> = await restSuccess(request, 'list_users', { page: { limit: 100, ...(cursor ? { cursor } : {}) } }, zPageUserView);
    items.push(...page.items); cursor = page.nextCursor;
    if (cursor) { expect(cursors.has(cursor)).toBe(false); cursors.add(cursor); }
  } while (cursor);
  return items;
}

test('REST project creation validates the published contract, creates its default board and replays only accepted intent', async ({ request }) => {
  const input = { key: projectKey().toLowerCase(), name: 'REST metadata', description: 'A real HTTP-created project', retryReference: crypto.randomUUID() };
  const created = await step('UC-PRJ-0011', async () => {
    const saved = await restSuccess(request, 'create_project', input, zSavedProjectView);
    expect(saved.result).toMatchObject({ key: input.key.toUpperCase(), name: input.name, description: input.description, archived: false, effectiveRole: 'administrator' });
    const boards = await restSuccess(request, 'list_boards', { projectId: saved.result.id }, zPageBoardSummary);
    expect(boards.items).toHaveLength(1);
    expect(boards.items[0]).toMatchObject({ projectId: saved.result.id, default: true, name: 'All Issues' });
    return saved;
  });
  await step('UC-PRJ-0012', async () => {
    expect((await restSuccess(request, 'get_project', { projectId: created.result.id }, zProjectView)).key).toBe(input.key.toUpperCase());
  });
  await step('UC-PRJ-0033', async () => {
    const replay = await restSuccess(request, 'create_project', input, zSavedProjectView);
    expect(replay.receipt).toMatchObject({ replayed: true, eventId: created.receipt.eventId });
    expect(replay.result).toEqual(created.result);
    expect((await allProjects(request)).filter(value => value.key === created.result.key)).toHaveLength(1);
  });
  for (const [id, values] of [
    ['UC-PRJ-0013', { key: '1INVALID' }],
    ['UC-PRJ-0015', { name: '' }],
    ['UC-PRJ-0016', { name: 'x'.repeat(101) }],
    ['UC-PRJ-0017', { description: 'x'.repeat(2001) }],
    ['UC-PRJ-0064', { key: ' ' + projectKey() + ' ' }],
  ] as const) {
    await step(id, async () => {
      const failure = await restFailure(request, 'create_project', { ...input, key: projectKey(), ...values, retryReference: crypto.randomUUID() }, zProjectFailureBody, 'validation_failed');
      expect(failure.current).toBeNull();
    });
  }
  await step('UC-PRJ-0014', async () => {
    const failure = await restFailure(request, 'create_project', { ...input, retryReference: crypto.randomUUID() }, zProjectFailureBody, 'validation_failed');
    expect(failure.error.fieldErrors?.some(value => value.field === 'key')).toBe(true);
  });
  await step('UC-PRJ-0026', async () => {
    await restFailure(request, 'create_project', { key: projectKey(), name: 'Not allowed', retryReference: crypto.randomUUID() }, zProjectFailureBody, 'forbidden', 'member');
  });
});

test('REST project reads, metadata permissions and lifecycle preserve current revision and scoped visibility', async ({ request }) => {
  let current = await project(request);
  const outsider = await restSuccess(request, 'create_project', { key: projectKey(), name: 'Only company administrator', retryReference: crypto.randomUUID() }, zSavedProjectView);
  await step('UC-PRJ-0001', async () => {
    const visible = await allProjects(request, 'member');
    expect(visible.find(value => value.id === current.id)?.effectiveRole).toBe('member');
    expect(visible.map(value => value.id)).not.toContain(outsider.result.id);
  });
  await step('UC-PRJ-0066', async () => {
    const detail = await restSuccess(request, 'get_project', { projectId: current.id }, zProjectView, 'viewer');
    expect(detail).toMatchObject({ id: current.id, key: current.key, name: current.name, description: current.description, effectiveRole: 'viewer' });
  });
  await step('UC-PRJ-0067', async () => {
    const first = await restSuccess(request, 'list_projects', { page: { limit: 1 } }, zPageProjectView);
    expect(first.items).toHaveLength(1); expect(first.nextCursor).toEqual(expect.any(String));
    const next = await restSuccess(request, 'list_projects', { page: { limit: 1, cursor: first.nextCursor } }, zPageProjectView);
    expect(next.items).toHaveLength(1); expect(next.items[0]?.id).not.toBe(first.items[0]?.id); expect(next.totalMatching).toBe(first.totalMatching);
  });
  await step('UC-PRJ-0034', async () => {
    const failure = await restFailure(request, 'get_project', { projectId: outsider.result.id }, zProjectFailureBody, 'unavailable_record', 'member');
    expect(failure.current).toBeNull(); expect(failure.error.message).not.toContain(outsider.result.name);
  });
  await step('UC-PRJ-0050', async () => {
    await restFailure(request, 'list_memberships', { projectId: outsider.result.id }, zIdentityFailureBody, 'unavailable_record', 'member');
    await restFailure(request, 'set_membership', { projectId: outsider.result.id, userId: viewerId, expectedRevision: '0', role: 'member', retryReference: crypto.randomUUID() }, zIdentityFailureBody, 'unavailable_record', 'member');
  });
  const original = current;
  await step('UC-PRJ-0022', async () => {
    current = (await restSuccess(request, 'update_project', { projectId: current.id, expectedRevision: current.revision, name: 'A new REST project name', description: current.description, retryReference: crypto.randomUUID() }, zSavedProjectView)).result;
    expect(current.name).toBe('A new REST project name'); expect(current.key).toBe(original.key);
  });
  await step('UC-PRJ-0023', async () => {
    current = (await restSuccess(request, 'update_project', { projectId: current.id, expectedRevision: current.revision, name: current.name, description: 'Updated from REST', retryReference: crypto.randomUUID() }, zSavedProjectView)).result;
    expect(current.description).toBe('Updated from REST');
  });
  await step('UC-PRJ-0070', async () => {
    const conflict = await restFailure(request, 'update_project', { projectId: current.id, expectedRevision: original.revision, name: 'Stale overwrite', description: '', retryReference: crypto.randomUUID() }, zProjectFailureBody, 'conflict');
    expect(conflict.current).toEqual(current);
    expect((await restSuccess(request, 'get_project', { projectId: current.id }, zProjectView)).name).toBe(current.name);
  });
  await step('UC-PRJ-0065', async () => {
    current = (await restSuccess(request, 'update_project', { projectId: current.id, expectedRevision: current.revision, name: 'مشروع عربي 😀', description: 'وصف عربي محفوظ', retryReference: crypto.randomUUID() }, zSavedProjectView)).result;
    expect(current).toMatchObject({ name: 'مشروع عربي 😀', description: 'وصف عربي محفوظ' });
    expect(await restSuccess(request, 'get_project', { projectId: current.id }, zProjectView)).toEqual(current);
  });
  await step('UC-PRJ-0069', async () => {
    await restFailure(request, 'update_project', { projectId: current.id, expectedRevision: current.revision, name: current.name, description: current.description, key: 'RENAMED', retryReference: crypto.randomUUID() }, zProjectFailureBody, 'validation_failed');
    expect((await restSuccess(request, 'get_project', { projectId: current.id }, zProjectView)).key).toBe(original.key);
  });
  const membership = (await restSuccess(request, 'list_memberships', { projectId: current.id }, zPageMembershipView)).items.find(value => value.user.id === memberId)!;
  await restSuccess(request, 'set_membership', { projectId: current.id, userId: memberId, expectedRevision: membership.revision, role: 'project_admin', retryReference: crypto.randomUUID() }, zSavedMembershipView);
  await step('UC-PRJ-0025', async () => {
    current = (await restSuccess(request, 'update_project', { projectId: current.id, expectedRevision: current.revision, name: 'Configured by project administrator', description: current.description, retryReference: crypto.randomUUID() }, zSavedProjectView, 'member')).result;
    expect(current.name).toBe('Configured by project administrator');
  });
  await step('UC-PRJ-0031', async () => {
    await restFailure(request, 'archive_project', { projectId: current.id, expectedRevision: current.revision, retryReference: crypto.randomUUID() }, zProjectFailureBody, 'forbidden', 'member');
  });
  await step('UC-PRJ-0027', async () => {
    current = (await restSuccess(request, 'archive_project', { projectId: current.id, expectedRevision: current.revision, retryReference: crypto.randomUUID() }, zSavedProjectView)).result;
    expect(current.archived).toBe(true);
  });
  await step('UC-PRJ-0029', async () => {
    const unchanged = await restSuccess(request, 'archive_project', { projectId: current.id, expectedRevision: current.revision, retryReference: crypto.randomUUID() }, zSavedProjectView);
    expect(unchanged.result).toEqual(current); expect(unchanged.receipt.eventId).toBeNull();
  });
  await step('UC-PRJ-0007', async () => { expect((await allProjects(request, 'member', true)).find(value => value.id === current.id)?.archived).toBe(true); });
  await step('UC-PRJ-0008', async () => { expect((await allProjects(request, 'member')).map(value => value.id)).not.toContain(current.id); });
  await step('UC-PRJ-0063', async () => {
    const failure = await restFailure(request, 'set_membership', { projectId: current.id, userId: viewerId, expectedRevision: '1', role: 'member', retryReference: crypto.randomUUID() }, zIdentityFailureBody, 'forbidden', 'member');
    expect(failure.error.message).toMatch(/archived.*read.only/i);
  });
  await step('UC-PRJ-0055', async () => {
    const retained = (await restSuccess(request, 'list_memberships', { projectId: current.id }, zPageMembershipView)).items.find(value => value.user.id === viewerId)!;
    const changed = await restSuccess(request, 'set_membership', { projectId: current.id, userId: viewerId, expectedRevision: retained.revision, role: 'member', retryReference: crypto.randomUUID() }, zSavedMembershipView);
    expect(changed.result).toMatchObject({ role: 'member', removed: false });
    const removed = await restSuccess(request, 'remove_membership', { projectId: current.id, userId: viewerId, expectedRevision: changed.result.revision, retryReference: crypto.randomUUID() }, zSavedMembershipView);
    expect(removed.result.removed).toBe(true);
  });
  await step('UC-PRJ-0028', async () => {
    current = (await restSuccess(request, 'restore_project', { projectId: current.id, expectedRevision: current.revision, retryReference: crypto.randomUUID() }, zSavedProjectView)).result;
    expect(current.archived).toBe(false);
    expect((await restSuccess(request, 'get_project', { projectId: current.id }, zProjectView, 'member')).effectiveRole).toBe('project_admin');
  });
  await step('UC-PRJ-0030', async () => {
    const unchanged = await restSuccess(request, 'restore_project', { projectId: current.id, expectedRevision: current.revision, retryReference: crypto.randomUUID() }, zSavedProjectView);
    expect(unchanged.result).toEqual(current); expect(unchanged.receipt.eventId).toBeNull();
  });
});

test('REST membership commands preserve current roles, removal history, private access and eligible people', async ({ request }) => {
  const target = await project(request);
  const root = { projectId: target.id };
  let membership = (await restSuccess(request, 'list_memberships', root, zPageMembershipView)).items.find(value => value.user.id === memberId)!;
  await step('UC-PRJ-0035', async () => { expect((await restSuccess(request, 'list_memberships', root, zPageMembershipView)).items.map(value => value.user.id)).toEqual(expect.arrayContaining([memberId, viewerId])); });
  await step('UC-PRJ-0036', async () => {
    const first = await restSuccess(request, 'list_memberships', { ...root, page: { limit: 1 } }, zPageMembershipView);
    expect(first.items).toHaveLength(1); expect(first.nextCursor).toEqual(expect.any(String));
    const next = await restSuccess(request, 'list_memberships', { ...root, page: { limit: 1, cursor: first.nextCursor } }, zPageMembershipView);
    expect(next.items).toHaveLength(1); expect(next.items[0]?.user.id).not.toBe(first.items[0]?.user.id);
  });
  for (const [id, role] of [['UC-PRJ-0042', 'viewer'], ['UC-PRJ-0043', 'project_admin'], ['UC-PRJ-0041', 'member']] as const) {
    await step(id, async () => {
      membership = (await restSuccess(request, 'set_membership', { ...root, userId: memberId, role, expectedRevision: membership.revision, retryReference: crypto.randomUUID() }, zSavedMembershipView)).result;
      expect(membership).toMatchObject({ projectId: target.id, user: { id: memberId }, role, removed: false });
      expect((await restSuccess(request, 'get_project', root, zProjectView, 'member')).effectiveRole).toBe(role);
    });
  }
  await step('UC-PRJ-0044', async () => {
    const staleRevision = membership.revision;
    membership = (await restSuccess(request, 'set_membership', { ...root, userId: memberId, role: 'project_admin', expectedRevision: membership.revision, retryReference: crypto.randomUUID() }, zSavedMembershipView)).result;
    expect(membership.role).toBe('project_admin');
    await step('UC-PRJ-0071', async () => {
      const conflict = await restFailure(request, 'set_membership', { ...root, userId: memberId, role: 'viewer', expectedRevision: staleRevision, retryReference: crypto.randomUUID() }, zIdentityFailureBody, 'conflict');
      expect(conflict.current).toEqual(membership);
      expect((await restSuccess(request, 'get_project', root, zProjectView, 'member')).effectiveRole).toBe('project_admin');
    });
  });
  await step('UC-PRJ-0047', async () => {
    const noop = await restSuccess(request, 'set_membership', { ...root, userId: memberId, role: membership.role, expectedRevision: membership.revision, retryReference: crypto.randomUUID() }, zSavedMembershipView);
    expect(noop.result).toEqual(membership); expect(noop.receipt.eventId).toBeNull();
  });
  await step('UC-PRJ-0051', async () => { await restFailure(request, 'list_memberships', root, zIdentityFailureBody, 'forbidden', 'viewer'); });
  await step('UC-PRJ-0052', async () => { await restFailure(request, 'set_membership', { ...root, userId: memberId, expectedRevision: membership.revision, role: 'owner', retryReference: crypto.randomUUID() }, zIdentityFailureBody, 'validation_failed'); });
  await step('UC-PRJ-0045', async () => {
    membership = (await restSuccess(request, 'remove_membership', { ...root, userId: memberId, expectedRevision: membership.revision, retryReference: crypto.randomUUID() }, zSavedMembershipView)).result;
    expect(membership.removed).toBe(true);
    await restFailure(request, 'get_project', root, zProjectFailureBody, 'unavailable_record', 'member');
  });
  await step('UC-PRJ-0037', async () => {
    expect((await restSuccess(request, 'list_memberships', root, zPageMembershipView)).items.map(value => value.user.id)).not.toContain(memberId);
    expect((await restSuccess(request, 'list_memberships', { ...root, includeRemoved: true }, zPageMembershipView)).items.find(value => value.user.id === memberId)?.removed).toBe(true);
  });
  await step('UC-PRJ-0059', async () => {
    for (const tool of ['list_assignees', 'list_mention_candidates']) expect((await restSuccess(request, tool, root, zPageUserSummary)).items.map(value => value.id)).not.toContain(memberId);
  });
  await step('UC-PRJ-0046', async () => {
    membership = (await restSuccess(request, 'set_membership', { ...root, userId: memberId, expectedRevision: membership.revision, role: 'member', retryReference: crypto.randomUUID() }, zSavedMembershipView)).result;
    expect(membership.removed).toBe(false);
    expect((await restSuccess(request, 'get_project', root, zProjectView, 'member')).effectiveRole).toBe('member');
  });
  await step('UC-PRJ-0049', async () => {
    const intent = { ...root, userId: memberId, expectedRevision: membership.revision, role: 'member', retryReference: crypto.randomUUID() };
    const first = await restSuccess(request, 'set_membership', intent, zSavedMembershipView);
    const replay = await restSuccess(request, 'set_membership', intent, zSavedMembershipView);
    expect(replay.result).toEqual(first.result); expect(replay.receipt.replayed).toBe(true); expect(replay.receipt.eventId).toBe(first.receipt.eventId);
  });
  await step('UC-PRJ-0038', async () => {
    const candidates = await restSuccess(request, 'list_membership_candidates', { ...root, query: 'مطور تجريبي' }, zPageMembershipCandidateView);
    expect(candidates.items.every(value => value.active)).toBe(true);
    expect(candidates.items.map(value => value.id)).toEqual([memberId]);
  });
  await step('UC-PRJ-0068', async () => {
    const first = await restSuccess(request, 'list_membership_candidates', { ...root, page: { limit: 1 } }, zPageMembershipCandidateView);
    expect(first.items).toHaveLength(1); expect(first.nextCursor).toEqual(expect.any(String));
    const next = await restSuccess(request, 'list_membership_candidates', { ...root, page: { limit: 1, cursor: first.nextCursor } }, zPageMembershipCandidateView);
    expect(next.items).toHaveLength(1); expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
  });
  await step('UC-PRJ-0040', async () => {
    const candidates = await restSuccess(request, 'list_membership_candidates', { ...root, query: 'مطور' }, zPageMembershipCandidateView);
    expect(candidates.items.map(value => value.id)).toEqual([memberId]); expect(candidates.items.every(value => value.displayName.includes('مطور'))).toBe(true);
  });
  await step('UC-PRJ-0056', async () => { expect((await restSuccess(request, 'list_assignees', root, zPageUserSummary, 'member')).items.map(value => value.id)).toContain(memberId); });
  await step('UC-PRJ-0057', async () => { expect((await restSuccess(request, 'list_assignees', root, zPageUserSummary, 'member')).items.map(value => value.id)).not.toContain(viewerId); });
  await step('UC-PRJ-0058', async () => { expect((await restSuccess(request, 'list_mention_candidates', root, zPageUserSummary, 'viewer')).items.map(value => value.id)).toEqual(expect.arrayContaining([memberId, viewerId])); });
  await step('UC-PRJ-0060', async () => { expect((await restSuccess(request, 'list_assignees', { ...root, query: 'مطور تجريبي' }, zPageUserSummary, 'member')).items.map(value => value.id)).toEqual([memberId]); });
  await step('UC-PRJ-0061', async () => {
    const first = await restSuccess(request, 'list_mention_candidates', { ...root, page: { limit: 1 } }, zPageUserSummary, 'member');
    expect(first.items).toHaveLength(1); expect(first.nextCursor).toEqual(expect.any(String));
    const next = await restSuccess(request, 'list_mention_candidates', { ...root, page: { limit: 1, cursor: first.nextCursor } }, zPageUserSummary, 'member');
    expect(next.items).toHaveLength(1); expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
  });
  await step('UC-PRJ-0062', async () => { await restFailure(request, 'list_assignees', { ...root, query: 'x'.repeat(101) }, zIdentityFailureBody, 'validation_failed', 'member'); });
});

test('REST company identity, directory and account commands enforce approval boundaries and replay revisions', async ({ request }) => {
  await step('UC-ACC-0031', async () => {
    const me = await restSuccess(request, 'get_me', {}, zMe, 'member');
    expect(me).toMatchObject({ userId: memberId, email: 'member@example.test', displayName: 'مطور تجريبي', administrator: false });
    expect(me.companyTimeZone).toEqual(expect.any(String)); expect(Object.keys(me).sort()).toEqual(['administrator', 'companyTimeZone', 'displayName', 'email', 'userId']);
  });
  await step('UC-ACC-0036', async () => {
    const directory = await allUsers(request);
    expect(directory.every(value => value.approved)).toBe(true); expect(directory.map(value => value.id)).toEqual(expect.arrayContaining([ownerId, memberId, viewerId]));
  });
  await step('UC-ACC-0037', async () => {
    const first = await restSuccess(request, 'list_users', { page: { limit: 1 } }, zPageUserView);
    expect(first.items).toHaveLength(1); expect(first.nextCursor).toEqual(expect.any(String));
    const next = await restSuccess(request, 'list_users', { page: { limit: 1, cursor: first.nextCursor } }, zPageUserView);
    expect(next.items).toHaveLength(1); expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
  });
  await step('UC-ACC-0038', async () => { await restFailure(request, 'list_users', {}, zIdentityFailureBody, 'forbidden', 'member'); });
  const finalAdministrators = (await allUsers(request)).filter(value => value.active && value.administrator);
  expect(finalAdministrators.map(value => value.id)).toEqual([ownerId]);
  const finalAdministrator = finalAdministrators[0]!;
  for (const [id, patch] of [['UC-ACC-0051', { active: false }], ['UC-ACC-0052', { administrator: false }]] as const) {
    await step(id, async () => {
      const failure = await restFailure(request, 'update_user', { userId: ownerId, expectedRevision: finalAdministrator.revision, email: finalAdministrator.email, displayName: finalAdministrator.displayName, active: true, administrator: true, ...patch, retryReference: crypto.randomUUID() }, zIdentityFailureBody, 'validation_failed');
      expect(failure.error.message).toMatch(/at least one active Administrator/i);
      expect((await allUsers(request)).find(value => value.id === ownerId)).toEqual(finalAdministrator);
    });
  }
  const intent = { email: 'mcp-' + crypto.randomUUID() + '@example.test', displayName: 'REST account', administrator: false, retryReference: crypto.randomUUID() };
  let current = await step('UC-ACC-0039', async () => {
    const saved = await restSuccess(request, 'approve_user', intent, zSavedUserView);
    expect(saved.result).toMatchObject({ email: intent.email, displayName: intent.displayName, administrator: false, active: true, approved: true });
    expect(Object.keys(saved.result).some(key => /password|token|secret/i.test(key))).toBe(false);
    return saved.result;
  });
  for (const [id, patch] of [['UC-ACC-0042', { email: 'invalid-address' }], ['UC-ACC-0044', { displayName: 'x'.repeat(101) }]] as const) {
    await step(id, async () => { await restFailure(request, 'approve_user', { ...intent, email: 'mcp-' + crypto.randomUUID() + '@example.test', ...patch, retryReference: crypto.randomUUID() }, zIdentityFailureBody, 'validation_failed'); });
  }
  await step('UC-ACC-0043', async () => { await restFailure(request, 'approve_user', { ...intent, retryReference: crypto.randomUUID() }, zIdentityFailureBody, 'validation_failed'); });
  const update = async (patch: Partial<Pick<typeof current, 'email' | 'displayName' | 'active' | 'administrator'>>) => {
    current = (await restSuccess(request, 'update_user', { userId: current.id, expectedRevision: current.revision, email: current.email, displayName: current.displayName, active: current.active, administrator: current.administrator, ...patch, retryReference: crypto.randomUUID() }, zSavedUserView)).result;
    return current;
  };
  await step('UC-ACC-0045', async () => { const email = 'mcp-edited-' + crypto.randomUUID() + '@example.test'; expect((await update({ email })).email).toBe(email); });
  await step('UC-ACC-0063', async () => { const revision = current.revision; expect((await update({ displayName: 'Updated REST account' })).displayName).toBe('Updated REST account'); expect(current.revision).not.toBe(revision); });
  await step('UC-ACC-0060', async () => {
    await update({ displayName: 'حساب عربي 😀' }); expect(current.displayName).toBe('حساب عربي 😀');
    let cursor: string | null = null; let found: z.infer<typeof zSavedUserView>['result'] | undefined;
    do {
      const page: z.infer<typeof zPageUserView> = await restSuccess(request, 'list_users', { page: { limit: 100, ...(cursor ? { cursor } : {}) } }, zPageUserView);
      found = page.items.find(value => value.id === current.id); cursor = page.nextCursor;
    } while (!found && cursor);
    expect(found?.displayName).toBe('حساب عربي 😀');
  });
  await step('UC-ACC-0061', async () => {
    const conflict = await restFailure(request, 'update_user', { userId: current.id, expectedRevision: '1', email: current.email, displayName: 'Stale edit', active: current.active, administrator: current.administrator, retryReference: crypto.randomUUID() }, zIdentityFailureBody, 'conflict');
    expect(conflict.current).toEqual(current);
  });
  await step('UC-ACC-0047', async () => { expect((await update({ active: false })).active).toBe(false); });
  await step('UC-ACC-0048', async () => { expect((await update({ active: true })).active).toBe(true); });
  await step('UC-ACC-0049', async () => { expect((await update({ administrator: true })).administrator).toBe(true); });
  await step('UC-ACC-0050', async () => { expect((await update({ administrator: false })).administrator).toBe(false); });
  await step('UC-ACC-0055', async () => {
    const body = { userId: current.id, expectedRevision: current.revision, email: current.email, displayName: 'One accepted REST edit', active: current.active, administrator: current.administrator, retryReference: crypto.randomUUID() };
    const first = await restSuccess(request, 'update_user', body, zSavedUserView);
    const again = await restSuccess(request, 'update_user', body, zSavedUserView);
    expect(again.result).toEqual(first.result); expect(again.receipt).toMatchObject({ replayed: true, eventId: first.receipt.eventId }); current = again.result;
  });
  let administrator: z.infer<typeof zSavedUserView>['result'] | undefined;
  try {
    await step('UC-ACC-0040', async () => {
      administrator = (await restSuccess(request, 'approve_user', { email: 'mcp-admin-' + crypto.randomUUID() + '@example.test', displayName: 'Disposable REST administrator', administrator: true, retryReference: crypto.randomUUID() }, zSavedUserView)).result;
      expect(administrator).toMatchObject({ approved: true, active: true, administrator: true });
    });
  } finally {
    // Leave no additional active administrator, including after a failed assertion.
    if (administrator) await restSuccess(request, 'update_user', { userId: administrator.id, expectedRevision: administrator.revision, email: administrator.email, displayName: administrator.displayName, active: true, administrator: false, retryReference: crypto.randomUUID() }, zSavedUserView);
  }
});

test('REST get_me observes current administrator privilege independently of signed token creation time', async ({ request }) => {
  const before = (await allUsers(request)).find(value => value.id === memberId)!;
  const update = async (administrator: boolean) => {
    const current = (await allUsers(request)).find(value => value.id === memberId)!;
    return restSuccess(request, 'update_user', { userId: current.id, expectedRevision: current.revision, email: current.email, displayName: current.displayName, active: current.active, administrator, retryReference: crypto.randomUUID() }, zSavedUserView);
  };
  try {
    await step('UC-ACC-0059', async () => {
      await update(true); expect((await restSuccess(request, 'get_me', {}, zMe, 'member')).administrator).toBe(true);
      await update(false); expect((await restSuccess(request, 'get_me', {}, zMe, 'member')).administrator).toBe(false);
      await restFailure(request, 'list_users', {}, zIdentityFailureBody, 'forbidden', 'member');
    });
  } finally { await update(before.administrator); }
});

test('REST preferences validate typed choices and preserve the caller revision without changing other accounts', async ({ request }) => {
  const original = await restSuccess(request, 'get_notification_preferences', {}, zNotificationPreferencesView, 'member');
  const other = await restSuccess(request, 'get_notification_preferences', {}, zNotificationPreferencesView, 'viewer');
  let current = original;
  const save = async (patch: Partial<Pick<typeof current, 'inAppEnabled' | 'events' | 'emailMode' | 'dueReminders'>>) => {
    current = (await restSuccess(request, 'update_notification_preferences', { expectedRevision: current.revision, inAppEnabled: current.inAppEnabled, events: current.events, emailMode: current.emailMode, dueReminders: current.dueReminders, ...patch, retryReference: crypto.randomUUID() }, zSavedNotificationPreferencesView, 'member')).result;
    return current;
  };
  try {
    await step('UC-NTF-0043', async () => { expect(await restSuccess(request, 'get_notification_preferences', {}, zNotificationPreferencesView, 'member')).toEqual(original); });
    await step('UC-NTF-0045', async () => { expect((await save({ inAppEnabled: false })).inAppEnabled).toBe(false); });
    await step('UC-NTF-0044', async () => { expect((await save({ inAppEnabled: true })).inAppEnabled).toBe(true); });
    await step('UC-NTF-0046', async () => { expect((await save({ events: ['comment', 'due_date'] })).events).toEqual(['comment', 'due_date']); });
    for (const [id, emailMode] of [['UC-NTF-0050', 'instant'], ['UC-NTF-0051', 'daily'], ['UC-NTF-0049', 'off']] as const) await step(id, async () => { expect((await save({ emailMode })).emailMode).toBe(emailMode); });
    await step('UC-NTF-0053', async () => { const result = await save({ dueReminders: true }); expect(result.dueReminders).toBe(true); expect(result.events).toContain('due_date'); });
    for (const [id, patch] of [['UC-NTF-0055', { emailMode: 'weekly' }], ['UC-NTF-0056', { events: ['unknown'] }], ['UC-NTF-0057', { events: ['comment', 'comment'] }]] as const) {
      await step(id, async () => { await restFailure(request, 'update_notification_preferences', { expectedRevision: current.revision, inAppEnabled: current.inAppEnabled, events: current.events, emailMode: current.emailMode, dueReminders: current.dueReminders, ...patch, retryReference: crypto.randomUUID() }, zNotificationFailureBody, 'validation_failed', 'member'); });
    }
    await step('UC-NTF-0058', async () => {
      await restFailure(request, 'update_notification_preferences', { expectedRevision: original.revision, inAppEnabled: false, events: [], emailMode: 'off', dueReminders: false, retryReference: crypto.randomUUID() }, zNotificationFailureBody, 'conflict', 'member');
      expect(await restSuccess(request, 'get_notification_preferences', {}, zNotificationPreferencesView, 'member')).toEqual(current);
    });
    expect(await restSuccess(request, 'get_notification_preferences', {}, zNotificationPreferencesView, 'viewer')).toEqual(other);
  } finally {
    await save({ inAppEnabled: original.inAppEnabled, events: original.events, emailMode: original.emailMode, dueReminders: original.dueReminders });
  }
});

test('REST watch controls and private inbox reads, revisions and revocation use actual issue events', async ({ request }) => {
  const target = await project(request);
  const original = await restSuccess(request, 'get_notification_preferences', {}, zNotificationPreferencesView, 'viewer');
  let preferences = (await restSuccess(request, 'update_notification_preferences', { expectedRevision: original.revision, inAppEnabled: true, events: ['watching', 'comment', 'mention'], emailMode: 'off', dueReminders: false, retryReference: crypto.randomUUID() }, zSavedNotificationPreferencesView, 'viewer')).result;
  const issue = (await restSuccess(request, 'create_issue', { projectId: target.id, title: 'REST private inbox ' + crypto.randomUUID(), retryReference: crypto.randomUUID() }, zSavedIssueView)).result;
  const scope = { issueId: issue.summary.id };
  try {
    await step('UC-NTF-0001', async () => {
      const watched = await restSuccess(request, 'set_issue_watch', { ...scope, watching: true, retryReference: crypto.randomUUID() }, zSavedWatchView, 'member');
      expect(watched.result).toMatchObject({ ...scope, watching: true });
      expect((await restSuccess(request, 'get_issue', scope, zIssueView, 'member')).watching).toBe(true);
    });
    await step('UC-NTF-0003', async () => {
      const watched = await restSuccess(request, 'set_issue_watch', { ...scope, watching: true, retryReference: crypto.randomUUID() }, zSavedWatchView, 'viewer');
      expect(watched.result).toMatchObject({ ...scope, watching: true });
    });
    await step('UC-NTF-0004', async () => {
      const unwatched = await restSuccess(request, 'set_issue_watch', { ...scope, watching: false, retryReference: crypto.randomUUID() }, zSavedWatchView, 'member');
      expect(unwatched.result.watching).toBe(false);
      // The published legacy IssueView omits false watching values.
      expect((await restSuccess(request, 'get_issue', scope, zIssueView, 'member')).watching ?? false).toBe(false);
      expect((await restSuccess(request, 'get_issue', scope, zIssueView, 'viewer')).watching).toBe(true);
    });
    await step('UC-NTF-0005', async () => {
      const body = { ...scope, watching: true, retryReference: crypto.randomUUID() };
      const first = await restSuccess(request, 'set_issue_watch', body, zSavedWatchView, 'viewer');
      const again = await restSuccess(request, 'set_issue_watch', body, zSavedWatchView, 'viewer');
      expect(again.result).toEqual(first.result); expect(again.receipt.replayed).toBe(true);
    });
    const emitted: string[] = [];
    // Selected mention IDs must match the formatted references in the real editor contract.
    for (const html of ['<p>First REST discussion <span data-user-id="' + viewerId + '">viewer</span></p>', '<p>Second REST discussion <span data-user-id="' + viewerId + '">viewer</span></p>']) {
      await restSuccess(request, 'create_comment', { ...scope, body: { html, mentionUserIds: [viewerId], pictureIds: [] }, retryReference: crypto.randomUUID() }, zSavedCommentView);
      const inbox = await restSuccess(request, 'list_notifications', { page: { limit: 100 } }, zPageNotificationView, 'viewer');
      const own = inbox.items.filter(value => value.issueId === issue.summary.id && !emitted.includes(value.id));
      expect(own).toHaveLength(1); emitted.push(own[0]!.id);
    }
    let notification = await step('UC-NTF-0019', async () => {
      const inbox = await restSuccess(request, 'list_notifications', { page: { limit: 100 } }, zPageNotificationView, 'viewer');
      const own = inbox.items.find(value => value.id === emitted[0]);
      expect(own).toMatchObject({ issueId: issue.summary.id, issueKey: issue.summary.key, projectId: target.id, actor: { id: ownerId }, readAt: null }); return own!;
    });
    await step('UC-NTF-0020', async () => {
      const before = await restSuccess(request, 'get_inbox_summary', {}, zInboxSummary, 'viewer');
      const after = await restSuccess(request, 'get_inbox_summary', {}, zInboxSummary, 'viewer');
      expect(after).toEqual(before); expect(after.unreadCount).toBeGreaterThanOrEqual(2);
      expect((await restSuccess(request, 'get_notification', { notificationId: notification.id }, zNotificationView, 'viewer')).readAt).toBeNull();
    });
    await step('UC-NTF-0021', async () => {
      expect(await restSuccess(request, 'get_notification', { notificationId: notification.id }, zNotificationView, 'viewer')).toEqual(notification);
      expect((await restSuccess(request, 'get_notification', { notificationId: notification.id }, zNotificationView, 'viewer')).revision).toBe(notification.revision);
    });
    await step('UC-NTF-0026', async () => { await restFailure(request, 'set_notification_read', { notificationId: notification.id, expectedRevision: '0', read: true, retryReference: crypto.randomUUID() }, zNotificationFailureBody, 'validation_failed', 'viewer'); });
    const stale = notification;
    await step('UC-NTF-0023', async () => {
      notification = (await restSuccess(request, 'set_notification_read', { notificationId: notification.id, expectedRevision: notification.revision, read: true, retryReference: crypto.randomUUID() }, zSavedNotificationView, 'viewer')).result;
      expect(notification.readAt).not.toBeNull(); expect(notification.revision).not.toBe(stale.revision);
    });
    await step('UC-NTF-0025', async () => {
      const noop = await restSuccess(request, 'set_notification_read', { notificationId: notification.id, expectedRevision: notification.revision, read: true, retryReference: crypto.randomUUID() }, zSavedNotificationView, 'viewer');
      expect(noop.result).toEqual(notification); expect(noop.receipt.eventId).toBeNull();
    });
    await step('UC-NTF-0027', async () => {
      const conflict = await restFailure(request, 'set_notification_read', { notificationId: notification.id, expectedRevision: stale.revision, read: false, retryReference: crypto.randomUUID() }, zNotificationFailureBody, 'conflict', 'viewer');
      expect(conflict.current).toEqual(notification);
      expect(await restSuccess(request, 'get_notification', { notificationId: notification.id }, zNotificationView, 'viewer')).toEqual(notification);
    });
    await step('UC-NTF-0024', async () => {
      notification = (await restSuccess(request, 'set_notification_read', { notificationId: notification.id, expectedRevision: notification.revision, read: false, retryReference: crypto.randomUUID() }, zSavedNotificationView, 'viewer')).result;
      expect(notification.readAt).toBeNull();
    });
    await step('UC-NTF-0039', async () => {
      const saved = await restSuccess(request, 'set_notification_read', { notificationId: notification.id, expectedRevision: notification.revision, read: true, retryReference: crypto.randomUUID() }, zSavedNotificationView, 'viewer');
      expect(saved.result.readAt).not.toBeNull(); notification = saved.result;
    });
    await step('UC-NTF-0037', async () => { const failure = await restFailure(request, 'get_notification', { notificationId: notification.id }, zNotificationFailureBody, 'unavailable_record', 'member'); expect(failure.current).toBeNull(); });
    await step('UC-NTF-0038', async () => { const failure = await restFailure(request, 'set_notification_read', { notificationId: notification.id, expectedRevision: notification.revision, read: false, retryReference: crypto.randomUUID() }, zNotificationFailureBody, 'unavailable_record', 'member'); expect(failure.current).toBeNull(); });
    await step('UC-NTF-0032', async () => {
      const first = await restSuccess(request, 'list_notifications', { page: { limit: 1 } }, zPageNotificationView, 'viewer');
      expect(first.items).toHaveLength(1); expect(first.nextCursor).toEqual(expect.any(String));
      const next = await restSuccess(request, 'list_notifications', { page: { limit: 1, cursor: first.nextCursor } }, zPageNotificationView, 'viewer');
      expect(next.items).toHaveLength(1); expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
    });
    await step('UC-NTF-0028', async () => {
      const saved = await restSuccess(request, 'mark_all_notifications_read', { retryReference: crypto.randomUUID() }, zSavedMarkAllResult, 'viewer');
      expect(saved.result.changedCount).toBeGreaterThan(0); expect(saved.result.inbox.unreadCount).toBe(0);
      expect((await restSuccess(request, 'list_notifications', { unreadOnly: true }, zPageNotificationView, 'viewer')).items).toEqual([]);
    });
    await step('UC-NTF-0029', async () => {
      const noop = await restSuccess(request, 'mark_all_notifications_read', { retryReference: crypto.randomUUID() }, zSavedMarkAllResult, 'viewer');
      expect(noop.result.changedCount).toBe(0); expect(noop.result.inbox.unreadCount).toBe(0); expect(noop.receipt.eventId).toBeNull();
    });
    await step('UC-NTF-0002', async () => {
      expect((await restSuccess(request, 'set_issue_watch', { ...scope, watching: false, retryReference: crypto.randomUUID() }, zSavedWatchView, 'viewer')).result.watching).toBe(false);
    });
    const access = (await restSuccess(request, 'list_memberships', { projectId: target.id }, zPageMembershipView)).items.find(value => value.user.id === viewerId)!;
    await restSuccess(request, 'remove_membership', { projectId: target.id, userId: viewerId, expectedRevision: access.revision, retryReference: crypto.randomUUID() }, zSavedMembershipView);
    await step('UC-NTF-0036', async () => {
      const remaining = await restSuccess(request, 'list_notifications', { page: { limit: 100 } }, zPageNotificationView, 'viewer');
      expect(remaining.items.map(value => value.issueId)).not.toContain(issue.summary.id);
      await restFailure(request, 'get_notification', { notificationId: notification.id }, zNotificationFailureBody, 'unavailable_record', 'viewer');
    });
  } finally {
    preferences = await restSuccess(request, 'get_notification_preferences', {}, zNotificationPreferencesView, 'viewer');
    await restSuccess(request, 'update_notification_preferences', { expectedRevision: preferences.revision, inAppEnabled: original.inAppEnabled, events: original.events, emailMode: original.emailMode, dueReminders: original.dueReminders, retryReference: crypto.randomUUID() }, zSavedNotificationPreferencesView, 'viewer');
  }
});

test('REST CSV parser rejects structural boundaries and returns every row without creating work', async ({ request }) => {
  const target = await project(request, true);
  const preview = (csv: string, mapping: object = {}) => restSuccess(request, 'preview_issue_import', { projectId: target.id, csv, mapping }, zImportPreview, 'member');
  for (const [id, csv, mapping] of [
    ['UC-CSV-0011', '"Unclosed\nTitle\n', {}],
    ['UC-CSV-0012', 'Title\n', {}],
    ['UC-CSV-0013', Array.from({ length: 31 }, (_, n) => 'c' + n).join(',') + '\n' + Array(31).fill('v').join(','), {}],
    ['UC-CSV-0014', 'Title,\nValid,empty\n', {}],
    ['UC-CSV-0015', 'Title,title\nValid,duplicate\n', {}],
    ['UC-CSV-0016', 'Title,Notes\nValid,"unclosed\n', {}],
    ['UC-CSV-0017', 'Title,Notes\nOne\n', {}],
    ['UC-CSV-0018', 'Title\n' + Array.from({ length: 101 }, (_, n) => 'Row ' + n).join('\n'), {}],
    ['UC-CSV-0022', 'Title\nValid\n', { title: 'Missing heading' }],
    ['UC-CSV-0023', 'Work\nValid\n', {}],
  ] as const) {
    await step(id, async () => { await restFailure(request, 'preview_issue_import', { projectId: target.id, csv, mapping }, zIssueFailureBody, 'validation_failed', 'member'); });
  }
  await step('UC-CSV-0009', async () => { const result = await preview('\uFEFFTitle\r\nBOM accepted\r\n'); expect(result.validCount).toBe(1n); expect(result.headers).toEqual(['Title']); expect(result.rows[0]?.title).toBe('BOM accepted'); });
  await step('UC-CSV-0019', async () => { const result = await preview('Summary,Description\nAutomatic heading,Content\n'); expect(result.validCount).toBe(1n); expect(result.rows[0]?.title).toBe('Automatic heading'); });
  await step('UC-CSV-0020', async () => { const result = await preview('Work,Notes\nCustom heading,Content\n', { title: 'Work', description: 'Notes' }); expect(result.validCount).toBe(1n); expect(result.rows[0]?.title).toBe('Custom heading'); });
  await step('UC-CSV-0021', async () => { const result = await preview('Title,Priority\nSkip priority,unknown priority\n', { priority: '-' }); expect(result.validCount).toBe(1n); expect(result.errorCount).toBe(0n); });
  for (const [id, csv, field] of [
    ['UC-CSV-0031', 'Title,Type\nChild without parent,subtask\n', 'type'],
    ['UC-CSV-0034', 'Title,Assignee\nViewer assignment,' + viewerId + '\n', 'assignee'],
    ['UC-CSV-0035', 'Title,Due date\nImpossible date,2026-02-30\n', 'dueDate'],
    ['UC-CSV-0037', 'Title,SourceKey\nLong source,' + 'x'.repeat(201) + '\n', 'sourceKey'],
    ['UC-CSV-0040', 'Title,sourceKey,sourceKeyEncoding\nWrong encoding,eA,base64-v2\n', 'sourceKey'],
  ] as const) {
    await step(id, async () => { const result = await preview(csv); expect(result.validCount).toBe(0n); expect(result.errorCount).toBe(1n); expect(result.rows[0]?.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field, message: expect.any(String) })])); });
  }
  await step('UC-CSV-0038', async () => { const result = await preview('Title,SourceKey\nOne,SAME-1\nTwo,SAME-1\n'); expect(result.validCount).toBe(1n); expect(result.rows[1]?.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'sourceKey' })])); });
  await step('UC-CSV-0039', async () => { const original = 'معرف، خاص =1'; const result = await preview('Title,sourceKey,sourceKeyEncoding\nDecoded,' + Buffer.from(original).toString('base64url') + ',base64url-v1\n'); expect(result.rows[0]?.sourceKey).toBe(original); expect(result.validCount).toBe(1n); });
  await step('UC-CSV-0025', async () => {
    expect((await preview('Title\nNever create from preview\n')).validCount).toBe(1n);
    expect((await restSuccess(request, 'search_issues_v2', { filters: { projectIds: [target.id] }, page: { limit: 1 } }, zPageModernIssueSummary, 'member')).totalMatching).toBe(0);
  });
  await step('UC-CSV-0071', async () => {
    const result = await preview('Title,SourceKey\nFirst row,SOURCE-1\n,INVALID-2\nThird row,SOURCE-3\n');
    expect(result.validCount).toBe(2n); expect(result.errorCount).toBe(1n);
    expect(result.rows.map(value => ({ rowNumber: value.rowNumber, title: value.title, sourceKey: value.sourceKey }))).toEqual([
      { rowNumber: 2n, title: 'First row', sourceKey: 'SOURCE-1' }, { rowNumber: 3n, title: '', sourceKey: 'INVALID-2' }, { rowNumber: 4n, title: 'Third row', sourceKey: 'SOURCE-3' },
    ]);
    expect(result.rows[0]?.errors).toEqual([]); expect(result.rows[1]?.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'title' })])); expect(result.rows[2]?.errors).toEqual([]);
  });
  const importOne = async (csv: string) => {
    const result = await restSuccess(request, 'import_issues', { projectId: target.id, csv, mapping: {}, backlog: false, batchId: crypto.randomUUID(), retryReference: crypto.randomUUID() }, zSavedImportResult, 'member');
    expect(result.result.createdCount).toBe(1n);
    return restSuccess(request, 'get_issue_v2', { issueId: result.result.rows[0]!.issueId }, zModernIssueView, 'member');
  };
  await step('UC-CSV-0010', async () => {
    const csv = 'Title,Description\r\n"Quoted, ""value""","Line one\nLine two"\r\n';
    const result = await preview(csv); expect(result.validCount).toBe(1n); expect(result.rows[0]?.title).toBe('Quoted, "value"');
    const issue = await importOne(csv); expect(issue.summary.title).toBe('Quoted, "value"'); expect(issue.description).toBe('Line one\nLine two');
  });
  await step('UC-CSV-0032', async () => {
    for (const assignee of [memberId, 'مطور تجريبي', 'member@example.test']) {
      const csv = 'Title,Assignee\nEligible assignment,' + assignee + '\n';
      const result = await preview(csv); expect(result.validCount).toBe(1n); expect(result.rows[0]?.errors).toEqual([]);
      expect((await importOne(csv)).summary.assignee?.id).toBe(memberId);
    }
  });
  await step('UC-CSV-0041', async () => {
    const csv = 'Title,Description,Labels,SourceKey\nمهمة عربية 😀,وصف عربي,واجهة;عاجل,معرف-١\n';
    const result = await preview(csv); expect(result.rows[0]).toMatchObject({ title: 'مهمة عربية 😀', sourceKey: 'معرف-١', errors: [] });
    const issue = await importOne(csv); expect(issue.summary.title).toBe('مهمة عربية 😀'); expect(issue.description).toBe('وصف عربي'); expect(issue.summary.labels.map(value => value.name).sort()).toEqual(['واجهة', 'عاجل'].sort());
  });
});

test('REST import/export preserves partial success, source identities, backlog and formula-safe round trips', async ({ request }) => {
  const target = await project(request, true);
  const csv = 'Title,Description,descriptionFormat,Labels,SourceKey,Assignee,Due date\n' +
    'مهمة عربية,=2+2,plain,backend;واجهة;backend,SOURCE-1,' + memberId + ',2026-10-19\n' +
    'Safe HTML,"<p>Safe <strong>content</strong></p><script>alert(1)</script>",html,,SOURCE-2,,\n' +
    ',Invalid,plain,,SOURCE-3,,\n';
  const intent = { projectId: target.id, csv, mapping: {}, batchId: crypto.randomUUID(), backlog: true, retryReference: crypto.randomUUID() };
  const saved = await step('UC-CSV-0051', async () => {
    const result = await restSuccess(request, 'import_issues', intent, zSavedImportResult, 'member');
    expect(result.result.createdCount).toBe(2n); expect(result.result.rows.filter(value => value.status === 'created')).toHaveLength(2); return result;
  });
  await step('UC-CSV-0055', async () => {
    expect(saved.result.failedCount).toBe(1n); expect(saved.result.rows[2]?.status).toBe('failed');
    for (const row of saved.result.rows.filter(value => value.status === 'created')) expect((await restSuccess(request, 'get_issue_v2', { issueId: row.issueId }, zModernIssueView, 'member')).summary.title).toBe(row.title);
  });
  const firstId = saved.result.rows[0]!.issueId!;
  await step('UC-CSV-0052', async () => { expect((await restSuccess(request, 'get_issue_v2', { issueId: firstId }, zModernIssueView, 'member')).summary.backlog).toBe(true); });
  await step('UC-CSV-0036', async () => { expect((await restSuccess(request, 'get_issue_v2', { issueId: firstId }, zModernIssueView, 'member')).summary.labels.map(value => value.name).sort()).toEqual(['backend', 'واجهة'].sort()); });
  await step('UC-CSV-0042', async () => { const html = await restSuccess(request, 'get_issue_v2', { issueId: saved.result.rows[1]!.issueId }, zModernIssueView, 'member'); expect(html.description).toContain('<strong>content</strong>'); expect(html.description).not.toMatch(/script|alert\(1\)/i); expect(html.descriptionFormat).toBe('html'); });
  await step('UC-CSV-0056', async () => {
    const again = await restSuccess(request, 'import_issues', intent, zSavedImportResult, 'member');
    expect(again.result.rows.map(value => value.issueId)).toEqual(saved.result.rows.map(value => value.issueId));
    expect((await restSuccess(request, 'search_issues_v2', { filters: { projectIds: [target.id] }, page: { limit: 100 } }, zPageModernIssueSummary, 'member')).totalMatching).toBe(2);
  });
  await step('UC-CSV-0053', async () => {
    const again = await restSuccess(request, 'import_issues', { ...intent, batchId: crypto.randomUUID(), retryReference: crypto.randomUUID() }, zSavedImportResult, 'member');
    expect(again.result.createdCount).toBe(0n); expect(again.result.existingCount).toBe(2n); expect(again.result.rows.slice(0, 2).map(value => value.issueId)).toEqual(saved.result.rows.slice(0, 2).map(value => value.issueId));
  });
  await step('UC-CSV-0054', async () => {
    const noSource = { projectId: target.id, csv: 'Title\nSource-less row\n', mapping: {}, batchId: crypto.randomUUID(), backlog: false, retryReference: crypto.randomUUID() };
    const first = await restSuccess(request, 'import_issues', noSource, zSavedImportResult, 'member');
    const repeat = await restSuccess(request, 'import_issues', { ...noSource, retryReference: crypto.randomUUID() }, zSavedImportResult, 'member');
    expect(repeat.result.rows[0]?.issueId).toBe(first.result.rows[0]?.issueId);
    expect((await restSuccess(request, 'search_issues_v2', { filters: { projectIds: [target.id], query: 'Source-less row' }, page: { limit: 100 } }, zPageModernIssueSummary, 'member')).totalMatching).toBe(1);
  });
  const exported = (filters: object = {}) => restSuccess(request, 'export_issues', { projectId: target.id, filters, page: { limit: 100 } }, zIssueExport, 'viewer');
  await step('UC-CSV-0059', async () => { const result = await exported(); expect(result.totalMatching).toBe(3); expect(result.csv).toContain('مهمة عربية'); expect(result.csv).toContain('Source-less row'); });
  await step('UC-CSV-0060', async () => { const result = await exported({ backlog: false }); expect(result.totalMatching).toBe(1); expect(result.csv).toContain('Source-less row'); expect(result.csv).not.toContain('مهمة عربية'); });
  await step('UC-CSV-0061', async () => { const result = await exported({ backlog: true }); expect(result.totalMatching).toBe(2); expect(result.csv).toContain('مهمة عربية'); expect(result.csv).not.toContain('Source-less row'); });
  await step('UC-CSV-0063', async () => { const result = await exported({ query: 'Source-less row' }); expect(result.totalMatching).toBe(1); expect(result.csv).toContain('Source-less row'); });
  await step('UC-CSV-0065', async () => { expect((await exported()).csv).toContain("'=2+2"); });
  await step('UC-CSV-0072', async () => {
    let cursor: string | undefined; const pages: string[] = []; const cursors = new Set<string>();
    do {
      const result: z.infer<typeof zIssueExport> = await restSuccess(request, 'export_issues', { projectId: target.id, filters: {}, page: { limit: 1, ...(cursor ? { cursor } : {}) } }, zIssueExport, 'viewer');
      expect(result.totalMatching).toBe(3); pages.push(result.csv); cursor = result.nextCursor;
      if (cursor) { expect(cursors.has(cursor)).toBe(false); cursors.add(cursor); }
    } while (cursor);
    expect(pages).toHaveLength(3); expect(new Set(pages).size).toBe(3);
    for (const title of ['مهمة عربية', 'Safe HTML', 'Source-less row']) expect(pages.filter(value => value.includes(title))).toHaveLength(1);
  });
  await step('UC-CSV-0070', async () => {
    const result = await exported({ backlog: true });
    const preview = await restSuccess(request, 'preview_issue_import', { projectId: target.id, csv: result.csv, mapping: {} }, zImportPreview, 'member');
    expect(preview.validCount).toBe(2n); expect(preview.rows.map(value => value.duplicateIssueId).sort()).toEqual(saved.result.rows.slice(0, 2).map(value => value.issueId).sort());
    const restored = await restSuccess(request, 'import_issues', { ...intent, csv: result.csv, batchId: crypto.randomUUID(), retryReference: crypto.randomUUID() }, zSavedImportResult, 'member');
    expect(restored.result.createdCount).toBe(0n); expect(restored.result.existingCount).toBe(2n);
  });
  await step('UC-CSV-0066', async () => {
    await restFailure(request, 'export_issues', { projectId: target.id, filters: { projectIds: [target.id, crypto.randomUUID()] } }, zIssueFailureBody, 'validation_failed', 'viewer');
  });
  await step('UC-CSV-0062', async () => {
    const issue = await restSuccess(request, 'get_issue_v2', { issueId: firstId }, zModernIssueView, 'member');
    const organized = await restSuccess(request, 'organize_issue', { issueId: firstId, expectedRevision: issue.summary.revision, archived: true, retryReference: crypto.randomUUID() }, zSavedIssueView, 'member');
    expect(organized.result.summary.archived).toBe(true);
    const result = await exported({ archived: true }); expect(result.totalMatching).toBe(1); expect(result.csv).toContain('مهمة عربية'); expect(result.csv).not.toContain('Source-less row');
  });
  const access = (await restSuccess(request, 'list_memberships', { projectId: target.id }, zPageMembershipView)).items.find(value => value.user.id === viewerId)!;
  await restSuccess(request, 'remove_membership', { projectId: target.id, userId: viewerId, expectedRevision: access.revision, retryReference: crypto.randomUUID() }, zSavedMembershipView);
  await step('UC-CSV-0068', async () => {
    await restFailure(request, 'export_issues', { projectId: target.id, filters: {} }, zIssueFailureBody, 'unavailable_record', 'viewer');
    await restFailure(request, 'import_issues', { ...intent, batchId: crypto.randomUUID(), retryReference: crypto.randomUUID() }, zIssueFailureBody, 'unavailable_record', 'viewer');
  });
  const current = await restSuccess(request, 'get_project', { projectId: target.id }, zProjectView);
  await restSuccess(request, 'archive_project', { projectId: target.id, expectedRevision: current.revision, retryReference: crypto.randomUUID() }, zSavedProjectView);
  await step('UC-CSV-0057', async () => { await restFailure(request, 'import_issues', { ...intent, batchId: crypto.randomUUID(), retryReference: crypto.randomUUID() }, zIssueFailureBody, 'forbidden', 'member'); });
});

test('REST CSV resolution uses current canonical choices and refuses ambiguous people and priorities', async ({ request }) => {
  const target = await project(request, true);
  let config = await restSuccess(request, 'get_project_configuration', { projectId: target.id }, zConfigurationView);
  const typeId = crypto.randomUUID();
  config = (await restSuccess(request, 'save_issue_type', { projectId: target.id, typeId, expectedRevision: config.revision, key: 'story', name: 'REST user story', behavior: 'standard', retired: false, retryReference: crypto.randomUUID() }, zSavedTypeSaved)).result.configuration;
  const types = await restSuccess(request, 'list_issue_types', { projectId: target.id }, zPageTypeView);
  const defaultType = types.items.find(value => value.default && value.behavior === 'standard')!;
  const bindings = await restSuccess(request, 'list_type_workflow_bindings', { projectId: target.id, typeId: defaultType.id }, zPageBindingView);
  const binding = bindings.items.find(value => value.default)!;
  config = (await restSuccess(request, 'set_type_workflow_binding', { projectId: target.id, typeId, workflowId: binding.workflowId, expectedRevision: config.revision, default: true, acceptsNew: true, retryReference: crypto.randomUUID() }, zSavedConfigurationView)).result;
  const priorityId = crypto.randomUUID();
  config = (await restSuccess(request, 'save_priority', { projectId: target.id, priorityId, expectedRevision: config.revision, key: 'critical', name: 'REST critical team', sortOrder: '6', retired: false, retryReference: crypto.randomUUID() }, zSavedPrioritySaved)).result.configuration;
  const preview = (csv: string) => restSuccess(request, 'preview_issue_import', { projectId: target.id, csv, mapping: {} }, zImportPreview, 'member');
  const importChoices = async (csv: string) => {
    const result = await restSuccess(request, 'import_issues', { projectId: target.id, csv, mapping: {}, backlog: false, batchId: crypto.randomUUID(), retryReference: crypto.randomUUID() }, zSavedImportResult, 'member');
    expect(result.result.createdCount).toBe(1n);
    return restSuccess(request, 'get_issue_v2', { issueId: result.result.rows[0]!.issueId }, zModernIssueView, 'member');
  };
  await step('UC-CSV-0026', async () => {
    const csv = 'Title,Type\nVia key,story\n'; const result = await preview(csv); expect(result.validCount).toBe(1n); expect(result.rows[0]?.errors).toEqual([]);
    expect((await importChoices(csv)).summary.type.id).toBe(typeId);
  });
  await step('UC-CSV-0027', async () => {
    const csv = 'Title,typeId,priorityId\nVia exact IDs,' + typeId + ',' + priorityId + '\n'; const result = await preview(csv); expect(result.validCount).toBe(1n); expect(result.rows[0]?.errors).toEqual([]);
    const issue = await importChoices(csv); expect(issue.summary.type.id).toBe(typeId); expect(issue.summary.priority.id).toBe(priorityId);
  });
  await step('UC-CSV-0028', async () => {
    const csv = 'Title,Type,Priority\nVia names,REST user story,REST critical team\n'; expect((await preview(csv)).validCount).toBe(1n);
    const issue = await importChoices(csv); expect(issue.summary.type.id).toBe(typeId); expect(issue.summary.priority.id).toBe(priorityId);
  });
  config = (await restSuccess(request, 'save_priority', { projectId: target.id, priorityId: crypto.randomUUID(), expectedRevision: config.revision, key: 'critical_other', name: 'REST critical team', sortOrder: '7', retired: false, retryReference: crypto.randomUUID() }, zSavedPrioritySaved)).result.configuration;
  await step('UC-CSV-0029', async () => {
    const result = await preview('Title,Priority\nAmbiguous choice,REST critical team\n');
    expect(result.validCount).toBe(0n); expect(result.rows[0]?.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'priority', message: expect.stringMatching(/unique|ambiguous/i) })]));
  });
  await step('UC-CSV-0030', async () => {
    const result = await preview('Title,priorityId\nForeign choice,' + crypto.randomUUID() + '\n');
    expect(result.validCount).toBe(0n); expect(result.rows[0]?.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'priority' })]));
  });
  const sharedName = 'Ambiguous REST teammate ' + crypto.randomUUID();
  for (let index = 0; index < 2; index++) {
    const user = (await restSuccess(request, 'approve_user', { email: 'mcp-duplicate-' + crypto.randomUUID() + '@example.test', displayName: sharedName, administrator: false, retryReference: crypto.randomUUID() }, zSavedUserView)).result;
    await restSuccess(request, 'set_membership', { projectId: target.id, userId: user.id, expectedRevision: '0', role: 'member', retryReference: crypto.randomUUID() }, zSavedMembershipView);
  }
  await step('UC-CSV-0033', async () => {
    const result = await preview('Title,Assignee\nAmbiguous person,' + sharedName + '\n');
    expect(result.validCount).toBe(0n); expect(result.rows[0]?.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'assignee', message: expect.stringMatching(/unique|ambiguous/i) })]));
  });
});

test('REST oversized export is a typed smaller-page failure and a bounded request remains usable', async ({ request }) => {
  test.setTimeout(60_000);
  const target = await project(request, true);
  for (let index = 0; index < 30; index++) {
    await restSuccess(request, 'create_issue_v2', { projectId: target.id, title: 'REST export budget ' + String(index).padStart(2, '0'), description: '"'.repeat(10_000), retryReference: crypto.randomUUID() }, zSavedModernIssueView, 'member');
  }
  await step('UC-CSV-0067', async () => {
    const failure = await restFailure(request, 'export_issues', { projectId: target.id, filters: {}, page: { limit: 100 } }, zIssueFailureBody, 'validation_failed', 'viewer');
    expect(failure.error.message).toMatch(/smaller page|MiB/i);
    const bounded = await restSuccess(request, 'export_issues', { projectId: target.id, filters: {}, page: { limit: 10 } }, zIssueExport, 'viewer');
    expect(bounded.totalMatching).toBe(30); expect(bounded.nextCursor).toEqual(expect.any(String));
    expect(Buffer.byteLength(bounded.csv)).toBeLessThan(1024 * 1024);
    expect(bounded.csv.split('\n').filter(value => value.includes('REST export budget '))).toHaveLength(10);
  });
});
