import { useCase as recordedUseCase } from './support/use-case';
const useCase = <T>(id: string, body: () => Promise<T>) => recordedUseCase(id, body, 'web');
import { readNativeIssue, fixturePriority } from './support/native-issues';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, fillCredentials, token } from './support/session';
import { isolatedProject } from './support/project';
import {
  zModernIssueView,
  zSavedIssueView,
  zSavedModernIssueView,
  zPageBoardSummary,
} from '../src/app/api/generated/zod.gen';
import type { ModernIssueView } from '../src/app/api/generated/types.gen';

test.skip(!localFixturesAvailable, 'Requires the isolated local company.');
async function headers() {
  return {
    Authorization: 'Bearer ' + (await token('member')),
    'Idempotency-Key': crypto.randomUUID(),
  };
}
async function fixture(request: APIRequestContext) {
  const projectId = await isolatedProject(request);
  const response = await request.post(apiOrigin + '/api/v1/projects/' + projectId + '/issues', {
    headers: await headers(),
    data: {
      title: 'Improve the issue workspace',
      description: 'Click this description to edit it.',
    },
  });
  expect(response.status()).toBe(201);
  return readNativeIssue(request, zSavedIssueView.parse(await response.json()).result.summary.id);
}
function editable(issue: ModernIssueView) {
  return {
    title: issue.summary.title,
    description: issue.description,
    descriptionFormat: issue.descriptionFormat,
    typeId: issue.summary.type.id,
    priorityId: issue.summary.priority.id,
    assigneeId: issue.summary.assignee?.id ?? null,
    dueDate: issue.summary.dueDate,
    labelIds: issue.summary.labels.map(label => label.id),
  };
}
async function openField(page: Page, label: string) {
  await page.getByRole('button', { name: 'Edit ' + label, exact: true }).click();
  return page.getByRole('group', { name: 'Edit ' + label, exact: true });
}
async function saveField(page: Page, label: string) {
  const editor = page.getByRole('group', { name: 'Edit ' + label, exact: true });
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).toHaveCount(0);
}

test('click issue values and your own comment to edit, with automatic choices, draft save, cancel and viewer access', async ({
  page,
  request,
}) => {
  const issue = await fixture(request);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member', '/issues/' + issue.summary.id, /^Improve the issue workspace$/);
  // Clicking the visible title itself opens its inline editor.
  let field = await useCase('UC-ISS-0091', async () => {
    // The heading appears before the initial planning read releases inline edits.
    await expect(page.getByRole('button', { name: 'Edit title', exact: true })).toBeEnabled();
    await page.getByRole('heading', { name: 'Improve the issue workspace', exact: true }).click();
    const editor = page.getByRole('group', { name: 'Edit title', exact: true });
    await expect(editor).toBeVisible();
    await expect(editor.getByLabel('title', { exact: true })).toHaveValue('Improve the issue workspace');
    return editor;
  });
  await useCase('UC-ISS-0093', async () => {
  await field.getByLabel('title', { exact: true }).fill('Draft to cancel');
  await field.getByLabel('title', { exact: true }).press('Escape');
  await expect(
    page.getByRole('heading', { name: 'Improve the issue workspace', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit title', exact: true })).toBeFocused();
  });
  await useCase('UC-ISS-0092', async () => {
  field = await openField(page, 'title');
  await field
    .getByLabel('title', { exact: true })
    .fill('Workspace improvements · تحسين تجربة الفريق');
  await field.getByLabel('title', { exact: true }).press('Enter');
  await expect(
    page.getByRole('heading', { name: 'Workspace improvements · تحسين تجربة الفريق', exact: true }),
  ).toBeVisible();
  expect((await readNativeIssue(request, issue.summary.id)).summary.title).toBe('Workspace improvements · تحسين تجربة الفريق');
  });

  field = await useCase('UC-ISS-0094', async () => {
    await page.locator('.issue-description .preserve-space').click();
    const editor = page.getByRole('group', { name: 'Edit description', exact: true });
    await expect(editor).toBeVisible();
    await expect(editor.getByRole('textbox', { name: 'Description', exact: true })).toBeVisible();
    await expect(editor.getByRole('button', { name: 'HTML source', exact: true })).toBeVisible();
    return editor;
  });
  await field.getByRole('button', { name: 'HTML source', exact: true }).click();
  await field
    .getByLabel('Description HTML')
    .fill(
      '<h3>Release checklist</h3><p dir="rtl">تحديث تجربة الفريق</p><ul><li>Review the design</li><li>Test attachments and comments</li></ul>',
    );
  await field.getByRole('button', { name: 'Preview HTML', exact: true }).click();
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  if (evidence)
    await field.screenshot({ path: evidence + '/issue-refactor/description-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (evidence)
    await field.screenshot({ path: evidence + '/issue-refactor/description-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  // The paperclip must preserve selected description text when it inserts file links.
  await field.getByLabel('Description', { exact: true }).press('Control+a');
  const chooserEvent = page.waitForEvent('filechooser');
  await field.getByRole('button', { name: 'Attach files or pictures', exact: true }).click();
  await (
    await chooserEvent
  ).setFiles([
    { name: 'requirements.txt', mimeType: 'text/plain', buffer: Buffer.from('Team requirements') },
    {
      name: 'delivery.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('task,status\nreview,ready'),
    },
  ]);
  const descriptionQueue = field.locator('gg-file-queue');
  await expect(field.getByRole('button', { name: 'HTML source', exact: true })).toBeDisabled();
  await descriptionQueue.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  await expect(
    descriptionQueue.getByRole('button', { name: 'Upload queued files', exact: true }),
  ).toBeDisabled();
  await expect(field.getByLabel('Description', { exact: true })).toContainText('delivery.csv');
  await expect(field.getByLabel('Description', { exact: true })).toContainText(
    'تحديث تجربة الفريق',
  );
  await useCase('UC-ISS-0095', async () => {
  await saveField(page, 'description');
  await expect(
    page
      .locator('.issue-description')
      .getByRole('heading', { name: 'Release checklist', exact: true }),
  ).toBeVisible();
  expect((await readNativeIssue(request, issue.summary.id)).description).toContain('Release checklist');
  });
  field = await openField(page, 'description');
  await useCase('UC-ISS-0096', async () => {
  await expect(field.locator('.editor-attachments')).toBeHidden();
  await field.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(field).toHaveCount(0);
  await expect(page.locator('.issue-description')).toContainText('Release checklist');
  });

  field = await openField(page, 'assignee');
  await expect(field.getByRole('option', { name: 'مطور تجريبي', exact: true })).toBeVisible();
  await expect(field.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await field.getByRole('option', { name: 'مطور تجريبي', exact: true }).click();
  await expect(field).toHaveCount(0);
  await expect(page.locator('gg-modern-issue-field-editor .person-value')).toContainText(
    'مطور تجريبي',
  );
  field = await openField(page, 'priority');
  await expect(field.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await field.getByRole('option', { name: 'High', exact: true }).click();
  await expect(field).toHaveCount(0);
  await expect(page.locator('.priority-value')).toContainText('High');
  field = await openField(page, 'due date');
  await expect(field.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await field.getByLabel('due date', { exact: true }).fill('2027-01-20');
  await expect(field).toHaveCount(0);
  await expect(page.locator('gg-modern-issue-field-editor .due-value')).toContainText('2027-01-20');
  field = await openField(page, 'labels');
  await useCase('UC-ISS-0107', async () => {
  await field.getByLabel('New label name').fill('design');
  await field.getByRole('button', { name: 'Create and select label', exact: true }).click();
  await expect(field.getByRole('button', { name: 'Remove design', exact: true })).toBeVisible();
  await saveField(page, 'labels');
  expect((await readNativeIssue(request, issue.summary.id)).summary.labels.map(label => label.name)).toEqual(['design']);
  });

  const composer = page.getByRole('textbox', { name: 'Comment text', exact: true });
  await composer.fill('A comment to edit · تعليق');
  await page.getByRole('button', { name: 'Post comment', exact: true }).click();
  const thread = page.getByRole('region', { name: 'Issue discussion', exact: true });
  await thread.getByText('A comment to edit · تعليق', { exact: true }).click();
  await expect(thread.getByRole('textbox', { name: 'Comment text', exact: true })).toBeVisible();
  await composer.fill('Updated in place · تم التعديل');
  await thread.getByRole('button', { name: 'Save comment changes', exact: true }).click();
  await expect(thread).toContainText('Updated in place · تم التعديل');
  await expect(thread).toContainText('Edited · version 2');
  const current = zModernIssueView.parse(
    await (
      await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
        headers: await headers(),
      })
    ).json(),
  );
  expect(current.summary.priority.key).toBe('high');
  expect(current.summary.assignee?.id).toBe('10000000-0000-4000-8000-000000000002');
  expect(current.summary.dueDate).toBe('2027-01-20');
  expect(current.summary.labels.map(label => label.name)).toEqual(['design']);

  await page.evaluate(() => window.scrollTo(0, 0));
  if (evidence)
    await page.screenshot({
      path: evidence + '/issue-refactor/inline-desktop.png',
      fullPage: true,
    });
  await page.setViewportSize({ width: 390, height: 844 });
  field = await openField(page, 'labels');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (evidence)
    await page.screenshot({ path: evidence + '/issue-refactor/inline-mobile.png', fullPage: true });
  await field.getByRole('button', { name: 'Cancel', exact: true }).click();
  await signIn(page, 'viewer', '/issues/' + issue.summary.id, /^Workspace improvements/);
  for (const label of ['title', 'description', 'assignee', 'priority', 'due date', 'labels']) {
    await expect(page.getByRole('button', { name: 'Edit ' + label, exact: true })).toHaveCount(0);
  }
  await expect(thread.getByRole('button', { name: 'Edit comment', exact: true })).toHaveCount(0);
});

test('inline saves preserve drafts through uncertain responses and explicit conflict review', async ({
  page,
  request,
}) => {
  const issue = await fixture(request);
  await signIn(page, 'member', '/issues/' + issue.summary.id, /^Improve the issue workspace$/);
  let field = await openField(page, 'title');
  await field.getByLabel('title', { exact: true }).fill('Confirmed once · مرة واحدة');
  const references: string[] = [];
  let attempts = 0;
  await page.route('**/api/v2/issues/' + issue.summary.id, async route => {
    if (route.request().method() !== 'PUT') {
      await route.continue();
      return;
    }
    references.push(route.request().headers()['idempotency-key'] ?? '');
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    if (++attempts === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await field.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(field.getByRole('alert')).toBeVisible();
  await expect(field.getByLabel('title', { exact: true })).toHaveValue(
    'Confirmed once · مرة واحدة',
  );
  await saveField(page, 'title');
  expect(references).toHaveLength(2);
  expect(references[0]).toBe(references[1]);
  await page.unroute('**/api/v2/issues/' + issue.summary.id);

  field = await openField(page, 'priority');
  const current = zModernIssueView.parse(
    await (
      await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
        headers: await headers(),
      })
    ).json(),
  );
  const response = await request.put(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
    headers: await headers(),
    data: {
      expectedRevision: current.summary.revision,
      editable: {
        ...editable(current),
        priorityId: await fixturePriority(request, issue.summary.projectId, 'low'),
        description: 'A newer description from a teammate',
        descriptionFormat: 'plain',
      },
    },
  });
  expect(response.status()).toBe(200);
  await field.getByRole('option', { name: 'High', exact: true }).click();
  await expect(
    field.getByRole('button', { name: 'Review latest and keep my draft', exact: true }),
  ).toBeVisible();
  await expect(field.getByRole('option', { name: 'High', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await field.getByRole('button', { name: 'Review latest and keep my draft', exact: true }).click();
  await field.getByRole('button', { name: 'Apply reviewed change', exact: true }).click();
  await expect(field).toHaveCount(0);
  const saved = zModernIssueView.parse(
    await (
      await request.get(apiOrigin + '/api/v2/issues/' + issue.summary.id, {
        headers: await headers(),
      })
    ).json(),
  );
  expect(saved.description).toBe('A newer description from a teammate');
  expect(saved.summary.priority.key).toBe('high');
});

test('an inline draft survives navigation and restores its original revision', async ({
  page,
  request,
}) => {
  const issue = await fixture(request);
  await signIn(page, 'member', '/issues/' + issue.summary.id, /^Improve the issue workspace$/);
  await useCase('UC-ISS-0163', async () => {
  let field = await openField(page, 'title');
  await field.getByLabel('title', { exact: true }).fill('Unsaved Arabic title · مسودة');
  await useCase('UC-SHL-0070', () => useCase('UC-SHL-0071', async () => {
    const confirmation = page.waitForEvent('dialog');
    const attemptedNavigation = page.getByRole('link', { name: 'All issues', exact: true }).click();
    const dialog = await confirmation;
    expect(dialog.type()).toBe('confirm');
    expect(dialog.message()).toContain('Your unsaved draft stays in this tab');
    await dialog.dismiss();
    await attemptedNavigation;
    await expect(page).toHaveURL(new RegExp('/issues/' + issue.summary.id + '$'));
    await expect(field.getByLabel('title', { exact: true })).toHaveValue('Unsaved Arabic title · مسودة');
  }));
  await useCase('UC-SHL-0072', async () => {
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('link', { name: 'All issues', exact: true }).click();
    await page
      .getByRole('link', { name: issue.summary.key + ' · Improve the issue workspace', exact: true })
      .click();
    field = await openField(page, 'title');
    await expect(field.getByLabel('title', { exact: true })).toHaveValue('Unsaved Arabic title · مسودة');
  });
  await saveField(page, 'title');
  await expect(
    page.getByRole('heading', { name: 'Unsaved Arabic title · مسودة', exact: true }),
  ).toBeVisible();
  });
});

test('one attachment grid opens pictures, downloads any file, and supports drag and drop in the board drawer', async ({
  page,
  request,
}) => {
  const issue = await fixture(request);
  const boards = zPageBoardSummary.parse(
    await (
      await request.get(apiOrigin + '/api/v1/projects/' + issue.summary.projectId + '/boards', {
        headers: await headers(),
      })
    ).json(),
  );
  const board = boards.items[0];
  if (!board) throw new Error('Missing fixture board');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await signIn(page, 'member', '/boards/' + board.id, new RegExp('^' + board.name + '$'));
  await page.getByRole('link', { name: issue.summary.title, exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Issue preview', exact: true });
  await expect(drawer).toBeVisible();
  const attachments = drawer.getByRole('region', { name: 'Attachments', exact: true });
  await expect(drawer.locator('gg-picture-gallery,gg-attachment-list')).toHaveCount(0);
  const fileChooser = page.waitForEvent('filechooser');
  await attachments.getByRole('button', { name: 'Add files', exact: true }).click();
  const chooser = await fileChooser;
  const imageData = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 240;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    context.fillStyle = '#e9f2ff';
    context.fillRect(0, 0, 480, 240);
    context.fillStyle = '#0c66e4';
    context.fillRect(32, 40, 100, 140);
    context.fillRect(155, 40, 120, 100);
    context.fillRect(300, 40, 140, 60);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  await chooser.setFiles({
    name: 'board-design.png',
    mimeType: 'image/png',
    buffer: Buffer.from(imageData, 'base64'),
  });
  const drop = attachments.locator('.file-drop');
  await drop.evaluate(element => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File(['Release checklist'], 'release-notes.txt', { type: 'text/plain' }),
    );
    transfer.items.add(
      new File(['opaque design archive'], 'design.zip', { type: 'application/zip' }),
    );
    element.dispatchEvent(
      new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }),
    );
  });
  await attachments.getByRole('button', { name: 'Upload queued files', exact: true }).click();
  await expect(attachments.locator('.attachment-card')).toHaveCount(3);
  await expect(attachments.getByAltText('board-design.png', { exact: true })).toBeVisible();
  await expect(drawer.locator('dialog.picture-preview')).not.toBeVisible();
  await attachments.getByRole('button', { name: 'Dismiss uploaded files', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Attachment preview', exact: true });
  await useCase('UC-AST-0033', async () => {
  await page.route('**/api/v1/assets/*/chunk**', route => route.abort('failed'), { times: 1 });
  await attachments.getByRole('button', { name: 'board-design.png', exact: true }).click();
  await expect(preview.getByRole('alert')).toContainText('could not be loaded');
  await preview.getByRole('button', { name: 'Retry preview', exact: true }).click();
  await expect(preview.getByRole('img')).toHaveAttribute('src', /^blob:/);
  await expect(preview.getByRole('img')).toHaveJSProperty('naturalWidth', 480);
  });
  await preview.getByRole('button', { name: 'Close attachment preview', exact: true }).click();
  await expect(
    attachments.getByRole('button', { name: 'board-design.png', exact: true }),
  ).toBeFocused();
  await attachments.getByRole('button', { name: 'design.zip', exact: true }).click();
  await expect(preview).toContainText('Preview is not available for this file type.');
  const download = page.waitForEvent('download');
  await preview.getByRole('link', { name: 'Download file', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('design.zip');
  await preview.getByRole('button', { name: 'Close attachment preview', exact: true }).click();
  const evidence = process.env['GATEGOLD_E2E_EVIDENCE'];
  await drawer.evaluate(element => element.scrollTo(0, 0));
  if (evidence) await page.screenshot({ path: evidence + '/issue-refactor/drawer-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await drawer.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  if (evidence) await page.screenshot({ path: evidence + '/issue-refactor/drawer-mobile.png' });
  await attachments.getByRole('button', { name: 'Remove board-design.png', exact: true }).click();
  await expect(attachments.locator('.attachment-card')).toHaveCount(2);
  await expect(
    attachments.getByRole('button', { name: 'Download release-notes.txt', exact: true }),
  ).toBeVisible();
});

test('an actual canceled browser reload preserves its draft and an accepted reload ends memory retention', async ({ page, request }) => {
  const issue = await fixture(request);
  await signIn(page, 'member', '/issues/' + issue.summary.id, /^Improve the issue workspace$/);
  let field = await openField(page, 'title');
  await field.getByLabel('title', { exact: true }).fill('Reload warning draft · مسودة');
  await useCase('UC-SHL-0074', async () => {
    const firstDialog = page.waitForEvent('dialog');
    const canceledReload = page.reload({ waitUntil: 'domcontentloaded', timeout: 5_000 }).then(() => null, (error: unknown) => error);
    const warning = await firstDialog;
    expect(warning.type()).toBe('beforeunload'); await warning.dismiss(); await canceledReload;
    await expect(page).toHaveURL(new RegExp('/issues/' + issue.summary.id + '$')); await expect(field.getByLabel('title', { exact: true })).toHaveValue('Reload warning draft · مسودة');
    const secondDialog = page.waitForEvent('dialog'), acceptedReload = page.reload({ waitUntil: 'domcontentloaded' });
    const accepted = await secondDialog; expect(accepted.type()).toBe('beforeunload'); await accepted.accept(); await acceptedReload;
    await fillCredentials(page, 'member'); await page.getByRole('button', { name: 'Sign in locally', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Improve the issue workspace', exact: true })).toBeVisible();
    field = await openField(page, 'title'); await expect(field.getByLabel('title', { exact: true })).toHaveValue('Improve the issue workspace');
  });
});

test('same-SPA account switching clears the issue, comment and selected-file drafts', async ({ page, request }) => {
  const issue = await fixture(request);
  await signIn(page, 'member', '/issues/' + issue.summary.id, /^Improve the issue workspace$/);
  let field = await openField(page, 'title'); await field.getByLabel('title', { exact: true }).fill('Previous account private title');
  const comment = page.locator('gg-comment-editor').getByRole('textbox', { name: 'Comment text', exact: true }); await comment.fill('Previous account private discussion');
  const queue = page.locator('gg-issue-attachments').getByRole('group', { name: 'Attach pictures and files', exact: true });
  await queue.getByLabel('Choose files', { exact: true }).setInputFiles({ name: 'previous-account-private.txt', mimeType: 'text/plain', buffer: Buffer.from('Previous account private bytes') }); await expect(queue.locator('.queue-items li')).toHaveCount(1);
  const marker = crypto.randomUUID(); await page.locator('html').evaluate((element, value) => element.setAttribute('data-account-switch-fixture', value), marker);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await fillCredentials(page, 'owner'); await page.getByRole('button', { name: 'Sign in locally', exact: true }).click(); await expect(page.getByRole('heading', { name: /Welcome,/, level: 1 })).toBeVisible(); await expect(page.locator('html')).toHaveAttribute('data-account-switch-fixture', marker);
  await page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Issues', exact: true }).click(); await page.getByRole('link', { name: issue.summary.key + ' · Improve the issue workspace', exact: true }).click();
  await useCase('UC-SHL-0083', async () => { field = await openField(page, 'title'); await expect(field.getByLabel('title', { exact: true })).toHaveValue('Improve the issue workspace'); await expect(field.getByLabel('title', { exact: true })).not.toHaveValue('Previous account private title'); });
  await useCase('UC-SHL-0084', async () => { await expect(comment).toBeVisible(); await expect(comment).not.toContainText('Previous account private discussion'); await expect(comment.locator('p')).toHaveText(''); });
  await useCase('UC-SHL-0085', async () => { await expect(queue).toBeVisible(); await expect(queue.locator('.queue-items li')).toHaveCount(0); await expect(queue).not.toContainText('previous-account-private.txt'); await expect(queue.getByRole('button', { name: 'Upload queued files', exact: true })).toHaveCount(0); });
});
