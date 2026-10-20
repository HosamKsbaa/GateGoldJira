import { expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { isolatedProject, useModernIssues } from './support/project';
import { fixtureStage } from './support/native-issues';
import { apiOrigin, localFixturesAvailable, signIn, fillCredentials, token } from './support/session';
import { authorization, memberId, viewerId, ownerId, read, save, rejected, callTool, expireFixtureOAuth, allCompanyUsers, prepareFixtureReminderExclusion } from './support/coverage-access';
import {
  zMe, zPageUserView, zSavedUserView, zUserView, zIdentityFailureBody,
  zNotificationPreferencesView, zSavedNotificationPreferencesView,
  zCreatedToken, zTokenList, zTokenView, zTokenActivityPage,
  zPageActivityView, zSavedModernIssueView, zModernIssueView,
  zInboxSummary, zPageNotificationView, zNotificationView,
  zSavedNotificationView, zSavedMarkAllResult, zSavedCommentView,
  zOAuthConsent, zOAuthRedirect,
  zSavedWatchView, zSavedMembershipView, zPageProjectView, zProjectView, zSavedProjectView, zProjectFailureBody, zSavedDependencyView,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires isolated real accounts, HTTP API, MCP and PostgreSQL.');
test.use({ trace: 'off' });

test('company account creation, validation, lifecycle, immutable history and retries', async ({ request }) => {
  await useCase('UC-ACC-0031', async () => {
    const me = await read(request, '/api/v1/me', zMe, 'member');
    expect(me.userId).toBe(memberId); expect(me.administrator).toBe(false); expect(me.companyTimeZone).toBe('Africa/Cairo');
    expect(Object.keys(me).sort()).toEqual(['administrator', 'companyTimeZone', 'displayName', 'email', 'userId']);
  }, 'rest');
  await useCase('UC-ACC-0036', async () => {
    const users = await allCompanyUsers(request);
    expect(users.map(v => v.id)).toEqual(expect.arrayContaining([ownerId, memberId, viewerId]));
    expect(users.every(v => v.approved)).toBe(true);
  }, 'rest');
  await useCase('UC-ACC-0037', async () => {
    const first = await read(request, '/api/v1/admin/users?limit=1', zPageUserView);
    expect(first.items).toHaveLength(1); expect(first.nextCursor).toBeTruthy();
    const next = await read(request, '/api/v1/admin/users?limit=1&cursor=' + encodeURIComponent(first.nextCursor!), zPageUserView);
    expect(next.items).toHaveLength(1); expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
  }, 'rest');
  await useCase('UC-ACC-0038', async () => {
    await rejected(await request.get(apiOrigin + '/api/v1/admin/users', { headers: await authorization('viewer') }), 403, /permission|access|forbidden|reading only/i);
  }, 'rest');
  const activeAdministrators = (await allCompanyUsers(request)).filter(user => user.active && user.administrator);
  expect(activeAdministrators.map(user => user.id)).toEqual([ownerId]);
  const finalAdministrator = activeAdministrators[0]!;
  for (const [id, patch] of [['UC-ACC-0051', { active: false }], ['UC-ACC-0052', { administrator: false }]] as const) {
    await useCase(id, async () => {
      await rejected(await request.put(apiOrigin + '/api/v1/admin/users/' + ownerId, { headers: await authorization(), data: { expectedRevision: finalAdministrator.revision, email: finalAdministrator.email, displayName: finalAdministrator.displayName, active: true, administrator: true, ...patch } }), 422, /at least one active Administrator/i);
      expect((await allCompanyUsers(request)).find(user => user.id === ownerId)).toEqual(finalAdministrator);
    }, 'rest');
  }
  for (const [id, email, displayName] of [
    ['UC-ACC-0042', 'not-an-email', 'Valid'],
    ['UC-ACC-0044', 'invalid-' + crypto.randomUUID() + '@example.test', 'ش'.repeat(101)],
  ] as const) {
    await useCase(id, async () => {
      await rejected(await request.post(apiOrigin + '/api/v1/admin/users', { headers: await authorization(), data: { email, displayName, administrator: false } }), 422, /email|name|validation/i);
    }, 'rest');
  }
  const email = 'coverage-' + crypto.randomUUID() + '@example.test';
  let user = (await save(request, '/api/v1/admin/users', { email, displayName: 'مستخدم عربي 😀', administrator: false }, zSavedUserView, { method: 'POST', status: 201 })).result;
  await useCase('UC-ACC-0039', async () => { expect(user.approved).toBe(true); expect(user.active).toBe(true); expect(user.email).toBe(email); expect(user.administrator).toBe(false); }, 'rest');
  await useCase('UC-ACC-0060', async () => {
    expect(user.displayName).toBe('مستخدم عربي 😀');
    expect((await allCompanyUsers(request)).find(value => value.id === user.id)?.displayName).toBe('مستخدم عربي 😀');
  }, 'rest');
  await useCase('UC-ACC-0043', async () => {
    await rejected(await request.post(apiOrigin + '/api/v1/admin/users', { headers: await authorization(), data: { email: email.toUpperCase(), displayName: 'Duplicate', administrator: false } }), 422, /already.*email/i);
  }, 'rest');
  const update = async (patch: object) => {
    const changed = await save(request, '/api/v1/admin/users/' + user.id, { expectedRevision: user.revision, email: user.email, displayName: user.displayName, active: user.active, administrator: user.administrator, ...patch }, zSavedUserView);
    user = changed.result; return changed;
  };
  await useCase('UC-ACC-0045', async () => { await update({ email: 'changed-' + email }); expect(user.email).toBe('changed-' + email); }, 'rest');
  await useCase('UC-ACC-0063', async () => { const revision = user.revision; await update({ displayName: 'اسم محدث' }); expect(user.displayName).toBe('اسم محدث'); expect(user.revision).not.toBe(revision); }, 'rest');
  await useCase('UC-ACC-0047', async () => { await update({ active: false }); expect(user.active).toBe(false); expect(user.approved).toBe(true); }, 'rest');
  await useCase('UC-ACC-0048', async () => { await update({ active: true }); expect(user.active).toBe(true); }, 'rest');
  await useCase('UC-ACC-0049', async () => { await update({ administrator: true }); expect(user.administrator).toBe(true); }, 'rest');
  await useCase('UC-ACC-0050', async () => { await update({ administrator: false }); expect(user.administrator).toBe(false); }, 'rest');
  await useCase('UC-ACC-0055', async () => {
    const body = { expectedRevision: user.revision, email: user.email, displayName: 'Retry once', active: true, administrator: false }, reference = crypto.randomUUID();
    const first = await save(request, '/api/v1/admin/users/' + user.id, body, zSavedUserView, { reference });
    const replay = await save(request, '/api/v1/admin/users/' + user.id, body, zSavedUserView, { reference });
    expect(replay.result).toEqual(first.result); expect(replay.receipt.replayed).toBe(true); user = first.result;
  }, 'rest');
  await useCase('UC-ACC-0061', async () => {
    const response = await request.put(apiOrigin + '/api/v1/admin/users/' + user.id, { headers: await authorization(), data: { expectedRevision: '1', email: user.email, displayName: 'Stale write', active: true, administrator: false } });
    expect(response.status()).toBe(409); expect(zIdentityFailureBody.parse(await response.json()).current).toEqual(user);
  }, 'rest');
  let administrator: z.infer<typeof zUserView> | undefined;
  try {
    await useCase('UC-ACC-0040', async () => {
      administrator = (await save(request, '/api/v1/admin/users', { email: 'admin-' + crypto.randomUUID() + '@example.test', displayName: 'Temporary approved administrator', administrator: true }, zSavedUserView, { method: 'POST', status: 201 })).result;
      expect(administrator.administrator).toBe(true); expect(administrator.active).toBe(true);
    }, 'rest');
  } finally {
    if (administrator) await save(request, '/api/v1/admin/users/' + administrator.id, { expectedRevision: administrator.revision, email: administrator.email, displayName: administrator.displayName, administrator: false, active: false }, zSavedUserView);
  }
});

test('account editor cancel, local onboarding boundary and account switch keep administration private', async ({ page }) => {
  await signIn(page, 'owner', '/admin/users', /^Company users$/);
  await useCase('UC-ACC-0057', async () => {
    await expect(page.getByText('Approval grants company access; it does not create a local username or password.', { exact: false })).toBeVisible();
  }, 'web');
  await useCase('UC-ACC-0054', async () => {
    while (await page.getByRole('button', { name: 'Edit Local Owner', exact: true }).count() === 0) {
      await page.getByRole('button', { name: 'More users', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Refresh users', exact: true })).toBeEnabled();
    }
    await page.getByRole('button', { name: 'Edit Local Owner', exact: true }).click();
    await expect(page.getByLabel('Display name', { exact: true })).toBeFocused();
    await page.getByLabel('Display name', { exact: true }).fill('Unsaved owner');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Approve a user', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit Local Owner', exact: true })).toBeVisible();
    await expect(page.getByText('Unsaved owner', { exact: true })).toHaveCount(0);
  }, 'web');
  await useCase('UC-ACC-0056', async () => {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByText('owner@example.test', { exact: true })).toHaveCount(0);
    await fillCredentials(page, 'viewer');
    await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Welcome,/ })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
    await expect(page.getByText('owner@example.test', { exact: true })).toHaveCount(0);
  }, 'web');
  await useCase('UC-ACC-0030', async () => {
    await signIn(page, 'viewer', '/admin/users');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Company users', exact: true })).toHaveCount(0);
  }, 'web');
});

test('ordinary permission denial refreshes current administrator state without ending the session', async ({ page, request }) => {
  const currentUser = async () => {
    const user = (await allCompanyUsers(request)).find(user => user.id === memberId);
    if (!user) throw new Error('The isolated member account is missing.');
    return user;
  };
  const before = await currentUser();
  const changeAdministrator = async (administrator: boolean) => {
    const user = await currentUser();
    return save(request, '/api/v1/admin/users/' + user.id, { expectedRevision: user.revision, email: user.email, displayName: user.displayName, active: user.active, administrator }, zSavedUserView);
  };
  try {
    await changeAdministrator(true);
    await useCase('UC-ACC-0059', async () => { expect((await read(request, '/api/v1/me', zMe, 'member')).administrator).toBe(true); }, 'rest');
    await signIn(page, 'member', '/admin/users', /^Company users$/);
    await changeAdministrator(false);
    await useCase('UC-ACC-0026', async () => {
      const response = page.waitForResponse(reply => reply.url().includes('/api/v1/admin/users') && reply.status() === 403);
      await page.getByRole('button', { name: 'Refresh users', exact: true }).click();
      await response;
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: /Welcome,/ })).toBeVisible();
      await expect(page).toHaveURL(/\/$/);
    }, 'web');
    await useCase('UC-ACC-0029', async () => {
      await expect(page.getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Company users', exact: true })).toHaveCount(0);
      expect((await read(request, '/api/v1/me', zMe, 'member')).administrator).toBe(false);
    }, 'web');
    await useCase('UC-ACC-0059', async () => { expect((await read(request, '/api/v1/me', zMe, 'member')).administrator).toBe(false); }, 'rest');
  } finally {
    await changeAdministrator(before.administrator);
  }
});

test('a delayed old-account forbidden reply cannot invalidate a newer administrator login', async ({ page, request }) => {
  const currentUser = async () => {
    const user = (await allCompanyUsers(request)).find(user => user.id === memberId);
    if (!user) throw new Error('The isolated member account is missing.');
    return user;
  };
  const before = await currentUser();
  const changeAdministrator = async (administrator: boolean) => {
    const user = await currentUser();
    return save(request, '/api/v1/admin/users/' + user.id, { expectedRevision: user.revision, email: user.email, displayName: user.displayName, active: user.active, administrator }, zSavedUserView);
  };
  let release = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  try {
    await changeAdministrator(true);
    await signIn(page, 'member', '/admin/users', /^Company users$/);
    await changeAdministrator(false);
    let captured = false;
    await page.route('**/api/v1/admin/users*', async route => {
      const response = await route.fetch();
      expect(response.status()).toBe(403);
      captured = true;
      await held;
      await route.fulfill({ response });
    });
    await page.getByRole('button', { name: 'Refresh users', exact: true }).click();
    await expect.poll(() => captured).toBe(true);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await fillCredentials(page, 'owner');
    await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Welcome,/ })).toBeVisible();
    await page.unroute('**/api/v1/admin/users*');
    await useCase('UC-ACC-0027', async () => {
      const reply = page.waitForResponse(response => response.url().includes('/api/v1/admin/users') && response.status() === 403);
      release();
      await reply;
      await expect(page.getByRole('link', { name: 'Users', exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Users', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Company users', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    }, 'web');
  } finally {
    release();
    await changeAdministrator(before.administrator);
  }
});

test('notification preferences validate exact events and revisions and survive genuine retry receipts', async ({ page, request }) => {
  const endpoint = '/api/v1/notifications/preferences';
  const before = await read(request, endpoint, zNotificationPreferencesView, 'viewer');
  let current = before;
  const update = async (patch: object) => {
    current = (await save(request, endpoint, { expectedRevision: current.revision, inAppEnabled: current.inAppEnabled, events: current.events, emailMode: current.emailMode, dueReminders: current.dueReminders, ...patch }, zSavedNotificationPreferencesView, { role: 'viewer' })).result;
    return current;
  };
  try {
    await useCase('UC-NTF-0043', async () => { expect(current.revision).toMatch(/^[1-9][0-9]*$/); expect(current.events.length).toBeGreaterThan(0); }, 'rest');
    await useCase('UC-NTF-0045', async () => { expect((await update({ inAppEnabled: false })).inAppEnabled).toBe(false); }, 'rest');
    await useCase('UC-NTF-0044', async () => { expect((await update({ inAppEnabled: true })).inAppEnabled).toBe(true); }, 'rest');
    await useCase('UC-NTF-0046', async () => { expect((await update({ events: ['mention', 'comment'] })).events).toEqual(['comment', 'mention']); }, 'rest');
    for (const [id, mode] of [['UC-NTF-0049', 'off'], ['UC-NTF-0050', 'instant'], ['UC-NTF-0051', 'daily']] as const) await useCase(id, async () => { expect((await update({ emailMode: mode })).emailMode).toBe(mode); }, 'rest');
    await useCase('UC-NTF-0053', async () => { expect((await update({ dueReminders: true })).dueReminders).toBe(true); }, 'rest');
    for (const [id, patch, explanation] of [
      ['UC-NTF-0055', { emailMode: 'weekly' }, /off|instant|daily|validation/i],
      ['UC-NTF-0056', { events: ['unknown'] }, /supported|validation/i],
      ['UC-NTF-0057', { events: ['mention', 'mention'] }, /once|unique|validation/i],
      ['UC-NTF-0058', { expectedRevision: '1' }, /changed|reload/i],
    ] as const) await useCase(id, async () => {
      const response = await request.put(apiOrigin + endpoint, { headers: await authorization('viewer'), data: { expectedRevision: current.revision, inAppEnabled: current.inAppEnabled, events: current.events, emailMode: current.emailMode, dueReminders: current.dueReminders, ...patch } });
      await rejected(response, id === 'UC-NTF-0058' ? 409 : 422, explanation);
    }, 'rest');
    await useCase('UC-NTF-0059', async () => {
      await signIn(page, 'viewer', '/notifications', /^Inbox$/);
      await page.getByRole('button', { name: 'Notification preferences', exact: true }).click();
      await page.getByRole('button', { name: 'Select none', exact: true }).click();
      await expect(page.getByRole('checkbox', { name: 'Mentions', exact: true })).not.toBeChecked();
      await page.getByRole('checkbox', { name: 'Mentions', exact: true }).check();
      await page.getByRole('combobox', { name: 'Email updates', exact: true }).selectOption('off');
      await page.getByRole('checkbox', { name: 'Remind me when assigned or reported work is due today', exact: true }).uncheck();
      const references: string[] = [];
      await page.route('**/api/v1/notifications/preferences', async route => {
        if (route.request().method() !== 'PUT') return route.continue();
        references.push(route.request().headers()['idempotency-key'] ?? '');
        const response = await route.fetch(); expect(response.status()).toBe(200);
        if (references.length === 1) await route.abort('failed');
        else { expect(zSavedNotificationPreferencesView.parse(await response.json()).receipt.replayed).toBe(true); await route.fulfill({ response }); }
      });
      await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Retry preference save', exact: true })).toBeVisible();
      await expect(page.getByRole('checkbox', { name: 'Mentions', exact: true })).toBeDisabled();
      await page.getByRole('button', { name: 'Retry preference save', exact: true }).click();
      await expect(page.getByText('Notification preferences saved.', { exact: true })).toBeVisible();
      expect(references).toHaveLength(2); expect(references[0]).toBeTruthy(); expect(references[1]).toBe(references[0]);
      await page.unroute('**/api/v1/notifications/preferences');
      current = await read(request, endpoint, zNotificationPreferencesView, 'viewer');
      expect(current.events).toEqual(['mention']);
    }, 'web');
    await signIn(page, 'viewer', '/notifications', /^Inbox$/);
    await useCase('UC-NTF-0042', async () => { await page.getByRole('button', { name: 'Notification preferences', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Choose what reaches you', exact: true })).toBeVisible(); }, 'web');
    await useCase('UC-NTF-0052', async () => { await expect(page.getByText('Email delivery is not configured yet.', { exact: false })).toBeVisible(); expect(current.emailDeliveryAvailable).toBe(false); }, 'web');
    await useCase('UC-NTF-0054', async () => {
      await page.getByRole('checkbox', { name: 'Remind me when assigned or reported work is due today', exact: true }).check();
      await expect(page.getByText('Select Due dates above', { exact: false })).toBeVisible();
    }, 'web');
    await useCase('UC-NTF-0047', async () => {
      await page.getByRole('button', { name: 'Select all', exact: true }).click();
      for (const checkbox of await page.locator('gg-notification-preferences input[type=checkbox]').all()) await expect(checkbox).toBeChecked();
    }, 'web');
    await useCase('UC-NTF-0048', async () => {
      await page.getByRole('button', { name: 'Select none', exact: true }).click();
      await expect(page.getByRole('checkbox', { name: 'Mentions', exact: true })).not.toBeChecked();
      await expect(page.getByRole('checkbox', { name: 'Comments', exact: true })).not.toBeChecked();
    }, 'web');
    await useCase('UC-NTF-0060', async () => {
      await page.getByRole('button', { name: 'Reload saved preferences', exact: true }).click();
      await expect(page.getByRole('checkbox', { name: 'Mentions', exact: true })).toBeChecked();
      await expect(page.getByRole('checkbox', { name: 'Comments', exact: true })).not.toBeChecked();
      await expect(page.getByRole('combobox', { name: 'Email updates', exact: true })).toHaveValue('off');
    }, 'web');
    await useCase('UC-NTF-0072', async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }, 'web');
  } finally {
    const latest = await read(request, endpoint, zNotificationPreferencesView, 'viewer');
    await save(request, endpoint, { expectedRevision: latest.revision, inAppEnabled: before.inAppEnabled, events: before.events, emailMode: before.emailMode, dueReminders: before.dueReminders }, zSavedNotificationPreferencesView, { role: 'viewer' });
  }
});

test('watching, mentions, responsible recipients and private inbox lifecycle are real issue events', async ({ page, request }) => {
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  let issue = (await save(request, '/api/v2/projects/' + projectId + '/issues', { title: 'تنبيهات عربية ' + crypto.randomUUID().slice(0, 6), assigneeId: memberId }, zSavedModernIssueView, { method: 'POST', status: 201 })).result;
  const inbox = async (role: string, query = '') => read(request, '/api/v1/notifications' + query, zPageNotificationView, role);
  await useCase('UC-NTF-0010', async () => {
    const notifications = await inbox('member', '?limit=100');
    expect(notifications.items.find(v => v.issueId === issue.summary.id)?.reasons).toContain('assignment');
  }, 'background');
  const watchPath = '/api/v1/issues/' + issue.summary.id + '/watch';
  await useCase('UC-NTF-0001', async () => {
    expect((await save(request, watchPath, { watching: true }, zSavedWatchView, { method: 'POST', role: 'member' })).result.watching).toBe(true);
    expect((await read(request, '/api/v2/issues/' + issue.summary.id, zModernIssueView, 'member')).watching).toBe(true);
  }, 'rest');
  await useCase('UC-NTF-0002', async () => {
    expect((await save(request, watchPath, { watching: false }, zSavedWatchView, { method: 'POST', role: 'member' })).result.watching).toBe(false);
    expect((await read(request, '/api/v2/issues/' + issue.summary.id, zModernIssueView, 'member')).watching).toBe(false);
  }, 'rest');
  await useCase('UC-NTF-0003', async () => {
    expect((await save(request, watchPath, { watching: true }, zSavedWatchView, { method: 'POST', role: 'viewer' })).result.watching).toBe(true);
  }, 'rest');
  await useCase('UC-NTF-0004', async () => {
    expect((await read(request, '/api/v2/issues/' + issue.summary.id, zModernIssueView, 'owner')).watching).toBe(false);
    expect((await read(request, '/api/v2/issues/' + issue.summary.id, zModernIssueView, 'viewer')).watching).toBe(true);
    const history = await read(request, '/api/v1/admin/activity?resourceKind=issue&resourceId=' + issue.summary.id, zPageActivityView, 'member');
    expect(history.items.some(v => v.action === 'set_issue_watch')).toBe(false);
  }, 'rest');
  await useCase('UC-NTF-0005', async () => {
    const reference = crypto.randomUUID();
    const first = await save(request, watchPath, { watching: false }, zSavedWatchView, { method: 'POST', role: 'member', reference });
    const replay = await save(request, watchPath, { watching: false }, zSavedWatchView, { method: 'POST', role: 'member', reference });
    expect(replay.receipt.replayed).toBe(true); expect(replay.result).toEqual(first.result);
  }, 'rest');
  await useCase('UC-NTF-0006', async () => {
    issue = (await save(request, '/api/v2/issues/' + issue.summary.id, { expectedRevision: issue.summary.revision, editable: { title: issue.summary.title + ' updated', description: '', descriptionFormat: 'plain', typeId: issue.summary.type.id, priorityId: issue.summary.priority.id, assigneeId: memberId, dueDate: null, labelIds: [] } }, zSavedModernIssueView)).result;
    expect((await inbox('viewer', '?limit=100')).items.find(v => v.issueId === issue.summary.id)?.reasons).toContain('watching');
  }, 'background');
  const comment = await save(request, '/api/v1/issues/' + issue.summary.id + '/comments', { body: { html: '<p>تعليق عربي <span data-user-id="' + viewerId + '">ignored label</span></p>', mentionUserIds: [viewerId], pictureIds: [] } }, zSavedCommentView, { method: 'POST', status: 201 });
  await useCase('UC-NTF-0007', async () => {
    const notifications = (await inbox('member', '?limit=100')).items.filter(v => v.issueId === issue.summary.id);
    expect(notifications.some(v => v.reasons.includes('comment'))).toBe(true);
  }, 'background');
  let notification = (await inbox('viewer', '?limit=100')).items.find(v => v.issueId === issue.summary.id && v.reasons.includes('mention'))!;
  await useCase('UC-NTF-0008', async () => { expect(notification).toBeDefined(); expect(notification.reasons).toContain('mention'); expect(comment.result.mentions.map(v => v.userId)).toContain(viewerId); }, 'background');
  await useCase('UC-NTF-0018', async () => { expect(notification.reasons).toEqual(expect.arrayContaining(['mention', 'watching'])); expect(new Set(notification.reasons).size).toBe(notification.reasons.length); }, 'background');
  await useCase('UC-NTF-0017', async () => { expect((await inbox('owner', '?limit=100')).items.filter(v => v.issueId === issue.summary.id)).toEqual([]); }, 'background');
  await useCase('UC-NTF-0019', async () => { expect(notification.issueKey).toBe(issue.summary.key); expect(notification.actor.id).toBe(ownerId); expect(notification.readAt).toBeNull(); }, 'rest');
  await useCase('UC-NTF-0020', async () => {
    const before = await read(request, '/api/v1/notifications/summary', zInboxSummary, 'viewer');
    const again = await read(request, '/api/v1/notifications/summary', zInboxSummary, 'viewer');
    expect(again.unreadCount).toBe(before.unreadCount); expect(before.unreadCount).toBeGreaterThan(0);
    expect((await read(request, '/api/v1/notifications/' + notification.id, zNotificationView, 'viewer')).readAt).toBeNull();
  }, 'rest');
  await useCase('UC-NTF-0021', async () => { const current = await read(request, '/api/v1/notifications/' + notification.id, zNotificationView, 'viewer'); expect(current.revision).toBe(notification.revision); expect(current.readAt).toBeNull(); }, 'rest');
  await useCase('UC-NTF-0037', async () => { expect((await request.get(apiOrigin + '/api/v1/notifications/' + notification.id, { headers: await authorization('member') })).status()).toBe(404); }, 'rest');
  await useCase('UC-NTF-0038', async () => { expect((await request.put(apiOrigin + '/api/v1/notifications/' + notification.id + '/read-state', { headers: await authorization('member'), data: { expectedRevision: notification.revision, read: true } })).status()).toBe(404); }, 'rest');
  await useCase('UC-NTF-0026', async () => { await rejected(await request.put(apiOrigin + '/api/v1/notifications/' + notification.id + '/read-state', { headers: await authorization('viewer'), data: { read: true } }), 422, /validation|revision/i); }, 'rest');
  let readEventId: string | null = null;
  await useCase('UC-NTF-0023', async () => {
    const saved = await save(request, '/api/v1/notifications/' + notification.id + '/read-state', { expectedRevision: notification.revision, read: true }, zSavedNotificationView, { role: 'viewer' });
    notification = saved.result; readEventId = saved.receipt.eventId;
    expect(notification.readAt).not.toBeNull(); expect(readEventId).toBeTruthy();
  }, 'rest');
  await useCase('UC-AUD-0027', async () => {
    for (const role of ['owner', 'member']) {
      const issueHistory = await read(request, '/api/v1/admin/activity?resourceKind=issue&resourceId=' + issue.summary.id, zPageActivityView, role);
      expect(issueHistory.items.some(event => event.id === readEventId || event.resourceKind === 'notification')).toBe(false);
    }
    const administratorAudit = await read(request, '/api/v1/admin/activity?resourceKind=notification&resourceId=' + notification.id, zPageActivityView);
    expect(administratorAudit.items.find(event => event.id === readEventId)?.action).toBe('set_notification_read');
    expect(administratorAudit.items.flatMap(event => event.changes).every(change => !/html|plainText|body|message/.test(change.field))).toBe(true);
    expect(JSON.stringify(administratorAudit)).not.toContain('تعليق عربي');
  }, 'rest');
  await useCase('UC-NTF-0025', async () => { const same = await save(request, '/api/v1/notifications/' + notification.id + '/read-state', { expectedRevision: notification.revision, read: true }, zSavedNotificationView, { role: 'viewer' }); expect(same.result.revision).toBe(notification.revision); expect(same.receipt.eventId).toBeNull(); }, 'rest');
  await useCase('UC-NTF-0027', async () => { const response = await request.put(apiOrigin + '/api/v1/notifications/' + notification.id + '/read-state', { headers: await authorization('viewer'), data: { expectedRevision: '1', read: false } }); expect(response.status()).toBe(409); expect((await response.json()).current.revision).toBe(notification.revision); }, 'rest');
  await useCase('UC-NTF-0024', async () => { notification = (await save(request, '/api/v1/notifications/' + notification.id + '/read-state', { expectedRevision: notification.revision, read: false }, zSavedNotificationView, { role: 'viewer' })).result; expect(notification.readAt).toBeNull(); }, 'rest');
  await useCase('UC-NTF-0040', async () => {
    await signIn(page, 'viewer', '/notifications', /^Inbox$/);
    const row = page.locator('[data-notification-id="' + notification.id + '"]');
    const references: string[] = [];
    const path = '**/api/v1/notifications/' + notification.id + '/read-state';
    await page.route(path, async route => {
      references.push(route.request().headers()['idempotency-key'] ?? '');
      const response = await route.fetch(); expect(response.status()).toBe(200);
      if (references.length === 1) await route.abort('failed');
      else { expect(zSavedNotificationView.parse(await response.json()).receipt.replayed).toBe(true); await route.fulfill({ response }); }
    });
    await row.getByRole('button', { name: 'Mark read', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retry inbox change', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Retry inbox change', exact: true }).click();
    await expect(row.locator('strong')).toHaveText('Read');
    expect(references).toHaveLength(2); expect(references[0]).toBeTruthy(); expect(references[1]).toBe(references[0]);
    await page.unroute(path);
    notification = await read(request, '/api/v1/notifications/' + notification.id, zNotificationView, 'viewer');
  }, 'web');
  await useCase('UC-NTF-0032', async () => {
    const first = await inbox('viewer', '?limit=1'); expect(first.items).toHaveLength(1); expect(first.nextCursor).toBeTruthy();
    const next = await inbox('viewer', '?limit=1&cursor=' + encodeURIComponent(first.nextCursor!)); expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
  }, 'rest');
  await signIn(page, 'viewer', '/notifications', /^Inbox$/);
  const row = page.locator('[data-notification-id="' + notification.id + '"]');
  await useCase('UC-NTF-0071', async () => { await expect(row).toContainText('تنبيهات عربية'); await expect(row.locator('[dir=auto]')).toBeVisible(); }, 'web');
  await useCase('UC-NTF-0033', async () => { await page.getByRole('button', { name: 'Refresh inbox', exact: true }).click(); await expect(row).toBeVisible(); }, 'web');
  await useCase('UC-NTF-0030', async () => { await page.getByRole('checkbox', { name: 'Unread only', exact: true }).check(); await page.getByRole('button', { name: 'Apply inbox filter', exact: true }).click(); await expect(row).toHaveCount(0); }, 'web');
  await useCase('UC-NTF-0031', async () => { await page.getByRole('checkbox', { name: 'Unread only', exact: true }).uncheck(); await page.getByRole('button', { name: 'Apply inbox filter', exact: true }).click(); await expect(row).toBeVisible(); }, 'web');
  await useCase('UC-NTF-0039', async () => { await row.getByRole('button', { name: 'Mark unread', exact: true }).click(); await expect(row.locator('strong')).toHaveText('Unread'); }, 'rest');
  await useCase('UC-NTF-0022', async () => {
    await row.getByRole('button', { name: 'Open issue ' + issue.summary.key, exact: true }).click();
    await expect(page.getByRole('heading', { name: issue.summary.title, exact: true })).toBeVisible();
    expect((await read(request, '/api/v1/notifications/' + notification.id, zNotificationView, 'viewer')).readAt).not.toBeNull();
  }, 'web');
  await useCase('UC-NTF-0028', async () => {
    const result = await save(request, '/api/v1/notifications/mark-all-read', {}, zSavedMarkAllResult, { method: 'POST', role: 'viewer' });
    expect(result.result.inbox.unreadCount).toBe(0); expect((await inbox('viewer', '?unreadOnly=true')).totalMatching).toBe(0);
  }, 'rest');
  await useCase('UC-NTF-0029', async () => { const result = await save(request, '/api/v1/notifications/mark-all-read', {}, zSavedMarkAllResult, { method: 'POST', role: 'viewer' }); expect(result.result.changedCount).toBe(0); expect(result.receipt.eventId).toBeNull(); }, 'rest');
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: /^Inbox/ }).click();
  await useCase('UC-NTF-0034', async () => { await page.getByRole('checkbox', { name: 'Unread only', exact: true }).check(); await page.getByRole('button', { name: 'Apply inbox filter', exact: true }).click(); await expect(page.getByRole('heading', { name: 'You’re all caught up', exact: true })).toBeVisible(); }, 'web');
  await useCase('UC-NTF-0036', async () => {
    await save(request, '/api/v1/projects/' + projectId + '/memberships/' + viewerId + '/remove', { expectedRevision: '1' }, zSavedMembershipView, { method: 'POST' });
    expect((await inbox('viewer', '?limit=100')).items.some(v => v.projectId === projectId)).toBe(false);
    expect((await request.get(apiOrigin + '/api/v1/notifications/' + notification.id, { headers: await authorization('viewer') })).status()).toBe(404);
  }, 'rest');
});

test('each responsible-work event delivers its own precise private notification reason', async ({ request }) => {
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  let parent = (await save(request, '/api/v2/projects/' + projectId + '/issues', { title: 'Responsible event coverage ' + crypto.randomUUID(), assigneeId: memberId }, zSavedModernIssueView, { method: 'POST', status: 201 })).result;
  const inbox = () => read(request, '/api/v1/notifications?limit=100', zPageNotificationView, 'member');
  const notificationAfter = async (id: string, reason: string, action: () => Promise<unknown>) => useCase(id, async () => {
    const previous = new Set((await inbox()).items.map(item => item.id));
    await action();
    const notifications = (await inbox()).items.filter(item => !previous.has(item.id) && item.issueId === parent.summary.id && item.reasons.some(item => item === reason));
    expect(notifications).toHaveLength(1); expect(notifications[0]?.actor.id).toBe(ownerId); expect(notifications[0]?.readAt).toBeNull();
  }, 'background');
  const move = async (issueId: string, category: string) => {
    const issue = await read(request, '/api/v2/issues/' + issueId, zModernIssueView);
    return save(request, '/api/v2/issues/' + issueId + '/move', { expectedRevision: issue.summary.revision, targetStageId: await fixtureStage(request, issueId, category) }, zSavedModernIssueView, { method: 'POST' });
  };
  await notificationAfter('UC-NTF-0011', 'status', async () => { parent = (await move(parent.summary.id, 'review')).result; expect(parent.summary.stage.category).toBe('review'); });
  await notificationAfter('UC-NTF-0012', 'due_date', async () => {
    parent = (await save(request, '/api/v2/issues/' + parent.summary.id, { expectedRevision: parent.summary.revision, editable: { title: parent.summary.title, description: parent.description, descriptionFormat: parent.descriptionFormat, typeId: parent.summary.type.id, priorityId: parent.summary.priority.id, assigneeId: memberId, dueDate: '2099-01-01', labelIds: [] } }, zSavedModernIssueView)).result;
    expect(parent.summary.dueDate).toBe('2099-01-01');
  });
  const comment = await save(request, '/api/v1/issues/' + parent.summary.id + '/comments', { body: { html: '<p>Original comment</p>', mentionUserIds: [], pictureIds: [] } }, zSavedCommentView, { method: 'POST', status: 201 });
  await notificationAfter('UC-NTF-0009', 'mention', async () => {
    const saved = await save(request, '/api/v1/comments/' + comment.result.id, { expectedRevision: comment.result.revision, body: { html: '<p>New mention <span data-user-id="' + memberId + '">developer</span></p>', mentionUserIds: [memberId], pictureIds: [] } }, zSavedCommentView);
    expect(saved.result.mentions.map(mention => mention.userId)).toEqual([memberId]);
  });
  const blocker = (await save(request, '/api/v2/projects/' + projectId + '/issues', { title: 'Work that must finish ' + crypto.randomUUID() }, zSavedModernIssueView, { method: 'POST', status: 201 })).result;
  await notificationAfter('UC-NTF-0013', 'dependency_blocked', async () => {
    parent = await read(request, '/api/v2/issues/' + parent.summary.id, zModernIssueView);
    const dependency = await save(request, '/api/v1/issues/' + parent.summary.id + '/dependencies', { blockerId: blocker.summary.id, expectedIssueRevision: parent.summary.revision, expectedGraphRevision: parent.graphRevision }, zSavedDependencyView, { method: 'POST' });
    expect(dependency.result.blocker.id).toBe(blocker.summary.id);
    expect((await read(request, '/api/v2/issues/' + parent.summary.id, zModernIssueView)).summary.unfinishedBlockerCount).toBe(1);
  });
  await notificationAfter('UC-NTF-0014', 'dependency_resolved', async () => {
    expect((await move(blocker.summary.id, 'done')).result.summary.stage.category).toBe('done');
    expect((await read(request, '/api/v2/issues/' + parent.summary.id, zModernIssueView)).summary.unfinishedBlockerCount).toBe(0);
  });
  let child: z.infer<typeof zModernIssueView> | undefined;
  await notificationAfter('UC-NTF-0015', 'subtask_created', async () => {
    parent = await read(request, '/api/v2/issues/' + parent.summary.id, zModernIssueView);
    child = (await save(request, '/api/v2/projects/' + projectId + '/issues', { title: 'Last child ' + crypto.randomUUID(), parentId: parent.summary.id, expectedParentRevision: parent.summary.revision }, zSavedModernIssueView, { method: 'POST', status: 201 })).result;
    expect(child.summary.parent?.id).toBe(parent.summary.id);
  });
  await notificationAfter('UC-NTF-0016', 'subtasks_completed', async () => {
    if (!child) throw new Error('The last child was not created.');
    expect((await move(child.summary.id, 'done')).result.summary.stage.category).toBe('done');
    expect((await read(request, '/api/v2/issues/' + parent.summary.id, zModernIssueView)).summary.subtaskProgress).toEqual({ total: 1, done: 1 });
  });
});

test('a delayed private inbox result cannot enter the next account in the same browser session', async ({ page, request }) => {
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  const privateTitle = 'Viewer private inbox ' + crypto.randomUUID();
  const issue = (await save(request, '/api/v2/projects/' + projectId + '/issues', { title: privateTitle }, zSavedModernIssueView, { method: 'POST', status: 201 })).result;
  await save(request, '/api/v1/issues/' + issue.summary.id + '/comments', { body: { html: '<p>Private mention <span data-user-id="' + viewerId + '">viewer</span></p>', mentionUserIds: [viewerId], pictureIds: [] } }, zSavedCommentView, { method: 'POST', status: 201 });
  await signIn(page, 'viewer', '/notifications', /^Inbox$/);
  const row = page.locator('.notification-record').filter({ hasText: issue.summary.key });
  await expect(row).toBeVisible();
  let release = () => {}, captured = false;
  const held = new Promise<void>(resolve => { release = resolve; });
  let ready = () => {};
  const intercepted = new Promise<void>(resolve => { ready = resolve; });
  await page.route('**/api/v1/notifications?*', async route => { const response = await route.fetch(); expect(response.status()).toBe(200); captured = true; ready(); await held; await route.fulfill({ response }); }, { times: 1 });
  try {
    await useCase('UC-NTF-0041', async () => {
      await page.getByRole('button', { name: 'Refresh inbox', exact: true }).click();
      await intercepted; expect(captured).toBe(true);
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(row).toHaveCount(0);
      await fillCredentials(page, 'owner');
      await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
      await expect(page.getByRole('heading', { name: /Welcome,/ })).toBeVisible();
      await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: /^Inbox/ }).click();
      await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Refresh inbox', exact: true })).toBeEnabled();
      const reply = page.waitForResponse(response => response.url().includes('/api/v1/notifications?') && response.request().headers()['authorization'] !== undefined && response.status() === 200);
      release(); await reply;
      await expect(row).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Users', exact: true })).toBeVisible();
      expect((await read(request, '/api/v1/notifications?limit=100', zPageNotificationView)).items.some(item => item.issueId === issue.summary.id)).toBe(false);
    }, 'web');
  } finally { release(); }
});

test('real background maintenance uses the company day, excludes inactive work and deduplicates subsequent runs', async ({ page, request }) => {
  const interval = Number(process.env['NOTIFICATION_WORKER_INTERVAL_SECONDS'] ?? '60');
  test.setTimeout(interval * 2000 + 60000);
  const before = await read(request, '/api/v1/notifications/preferences', zNotificationPreferencesView, 'member');
  try {
    await save(request, '/api/v1/notifications/preferences', { expectedRevision: before.revision, inAppEnabled: true, events: ['due_date'], emailMode: 'off', dueReminders: true }, zSavedNotificationPreferencesView, { role: 'member' });
    const today = (await read(request, '/api/v1/notifications/summary', zInboxSummary, 'member')).companyToday;
    const projectId = await isolatedProject(request); await useModernIssues(projectId);
    const create = async (project: string, title: string, dueDate = '2099-01-01') => (await save(request, '/api/v2/projects/' + project + '/issues', { title, dueDate, assigneeId: memberId }, zSavedModernIssueView, { method: 'POST', status: 201, role: 'member' })).result;
    const completed = await create(projectId, 'Completed due work ' + crypto.randomUUID());
    const done = (await save(request, '/api/v2/issues/' + completed.summary.id + '/move', { expectedRevision: completed.summary.revision, targetStageId: await fixtureStage(request, completed.summary.id, 'done') }, zSavedModernIssueView, { method: 'POST' })).result;
    await save(request, '/api/v2/issues/' + done.summary.id, { expectedRevision: done.summary.revision, editable: { title: done.summary.title, description: done.description, descriptionFormat: done.descriptionFormat, typeId: done.summary.type.id, priorityId: done.summary.priority.id, assigneeId: memberId, dueDate: today, labelIds: [] } }, zSavedModernIssueView);
    const archivedIssue = await create(projectId, 'Retained archived due work ' + crypto.randomUUID()); await prepareFixtureReminderExclusion(archivedIssue.summary.id, today, 'archived_issue');
    const archivedProjectId = await isolatedProject(request); await useModernIssues(archivedProjectId);
    const archivedProjectIssue = await create(archivedProjectId, 'Archived-project due work ' + crypto.randomUUID());
    const archivedProject = await read(request, '/api/v1/projects/' + archivedProjectId, zProjectView);
    await save(request, '/api/v1/projects/' + archivedProjectId + '/archive', { expectedRevision: archivedProject.revision }, zSavedProjectView, { method: 'POST' });
    await prepareFixtureReminderExclusion(archivedProjectIssue.summary.id, today, 'archived_project');
    const due = await create(projectId, 'Due today maintenance ' + crypto.randomUUID(), today);
    const reminderList = async (issueId: string) => (await read(request, '/api/v1/notifications?limit=100', zPageNotificationView, 'member')).items.filter(item => item.issueId === issueId && item.actor.id === 'ffffffff-ffff-4fff-8fff-ffffffffffff');
    // Wait for the actual configured maintenance ticker, not a manufactured event.
    await expect.poll(async () => (await reminderList(due.summary.id)).length, { timeout: interval * 1000 + 15000, intervals: [500, 1000] }).toBe(1);
    const reminder = (await reminderList(due.summary.id))[0]!;
    await useCase('UC-NTF-0061', async () => {
      expect(reminder.reasons).toEqual(['due_date']); expect(reminder.summary).toBe('Due today: ' + due.summary.title);
      expect(reminder.projectId).toBe(projectId); expect(reminder.readAt).toBeNull();
      expect((await read(request, '/api/v2/issues/' + due.summary.id, zModernIssueView)).summary.dueDate).toBe(today);
    }, 'background');
    await useCase('UC-AUD-0004', async () => {
      await signIn(page, 'owner', '/admin/activity', /^Company activity$/);
      await page.getByLabel('Issue key', { exact: true }).fill(due.summary.key);
      const automatic = page.getByRole('region', { name: 'Activity events', exact: true }).locator('article').filter({ hasText: 'Automated reminder' });
      await expect(automatic).toHaveCount(1); await expect(automatic).toContainText('GateGoldJira reminder');
      await expect(automatic).toContainText('scheduled a due-date reminder');
    }, 'web');
    const probe = await create(projectId, 'Next maintenance proof ' + crypto.randomUUID(), today);
    await expect.poll(async () => (await reminderList(probe.summary.id)).length, { timeout: interval * 1000 + 15000, intervals: [500, 1000] }).toBe(1);
    await useCase('UC-NTF-0062', async () => {
      expect((await reminderList(due.summary.id)).map(item => item.id)).toEqual([reminder.id]);
      const history = await read(request, '/api/v1/admin/activity?resourceKind=issue&resourceId=' + due.summary.id, zPageActivityView);
      expect(history.items.filter(event => event.action === 'schedule_due_reminder')).toHaveLength(1);
    }, 'background');
    await useCase('UC-NTF-0063', async () => {
      for (const excluded of [completed, archivedIssue, archivedProjectIssue]) {
        const history = await read(request, '/api/v1/admin/activity?resourceKind=issue&resourceId=' + excluded.summary.id, zPageActivityView);
        expect(history.items.some(event => event.action === 'schedule_due_reminder')).toBe(false);
      }
    }, 'background');
  } finally {
    const current = await read(request, '/api/v1/notifications/preferences', zNotificationPreferencesView, 'member');
    await save(request, '/api/v1/notifications/preferences', { expectedRevision: current.revision, inAppEnabled: before.inAppEnabled, events: before.events, emailMode: before.emailMode, dueReminders: before.dueReminders }, zSavedNotificationPreferencesView, { role: 'member' });
  }
});

test('activity service validates paired filters and scopes retained web/MCP history', async ({ page, request }) => {
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  const created = await save(request, '/api/v2/projects/' + projectId + '/issues', { title: 'تاريخ آمن <img src=x onerror=alert(1)> ' + crypto.randomUUID().slice(0, 6) }, zSavedModernIssueView, { method: 'POST', status: 201 });
  const issue = created.result, endpoint = '/api/v1/admin/activity';
  const exact = endpoint + '?resourceKind=issue&resourceId=' + issue.summary.id;
  await useCase('UC-AUD-0001', async () => { const history = await read(request, endpoint + '?projectId=' + projectId, zPageActivityView); expect(history.items.length).toBeGreaterThan(0); expect(history.items.every(v => v.projectId === projectId)).toBe(true); }, 'rest');
  await useCase('UC-AUD-0002', async () => {
    const history = await read(request, exact, zPageActivityView); expect(history.items.find(v => v.id === created.receipt.eventId)?.channel).toBe('web');
    await signIn(page, 'owner', '/admin/activity', /^Company activity$/);
    await page.getByLabel('Issue key', { exact: true }).fill(issue.summary.key);
    await expect(page.getByRole('region', { name: 'Activity events', exact: true }).locator('article')).toContainText('Web');
  }, 'web');
  for (const [id, query, message] of [
    ['UC-AUD-0006', 'issueKey=DEMO-', /complete issue key/i],
    ['UC-AUD-0011', 'fromDate=2026-10-20&toDate=2026-10-19', /date range/i],
    ['UC-AUD-0013', 'resourceKind=issue', /together/i],
    ['UC-AUD-0014', 'resourceId=' + issue.summary.id, /together/i],
    ['UC-AUD-0015', 'resourceKind=issue&resourceId=invalid', /validation|identifier/i],
  ] as const) await useCase(id, async () => { await rejected(await request.get(apiOrigin + endpoint + '?' + query, { headers: await authorization() }), 422, message); }, 'rest');
  await useCase('UC-AUD-0023', async () => { await rejected(await request.get(apiOrigin + endpoint, { headers: await authorization('viewer') }), 403, /permission|access|forbidden|reading only/i); }, 'rest');
  await useCase('UC-AUD-0024', async () => { const history = await read(request, exact, zPageActivityView, 'viewer'); expect(history.items.find(v => v.id === created.receipt.eventId)?.issueId).toBe(issue.summary.id); }, 'rest');
  await useCase('UC-AUD-0025', async () => { expect((await request.get(apiOrigin + endpoint + '?resourceKind=issue&resourceId=' + crypto.randomUUID(), { headers: await authorization('viewer') })).status()).toBe(404); }, 'rest');
  await useCase('UC-AUD-0026', async () => { expect((await request.get(apiOrigin + exact + '&projectId=' + crypto.randomUUID(), { headers: await authorization('viewer') })).status()).toBe(404); }, 'rest');
  await useCase('UC-AUD-0007', async () => { const history = await read(request, endpoint + '?projectId=' + projectId, zPageActivityView); expect(history.items.every(v => v.projectId === projectId)).toBe(true); }, 'rest');
  const today = (await read(request, '/api/v1/notifications/summary', zInboxSummary)).companyToday;
  await useCase('UC-AUD-0009', async () => { const history = await read(request, exact + '&fromDate=' + today, zPageActivityView); expect(history.items.map(v => v.id)).toContain(created.receipt.eventId); }, 'rest');
  await useCase('UC-AUD-0010', async () => { const history = await read(request, exact + '&toDate=' + today, zPageActivityView); expect(history.items.map(v => v.id)).toContain(created.receipt.eventId); }, 'rest');
  await useCase('UC-AUD-0012', async () => { const history = await read(request, exact, zPageActivityView); expect(history.totalMatching).toBe(1); expect(history.items[0]?.resourceId).toBe(issue.summary.id); }, 'rest');
  await useCase('UC-AUD-0029', async () => {
    await save(request, '/api/v1/issues/' + issue.summary.id + '/watch', { watching: false }, zSavedWatchView, { method: 'POST' });
    expect((await read(request, exact, zPageActivityView)).totalMatching).toBe(1);
  }, 'rest');
  await useCase('UC-AUD-0028', async () => { const history = await read(request, exact, zPageActivityView); expect(history.items[0]?.actor.id).toBe(ownerId); expect(history.items[0]?.actor.displayName).toBe('Local Owner'); }, 'rest');
  await signIn(page, 'owner', '/admin/activity', /^Company activity$/);
  await useCase('UC-AUD-0005', async () => { await page.getByLabel('Issue key', { exact: true }).fill(issue.summary.key.toLowerCase()); await expect(page.locator('#activity-status')).toContainText('1 matching events'); }, 'web');
  const record = page.getByRole('region', { name: 'Activity events', exact: true }).locator('article');
  await useCase('UC-AUD-0031', async () => { await expect(record).toContainText('تاريخ آمن'); }, 'web');
  await useCase('UC-AUD-0032', async () => { await expect(record).toContainText('<img src=x onerror=alert(1)>'); await expect(record.locator('img')).toHaveCount(0); }, 'web');
  await useCase('UC-AUD-0016', async () => { await record.locator('summary').click(); await expect(record.getByText(issue.summary.title, { exact: true }).first()).toBeVisible(); }, 'web');
  await useCase('UC-AUD-0017', async () => { await record.getByRole('link', { name: issue.summary.key, exact: true }).click(); await expect(page.getByRole('heading', { name: issue.summary.title, exact: true })).toBeVisible(); }, 'web');
});

test('history attributes MCP writes, pages exact events, recovers filters and rejects obsolete results', async ({ page, request }) => {
  const accessible = await read(request, '/api/v1/projects?includeArchived=true&limit=100', zPageProjectView);
  for (let count = accessible.items.length; count < 26; count++) await isolatedProject(request);
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  const created = await callTool(request, 'create_issue_v2', { projectId, title: 'MCP history ' + crypto.randomUUID(), retryReference: crypto.randomUUID() }, await token('member', 'mcp'));
  expect(created.status()).toBe(200);
  let issue = z.object({ result: z.object({ structuredContent: z.object({ ok: z.literal(true), data: zSavedModernIssueView }) }) }).parse(await created.json()).result.structuredContent.data.result;
  await signIn(page, 'owner', '/admin/activity', /^Company activity$/);
  const rows = page.getByRole('region', { name: 'Activity events', exact: true }).locator('article');
  await useCase('UC-AUD-0003', async () => {
    await page.getByLabel('Issue key', { exact: true }).fill(issue.summary.key);
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('MCP');
    await expect(rows).toContainText(issue.reporter.displayName);
    expect(issue.reporter.id).toBe(memberId);
  }, 'web');
  for (let index = 0; index < 26; index++) {
    issue = (await save(request, '/api/v2/issues/' + issue.summary.id, { expectedRevision: issue.summary.revision, editable: { title: 'History revision ' + index, description: issue.description, descriptionFormat: issue.descriptionFormat, typeId: issue.summary.type.id, priorityId: issue.summary.priority.id, assigneeId: null, dueDate: null, labelIds: [] } }, zSavedModernIssueView)).result;
  }
  await page.getByRole('button', { name: 'Refresh activity', exact: true }).click();
  await expect(page.locator('#activity-status')).toContainText('27 matching events');
  await expect(rows).toHaveCount(25);
  const first = await rows.evaluateAll(elements => elements.map(element => element.getAttribute('data-activity-id')));
  await useCase('UC-AUD-0018', async () => {
    await page.getByRole('button', { name: 'Next activity page', exact: true }).click();
    await expect(rows).toHaveCount(2);
    const next = await rows.evaluateAll(elements => elements.map(element => element.getAttribute('data-activity-id')));
    expect(new Set([...first, ...next]).size).toBe(27);
    const events = await read(request, '/api/v1/admin/activity?resourceKind=issue&resourceId=' + issue.summary.id + '&limit=100', zPageActivityView);
    expect(events.items.map(event => event.id)).toEqual([...first, ...next]);
  }, 'web');
  await useCase('UC-AUD-0019', async () => {
    await page.getByRole('button', { name: 'First activity page', exact: true }).click();
    await expect(rows).toHaveCount(25);
    expect(await rows.evaluateAll(elements => elements.map(element => element.getAttribute('data-activity-id')))).toEqual(first);
  }, 'web');
  await useCase('UC-AUD-0022', async () => {
    await page.getByLabel('Issue key', { exact: true }).fill('NONE-99999999');
    await expect(page.getByRole('heading', { name: 'No activity matches these filters', exact: true })).toBeVisible();
    await expect(rows).toHaveCount(0);
  }, 'web');
  await useCase('UC-AUD-0020', async () => {
    await page.getByRole('button', { name: 'Clear history filters', exact: true }).click();
    await expect(page.getByLabel('Issue key', { exact: true })).toHaveValue('');
    await expect(page.getByRole('combobox', { name: 'Project', exact: true })).toHaveValue('');
    await expect(rows).toHaveCount(25);
  }, 'web');
  await useCase('UC-AUD-0008', async () => {
    const projects = page.getByRole('combobox', { name: 'Project', exact: true });
    const count = await projects.locator('option').count();
    await page.getByRole('button', { name: 'Load more projects', exact: true }).click();
    await expect.poll(() => projects.locator('option').count()).toBeGreaterThan(count);
    await expect(projects).toHaveValue('');
    await expect(page.getByLabel('Issue key', { exact: true })).toHaveValue('');
    await expect(rows).toHaveCount(25);
  }, 'web');
  await useCase('UC-AUD-0021', async () => {
    await page.route('**/api/v1/admin/activity?*', route => route.abort('failed'), { times: 1 });
    await page.getByLabel('Issue key', { exact: true }).fill(issue.summary.key);
    await expect(page.getByRole('button', { name: 'Retry history search', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Retry history search', exact: true }).click();
    await expect(page.locator('#activity-status')).toContainText('27 matching events');
    await expect(rows).toHaveCount(25);
    await expect(rows.first()).toContainText(issue.summary.key);
  }, 'web');
  await useCase('UC-AUD-0030', async () => {
    let release = () => {}, captured = false;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/api/v1/admin/activity?*', async route => {
      const response = await route.fetch(); captured = true; await held; await route.fulfill({ response });
    }, { times: 1 });
    try {
      await page.getByRole('button', { name: 'Refresh activity', exact: true }).click();
      await expect.poll(() => captured).toBe(true);
      await page.getByLabel('Issue key', { exact: true }).fill('NONE-99999999');
      await expect(page.getByRole('heading', { name: 'No activity matches these filters', exact: true })).toBeVisible();
      const reply = page.waitForResponse(response => response.url().includes('/api/v1/admin/activity?') && new URL(response.url()).searchParams.get('issueKey') === issue.summary.key);
      release(); await reply;
      await expect(page.getByRole('heading', { name: 'No activity matches these filters', exact: true })).toBeVisible();
      await expect(rows).toHaveCount(0);
      await expect(page.getByLabel('Issue key', { exact: true })).toHaveValue('NONE-99999999');
    } finally { release(); }
  }, 'web');
});

test('personal MCP credential reveal, privacy, activity, validation and revocation use the actual protocol', async ({ page, request }) => {
  const name = 'اتصال خاص ' + crypto.randomUUID().slice(0, 8);
  await signIn(page, 'viewer', '/account/mcp-tokens', /^MCP connections$/);
  await useCase('UC-MCP-0005', async () => { await page.getByLabel('Token name', { exact: true }).fill('   '); await expect(page.getByRole('button', { name: 'Generate token', exact: true })).toBeDisabled(); }, 'web');
  await useCase('UC-MCP-0006', async () => {
    await rejected(await request.post(apiOrigin + '/api/v1/me/mcp-tokens', { headers: await authorization('viewer'), data: { name: 'x'.repeat(81) } }), 422, /validation|name|80/i);
  }, 'rest');
  let credential: z.infer<typeof zCreatedToken> | undefined;
  try {
    await useCase('UC-MCP-0004', async () => {
      await page.getByLabel('Token name', { exact: true }).fill(name);
      const response = page.waitForResponse(r => r.url().endsWith('/api/v1/me/mcp-tokens') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Generate token', exact: true }).click();
      const reply = await response; expect(reply.status()).toBe(201); credential = zCreatedToken.parse(await reply.json());
      await expect(page.getByRole('heading', { name: 'Token created', exact: true })).toBeFocused();
      expect(/^gg_mcp_[A-Za-z0-9_-]{43}$/.test(credential.token)).toBe(true); expect(credential.details.kind).toBe('personal'); expect(credential.details.expiresAt).toBeNull();
    }, 'web');
    if (!credential) throw new Error('Credential creation did not finish.');
    const created = credential;
    await useCase('UC-MCP-0007', async () => { expect(created.details.name).toBe(name); }, 'rest');
    await useCase('UC-MCP-0008', async () => { await expect(page.getByLabel('Your new MCP token')).toHaveAttribute('type', 'password'); }, 'web');
    await useCase('UC-MCP-0009', async () => { await page.getByRole('button', { name: 'Show token', exact: true }).click(); await expect(page.getByLabel('Your new MCP token')).toHaveAttribute('type', 'text'); await expect(page.getByLabel('Your new MCP token')).toHaveValue(created.token); }, 'web');
    await useCase('UC-MCP-0010', async () => { await page.getByRole('button', { name: 'Hide token', exact: true }).click(); await expect(page.getByLabel('Your new MCP token')).toHaveAttribute('type', 'password'); }, 'web');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await useCase('UC-MCP-0011', async () => {
      await page.getByRole('button', { name: 'Copy token', exact: true }).click();
      expect(await page.evaluate(async value => (await navigator.clipboard.readText()) === value, created.token)).toBe(true);
      await expect(page.getByText('Token copied.', { exact: true })).toBeVisible();
    }, 'web');
    await useCase('UC-MCP-0012', async () => {
      await page.getByRole('button', { name: 'Copy Antigravity config', exact: true }).click();
      const correct = await page.evaluate(async ({ secret, endpoint }) => {
        const text = await navigator.clipboard.readText();
        const parsed: unknown = JSON.parse(text);
        if (typeof parsed !== 'object' || !parsed || !('mcpServers' in parsed)) return false;
        return text.includes(endpoint) && text.includes('Bearer ' + secret);
      }, { secret: created.token, endpoint: apiOrigin + '/mcp' });
      expect(correct).toBe(true);
      await expect(page.getByText('Antigravity configuration copied.', { exact: false })).toBeVisible();
    }, 'web');
    await useCase('UC-MCP-0026', async () => {
      const response = await callTool(request, 'get_me', {}, created.token); expect(response.status()).toBe(200);
      const wire = z.object({ result: z.object({ structuredContent: z.object({ ok: z.literal(true), data: zMe }) }) }).parse(await response.json());
      expect(wire.result.structuredContent.data.userId).toBe(viewerId);
    }, 'mcp');
    await useCase('UC-MCP-0031', async () => {
      const denied = await request.get(apiOrigin + '/api/v1/me', { headers: { Authorization: 'Bearer ' + created.token } });
      expect(denied.status()).toBe(401);
    }, 'rest');
    await useCase('UC-MCP-0014', async () => { await page.getByRole('button', { name: 'Done', exact: true }).click(); await expect(page.getByLabel('Your new MCP token')).toHaveCount(0); }, 'web');
    await useCase('UC-MCP-0002', async () => { await page.getByRole('button', { name: 'Refresh tokens', exact: true }).click(); await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Active'); }, 'web');
    await useCase('UC-MCP-0001', async () => { const own = await read(request, '/api/v1/me/mcp-tokens', zTokenList, 'viewer'); expect(own.items.find(v => v.id === created.details.id)?.name).toBe(name); expect(own.endpoint).toBe(apiOrigin + '/mcp'); }, 'rest');
    await useCase('UC-MCP-0024', async () => { const response = await request.get(apiOrigin + '/api/v1/me/mcp-tokens', { headers: await authorization('viewer') }); expect(await response.text()).not.toContain(created.token); expect(response.headers()['cache-control']).toBe('no-store'); }, 'rest');
    await useCase('UC-MCP-0076', async () => { await page.getByRole('button', { name: 'View activity for ' + name, exact: true }).click(); await expect(page.getByRole('region', { name: 'Token activity', exact: true })).toContainText('get_me'); }, 'web');
    await useCase('UC-MCP-0080', async () => {
      expect((await callTool(request, 'get_me', {}, created.token)).status()).toBe(200);
      const log = await read(request, '/api/v1/me/mcp-tokens/' + created.details.id + '/activity', zTokenActivityPage, 'viewer');
      expect(log.items).toEqual(expect.arrayContaining([expect.objectContaining({ toolName: 'get_me', outcome: 'succeeded', errorCode: null })]));
    }, 'mcp');
    await useCase('UC-MCP-0081', async () => {
      const denied = await callTool(request, 'get_project', { projectId: crypto.randomUUID() }, created.token); expect(denied.status()).toBe(200);
      const log = await read(request, '/api/v1/me/mcp-tokens/' + created.details.id + '/activity', zTokenActivityPage, 'viewer');
      expect(log.items).toEqual(expect.arrayContaining([expect.objectContaining({ toolName: 'get_project', outcome: 'failed' })]));
    }, 'mcp');
    await useCase('UC-MCP-0077', async () => { await page.getByRole('button', { name: 'Refresh activity', exact: true }).click(); await expect(page.getByRole('region', { name: 'Token activity', exact: true })).toContainText('get_project'); }, 'web');
    await useCase('UC-MCP-0083', async () => {
      const response = await request.get(apiOrigin + '/api/v1/me/mcp-tokens/' + created.details.id + '/activity', { headers: await authorization('viewer') });
      const wire = await response.text(); expect(wire).not.toContain(created.token); expect(wire).not.toContain('arguments'); expect(wire).not.toContain('displayName');
    }, 'rest');
    await useCase('UC-MCP-0079', async () => { await page.getByRole('button', { name: 'Close activity', exact: true }).click(); await expect(page.getByRole('region', { name: 'Token activity', exact: true })).toHaveCount(0); }, 'web');
    await useCase('UC-MCP-0023', async () => {
      expect((await read(request, '/api/v1/me/mcp-tokens', zTokenList, 'member')).items.map(v => v.id)).not.toContain(created.details.id);
      expect((await request.get(apiOrigin + '/api/v1/me/mcp-tokens/' + created.details.id + '/activity', { headers: await authorization('member') })).status()).toBe(404);
      expect((await request.post(apiOrigin + '/api/v1/me/mcp-tokens/' + created.details.id + '/revoke', { headers: await authorization('member') })).status()).toBe(404);
    }, 'rest');
    await useCase('UC-MCP-0020', async () => { await page.getByRole('button', { name: 'Revoke ' + name, exact: true }).click(); await expect(page.getByRole('button', { name: 'Confirm revoke ' + name, exact: true })).toBeVisible(); }, 'web');
    await useCase('UC-MCP-0021', async () => { await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(page.getByRole('button', { name: 'Confirm revoke ' + name, exact: true })).toHaveCount(0); await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Active'); }, 'web');
    await useCase('UC-MCP-0022', async () => { await page.getByRole('button', { name: 'Revoke ' + name, exact: true }).click(); await page.getByRole('button', { name: 'Confirm revoke ' + name, exact: true }).click(); await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Revoked'); }, 'web');
    await useCase('UC-MCP-0028', async () => { expect((await callTool(request, 'get_me', {}, created.token)).status()).toBe(401); }, 'mcp');
  } finally {
    if (credential) await save(request, '/api/v1/me/mcp-tokens/' + credential.details.id + '/revoke', {}, zTokenView, { method: 'POST', role: 'viewer' });
  }
});

test('MCP configuration clipboard feedback and unrecoverable personal secrets have explicit recovery', async ({ page, request }) => {
  const created: z.infer<typeof zCreatedToken>[] = [];
  const createInPage = async (name: string) => {
    await page.getByLabel('Token name', { exact: true }).fill(name);
    const response = page.waitForResponse(reply => reply.url().endsWith('/api/v1/me/mcp-tokens') && reply.request().method() === 'POST');
    await page.getByRole('button', { name: 'Generate token', exact: true }).click();
    const reply = await response; expect(reply.status()).toBe(201);
    const credential = zCreatedToken.parse(await reply.json()); created.push(credential);
    await expect(page.getByLabel('Your new MCP token')).toHaveValue(credential.token);
    return credential;
  };
  try {
    await signIn(page, 'viewer', '/account/mcp-tokens', /^MCP connections$/);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await useCase('UC-MCP-0040', async () => {
      const listing = await read(request, '/api/v1/me/mcp-tokens', zTokenList, 'viewer');
      await page.getByRole('button', { name: 'Copy OAuth configuration', exact: true }).click();
      const copied: unknown = await page.evaluate(async () => JSON.parse(await navigator.clipboard.readText()) as unknown);
      const config = z.object({ mcpServers: z.object({ gategoldjira: z.object({ command: z.literal('npx'), args: z.array(z.string()) }).strict() }) }).strict().parse(copied);
      const args = config.mcpServers.gategoldjira.args;
      expect(args.slice(0, 3)).toEqual(['-y', 'mcp-remote@0.15.1', listing.endpoint]);
      expect(args[args.indexOf('--resource') + 1]).toBe(listing.endpoint);
      expect(JSON.parse(args[args.indexOf('--static-oauth-client-info') + 1]!)).toEqual({ client_id: listing.oauthClientId });
      expect(JSON.parse(args[args.indexOf('--static-oauth-client-metadata') + 1]!)).toEqual({ scope: 'gategoldjira:access', token_endpoint_auth_method: 'none' });
      expect(JSON.stringify(config)).not.toMatch(/gg_mcp_|Authorization|client_secret/);
      await expect(page.getByText('OAuth configuration copied.', { exact: false })).toBeVisible();
    }, 'web');
    await page.evaluate(() => { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async () => { throw new DOMException('Clipboard permission denied', 'NotAllowedError'); } }); });
    await useCase('UC-MCP-0041', async () => {
      await page.getByRole('button', { name: 'Copy OAuth configuration', exact: true }).click();
      await expect(page.getByText('Clipboard access is unavailable. Allow clipboard access, then copy the OAuth configuration again.', { exact: true })).toBeVisible();
    }, 'web');
    const first = await createInPage('Transient secret ' + crypto.randomUUID());
    await useCase('UC-MCP-0013', async () => {
      await page.getByRole('button', { name: 'Copy token', exact: true }).click();
      await expect(page.getByText('Clipboard access is unavailable. Use Show token, then select and copy the token.', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Show token', exact: true }).click();
      await expect(page.getByLabel('Your new MCP token')).toHaveValue(first.token);
    }, 'web');
    await useCase('UC-MCP-0015', async () => {
      await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Projects', exact: true }).click();
      await expect(page.getByLabel('Your new MCP token')).toHaveCount(0);
      await page.getByRole('link', { name: 'Account MCP tokens', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'MCP connections', exact: true })).toBeVisible();
      await expect(page.getByRole('row').filter({ hasText: first.details.name })).toBeVisible();
      await expect(page.getByLabel('Your new MCP token')).toHaveCount(0);
      expect(await page.evaluate(value => JSON.stringify({ local: localStorage, session: sessionStorage, html: document.body.innerHTML }).includes(value), first.token)).toBe(false);
    }, 'web');
    const second = await createInPage('Switch secret ' + crypto.randomUUID());
    await useCase('UC-MCP-0016', async () => {
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await fillCredentials(page, 'owner');
      await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
      await expect(page.getByRole('heading', { name: /Welcome,/ })).toBeVisible();
      await page.getByRole('link', { name: 'Account MCP tokens', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'MCP connections', exact: true })).toBeVisible();
      await expect(page.getByLabel('Your new MCP token')).toHaveCount(0);
      await expect(page.getByRole('row').filter({ hasText: second.details.name })).toHaveCount(0);
      expect(await page.evaluate(value => document.body.innerHTML.includes(value), second.token)).toBe(false);
    }, 'web');
    await useCase('UC-MCP-0003', async () => {
      expect((await read(request, '/api/v1/me/mcp-tokens', zTokenList)).items).toHaveLength(0);
      await expect(page.getByText('No MCP connections yet. Connect with browser login or create a personal token above.', { exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Connect Antigravity with browser login', exact: true })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Create a personal token instead', exact: true })).toBeVisible();
    }, 'web');
  } finally {
    for (const credential of created) await save(request, '/api/v1/me/mcp-tokens/' + credential.details.id + '/revoke', {}, zTokenView, { method: 'POST', role: 'viewer' });
  }
});

test('lost MCP creation replies recover only metadata and require revoking and replacing the credential', async ({ page, request }) => {
  const created: z.infer<typeof zCreatedToken>[] = [];
  try {
    await signIn(page, 'viewer', '/account/mcp-tokens', /^MCP connections$/);
    const name = 'Lost response ' + crypto.randomUUID();
    await page.route('**/api/v1/me/mcp-tokens', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      const reply = await route.fetch(); expect(reply.status()).toBe(201);
      created.push(zCreatedToken.parse(await reply.json()));
      await route.abort('failed');
    }, { times: 1 });
    await useCase('UC-MCP-0019', async () => {
      await page.getByLabel('Token name', { exact: true }).fill(name);
      await page.getByRole('button', { name: 'Generate token', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('The request could not be completed');
      await page.getByRole('button', { name: 'Refresh tokens', exact: true }).click();
      await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Active');
      await expect(page.getByLabel('Your new MCP token')).toHaveCount(0);
      await page.getByRole('button', { name: 'Revoke ' + name, exact: true }).click();
      await page.getByRole('button', { name: 'Confirm revoke ' + name, exact: true }).click();
      await expect(page.getByRole('row').filter({ hasText: name })).toContainText('Revoked');
      await page.getByLabel('Token name', { exact: true }).fill('Replacement ' + name);
      const response = page.waitForResponse(reply => reply.url().endsWith('/api/v1/me/mcp-tokens') && reply.request().method() === 'POST');
      await page.getByRole('button', { name: 'Generate token', exact: true }).click();
      const credential = zCreatedToken.parse(await (await response).json()); created.push(credential);
      await expect(page.getByLabel('Your new MCP token')).toHaveValue(credential.token);
      expect(created[0]?.details.id).not.toBe(credential.details.id);
      expect((await callTool(request, 'get_me', {}, created[0]!.token)).status()).toBe(401);
      expect((await callTool(request, 'get_me', {}, credential.token)).status()).toBe(200);
    }, 'web');
  } finally {
    for (const credential of created) await save(request, '/api/v1/me/mcp-tokens/' + credential.details.id + '/revoke', {}, zTokenView, { method: 'POST', role: 'viewer' });
  }
});

test('connection activity appends exact older calls, ignores delayed logs and enforces current membership', async ({ page, request }) => {
  const first = await save(request, '/api/v1/me/mcp-tokens', { name: 'Paged activity ' + crypto.randomUUID() }, zCreatedToken, { method: 'POST', status: 201, role: 'viewer' });
  const second = await save(request, '/api/v1/me/mcp-tokens', { name: 'New activity ' + crypto.randomUUID() }, zCreatedToken, { method: 'POST', status: 201, role: 'viewer' });
  let release = () => {};
  try {
    for (let count = 0; count < 27; count++) expect((await callTool(request, 'get_me', {}, first.token)).status()).toBe(200);
    await signIn(page, 'viewer', '/account/mcp-tokens', /^MCP connections$/);
    await page.getByRole('button', { name: 'View activity for ' + first.details.name, exact: true }).click();
    const rows = page.getByRole('region', { name: 'Token activity', exact: true }).locator('tbody tr');
    await expect(rows).toHaveCount(25);
    await useCase('UC-MCP-0078', async () => {
      const before = await read(request, '/api/v1/me/mcp-tokens/' + first.details.id + '/activity', zTokenActivityPage, 'viewer');
      expect(before.items).toHaveLength(25); expect(before.nextCursor).toBeTruthy();
      const after = await read(request, '/api/v1/me/mcp-tokens/' + first.details.id + '/activity?before=' + encodeURIComponent(before.nextCursor!), zTokenActivityPage, 'viewer');
      expect(after.items).toHaveLength(2); expect(new Set([...before.items, ...after.items].map(entry => entry.id)).size).toBe(27);
      await page.getByRole('button', { name: 'Load older activity', exact: true }).click();
      await expect(rows).toHaveCount(27);
      await expect(page.getByRole('button', { name: 'Load older activity', exact: true })).toHaveCount(0);
    }, 'web');
    await useCase('UC-MCP-0084', async () => {
      let captured = false;
      const held = new Promise<void>(resolve => { release = resolve; });
      await page.route('**/api/v1/me/mcp-tokens/' + first.details.id + '/activity*', async route => { const response = await route.fetch(); captured = true; await held; await route.fulfill({ response }); }, { times: 1 });
      await page.getByRole('button', { name: 'Refresh activity', exact: true }).click();
      await expect.poll(() => captured).toBe(true);
      await page.getByRole('button', { name: 'View activity for ' + second.details.name, exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Activity for ' + second.details.name, exact: true })).toBeVisible();
      await expect(page.getByText('No recorded calls yet.', { exact: false })).toBeVisible();
      const response = page.waitForResponse(reply => reply.url().includes('/' + first.details.id + '/activity'));
      release(); await response;
      await expect(page.getByRole('heading', { name: 'Activity for ' + second.details.name, exact: true })).toBeVisible();
      await expect(page.getByText('No recorded calls yet.', { exact: false })).toBeVisible();
      await expect(rows).toHaveCount(0);
    }, 'web');
    await useCase('UC-MCP-0030', async () => {
      const projectId = await isolatedProject(request);
      const allowed = await callTool(request, 'get_project', { projectId }, first.token);
      expect(z.object({ result: z.object({ structuredContent: z.object({ ok: z.boolean() }) }) }).parse(await allowed.json()).result.structuredContent.ok).toBe(true);
      await save(request, '/api/v1/projects/' + projectId + '/memberships/' + viewerId + '/remove', { expectedRevision: '1' }, zSavedMembershipView, { method: 'POST' });
      const denied = await callTool(request, 'get_project', { projectId }, first.token);
      const failure = z.object({ result: z.object({ isError: z.literal(true), structuredContent: z.object({ ok: z.literal(false), error: zProjectFailureBody }) }) }).parse(await denied.json()).result.structuredContent.error;
      expect(failure.error.code).toMatch(/unavailable|forbidden/);
      expect(failure.current).toBeNull();
    }, 'mcp');
  } finally {
    release();
    for (const credential of [first, second]) await save(request, '/api/v1/me/mcp-tokens/' + credential.details.id + '/revoke', {}, zTokenView, { method: 'POST', role: 'viewer' });
  }
});

test('MCP discovery, catalog, identity and invalid input expose safe typed boundaries', async ({ request }) => {
  const headers = { Authorization: 'Bearer ' + await token('owner', 'mcp'), Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-11-25' };
  await useCase('UC-MCP-0033', async () => {
    const response = await request.post(apiOrigin + '/mcp', { headers, data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'coverage-integration', version: '1.0' } } } });
    expect(response.status()).toBe(200);
    const reply = z.object({ result: z.object({ protocolVersion: z.string(), serverInfo: z.object({ name: z.string(), version: z.string() }), capabilities: z.object({ tools: z.object({}).passthrough() }) }) }).parse(await response.json());
    expect(reply.result.serverInfo.name).toBe('GateGoldJira'); expect(reply.result.protocolVersion).toBe('2025-11-25');
  }, 'mcp');
  const names: string[] = [];
  await useCase('UC-MCP-0034', async () => {
    const expected = z.object({ mcpTools: z.array(z.object({ name: z.string(), description: z.string() })) }).parse(JSON.parse(await readFile(resolve('../docs/use-cases/surface-inventory.json'), 'utf8')) as unknown);
    let cursor: string | undefined;
    do {
      const response = await request.post(apiOrigin + '/mcp', { headers, data: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: cursor ? { cursor } : {} } });
      expect(response.status()).toBe(200);
      const result = z.object({ result: z.object({ tools: z.array(z.object({ name: z.string(), description: z.string(), inputSchema: z.object({ type: z.literal('object') }).passthrough() })), nextCursor: z.string().optional() }) }).parse(await response.json()).result;
      expect(result.tools.length).toBeGreaterThan(0); expect(result.tools.length).toBeLessThanOrEqual(50);
      for (const tool of result.tools) expect(tool.description).toBe(expected.mcpTools.find(item => item.name === tool.name)?.description);
      names.push(...result.tools.map(v => v.name)); cursor = result.nextCursor;
    } while (cursor);
    expect(names.length).toBe(new Set(names).size); expect([...names].sort()).toEqual(expected.mcpTools.map(v => v.name).sort());
  }, 'mcp');
  await useCase('UC-MCP-0025', async () => { expect(names).not.toContain('create_personal_mcp_token'); expect(names).not.toContain('list_personal_mcp_tokens'); expect(names).not.toContain('revoke_personal_mcp_token'); }, 'mcp');
  await useCase('UC-MCP-0032', async () => {
    const response = await request.get(apiOrigin + '/.well-known/oauth-protected-resource/mcp'); expect(response.status()).toBe(200);
    const discovery = z.object({ resource: z.url(), authorization_servers: z.array(z.url()), scopes_supported: z.array(z.string()), gategoldjira_website_url: z.url() }).parse(await response.json());
    expect(discovery.resource).toBe(apiOrigin + '/mcp'); expect(discovery.authorization_servers).toContain(apiOrigin + '/oauth'); expect(discovery.scopes_supported).toContain('gategoldjira:access');
    expect(discovery.gategoldjira_website_url).toBe(process.env['GATEGOLD_WEB_URL']);
  }, 'mcp');
  await useCase('UC-MCP-0039', async () => {
    const response = await request.get(apiOrigin + '/.well-known/oauth-authorization-server/oauth'); expect(response.status()).toBe(200);
    const metadata = await response.json();
    expect(metadata.issuer).toBe(apiOrigin + '/oauth'); expect(metadata.token_endpoint).toBe(apiOrigin + '/oauth/token'); expect(metadata.authorization_endpoint).toBe(apiOrigin + '/oauth/authorize'); expect(metadata.revocation_endpoint).toBe(apiOrigin + '/oauth/revoke');
    expect(metadata.code_challenge_methods_supported).toEqual(['S256']); expect(metadata.token_endpoint_auth_methods_supported).toEqual(['none']); expect(metadata.grant_types_supported).toEqual(['authorization_code', 'refresh_token']);
  }, 'rest');
  await useCase('UC-MCP-0035', async () => {
    const response = await callTool(request, 'get_me'); expect(response.status()).toBe(200);
    const me = z.object({ result: z.object({ structuredContent: z.object({ ok: z.literal(true), data: zMe }) }) }).parse(await response.json());
    expect(me.result.structuredContent.data.userId).toBe(ownerId);
  }, 'mcp');
  await useCase('UC-MCP-0038', async () => {
    const response = await callTool(request, 'get_project', { projectId: 'not-a-uuid' }); expect(response.status()).toBe(200);
    const result = z.object({ jsonrpc: z.literal('2.0'), id: z.literal(1), result: z.object({ isError: z.literal(true), content: z.array(z.object({ type: z.literal('text'), text: z.string() })).length(1), structuredContent: z.object({ ok: z.literal(false), data: z.null(), error: zProjectFailureBody }) }) }).parse(await response.json());
    expect(result.result.structuredContent.error.error).toMatchObject({ code: 'validation_failed', nextAction: 'review_fields', retryable: false, fieldErrors: [] });
    expect(result.result.structuredContent.error.current).toBeNull();
    expect(result.result.content[0]!.text).toBe(result.result.structuredContent.error.error.message);
    expect(result.result.content[0]!.text).toBe('Tool arguments do not match the declared schema.');
    expect(JSON.stringify(result.result)).not.toContain('not-a-uuid');
  }, 'mcp');
  await useCase('UC-MCP-0027', async () => { for (const value of ['gg_mcp_short', 'gg_mcp_' + '!'.repeat(43), 'gg_mcp_' + 'A'.repeat(43)]) expect((await callTool(request, 'get_me', {}, value)).status()).toBe(401); }, 'mcp');
  await useCase('UC-MCP-0037', async () => {
    expect((await request.post(apiOrigin + '/mcp', { headers: { Accept: 'application/json, text/event-stream' }, data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} } })).status()).toBe(401);
  }, 'mcp');
  await useCase('UC-MCP-0036', async () => {
    const projectId = await isolatedProject(request);
    const response = await callTool(request, 'get_project', { projectId }); expect(response.status()).toBe(200);
    const result = z.object({ result: z.object({ structuredContent: z.object({ ok: z.literal(true), links: z.array(z.object({ url: z.url(), title: z.string() })) }) }) }).parse(await response.json());
    expect(result.result.structuredContent.links.some(v => new URL(v.url).pathname === '/projects/' + projectId)).toBe(true);
  }, 'mcp');
});

test('OAuth authorization and token endpoints reject each unsafe public-client input', async ({ page, request }) => {
  const verifier = 'abcdefghijklmnopqrstuvwxyz0123456789-._~ABCDE';
  const query = () => new URLSearchParams({ client_id: 'gategoldjira-antigravity', response_type: 'code', scope: 'gategoldjira:access', resource: apiOrigin + '/mcp', redirect_uri: apiOrigin + '/oauth/callback', state: 'coverage-state', code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
  for (const [id, key, value] of [
    ['UC-MCP-0043', 'client_id', 'unregistered-client'], ['UC-MCP-0044', 'response_type', 'token'],
    ['UC-MCP-0045', 'scope', 'admin'], ['UC-MCP-0046', 'resource', 'https://example.invalid/mcp'],
    ['UC-MCP-0047', 'code_challenge_method', 'plain'], ['UC-MCP-0048', 'state', ''],
    ['UC-MCP-0049', 'redirect_uri', 'https://example.invalid/callback'],
    ['UC-MCP-0051', 'state', 'x'.repeat(8500)],
  ] as const) await useCase(id, async () => {
    const values = query(); values.set(key, value);
    const response = await request.get(apiOrigin + '/oauth/authorize?' + values, { maxRedirects: 0 });
    expect(response.status()).toBe(400); expect(await response.json()).toEqual({ error: 'invalid_request' }); expect(response.headers()['location']).toBeUndefined();
  }, 'rest');
  await useCase('UC-MCP-0050', async () => {
    const values = query(); values.append('client_id', 'gategoldjira-antigravity');
    const response = await request.get(apiOrigin + '/oauth/authorize?' + values, { maxRedirects: 0 }); expect(response.status()).toBe(400); expect(await response.json()).toEqual({ error: 'invalid_request' });
  }, 'rest');
  await useCase('UC-MCP-0059', async () => {
    const response = await request.post(apiOrigin + '/oauth/token', { data: { grant_type: 'authorization_code' } }); expect(response.status()).toBe(400); expect(await response.json()).toEqual({ error: 'invalid_request' });
  }, 'rest');
  for (const [id, form, status, error] of [
    ['UC-MCP-0060', { client_secret: 'not-a-public-client' }, 401, 'invalid_client'],
    ['UC-MCP-0061', { resource: 'https://example.invalid/mcp' }, 400, 'invalid_target'],
    ['UC-MCP-0062', { grant_type: 'password' }, 400, 'unsupported_grant_type'],
  ] as const) await useCase(id, async () => {
    const response = await request.post(apiOrigin + '/oauth/token', { form: { client_id: 'gategoldjira-antigravity', grant_type: 'authorization_code', resource: apiOrigin + '/mcp', ...form } });
    expect(response.status()).toBe(status); expect(await response.json()).toEqual({ error });
  }, 'rest');
  await useCase('UC-MCP-0055', async () => {
    expect((await request.get(apiOrigin + '/api/v1/me/mcp-authorizations/not-valid', { headers: await authorization('member') })).status()).toBe(422);
    await signIn(page, 'member', '/account/mcp-authorize?request=not-valid', /^Connect Antigravity$/);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve connection', exact: true })).toHaveCount(0);
  }, 'web');
});

test('OAuth consent, one-time code exchange, rotating refresh and revocation use persisted real grants', async ({ page, request }) => {
  test.setTimeout(60_000);
  const verifier = 'abcdefghijklmnopqrstuvwxyz0123456789-._~ABCDE';
  const callback = apiOrigin + '/oauth/callback';
  const initialIds = new Set((await read(request, '/api/v1/me/mcp-tokens', zTokenList, 'member')).items.map(v => v.id));
  const begin = async () => {
    const query = new URLSearchParams({ client_id: 'gategoldjira-antigravity', response_type: 'code', scope: 'gategoldjira:access', resource: apiOrigin + '/mcp', redirect_uri: callback, state: crypto.randomUUID(), code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
    const response = await request.get(apiOrigin + '/oauth/authorize?' + query, { maxRedirects: 0 }); expect(response.status()).toBe(302);
    const location = new URL(response.headers()['location']!); const id = location.searchParams.get('request'); expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    return { id: id!, route: location.pathname + location.search, state: query.get('state')! };
  };
  const exchange = (code: string, codeVerifier = verifier) => request.post(apiOrigin + '/oauth/token', { form: { grant_type: 'authorization_code', client_id: 'gategoldjira-antigravity', code, code_verifier: codeVerifier, redirect_uri: callback, resource: apiOrigin + '/mcp' } });
  const credentialsSchema = z.object({ access_token: z.string().regex(/^gg_oauth_[A-Za-z0-9_-]{43}$/), refresh_token: z.string().regex(/^gg_refresh_[A-Za-z0-9_-]{43}$/), expires_in: z.number().positive(), token_type: z.literal('Bearer'), scope: z.literal('gategoldjira:access') });
  try {
    const denied = await begin();
    await useCase('UC-MCP-0054', async () => {
      await signIn(page, 'member', denied.route, /^Connect Antigravity$/);
      await page.route(callback + '?**', route => route.fulfill({ contentType: 'text/html', body: '<h1>Client callback received</h1>' }));
      await page.getByRole('button', { name: 'Cancel connection', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Client callback received', exact: true })).toBeVisible();
      const returned = new URL(page.url()); expect(returned.searchParams.get('error')).toBe('access_denied'); expect(returned.searchParams.get('code')).toBeNull(); expect(returned.searchParams.get('state')).toBe(denied.state);
    }, 'web');
    await useCase('UC-MCP-0056', async () => { expect((await request.get(apiOrigin + '/api/v1/me/mcp-authorizations/' + denied.id, { headers: await authorization('member') })).status()).toBe(404); }, 'rest');
    let approved: Awaited<ReturnType<typeof begin>>;
    approved = await useCase('UC-MCP-0042', async () => {
      const next = await begin(); expect(next.route).toMatch(/^\/account\/mcp-authorize\?request=/); return next;
    }, 'rest');
    await signIn(page, 'member', approved.route, /^Connect Antigravity$/);
    await useCase('UC-MCP-0052', async () => {
      await expect(page.getByText('It can read and change records using your current account and project permissions.', { exact: true })).toBeVisible();
      await expect(page.getByText('Return address: ' + callback, { exact: true })).toBeVisible();
      const consent = await read(request, '/api/v1/me/mcp-authorizations/' + approved.id, zOAuthConsent, 'member'); expect(consent).toEqual({ clientName: 'Antigravity', redirectUri: callback, scope: 'gategoldjira:access' });
    }, 'web');
    await useCase('UC-MCP-0053', async () => {
      await page.getByRole('button', { name: 'Approve connection', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Client callback received', exact: true })).toBeVisible();
      const target = new URL(page.url()); expect(target.searchParams.get('state')).toBe(approved.state); expect(target.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(target.searchParams.get('iss')).toBe(apiOrigin + '/oauth');
    }, 'web');
    const target = new URL(page.url()), code = target.searchParams.get('code')!;
    await useCase('UC-MCP-0057', async () => { expect(target.origin).toBe(apiOrigin); expect(target.pathname).toBe('/oauth/callback'); expect(target.username).toBe(''); expect(target.password).toBe(''); }, 'web');
    await useCase('UC-MCP-0063', async () => { const response = await exchange(code, 'wrong-verifier-that-has-the-required-length123456'); expect(response.status()).toBe(400); expect(await response.json()).toEqual({ error: 'invalid_grant' }); }, 'rest');
    const credentials = await useCase('UC-MCP-0058', async () => {
      const response = await exchange(code); expect(response.status()).toBe(200); expect(response.headers()['cache-control']).toBe('no-store');
      const result = credentialsSchema.parse(await response.json()); expect((await callTool(request, 'get_me', {}, result.access_token)).status()).toBe(200); return result;
    }, 'rest');
    await useCase('UC-MCP-0064', async () => { const response = await exchange(code); expect(response.status()).toBe(400); expect(await response.json()).toEqual({ error: 'invalid_grant' }); }, 'rest');
    await useCase('UC-MCP-0067', async () => {
      const response = await request.post(apiOrigin + '/oauth/token', { form: { grant_type: 'refresh_token', client_id: 'gategoldjira-antigravity', refresh_token: credentials.refresh_token, resource: apiOrigin + '/mcp', scope: 'admin' } }); expect(response.status()).toBe(400); expect(await response.json()).toEqual({ error: 'invalid_scope' });
    }, 'rest');
    await useCase('UC-MCP-0070', async () => {
      const connections = (await read(request, '/api/v1/me/mcp-tokens', zTokenList, 'member')).items.filter(connection => !initialIds.has(connection.id) && connection.kind === 'oauth' && !connection.revokedAt);
      expect(connections).toHaveLength(1);
      await expireFixtureOAuth(connections[0]!.id, 'access');
      expect((await callTool(request, 'get_me', {}, credentials.access_token)).status()).toBe(401);
    }, 'mcp');
    const rotated = await useCase('UC-MCP-0066', async () => {
      const response = await request.post(apiOrigin + '/oauth/token', { form: { grant_type: 'refresh_token', client_id: 'gategoldjira-antigravity', refresh_token: credentials.refresh_token, resource: apiOrigin + '/mcp' } }); expect(response.status()).toBe(200);
      const next = credentialsSchema.parse(await response.json()); expect(next.access_token === credentials.access_token).toBe(false); expect(next.refresh_token === credentials.refresh_token).toBe(false); expect((await callTool(request, 'get_me', {}, next.access_token)).status()).toBe(200); return next;
    }, 'rest');
    await useCase('UC-MCP-0068', async () => {
      const response = await request.post(apiOrigin + '/oauth/token', { form: { grant_type: 'refresh_token', client_id: 'gategoldjira-antigravity', refresh_token: credentials.refresh_token, resource: apiOrigin + '/mcp' } }); expect(response.status()).toBe(400); expect(await response.json()).toEqual({ error: 'invalid_grant' });
      expect((await callTool(request, 'get_me', {}, rotated.access_token)).status()).toBe(401);
    }, 'rest');
    const concurrent = await begin();
    const decision = await save(request, '/api/v1/me/mcp-authorizations/' + concurrent.id, { allow: true }, zOAuthRedirect, { method: 'POST', role: 'member' });
    const concurrentCode = new URL(decision.redirectUrl).searchParams.get('code')!;
    const winner = await useCase('UC-MCP-0065', async () => {
      const responses = await Promise.all([exchange(concurrentCode), exchange(concurrentCode)]); expect(responses.map(v => v.status()).sort()).toEqual([200, 400]);
      return credentialsSchema.parse(await responses.find(v => v.status() === 200)!.json());
    }, 'rest');
    await useCase('UC-MCP-0072', async () => {
      const response = await request.post(apiOrigin + '/oauth/revoke', { form: { client_id: 'gategoldjira-antigravity', token: winner.refresh_token } }); expect(response.status()).toBe(200);
      expect((await callTool(request, 'get_me', {}, winner.access_token)).status()).toBe(401);
    }, 'rest');
    await useCase('UC-MCP-0073', async () => { const response = await request.post(apiOrigin + '/oauth/revoke', { form: { client_id: 'gategoldjira-antigravity', token: 'gg_refresh_' + 'A'.repeat(43) } }); expect(response.status()).toBe(200); expect(await response.text()).toBe(''); }, 'rest');
    await useCase('UC-MCP-0071', async () => {
      const expiredAuthorization = await begin();
      const approved = await save(request, '/api/v1/me/mcp-authorizations/' + expiredAuthorization.id, { allow: true }, zOAuthRedirect, { method: 'POST', role: 'member' });
      const issued = credentialsSchema.parse(await (await exchange(new URL(approved.redirectUrl).searchParams.get('code')!)).json());
      const connections = (await read(request, '/api/v1/me/mcp-tokens', zTokenList, 'member')).items.filter(connection => !initialIds.has(connection.id) && connection.kind === 'oauth' && !connection.revokedAt);
      expect(connections).toHaveLength(1);
      await expireFixtureOAuth(connections[0]!.id, 'refresh');
      const response = await request.post(apiOrigin + '/oauth/token', { form: { grant_type: 'refresh_token', client_id: 'gategoldjira-antigravity', refresh_token: issued.refresh_token, resource: apiOrigin + '/mcp' } });
      expect(response.status()).toBe(400); expect(await response.json()).toEqual({ error: 'invalid_grant' });
    }, 'rest');
  } finally {
    const all = await read(request, '/api/v1/me/mcp-tokens', zTokenList, 'member');
    for (const connection of all.items.filter(v => !initialIds.has(v.id))) await save(request, '/api/v1/me/mcp-tokens/' + connection.id + '/revoke', {}, zTokenView, { method: 'POST', role: 'member' });
  }
});

test('concurrent personal-token creation cannot exceed the active account limit', async ({ request }) => {
  const before = await read(request, '/api/v1/me/mcp-tokens', zTokenList, 'viewer');
  const active = before.items.filter(v => !v.revokedAt).length;
  const created: string[] = [];
  try {
    for (let n = active; n < Number(before.activeLimit) - 1; n++) {
      const next = await save(request, '/api/v1/me/mcp-tokens', { name: 'Capacity fixture ' + crypto.randomUUID().slice(0, 8) }, zCreatedToken, { method: 'POST', status: 201, role: 'viewer' }); created.push(next.details.id);
    }
    await useCase('UC-MCP-0018', async () => {
      const responses = await Promise.all([0, 1].map(async n => request.post(apiOrigin + '/api/v1/me/mcp-tokens', { headers: await authorization('viewer'), data: { name: 'Concurrent limit ' + n + ' ' + crypto.randomUUID().slice(0, 8) } })));
      for (const response of responses) if (response.status() === 201) created.push(zCreatedToken.parse(await response.json()).details.id);
      expect(responses.map(v => v.status()).sort()).toEqual([201, 422]);
      const current = await read(request, '/api/v1/me/mcp-tokens', zTokenList, 'viewer'); expect(current.items.filter(v => !v.revokedAt).length).toBe(Number(before.activeLimit));
    }, 'rest');
    await useCase('UC-MCP-0017', async () => { await rejected(await request.post(apiOrigin + '/api/v1/me/mcp-tokens', { headers: await authorization('viewer'), data: { name: 'Over limit' } }), 422, /10 active|Revoke/i); }, 'rest');
  } finally {
    for (const id of created) await save(request, '/api/v1/me/mcp-tokens/' + id + '/revoke', {}, zTokenView, { method: 'POST', role: 'viewer' });
  }
});
