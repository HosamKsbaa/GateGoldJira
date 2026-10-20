import {expect} from '@playwright/test';
import {test} from './support/browser-test';
import {useCase as recordUseCase} from './support/use-case';
function useCase<T>(id:string,body:()=>Promise<T>){return recordUseCase(id,body,'web');}
import {signIn, fillCredentials, apiOrigin, token, localFixturesAvailable} from './support/session';
import {isolatedProject} from './support/project';
import {save} from './support/coverage-access';
import {LocalAuthServer,signInOnLocalServer} from './support/isolated-local-identity';
import {zSavedModernIssueView,zSavedProjectView,zSavedUserView,zSearchIssuesV2Body} from '../src/app/api/generated/zod.gen';
test.skip(!localFixturesAvailable,'Requires the isolated local company.');
test.use({trace:'off'});

test('workspace summaries, navigation and viewport controls have observable outcomes',async({page})=>{
  await signIn(page,'owner');
  await useCase('UC-SHL-0001',async()=>{await expect(page.getByRole('heading',{name:/Welcome,/})).toBeVisible();});
  await useCase('UC-SHL-0015',async()=>{await expect(page.getByText('Africa/Cairo',{exact:true})).toBeVisible();});
  await useCase('UC-SHL-0016',async()=>{await page.getByRole('link',{name:'Manage users',exact:true}).click();await expect(page).toHaveURL(/\/admin\/users$/);});
  await useCase('UC-SHL-0017',async()=>{await page.getByRole('link',{name:'GateGoldJira home'}).click();await expect(page.getByRole('heading',{name:/Welcome,/})).toBeVisible();});
  for(const [id,label,query] of [
    ['UC-SHL-0005','Assigned to me','assignee=self'],['UC-SHL-0006','Ready for review','status=review'],['UC-SHL-0007','Blocked work','blocked=true'],
  ] as const){
    await useCase(id,async()=>{await page.locator('.stat-card').filter({hasText:label}).click();await expect(page).toHaveURL(new RegExp(query));});
    await page.getByRole('link',{name:'GateGoldJira home'}).click();
  }
  await useCase('UC-SHL-0008',async()=>{await page.locator('.stat-card').filter({hasText:'Active projects'}).click();await expect(page.getByRole('heading',{name:'Projects',exact:true})).toBeVisible();});
  await useCase('UC-SHL-0018',async()=>{await page.getByRole('button',{name:'Collapse sidebar',exact:true}).click();await expect(page.getByRole('navigation',{name:'Main navigation',exact:true})).toHaveCount(0);});
  await useCase('UC-SHL-0019',async()=>{await page.getByRole('button',{name:'Expand sidebar',exact:true}).click();await expect(page.getByRole('navigation',{name:'Main navigation',exact:true})).toBeVisible();});
  await page.setViewportSize({width:390,height:844});
  await useCase('UC-SHL-0020',async()=>{await page.getByRole('button',{name:'Toggle navigation'}).click();await expect(page.getByRole('dialog',{name:'Workspace navigation'})).toBeVisible();await expect(page.locator('#main-content')).toHaveAttribute('inert','');});
  await useCase('UC-SHL-0021',async()=>{await page.getByRole('button',{name:'Close navigation'}).click({position:{x:380,y:600}});await expect(page.getByRole('dialog',{name:'Workspace navigation'})).toHaveCount(0);});
  await page.getByRole('button',{name:'Toggle navigation'}).click();
  await useCase('UC-SHL-0022',async()=>{await page.getByRole('dialog',{name:'Workspace navigation'}).press('Escape');await expect(page.getByRole('dialog',{name:'Workspace navigation'})).toHaveCount(0);});
  await page.getByRole('button',{name:'Toggle navigation'}).click();
  await useCase('UC-SHL-0023',async()=>{for(let i=0;i<15;i++)await page.keyboard.press('Tab');await expect(page.getByRole('dialog',{name:'Workspace navigation'})).toContainText('Workspace');expect(await page.locator('#workspace-sidebar').evaluate(el=>el.contains(document.activeElement))).toBe(true);});
  await useCase('UC-SHL-0024',async()=>{await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('link',{name:'Issues',exact:true}).click();await expect(page).toHaveURL(/\/issues$/);await expect(page.getByRole('dialog',{name:'Workspace navigation'})).toHaveCount(0);});
  await page.getByRole('button',{name:'Toggle navigation'}).click();
  await useCase('UC-SHL-0025',async()=>{await page.setViewportSize({width:1440,height:900});await expect(page.getByRole('dialog',{name:'Workspace navigation'})).toHaveCount(0);await expect(page.getByRole('navigation',{name:'Main navigation',exact:true})).toBeVisible();});
  await useCase('UC-SHL-0026',async()=>{const before=page.url();const skip=page.getByRole('link',{name:'Skip to content'});await skip.focus();await skip.press('Enter');await expect(page.locator('#main-content')).toBeFocused();await expect(page).toHaveURL(before);await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();});
  await useCase('UC-SHL-0033',async()=>{await page.getByRole('link',{name:'Account MCP tokens'}).click();await expect(page).toHaveURL(/\/account\/mcp-tokens$/);});
  await useCase('UC-SHL-0034',async()=>{await page.getByRole('link',{name:'Notifications',exact:true}).click();await expect(page.getByRole('heading',{name:'Inbox',exact:true})).toBeVisible();});
  await useCase('UC-SHL-0078',async()=>{await page.goBack();await expect(page).toHaveURL(/\/account\/mcp-tokens$/);});
  await useCase('UC-SHL-0079',async()=>{await page.goForward();await expect(page).toHaveURL(/\/notifications$/);});
  await useCase('UC-SHL-0045',async()=>{await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.getByLabel('Username',{exact:true})).toBeVisible();await expect(page.getByRole('navigation',{name:'Main navigation',exact:true})).toHaveCount(0);await expect(page.getByRole('combobox',{name:'Search all issues'})).toHaveCount(0);});
});

test('global suggestions search numbers keys and Arabic while preserving current request ownership',async({page,request})=>{
  const project=await isolatedProject(request);
  const prefix='فهرس البحث '+crypto.randomUUID();
  const created=await request.post(apiOrigin+`/api/v2/projects/${project}/issues`,{headers:{Authorization:'Bearer '+await token('member'),'Idempotency-Key':crypto.randomUUID()},data:{title:prefix+' 0'}});
  expect(created.status()).toBe(201);
  const issue=zSavedModernIssueView.parse(await created.json()).result;
  await signIn(page,'member');
  const input=page.getByRole('combobox',{name:'Search all issues'});
  for(const [id,query] of [['UC-SHL-0046',issue.summary.number],['UC-SHL-0047',issue.summary.key],['UC-SHL-0048',issue.summary.title],['UC-SHL-0049','فهرس البحث']] as const){
    await useCase(id,async()=>{await input.fill(query);await expect(page.getByRole('listbox',{name:'Matching issues'}).getByRole('link').filter({hasText:issue.summary.key})).toBeVisible();});
  }
  for(let i=1;i<10;i++)expect((await request.post(apiOrigin+`/api/v2/projects/${project}/issues`,{headers:{Authorization:'Bearer '+await token('member'),'Idempotency-Key':crypto.randomUUID()},data:{title:prefix+' '+i}})).status()).toBe(201);
  await useCase('UC-SHL-0055',async()=>{await input.fill(prefix);await expect(page.locator('#global-issue-options [role=option]')).toHaveCount(8);await expect(page.getByRole('button',{name:/View all results/})).toContainText('10');});
  await useCase('UC-SHL-0059',async()=>{await input.press('Escape');await expect(input).toHaveAttribute('aria-expanded','false');});
  await useCase('UC-SHL-0050',async()=>{await input.fill('');await expect(input).toHaveAttribute('aria-expanded','false');});
  await useCase('UC-SHL-0052',async()=>{await input.fill('no match '+crypto.randomUUID());await expect(page.getByText('No matching issues.',{exact:true})).toBeVisible();});
  await input.fill(issue.summary.key);
  await expect(page.getByRole('listbox',{name:'Matching issues'}).getByRole('link')).toHaveCount(1);
  await useCase('UC-SHL-0058',async()=>{await input.press('ArrowDown');await input.press('Enter');await expect(page).toHaveURL(new RegExp('/issues/'+issue.summary.id+'$'));});
  await useCase('UC-SHL-0040',async()=>{await expect(page.locator('.project-context')).toContainText(issue.summary.key.split('-')[0]!);});
});

test('dashboard distinguishes pending reads, failed reads and successful explicit retry',async({page})=>{
  let mode:'hold'|'fail'|'pass'='hold',release=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/v2/issues/search',async route=>{if(mode==='hold')await held;if(mode==='fail')await route.abort('failed');else await route.continue();});
  try {
    await signIn(page,'member');
    await useCase('UC-SHL-0002',async()=>{await expect(page.getByRole('status').filter({hasText:'Loading your workspace'})).toBeVisible();});
    mode='fail';release();
    await useCase('UC-SHL-0003',async()=>{await expect(page.getByRole('alert')).toBeVisible();await expect(page.getByRole('button',{name:'Refresh workspace'})).toBeEnabled();});
    mode='pass';
    await useCase('UC-SHL-0004',async()=>{await page.getByRole('button',{name:'Refresh workspace'}).click();await expect(page.locator('.workspace-stats')).toBeVisible();await expect(page.getByRole('alert')).toHaveCount(0);});
  } finally {release();}
});

test('dashboard project actions and project navigation preserve exact project context',async({page,request})=>{
  const project=await isolatedProject(request);
  await signIn(page,'member');
  const first=page.locator('.workspace-project').first();await expect(first).toBeVisible();
  const href=await first.locator('.project-title a').getAttribute('href');if(!href)throw new Error('Missing actual project URL.');
  const id=href.split('/').at(-1)!;
  await useCase('UC-SHL-0009',async()=>{await first.locator('.project-title a').click();await expect(page).toHaveURL(new RegExp('/projects/'+id+'$'));});
  await page.getByRole('link',{name:'GateGoldJira home'}).click();
  await useCase('UC-SHL-0010',async()=>{await first.getByRole('link',{name:'Board',exact:true}).click();await expect(page).toHaveURL(new RegExp('/boards/project/'+id+'$'));});
  await page.getByRole('link',{name:'GateGoldJira home'}).click();
  await useCase('UC-SHL-0011',async()=>{await first.getByRole('link',{name:'Issues',exact:true}).click();await expect(page).toHaveURL(new RegExp('/issues\\?projectId='+id+'$'));});
  await signIn(page,'member','/projects/'+project,/Isolated workflow/);
  const nav=page.getByRole('navigation',{name:'Project navigation',exact:true});
  for(const [caseId,label,path] of [
    ['UC-SHL-0027','Project issues','/issues?projectId='+project],['UC-SHL-0028','Project backlog','/backlog/'+project],
    ['UC-SHL-0029','Epics & releases','/projects/'+project+'/planning'],['UC-SHL-0030','Project reports','/projects/'+project+'/reports'],
    ['UC-SHL-0031','Import & export','/projects/'+project+'/import-export'],['UC-SHL-0032','Manage boards','/boards/project/'+project],
  ] as const)await useCase(caseId,async()=>{await nav.getByRole('link',{name:label,exact:true}).click();await expect(page).toHaveURL(new URL(path,page.url()).href);await expect(page.locator('a.project-context')).toHaveAttribute('href','/projects/'+project);});
  await nav.getByRole('link',{name:'Project backlog',exact:true}).click();
  await expect(page).toHaveURL(new URL('/backlog/'+project,page.url()).href);
  await expect(page.getByRole('heading',{name:'Backlog',exact:true})).toBeVisible();
  await useCase('UC-SHL-0039',async()=>{await page.getByRole('link',{name:'Create issue',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();expect(new URL(page.url()).searchParams.get('view')).toBe('backlog');expect(new URL(page.url()).searchParams.get('projectId')).toBe(project);});
});

test('global search pending, failure, retry and view-all controls use the latest real query',async({page})=>{
  await signIn(page,'member');
  const input=page.getByRole('combobox',{name:'Search all issues'});
  let fail=true,release=()=>{};
  const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/v2/issues/search',async route=>{await held;if(fail)await route.abort('failed');else await route.continue();});
  try {
    await useCase('UC-SHL-0051',async()=>{await input.fill('DEMO-2');await expect(page.getByRole('status').filter({hasText:'Searching issues'})).toBeVisible();await expect(page.getByRole('listbox',{name:'Matching issues'}).getByRole('option')).toHaveCount(0);});
    release();
    await useCase('UC-SHL-0053',async()=>{await expect(page.getByRole('alert').filter({hasText:/request|search|connection/i})).toBeVisible();await expect(page.getByRole('button',{name:'Retry search'})).toBeEnabled();});
    fail=false;
    await useCase('UC-SHL-0054',async()=>{await page.getByRole('button',{name:'Retry search'}).click();await expect(page.getByRole('listbox',{name:'Matching issues'})).toContainText('DEMO-2');});
    await useCase('UC-SHL-0057',async()=>{await useCase('UC-SHL-0082',async()=>{await page.getByRole('button',{name:/View all results/}).click();await expect(page).toHaveURL(/\/issues\?query=DEMO-2$/);await expect(input).toHaveAttribute('aria-expanded','false');await expect(input).toHaveAttribute('aria-busy','false');});await expect(page.getByLabel('Search by title or issue key',{exact:true})).toHaveValue('DEMO-2');});
    await input.fill('DEMO-3');
    await useCase('UC-SHL-0056',async()=>{await page.getByRole('listbox',{name:'Matching issues'}).getByRole('link').click();await expect(page.getByRole('heading',{name:'مراجعة الواجهة',exact:true})).toBeVisible();await expect(input).toHaveAttribute('aria-expanded','false');});
  } finally {release();}
});

test('shared label picker opens, pages, rejects stale choices and removes exactly the selected chip',async({page,request})=>{
 const project=await isolatedProject(request),prefix='Picker '+crypto.randomUUID().slice(0,8)+' ';
 for(let i=0;i<28;i++)expect((await request.post(apiOrigin+`/api/v1/projects/${project}/labels`,{headers:{Authorization:'Bearer '+await token('member'),'Idempotency-Key':crypto.randomUUID()},data:{name:prefix+String(i).padStart(2,'0')}})).status()).toBe(201);
 await signIn(page,'member','/issues?projectId='+project+'&create=true',/^Issues$/);
 const dialog=page.getByRole('dialog');
 await expect(dialog.getByRole('heading',{name:'Create issue',exact:true})).toBeVisible();
 await dialog.locator('.optional-fields > summary').click();
 const picker=dialog.locator('gg-searchable-picker').filter({has:page.getByRole('combobox',{name:'Labels',exact:true})});
 const query=picker.getByRole('combobox',{name:'Labels',exact:true}),choices=picker.getByRole('listbox',{name:'Labels choices',exact:true});
 await useCase('UC-SHL-0063',async()=>{await query.focus();await expect(query).toHaveAttribute('aria-expanded','true');await expect(choices.getByRole('option')).toHaveCount(25);});
 await useCase('UC-SHL-0066',async()=>{await picker.getByRole('button',{name:'Load more labels choices',exact:true}).click();await expect(choices.getByRole('option')).toHaveCount(28);});
 let release=()=>{};const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route(`**/api/v1/projects/${project}/labels?*`,async route=>{const response=await route.fetch();await held;await route.fulfill({response});});
 try {
  await useCase('UC-SHL-0065',async()=>{await query.fill(prefix+'27');await expect(query).toHaveAttribute('aria-busy','true');await expect(picker.locator('[role=option] button:not(:disabled)')).toHaveCount(0);});
 } finally {release();}
 await expect(choices.getByRole('option')).toHaveCount(1);await choices.getByRole('option',{name:prefix+'27',exact:true}).getByRole('button').click();
 await useCase('UC-SHL-0064',async()=>{await expect(picker.getByRole('button',{name:'Remove '+prefix+'27',exact:true})).toBeVisible();await picker.getByRole('button',{name:'Remove '+prefix+'27',exact:true}).click();await expect(picker.locator('.selected-chip')).toHaveCount(0);});
 await useCase('UC-SHL-0067',async()=>{
  await query.click();await expect(query).toHaveAttribute('aria-expanded','true');
  await picker.getByRole('button',{name:'Done choosing',exact:true}).click();await expect(query).toHaveAttribute('aria-expanded','false');
  await query.click();await expect(query).toHaveAttribute('aria-expanded','true');await query.press('Escape');await expect(query).toHaveAttribute('aria-expanded','false');
  await query.click();await expect(query).toHaveAttribute('aria-expanded','true');await dialog.getByRole('heading',{name:'Create issue',exact:true}).click();await expect(query).toHaveAttribute('aria-expanded','false');
 });
});


test('global suggestions stay within the viewport after resize and never cross a same-SPA account switch',async({page,request})=>{
 const ownerHeaders={Authorization:'Bearer '+await token('owner'),'Idempotency-Key':crypto.randomUUID()};
 const projectResponse=await request.post(apiOrigin+'/api/v1/projects',{headers:ownerHeaders,data:{key:'P'+crypto.randomUUID().replaceAll('-','').slice(0,7).toUpperCase(),name:'Private search project'}});
 expect(projectResponse.status()).toBe(201);const project=zSavedProjectView.parse(await projectResponse.json()).result;
 const issueResponse=await request.post(apiOrigin+`/api/v2/projects/${project.id}/issues`,{headers:{...ownerHeaders,'Idempotency-Key':crypto.randomUUID()},data:{title:'Owner-only search result'}});
 expect(issueResponse.status()).toBe(201);const issue=zSavedModernIssueView.parse(await issueResponse.json()).result;
 await signIn(page,'owner');const query=page.getByRole('combobox',{name:'Search all issues'}),results=page.locator('.global-search-results');
 await query.fill(issue.summary.key);await expect(results).toContainText(issue.summary.key);
 await useCase('UC-SHL-0062',async()=>{
  for(const viewport of [{width:1024,height:844},{width:768,height:620},{width:1440,height:900}]){
   await page.setViewportSize(viewport);await expect(results).toBeVisible();
   await expect.poll(async()=>{const box=await results.boundingBox();return !!box && box.x>=7 && box.y>=7 && box.x+box.width<=viewport.width-7 && box.y+box.height<=viewport.height-7;}).toBe(true);
  }
 });
 await query.fill('');let release=()=>{},requested=()=>{};const held=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{requested=resolve;});
 await page.route('**/api/v2/issues/search',async route=>{
  const body=zSearchIssuesV2Body.parse(route.request().postDataJSON());
  if(body.filters.query!==issue.summary.title){await route.continue();return;}
  const response=await route.fetch();requested();await held;try{await route.fulfill({response});}catch{/* The old session canceled its transport. */}
 });
 try{
  await useCase('UC-SHL-0061',async()=>{
   await query.fill(issue.summary.title);await started;await expect(query).toHaveAttribute('aria-busy','true');
   const marker=crypto.randomUUID();await page.evaluate(value=>{document.body.dataset['sessionProbe']=value;},marker);
   await page.getByRole('button',{name:'Sign out',exact:true}).click();await fillCredentials(page,'member');await page.getByRole('button',{name:'Sign in locally',exact:true}).click();
   await expect(page.getByRole('heading',{name:/Welcome,/})).toBeVisible();expect(await page.evaluate(()=>document.body.dataset['sessionProbe'])).toBe(marker);
   release();await expect(query).toHaveValue('');await expect(query).toHaveAttribute('aria-busy','false');await expect(query).toHaveAttribute('aria-expanded','false');
   // The native popover remains mounted while closed. Its private choices must
   // be cleared as well as hidden when the account changes.
   await expect(results).toBeHidden();await expect(results.getByRole('option')).toHaveCount(0);await expect(results).not.toContainText(issue.summary.title);
   await query.fill(issue.summary.key);await expect(page.getByText('No matching issues.',{exact:true})).toBeVisible();await expect(results).not.toContainText(issue.summary.title);
  });
 }finally{release();}
});

test('foreground summary refresh respects visibility, offline recovery and pending ownership',async({page,context})=>{
 await page.clock.install();
 const initial=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/notifications/summary' && response.status()===200);
 await signIn(page,'member');await expect(page.locator('.workspace-stats')).toBeVisible();await initial;await page.clock.runFor(1);
 let requests=0,release=()=>{},started=()=>{};const held=new Promise<void>(resolve=>{release=resolve;}),pending=new Promise<void>(resolve=>{started=resolve;});
 const completed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/notifications/summary' && response.status()===200);
 await page.route('**/api/v1/notifications/summary',async route=>{requests++;const response=await route.fetch();started();await held;await route.fulfill({response});});
 try{
  await useCase('UC-SHL-0075',async()=>{
   await page.clock.runFor(30000);await pending;expect(requests).toBe(1);
   await page.clock.runFor(60000);expect(requests).toBe(1);await expect(page.locator('.workspace-stats')).toBeVisible();
  });
 }finally{release();}
 await completed;await page.clock.runFor(50);
 await page.unroute('**/api/v1/notifications/summary');
 // Browser lifecycle state is a controlled environmental precondition; every
 // observed refresh still goes through the running app and real HTTP server.
 await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'}));
 let hiddenRequests=0;page.on('request',request=>{if(new URL(request.url()).pathname==='/api/v1/notifications/summary')hiddenRequests++;});
 await useCase('UC-SHL-0076',async()=>{await page.clock.runFor(60000);expect(hiddenRequests).toBe(0);await expect(page.locator('.workspace-stats')).toBeVisible();});
 await context.setOffline(true);await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});document.dispatchEvent(new Event('visibilitychange'));});
 await page.clock.runFor(30000);expect(hiddenRequests).toBe(0);
 await useCase('UC-SHL-0077',async()=>{
  const refreshed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/v1/notifications/summary' && response.status()===200);
  await context.setOffline(false);await refreshed;expect(hiddenRequests).toBe(1);await expect(page.locator('.workspace-stats')).toBeVisible();
 });
});


test('an active account with no projects sees real empty states and no unavailable creation action',async({page,request},info)=>{
 const username='fresh-'+crypto.randomUUID().slice(0,8);
 const approved=(await save(request,'/api/v1/admin/users',{email:username+'@example.test',displayName:'Fresh empty workspace '+username,administrator:false},zSavedUserView,{method:'POST',status:201})).result;
 const server=new LocalAuthServer(info);await server.prepare();const credentials=await server.addIdentity(username,approved.email);
 try{
  await server.start();await signInOnLocalServer(page,server,credentials);await expect(page.locator('.workspace-stats')).toBeVisible();
  await useCase('UC-SHL-0012',async()=>{const empty=page.locator('.empty-workspace');await expect(empty.getByRole('heading',{name:'No projects yet',exact:true})).toBeVisible();await expect(empty.getByRole('link',{name:'Open projects',exact:true})).toHaveAttribute('href','/projects');await expect(page.locator('.workspace-project')).toHaveCount(0);});
  await useCase('UC-SHL-0014',async()=>{await expect(page.getByRole('heading',{name:'You’re all caught up',exact:true})).toBeVisible();await expect(page.locator('.work-list a')).toHaveCount(0);});
  await useCase('UC-SHL-0038',async()=>{await expect(page.getByRole('banner').getByRole('link',{name:'Create issue',exact:true})).toHaveCount(0);await expect(page.locator('.stat-card').filter({hasText:'Active projects'}).locator('strong')).toHaveText('0');});
  await useCase('UC-NTF-0035',async()=>{
   await page.getByRole('navigation',{name:'Main navigation',exact:true}).getByRole('link',{name:'Inbox',exact:true}).click();await expect(page.getByRole('heading',{name:'Inbox',exact:true})).toBeVisible();
   await expect(page.getByRole('checkbox',{name:'Unread only',exact:true})).not.toBeChecked();const empty=page.locator('.empty-inbox');await expect(empty.getByRole('heading',{name:'Nothing here yet',exact:true})).toBeVisible();
   await expect(empty).toContainText('Assignments, mentions, comments, and updates will appear here.');await expect(page.locator('.notification-record')).toHaveCount(0);await expect(page.locator('#inbox-summary')).toHaveText('0 unread · 0 matching notifications');
  });
 }finally{try{await server.stop();}finally{await save(request,'/api/v1/admin/users/'+approved.id,{expectedRevision:approved.revision,email:approved.email,displayName:approved.displayName,administrator:false,active:false},zSavedUserView);}}
});
