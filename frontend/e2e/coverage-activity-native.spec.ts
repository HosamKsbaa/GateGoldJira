import { expect, type Page, type APIRequestContext } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { isolatedProject, useModernIssues } from './support/project';
import { localFixturesAvailable, apiOrigin, signIn } from './support/session';
import { read, save, mcpSuccess, mcpFailure, memberId, viewerId, ownerId } from './support/coverage-access';
import { restSuccess, restFailure } from './support/coverage-rest';
import { zPageActivityView, zSavedModernIssueView, zSavedProjectView, zProjectView, zSavedCommentView, zInboxSummary, zPageNotificationView, zSavedNotificationView, zFailureBody } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable, 'Requires the real isolated Go/PostgreSQL services and web app.');
test.use({ trace: 'off' });
async function historicalCompanyBoundary(projectId: string, issueId: string, eventId: string) {
    const database = process.env['GATEGOLD_E2E_DATABASE_NAME'];
    if (!database || !/^gg_browser_[0-9a-f]{32}$/.test(database) || ![projectId, issueId, eventId].every(value => z.uuid().safeParse(value).success))
        throw new Error('Historical activity timestamps require the exact disposable database and owned event.');
    // This is retained historical-data setup, not a supported user edit. The
    // exact append-only trigger is restored in the same locked transaction,
    // before any other transaction can observe the deliberately moved instant.
    const sql = `DO $fixture$
DECLARE original_definition text; original_enabled "char"; current_definition text; current_enabled "char"; changed integer; blocked boolean := false;
BEGIN
 IF current_database() <> '${database}' OR '${projectId}'='20000000-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'Disposable historical fixture required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('owned-historical-activity-fixture'));
 LOCK TABLE activity_events IN ACCESS EXCLUSIVE MODE;
 SELECT pg_get_triggerdef(t.oid), t.tgenabled INTO STRICT original_definition, original_enabled FROM pg_trigger t WHERE t.tgrelid='activity_events'::regclass AND t.tgname='activity_events_immutable' AND NOT t.tgisinternal AND t.tgfoid='immutable_history()'::regprocedure;
 IF original_enabled <> 'O' THEN RAISE EXCEPTION 'An enabled append-only trigger is required'; END IF;
 IF (SELECT count(*) FROM activity_events WHERE id='${eventId}' AND project_id='${projectId}' AND issue_id='${issueId}' AND resource_kind='issue') <> 1 THEN RAISE EXCEPTION 'The exact genuine owned event is required'; END IF;
 DROP TRIGGER activity_events_immutable ON activity_events;
 UPDATE activity_events SET created_at='2026-07-15T22:30:00Z'::timestamptz WHERE id='${eventId}' AND project_id='${projectId}' AND issue_id='${issueId}' AND resource_kind='issue';
 GET DIAGNOSTICS changed=ROW_COUNT;
 IF changed <> 1 THEN RAISE EXCEPTION 'The historical fixture must change exactly one owned event'; END IF;
 EXECUTE original_definition;
 SELECT pg_get_triggerdef(t.oid),t.tgenabled INTO STRICT current_definition,current_enabled FROM pg_trigger t WHERE t.tgrelid='activity_events'::regclass AND t.tgname='activity_events_immutable' AND NOT t.tgisinternal;
 IF current_definition IS DISTINCT FROM original_definition OR current_enabled IS DISTINCT FROM original_enabled THEN RAISE EXCEPTION 'The exact append-only trigger was not restored'; END IF;
 BEGIN
  UPDATE activity_events SET created_at=created_at WHERE id='${eventId}' AND project_id='${projectId}' AND issue_id='${issueId}';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM <> 'history is append-only' THEN RAISE; END IF;
  blocked := true;
 END;
 IF NOT blocked THEN RAISE EXCEPTION 'New history updates must remain forbidden'; END IF;
END $fixture$;`;
    const result = await promisify(execFile)('docker', ['compose', '-f', resolve('../compose.dev.yaml'), 'exec', '-T', 'postgres', 'psql', '--username=gategoldjira', '--dbname=' + database, '-v', 'ON_ERROR_STOP=1', '-c', sql]);
    expect(result.stdout.trim()).toBe('DO');
}
for (const channel of ['rest', 'mcp'] as const)
    test(channel + ' activity validates scoped filters, Cairo date boundaries, stable pages and retained attribution', async ({ request }) => {
        const success = channel === 'mcp' ? mcpSuccess : restSuccess, failure = channel === 'mcp' ? mcpFailure : restFailure;
        const step = <T>(id: string, body: () => Promise<T>) => useCase(id, body, channel);
        const projectId = await isolatedProject(request);
        await useModernIssues(projectId);
        const intent = { projectId, title: 'Actual attributed activity ' + crypto.randomUUID(), retryReference: crypto.randomUUID() };
        const created = await mcpSuccess(request, 'create_issue_v2', intent, zSavedModernIssueView, 'member'), issue = created.result;
        await historicalCompanyBoundary(projectId, issue.summary.id, created.receipt.eventId!);
        const exact = { resourceKind: 'issue', resourceId: issue.summary.id };
        await step('UC-AUD-0001', async () => {
            const data = await success(request, 'list_activity', { projectId }, zPageActivityView);
            expect(data.items.length).toBeGreaterThan(0);
            const event = data.items.find(item => item.id === created.receipt.eventId);
            expect(event).toMatchObject({ actor: { id: memberId, displayName: 'مطور تجريبي' }, channel: 'mcp', resourceKind: 'issue', resourceId: issue.summary.id, issueId: issue.summary.id, issueKey: issue.summary.key, resourceName: issue.summary.title });
            expect(event?.projectName).toMatch(/^Isolated workflow/);
        });
        for (const [id, args] of [
            ['UC-AUD-0006', { issueKey: 'DEMO-' }],
            ['UC-AUD-0011', { fromDate: '2026-07-17', toDate: '2026-07-16' }],
            ['UC-AUD-0013', { resourceKind: 'issue' }],
            ['UC-AUD-0014', { resourceId: issue.summary.id }],
            ['UC-AUD-0015', { resourceKind: 'issue', resourceId: 'invalid' }],
        ] as const)
            await step(id, async () => {
                const rejected = await failure(request, 'list_activity', args, zFailureBody, 'validation_failed');
                expect(rejected.current).toBeNull();
                expect(rejected.error.nextAction).toBe('review_fields');
            });
        await step('UC-AUD-0023', async () => {
            const rejected = await failure(request, 'list_activity', {}, zFailureBody, 'forbidden', 'viewer');
            expect(rejected.error.nextAction).toBe('contact_administrator');
        });
        await step('UC-AUD-0024', async () => {
            const data = await success(request, 'list_activity', exact, zPageActivityView, 'viewer');
            expect(data.totalMatching).toBe(1);
            expect(data.items[0]?.id).toBe(created.receipt.eventId);
        });
        await step('UC-AUD-0025', async () => {
            const denied = await failure(request, 'list_activity', { resourceKind: 'issue', resourceId: crypto.randomUUID() }, zFailureBody, 'unavailable_record', 'viewer');
            expect(denied.current).toBeNull();
        });
        await step('UC-AUD-0026', async () => {
            const denied = await failure(request, 'list_activity', { ...exact, projectId: crypto.randomUUID() }, zFailureBody, 'unavailable_record', 'viewer');
            expect(denied.current).toBeNull();
        });
        await step('UC-AUD-0007', async () => {
            const data = await success(request, 'list_activity', { projectId }, zPageActivityView);
            expect(data.items.length).toBeGreaterThan(0);
            expect(data.items.every(event => event.projectId === projectId)).toBe(true);
        });
        await step('UC-AUD-0009', async () => {
            const included = await success(request, 'list_activity', { ...exact, fromDate: '2026-07-16' }, zPageActivityView);
            expect(included.items.map(event => event.id)).toEqual([created.receipt.eventId]);
            expect((await success(request, 'list_activity', { ...exact, fromDate: '2026-07-17' }, zPageActivityView)).totalMatching).toBe(0);
        });
        await step('UC-AUD-0010', async () => {
            expect((await success(request, 'list_activity', { ...exact, toDate: '2026-07-15' }, zPageActivityView)).totalMatching).toBe(0);
            const included = await success(request, 'list_activity', { ...exact, toDate: '2026-07-16' }, zPageActivityView);
            expect(included.items.map(event => event.id)).toEqual([created.receipt.eventId]);
        });
        await step('UC-AUD-0012', async () => {
            const data = await success(request, 'list_activity', exact, zPageActivityView);
            expect(data.totalMatching).toBe(1);
            expect(data.items[0]?.resourceId).toBe(issue.summary.id);
            expect(data.items[0]?.createdAt).toBe('2026-07-15T22:30:00Z');
        });
        await step('UC-AUD-0029', async () => {
            const replay = await mcpSuccess(request, 'create_issue_v2', intent, zSavedModernIssueView, 'member');
            expect(replay.receipt).toMatchObject({ replayed: true, eventId: created.receipt.eventId });
            expect(replay.result).toEqual(created.result);
            expect((await success(request, 'list_activity', exact, zPageActivityView)).totalMatching).toBe(1);
        });
        await mcpSuccess(request, 'create_comment', { issueId: issue.summary.id, body: { html: '<p>Related history page</p>', mentionUserIds: [], pictureIds: [] }, retryReference: crypto.randomUUID() }, zSavedCommentView);
        await step('UC-AUD-0018', async () => {
            const first = await success(request, 'list_activity', { ...exact, page: { limit: 1 } }, zPageActivityView);
            expect(first.items).toHaveLength(1);
            expect(first.nextCursor).toBeTruthy();
            const next = await success(request, 'list_activity', { ...exact, page: { limit: 1, cursor: first.nextCursor } }, zPageActivityView);
            expect(next.items).toHaveLength(1);
            expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
            expect(next.items[0]?.id).toBe(created.receipt.eventId);
            expect(next.nextCursor).toBeNull();
        });
        const project = await mcpSuccess(request, 'get_project', { projectId }, zProjectView);
        await mcpSuccess(request, 'archive_project', { projectId, expectedRevision: project.revision, retryReference: crypto.randomUUID() }, zSavedProjectView);
        await step('UC-AUD-0028', async () => {
            const retained = await success(request, 'list_activity', exact, zPageActivityView);
            const event = retained.items.find(event => event.id === created.receipt.eventId);
            expect(event?.actor).toEqual({ id: memberId, displayName: 'مطور تجريبي' });
            expect(event?.resourceName).toBe(issue.summary.title);
            expect(retained.totalMatching).toBe(2);
        });
    });
for (const channel of ['rest', 'mcp'] as const)
    test(channel + ' exact issue history excludes personal inbox state while administrator audit retains only safe metadata', async ({ request }) => {
        const success = channel === 'mcp' ? mcpSuccess : restSuccess;
        const projectId = await isolatedProject(request);
        await useModernIssues(projectId);
        const issue = (await mcpSuccess(request, 'create_issue_v2', { projectId, title: 'Private audit boundary ' + crypto.randomUUID(), assigneeId: memberId, retryReference: crypto.randomUUID() }, zSavedModernIssueView)).result;
        const notification = (await mcpSuccess(request, 'list_notifications', { page: { limit: 100 } }, zPageNotificationView, 'member')).items.find(item => item.issueId === issue.summary.id && item.reasons.includes('assignment'));
        expect(notification).toBeDefined();
        const changed = await mcpSuccess(request, 'set_notification_read', { notificationId: notification!.id, expectedRevision: notification!.revision, read: true, retryReference: crypto.randomUUID() }, zSavedNotificationView, 'member');
        expect(changed.receipt.eventId).toBeTruthy();
        await useCase('UC-AUD-0027', async () => {
            for (const role of ['owner', 'viewer']) {
                const data = await success(request, 'list_activity', { resourceKind: 'issue', resourceId: issue.summary.id }, zPageActivityView, role);
                expect(data.items.some(event => event.id === changed.receipt.eventId || event.resourceKind === 'notification')).toBe(false);
            }
            const audit = await success(request, 'list_activity', { resourceKind: 'notification', resourceId: notification!.id }, zPageActivityView);
            const event = audit.items.find(event => event.id === changed.receipt.eventId);
            expect(event?.action).toBe('set_notification_read');
            expect(event?.changes.every(change => !/html|plainText|body|message/.test(change.field))).toBe(true);
            expect(JSON.stringify(audit)).not.toContain(notification!.summary);
        }, channel);
    });
async function filtered(page: Page, act: () => Promise<unknown>, accept: (url: URL) => boolean) {
    const reply = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/admin/activity' && accept(new URL(response.url())));
    await act();
    const response = await reply;
    expect(response.status()).toBe(200);
    const data = zPageActivityView.parse(await response.json());
    await expect(page.getByRole('region', { name: 'Activity events', exact: true }).locator('article')).toHaveCount(data.items.length);
    await expect(page.locator('#activity-status')).toContainText(data.totalMatching + ' matching events');
    return data;
}
test('native activity filters validate visible input and honor actual Cairo-calendar retained history', async ({ page, request }) => {
    const projectId = await isolatedProject(request);
    await useModernIssues(projectId);
    const created = await save(request, '/api/v2/projects/' + projectId + '/issues', { title: 'Native historical boundaries ' + crypto.randomUUID() }, zSavedModernIssueView, { method: 'POST', status: 201 });
    const issue = created.result;
    await historicalCompanyBoundary(projectId, issue.summary.id, created.receipt.eventId!);
    await signIn(page, 'owner', '/admin/activity', /^Company activity$/);
    const rows = page.getByRole('region', { name: 'Activity events', exact: true }).locator('article');
    const step = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
    await step('UC-AUD-0001', async () => {
        await expect(rows.first().locator('h2 bdi')).not.toHaveText('');
        await expect(rows.first().locator('.event-context')).not.toHaveText('');
        await expect(rows.first().locator('time')).toHaveAttribute('datetime', /.+/);
        await expect(page.getByRole('heading', { name: 'Company activity', exact: true })).toBeVisible();
    });
    await step('UC-AUD-0006', async () => {
        await page.getByLabel('Issue key', { exact: true }).fill('DEMO-');
        await expect(page.getByRole('alert')).toHaveText('Use a complete issue key, such as DEMO-2.');
        await expect(rows).toHaveCount(0);
    });
    await page.getByRole('button', { name: 'Clear history filters', exact: true }).click();
    await page.getByText('Advanced resource filters', { exact: true }).click();
    await step('UC-AUD-0013', async () => {
        await page.getByRole('combobox', { name: 'Resource kind', exact: true }).selectOption('issue');
        await expect(page.getByRole('alert')).toHaveText('Supply resource kind and identifier together.');
        await expect(rows).toHaveCount(0);
    });
    await page.getByRole('combobox', { name: 'Resource kind', exact: true }).selectOption('');
    await step('UC-AUD-0014', async () => {
        await page.getByLabel('Resource identifier', { exact: true }).fill(issue.summary.id);
        await expect(page.getByRole('alert')).toHaveText('Supply resource kind and identifier together.');
        await expect(rows).toHaveCount(0);
    });
    await page.getByRole('combobox', { name: 'Resource kind', exact: true }).selectOption('issue');
    await step('UC-AUD-0015', async () => {
        await page.getByLabel('Resource identifier', { exact: true }).fill('invalid');
        await expect(page.getByRole('alert')).toHaveText('Use a complete UUID for the resource identifier.');
        await expect(rows).toHaveCount(0);
    });
    await step('UC-AUD-0012', async () => {
        const data = await filtered(page, () => page.getByLabel('Resource identifier', { exact: true }).fill(issue.summary.id), url => url.searchParams.get('resourceId') === issue.summary.id);
        expect(data.totalMatching).toBe(1);
        await expect(rows.first()).toHaveAttribute('data-activity-id', created.receipt.eventId!);
        await expect(rows.first()).toContainText(issue.summary.title);
    });
    await step('UC-AUD-0009', async () => {
        expect((await filtered(page, () => page.getByLabel('From date', { exact: true }).fill('2026-07-16'), url => url.searchParams.get('fromDate') === '2026-07-16')).totalMatching).toBe(1);
        expect((await filtered(page, () => page.getByLabel('From date', { exact: true }).fill('2026-07-17'), url => url.searchParams.get('fromDate') === '2026-07-17')).totalMatching).toBe(0);
        await expect(page.getByRole('heading', { name: 'No activity matches these filters', exact: true })).toBeVisible();
    });
    await filtered(page, () => page.getByLabel('From date', { exact: true }).fill(''), url => !url.searchParams.has('fromDate') && url.searchParams.get('resourceId') === issue.summary.id);
    await step('UC-AUD-0010', async () => {
        expect((await filtered(page, () => page.getByLabel('To date', { exact: true }).fill('2026-07-15'), url => url.searchParams.get('toDate') === '2026-07-15')).totalMatching).toBe(0);
        expect((await filtered(page, () => page.getByLabel('To date', { exact: true }).fill('2026-07-16'), url => url.searchParams.get('toDate') === '2026-07-16')).totalMatching).toBe(1);
    });
    await step('UC-AUD-0011', async () => {
        await page.getByLabel('From date', { exact: true }).fill('2026-07-17');
        await expect(page.getByRole('alert')).toHaveText('The start date must be on or before the end date.');
        await expect(rows).toHaveCount(0);
    });
    await filtered(page, () => page.getByRole('button', { name: 'Clear history filters', exact: true }).click(), url => !url.searchParams.has('resourceId') && !url.searchParams.has('fromDate') && !url.searchParams.has('toDate'));
    const projects = page.getByRole('combobox', { name: 'Project', exact: true });
    while (await projects.locator('option[value="' + projectId + '"]').count() === 0) {
        const before = await projects.locator('option').count();
        await page.getByRole('button', { name: 'Load more projects', exact: true }).click();
        await expect.poll(() => projects.locator('option').count()).toBeGreaterThan(before);
    }
    await step('UC-AUD-0007', async () => {
        const data = await filtered(page, () => projects.selectOption(projectId), url => url.searchParams.get('projectId') === projectId);
        expect(data.items.length).toBeGreaterThan(0);
        expect(data.items.every(event => event.projectId === projectId)).toBe(true);
    });
    await filtered(page, () => page.getByLabel('Issue key', { exact: true }).fill(issue.summary.key), url => url.searchParams.get('issueKey') === issue.summary.key);
    const project = await read(request, '/api/v1/projects/' + projectId, zProjectView);
    await save(request, '/api/v1/projects/' + projectId + '/archive', { expectedRevision: project.revision }, zSavedProjectView, { method: 'POST' });
    await step('UC-AUD-0028', async () => {
        const data = await filtered(page, () => page.getByRole('button', { name: 'Refresh activity', exact: true }).click(), url => url.searchParams.get('issueKey') === issue.summary.key);
        const retained = data.items.find(event => event.id === created.receipt.eventId);
        expect(retained?.actor).toEqual({ id: ownerId, displayName: 'Local Owner' });
        await expect(rows.locator('h2 bdi')).toContainText(['Local Owner']);
        await expect(rows).toContainText(issue.summary.title);
    });
});
