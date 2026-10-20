import {expect,type APIRequestContext} from '@playwright/test';
import {test} from './support/browser-test';
import {useCase as recordUseCase} from './support/use-case';
function useCase<T>(id:string,body:()=>Promise<T>){return recordUseCase(id,body,'rest');}
import {apiOrigin,token,localFixturesAvailable} from './support/session';
import {isolatedProject} from './support/project';
import {zSavedModernIssueView,zModernIssueView,zPageLabelView} from '../src/app/api/generated/zod.gen';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {resolve} from 'node:path';
test.skip(!localFixturesAvailable,'Requires isolated browser database.');
test.use({trace:'off'});
async function headers(name='member',reference:string=crypto.randomUUID()) {
  return {Authorization:'Bearer '+await token(name),'Idempotency-Key':reference};
}
async function create(request:APIRequestContext,project:string,reference:string=crypto.randomUUID()){
  const response=await request.post(apiOrigin+`/api/v2/projects/${project}/issues`,{headers:await headers('member',reference),data:{title:'Platform invariant'}});
  expect(response.status()).toBe(201);
  return zSavedModernIssueView.parse(await response.json());
}
async function operatorProbe(path:string,status:number,body:object):Promise<void>{
  const result=await promisify(execFile)('curl',['--silent','--show-error','--write-out','\n%{http_code}',apiOrigin+path]);
  const split=result.stdout.lastIndexOf('\n');
  expect(Number(result.stdout.slice(split+1))).toBe(status);
  expect(JSON.parse(result.stdout.slice(0,split)) as unknown).toEqual(body);
}
test('shared authorization, accepted retries, atomic validation and no-op behavior',async({request})=>{
  const project=await isolatedProject(request), ref=crypto.randomUUID();
  const created=await create(request,project,ref), issue=created.result;
  await useCase('UC-SYS-0001',async()=>{expect((await request.get(apiOrigin+'/api/v1/me')).status()).toBe(401);});
  await useCase('UC-SYS-0002',async()=>{expect((await request.get(apiOrigin+'/api/v1/me',{headers:await headers('disabled')})).status()).toBe(403);});
  await useCase('UC-SYS-0004',async()=>{expect((await request.post(apiOrigin+`/api/v2/projects/${project}/issues`,{headers:await headers('viewer'),data:{title:'Forbidden'}})).status()).toBe(403);});
  await useCase('UC-SYS-0005',async()=>{expect((await request.put(apiOrigin+`/api/v2/projects/${project}/issue-types/${crypto.randomUUID()}`,{headers:await headers(),data:{expectedRevision:'1',key:'denied',name:'Denied',behavior:'standard',retired:false}})).status()).toBe(403);});
  await useCase('UC-SYS-0009',async()=>{
    const replay=await create(request,project,ref);
    expect(replay.result.summary.id).toBe(issue.summary.id);expect(replay.receipt.replayed).toBe(true);
  });
  await useCase('UC-SYS-0010',async()=>{
    const response=await request.post(apiOrigin+`/api/v2/projects/${project}/issues`,{headers:await headers('member',ref),data:{title:'Changed payload'}});
    expect(response.status()).toBe(409);
    expect((await response.json() as {error:{code:string}}).error.code).toBe('retry_reference_reused');
  });
  await useCase('UC-SYS-0011',async()=>{
    const reference=crypto.randomUUID();const results=await Promise.all([create(request,project,reference),create(request,project,reference)]);
    expect(results[0]!.result.summary.id).toBe(results[1]!.result.summary.id);
    expect(results.filter(r=>r.receipt.replayed)).toHaveLength(1);
  });
  await useCase('UC-SYS-0012',async()=>{
    const response=await request.patch(apiOrigin+`/api/v2/issues/${issue.summary.id}/fields`,{headers:await headers(),data:{field:'dueDate',dueDate:{prior:null,value:null}}});
    expect(response.status()).toBe(200);
    expect(zSavedModernIssueView.parse(await response.json()).result.summary.revision).toBe(issue.summary.revision);
  });
  await useCase('UC-SYS-0013',async()=>{
    const response=await request.post(apiOrigin+`/api/v2/projects/${project}/issues`,{headers:await headers(),data:{title:'',dueDate:'invalid'}});
    expect(response.status()).toBe(422);
    const current=await request.get(apiOrigin+`/api/v2/issues/${issue.summary.id}`,{headers:await headers()});
    expect(zModernIssueView.parse(await current.json()).summary.revision).toBe(issue.summary.revision);
  });
  const membershipPath=apiOrigin+`/api/v1/projects/${project}/memberships/10000000-0000-4000-8000-000000000002/remove`;
  const membershipList=await request.get(apiOrigin+`/api/v1/projects/${project}/memberships`,{headers:await headers('owner')});
  const members=await membershipList.json() as {items:{user:{id:string};revision:string}[]};
  const revision=members.items.find(m=>m.user.id.endsWith('0002'))!.revision;
  expect((await request.post(membershipPath,{headers:await headers('owner'),data:{expectedRevision:revision}})).status()).toBe(200);
  await useCase('UC-SYS-0003',async()=>{expect((await request.get(apiOrigin+`/api/v2/issues/${issue.summary.id}`,{headers:await headers()})).status()).toBe(404);});
  await useCase('UC-SYS-0008',async()=>{expect((await request.post(apiOrigin+`/api/v2/projects/${project}/issues`,{headers:await headers('member',ref),data:{title:'Platform invariant'}})).status()).toBe(404);});
});

test('bounded pages authenticate cursor operation, caller and filter scope',async({request})=>{
  const project=await isolatedProject(request);
  const path=apiOrigin+`/api/v1/projects/${project}/labels`;
  for(let i=0;i<28;i++)expect((await request.post(path,{headers:await headers(),data:{name:'cursor '+String(i).padStart(2,'0')}})).status()).toBe(201);
  let cursor='';
  await useCase('UC-SYS-0015',async()=>{const r=await request.get(path,{headers:await headers()});expect(r.status()).toBe(200);const page=zPageLabelView.parse(await r.json());expect(page.items).toHaveLength(25);expect(page.totalMatching).toBe(28);expect(page.nextCursor).not.toBeNull();cursor=page.nextCursor!;});
  await useCase('UC-SYS-0016',async()=>{const r=await request.get(path+'?limit=100',{headers:await headers()});expect(r.status()).toBe(200);expect(zPageLabelView.parse(await r.json()).items).toHaveLength(28);});
  for(const [id,limit]of[['UC-SYS-0017','0'],['UC-SYS-0018','101']]as const)await useCase(id,async()=>{expect((await request.get(path+'?limit='+limit,{headers:await headers()})).status()).toBe(422);});
  await useCase('UC-SYS-0019',async()=>{expect((await request.get(path+'?cursor='+encodeURIComponent(cursor.slice(0,-8)+'AAAAAAAA'),{headers:await headers()})).status()).toBe(422);});
  await useCase('UC-SYS-0020',async()=>{expect((await request.get(path+'?cursor='+encodeURIComponent(cursor),{headers:await headers('viewer')})).status()).toBe(422);});
  await useCase('UC-SYS-0021',async()=>{expect((await request.get(apiOrigin+`/api/v1/projects/${project}/assignees?cursor=`+encodeURIComponent(cursor),{headers:await headers()})).status()).toBe(422);});
  await useCase('UC-SYS-0022',async()=>{expect((await request.get(path+'?query=cursor%2001&cursor='+encodeURIComponent(cursor),{headers:await headers()})).status()).toBe(422);});
  await useCase('UC-SYS-0024',async()=>{const r=await request.get(path+'?query=no-such-label',{headers:await headers()});expect(r.status()).toBe(200);const page=zPageLabelView.parse(await r.json());expect(page.items).toEqual([]);expect(page.nextCursor).toBeNull();expect(page.totalMatching).toBe(0);});
});

test('readiness reflects a real isolated database outage and recovers',async({request})=>{
  await useCase('UC-SYS-0025',async()=>{const r=await request.get(apiOrigin+'/healthz');expect(r.status()).toBe(200);expect(await r.json()).toEqual({status:'ok'});});
  await recordUseCase('UC-SYS-0025',()=>operatorProbe('/healthz',200,{status:'ok'}),'operator');
  await useCase('UC-SYS-0026',async()=>{const r=await request.get(apiOrigin+'/readyz');expect(r.status()).toBe(200);expect(await r.json()).toEqual({status:'ready'});});
  await recordUseCase('UC-SYS-0026',()=>operatorProbe('/readyz',200,{status:'ready'}),'operator');
  const database=process.env['GATEGOLD_E2E_DATABASE_NAME'];
  if(!database||!/^gg_browser_[0-9a-f]{32}$/.test(database))throw new Error('Fault injection requires the disposable browser database.');
  const sql=async(statement:string)=>{await promisify(execFile)('docker',['compose','-f',resolve('../compose.dev.yaml'),'exec','-T','postgres','psql','--username=gategoldjira','--dbname=postgres','-v','ON_ERROR_STOP=1','-c',statement]);};
  try{
    await sql(`ALTER DATABASE ${database} ALLOW_CONNECTIONS false;`);
    await sql(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${database}';`);
    await useCase('UC-SYS-0027',async()=>{const r=await request.get(apiOrigin+'/readyz');expect(r.status()).toBe(503);expect(await r.json()).toEqual({status:'unavailable'});});
    await recordUseCase('UC-SYS-0027',()=>operatorProbe('/readyz',503,{status:'unavailable'}),'operator');
  }finally{await sql(`ALTER DATABASE ${database} ALLOW_CONNECTIONS true;`);}
  await expect.poll(async()=>(await request.get(apiOrigin+'/readyz')).status(),{timeout:15000}).toBe(200);
  await useCase('UC-SYS-0033',async()=>{expect((await request.post(apiOrigin+'/internal/maintenance/pictures')).status()).toBe(404);});
  await recordUseCase('UC-SYS-0033',async()=>{
    const result=await promisify(execFile)('curl',['--silent','--show-error','--output','/dev/null','--write-out','%{http_code}','--request','POST',apiOrigin+'/internal/maintenance/pictures']);
    expect(result.stdout).toBe('404');
  },'operator');
});
