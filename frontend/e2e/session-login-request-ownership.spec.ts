import { expect, type Request } from '@playwright/test';
import { test } from './support/browser-test';
import { useCase } from './support/use-case';
import { fillCredentials, localFixturesAvailable, signIn } from './support/session';
import { read } from './support/coverage-access';
import { zLocalSession, zMe, zPageBoardSummary, zProjectView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires isolated real identities, the Go service and PostgreSQL.');
test.use({ trace: 'off' });

const demoProject = '20000000-0000-4000-8000-000000000001';
const projectPath = '/api/v1/projects/' + demoProject;
const boardsPath = /^\/api\/v1\/projects\/([0-9a-f-]{36})\/boards$/;
type Phase = 'initial' | 'pending-login' | 'replacement-session';

test('an obsolete project reply cannot start unsigned board discovery or invalidate a pending replacement login', async ({ page, request }) => {
  const member = await read(request, '/api/v1/me', zMe, 'member');
  let releaseProject = () => {};
  const projectGate = new Promise<void>(resolve => { releaseProject = () => resolve(); });
  let releaseLogin = () => {};
  const loginGate = new Promise<void>(resolve => { releaseLogin = () => resolve(); });
  let projectAccepted = false, loginAccepted = false;
  let oldProject: Request | undefined;
  let phase: Phase = 'initial';
  const boardRequests: Array<{ phase: Phase; authenticated: boolean; projectId: string }> = [];
  const observe = (outgoing: Request) => {
    const match = boardsPath.exec(new URL(outgoing.url()).pathname);
    if (outgoing.method() === 'GET' && match) boardRequests.push({ phase, authenticated: !!outgoing.headers()['authorization'], projectId: match[1]! });
  };
  page.on('request', observe);
  await page.route('**' + projectPath, async route => {
    if (route.request().method() !== 'GET' || oldProject) { await route.continue(); return; }
    oldProject = route.request();
    const accepted = await route.fetch();
    expect(accepted.status()).toBe(200);
    const project = zProjectView.parse(await accepted.json());
    expect(project.id).toBe(demoProject); expect(project.key).toBe('DEMO');
    expect(project.effectiveRole).toBe('administrator');
    projectAccepted = true;
    await projectGate;
    await route.fulfill({ response: accepted });
  });
  try {
    // The explicit public project context keeps this independent of how many
    // earlier acceptance stories have populated the project directory.
    await signIn(page, 'owner', '/admin/users?projectId=' + demoProject, /^Company users$/);
    await expect.poll(() => projectAccepted).toBe(true);
    await useCase('UC-ACC-0070', async () => {
      const timeOrigin = await page.evaluate(() => performance.timeOrigin);
      const marker = crypto.randomUUID();
      await page.locator('html').evaluate((element, value) => element.setAttribute('data-login-request-owner', value), marker);
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Administration', exact: true })).toHaveCount(0);
      await page.route('**/api/v1/auth/local-sign-in', async route => {
        if (route.request().method() !== 'POST' || loginAccepted) { await route.continue(); return; }
        const accepted = await route.fetch();
        expect(accepted.status()).toBe(200);
        expect(accepted.headers()['cache-control']).toBe('no-store');
        // Validate the actual response without exposing its private bearer.
        zLocalSession.parse(await accepted.json());
        loginAccepted = true;
        await loginGate;
        await route.fulfill({ response: accepted });
      });
      await fillCredentials(page, 'member');
      phase = 'pending-login';
      await page.getByRole('button', { name: 'Sign in locally', exact: true }).click();
      await expect.poll(() => loginAccepted).toBe(true);
      await expect(page.getByRole('button', { name: 'Sign in locally', exact: true })).toBeDisabled();
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
      expect(boardRequests.filter(outgoing => outgoing.phase === 'pending-login')).toEqual([]);

      if (!oldProject) throw new Error('The accepted old project response was not captured.');
      const delivered = page.waitForResponse(response => response.request() === oldProject);
      releaseProject();
      const oldReply = await delivered;
      expect(oldReply.status()).toBe(200);
      expect(await oldReply.finished()).toBeNull();
      // First wait for concrete response delivery, then allow the browser's
      // promise continuations and two render turns to run before the negative
      // assertion. No private Angular state or timed sleep drives this race.
      await page.evaluate(() => new Promise<void>(resolve => {
        queueMicrotask(() => requestAnimationFrame(() => queueMicrotask(() => requestAnimationFrame(() => resolve()))));
      }));
      expect(boardRequests.filter(outgoing => outgoing.phase === 'pending-login')).toEqual([]);
      await expect(page.getByRole('button', { name: 'Sign in locally', exact: true })).toBeDisabled();
      await expect(page.getByLabel('Username', { exact: true })).toHaveValue('member');
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
      await expect(page.getByRole('alert')).toHaveCount(0);
      await expect(page).toHaveURL(/\/sign-in(?:\?.*)?$/);

      const currentIdentity = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/me' && response.request().method() === 'GET' && response.status() === 200);
      phase = 'replacement-session';
      releaseLogin();
      expect(zMe.parse(await (await currentIdentity).json())).toEqual(member);
      await expect(page.getByRole('heading', { name: 'Welcome, ' + member.displayName, exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Administration', exact: true })).toHaveCount(0);
      // Home deliberately has no selected project. Enter DEMO through its real
      // directory link before expecting a new project/board context request.
      await page.getByRole('link', { name: 'View all projects', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
      const demoLink = page.locator('.project-records a[href="/projects/' + demoProject + '"]');
      await expect(page.getByRole('button', { name: 'Refresh projects', exact: true })).toBeEnabled();
      while (await demoLink.count() === 0) {
        const more = page.getByRole('button', { name: 'More projects', exact: true });
        await expect(more).toBeVisible(); await expect(more).toBeEnabled();
        const before = await page.locator('.project-records > li').count();
        await more.click();
        await expect.poll(() => page.locator('.project-records > li').count()).toBeGreaterThan(before);
      }
      const freshBoards = page.waitForResponse(response => new URL(response.url()).pathname === projectPath + '/boards' && response.request().method() === 'GET');
      await demoLink.click();
      const boards = await freshBoards;
      expect(boards.status()).toBe(200);
      expect(!!boards.request().headers()['authorization']).toBe(true);
      const match = boardsPath.exec(new URL(boards.url()).pathname);
      if (!match) throw new Error('The replacement session did not read a real project board directory.');
      const freshProjectId = match[1]!;
      expect(freshProjectId).toBe(demoProject);
      const pageOfBoards = zPageBoardSummary.parse(await boards.json());
      expect(pageOfBoards.items.length).toBeGreaterThan(0);
      expect(pageOfBoards.items.every(board => board.projectId === freshProjectId)).toBe(true);
      expect(boardRequests.filter(outgoing => outgoing.phase === 'replacement-session').every(outgoing => outgoing.authenticated)).toBe(true);
      const freshProject = await read(request, '/api/v1/projects/' + freshProjectId, zProjectView, 'member');
      await expect(page.locator('.project-context')).toContainText(freshProject.key + ' · ' + freshProject.effectiveRole);
      // Read the authoritative default through bounded cursor pages rather than
      // assuming that earlier scenarios left it on the first directory page.
      let directory = pageOfBoards;
      const cursors = new Set<string>();
      let defaultBoard = directory.items.find(board => board.default);
      while (!defaultBoard && directory.nextCursor) {
        const cursor = directory.nextCursor;
        expect(cursors.has(cursor)).toBe(false); cursors.add(cursor);
        directory = await read(request, '/api/v1/projects/' + freshProjectId + '/boards?limit=25&includeArchived=false&cursor=' + encodeURIComponent(cursor), zPageBoardSummary, 'member');
        defaultBoard = directory.items.find(board => board.default);
      }
      if (!defaultBoard) throw new Error('The authorized fresh project has no default board.');
      await expect(page.getByRole('navigation', { name: 'Project navigation', exact: true }).getByRole('link', { name: 'Board', exact: true })).toHaveAttribute('href', '/boards/' + defaultBoard.id);
      expect(await page.evaluate(() => performance.timeOrigin)).toBe(timeOrigin);
      await expect(page.locator('html')).toHaveAttribute('data-login-request-owner', marker);
    }, 'web');
  } finally {
    releaseProject(); releaseLogin();
    await page.unrouteAll({ behavior: 'wait' });
    page.off('request', observe);
  }
});
