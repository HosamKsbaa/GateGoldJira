import {expect, type APIRequestContext} from '@playwright/test';
import {test} from './support/browser-test';
import {useCase} from './support/use-case';
import {signIn,configureLocalSignIn,fillCredentials,localFixturesAvailable} from './support/session';
import {read,save,memberId} from './support/coverage-access';
import {isolatedProject,useModernIssues} from './support/project';
import {zSavedProjectView,zSavedMembershipView,zPageMembershipView,zPageBoardSummary,zProjectView,zSavedModernIssueView,zNotificationPreferencesView,zSavedNotificationPreferencesView,zInboxSummary,zSavedLabelView} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable,'Requires the isolated local app and approved accounts.');
test.use({trace:'off'});
test.setTimeout(60_000);
const web=<T>(id:string,body:()=>Promise<T>)=>useCase(id,body,'web');

async function namedProject(request:APIRequestContext,name:string,shared=true){
 const project=(await save(request,'/api/v1/projects',{key:'X'+crypto.randomUUID().replaceAll('-','').slice(0,8).toUpperCase(),name},zSavedProjectView,{method:'POST',status:201})).result;
 if(shared)await save(request,'/api/v1/projects/'+project.id+'/memberships/'+memberId,{expectedRevision:'0',role:'member'},zSavedMembershipView);
 return project;
}

test('assigned workspace rows, unread indicators and current-project creation open their real destinations',async({page,request})=>{
 const project=await isolatedProject(request);await useModernIssues(project);
 const original=await read(request,'/api/v1/notifications/preferences',zNotificationPreferencesView,'member');
 try{
  await save(request,'/api/v1/notifications/preferences',{expectedRevision:original.revision,inAppEnabled:true,emailMode:'off',dueReminders:false,events:['assignment']},zSavedNotificationPreferencesView,{role:'member'});
  const issue=(await save(request,'/api/v2/projects/'+project+'/issues',{title:'Assigned workspace destination '+crypto.randomUUID(),assigneeId:memberId},zSavedModernIssueView,{method:'POST',status:201})).result;
  await signIn(page,'member');
  const count=(await read(request,'/api/v1/notifications/summary',zInboxSummary,'member')).unreadCount;
  await web('UC-SHL-0035',async()=>{
   expect(BigInt(count)).toBeGreaterThan(0n);
   await expect(page.getByRole('navigation',{name:'Main navigation',exact:true}).locator('.nav-count')).toHaveText(String(count)+' unread');
   const header=page.getByRole('banner').getByRole('link',{name:/Notifications/});await expect(header.locator('.notification-dot')).toBeVisible();
  });
  await web('UC-SHL-0013',async()=>{await page.locator('.work-list').getByRole('link').filter({hasText:issue.summary.key}).click();await expect(page).toHaveURL(new RegExp('/issues/'+issue.summary.id+'$'));await expect(page.getByRole('heading',{name:issue.summary.title,exact:true})).toBeVisible();});
  await expect(page.locator('.project-context')).toHaveAttribute('href','/projects/'+project);
  await web('UC-SHL-0036',async()=>{await page.getByRole('banner').getByRole('link',{name:'Create issue',exact:true}).click();await expect(page.getByRole('dialog',{name:'Create issue',exact:true})).toBeVisible();expect(new URL(page.url()).searchParams.get('projectId')).toBe(project);});
 }finally{
  const current=await read(request,'/api/v1/notifications/preferences',zNotificationPreferencesView,'member');
  await save(request,'/api/v1/notifications/preferences',{expectedRevision:current.revision,inAppEnabled:original.inAppEnabled,emailMode:original.emailMode,dueReminders:original.dueReminders,events:original.events},zSavedNotificationPreferencesView,{role:'member'});
 }
});

test('a real label popup flips above the field and aligns naturally with Arabic input',async({page,request})=>{
 const project=await isolatedProject(request);await useModernIssues(project);
 const prefix='خيارات '+crypto.randomUUID().slice(0,8);
 for(let i=0;i<28;i++)await save(request,'/api/v1/projects/'+project+'/labels',{name:prefix+' '+String(i).padStart(2,'0')},zSavedLabelView,{method:'POST',status:201,role:'member'});
 await page.setViewportSize({width:780,height:480});await signIn(page,'member','/issues?projectId='+project+'&create=true',/^Issues$/);
 const dialog=page.getByRole('dialog',{name:'Create issue',exact:true});await dialog.locator('.optional-fields > summary').click();
 const picker=dialog.locator('gg-searchable-picker').filter({has:page.getByRole('combobox',{name:'Labels',exact:true})}),query=picker.getByRole('combobox',{name:'Labels',exact:true}),panel=picker.locator('.picker-results');
 await query.evaluate(element=>element.scrollIntoView({block:'end'}));await query.fill(prefix);await expect(query).toHaveAttribute('aria-busy','false');await expect(panel.getByRole('option')).toHaveCount(25);
 await web('UC-SHL-0068',async()=>{
  await expect.poll(async()=>{const field=await query.boundingBox(),popup=await panel.boundingBox();return !!field && !!popup && field.y>480-(field.y+field.height) && 480-(field.y+field.height)<220 && popup.y>=8 && popup.y+popup.height<=field.y-4;}).toBe(true);
  const popup=await panel.boundingBox();expect(popup).not.toBeNull();expect(popup!.x).toBeGreaterThanOrEqual(8);expect(popup!.x+popup!.width).toBeLessThanOrEqual(772);
 });
 await web('UC-SHL-0069',async()=>{
  expect(await query.evaluate(element=>getComputedStyle(element).direction)).toBe('rtl');
  const field=await query.boundingBox(),popup=await panel.boundingBox();expect(field).not.toBeNull();expect(popup).not.toBeNull();
  expect(field!.x+field!.width-popup!.width).toBeGreaterThanOrEqual(8);expect(Math.abs(popup!.x+popup!.width-field!.x-field!.width)).toBeLessThanOrEqual(1);expect(popup!.x).toBeGreaterThanOrEqual(8);expect(popup!.x+popup!.width).toBeLessThanOrEqual(772);
 });
});

test('global creation chooses an active writable fallback when the current project is viewer-only',async({page,request})=>{
 const project=await namedProject(request,'000 Viewer workspace '+crypto.randomUUID().slice(0,8));
 const memberships=await read(request,'/api/v1/projects/'+project.id+'/memberships',zPageMembershipView);
 const membership=memberships.items.find(value=>value.user.id===memberId)!;
 await save(request,'/api/v1/projects/'+project.id+'/memberships/'+memberId,{expectedRevision:membership.revision,role:'viewer'},zSavedMembershipView);
 await signIn(page,'member','/projects/'+project.id,new RegExp('^'+project.name+'$'));
 await expect(page.locator('.project-context')).toContainText('viewer');
 await web('UC-SHL-0037',async()=>{
  const action=page.getByRole('banner').getByRole('link',{name:'Create issue',exact:true});await expect(action).toBeVisible();
  const href=await action.getAttribute('href');expect(href).not.toBeNull();const destination=new URL(href!,page.url()).searchParams.get('projectId');expect(destination).not.toBe(project.id);expect(destination).not.toBeNull();
  const fallback=await read(request,'/api/v1/projects/'+destination,zProjectView,'member');expect(fallback.archived).toBe(false);expect(['member','project_admin','administrator']).toContain(fallback.effectiveRole);
  await action.click();await expect(page.getByRole('dialog',{name:'Create issue',exact:true})).toBeVisible();expect(new URL(page.url()).searchParams.get('projectId')).toBe(fallback.id);
 });
});

test('board deep links and unknown routes establish the expected guarded shell context',async({page,request})=>{
 const project=await namedProject(request,'000 Deep board workspace '+crypto.randomUUID().slice(0,8));
 const boards=await read(request,'/api/v1/projects/'+project.id+'/boards',zPageBoardSummary);const board=boards.items.find(value=>value.default)!;
 await web('UC-SHL-0041',async()=>{
  await signIn(page,'member','/boards/'+board.id,/All Issues/);await expect(page.locator('.project-context')).toHaveAttribute('href','/projects/'+project.id);
  await expect(page.getByRole('navigation',{name:'Project navigation',exact:true}).getByRole('link',{name:'Board',exact:true})).toHaveAttribute('href','/boards/'+board.id);await expect(page.locator('.project-context')).toContainText(project.name);
 });
 await web('UC-SHL-0044',async()=>{await signIn(page,'member','/not-a-real-workspace-route-'+crypto.randomUUID());await expect(page).toHaveURL(/\/$/);await expect(page.getByRole('heading',{name:/Welcome,/})).toBeVisible();await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();});
});

test('a delayed project context cannot replace a later destination and failed access clears private context',async({page,request})=>{
 const a=await namedProject(request,'000 Context A '+crypto.randomUUID().slice(0,8)),b=await namedProject(request,'000 Context B '+crypto.randomUUID().slice(0,8));
 const privateProject=await namedProject(request,'Private context '+crypto.randomUUID().slice(0,8),false);
 await signIn(page,'member','/projects/'+b.id,new RegExp('^'+b.name+'$'));
 let release=()=>{},started=()=>{};const held=new Promise<void>(resolve=>{release=resolve;}),pending=new Promise<void>(resolve=>{started=resolve;});
 await page.route('**/api/v1/projects/'+a.id,async route=>{const response=await route.fetch();started();await held;try{await route.fulfill({response});}catch{/* A superseded page may cancel its transport. */}});
 try{
  await web('UC-SHL-0042',async()=>{
   const navigation=page.getByRole('navigation',{name:'Main navigation',exact:true});await navigation.getByRole('link',{name:'Projects',exact:true}).click();
   await page.getByRole('main').getByRole('link',{name:a.key+' · '+a.name,exact:true}).click();await pending;
   await navigation.getByRole('link',{name:'Projects',exact:true}).click();await page.getByRole('main').getByRole('link',{name:b.key+' · '+b.name,exact:true}).click();await expect(page.getByRole('heading',{name:b.name,exact:true})).toBeVisible();
   await expect(page.locator('.project-context')).toHaveAttribute('href','/projects/'+b.id);release();await expect(page.locator('.project-context')).toContainText(b.name);await expect(page.locator('.project-context')).not.toContainText(a.name);await expect(page).toHaveURL(new RegExp('/projects/'+b.id+'$'));
  });
 }finally{release();}
 await web('UC-SHL-0043',async()=>{
  await configureLocalSignIn(page);await page.goto('/projects/'+privateProject.id);await fillCredentials(page,'member');await page.getByRole('button',{name:'Sign in locally',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.project-context')).toHaveCount(0);await expect(page.getByRole('navigation',{name:'Project navigation',exact:true})).toHaveCount(0);await expect(page.getByRole('main')).not.toContainText(privateProject.name);
 });
});
