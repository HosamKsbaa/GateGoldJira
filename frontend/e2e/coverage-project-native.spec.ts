import { expect, type Page } from '@playwright/test';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { LocalAuthServer } from './support/isolated-local-identity';
import { isolatedProject, useModernIssues } from './support/project';
import { localFixturesAvailable, apiOrigin, signIn, configureLocalSignIn, fillCredentials } from './support/session';
import { save, read, allCompanyUsers, memberId } from './support/coverage-access';
import { zProjectView, zSavedProjectView, zPageBoardSummary, zSavedUserView, zSavedMembershipView, zSavedModernIssueView, zModernIssueView, zPageMembershipView, zPageMembershipCandidateView, zSavedConfigurationView, zConfigurationView } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable, 'Requires real isolated web application, local accounts and PostgreSQL.');
test.use({ trace: 'off' });
const web = <T>(id: string, body: () => Promise<T>) => useCase(id, body, 'web');
async function projectRow(page: Page, key: string) {
    await expect(page.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled();
    const rows = page.locator('.project-records >li'), relative = page.getByRole('button', { name: 'Edit ' + key, exact: true }).or(page.getByRole('button', { name: 'Restore ' + key, exact: true }));
    for (;;) {
        const row = rows.filter({ has: relative });
        const more = page.getByRole('button', { name: 'More projects', exact: true });
        // A filter reload can render the requested row after the first count.
        // Wait for either valid outcome before deciding whether paging is needed.
        await expect(row.or(more).first()).toBeVisible();
        if (await row.count())
            return row;
        const count = await rows.count();
        await more.click();
        await expect.poll(() => rows.count()).toBeGreaterThan(count);
    }
}
test('native project creation validates every basic field, normalizes key and rejects an existing identity', async ({ page, request }) => {
    await signIn(page, 'owner', '/projects', /^Projects$/);
    const editor = page.getByRole('region', { name: 'Project details', exact: true }), create = editor.getByRole('button', { name: 'Create project', exact: true });
    await editor.getByRole('textbox', { name: 'Project name', exact: true }).fill('Valid name');
    await web('UC-PRJ-0013', async () => {
        for (const key of ['1INVALID', 'x', 'X'.repeat(11), 'BAD-KEY']) {
            await editor.getByRole('textbox', { name: 'Project key', exact: true }).fill(key);
            await expect(create).toBeDisabled();
        }
    });
    const key = 'n' + crypto.randomUUID().replaceAll('-', '').slice(0, 8);
    await editor.getByRole('textbox', { name: 'Project key', exact: true }).fill(key);
    await web('UC-PRJ-0015', async () => {
        await editor.getByRole('textbox', { name: 'Project name', exact: true }).fill('');
        await expect(create).toBeDisabled();
    });
    await web('UC-PRJ-0016', async () => {
        await editor.getByRole('textbox', { name: 'Project name', exact: true }).fill('ش'.repeat(101));
        await expect(create).toBeDisabled();
    });
    await editor.getByRole('textbox', { name: 'Project name', exact: true }).fill('Native normalized ' + key);
    await web('UC-PRJ-0017', async () => {
        await editor.getByLabel('Description', { exact: true }).fill('س'.repeat(2001));
        await expect(create).toBeDisabled();
    });
    await editor.getByLabel('Description', { exact: true }).fill('Chosen native metadata');
    const created = await web('UC-PRJ-0011', async () => {
        const reply = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/projects');
        await create.click();
        const response = await reply;
        expect(response.status()).toBe(201);
        const saved = zSavedProjectView.parse(await response.json()).result;
        expect(saved.name).toBe('Native normalized ' + key);
        expect(saved.description).toBe('Chosen native metadata');
        await expect(page.getByText('Project created.', { exact: true })).toBeVisible();
        const row = await projectRow(page, saved.key);
        await expect(row).toContainText(saved.name);
        const boards = await read(request, '/api/v1/projects/' + saved.id + '/boards', zPageBoardSummary);
        expect(boards.items).toHaveLength(1);
        expect(boards.items[0]).toMatchObject({ name: 'All Issues', default: true, projectId: saved.id });
        return saved;
    });
    await web('UC-PRJ-0012', async () => {
        expect(created.key).toBe(key.toUpperCase());
        await expect((await projectRow(page, created.key)).locator('.project-key bdi')).toHaveText(key.toUpperCase());
    });
    await page.getByRole('button', { name: 'New project', exact: true }).click();
    await expect(editor.getByRole('heading', { name: 'Create a project', exact: true })).toBeVisible();
    await web('UC-PRJ-0014', async () => {
        await editor.getByRole('textbox', { name: 'Project key', exact: true }).fill(key);
        await editor.getByRole('textbox', { name: 'Project name', exact: true }).fill('Duplicate must not exist');
        const reply = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/projects');
        await create.click();
        expect((await reply).status()).toBe(422);
        await expect(page.getByRole('alert')).toContainText(/key|already|unique/i);
        await expect(page.locator('.project-records >li').filter({ has: page.getByRole('button', { name: 'Edit ' + created.key, exact: true }) })).toHaveCount(1);
        expect((await read(request, '/api/v1/projects/' + created.id, zProjectView)).name).toBe(created.name);
    });
});
test('native project edits, archive and restoration preserve the same retained content and access', async ({ page, request }) => {
    const id = await isolatedProject(request), original = await read(request, '/api/v1/projects/' + id, zProjectView);
    await useModernIssues(id);
    const issue = (await save(request, '/api/v2/projects/' + id + '/issues', { title: 'Retained native archived content', assigneeId: memberId }, zSavedModernIssueView, { method: 'POST', status: 201 })).result;
    await signIn(page, 'owner', '/projects', /^Projects$/);
    const editor = page.getByRole('region', { name: 'Project details', exact: true });
    const edit = async () => {
        await (await projectRow(page, original.key)).getByRole('button', { name: 'Edit ' + original.key, exact: true }).click();
        await expect(editor.getByRole('heading', { name: 'Edit project ' + original.key, exact: true })).toBeVisible();
    };
    const submit = async () => {
        const reply = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === '/api/v1/projects/' + id);
        await editor.getByRole('button', { name: 'Save project', exact: true }).click();
        const response = await reply;
        expect(response.status()).toBe(200);
        const saved = zSavedProjectView.parse(await response.json()).result;
        await expect(page.getByText('Project saved.', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled();
        return saved;
    };
    await edit();
    await web('UC-PRJ-0022', async () => {
        await editor.getByLabel('Project name', { exact: true }).fill('Updated native ' + original.key);
        const saved = await submit();
        expect(saved.key).toBe(original.key);
        expect(saved.name).toBe('Updated native ' + original.key);
        await expect(await projectRow(page, original.key)).toContainText(saved.name);
    });
    await edit();
    await web('UC-PRJ-0023', async () => {
        const description = 'وصف نصي جديد\n<p>Retained as text</p>';
        await editor.getByLabel('Description', { exact: true }).fill(description);
        const saved = await submit();
        expect(saved.description).toBe(description);
        expect(saved.key).toBe(original.key);
        await expect((await projectRow(page, original.key)).locator('.project-description')).toHaveText(description);
        await expect((await projectRow(page, original.key)).locator('.project-description p')).toHaveCount(0);
    });
    await web('UC-PRJ-0027', async () => {
        const reply = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/projects/' + id + '/archive');
        await (await projectRow(page, original.key)).getByRole('button', { name: 'Archive ' + original.key, exact: true }).click();
        const response = await reply;
        expect(response.status()).toBe(200);
        expect(zSavedProjectView.parse(await response.json()).result.archived).toBe(true);
        await expect(page.getByText('Project archived.', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled();
        await page.getByRole('checkbox', { name: 'Include archived projects', exact: true }).check();
        await expect((await projectRow(page, original.key)).locator('.project-state')).toHaveText('Archived · Read-only');
        const retained = await read(request, '/api/v2/issues/' + issue.summary.id, zModernIssueView);
        expect(retained.summary.title).toBe(issue.summary.title);
        expect(retained.capabilities).not.toContain('edit');
    });
    await web('UC-PRJ-0028', async () => {
        const reply = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/projects/' + id + '/restore');
        await (await projectRow(page, original.key)).getByRole('button', { name: 'Restore ' + original.key, exact: true }).click();
        const response = await reply;
        expect(response.status()).toBe(200);
        expect(zSavedProjectView.parse(await response.json()).result.archived).toBe(false);
        await expect(page.getByText('Project restored.', { exact: true })).toBeVisible();
        await expect((await projectRow(page, original.key)).locator('.project-state')).toHaveText('Active');
        const retained = await read(request, '/api/v2/issues/' + issue.summary.id, zModernIssueView);
        expect(retained.summary.id).toBe(issue.summary.id);
        expect(retained.capabilities).toContain('edit');
        expect((await read(request, '/api/v1/projects/' + id + '/memberships', zPageMembershipView)).items.find(value => value.user.id === memberId)?.removed).toBe(false);
    });
});
test('native unavailable project route reports a scoped denial without revealing project metadata', async ({ page, request }) => {
    const key = ('P' + crypto.randomUUID().replaceAll('-', '').slice(0, 8)).toUpperCase();
    const project = (await save(request, '/api/v1/projects', { key, name: 'Private unseen metadata ' + key, description: 'Private project description' }, zSavedProjectView, { method: 'POST', status: 201 })).result;
    await configureLocalSignIn(page);
    await page.goto('/projects/' + project.id);
    await fillCredentials(page, 'viewer');
    const reply = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/projects/' + project.id);
    await web('UC-PRJ-0034', async () => {
        await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
        const response = await reply;
        expect(response.status()).toBe(404);
        expect(await response.json()).toMatchObject({ error: { code: 'unavailable_record' } });
        await expect(page.getByRole('alert')).toContainText(/available|access|record/i);
        await expect(page.getByRole('button', { name: 'Reload project', exact: true })).toBeVisible();
        await expect(page.getByRole('main').getByText(project.name, { exact: true })).toHaveCount(0);
        await expect(page.getByRole('main').getByText(project.description, { exact: true })).toHaveCount(0);
        await expect(page.getByRole('navigation', { name: 'Project views', exact: true })).toHaveCount(0);
    });
});
test('native membership directory and role lifecycle grant actual scoped privileges and retain removed identity', async ({ page, request }, info) => {
    test.setTimeout(120000);
    const projectId = await isolatedProject(request);
    await useModernIssues(projectId);
    const root = '/api/v1/projects/' + projectId;
    const username = 'role-' + crypto.randomUUID().slice(0, 8), approved = (await save(request, '/api/v1/admin/users', { email: username + '@example.test', displayName: 'A native role ' + username, administrator: false }, zSavedUserView, { method: 'POST', status: 201 })).result;
    for (let n = 0; n < 26; n++) {
        const user = (await save(request, '/api/v1/admin/users', { email: crypto.randomUUID() + '@example.test', displayName: 'Z native paging ' + String(n).padStart(2, '0') + ' ' + crypto.randomUUID().slice(0, 8), administrator: false }, zSavedUserView, { method: 'POST', status: 201 })).result;
        await save(request, root + '/memberships/' + user.id, { expectedRevision: '0', role: 'viewer' }, zSavedMembershipView);
    }
    const server = new LocalAuthServer(info);
    try {
        await server.prepare();
        const credentials = await server.addIdentity(username, approved.email);
        await server.start();
        const login = await request.post(server.origin + '/api/v1/auth/local-sign-in', { data: credentials });
        expect(login.status()).toBe(200);
        const bearer = z.object({ accessToken: z.string().min(1) }).parse(await login.json()).accessToken, headers = { Authorization: 'Bearer ' + bearer };
        const firstResponse = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === root + '/memberships' && !new URL(response.url()).searchParams.has('cursor'));
        const candidatesResponse = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === root + '/membership-candidates');
        await signIn(page, 'owner', '/admin/projects/' + projectId + '/memberships', /^Project access$/);
        const first = zPageMembershipView.parse(await (await firstResponse).json());
        await web('UC-PRJ-0035', async () => {
            expect(first.items).toHaveLength(25);
            await expect(page.locator('.records >li')).toHaveCount(25);
            await expect(page.locator('.records >li strong')).toHaveText(first.items.map(item => item.user.displayName));
            for (const item of first.items) {
                expect(item.revision).toMatch(/^[1-9][0-9]*$/);
                await expect(page.locator('.records >li').filter({ has: page.getByRole('button', { name: 'Change access for ' + item.user.displayName, exact: true }) })).toContainText(item.role + ' · Active membership');
            }
        });
        await web('UC-PRJ-0036', async () => {
            expect(first.nextCursor).toBeTruthy();
            const response = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === root + '/memberships' && new URL(response.url()).searchParams.get('cursor') === first.nextCursor);
            await page.getByRole('button', { name: 'More memberships', exact: true }).click();
            const next = zPageMembershipView.parse(await (await response).json());
            expect(next.items.length).toBeGreaterThan(0);
            expect(next.items.length).toBeLessThanOrEqual(25);
            expect(next.items.every(item => !first.items.some(previous => previous.user.id === item.user.id))).toBe(true);
            await expect(page.locator('.records >li strong')).toHaveText([...first.items, ...next.items].map(item => item.user.displayName));
        });
        await web('UC-PRJ-0038', async () => {
            const response = await candidatesResponse;
            expect(response.status()).toBe(200);
            const candidates = zPageMembershipCandidateView.parse(await response.json());
            expect(candidates.items.length).toBeLessThanOrEqual(25);
            for (const candidate of candidates.items) {
                expect(Object.keys(candidate).sort()).toEqual(['active', 'displayName', 'id']);
                await expect(page.getByRole('combobox', { name: 'Approved user', exact: true }).locator('option[value="' + candidate.id + '"]')).toHaveText(candidate.displayName + (candidate.active ? '' : ' (disabled)'));
            }
            expect(await page.getByRole('combobox', { name: 'Approved user', exact: true }).textContent()).not.toContain('@');
        });
        const users = page.getByRole('combobox', { name: 'Approved user', exact: true });
        while (await users.locator('option[value="' + approved.id + '"]').count() === 0) {
            const count = await users.locator('option').count();
            await page.getByRole('button', { name: 'More approved users', exact: true }).click();
            await expect.poll(() => users.locator('option').count()).toBeGreaterThan(count);
        }
        const row = () => page.locator('.records >li').filter({ has: page.getByRole('button', { name: 'Change access for ' + approved.displayName, exact: true }) });
        const edit = async () => {
            await expect(page.getByRole('button', { name: 'Refresh memberships', exact: true })).toBeEnabled();
            await row().getByRole('button', { name: 'Change access for ' + approved.displayName, exact: true }).click();
            await expect(users).toHaveValue(approved.id);
        };
        const saveRole = async (role: 'member' | 'viewer' | 'project_admin') => {
            await users.selectOption(approved.id);
            await page.getByRole('combobox', { name: 'Project role', exact: true }).selectOption(role);
            const reply = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === root + '/memberships/' + approved.id);
            await page.getByRole('button', { name: 'Save membership', exact: true }).click();
            const response = await reply;
            expect(response.status()).toBe(200);
            const saved = zSavedMembershipView.parse(await response.json());
            await expect(page.getByText('Project role saved.', { exact: true })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Refresh memberships', exact: true })).toBeEnabled();
            await expect(row()).toContainText(role + ' · Active membership');
            return saved;
        };
        let membership = await web('UC-PRJ-0041', async () => {
            const saved = await saveRole('member');
            expect(saved.result.user.id).toBe(approved.id);
            expect(saved.result.revision).toBe('1');
            const response = await request.post(server.origin + '/api/v2/projects/' + projectId + '/issues', { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { title: 'New member can write' } });
            expect(response.status()).toBe(201);
            expect(zSavedModernIssueView.parse(await response.json()).result.reporter.id).toBe(approved.id);
            return saved.result;
        });
        await edit();
        await web('UC-PRJ-0044', async () => {
            await web('UC-PRJ-0042', async () => {
                const saved = await saveRole('viewer');
                expect(BigInt(saved.result.revision)).toBe(BigInt(membership.revision) + 1n);
                membership = saved.result;
                const allowed = await request.get(server.origin + root, { headers });
                expect(allowed.status()).toBe(200);
                expect(zProjectView.parse(await allowed.json()).effectiveRole).toBe('viewer');
                const denied = await request.post(server.origin + '/api/v2/projects/' + projectId + '/issues', { headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() }, data: { title: 'Viewer must not create' } });
                expect(denied.status()).toBe(403);
                expect(await denied.json()).toMatchObject({ error: { code: 'forbidden' } });
            });
            expect((await read(request, root + '/memberships', zPageMembershipView)).items.find(item => item.user.id === approved.id)?.revision).toBe(membership.revision);
        });
        await edit();
        await web('UC-PRJ-0043', async () => {
            membership = (await saveRole('project_admin')).result;
            const allowed = await request.get(server.origin + '/api/v2/projects/' + projectId + '/configuration', { headers });
            expect(allowed.status()).toBe(200);
            expect(zConfigurationView.parse(await allowed.json()).canManage).toBe(true);
            const denied = await request.get(server.origin + '/api/v1/admin/users', { headers });
            expect(denied.status()).toBe(403);
            expect(await denied.json()).toMatchObject({ error: { code: 'forbidden' } });
        });
        const assigned = (await save(request, '/api/v2/projects/' + projectId + '/issues', { title: 'Assignment is cleared when role ends', assigneeId: approved.id }, zSavedModernIssueView, { method: 'POST', status: 201 })).result;
        await web('UC-PRJ-0045', async () => {
            const response = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === root + '/memberships/' + approved.id + '/remove');
            await row().getByRole('button', { name: 'Remove access for ' + approved.displayName, exact: true }).click();
            const saved = zSavedMembershipView.parse(await (await response).json());
            expect(saved.result.removed).toBe(true);
            membership = saved.result;
            await expect(row()).toContainText('project_admin · Removed');
            expect((await request.get(server.origin + root, { headers })).status()).toBe(404);
            expect((await read(request, '/api/v2/issues/' + assigned.summary.id, zModernIssueView)).summary.assignee).toBeNull();
        });
        await edit();
        await web('UC-PRJ-0046', async () => {
            const saved = await saveRole('member');
            expect(saved.result.user.id).toBe(approved.id);
            expect(BigInt(saved.result.revision)).toBe(BigInt(membership.revision) + 1n);
            expect(saved.result.removed).toBe(false);
            membership = saved.result;
            expect((await request.get(server.origin + root, { headers })).status()).toBe(200);
            expect((await read(request, '/api/v2/issues/' + assigned.summary.id, zModernIssueView)).summary.assignee).toBeNull();
        });
        await edit();
        await page.getByRole('combobox', { name: 'Project role', exact: true }).selectOption('viewer');
        const submissions: Array<{
            reference: string;
            payload: unknown;
            eventId: string | null;
            revision: string;
        }> = [];
        await page.route('**' + root + '/memberships/' + approved.id, async (route) => {
            if (route.request().method() !== 'PUT')
                return route.continue();
            const response = await route.fetch();
            expect(response.status()).toBe(200);
            const saved = zSavedMembershipView.parse(await response.json());
            submissions.push({ reference: route.request().headers()['idempotency-key'] ?? '', payload: route.request().postDataJSON(), eventId: saved.receipt.eventId, revision: saved.result.revision });
            if (submissions.length === 1) {
                expect(saved.receipt.replayed).toBe(false);
                await route.abort('failed');
            }
            else {
                expect(saved.receipt.replayed).toBe(true);
                await route.fulfill({ response });
            }
        });
        await web('UC-PRJ-0049', async () => {
            await page.getByRole('button', { name: 'Save membership', exact: true }).click();
            await expect(page.getByRole('alert')).toContainText(/connection|try again/i);
            await expect(page.getByRole('combobox', { name: 'Project role', exact: true })).toHaveValue('viewer');
            await page.getByRole('button', { name: 'Save membership', exact: true }).click();
            await expect(page.getByText('Project role saved.', { exact: true })).toBeVisible();
            expect(submissions).toHaveLength(2);
            expect(submissions[0]!.reference).not.toBe('');
            expect(submissions[1]).toEqual(submissions[0]);
            expect(BigInt(submissions[0]!.revision)).toBe(BigInt(membership.revision) + 1n);
            await expect(row()).toContainText('viewer · Active membership');
        });
    }
    finally {
        await server.stop();
        const user = (await allCompanyUsers(request)).find(user => user.id === approved.id)!;
        await save(request, '/api/v1/admin/users/' + user.id, { expectedRevision: user.revision, email: user.email, displayName: user.displayName, administrator: false, active: false }, zSavedUserView);
    }
});
