import { expect, type APIRequestContext } from '@playwright/test';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { LocalAuthServer, signInOnLocalServer } from './support/isolated-local-identity';
import { isolatedProject, useModernIssues } from './support/project';
import { localFixturesAvailable, apiOrigin } from './support/session';
import { save, read, allCompanyUsers } from './support/coverage-access';
import { zSavedUserView, zSavedMembershipView, zSavedModernIssueView, zModernIssueView, zSavedCommentView, zSavedWatchView, zPageNotificationView, zNotificationView, zSavedNotificationView, zSavedMarkAllResult, zNotificationPreferencesView, zSavedNotificationPreferencesView } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable, 'Requires real isolated local accounts, web application and PostgreSQL.');
test.use({ trace: 'off' });
const web = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
test('native private watching and inbox actions retain exact ownership, pagination and read-state conflicts', async ({ page, request }, info) => {
    test.setTimeout(90000);
    const name = 'inbox-' + crypto.randomUUID().slice(0, 8);
    const approved = (await save(request, '/api/v1/admin/users', { email: name + '@example.test', displayName: 'Private inbox ' + name, administrator: false }, zSavedUserView, { method: 'POST', status: 201 })).result;
    const server = new LocalAuthServer(info);
    try {
        await server.prepare();
        const credentials = await server.addIdentity(name, approved.email);
        await server.start();
        const session = await request.post(server.origin + '/api/v1/auth/local-sign-in', { data: credentials });
        expect(session.status()).toBe(200);
        const bearer = z.object({ accessToken: z.string().min(1) }).parse(await session.json()).accessToken;
        const headers = { Authorization: 'Bearer ' + bearer };
        const inbox = async () => {
            const response = await request.get(server.origin + '/api/v1/notifications?limit=100', { headers });
            expect(response.status()).toBe(200);
            return zPageNotificationView.parse(await response.json());
        };
        const notification = async (id: string) => {
            const response = await request.get(server.origin + '/api/v1/notifications/' + id, { headers });
            expect(response.status()).toBe(200);
            return zNotificationView.parse(await response.json());
        };
        const projectId = await isolatedProject(request);
        await useModernIssues(projectId);
        await save(request, '/api/v1/projects/' + projectId + '/memberships/' + approved.id, { expectedRevision: '0', role: 'member' }, zSavedMembershipView);
        const issue = (await save(request, '/api/v2/projects/' + projectId + '/issues', { title: 'Owned private inbox ' + name, assigneeId: approved.id }, zSavedModernIssueView, { method: 'POST', status: 201 })).result;
        await signInOnLocalServer(page, server, credentials, '/issues/' + issue.summary.id);
        await expect(page.getByRole('heading', { name: issue.summary.title, exact: true })).toBeVisible();
        const actions = page.getByRole('region', { name: 'Issue actions', exact: true });
        await web('UC-NTF-0001', async () => {
            const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/issues/' + issue.summary.id + '/watch');
            await actions.getByRole('button', { name: 'Watch issue', exact: true }).click();
            const saved = zSavedWatchView.parse(await (await response).json());
            expect(saved.result.watching).toBe(true);
            await expect(actions.getByRole('button', { name: 'Watching', exact: true })).toHaveAttribute('aria-pressed', 'true');
            const current = await request.get(server.origin + '/api/v2/issues/' + issue.summary.id, { headers });
            expect(zModernIssueView.parse(await current.json()).summary.revision).toBe(issue.summary.revision);
        });
        await web('UC-NTF-0002', async () => {
            await actions.getByRole('button', { name: 'Watching', exact: true }).click();
            await expect(actions.getByRole('button', { name: 'Watch issue', exact: true })).toHaveAttribute('aria-pressed', 'false');
            const current = await request.get(server.origin + '/api/v2/issues/' + issue.summary.id, { headers });
            expect(zModernIssueView.parse(await current.json()).watching).toBe(false);
        });
        for (let n = 0; n < 26; n++)
            await save(request, '/api/v1/issues/' + issue.summary.id + '/comments', { body: { html: '<p>Private event ' + n + '</p>', mentionUserIds: [], pictureIds: [] } }, zSavedCommentView, { method: 'POST', status: 201 });
        const expected = await inbox();
        expect(expected.items).toHaveLength(27);
        expect(expected.totalMatching).toBe(27);
        await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: /^Inbox/ }).click();
        await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
        await web('UC-NTF-0019', async () => {
            await expect(page.locator('.notification-record')).toHaveCount(25);
            for (const record of expected.items.slice(0, 25)) {
                const row = page.locator('[data-notification-id="' + record.id + '"]');
                await expect(row).toBeVisible();
                await expect(row.locator('.notification-summary')).toHaveText(record.summary);
                await expect(row.locator('time')).toHaveAttribute('datetime', record.createdAt);
            }
            await expect(page.locator('#inbox-summary')).toHaveText('27 unread · 27 matching notifications');
        });
        await web('UC-NTF-0032', async () => {
            const first = await page.locator('.notification-record').evaluateAll(rows => rows.map(row => row.getAttribute('data-notification-id')));
            const response = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/v1/notifications' && new URL(r.url()).searchParams.has('cursor'));
            await page.getByRole('button', { name: 'Next inbox page', exact: true }).click();
            const data = zPageNotificationView.parse(await (await response).json());
            expect(data.items).toHaveLength(2);
            await expect(page.locator('.notification-record')).toHaveCount(2);
            for (const item of data.items) {
                expect(first).not.toContain(item.id);
                await expect(page.locator('[data-notification-id="' + item.id + '"]')).toBeVisible();
            }
            await expect(page.locator('#inbox-summary')).toBeFocused();
        });
        await page.getByRole('button', { name: 'Refresh inbox', exact: true }).click();
        await expect(page.locator('.notification-record')).toHaveCount(25);
        const target = expected.items[0]!, row = page.locator('[data-notification-id="' + target.id + '"]');
        await web('UC-NTF-0023', async () => {
            const response = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/v1/notifications/' + target.id + '/read-state');
            await row.getByRole('button', { name: 'Mark read', exact: true }).click();
            const saved = zSavedNotificationView.parse(await (await response).json());
            expect(saved.result.readAt).not.toBeNull();
            await expect(row.locator('.read-state')).toHaveText('Read');
            await expect(page.locator('#inbox-summary')).toHaveText('26 unread · 27 matching notifications');
        });
        await web('UC-NTF-0024', async () => {
            await row.getByRole('button', { name: 'Mark unread', exact: true }).click();
            await expect(row.locator('.read-state')).toHaveText('Unread');
            await expect(page.locator('#inbox-summary')).toHaveText('27 unread · 27 matching notifications');
            expect((await notification(target.id)).readAt).toBeNull();
        });
        const before = await notification(target.id);
        const update = await request.put(server.origin + '/api/v1/notifications/' + target.id + '/read-state', { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { expectedRevision: before.revision, read: true } });
        expect(update.status()).toBe(200);
        const authoritative = zSavedNotificationView.parse(await update.json()).result;
        await web('UC-NTF-0027', async () => {
            const reply = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/v1/notifications/' + target.id + '/read-state');
            await row.getByRole('button', { name: 'Mark read', exact: true }).click();
            const response = await reply;
            expect(response.status()).toBe(409);
            expect(await response.json()).toMatchObject({ current: { id: target.id, revision: authoritative.revision }, error: { code: 'conflict' } });
            await expect(page.getByRole('alert')).toContainText(/changed|reload|current/i);
            expect((await notification(target.id)).revision).toBe(authoritative.revision);
            expect((await notification(target.id)).readAt).not.toBeNull();
        });
        await web('UC-NTF-0028', async () => {
            const reply = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/notifications/mark-all-read');
            await page.getByRole('button', { name: 'Mark all accessible notifications read', exact: true }).click();
            const saved = zSavedMarkAllResult.parse(await (await reply).json());
            expect(saved.result.changedCount).toBe(26);
            await expect(page.locator('#inbox-summary')).toHaveText('0 unread · 27 matching notifications');
            await expect(page.getByRole('button', { name: 'Mark all accessible notifications read', exact: true })).toBeDisabled();
            expect((await inbox()).items.every(value => value.readAt !== null)).toBe(true);
        });
    }
    finally {
        await server.stop();
        const user = (await allCompanyUsers(request)).find(user => user.id === approved.id)!;
        await save(request, '/api/v1/admin/users/' + user.id, { expectedRevision: user.revision, email: user.email, displayName: user.displayName, administrator: false, active: false }, zSavedUserView);
    }
});
test('native preferences save each real channel and event selection, preserve history and explain stale revisions', async ({ page, request }, info) => {
    test.setTimeout(90000);
    const name = 'prefs-' + crypto.randomUUID().slice(0, 8);
    const approved = (await save(request, '/api/v1/admin/users', { email: name + '@example.test', displayName: 'Private preferences ' + name, administrator: false }, zSavedUserView, { method: 'POST', status: 201 })).result;
    const server = new LocalAuthServer(info);
    try {
        await server.prepare();
        const credentials = await server.addIdentity(name, approved.email);
        await server.start();
        const login = await request.post(server.origin + '/api/v1/auth/local-sign-in', { data: credentials });
        expect(login.status()).toBe(200);
        const bearer = z.object({ accessToken: z.string().min(1) }).parse(await login.json()).accessToken, headers = { Authorization: 'Bearer ' + bearer };
        const preferences = async () => {
            const response = await request.get(server.origin + '/api/v1/notifications/preferences', { headers });
            expect(response.status()).toBe(200);
            return zNotificationPreferencesView.parse(await response.json());
        };
        const inbox = async () => {
            const response = await request.get(server.origin + '/api/v1/notifications?limit=100', { headers });
            expect(response.status()).toBe(200);
            return zPageNotificationView.parse(await response.json());
        };
        const projectId = await isolatedProject(request);
        await useModernIssues(projectId);
        await save(request, '/api/v1/projects/' + projectId + '/memberships/' + approved.id, { expectedRevision: '0', role: 'member' }, zSavedMembershipView);
        const issue = (await save(request, '/api/v2/projects/' + projectId + '/issues', { title: 'Preference delivery ' + name, assigneeId: approved.id }, zSavedModernIssueView, { method: 'POST', status: 201 })).result;
        const comment = () => save(request, '/api/v1/issues/' + issue.summary.id + '/comments', { body: { html: '<p>Owned preference event ' + crypto.randomUUID() + '</p>', mentionUserIds: [], pictureIds: [] } }, zSavedCommentView, { method: 'POST', status: 201 });
        await signInOnLocalServer(page, server, credentials, '/notifications');
        await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'Notification preferences', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Choose what reaches you', exact: true })).toBeVisible();
        const saveUI = async () => {
            const reply = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/v1/notifications/preferences');
            await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
            const response = await reply;
            expect(response.status()).toBe(200);
            const saved = zSavedNotificationPreferencesView.parse(await response.json());
            await expect(page.getByText('Notification preferences saved.', { exact: true })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toBeEnabled();
            return saved.result;
        };
        const reloadUI = async (mode: 'off' | 'instant' | 'daily') => {
            const reply = page.waitForResponse(r => r.request().method() === 'GET' && new URL(r.url()).pathname === '/api/v1/notifications/preferences');
            await page.getByRole('button', { name: 'Reload saved preferences', exact: true }).click();
            const response = await reply;
            expect(response.status()).toBe(200);
            expect(zNotificationPreferencesView.parse(await response.json()).emailMode).toBe(mode);
            await expect(page.getByRole('combobox', { name: 'Email updates', exact: true })).toHaveValue(mode);
            await expect(page.getByText('Notification preferences saved.', { exact: true })).toHaveCount(0);
            await expect(page.getByRole('button', { name: 'Save preferences', exact: true })).toBeEnabled();
        };
        await web('UC-NTF-0045', async () => {
            const original = await inbox();
            await page.getByRole('checkbox', { name: 'Show new updates in my Inbox', exact: true }).uncheck();
            expect((await saveUI()).inAppEnabled).toBe(false);
            await comment();
            expect((await inbox()).totalMatching).toBe(original.totalMatching);
            await page.getByRole('button', { name: 'Refresh inbox', exact: true }).click();
            for (const record of original.items)
                await expect(page.locator('[data-notification-id="' + record.id + '"]')).toBeVisible();
        });
        await web('UC-NTF-0044', async () => {
            const original = await inbox();
            await page.getByRole('checkbox', { name: 'Show new updates in my Inbox', exact: true }).check();
            expect((await saveUI()).inAppEnabled).toBe(true);
            await comment();
            expect((await inbox()).totalMatching).toBe(original.totalMatching + 1);
            await page.getByRole('button', { name: 'Refresh inbox', exact: true }).click();
            await expect(page.locator('.notification-record')).toHaveCount(original.totalMatching + 1);
        });
        await web('UC-NTF-0046', async () => {
            await page.getByRole('button', { name: 'Select none', exact: true }).click();
            for (const label of ['Assignments', 'Mentions', 'Comments', 'Stage changes', 'Due dates', 'Work I follow', 'New blockers', 'Resolved blockers', 'New subtasks', 'Completed subtasks'])
                await expect(page.getByRole('checkbox', { name: label, exact: true })).not.toBeChecked();
            for (const label of ['Assignments', 'Mentions', 'Comments', 'Stage changes', 'Due dates', 'Work I follow', 'New blockers', 'Resolved blockers', 'New subtasks', 'Completed subtasks'])
                await page.getByRole('checkbox', { name: label, exact: true }).check();
            const saved = await saveUI();
            expect(saved.events).toEqual(['assignment', 'comment', 'dependency_blocked', 'dependency_resolved', 'due_date', 'mention', 'status', 'subtask_created', 'subtasks_completed', 'watching']);
            for (const label of ['Assignments', 'Mentions', 'Comments', 'Stage changes', 'Due dates', 'Work I follow', 'New blockers', 'Resolved blockers', 'New subtasks', 'Completed subtasks'])
                await expect(page.getByRole('checkbox', { name: label, exact: true })).toBeChecked();
        });
        for (const [id, mode] of [['UC-NTF-0049', 'off'], ['UC-NTF-0050', 'instant'], ['UC-NTF-0051', 'daily']] as const)
            await web(id, async () => {
                await page.getByRole('combobox', { name: 'Email updates', exact: true }).selectOption(mode);
                expect((await saveUI()).emailMode).toBe(mode);
                await reloadUI(mode);
                expect((await preferences()).emailMode).toBe(mode);
            });
        await web('UC-NTF-0053', async () => {
            await page.getByRole('checkbox', { name: 'Remind me when assigned or reported work is due today', exact: true }).check();
            const saved = await saveUI();
            expect(saved.dueReminders).toBe(true);
            expect(saved.events).toContain('due_date');
            expect(saved.inAppEnabled).toBe(true);
            await expect(page.getByRole('checkbox', { name: 'Remind me when assigned or reported work is due today', exact: true })).toBeChecked();
        });
        const current = await preferences(), reply = await request.put(server.origin + '/api/v1/notifications/preferences', { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { expectedRevision: current.revision, inAppEnabled: current.inAppEnabled, events: current.events, emailMode: 'off', dueReminders: current.dueReminders } });
        expect(reply.status()).toBe(200);
        const latest = zSavedNotificationPreferencesView.parse(await reply.json()).result;
        await web('UC-NTF-0058', async () => {
            await page.getByRole('combobox', { name: 'Email updates', exact: true }).selectOption('instant');
            const denied = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/v1/notifications/preferences');
            await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
            expect((await denied).status()).toBe(409);
            await expect(page.getByRole('alert')).toContainText(/changed|reload/i);
            expect((await preferences()).revision).toBe(latest.revision);
            await reloadUI('off');
            await expect(page.getByRole('button', { name: 'Retry preference save', exact: true })).toHaveCount(0);
        });
    }
    finally {
        await server.stop();
        const user = (await allCompanyUsers(request)).find(user => user.id === approved.id)!;
        await save(request, '/api/v1/admin/users/' + user.id, { expectedRevision: user.revision, email: user.email, displayName: user.displayName, administrator: false, active: false }, zSavedUserView);
    }
});
