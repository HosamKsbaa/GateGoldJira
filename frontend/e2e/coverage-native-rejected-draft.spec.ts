import { expect } from '@playwright/test';
import { test } from './support/browser-test';
import { apiOrigin, localFixturesAvailable, signIn, fillCredentials } from './support/session';
import { coverageProject, coverageCreate, coverageHeaders, coverageRead } from './support/coverage-issues';
import { zPageMembershipView, zSavedMembershipView, zModernIssueView } from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable, 'Requires real permission changes and isolated local identities.');
test.use({ trace: 'off' });
for (const boundary of ['read-revoked','account-switched'] as const) test('a rejected full editor cannot restore its old draft after ' + boundary, async ({ page, request }) => {
  const projectId = await coverageProject(request), issue = await coverageCreate(request, projectId);
  await signIn(page,'member','/issues/'+issue.summary.id,new RegExp('^'+issue.summary.title+'$')); await page.getByRole('button',{name:'Edit issue',exact:true}).click(); const dialog = page.getByRole('dialog',{name:'Edit '+issue.summary.key,exact:true}); await dialog.getByLabel('Issue title',{exact:true}).fill('Private rejected intention must not revive');
  const members = await request.get(`${apiOrigin}/api/v1/projects/${projectId}/memberships`,{headers:await coverageHeaders('owner')});expect(members.status()).toBe(200);const member = zPageMembershipView.parse(await members.json()).items.find(value=>value.user.id==='10000000-0000-4000-8000-000000000002')!;
  const demotion = await request.put(`${apiOrigin}/api/v1/projects/${projectId}/memberships/${member.user.id}`,{headers:await coverageHeaders('owner'),data:{expectedRevision:member.revision,role:'viewer'}});expect(demotion.status()).toBe(200);const demoted = zSavedMembershipView.parse(await demotion.json()).result;
  let release!:()=>void, arrived=0, holding=true;const held = new Promise<void>(resolve=>release=resolve);const oldReplies:Promise<void>[]=[];
  await page.route('**/api/v2/issues/'+issue.summary.id,async route=>{
    if(route.request().method()!=='GET'||!holding){await route.continue();return;}
    if(boundary==='read-revoked') {
      if(arrived===0){arrived++;const removed=await request.post(`${apiOrigin}/api/v1/projects/${projectId}/memberships/${member.user.id}/remove`,{headers:await coverageHeaders('owner'),data:{expectedRevision:demoted.revision}});expect(removed.status()).toBe(200);release();}
      await held;const reply=await route.fetch();expect(reply.status()).toBe(404);await route.fulfill({response:reply});return;
    }
    const reply=await route.fetch();expect(reply.status()).toBe(200);arrived++;const done=held.then(async()=>{await route.fulfill({response:reply}).catch(()=>{});});oldReplies.push(done);await done;
  });
  try {
    const denied=page.waitForResponse(value=>value.request().method()==='PUT'&&value.url().endsWith('/api/v2/issues/'+issue.summary.id));await dialog.getByRole('button',{name:'Save issue',exact:true}).click();expect((await denied).status()).toBe(403);await expect.poll(()=>arrived).toBeGreaterThan(0);await expect(dialog).toHaveCount(0);
    if(boundary==='read-revoked') { await expect(page.getByRole('heading',{name:issue.summary.title,exact:true})).toHaveCount(0);await expect(page.getByText('Private rejected intention must not revive',{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Edit issue',exact:true})).toHaveCount(0); }
    else {
      const marker=crypto.randomUUID();await page.locator('html').evaluate((node,value)=>node.setAttribute('data-rejected-draft-session',value),marker);holding=false;
      await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page).toHaveURL(/\/sign-in/);await fillCredentials(page,'owner');await page.getByRole('button',{name:'Sign in locally',exact:true}).click();
      await expect(page.getByRole('heading',{name:'Welcome, Local Owner',exact:true})).toBeVisible();
      const search = page.getByRole('combobox',{name:'Search all issues',exact:true});
      await search.fill(issue.summary.key);const matches = page.getByRole('listbox',{name:'Matching issues',exact:true});await expect(matches.getByRole('option')).toHaveCount(1);await expect(matches).toContainText(issue.summary.key);await search.press('ArrowDown');await search.press('Enter');
      await expect(page.getByRole('heading',{name:issue.summary.title,exact:true})).toBeVisible();release();await Promise.all(oldReplies);await expect(page.locator('html')).toHaveAttribute('data-rejected-draft-session',marker);
      await expect(dialog).toHaveCount(0);await page.getByRole('button',{name:'Edit issue',exact:true}).click();await expect(dialog.getByLabel('Issue title',{exact:true})).toHaveValue(issue.summary.title);await expect(dialog.getByLabel('Issue title',{exact:true})).not.toHaveValue('Private rejected intention must not revive');
    }
    const retained = await request.get(`${apiOrigin}/api/v2/issues/${issue.summary.id}`, { headers: await coverageHeaders('owner') }); expect(retained.status()).toBe(200); expect(zModernIssueView.parse(await retained.json()).summary.title).toBe(issue.summary.title);
  } finally {holding=false;release();await page.unrouteAll({behavior:'wait'});}
});
