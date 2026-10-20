import { expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

export const apiOrigin = process.env['GATEGOLD_E2E_API'];
const directory = process.env['GATEGOLD_E2E_TOKENS'];
const accountsFile = process.env['GATEGOLD_E2E_ACCOUNTS'];
const accountList = z.object({
  accounts: z.array(z.object({ username: z.string().min(1), password: z.string().min(1) })),
});
export const localFixturesAvailable = !!apiOrigin && !!directory && !!accountsFile;
export async function token(name: string, channel: 'web' | 'mcp' = 'web'): Promise<string> {
  return (await readFile(join(directory ?? '', name + '-' + channel + '.token'), 'utf8')).trim();
}
export async function account(name: string): Promise<{ username: string; password: string }> {
  if (!accountsFile) throw new Error('The isolated browser runner must provide local accounts.');
  const rawAccounts: unknown = JSON.parse(await readFile(accountsFile, 'utf8'));
  const result = accountList
    .parse(rawAccounts)
    .accounts.find(candidate => candidate.username === name);
  if (!result) throw new Error('The required local fixture account was not generated.');
  return result;
}
export async function configureLocalSignIn(page: Page): Promise<void> {
  await page.route('**/config.local.json', route =>
    route.fulfill({
      json: {
        mode: 'development',
        apiBaseUrl: apiOrigin + '/api/v1',
        issuer: apiOrigin + '/development-identity/',
        clientId: 'local-development',
        audience: apiOrigin + '/api',
        scope: 'openid profile email gategoldjira:access',
      },
    }),
  );
}
export async function fillCredentials(page: Page, name: string): Promise<void> {
  const credentials = await account(name);
  await page.getByLabel('Username', { exact: true }).fill(credentials.username);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
}
export async function signIn(
  page: Page,
  name: string,
  destination = '/',
  heading = /Welcome,/,
): Promise<void> {
  await configureLocalSignIn(page);
  await page.goto(destination);
  await fillCredentials(page, name);
  // Authentication can finish before the requested lazy route is ready.
  // Keep that transition under the configured navigation budget; its heading
  // assertion still uses the normal assertion budget after navigation.
  await Promise.all([
    page.waitForURL(url => url.pathname !== '/sign-in'),
    page.getByRole('button', { name: 'Sign in locally' }).click(),
  ]);
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
}
