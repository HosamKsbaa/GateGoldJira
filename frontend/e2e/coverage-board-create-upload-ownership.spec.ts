import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { localFixturesAvailable, signIn } from './support/session';
import { LocalAuthServer, signInOnLocalServer } from './support/isolated-local-identity';
import { coverageBoard, coverageGet, coverageProject, coverageWrite } from './support/coverage-boards';
import { zPageAssetView, zPageModernIssueSummary, zSavedMembershipView, zSavedModernIssueView, zSavedUserView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires isolated real Go/PostgreSQL company identities.');
// Native authorization and draft ownership are proved against the real service.
for (const host of ['board', 'issues'] as const) test(`native ${host} create upload forbidden after writer revocation clears the old draft and sends no later upload commands`, async ({ page, request }) => {
  await useCase('UC-ISS-0202', async () => {
  const projectId = await coverageProject(request), board = await coverageBoard(request, projectId, 'Native upload ownership');
  const title = 'Private queued creation ' + crypto.randomUUID().slice(0, 8), memberId = '10000000-0000-4000-8000-000000000002';
  await signIn(page, 'member', host === 'board' ? '/boards/' + board.board.id : '/issues?projectId=' + projectId, host === 'board' ? /^Native upload ownership$/ : /^Issues$/);
  const timeOrigin = await page.evaluate(() => performance.timeOrigin);
  await page.getByRole('button', { name: host === 'board' ? 'Create issue' : 'New issue', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
  await dialog.getByLabel('Issue title', { exact: true }).fill(title);
  await dialog.getByLabel('Description attachments', { exact: true }).setInputFiles({ name: 'previous-writer-private.txt', mimeType: 'text/plain', buffer: Buffer.from('Previous writer private attachment') });
  await expect(dialog.getByRole('list', { name: 'Queued attachments', exact: true })).toContainText('previous-writer-private.txt');
  const created = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === `/api/v2/projects/${projectId}/issues`);
  let held!: () => void, release!: () => void, finished!: () => void;
  const intercepted = new Promise<void>(resolve => { held = resolve; }), gate = new Promise<void>(resolve => { release = resolve; }), completed = new Promise<void>(resolve => { finished = resolve; });
  const operations: string[] = [];
  let deniedStatus = 0, deniedCode = '';
  page.on('request', outgoing => {
    const path = new URL(outgoing.url()).pathname;
    if (path.includes('/asset-uploads')) operations.push(outgoing.method() + ' ' + path);
  });
  await page.route('**/api/v1/issues/*/asset-uploads', async route => {
    held();
    try {
      await gate;
      const response = await route.fetch(); deniedStatus = response.status();
      const body: unknown = await response.json();
      if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'object' && body.error !== null && 'code' in body.error && typeof body.error.code === 'string') deniedCode = body.error.code;
      await route.fulfill({ response });
    } finally { finished(); }
  });
  await dialog.getByRole('button', { name: 'Create issue', exact: true }).click();
  const accepted = await created; expect(accepted.status()).toBe(201); const issue = zSavedModernIssueView.parse(await accepted.json()).result;
  await intercepted;
  await coverageWrite(request, 'PUT', `/api/v1/projects/${projectId}/memberships/${memberId}`, { expectedRevision: '1', role: 'viewer' }, zSavedMembershipView);
  try { release(); await completed; } finally { release(); }
  expect(deniedStatus).toBe(403); expect(deniedCode).toBe('forbidden');
  await expect(dialog).not.toBeVisible();
  if (host === 'board') await expect(page.getByText(/^Read-only board/)).toBeVisible();
  else {
    await expect(page.getByRole('navigation', { name: 'Project views', exact: true })).toBeVisible();
    await expect(page.locator('main').getByText(issue.summary.key, { exact: true })).toBeVisible();
  }
  await expect(page.getByRole('button', { name: host === 'board' ? 'Create issue' : 'New issue', exact: true })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Project views', exact: true })).toBeVisible();
  expect(operations).toEqual([`POST /api/v1/issues/${issue.summary.id}/asset-uploads`]);
  const assets = await coverageGet(request, `/api/v1/issues/${issue.summary.id}/assets`, zPageAssetView);
  expect(assets.items).toEqual([]);
  const matches = await coverageWrite(request, 'POST', '/api/v2/issues/search', { filters: { projectIds: [projectId], query: title } }, zPageModernIssueSummary);
  expect(matches.items.map(value => value.id)).toEqual([issue.summary.id]);
  // Restore access through the public owner API, then navigate in this SPA. A
  // new create form must not restore the previous session's text or file queue.
  await coverageWrite(request, 'PUT', `/api/v1/projects/${projectId}/memberships/${memberId}`, { expectedRevision: '2', role: 'member' }, zSavedMembershipView);
  if (host === 'board') await page.getByRole('navigation', { name: 'Project views', exact: true }).getByRole('link', { name: 'Issues', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Issues', exact: true })).toBeVisible();
  await page.getByRole('navigation', { name: 'Project views', exact: true }).getByRole('link', { name: 'Kanban boards', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Project boards', exact: true })).toBeVisible();
  await page.getByRole('link', { name: board.board.name, exact: true }).click();
  await expect(page.getByRole('heading', { name: board.board.name, exact: true })).toBeVisible();
  if (host === 'issues') {
    await page.getByRole('navigation', { name: 'Project views', exact: true }).getByRole('link', { name: 'Issues', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Issues', exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: host === 'board' ? 'Create issue' : 'New issue', exact: true }).click();
  const next = page.getByRole('dialog', { name: 'Create issue', exact: true });
  await expect(next.getByLabel('Issue title', { exact: true })).toHaveValue('');
  await expect(next.getByRole('list', { name: 'Queued attachments', exact: true })).toHaveCount(0);
  await expect(next).not.toContainText('previous-writer-private.txt');
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
  }, 'web');
});

// A second owner boundary: the create succeeded on Go, but its acknowledgement
// must not repopulate private drafts after a different account has signed in.
test('native late accepted board creation acknowledgement cannot restore the previous account draft', async ({ page, request }, info) => {
  await useCase('UC-ISS-0203', async () => {
  const projectId = await coverageProject(request), board = await coverageBoard(request, projectId, 'Late create acknowledgement');
  const suffix = crypto.randomUUID().slice(0, 8), title = 'Previous account private title ' + suffix;
  const original = (await coverageWrite(request, 'POST', '/api/v1/admin/users', { displayName: 'Owned creation actor ' + suffix, email: 'owned-creation-' + suffix + '@example.test', administrator: false }, zSavedUserView, 201)).result;
  const memberId = original.id, server = new LocalAuthServer(info);
  let user = original;
  await coverageWrite(request, 'PUT', `/api/v1/projects/${projectId}/memberships/${memberId}`, { expectedRevision: '0', role: 'member' }, zSavedMembershipView);
  let releasePolicy!: () => void, policyHeld!: () => void, policyFinished!: () => void;
  let releaseCreate!: () => void, createHeld!: () => void, createFinished!: () => void;
  const policyGate = new Promise<void>(resolve => { releasePolicy = resolve; }), policyReady = new Promise<void>(resolve => { policyHeld = resolve; }), policyDone = new Promise<void>(resolve => { policyFinished = resolve; });
  const createGate = new Promise<void>(resolve => { releaseCreate = resolve; }), createReady = new Promise<void>(resolve => { createHeld = resolve; }), createDone = new Promise<void>(resolve => { createFinished = resolve; });
  let firstPolicy = true, acceptedId = '', deniedStatus = 0;
  await page.route('**/api/v1/asset-policy', async route => {
    if (!firstPolicy) { await route.continue(); return; }
    firstPolicy = false; policyHeld();
    try { await policyGate; const response = await route.fetch(); deniedStatus = response.status(); await route.fulfill({ response }); }
    finally { policyFinished(); }
  });
  await page.route(`**/api/v2/projects/${projectId}/issues`, async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    try {
      const response = await route.fetch(); expect(response.status()).toBe(201); acceptedId = zSavedModernIssueView.parse(await response.json()).result.summary.id;
      createHeld(); await createGate; await route.fulfill({ response });
    } finally { createFinished(); }
  });
  try {
    await server.prepare();
    const credentials = await server.addIdentity('owned-creation-' + suffix, user.email);
    await server.start();
    await signInOnLocalServer(page, server, credentials, '/boards/' + board.board.id);
    await expect(page.getByRole('heading', { name: board.board.name, exact: true })).toBeVisible();
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    await page.getByRole('button', { name: 'Create issue', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Create issue', exact: true });
    await dialog.getByLabel('Issue title', { exact: true }).fill(title); await policyReady;
    await dialog.getByRole('button', { name: 'Create issue', exact: true }).click(); await createReady;
    user = (await coverageWrite(request, 'PUT', '/api/v1/admin/users/' + memberId, { expectedRevision: user.revision, email: user.email, displayName: user.displayName, administrator: user.administrator, active: false }, zSavedUserView)).result;
    releasePolicy(); await policyDone; expect(deniedStatus).toBe(403);
    await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
    await page.getByLabel('Username', { exact: true }).fill('owner');
    await page.getByLabel('Password', { exact: true }).fill(server.ownerPassword);
    await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Welcome,/, level: 1 })).toBeVisible();
    await page.getByRole('combobox', { name: 'Search all issues', exact: true }).fill(title);
    await page.getByRole('listbox', { name: 'Matching issues', exact: true }).getByRole('option').filter({ hasText: title }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await page.getByRole('navigation', { name: 'Breadcrumb', exact: true }).getByRole('link', { name: 'Kanban boards', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Project boards', exact: true })).toBeVisible();
    await page.getByRole('link', { name: board.board.name, exact: true }).click();
    await expect(page.getByRole('heading', { name: board.board.name, exact: true })).toBeVisible();
    const acknowledgement = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === `/api/v2/projects/${projectId}/issues`);
    releaseCreate(); await createDone; await (await acknowledgement).finished();
    await page.getByRole('button', { name: 'Create issue', exact: true }).click();
    const current = page.getByRole('dialog', { name: 'Create issue', exact: true });
    await expect(current.getByLabel('Issue title', { exact: true })).toHaveValue('');
    await expect(current.getByText('Draft restored in this tab.', { exact: false })).toHaveCount(0);
    await expect(current.getByRole('list', { name: 'Queued attachments', exact: true })).toHaveCount(0);
    const matches = await coverageWrite(request, 'POST', '/api/v2/issues/search', { filters: { projectIds: [projectId], query: title } }, zPageModernIssueSummary);
    expect(matches.items.map(value => value.id)).toEqual([acceptedId]);
    expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
    // Positive ownership control: deliberately closing the successful current
    // form must still release the parent request's busy state.
    const currentTitle = 'Current owner successful creation ' + crypto.randomUUID().slice(0, 8);
    await current.getByLabel('Issue title', { exact: true }).fill(currentTitle);
    const ownAccepted = page.waitForResponse(value => value.request().method() === 'POST' && new URL(value.url()).pathname === `/api/v2/projects/${projectId}/issues`);
    await current.getByRole('button', { name: 'Create issue', exact: true }).click();
    expect((await ownAccepted).status()).toBe(201);
    const preview = page.getByRole('dialog', { name: 'Issue preview', exact: true });
    await expect(preview.getByRole('heading', { name: currentTitle, exact: true })).toBeVisible();
    await preview.getByRole('button', { name: 'Close issue', exact: true }).click();
    await expect(preview).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Create issue', exact: true })).toBeEnabled();
  } finally {
    releasePolicy(); releaseCreate();
    try {
      if (!user.active) await coverageWrite(request, 'PUT', '/api/v1/admin/users/' + memberId, { expectedRevision: user.revision, email: user.email, displayName: user.displayName, administrator: original.administrator, active: original.active }, zSavedUserView);
    } finally { await server.stop(); }
  }
  }, 'web');
});
