// Real application and PostgreSQL integrations; provider acceptance is tracked separately.
import { z } from 'zod';
import { expect, type Locator, type Page } from '@playwright/test';
import { LocalAuthServer } from './support/isolated-local-identity';
import { isolatedProject, useModernIssues } from './support/project';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { localFixturesAvailable, signIn, apiOrigin } from './support/session';
import { read, save, allCompanyUsers, memberId } from './support/coverage-access';
import { zSavedProjectView, zProjectView, zSavedUserView, zSavedModernIssueView, zModernIssueView, zSavedMembershipView, zPageUserView, zMe } from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable, 'Requires real isolated local accounts and PostgreSQL.');
test.use({ trace: 'off' });
async function findLoadedRow(page: Page, kind: 'account' | 'project', exactButton: string): Promise<Locator> {
    await expect(page.getByRole('button', { name: kind === 'account' ? 'Refresh users' : 'Refresh projects', exact: true })).toBeEnabled();
    const root = page.locator(kind === 'account' ? '.records > li' : '.project-records > li');
    const more = page.getByRole('button', { name: kind === 'account' ? 'More users' : 'More projects', exact: true });
    for (;;) {
        const row = root.filter({ has: page.getByRole('button', { name: exactButton, exact: true }) });
        if (await row.count())
            return row;
        await expect(more).toBeVisible();
        await expect(more).toBeEnabled();
        const before = await root.count();
        await more.click();
        await expect.poll(() => root.count()).toBeGreaterThan(before);
    }
}
test('an edited account name appears in the refreshed company directory', async ({ page, request }) => {
    const suffix = crypto.randomUUID();
    const approved = (await save(request, '/api/v1/admin/users', { displayName: 'Old display ' + suffix, email: suffix + '@example.test', administrator: false }, zSavedUserView, { method: 'POST', status: 201 })).result;
    const changedName = 'اسم جديد 😀 ' + suffix.slice(0, 8);
    await signIn(page, 'owner', '/admin/users', /Company users/);
    await (await findLoadedRow(page, 'account', 'Edit ' + approved.displayName)).getByRole('button', { name: 'Edit ' + approved.displayName, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit account', exact: true })).toBeVisible();
    await useCase('UC-ACC-0046', async () => {
        await page.getByLabel('Display name', { exact: true }).fill(changedName);
        const reply = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === '/api/v1/admin/users/' + approved.id);
        await page.getByRole('button', { name: 'Save account', exact: true }).click();
        expect((await reply).status()).toBe(200);
        const saved = zSavedUserView.parse(await (await reply).json()).result;
        expect(saved.id).toBe(approved.id);
        expect(saved.displayName).toBe(changedName);
        expect(BigInt(saved.revision)).toBe(BigInt(approved.revision) + 1n);
        await expect(page.getByText('Account saved.', { exact: true })).toBeVisible();
        const row = await findLoadedRow(page, 'account', 'Edit ' + changedName);
        await expect(row.locator('strong[dir=auto]')).toHaveText(changedName);
        await expect(row.locator('strong[dir=auto]')).toHaveCSS('direction', 'rtl');
        await expect(row).toContainText(approved.email);
        expect((await allCompanyUsers(request)).find(user => user.id === approved.id)?.displayName).toBe(changedName);
    }, 'web');
});
test('project editor retains its fixed key and reviews an actual stale-write conflict', async ({ page, request }) => {
    const key = ('P' + crypto.randomUUID().replaceAll('-', '').slice(0, 8)).toUpperCase();
    const created = (await save(request, '/api/v1/projects', { key, name: 'Initial ' + key, description: 'Original description' }, zSavedProjectView, { method: 'POST', status: 201 })).result;
    await signIn(page, 'owner', '/projects', /Projects/);
    await (await findLoadedRow(page, 'project', 'Edit ' + key)).getByRole('button', { name: 'Edit ' + key, exact: true }).click();
    const editor = page.getByRole('region', { name: 'Project details', exact: true });
    await useCase('UC-PRJ-0024', async () => {
        await expect(editor.getByRole('heading', { name: 'Edit project ' + key, exact: true })).toBeVisible();
        await expect(editor.getByText('The project key stays fixed.', { exact: true })).toBeVisible();
        await expect(editor.getByLabel('Project key', { exact: true })).toHaveCount(0);
        await expect(editor.getByLabel('Project name', { exact: true })).toHaveValue(created.name);
    }, 'web');
    await editor.getByLabel('Project name', { exact: true }).fill('Unsaved stale draft');
    const current = (await save(request, '/api/v1/projects/' + created.id, { expectedRevision: created.revision, name: 'Concurrent current ' + key, description: 'Current authoritative description' }, zSavedProjectView)).result;
    await useCase('UC-PRJ-0032', async () => {
        const reply = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === '/api/v1/projects/' + created.id);
        await editor.getByRole('button', { name: 'Save project', exact: true }).click();
        expect((await reply).status()).toBe(409);
        await expect(editor.getByText('Current project:', { exact: false })).toContainText(current.name);
        await expect(editor.getByLabel('Project name', { exact: true })).toHaveValue('Unsaved stale draft');
        await editor.getByRole('button', { name: 'Review current project', exact: true }).click();
        await expect(editor.getByLabel('Project name', { exact: true })).toHaveValue(current.name);
        await expect(editor.getByLabel('Description', { exact: true })).toHaveValue(current.description);
        expect((await read(request, '/api/v1/projects/' + created.id, zProjectView)).revision).toBe(current.revision);
        await editor.getByLabel('Project name', { exact: true }).fill('Intentional reviewed edit ' + key);
        const savedReply = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === '/api/v1/projects/' + created.id);
        await editor.getByRole('button', { name: 'Save project', exact: true }).click();
        expect((await savedReply).status()).toBe(200);
        expect((await savedReply).request().postDataJSON()).not.toHaveProperty('key');
        const saved = zSavedProjectView.parse(await (await savedReply).json()).result;
        expect(saved.key).toBe(key);
        expect(saved.name).toBe('Intentional reviewed edit ' + key);
        expect(saved.description).toBe(current.description);
        await expect(page.getByText('Project saved.', { exact: true })).toBeVisible();
    }, 'web');
});
test('company approval and account edits expose actual validation, role refresh and irreversible assignment clearing', async ({ page, request }, info) => {
    const suffix = crypto.randomUUID().slice(0, 8), name = 'Web approved ' + suffix, email = 'web-' + suffix + '@example.test';
    await signIn(page, 'owner', '/admin/users', /^Company users$/);
    const approval = page.getByRole('button', { name: 'Approve user', exact: true });
    await useCase('UC-ACC-0042', async () => {
        await page.getByLabel('Display name', { exact: true }).fill(name);
        await page.getByLabel('Email', { exact: true }).fill('not-an-email');
        await expect(approval).toBeDisabled();
        await expect(page.getByRole('heading', { name: 'Approve a user', exact: true })).toBeVisible();
    }, 'web');
    await useCase('UC-ACC-0044', async () => {
        await page.getByLabel('Email', { exact: true }).fill(email);
        await page.getByLabel('Display name', { exact: true }).fill('ش'.repeat(101));
        await expect(approval).toBeDisabled();
        await page.getByLabel('Display name', { exact: true }).fill('');
        await expect(approval).toBeDisabled();
    }, 'web');
    await page.getByLabel('Display name', { exact: true }).fill(name);
    const createdReply = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/admin/users');
    await useCase('UC-ACC-0039', async () => {
        await approval.click();
        const response = await createdReply;
        expect(response.status()).toBe(201);
        const saved = zSavedUserView.parse(await response.json());
        expect(saved.result).toMatchObject({ email, displayName: name, administrator: false, active: true, approved: true });
        await expect(page.getByText('User approved.', { exact: true })).toBeVisible();
        await expect(await findLoadedRow(page, 'account', 'Edit ' + name)).toContainText('Active · Project roles');
    }, 'web');
    let user = zSavedUserView.parse(await (await createdReply).json()).result;
    const server = new LocalAuthServer(info);
    try {
        await server.prepare();
        const credentials = await server.addIdentity('approved-' + suffix, email);
        await server.start();
        const privateLogin = async () => {
            const response = await request.post(server.origin + '/api/v1/auth/local-sign-in', { data: credentials });
            expect(response.status()).toBe(200);
            return z.object({ accessToken: z.string().min(1), expiresAt: z.iso.datetime() }).strict().parse(await response.json()).accessToken;
        };
        const accountToken = await privateLogin();
        if (typeof accountToken !== 'string')
            throw new Error('Missing own approved identity token.');
        const me = () => request.get(server.origin + '/api/v1/me', { headers: { Authorization: 'Bearer ' + accountToken } });
        const projectId = await isolatedProject(request);
        await useModernIssues(projectId);
        await save(request, '/api/v1/projects/' + projectId + '/memberships/' + user.id, { expectedRevision: '0', role: 'member' }, zSavedMembershipView);
        const issue = (await save(request, '/api/v2/projects/' + projectId + '/issues', { title: 'Owned account assignment ' + suffix, assigneeId: user.id }, zSavedModernIssueView, { method: 'POST', status: 201 })).result;
        const edit = async () => {
            await (await findLoadedRow(page, 'account', 'Edit ' + user.displayName)).getByRole('button', { name: 'Edit ' + user.displayName, exact: true }).click();
            await expect(page.getByRole('heading', { name: 'Edit account', exact: true })).toBeVisible();
            await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(user.displayName);
        };
        const submit = async () => {
            const reply = page.waitForResponse(r => r.request().method() === 'PUT' && new URL(r.url()).pathname === '/api/v1/admin/users/' + user.id);
            await page.getByRole('button', { name: 'Save account', exact: true }).click();
            const response = await reply;
            expect(response.status()).toBe(200);
            const saved = zSavedUserView.parse(await response.json());
            expect(BigInt(saved.result.revision)).toBe(BigInt(user.revision) + 1n);
            user = saved.result;
            await expect(page.getByText('Account saved.', { exact: true })).toBeVisible();
            return saved;
        };
        await useCase('UC-ACC-0043', async () => {
            await page.getByLabel('Display name', { exact: true }).fill('Duplicate ' + suffix);
            await page.getByLabel('Email', { exact: true }).fill(email.toUpperCase());
            const response = page.waitForResponse(r => r.request().method() === 'POST' && new URL(r.url()).pathname === '/api/v1/admin/users');
            await approval.click();
            expect((await response).status()).toBe(422);
            await expect(page.getByRole('alert')).toContainText(/already.*email/i);
            expect((await allCompanyUsers(request)).filter(value => value.email.toLowerCase() === email)).toHaveLength(1);
        }, 'web');
        await edit();
        await useCase('UC-ACC-0049', async () => {
            await page.getByRole('checkbox', { name: 'Company administrator', exact: true }).check();
            await submit();
            await expect(await findLoadedRow(page, 'account', 'Edit ' + name)).toContainText('Active · Administrator');
            const response = await me();
            expect(response.status()).toBe(200);
            expect(zMe.parse(await response.json()).administrator).toBe(true);
        }, 'web');
        await edit();
        await useCase('UC-ACC-0050', async () => {
            await page.getByRole('checkbox', { name: 'Company administrator', exact: true }).uncheck();
            await submit();
            await expect(await findLoadedRow(page, 'account', 'Edit ' + name)).toContainText('Active · Project roles');
            expect(zMe.parse(await (await me()).json()).administrator).toBe(false);
            expect((await read(request, '/api/v1/projects/' + projectId, zProjectView)).id).toBe(projectId);
        }, 'web');
        await edit();
        await useCase('UC-ACC-0047', async () => {
            await page.getByRole('checkbox', { name: 'Active account', exact: true }).uncheck();
            await submit();
            await expect(await findLoadedRow(page, 'account', 'Edit ' + name)).toContainText('Disabled · Project roles');
            expect((await me()).status()).toBe(403);
            expect((await read(request, '/api/v2/issues/' + issue.summary.id, zModernIssueView)).summary.assignee).toBeNull();
        }, 'web');
        await edit();
        await useCase('UC-ACC-0048', async () => {
            await page.getByRole('checkbox', { name: 'Active account', exact: true }).check();
            await submit();
            await expect(await findLoadedRow(page, 'account', 'Edit ' + name)).toContainText('Active · Project roles');
            expect((await me()).status()).toBe(200);
            expect((await read(request, '/api/v2/issues/' + issue.summary.id, zModernIssueView)).summary.assignee).toBeNull();
        }, 'web');
        await edit();
        const changed = 'updated-' + email;
        await useCase('UC-ACC-0045', async () => {
            await page.getByLabel('Email', { exact: true }).fill(changed);
            await submit();
            await expect(await findLoadedRow(page, 'account', 'Edit ' + name)).toContainText(changed);
            expect((await allCompanyUsers(request)).filter(value => value.id === user.id)).toHaveLength(1);
            expect(user.email).toBe(changed);
        }, 'web');
    }
    finally {
        await server.stop();
        const current = (await allCompanyUsers(request)).find(value => value.id === user.id)!;
        await save(request, '/api/v1/admin/users/' + user.id, { expectedRevision: current.revision, email: current.email, displayName: current.displayName, administrator: false, active: false }, zSavedUserView);
    }
});
test('native company directory presents exact approved records and appends a distinct bounded next page', async ({ page, request }) => {
    const before = await allCompanyUsers(request);
    for (let n = before.length; n < 26; n++)
        await save(request, '/api/v1/admin/users', { displayName: 'Directory paging ' + String(n).padStart(2, '0') + ' ' + crypto.randomUUID().slice(0, 8), email: crypto.randomUUID() + '@example.test', administrator: false }, zSavedUserView, { method: 'POST', status: 201 });
    const received = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/admin/users' && !new URL(response.url()).searchParams.has('cursor'));
    await signIn(page, 'owner', '/admin/users', /^Company users$/);
    const response = await received;
    expect(response.status()).toBe(200);
    const first = zPageUserView.parse(await response.json());
    await useCase('UC-ACC-0036', async () => {
        expect(first.items).toHaveLength(25);
        await expect(page.locator('.records >li')).toHaveCount(25);
        await expect(page.locator('.records >li strong')).toHaveText(first.items.map(user => user.displayName));
        for (const user of first.items) {
            expect(user.approved).toBe(true);
            expect(user.revision).toMatch(/^[1-9][0-9]*$/);
            const row = page.locator('.records >li').filter({ has: page.getByRole('button', { name: 'Edit ' + user.displayName, exact: true }) });
            await expect(row).toContainText(user.email);
            await expect(row).toContainText((user.active ? 'Active' : 'Disabled') + ' · ' + (user.administrator ? 'Administrator' : 'Project roles'));
        }
    }, 'web');
    await useCase('UC-ACC-0037', async () => {
        expect(first.nextCursor).toBeTruthy();
        const received = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/admin/users' && new URL(response.url()).searchParams.get('cursor') === first.nextCursor);
        await page.getByRole('button', { name: 'More users', exact: true }).click();
        const response = await received;
        expect(response.status()).toBe(200);
        const next = zPageUserView.parse(await response.json());
        expect(next.items.length).toBeGreaterThan(0);
        expect(next.items.length).toBeLessThanOrEqual(25);
        expect(next.items.every(user => !first.items.some(previous => previous.id === user.id))).toBe(true);
        await expect(page.locator('.records >li')).toHaveCount(first.items.length + next.items.length);
        await expect(page.locator('.records >li strong')).toHaveText([...first.items, ...next.items].map(user => user.displayName));
    }, 'web');
});
test('native approval grants administrator explicitly and protects the sole current administrator from unsafe changes', async ({ page, request }) => {
    const before = await allCompanyUsers(request), owner = before.find(user => user.id === '10000000-0000-4000-8000-000000000001')!;
    expect(before.filter(user => user.active && user.administrator).map(user => user.id)).toEqual([owner.id]);
    await signIn(page, 'owner', '/admin/users', /^Company users$/);
    for (const [id, checkbox] of [['UC-ACC-0051', 'Active account'], ['UC-ACC-0052', 'Company administrator']] as const) {
        await (await findLoadedRow(page, 'account', 'Edit ' + owner.displayName)).getByRole('button', { name: 'Edit ' + owner.displayName, exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Edit account', exact: true })).toBeVisible();
        await useCase(id, async () => {
            await page.getByRole('checkbox', { name: checkbox, exact: true }).uncheck();
            const reply = page.waitForResponse(response => response.request().method() === 'PUT' && new URL(response.url()).pathname === '/api/v1/admin/users/' + owner.id);
            await page.getByRole('button', { name: 'Save account', exact: true }).click();
            const response = await reply;
            expect(response.status()).toBe(422);
            expect(await response.json()).toMatchObject({ error: { code: 'validation_failed' } });
            await expect(page.getByRole('alert')).toContainText('at least one active Administrator');
            expect((await allCompanyUsers(request)).find(user => user.id === owner.id)).toEqual(owner);
            await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
        }, 'web');
        await page.getByRole('button', { name: 'Cancel', exact: true }).click();
        await expect(page.getByRole('heading', { name: 'Approve a user', exact: true })).toBeVisible();
    }
    let approved: z.infer<typeof zSavedUserView>['result'] | undefined;
    try {
        await useCase('UC-ACC-0040', async () => {
            const name = 'Explicit web administrator ' + crypto.randomUUID().slice(0, 8);
            await page.getByLabel('Display name', { exact: true }).fill(name);
            await page.getByLabel('Email', { exact: true }).fill(crypto.randomUUID() + '@example.test');
            await page.getByRole('checkbox', { name: 'Company administrator', exact: true }).check();
            const reply = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/admin/users');
            await page.getByRole('button', { name: 'Approve user', exact: true }).click();
            const response = await reply;
            expect(response.status()).toBe(201);
            approved = zSavedUserView.parse(await response.json()).result;
            expect(approved.administrator).toBe(true);
            expect(approved.active).toBe(true);
            await expect(page.getByText('User approved.', { exact: true })).toBeVisible();
            await expect(await findLoadedRow(page, 'account', 'Edit ' + name)).toContainText('Active · Administrator');
        }, 'web');
    }
    finally {
        if (approved)
            await save(request, '/api/v1/admin/users/' + approved.id, { expectedRevision: approved.revision, email: approved.email, displayName: approved.displayName, administrator: false, active: false }, zSavedUserView);
    }
});
test('native uncertain account save repeats its genuine accepted intent without a duplicate change', async ({ page, request }) => {
    const original = (await save(request, '/api/v1/admin/users', { email: crypto.randomUUID() + '@example.test', displayName: 'Before uncertain account ' + crypto.randomUUID().slice(0, 8), administrator: false }, zSavedUserView, { method: 'POST', status: 201 })).result;
    await signIn(page, 'owner', '/admin/users', /^Company users$/);
    await (await findLoadedRow(page, 'account', 'Edit ' + original.displayName)).getByRole('button', { name: 'Edit ' + original.displayName, exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Edit account', exact: true })).toBeVisible();
    const name = 'Recovered account ' + crypto.randomUUID().slice(0, 8);
    await page.getByLabel('Display name', { exact: true }).fill(name);
    const submissions: Array<{
        reference: string;
        payload: unknown;
        eventId: string | null;
        revision: string;
    }> = [];
    await page.route('**/api/v1/admin/users/' + original.id, async (route) => {
        if (route.request().method() !== 'PUT')
            return route.continue();
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        const saved = zSavedUserView.parse(await response.json());
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
    await useCase('UC-ACC-0055', async () => {
        await page.getByRole('button', { name: 'Save account', exact: true }).click();
        await expect(page.getByRole('alert')).toContainText(/connection|try again/i);
        await expect(page.getByLabel('Display name', { exact: true })).toHaveValue(name);
        await page.getByRole('button', { name: 'Save account', exact: true }).click();
        await expect(page.getByText('Account saved.', { exact: true })).toBeVisible();
        expect(submissions).toHaveLength(2);
        expect(submissions[0]!.reference).not.toBe('');
        expect(submissions[1]).toEqual(submissions[0]);
        expect(BigInt(submissions[0]!.revision)).toBe(BigInt(original.revision) + 1n);
        await expect(await findLoadedRow(page, 'account', 'Edit ' + name)).toContainText(name);
        expect((await allCompanyUsers(request)).filter(user => user.id === original.id)).toHaveLength(1);
    }, 'web');
});
