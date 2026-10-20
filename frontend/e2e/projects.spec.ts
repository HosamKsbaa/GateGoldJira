import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import { zProjectView, zSavedProjectView } from '../src/app/api/generated/zod.gen';

test.skip(
  !localFixturesAvailable,
  'Use make test-browser for isolated PostgreSQL and real test access tokens.',
);
test('create, edit immutable-key project, administer access while archived and restore', async ({
  page,
  request,
}) => {
  await signIn(page, 'owner', '/projects', /Projects/);
  await page.getByRole('textbox', { name: 'Project key', exact: true }).fill('web');
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('مشروع الويب');
  await page.getByLabel('Description', { exact: true }).fill('Plain <b>text</b> وصف عربي');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByText('Project created.', { exact: true })).toBeVisible();
  const row = page
    .getByRole('listitem')
    .filter({ has: page.getByRole('link', { name: 'WEB · مشروع الويب' }) });
  await row.getByRole('button', { name: 'Edit WEB', exact: true }).click();
  await expect(page.getByLabel('Project name', { exact: true })).toBeFocused();
  await expect(page.getByLabel('Project key', { exact: true })).toHaveCount(0);
  await page.getByLabel('Project name', { exact: true }).fill('مشروع الفريق');
  await page.getByRole('button', { name: 'Save project', exact: true }).click();
  await expect(page.getByText('Project saved.', { exact: true })).toBeVisible();
  const link = page.getByRole('link', { name: 'WEB · مشروع الفريق', exact: true });
  const path = await link.getAttribute('href');
  expect(path).toMatch(/^\/projects\/[a-f0-9-]+$/);
  await link.click();
  await expect(page.getByRole('heading', { name: 'مشروع الفريق', exact: true })).toBeVisible();
  await expect(page.getByText('Plain <b>text</b> وصف عربي', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Manage project access' }).click();
  await page.getByLabel('Approved user').selectOption('10000000-0000-4000-8000-000000000003');
  await page.getByLabel('Project role').selectOption('viewer');
  await page.getByRole('button', { name: 'Save membership' }).click();
  await expect(page.getByText('Project role saved.', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await page.getByRole('button', { name: 'Archive WEB', exact: true }).click();
  await expect(page.getByText('Project archived.', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'WEB · مشروع الفريق', exact: true })).toHaveCount(0);
  await page.getByLabel('Include archived projects').check();
  await page.getByRole('link', { name: 'WEB · مشروع الفريق', exact: true }).click();
  await expect(
    page.getByText('Archived project · Content is read-only.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Manage project access' }).click();
  await expect(
    page
      .getByRole('listitem')
      .filter({ has: page.getByRole('strong').filter({ hasText: 'Local Viewer' }) }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await page.getByLabel('Include archived projects').check();
  await page.getByRole('button', { name: 'Restore WEB', exact: true }).click();
  await expect(page.getByText('Project restored.', { exact: true })).toBeVisible();
  await signIn(page, 'viewer', path ?? '/', /مشروع الفريق/);
  await expect(page.getByRole('link', { name: 'Manage project access' })).toHaveCount(0);
  const response = await request.get(apiOrigin + '/api/v1' + path, {
    headers: { Authorization: 'Bearer ' + (await token('viewer')) },
  });
  expect(response.status()).toBe(200);
  const json: unknown = await response.json();
  const project = zProjectView.parse(json);
  expect(project.key).toBe('WEB');
  expect(project.archived).toBe(false);
  expect(project.effectiveRole).toBe('viewer');
});

test('viewer sees only assigned projects and has no project-management actions', async ({
  page,
  request,
}) => {
  await signIn(page, 'viewer', '/projects', /Projects/);
  await expect(page.getByRole('button', { name: 'Create project', exact: true })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link', { name: /DEMO ·/ })).toBeVisible();
  const response = await request.post(apiOrigin + '/api/v1/projects', {
    headers: {
      Authorization: 'Bearer ' + (await token('viewer')),
      'Idempotency-Key': crypto.randomUUID(),
    },
    data: { key: 'DENIED', name: 'No access' },
  });
  expect(response.status()).toBe(403);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test('a newly created Arabic project stays reachable beyond the first directory page', async ({
  page,
  request,
}) => {
  const marker = crypto.randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase();
  const ownerHeaders = { Authorization: 'Bearer ' + (await token('owner')) };
  const createdFixtures: { id: string; revision: string }[] = [];
  try {
    for (let index = 0; index < 26; index++) {
      const fixture = await request.post(apiOrigin + '/api/v1/projects', {
        headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() },
        data: {
          key: 'P' + marker + String(index).padStart(2, '0'),
          name: '000 directory ' + marker + ' ' + String(index).padStart(2, '0'),
        },
      });
      expect(fixture.status()).toBe(201);
      const project = zSavedProjectView.parse(await fixture.json()).result;
      createdFixtures.push({ id: project.id, revision: project.revision });
    }
    await signIn(page, 'owner', '/projects', /^Projects$/);
    await expect(page.getByRole('button', { name: 'More projects', exact: true })).toBeVisible();
    const key = 'N' + marker,
      title = 'مشروع جديد ' + marker,
      edited = 'مشروع قابل للتعديل ' + marker;
    await page.getByRole('textbox', { name: 'Project key', exact: true }).fill(key);
    await page.getByRole('textbox', { name: 'Project name', exact: true }).fill(title);
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await expect(page.getByText('Project created.', { exact: true })).toBeVisible();
    const link = page.getByRole('link', { name: key + ' · ' + title, exact: true });
    await expect(link).toHaveCount(1);
    await expect(link).toBeVisible();
    await page.getByRole('button', { name: 'More projects', exact: true }).click();
    await expect(link).toHaveCount(1);
    await page.getByRole('button', { name: 'Edit ' + key, exact: true }).click();
    await page.getByLabel('Project name', { exact: true }).fill(edited);
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    const updated = page.getByRole('link', { name: key + ' · ' + edited, exact: true });
    await expect(updated).toHaveCount(1);
    await updated.click();
    await expect(page.getByRole('heading', { name: edited, exact: true })).toBeVisible();
    await page
      .getByRole('navigation', { name: 'Main navigation', exact: true })
      .getByRole('link', { name: 'Projects', exact: true })
      .click();
    await expect(updated).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Edit ' + key, exact: true })).toBeVisible();
  } finally {
    for (const project of createdFixtures) {
      const archived = await request.post(
        apiOrigin + '/api/v1/projects/' + project.id + '/archive',
        {
          headers: { ...ownerHeaders, 'Idempotency-Key': crypto.randomUUID() },
          data: { expectedRevision: project.revision },
        },
      );
      expect(archived.status()).toBe(200);
    }
  }
});
