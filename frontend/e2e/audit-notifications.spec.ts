import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, token } from './support/session';
import {
  zInboxSummary,
  zNotificationPreferencesView,
  zSavedNotificationPreferencesView,
  zSavedIssueView,
} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires disposable company accounts and PostgreSQL.');
test('notification preferences retain an uncertain save and work on mobile', async ({
  page,
  request,
}) => {
  const auth = 'Bearer ' + (await token('viewer'));
  const before = zNotificationPreferencesView.parse(
    await (
      await request.get(apiOrigin + '/api/v1/notifications/preferences', {
        headers: { Authorization: auth },
      })
    ).json(),
  );
  try {
    await signIn(page, 'viewer', '/notifications', /^Inbox$/);
    await page.getByRole('button', { name: 'Notification preferences', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Choose what reaches you' })).toBeVisible();
    await expect(
      page.getByText('Email delivery is not configured yet.', { exact: false }),
    ).toBeVisible();
    const mentions = page.getByRole('checkbox', { name: 'Mentions', exact: true });
    await page.getByRole('button', { name: 'Select none', exact: true }).click();
    await expect(mentions).not.toBeChecked();
    await mentions.check();
    await expect(mentions).toBeChecked();
    await page.getByRole('combobox', { name: 'Email updates', exact: true }).selectOption('daily');
    await page
      .getByRole('checkbox', {
        name: 'Remind me when assigned or reported work is due today',
        exact: true,
      })
      .check();
    const references: string[] = [];
    let attempts = 0;
    await page.route(
      '**/api/v1/notifications/preferences',
      async route => {
        if (route.request().method() !== 'PUT') {
          await route.continue();
          return;
        }
        references.push(route.request().headers()['idempotency-key'] ?? '');
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        attempts++;
        if (attempts === 1) await route.abort('failed');
        else {
          expect(
            zSavedNotificationPreferencesView.parse(await response.json()).receipt.replayed,
          ).toBe(true);
          await route.fulfill({ response });
        }
      },
      { times: 2 },
    );
    await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Retry preference save', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Retry preference save', exact: true }).click();
    await expect(page.getByText('Notification preferences saved.', { exact: true })).toBeVisible();
    expect(references).toHaveLength(2);
    expect(references[0]).toBe(references[1]);
    await page.getByRole('button', { name: 'Reload saved preferences', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: 'Mentions', exact: true })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Comments', exact: true })).not.toBeChecked();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/notification-preferences-mobile.png',
      fullPage: true,
    });
  } finally {
    const current = zNotificationPreferencesView.parse(
      await (
        await request.get(apiOrigin + '/api/v1/notifications/preferences', {
          headers: { Authorization: auth },
        })
      ).json(),
    );
    const restored = await request.put(apiOrigin + '/api/v1/notifications/preferences', {
      headers: { Authorization: auth, 'Idempotency-Key': crypto.randomUUID() },
      data: {
        inAppEnabled: before.inAppEnabled,
        events: before.events,
        emailMode: before.emailMode,
        dueReminders: before.dueReminders,
        expectedRevision: current.revision,
      },
    });
    expect(restored.status()).toBe(200);
  }
});
test('company history searches readable issue keys and company dates', async ({
  page,
  request,
}) => {
  const auth = 'Bearer ' + (await token('owner'));
  const me = zInboxSummary.parse(
    await (
      await request.get(apiOrigin + '/api/v1/notifications/summary', {
        headers: { Authorization: auth },
      })
    ).json(),
  );
  const created = zSavedIssueView.parse(
    await (
      await request.post(
        apiOrigin + '/api/v1/projects/20000000-0000-4000-8000-000000000001/issues',
        {
          headers: { Authorization: auth, 'Idempotency-Key': crypto.randomUUID() },
          data: { title: 'Readable history · تاريخ العمل ' + crypto.randomUUID() },
        },
      )
    ).json(),
  ).result;
  await signIn(page, 'owner', '/admin/activity', /^Company activity$/);
  await page.getByLabel('Issue key', { exact: true }).fill(created.summary.key.toLowerCase());
  await page.getByLabel('From date', { exact: true }).fill(me.companyToday);
  await page.getByLabel('To date', { exact: true }).fill(me.companyToday);
  await expect(page.locator('#activity-status')).toContainText('1 matching events');
  const row = page.getByRole('region', { name: 'Activity events' }).locator('article');
  await expect(row).toContainText('created an issue');
  await expect(row.getByRole('link', { name: created.summary.key, exact: true })).toBeVisible();
  await expect(row).toContainText(created.summary.title);
  await expect(row.locator('.technical-id')).not.toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: process.env['GATEGOLD_E2E_EVIDENCE'] + '/readable-company-activity.png',
    fullPage: true,
  });
  await row.getByRole('link', { name: created.summary.key, exact: true }).click();
  await expect(
    page.getByRole('heading', { name: created.summary.title, exact: true }),
  ).toBeVisible();
});
