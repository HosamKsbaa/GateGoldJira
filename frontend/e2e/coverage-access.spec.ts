import { expect, type Request } from '@playwright/test';
import { z } from 'zod';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { isolatedProject, useModernIssues } from './support/project';
import { apiOrigin, localFixturesAvailable, signIn, configureLocalSignIn, fillCredentials, account, token } from './support/session';
import { authorization, memberId, viewerId, read, save, rejected, callTool } from './support/coverage-access';
import {
  zConfigurationView, zSavedProjectView, zProjectView, zPageProjectView,
  zPageMembershipView, zSavedMembershipView, zPageMembershipCandidateView,
  zPageUserSummary, zSavedTypeSaved, zPageTypeView, zSavedPrioritySaved,
  zPagePriorityView, zSavedFieldSaved, zPageFieldDefinition, zSavedFieldOptionSaved,
  zPageFieldOptionView, zSavedConfigurationView, zActivationReadiness,
  zSavedBackfillFieldResult, zSavedModernIssueView, zModernIssueView, zCustomFieldsView,
  zPageBindingView, zSavedUserView, zPageBoardSummary, zMe,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires isolated real local accounts and PostgreSQL.');
test.use({ trace: 'off' });

test('local sign-in validates fields, clears the password, uses the protected return URL and ends on reload', async ({ page }) => {
  await configureLocalSignIn(page);
  await useCase('UC-ACC-0001', async () => {
    await page.goto('/projects?audit=return');
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fprojects%3Faudit%3Dreturn/);
    await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
  }, 'web');
  await useCase('UC-ACC-0007', async () => {
    await page.getByLabel('Password', { exact: true }).fill('nonempty');
    await expect(page.getByRole('button', { name: 'Sign in locally', exact: true })).toBeDisabled();
    await page.getByLabel('Username', { exact: true }).fill('   ');
    await expect(page.getByRole('button', { name: 'Sign in locally', exact: true })).toBeDisabled();
  }, 'web');
  await useCase('UC-ACC-0008', async () => {
    await page.getByLabel('Username', { exact: true }).fill('owner');
    await page.getByLabel('Password', { exact: true }).fill('');
    await expect(page.getByRole('button', { name: 'Sign in locally', exact: true })).toBeDisabled();
  }, 'web');
  let overlengthSubmissions = 0;
  const observeSubmission = (request: Request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/auth/local-sign-in') overlengthSubmissions++;
  };
  page.on('request', observeSubmission);
  await useCase('UC-ACC-0009', async () => {
    const username = page.getByLabel('Username', { exact: true });
    await page.getByLabel('Password', { exact: true }).fill('nonempty');
    await username.fill('x'.repeat(65)); await username.press('Enter');
    await expect(username).toHaveValue('x'.repeat(65));
    await expect(username).toHaveAttribute('aria-invalid', 'true');
    await expect(username).toHaveAttribute('aria-describedby', 'local-username-error');
    await expect(page.getByRole('alert')).toHaveText('Username must be 64 characters or fewer.');
    await expect(page.getByRole('button', { name: 'Sign in locally', exact: true })).toBeDisabled();
    expect(overlengthSubmissions).toBe(0);
  }, 'web');
  await useCase('UC-ACC-0010', async () => {
    const password = page.getByLabel('Password', { exact: true });
    await page.getByLabel('Username', { exact: true }).fill('owner');
    await password.fill('x'.repeat(73)); await password.press('Enter');
    await expect(password).toHaveValue('x'.repeat(73));
    await expect(password).toHaveAttribute('aria-invalid', 'true');
    await expect(password).toHaveAttribute('aria-describedby', 'local-password-error');
    await expect(page.getByRole('alert')).toHaveText('Password must be 72 characters or fewer.');
    await expect(page.getByRole('button', { name: 'Sign in locally', exact: true })).toBeDisabled();
    expect(overlengthSubmissions).toBe(0);
  }, 'web');
  page.off('request', observeSubmission);
  await fillCredentials(page, 'owner');
  let release: () => void = () => {};
  const held = new Promise<void>(resolve => { release = resolve; });
  let count = 0;
  await page.route('**/api/v1/auth/local-sign-in', async route => {
    count++;
    const response = await route.fetch();
    await held;
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
  await useCase('UC-ACC-0011', async () => {
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    await expect(page.getByRole('heading', { name: 'Welcome to GateGoldJira', exact: true })).toBeVisible();
  }, 'web');
  await useCase('UC-ACC-0012', async () => {
    await expect(page.getByRole('button', { name: 'Sign in locally', exact: true })).toBeDisabled();
    await expect.poll(() => count).toBe(1);
  }, 'web');
  release();
  await useCase('UC-ACC-0002', async () => {
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/projects\?audit=return$/);
    expect(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) })))
      .toEqual({ local: [], session: [] });
    expect(await page.context().cookies()).toEqual([]);
  }, 'web');
  await useCase('UC-ACC-0018', async () => {
    await page.reload();
    await expect(page).toHaveURL(/\/sign-in\?/);
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  }, 'web');
  await page.unroute('**/api/v1/auth/local-sign-in');
  await fillCredentials(page, 'owner');
  await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await useCase('UC-ACC-0019', async () => {
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole('link', { name: 'Projects', exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  }, 'web');
});

for (const [id, destination] of [
  ['UC-ACC-0022', 'https://example.invalid/steal'],
  ['UC-ACC-0023', '//example.invalid/steal'],
  ['UC-ACC-0024', '/sign-in?returnTo=%2Fsign-in'],
] as const) {
  test(id + ' unsafe return targets land on the signed-in home', async ({ page }) => {
    await configureLocalSignIn(page);
    await page.goto('/sign-in?returnTo=' + encodeURIComponent(destination));
    await fillCredentials(page, 'owner');
    await useCase(id, async () => {
      await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
      await expect(page.getByRole('heading', { name: /Welcome,/ })).toBeVisible();
      await expect(page).toHaveURL(new URL('/', page.url()).href);
    }, 'web');
  });
}

test('local credentials distinguish invalid, disabled, normalized and offline attempts', async ({ page, request }) => {
  const owner = await account('owner');
  await useCase('UC-ACC-0062', async () => {
    const response = await request.post(apiOrigin + '/api/v1/auth/local-sign-in', { data: { username: owner.username, password: owner.password } });
    expect(response.status()).toBe(200);
    const session = z.object({ accessToken: z.string().min(1), expiresAt: z.iso.datetime() }).strict().parse(await response.json());
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const identity = await request.get(apiOrigin + '/api/v1/me', { headers: { Authorization: 'Bearer ' + session.accessToken } });
    expect(identity.status()).toBe(200); expect(zMe.parse(await identity.json()).email).toBe('owner@example.test');
  }, 'rest');
  await useCase('UC-ACC-0003', async () => {
    const response = await request.post(apiOrigin + '/api/v1/auth/local-sign-in', {
      data: { username: '  ' + owner.username.toUpperCase() + '  ', password: owner.password },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).accessToken).toEqual(expect.any(String));
  }, 'rest');
  for (const [id, username, password] of [
    ['UC-ACC-0005', owner.username, 'incorrect-password'],
    ['UC-ACC-0006', 'unknown-' + crypto.randomUUID().slice(0, 8), owner.password],
  ] as const) {
    await useCase(id, async () => {
      const response = await request.post(apiOrigin + '/api/v1/auth/local-sign-in', { data: { username, password } });
      expect(response.status()).toBe(401);
      expect(await response.text()).not.toContain(owner.password);
    }, 'rest');
  }
  await configureLocalSignIn(page);
  await page.goto('/');
  for (const [id, username, password] of [
    ['UC-ACC-0005', owner.username, 'incorrect-password'],
    ['UC-ACC-0006', 'unknown-' + crypto.randomUUID().slice(0, 8), owner.password],
  ] as const) await useCase(id, async () => {
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const response = page.waitForResponse(r => r.url().endsWith('/auth/local-sign-in'));
    await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
    expect((await response).status()).toBe(401);
    await expect(page.getByRole('alert')).toContainText('The username or password is incorrect.');
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  }, 'web');
  await useCase('UC-ACC-0003', async () => {
    await page.getByLabel('Username', { exact: true }).fill('  ' + owner.username.toUpperCase() + '  ');
    await page.getByLabel('Password', { exact: true }).fill(owner.password);
    await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Welcome,/ })).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Welcome to GateGoldJira', exact: true })).toBeVisible();
  }, 'web');
  await fillCredentials(page, 'disabled');
  await useCase('UC-ACC-0013', async () => {
    const response = page.waitForResponse(r => r.url().endsWith('/auth/local-sign-in'));
    await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
    expect((await response).status()).toBe(403);
    await expect(page.getByRole('alert')).toContainText('This account cannot sign in');
    await expect(page.getByRole('link', { name: 'Projects', exact: true })).toHaveCount(0);
  }, 'web');
  await fillCredentials(page, 'owner');
  await page.route('**/api/v1/auth/local-sign-in', route => route.abort('failed'));
  await useCase('UC-ACC-0015', async () => {
    await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('sign-in service is unavailable');
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    await expect(page.getByRole('link', { name: 'Projects', exact: true })).toHaveCount(0);
  }, 'web');
});

test('project validation is enforced by real HTTP services', async ({ request }) => {
  for (const [id, patch] of [
    ['UC-PRJ-0013', { key: '9bad' }],
    ['UC-PRJ-0064', { key: ' SPACE ' }],
    ['UC-PRJ-0015', { name: '   ' }],
    ['UC-PRJ-0016', { name: 'ش'.repeat(101) }],
    ['UC-PRJ-0017', { description: 'a'.repeat(2001) }],
  ] as const) {
    await useCase(id, async () => {
      const response = await request.post(apiOrigin + '/api/v1/projects', {
        headers: await authorization(),
        data: { key: 'P' + crypto.randomUUID().slice(0, 7), name: 'Valid', ...patch },
      });
      await rejected(response, 422, /key|name|description|validation/i);
    }, 'rest');
  }
  await useCase('UC-PRJ-0026', async () => {
    const response = await request.post(apiOrigin + '/api/v1/projects', {
      headers: await authorization('member'), data: { key: 'P' + crypto.randomUUID().slice(0, 7), name: 'Denied' },
    });
    await rejected(response, 403, /permission|administrator|access/i);
  }, 'rest');
});

test('project lifecycle retains normalized immutable identity, conflict snapshots and retry receipts', async ({ request }) => {
  const key = 'p' + crypto.randomUUID().replaceAll('-', '').slice(0, 7);
  let project = (await save(request, '/api/v1/projects', { key, name: 'مشروع عربي', description: 'وصف <b>نصي</b>' }, zSavedProjectView, { method: 'POST', status: 201 })).result;
  await useCase('UC-PRJ-0011', async () => {
    expect(project.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(project.name).toBe('مشروع عربي');
    expect(project.archived).toBe(false);
    const boards = await read(request, '/api/v1/projects/' + project.id + '/boards', zPageBoardSummary);
    expect(boards.items).toHaveLength(1); expect(boards.items[0]).toMatchObject({ default: true, name: 'All Issues', projectId: project.id });
  }, 'rest');
  await useCase('UC-PRJ-0012', async () => { expect(project.key).toBe(key.toUpperCase()); }, 'rest');
  await useCase('UC-PRJ-0065', async () => {
    const current = await read(request, '/api/v1/projects/' + project.id, zProjectView);
    expect(current.name).toBe('مشروع عربي');
    expect(current.description).toBe('وصف <b>نصي</b>');
  }, 'rest');
  await useCase('UC-PRJ-0014', async () => {
    const duplicate = await request.post(apiOrigin + '/api/v1/projects', { headers: await authorization(), data: { key: project.key, name: 'Duplicate' } });
    await rejected(duplicate, 422, /key|already|exist/i);
  }, 'rest');
  const body = { expectedRevision: project.revision, name: 'Edited project', description: 'Edited description' };
  const reference = crypto.randomUUID();
  const edited = await save(request, '/api/v1/projects/' + project.id, body, zSavedProjectView, { reference });
  project = edited.result;
  await useCase('UC-PRJ-0022', async () => { expect(project.name).toBe(body.name); }, 'rest');
  await useCase('UC-PRJ-0023', async () => { expect(project.description).toBe(body.description); }, 'rest');
  await useCase('UC-PRJ-0069', async () => {
    expect(project.key).toBe(key.toUpperCase());
    const response = await request.put(apiOrigin + '/api/v1/projects/' + project.id, { headers: await authorization(), data: { expectedRevision: project.revision, name: project.name, description: project.description, key: 'RENAMED' } });
    await rejected(response, 422, /validation/i);
    expect((await read(request, '/api/v1/projects/' + project.id, zProjectView)).key).toBe(key.toUpperCase());
  }, 'rest');
  await useCase('UC-PRJ-0033', async () => {
    const retry = await save(request, '/api/v1/projects/' + project.id, body, zSavedProjectView, { reference });
    expect(retry.receipt.replayed).toBe(true);
    expect(retry.result).toEqual(project);
  }, 'rest');
  await useCase('UC-PRJ-0070', async () => {
    const stale = await request.put(apiOrigin + '/api/v1/projects/' + project.id, { headers: await authorization(), data: { ...body, name: 'Stale edit' } });
    expect(stale.status()).toBe(409);
    const conflict = await stale.json();
    expect(zProjectView.parse(conflict.current)).toEqual(project);
    expect((await read(request, '/api/v1/projects/' + project.id, zProjectView)).name).toBe('Edited project');
  }, 'rest');
  await useCase('UC-PRJ-0027', async () => {
    project = (await save(request, '/api/v1/projects/' + project.id + '/archive', { expectedRevision: project.revision }, zSavedProjectView, { method: 'POST' })).result;
    expect(project.archived).toBe(true);
  }, 'rest');
  await useCase('UC-PRJ-0029', async () => {
    const same = await save(request, '/api/v1/projects/' + project.id + '/archive', { expectedRevision: project.revision }, zSavedProjectView, { method: 'POST' });
    expect(same.result.revision).toBe(project.revision);
    expect(same.receipt.eventId).toBeNull();
  }, 'rest');
  await useCase('UC-PRJ-0028', async () => {
    project = (await save(request, '/api/v1/projects/' + project.id + '/restore', { expectedRevision: project.revision }, zSavedProjectView, { method: 'POST' })).result;
    expect(project.archived).toBe(false);
  }, 'rest');
  await useCase('UC-PRJ-0030', async () => {
    const same = await save(request, '/api/v1/projects/' + project.id + '/restore', { expectedRevision: project.revision }, zSavedProjectView, { method: 'POST' });
    expect(same.result.revision).toBe(project.revision);
    expect(same.receipt.eventId).toBeNull();
  }, 'rest');
  await useCase('UC-PRJ-0034', async () => {
    const hidden = await request.get(apiOrigin + '/api/v1/projects/' + project.id, { headers: await authorization('viewer') });
    expect(hidden.status()).toBe(404);
  }, 'rest');
});

test('project membership roles, eligibility, revocation, restoration, conflict and paging remain scoped', async ({ request }) => {
  const projectId = await isolatedProject(request);
  const root = '/api/v1/projects/' + projectId;
  await useCase('UC-PRJ-0035', async () => {
    const list = await read(request, root + '/memberships', zPageMembershipView);
    expect(list.items.map(v => v.user.id)).toEqual(expect.arrayContaining([memberId, viewerId]));
    expect(list.items.every(v => v.projectId === projectId && !v.removed)).toBe(true);
  }, 'rest');
  await useCase('UC-PRJ-0036', async () => {
    const first = await read(request, root + '/memberships?limit=1', zPageMembershipView);
    expect(first.items).toHaveLength(1); expect(first.nextCursor).toBeTruthy();
    const next = await read(request, root + '/memberships?limit=1&cursor=' + encodeURIComponent(first.nextCursor!), zPageMembershipView);
    expect(next.items).toHaveLength(1); expect(next.items[0]?.user.id).not.toBe(first.items[0]?.user.id);
  }, 'rest');
  await useCase('UC-PRJ-0038', async () => {
    const candidates: z.infer<typeof zPageMembershipCandidateView>['items'] = [];
    const seenIds = new Set<string>();
    const seenCursors = new Set<string>();
    let cursor: string | null = null;
    let complete = false;
    for (let pageIndex = 0; pageIndex < 200; pageIndex++) {
      const query = new URLSearchParams({ limit: '2' });
      if (cursor !== null) query.set('cursor', cursor);
      const response = await request.get(apiOrigin + root + '/membership-candidates?' + query, { headers: await authorization() });
      expect(response.status()).toBe(200);
      const wire: unknown = await response.json();
      const list = zPageMembershipCandidateView.parse(wire);
      // Parsing removes unknown properties; equality also rejects private fields on every page.
      expect(wire).toEqual(list);
      for (const candidate of list.items) {
        expect(seenIds.has(candidate.id)).toBe(false);
        seenIds.add(candidate.id);
        candidates.push(candidate);
      }
      if (list.nextCursor === null) {
        complete = true;
        break;
      }
      expect(list.items.length).toBeGreaterThan(0);
      expect(seenCursors.has(list.nextCursor)).toBe(false);
      seenCursors.add(list.nextCursor);
      cursor = list.nextCursor;
    }
    expect(complete, 'candidate paging must terminate within the bounded traversal').toBe(true);
    expect(candidates).toEqual(expect.arrayContaining([expect.objectContaining({ id: memberId, active: true })]));
  }, 'rest');
  await useCase('UC-PRJ-0040', async () => {
    const list = await read(request, root + '/membership-candidates?query=' + encodeURIComponent('مطور'), zPageMembershipCandidateView);
    expect(list.items.map(v => v.id)).toContain(memberId);
    expect(list.items.every(v => v.displayName.includes('مطور'))).toBe(true);
  }, 'rest');
  await useCase('UC-PRJ-0051', async () => {
    const denied = await request.get(apiOrigin + root + '/memberships', { headers: await authorization('viewer') });
    await rejected(denied, 403, /permission|access|forbidden|reading only/i);
  }, 'rest');
  await useCase('UC-PRJ-0056', async () => {
    const list = await read(request, root + '/assignees', zPageUserSummary, 'viewer');
    expect(list.items.map(v => v.id)).toContain(memberId);
  }, 'rest');
  await useCase('UC-PRJ-0057', async () => {
    const list = await read(request, root + '/assignees', zPageUserSummary);
    expect(list.items.map(v => v.id)).not.toContain(viewerId);
  }, 'rest');
  await useCase('UC-PRJ-0058', async () => {
    const list = await read(request, root + '/mention-candidates', zPageUserSummary);
    expect(list.items.map(v => v.id)).toContain(viewerId);
  }, 'rest');
  await useCase('UC-PRJ-0060', async () => {
    const list = await read(request, root + '/assignees?query=' + encodeURIComponent('مطور'), zPageUserSummary);
    expect(list.items.map(v => v.id)).toEqual([memberId]);
  }, 'rest');
  await useCase('UC-PRJ-0061', async () => {
    const list = await read(request, root + '/mention-candidates?limit=1', zPageUserSummary);
    expect(list.items).toHaveLength(1); expect(list.nextCursor).toBeTruthy();
    const second = await read(request, root + '/mention-candidates?limit=1&cursor=' + encodeURIComponent(list.nextCursor!), zPageUserSummary);
    expect(second.items[0]?.id).not.toBe(list.items[0]?.id);
  }, 'rest');
  await useCase('UC-PRJ-0062', async () => {
    for (const endpoint of ['assignees', 'mention-candidates', 'membership-candidates']) {
      const response = await request.get(apiOrigin + root + '/' + endpoint + '?query=' + 'x'.repeat(101), { headers: await authorization() });
      await rejected(response, 422, /validation|100|query/i);
    }
  }, 'rest');
  let membership = (await read(request, root + '/memberships', zPageMembershipView)).items.find(v => v.user.id === memberId)!;
  for (const [id, role] of [
    ['UC-PRJ-0042', 'viewer'], ['UC-PRJ-0041', 'member'], ['UC-PRJ-0043', 'project_admin'],
  ] as const) {
    await useCase(id, async () => {
      membership = (await save(request, root + '/memberships/' + memberId, { expectedRevision: membership.revision, role }, zSavedMembershipView)).result;
      expect(membership.role).toBe(role); expect(membership.removed).toBe(false);
    }, 'rest');
  }
  await useCase('UC-PRJ-0025', async () => {
    const project = await read(request, root, zProjectView, 'member');
    const next = await save(request, root, { expectedRevision: project.revision, name: 'Project-admin metadata', description: '' }, zSavedProjectView, { role: 'member' });
    expect(next.result.name).toBe('Project-admin metadata');
  }, 'rest');
  await useCase('UC-PRJ-0025', async () => {
    const project = await read(request, root, zProjectView, 'member');
    const response = await callTool(request, 'update_project', { projectId, expectedRevision: project.revision, name: 'MCP project-admin metadata', description: '', retryReference: crypto.randomUUID() }, await token('member', 'mcp'));
    const result = z.object({ result: z.object({ structuredContent: z.object({ ok: z.literal(true), data: zSavedProjectView }) }) }).parse(await response.json()).result.structuredContent.data.result;
    expect(result.name).toBe('MCP project-admin metadata');
  }, 'mcp');
  await useCase('UC-PRJ-0035', async () => {
    const response = await callTool(request, 'list_memberships', { projectId }, await token('member', 'mcp'));
    const result = z.object({ result: z.object({ structuredContent: z.object({ ok: z.literal(true), data: zPageMembershipView }) }) }).parse(await response.json()).result.structuredContent.data;
    expect(result.items.find(item => item.user.id === memberId)?.role).toBe('project_admin');
  }, 'mcp');
  await useCase('UC-PRJ-0031', async () => {
    const project = await read(request, root, zProjectView);
    const denied = await request.post(apiOrigin + root + '/archive', { headers: await authorization('member'), data: { expectedRevision: project.revision } });
    await rejected(denied, 403, /permission|administrator|access/i);
  }, 'rest');
  await useCase('UC-PRJ-0047', async () => {
    const same = await save(request, root + '/memberships/' + memberId, { expectedRevision: membership.revision, role: membership.role }, zSavedMembershipView);
    expect(same.result.revision).toBe(membership.revision); expect(same.receipt.eventId).toBeNull();
  }, 'rest');
  await useCase('UC-PRJ-0052', async () => {
    const denied = await request.put(apiOrigin + root + '/memberships/' + memberId, { headers: await authorization(), data: { expectedRevision: membership.revision, role: 'root' } });
    await rejected(denied, 422, /validation|role/i);
  }, 'rest');
  await useCase('UC-PRJ-0044', async () => {
    membership = (await save(request, root + '/memberships/' + memberId, { expectedRevision: membership.revision, role: 'member' }, zSavedMembershipView)).result;
    expect(membership.role).toBe('member');
  }, 'rest');
  await useCase('UC-PRJ-0045', async () => {
    membership = (await save(request, root + '/memberships/' + memberId + '/remove', { expectedRevision: membership.revision }, zSavedMembershipView, { method: 'POST' })).result;
    expect(membership.removed).toBe(true);
    const denied = await request.get(apiOrigin + root, { headers: await authorization('member') });
    expect(denied.status()).toBe(404);
  }, 'rest');
  await useCase('UC-PRJ-0037', async () => {
    expect((await read(request, root + '/memberships', zPageMembershipView)).items.map(v => v.user.id)).not.toContain(memberId);
    const history = await read(request, root + '/memberships?includeRemoved=true', zPageMembershipView);
    expect(history.items.find(v => v.user.id === memberId)?.removed).toBe(true);
  }, 'rest');
  await useCase('UC-PRJ-0059', async () => {
    for (const endpoint of ['assignees', 'mention-candidates']) {
      const candidates = await read(request, root + '/' + endpoint, zPageUserSummary);
      expect(candidates.items.map(v => v.id)).not.toContain(memberId);
    }
  }, 'rest');
  await useCase('UC-PRJ-0046', async () => {
    membership = (await save(request, root + '/memberships/' + memberId, { expectedRevision: membership.revision, role: 'member' }, zSavedMembershipView)).result;
    expect(membership.removed).toBe(false);
    expect((await read(request, root, zProjectView, 'member')).effectiveRole).toBe('member');
  }, 'rest');
  await useCase('UC-PRJ-0049', async () => {
    const reference = crypto.randomUUID(), body = { expectedRevision: membership.revision, role: 'viewer' };
    const first = await save(request, root + '/memberships/' + memberId, body, zSavedMembershipView, { reference });
    const retry = await save(request, root + '/memberships/' + memberId, body, zSavedMembershipView, { reference });
    expect(retry.receipt.replayed).toBe(true); expect(retry.result).toEqual(first.result);
  }, 'rest');
});

test('project list live filtering and viewer navigation show current scoped controls', async ({ page, request }) => {
  const projectId = await isolatedProject(request);
  const project = await read(request, '/api/v1/projects/' + projectId, zProjectView);
  await signIn(page, 'viewer', '/projects/' + projectId, new RegExp('^' + project.name + '$'));
  await useCase('UC-PRJ-0002', async () => {
    await expect(page.getByRole('heading', { name: project.name, exact: true })).toBeVisible();
    await expect(page.locator('dl').getByText(project.key, { exact: true })).toBeVisible();
    await expect(page.locator('.description[dir=auto]')).toHaveText(project.description || 'No description yet.');
    await expect(page.locator('dl dd.role')).toHaveText('viewer');
    const navigation = page.getByRole('navigation', { name: 'Project views', exact: true });
    await expect(navigation.getByRole('link', { name: 'Board', exact: true })).toHaveAttribute('href', /^\/boards\//);
    await expect(navigation.getByRole('link', { name: 'Issues', exact: true })).toHaveAttribute('href', '/issues?projectId=' + projectId);
    await expect(navigation.getByRole('link', { name: 'Backlog', exact: true })).toHaveAttribute('href', '/backlog/' + projectId);
    await expect(navigation.getByRole('link', { name: 'Planning', exact: true })).toHaveAttribute('href', '/projects/' + projectId + '/planning');
    await expect(navigation.getByRole('link', { name: 'Reports', exact: true })).toHaveAttribute('href', '/projects/' + projectId + '/reports');
    await expect(navigation.getByRole('link', { name: 'Import & export', exact: true })).toHaveAttribute('href', '/projects/' + projectId + '/import-export');
  }, 'web');
  await useCase('UC-PRJ-0021', async () => {
    await expect(page.getByRole('main').getByRole('button', { name: 'Create issue', exact: true })).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('link', { name: 'Create issue', exact: true })).toHaveCount(0);
    await expect(page.getByRole('main').getByRole('link', { name: 'Manage project access', exact: true })).toHaveCount(0);
    const globalCreate = page.getByRole('banner').getByRole('link', { name: 'Create issue', exact: true });
    if (await globalCreate.count()) {
      const target = new URL((await globalCreate.getAttribute('href'))!, page.url()).searchParams.get('projectId');
      expect(target).not.toBe(projectId); expect(target).toBeTruthy();
      expect((await read(request, '/api/v1/projects/' + target, zProjectView, 'viewer')).effectiveRole).not.toBe('viewer');
    }
  }, 'web');
  await useCase('UC-PRJ-0001', async () => {
    await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Projects', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled();
    const ownLink = page.getByRole('main').getByRole('link', { name: project.key + ' · ' + project.name, exact: true });
    while (await ownLink.count() === 0) {
      const more = page.getByRole('button', { name: 'More projects', exact: true });
      await expect(more).toBeVisible(); await expect(more).toBeEnabled();
      const loaded = await page.locator('.project-records > li').count(); await more.click();
      await expect.poll(() => page.locator('.project-records > li').count()).toBeGreaterThan(loaded);
    }
    await expect(ownLink).toBeVisible();
    await expect(page.locator('.project-records > li').filter({ has: page.getByRole('link', { name: project.key + ' · ' + project.name, exact: true }) }).locator('.project-role')).toHaveText('viewer');
    let listed: z.infer<typeof zProjectView> | undefined, cursor: string | undefined;
    const cursors = new Set<string>();
    do {
      const list = await read(request, '/api/v1/projects?limit=100' + (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), zPageProjectView, 'viewer');
      listed = list.items.find(item => item.id === projectId); cursor = list.nextCursor ?? undefined;
      if (cursor) { expect(cursors.has(cursor)).toBe(false); cursors.add(cursor); }
    } while (!listed && cursor);
    expect(listed?.effectiveRole).toBe('viewer');
  }, 'web');
});

test('project directory search, bounded paging, archive filters and newly created recents are usable', async ({ page, request }) => {
  test.setTimeout(60_000);
  const marker = crypto.randomUUID().replaceAll('-', '').slice(0, 5).toUpperCase();
  for (let index = 0; index < 26; index++) await save(request, '/api/v1/projects', { key: 'D' + marker + String(index).padStart(2, '0'), name: '000 coverage ' + marker + ' ' + String(index).padStart(2, '0') }, zSavedProjectView, { method: 'POST', status: 201 });
  await signIn(page, 'owner', '/projects', /^Projects$/);
  await expect(page.getByRole('button', { name: 'More projects', exact: true })).toBeVisible();
  const key = 'N' + marker, name = 'مشروع بحث ' + marker, description = 'وصف عربي للمشروع 😀 ' + marker;
  const project = await useCase('UC-PRJ-0018', async () => {
    await page.getByRole('textbox', { name: 'Project key', exact: true }).fill(key);
    await page.getByRole('textbox', { name: 'Project name', exact: true }).fill(name);
    await page.getByRole('textbox', { name: 'Description', exact: true }).fill(description);
    const created = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/api/v1/projects'));
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    expect((await created).status()).toBe(201);
    const saved = zSavedProjectView.parse(await (await created).json()).result;
    expect(saved).toMatchObject({ name, description });
    const row = page.locator('.project-records > li').filter({ has: page.getByRole('link', { name: key + ' · ' + name, exact: true }) });
    await expect(row.locator('a strong bdi').last()).toHaveText(name);
    await expect(row.locator('a strong bdi').last()).toHaveCSS('direction', 'rtl');
    await expect(row.locator('.project-description[dir=auto]')).toHaveText(description);
    await expect(row.locator('.project-description[dir=auto]')).toHaveCSS('direction', 'rtl');
    return saved;
  }, 'web');
  const link = page.getByRole('link', { name: key + ' · ' + name, exact: true });
  await useCase('UC-PRJ-0019', async () => { await expect(link).toHaveCount(1); await expect(link).toBeVisible(); }, 'web');
  await useCase('UC-PRJ-0003', async () => {
    await page.getByRole('textbox', { name: 'Search loaded projects', exact: true }).fill(name);
    await expect(page.locator('.project-records > li')).toHaveCount(1); await expect(link).toBeVisible();
  }, 'web');
  await useCase('UC-PRJ-0005', async () => { await expect(page.getByText(/Showing matches among \d+ loaded projects\./)).toBeVisible(); }, 'web');
  await useCase('UC-PRJ-0004', async () => {
    await page.getByRole('textbox', { name: 'Search loaded projects', exact: true }).fill(key.toLowerCase());
    await expect(page.locator('.project-records > li')).toHaveCount(1); await expect(link).toBeVisible();
  }, 'web');
  await page.getByRole('textbox', { name: 'Search loaded projects', exact: true }).clear();
  await useCase('UC-PRJ-0006', async () => {
    const count = await page.locator('.project-records > li').count();
    await page.getByRole('button', { name: 'More projects', exact: true }).click();
    await expect.poll(() => page.locator('.project-records > li').count()).toBeGreaterThan(count);
    await expect(link).toHaveCount(1);
  }, 'web');
  await useCase('UC-PRJ-0009', async () => {
    await page.getByRole('button', { name: 'Refresh projects', exact: true }).click();
    await expect(link).toHaveCount(1); await expect(page.getByRole('button', { name: 'More projects', exact: true })).toBeVisible();
  }, 'web');
  await page.getByRole('button', { name: 'Archive ' + key, exact: true }).click();
  await expect(page.getByText('Project archived.', { exact: true })).toBeVisible();
  await useCase('UC-PRJ-0007', async () => {
    await page.getByRole('checkbox', { name: 'Include archived projects', exact: true }).check();
    await expect(link).toBeVisible(); await expect(page.getByRole('listitem').filter({ has: link })).toContainText('Archived · Read-only');
  }, 'web');
  await useCase('UC-PRJ-0008', async () => { await page.getByRole('checkbox', { name: 'Include archived projects', exact: true }).uncheck(); await expect(link).toHaveCount(0); }, 'web');
  expect((await read(request, '/api/v1/projects/' + project.id, zProjectView)).archived).toBe(true);
});

test('project overview create action opens the scoped issue form', async ({ page, request }) => {
  const id = await isolatedProject(request);
  const project = await read(request, '/api/v1/projects/' + id, zProjectView);
  await signIn(page, 'member', '/projects/' + id, new RegExp('^' + project.name + '$'));
  await useCase('UC-PRJ-0020', async () => {
    await page.getByRole('main').getByRole('link', { name: 'Create issue', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Create issue', exact: true })).toBeVisible();
    await expect(page).toHaveURL(new RegExp('projectId=' + id));
    await expect(page.getByRole('dialog', { name: 'Create issue', exact: true }).getByLabel('Issue title', { exact: true })).toBeEditable();
  }, 'web');
});

test('membership editor pages candidates, reviews conflicts and resets the selected target', async ({ page, request }) => {
  const projectId = await isolatedProject(request), root = '/api/v1/projects/' + projectId;
  for (let index = 0; index < 26; index++) await save(request, '/api/v1/admin/users', { email: 'candidate-' + crypto.randomUUID() + '@example.test', displayName: 'ZZ candidate ' + crypto.randomUUID(), administrator: false }, zSavedUserView, { method: 'POST', status: 201 });
  await signIn(page, 'owner', '/admin/projects/' + projectId + '/memberships', /^Project access$/);
  await useCase('UC-PRJ-0039', async () => {
    const users = page.getByRole('combobox', { name: 'Approved user', exact: true });
    await expect(users.locator('option')).toHaveCount(26);
    await page.getByRole('button', { name: 'More approved users', exact: true }).click();
    await expect.poll(() => users.locator('option').count()).toBeGreaterThan(26);
    while (await users.locator('option[value="' + memberId + '"]').count() === 0) {
      const count = await users.locator('option').count();
      await page.getByRole('button', { name: 'More approved users', exact: true }).click();
      await expect.poll(() => users.locator('option').count()).toBeGreaterThan(count);
    }
    await expect(users.locator('option[value="' + memberId + '"]')).toHaveCount(1);
  }, 'web');
  await page.getByRole('button', { name: 'Change access for مطور تجريبي', exact: true }).click();
  await page.getByRole('combobox', { name: 'Project role', exact: true }).selectOption('project_admin');
  await useCase('UC-PRJ-0054', async () => {
    await page.getByRole('combobox', { name: 'Approved user', exact: true }).selectOption(viewerId);
    await expect(page.getByRole('combobox', { name: 'Approved user', exact: true })).toHaveValue(viewerId);
    await page.getByRole('combobox', { name: 'Project role', exact: true }).selectOption('member');
    const response = page.waitForResponse(reply => reply.url().endsWith('/memberships/' + viewerId) && reply.request().method() === 'PUT');
    await page.getByRole('button', { name: 'Save membership', exact: true }).click();
    expect(zSavedMembershipView.parse(await (await response).json()).result.role).toBe('member');
  }, 'web');
  await page.getByRole('button', { name: 'Change access for مطور تجريبي', exact: true }).click();
  const membership = (await read(request, root + '/memberships', zPageMembershipView)).items.find(item => item.user.id === memberId)!;
  const changed = (await save(request, root + '/memberships/' + memberId, { expectedRevision: membership.revision, role: 'viewer' }, zSavedMembershipView)).result;
  await useCase('UC-PRJ-0048', async () => {
    await page.getByRole('combobox', { name: 'Project role', exact: true }).selectOption('project_admin');
    await page.getByRole('button', { name: 'Save membership', exact: true }).click();
    await expect(page.getByText('Current access: viewer · active.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Review current membership', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Project role', exact: true })).toHaveValue('viewer');
    await expect(page.getByText('Current access: viewer · active.', { exact: true })).toHaveCount(0);
    expect((await read(request, root + '/memberships', zPageMembershipView)).items.find(item => item.user.id === memberId)?.revision).toBe(changed.revision);
  }, 'web');
  await useCase('UC-PRJ-0010', async () => {
    await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Projects', exact: true }).click();
    await page.getByRole('textbox', { name: 'Search loaded projects', exact: true }).fill('no-project-' + crypto.randomUUID());
    await expect(page.getByRole('heading', { name: 'No projects to show', exact: true })).toBeVisible();
  }, 'web');
  await useCase('UC-PRJ-0053', async () => {
    const secondId = await isolatedProject(request);
    await page.getByRole('textbox', { name: 'Search loaded projects', exact: true }).clear();
    await expect(page.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled();
    const refreshed = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === '/api/v1/projects' && !new URL(response.url()).searchParams.has('cursor'));
    await page.getByRole('button', { name: 'Refresh projects', exact: true }).click();
    expect((await refreshed).status()).toBe(200);
    await expect(page.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled();
    const link = page.getByRole('main').locator('a[href="/projects/' + secondId + '"]');
    for (let attempts = 0; attempts < 20 && await link.count() === 0; attempts++) {
      const previous = await page.locator('.project-records > li').count();
      await page.getByRole('button', { name: 'More projects', exact: true }).click();
      await expect.poll(() => page.locator('.project-records > li').count()).toBeGreaterThan(previous);
      await expect(page.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled();
    }
    await expect(link).toBeVisible(); await link.click();
    await page.getByRole('link', { name: 'Manage project access', exact: true }).click();
    await expect(page).toHaveURL(new RegExp('/admin/projects/' + secondId + '/memberships$'));
    await expect(page.getByRole('combobox', { name: 'Approved user', exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Review current membership', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Change access for مطور تجريبي', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Project role', exact: true })).toHaveValue('member');
    expect((await read(request, '/api/v1/projects/' + secondId + '/memberships', zPageMembershipView)).items.find(item => item.user.id === memberId)?.revision).toBe('1');
  }, 'web');
});

test('archived membership writes distinguish company administration from project configuration', async ({ request }) => {
  const projectId = await isolatedProject(request), root = '/api/v1/projects/' + projectId;
  await save(request, root + '/memberships/' + memberId, { expectedRevision: '1', role: 'project_admin' }, zSavedMembershipView);
  const project = await read(request, root, zProjectView);
  await save(request, root + '/archive', { expectedRevision: project.revision }, zSavedProjectView, { method: 'POST' });
  await useCase('UC-PRJ-0063', async () => {
    for (const removal of [false, true]) {
      const response = await request.fetch(apiOrigin + root + '/memberships/' + viewerId + (removal ? '/remove' : ''), { method: removal ? 'POST' : 'PUT', headers: await authorization('member'), data: { expectedRevision: '1', ...(removal ? {} : { role: 'member' }) } });
      await rejected(response, 403, /Archived projects are read.only/i);
    }
  }, 'rest');
  await useCase('UC-PRJ-0055', async () => {
    const saved = await save(request, root + '/memberships/' + viewerId, { expectedRevision: '1', role: 'member' }, zSavedMembershipView);
    expect(saved.result.role).toBe('member');
    const removed = await save(request, root + '/memberships/' + viewerId + '/remove', { expectedRevision: saved.result.revision }, zSavedMembershipView, { method: 'POST' });
    expect(removed.result.removed).toBe(true);
  }, 'rest');
  await useCase('UC-PRJ-0050', async () => {
    const unrelated = '/api/v1/projects/' + crypto.randomUUID() + '/memberships';
    expect((await request.get(apiOrigin + unrelated, { headers: await authorization('member') })).status()).toBe(404);
    expect((await request.put(apiOrigin + unrelated + '/' + viewerId, { headers: await authorization('member'), data: { expectedRevision: '0', role: 'member' } })).status()).toBe(404);
  }, 'rest');
});

test('taxonomy API lifecycle preserves exact ordering and rejects invalid immutable configuration', async ({ request }) => {
  const projectId = await isolatedProject(request), root = '/api/v2/projects/' + projectId;
  let config = await read(request, root + '/configuration', zConfigurationView);
  await useCase('UC-CFG-0001', async () => { expect(config.projectId).toBe(projectId); expect(config.canManage).toBe(true); }, 'rest');
  const typeId = crypto.randomUUID();
  let type = (await save(request, root + '/issue-types/' + typeId, { expectedRevision: config.revision, key: 'story', name: 'قصة الفريق', behavior: 'standard', retired: false }, zSavedTypeSaved, { status: 201 })).result;
  config = type.configuration;
  await useCase('UC-CFG-0006', async () => { expect(type.type.id).toBe(typeId); expect(type.type.behavior).toBe('standard'); }, 'rest');
  await useCase('UC-CFG-0018', async () => { expect(type.type.name).toBe('قصة الفريق'); }, 'rest');
  await useCase('UC-CFG-0008', async () => {
    type = (await save(request, root + '/issue-types/' + typeId, { expectedRevision: config.revision, key: 'story', name: 'Story revised', behavior: 'standard', retired: false }, zSavedTypeSaved)).result;
    config = type.configuration; expect(type.type.name).toBe('Story revised');
  }, 'rest');
  await useCase('UC-CFG-0014', async () => {
    const response = await request.put(apiOrigin + root + '/issue-types/' + typeId, { headers: await authorization(), data: { expectedRevision: config.revision, key: 'new_key', name: 'Story revised', behavior: 'standard', retired: false } });
    await rejected(response, 422, /stable key/i);
  }, 'rest');
  for (const [id, patch] of [['UC-CFG-0016', { key: 'Bad-key' }], ['UC-CFG-0017', { name: 'x'.repeat(61) }]] as const) {
    await useCase(id, async () => {
      const response = await request.put(apiOrigin + root + '/issue-types/' + crypto.randomUUID(), { headers: await authorization(), data: { expectedRevision: config.revision, key: 'valid', name: 'Valid', behavior: 'standard', retired: false, ...patch } });
      await rejected(response, 422, /key|name|validation/i);
    }, 'rest');
  }
  await useCase('UC-CFG-0009', async () => {
    type = (await save(request, root + '/issue-types/' + typeId, { expectedRevision: config.revision, key: 'story', name: 'Story revised', behavior: 'standard', retired: true }, zSavedTypeSaved)).result;
    config = type.configuration; expect(type.type.retired).toBe(true);
    expect((await read(request, root + '/issue-types', zPageTypeView)).items.map(v => v.id)).not.toContain(typeId);
  }, 'rest');
  await useCase('UC-CFG-0003', async () => { expect((await read(request, root + '/issue-types?includeRetired=true', zPageTypeView)).items.find(v => v.id === typeId)?.retired).toBe(true); }, 'rest');
  await useCase('UC-CFG-0013', async () => {
    type = (await save(request, root + '/issue-types/' + typeId, { expectedRevision: config.revision, key: 'story', name: 'Story revised', behavior: 'standard', retired: false }, zSavedTypeSaved)).result;
    config = type.configuration; expect(type.type.retired).toBe(false);
  }, 'rest');
  await useCase('UC-CFG-0007', async () => {
    const subtask = await save(request, root + '/issue-types/' + crypto.randomUUID(), { expectedRevision: config.revision, key: 'child', name: 'Child task', behavior: 'subtask', retired: false }, zSavedTypeSaved, { status: 201 });
    config = subtask.result.configuration; expect(subtask.result.type.behavior).toBe('subtask');
  }, 'rest');
  for (const [id, endpoint, schema] of [['UC-CFG-0002', 'issue-types', zPageTypeView], ['UC-CFG-0004', 'priorities', zPagePriorityView]] as const) {
    await useCase(id, async () => {
      const first = await read(request, root + '/' + endpoint + '?limit=1', schema);
      expect(first.items).toHaveLength(1); expect(first.nextCursor).toBeTruthy();
      const next = await read(request, root + '/' + endpoint + '?limit=1&cursor=' + encodeURIComponent(first.nextCursor!), schema);
      expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
    }, 'rest');
  }
  const priorityId = crypto.randomUUID();
  let priority = (await save(request, root + '/priorities/' + priorityId, { expectedRevision: config.revision, key: 'urgent', name: 'Urgent', sortOrder: '9007199254740993', retired: false }, zSavedPrioritySaved, { status: 201 })).result;
  config = priority.configuration;
  await useCase('UC-CFG-0019', async () => { expect(priority.priority.id).toBe(priorityId); expect(priority.priority.name).toBe('Urgent'); }, 'rest');
  await useCase('UC-CFG-0021', async () => { expect(priority.priority.sortOrder).toBe('9007199254740993'); }, 'rest');
  await useCase('UC-CFG-0020', async () => {
    priority = (await save(request, root + '/priorities/' + priorityId, { expectedRevision: config.revision, key: 'urgent', name: 'Very urgent', sortOrder: '9007199254740995', retired: false }, zSavedPrioritySaved)).result;
    config = priority.configuration; expect(priority.priority.name).toBe('Very urgent');
  }, 'rest');
  await useCase('UC-CFG-0022', async () => {
    const response = await request.put(apiOrigin + root + '/priorities/' + priorityId, { headers: await authorization(), data: { expectedRevision: config.revision, key: 'urgent', name: 'Very urgent', sortOrder: '0', retired: false } });
    await rejected(response, 422, /order|position|validation/i);
  }, 'rest');
  await useCase('UC-CFG-0023', async () => {
    const response = await request.put(apiOrigin + root + '/priorities/' + priorityId, { headers: await authorization(), data: { expectedRevision: config.revision, key: 'renamed', name: 'Very urgent', sortOrder: '4', retired: false } });
    await rejected(response, 422, /stable key/i);
  }, 'rest');
  await useCase('UC-CFG-0024', async () => {
    priority = (await save(request, root + '/priorities/' + priorityId, { expectedRevision: config.revision, key: 'urgent', name: 'Very urgent', sortOrder: '9007199254740995', retired: true }, zSavedPrioritySaved)).result;
    config = priority.configuration; expect(priority.priority.retired).toBe(true);
    expect((await read(request, root + '/priorities', zPagePriorityView)).items.map(v => v.id)).not.toContain(priorityId);
  }, 'rest');
  await useCase('UC-CFG-0005', async () => { expect((await read(request, root + '/priorities?includeRetired=true', zPagePriorityView)).items.find(v => v.id === priorityId)?.retired).toBe(true); }, 'rest');
  await useCase('UC-CFG-0027', async () => {
    priority = (await save(request, root + '/priorities/' + priorityId, { expectedRevision: config.revision, key: 'urgent', name: 'Very urgent', sortOrder: '9007199254740995', retired: false }, zSavedPrioritySaved)).result;
    config = priority.configuration; expect(priority.priority.retired).toBe(false);
  }, 'rest');
  await useCase('UC-CFG-0075', async () => {
    const response = await request.put(apiOrigin + root + '/priorities/' + crypto.randomUUID(), { headers: await authorization('viewer'), data: { expectedRevision: config.revision, key: 'forbidden', name: 'Forbidden', sortOrder: '5', retired: false } });
    await rejected(response, 403, /permission|access|forbidden|reading only/i);
  }, 'rest');
});

test('typed-field definitions, choices and defaults are validated independently through PostgreSQL', async ({ request }) => {
  const projectId = await isolatedProject(request), root = '/api/v2/projects/' + projectId;
  let config = await read(request, root + '/configuration', zConfigurationView);
  const ids = new Map<string, string>();
  for (const [caseId, kind] of [
    ['UC-CFG-0033', 'text'], ['UC-CFG-0034', 'number'], ['UC-CFG-0035', 'date'],
    ['UC-CFG-0036', 'choice'], ['UC-CFG-0037', 'user'],
  ] as const) {
    await useCase(caseId, async () => {
      const id = crypto.randomUUID(); ids.set(kind, id);
      const saved = await save(request, root + '/fields/' + id, { expectedRevision: config.revision, key: 'field_' + kind, name: 'Field ' + kind, kind, required: false, retired: false, defaultValue: null }, zSavedFieldSaved, { status: 201 });
      config = saved.result.configuration;
      expect(saved.result.field.kind).toBe(kind); expect(saved.result.field.id).toBe(id);
      expect(saved.result.field.defaultValue).toBeNull();
    }, 'rest');
  }
  await useCase('UC-CFG-0031', async () => {
    const list = await read(request, root + '/fields', zPageFieldDefinition);
    expect(list.items.map(v => v.id).sort()).toEqual([...ids.values()].sort());
  }, 'rest');
  await useCase('UC-CFG-0032', async () => {
    const first = await read(request, root + '/fields?limit=2', zPageFieldDefinition);
    expect(first.items).toHaveLength(2); expect(first.nextCursor).toBeTruthy();
    const second = await read(request, root + '/fields?limit=2&cursor=' + encodeURIComponent(first.nextCursor!), zPageFieldDefinition);
    expect(second.items).toHaveLength(2);
    expect(second.items.every(v => !first.items.some(a => a.id === v.id))).toBe(true);
  }, 'rest');
  const textId = ids.get('text')!, numberId = ids.get('number')!, choiceId = ids.get('choice')!;
  const text = { key: 'field_text', name: 'Field text', kind: 'text', required: false, retired: false, defaultValue: null };
  await useCase('UC-CFG-0038', async () => {
    const saved = await save(request, root + '/fields/' + textId, { ...text, name: 'نص محدث', expectedRevision: config.revision }, zSavedFieldSaved);
    config = saved.result.configuration; expect(saved.result.field.name).toBe('نص محدث');
  }, 'rest');
  text.name = 'نص محدث';
  await useCase('UC-CFG-0039', async () => {
    const saved = await save(request, root + '/fields/' + textId, { ...text, expectedRevision: config.revision, defaultValue: { kind: 'text', text: 'قيمة افتراضية' } }, zSavedFieldSaved);
    config = saved.result.configuration; expect(saved.result.field.defaultValue).toEqual({ kind: 'text', text: 'قيمة افتراضية' });
  }, 'rest');
  await useCase('UC-CFG-0068', async () => {
    await rejected(await request.post(apiOrigin + root + '/fields/' + textId + '/backfill', { headers: await authorization(), data: { expectedRevision: config.revision, limit: 1 } }), 422, /native issue model/i);
  }, 'rest');
  await useCase('UC-CFG-0040', async () => {
    const saved = await save(request, root + '/fields/' + textId, { ...text, expectedRevision: config.revision }, zSavedFieldSaved);
    config = saved.result.configuration; expect(saved.result.field.defaultValue).toBeNull();
  }, 'rest');
  for (const [caseId, fieldId, patch, message] of [
    ['UC-CFG-0041', textId, { key: 'rename' }, /stable key/i],
    ['UC-CFG-0044', textId, { defaultValue: { kind: 'number', number: '2' } }, /kind/i],
    ['UC-CFG-0047', textId, { required: true, defaultValue: { kind: 'text', text: '   ' } }, /content/i],
    ['UC-CFG-0048', textId, { required: true }, /native/i],
  ] as const) {
    await useCase(caseId, async () => {
      const response = await request.put(apiOrigin + root + '/fields/' + fieldId, { headers: await authorization(), data: { ...text, expectedRevision: config.revision, ...patch } });
      await rejected(response, 422, message);
    }, 'rest');
  }
  await useCase('UC-CFG-0042', async () => {
    const saved = await save(request, root + '/fields/' + numberId, { expectedRevision: config.revision, key: 'field_number', name: 'Field number', kind: 'date', required: false, retired: false, defaultValue: null }, zSavedFieldSaved);
    config = saved.result.configuration; expect(saved.result.field.kind).toBe('date');
  }, 'rest');
  const optionId = crypto.randomUUID(), secondOption = crypto.randomUUID();
  await useCase('UC-CFG-0057', async () => {
    const saved = await save(request, root + '/fields/' + choiceId + '/options/' + optionId, { expectedRevision: config.revision, name: 'الخيار الأول', position: '9007199254740993', retired: false }, zSavedFieldOptionSaved, { status: 201 });
    config = saved.result.configuration; expect(saved.result.option.name).toBe('الخيار الأول'); expect(saved.result.option.fieldId).toBe(choiceId);
  }, 'rest');
  await useCase('UC-CFG-0058', async () => {
    const saved = await save(request, root + '/fields/' + choiceId + '/options/' + optionId, { expectedRevision: config.revision, name: 'الخيار المعدل', position: '9007199254740993', retired: false }, zSavedFieldOptionSaved);
    config = saved.result.configuration; expect(saved.result.option.name).toBe('الخيار المعدل');
  }, 'rest');
  await useCase('UC-CFG-0059', async () => {
    const saved = await save(request, root + '/fields/' + choiceId + '/options/' + optionId, { expectedRevision: config.revision, name: 'الخيار المعدل', position: '9007199254740995', retired: false }, zSavedFieldOptionSaved);
    config = saved.result.configuration; expect(saved.result.option.position).toBe('9007199254740995');
  }, 'rest');
  const extra = await save(request, root + '/fields/' + choiceId + '/options/' + secondOption, { expectedRevision: config.revision, name: 'Another option', position: '9007199254740997', retired: false }, zSavedFieldOptionSaved, { status: 201 });
  config = extra.result.configuration;
  await useCase('UC-CFG-0055', async () => {
    const list = await read(request, root + '/fields/' + choiceId + '/options', zPageFieldOptionView);
    expect(list.items.map(v => v.id)).toEqual([optionId, secondOption]);
  }, 'rest');
  await useCase('UC-CFG-0056', async () => {
    const first = await read(request, root + '/fields/' + choiceId + '/options?limit=1', zPageFieldOptionView);
    expect(first.items[0]?.id).toBe(optionId); expect(first.nextCursor).toBeTruthy();
    const next = await read(request, root + '/fields/' + choiceId + '/options?limit=1&cursor=' + encodeURIComponent(first.nextCursor!), zPageFieldOptionView);
    expect(next.items[0]?.id).toBe(secondOption);
  }, 'rest');
  await useCase('UC-CFG-0043', async () => {
    const response = await request.put(apiOrigin + root + '/fields/' + choiceId, { headers: await authorization(), data: { expectedRevision: config.revision, key: 'field_choice', name: 'Field choice', kind: 'text', required: false, retired: false, defaultValue: null } });
    await rejected(response, 422, /value kind/i);
  }, 'rest');
  await useCase('UC-CFG-0061', async () => {
    const field = { key: 'field_choice', name: 'Field choice', kind: 'choice', required: false, retired: false };
    config = (await save(request, root + '/fields/' + choiceId, { ...field, expectedRevision: config.revision, defaultValue: { kind: 'choice', optionId } }, zSavedFieldSaved)).result.configuration;
    await rejected(await request.put(apiOrigin + root + '/fields/' + choiceId + '/options/' + optionId, { headers: await authorization(), data: { expectedRevision: config.revision, name: 'الخيار المعدل', position: '9007199254740995', retired: true } }), 422, /default option/i);
    expect((await read(request, root + '/fields/' + choiceId + '/options', zPageFieldOptionView)).items.find(option => option.id === optionId)?.retired).toBe(false);
    config = (await save(request, root + '/fields/' + choiceId, { ...field, expectedRevision: config.revision, defaultValue: null }, zSavedFieldSaved)).result.configuration;
  }, 'rest');
  await useCase('UC-CFG-0060', async () => {
    const saved = await save(request, root + '/fields/' + choiceId + '/options/' + optionId, { expectedRevision: config.revision, name: 'الخيار المعدل', position: '9007199254740995', retired: true }, zSavedFieldOptionSaved);
    config = saved.result.configuration; expect(saved.result.option.retired).toBe(true);
    expect((await read(request, root + '/fields/' + choiceId + '/options', zPageFieldOptionView)).items.map(v => v.id)).not.toContain(optionId);
  }, 'rest');
  await useCase('UC-CFG-0045', async () => {
    const response = await request.put(apiOrigin + root + '/fields/' + choiceId, { headers: await authorization(), data: { expectedRevision: config.revision, key: 'field_choice', name: 'Field choice', kind: 'choice', required: false, retired: false, defaultValue: { kind: 'choice', optionId } } });
    await rejected(response, 422, /active option/i);
  }, 'rest');
  await useCase('UC-CFG-0062', async () => {
    const saved = await save(request, root + '/fields/' + choiceId + '/options/' + optionId, { expectedRevision: config.revision, name: 'الخيار المعدل', position: '9007199254740995', retired: false }, zSavedFieldOptionSaved);
    config = saved.result.configuration; expect(saved.result.option.retired).toBe(false);
  }, 'rest');
  await useCase('UC-CFG-0063', async () => {
    const response = await request.put(apiOrigin + root + '/fields/' + textId + '/options/' + crypto.randomUUID(), { headers: await authorization(), data: { expectedRevision: config.revision, name: 'Invalid option', position: '1', retired: false } });
    await rejected(response, 422, /choice/i);
  }, 'rest');
  await useCase('UC-CFG-0064', async () => {
    const response = await request.put(apiOrigin + root + '/fields/' + choiceId + '/options/' + crypto.randomUUID(), { headers: await authorization(), data: { expectedRevision: config.revision, name: '', position: '0', retired: false } });
    await rejected(response, 422, /validation|name|position/i);
  }, 'rest');
  await useCase('UC-CFG-0046', async () => {
    await save(request, '/api/v1/projects/' + projectId + '/memberships/' + viewerId + '/remove', { expectedRevision: '1' }, zSavedMembershipView, { method: 'POST' });
    const response = await request.put(apiOrigin + root + '/fields/' + ids.get('user'), { headers: await authorization(), data: { expectedRevision: config.revision, key: 'field_user', name: 'Field user', kind: 'user', required: false, retired: false, defaultValue: { kind: 'user', userId: viewerId } } });
    await rejected(response, 422, /active project member|administrator/i);
  }, 'rest');
  await useCase('UC-CFG-0054', async () => {
    const saved = await save(request, root + '/fields/' + textId, { ...text, expectedRevision: config.revision, retired: true }, zSavedFieldSaved);
    config = saved.result.configuration; expect(saved.result.field.retired).toBe(true);
    expect((await read(request, root + '/fields', zPageFieldDefinition)).items.map(v => v.id)).not.toContain(textId);
  }, 'rest');
});

test('activation uses an explicit unchanged readiness snapshot before enabling current defaults', async ({ request }) => {
  const projectId = await isolatedProject(request), root = '/api/v2/projects/' + projectId;
  let readiness = await read(request, root + '/configuration/activation', zActivationReadiness);
  await useCase('UC-CFG-0076', async () => {
    expect(readiness.configuration.mode).toBe('legacy'); expect(readiness.ready).toBe(true);
    expect(readiness.defaultBoardId).toMatch(/^[a-f0-9-]{36}$/); expect(readiness.problems).toEqual([]);
  }, 'rest');
  const body = { expectedRevision: readiness.configuration.revision, expectedProjectRevision: readiness.projectRevision, expectedBoardId: readiness.defaultBoardId, expectedBoardRevision: readiness.defaultBoardRevision, confirm: true };
  await useCase('UC-CFG-0030', async () => {
    const priorities = await read(request, root + '/priorities', zPagePriorityView);
    const differentPriority = priorities.items.find(v => v.id !== readiness.configuration.defaults.priorityId)!;
    const response = await request.put(apiOrigin + root + '/configuration/defaults', { headers: await authorization(), data: { expectedRevision: readiness.configuration.revision, defaults: { ...readiness.configuration.defaults, priorityId: differentPriority.id } } });
    await rejected(response, 422, /modern issue access/i);
  }, 'rest');
  await useCase('UC-CFG-0085', async () => {
    const response = await request.post(apiOrigin + root + '/configuration/activation', { headers: await authorization(), data: { ...body, confirm: false } });
    await rejected(response, 422, /confirm/i);
  }, 'rest');
  await useCase('UC-CFG-0086', async () => {
    const response = await request.post(apiOrigin + root + '/configuration/activation', { headers: await authorization(), data: { ...body, expectedProjectRevision: '9999' } });
    expect(response.status()).toBe(409);
    expect((await read(request, root + '/configuration', zConfigurationView)).mode).toBe('legacy');
  }, 'rest');
  await useCase('UC-CFG-0084', async () => {
    const saved = await save(request, root + '/configuration/activation', body, zSavedConfigurationView, { method: 'POST' });
    expect(saved.result.mode).toBe('modern'); expect(saved.receipt.eventId).toBeTruthy();
  }, 'rest');
  readiness = await read(request, root + '/configuration/activation', zActivationReadiness);
  await useCase('UC-CFG-0088', async () => {
    const saved = await save(request, root + '/configuration/activation', { ...body, expectedRevision: readiness.configuration.revision, expectedProjectRevision: readiness.projectRevision, expectedBoardRevision: readiness.defaultBoardRevision }, zSavedConfigurationView, { method: 'POST' });
    expect(saved.result.mode).toBe('modern'); expect(saved.result.revision).toBe(readiness.configuration.revision); expect(saved.receipt.eventId).toBeNull();
  }, 'rest');
  await useCase('UC-CFG-0028', async () => {
    const priorities = await read(request, root + '/priorities', zPagePriorityView);
    const replacement = priorities.items.find(v => !v.default)!;
    const saved = await save(request, root + '/configuration/defaults', { expectedRevision: readiness.configuration.revision, defaults: { ...readiness.configuration.defaults, priorityId: replacement.id } }, zSavedConfigurationView);
    expect(saved.result.defaults.priorityId).toBe(replacement.id);
  }, 'rest');
});

test('required fields must backfill current issues before enforcement and cannot retire while required', async ({ request }) => {
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  const root = '/api/v2/projects/' + projectId;
  const issueIds: string[] = [];
  for (let n = 0; n < 3; n++) issueIds.push((await save(request, root + '/issues', { title: 'Backfill target ' + n }, zSavedModernIssueView, { method: 'POST', status: 201 })).result.summary.id);
  let config = await read(request, root + '/configuration', zConfigurationView);
  const fieldId = crypto.randomUUID(), field = { key: 'readiness', name: 'Readiness evidence', kind: 'text', required: false, retired: false, defaultValue: { kind: 'text', text: 'مطلوب التحقق' } };
  config = (await save(request, root + '/fields/' + fieldId, { ...field, expectedRevision: config.revision }, zSavedFieldSaved, { status: 201 })).result.configuration;
  await useCase('UC-CFG-0049', async () => {
    await rejected(await request.put(apiOrigin + root + '/fields/' + fieldId, { headers: await authorization(), data: { ...field, expectedRevision: config.revision, required: true } }), 422, /backfill/i);
  }, 'rest');
  await useCase('UC-CFG-0067', async () => {
    for (const limit of [0, 101]) await rejected(await request.post(apiOrigin + root + '/fields/' + fieldId + '/backfill', { headers: await authorization(), data: { expectedRevision: config.revision, limit } }), 422, /validation|limit/i);
  }, 'rest');
  await useCase('UC-CFG-0065', async () => {
    const batch = await save(request, root + '/fields/' + fieldId + '/backfill', { expectedRevision: config.revision, limit: 1 }, zSavedBackfillFieldResult, { method: 'POST' });
    config = batch.result.configuration; expect(batch.result.changed).toBe(1); expect(batch.result.remaining).toBe(2n);
  }, 'rest');
  await useCase('UC-CFG-0066', async () => {
    let remaining = 2n;
    while (remaining > 0n) {
      const batch = await save(request, root + '/fields/' + fieldId + '/backfill', { expectedRevision: config.revision, limit: 1 }, zSavedBackfillFieldResult, { method: 'POST' });
      config = batch.result.configuration; expect(batch.result.changed).toBe(1); expect(batch.result.remaining).toBe(remaining - 1n); remaining = batch.result.remaining;
    }
    for (const issueId of issueIds) expect((await read(request, '/api/v2/issues/' + issueId + '/custom-fields', zCustomFieldsView, 'member')).values.find(v => v.fieldId === fieldId)?.value).toEqual(field.defaultValue);
  }, 'rest');
  await useCase('UC-CFG-0050', async () => {
    const saved = await save(request, root + '/fields/' + fieldId, { ...field, expectedRevision: config.revision, required: true }, zSavedFieldSaved);
    config = saved.result.configuration; expect(saved.result.field.required).toBe(true);
  }, 'rest');
  await useCase('UC-CFG-0052', async () => {
    await rejected(await request.put(apiOrigin + root + '/fields/' + fieldId, { headers: await authorization(), data: { ...field, expectedRevision: config.revision, required: true, retired: true } }), 422, /requirement|retire|valid field/i);
  }, 'rest');
  await useCase('UC-CFG-0051', async () => {
    const saved = await save(request, root + '/fields/' + fieldId, { ...field, expectedRevision: config.revision, required: false }, zSavedFieldSaved);
    config = saved.result.configuration; expect(saved.result.field.required).toBe(false);
  }, 'rest');
  await useCase('UC-CFG-0069', async () => {
    const response = await request.put(apiOrigin + root + '/fields/' + fieldId, { headers: await authorization(), data: { ...field, expectedRevision: '1' } });
    expect(response.status()).toBe(409); expect(zConfigurationView.parse((await response.json()).current).revision).toBe(config.revision);
  }, 'rest');
});

test('default taxonomy retirement requires eligible matching replacements and keeps used behavior stable', async ({ request }) => {
  const projectId = await isolatedProject(request); await useModernIssues(projectId);
  const root = '/api/v2/projects/' + projectId;
  const issue = (await save(request, root + '/issues', { title: 'Retained typed issue' }, zSavedModernIssueView, { method: 'POST', status: 201 })).result;
  let config = await read(request, root + '/configuration', zConfigurationView);
  const types = await read(request, root + '/issue-types', zPageTypeView), priorities = await read(request, root + '/priorities', zPagePriorityView);
  const standard = types.items.find(v => v.id === config.defaults.standardTypeId)!, priority = priorities.items.find(v => v.id === config.defaults.priorityId)!;
  const typeBody = { expectedRevision: config.revision, key: standard.key, name: standard.name, behavior: standard.behavior, retired: true };
  await useCase('UC-CFG-0011', async () => { await rejected(await request.put(apiOrigin + root + '/issue-types/' + standard.id, { headers: await authorization(), data: typeBody }), 422, /replacement/i); }, 'rest');
  await useCase('UC-CFG-0012', async () => { await rejected(await request.put(apiOrigin + root + '/issue-types/' + standard.id, { headers: await authorization(), data: { ...typeBody, replacementDefaultId: config.defaults.subtaskTypeId } }), 422, /behavior|matching/i); }, 'rest');
  await useCase('UC-CFG-0015', async () => { await rejected(await request.put(apiOrigin + root + '/issue-types/' + standard.id, { headers: await authorization(), data: { ...typeBody, retired: false, behavior: 'subtask' } }), 422, /behavior/i); }, 'rest');
  await useCase('UC-CFG-0026', async () => { await rejected(await request.put(apiOrigin + root + '/priorities/' + priority.id, { headers: await authorization(), data: { expectedRevision: config.revision, key: priority.key, name: priority.name, sortOrder: priority.sortOrder, retired: true } }), 422, /replacement/i); }, 'rest');
  const replacementId = crypto.randomUUID();
  config = (await save(request, root + '/issue-types/' + replacementId, { expectedRevision: config.revision, key: 'replacement', name: 'Replacement standard', behavior: 'standard', retired: false }, zSavedTypeSaved, { status: 201 })).result.configuration;
  const binding = (await read(request, root + '/issue-types/' + standard.id + '/workflows', zPageBindingView)).items.find(v => v.default)!;
  config = (await save(request, root + '/issue-types/' + replacementId + '/workflows/' + binding.workflowId, { expectedRevision: config.revision, default: true, acceptsNew: true }, zSavedConfigurationView)).result;
  await useCase('UC-CFG-0010', async () => {
    const saved = await save(request, root + '/issue-types/' + standard.id, { ...typeBody, expectedRevision: config.revision, replacementDefaultId: replacementId }, zSavedTypeSaved);
    config = saved.result.configuration; expect(saved.result.type.retired).toBe(true); expect(config.defaults.standardTypeId).toBe(replacementId);
    expect((await read(request, '/api/v2/issues/' + issue.summary.id, zModernIssueView, 'member')).summary.type.id).toBe(standard.id);
  }, 'rest');
  await useCase('UC-CFG-0025', async () => {
    const replacement = priorities.items.find(v => !v.default)!;
    const saved = await save(request, root + '/priorities/' + priority.id, { expectedRevision: config.revision, key: priority.key, name: priority.name, sortOrder: priority.sortOrder, retired: true, replacementDefaultId: replacement.id }, zSavedPrioritySaved);
    config = saved.result.configuration; expect(config.defaults.priorityId).toBe(replacement.id); expect(saved.result.priority.retired).toBe(true);
  }, 'rest');
  await useCase('UC-CFG-0029', async () => {
    await rejected(await request.put(apiOrigin + root + '/configuration/defaults', { headers: await authorization(), data: { expectedRevision: config.revision, defaults: { ...config.defaults, priorityId: priority.id } } }), 422, /active priority/i);
  }, 'rest');
});
