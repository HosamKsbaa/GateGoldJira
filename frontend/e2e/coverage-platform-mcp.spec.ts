import {expect,type APIRequestContext} from '@playwright/test';
import {z} from 'zod';
import {test} from './support/browser-test';
import {useCase} from './support/use-case';
import {authorization,callTool} from './support/coverage-access';
import {apiOrigin,localFixturesAvailable,token} from './support/session';
import {isolatedProject} from './support/project';
import {zSavedModernIssueView,zModernIssueView,zPageLabelView,zPageMembershipView,zConfigurationView,zSavedTypeSaved,zProjectView,zSavedProjectView} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable,'Requires the isolated PostgreSQL company and real MCP transport.');
test.use({trace:'off'});
async function success<S extends z.ZodType>(request:APIRequestContext,name:string,args:object,schema:S,role='member'):Promise<z.output<S>> {
 const response=await callTool(request,name,args,await token(role,'mcp'));expect(response.status()).toBe(200);
 const body=z.object({result:z.object({structuredContent:z.object({ok:z.literal(true),data:z.unknown()})})}).parse(await response.json());
 return schema.parse(body.result.structuredContent.data);
}
async function failure(request:APIRequestContext,name:string,args:object,code:string,role='member'){
 const response=await callTool(request,name,args,await token(role,'mcp'));expect(response.status()).toBe(200);
 const body=z.object({result:z.object({isError:z.literal(true),structuredContent:z.object({ok:z.literal(false),error:z.object({error:z.object({code:z.string()})})})})}).parse(await response.json());
 expect(body.result.structuredContent.error.error.code).toBe(code);
}
const mcpCase=<T>(id:string,body:()=>Promise<T>)=>useCase(id,body,'mcp');

test('MCP platform authorization, retry receipts, concurrent writes and rollback use real services',async({request})=>{
 const project=await isolatedProject(request),reference=crypto.randomUUID();
 const input={projectId:project,title:'MCP platform invariant',retryReference:reference};
 const created=await success(request,'create_issue_v2',input,zSavedModernIssueView),issue=created.result;
 await mcpCase('UC-SYS-0001',async()=>{const response=await request.post(apiOrigin+'/mcp',{data:{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_me',arguments:{}}}});expect(response.status()).toBe(401);});
 await mcpCase('UC-SYS-0002',async()=>{const response=await callTool(request,'get_me',{},await token('disabled','mcp'));expect(response.status()).toBe(403);});
 await mcpCase('UC-SYS-0004',async()=>failure(request,'create_issue_v2',{...input,retryReference:crypto.randomUUID()},'forbidden','viewer'));
 await mcpCase('UC-SYS-0005',async()=>failure(request,'save_issue_type',{projectId:project,typeId:crypto.randomUUID(),retryReference:crypto.randomUUID(),expectedRevision:'1',key:'forbidden',name:'Forbidden',behavior:'standard',retired:false},'forbidden'));
 await mcpCase('UC-SYS-0009',async()=>{const replay=await success(request,'create_issue_v2',input,zSavedModernIssueView);expect(replay.receipt.replayed).toBe(true);expect(replay.result.summary.id).toBe(issue.summary.id);expect(replay.receipt.eventId).toBe(created.receipt.eventId);});
 await mcpCase('UC-SYS-0010',async()=>failure(request,'create_issue_v2',{...input,title:'Changed intent'},'retry_reference_reused'));
 await mcpCase('UC-SYS-0011',async()=>{const args={...input,retryReference:crypto.randomUUID()};const pair=await Promise.all([success(request,'create_issue_v2',args,zSavedModernIssueView),success(request,'create_issue_v2',args,zSavedModernIssueView)]);expect(pair[0]!.result.summary.id).toBe(pair[1]!.result.summary.id);expect(pair.filter(value=>value.receipt.replayed)).toHaveLength(1);});
 await mcpCase('UC-SYS-0012',async()=>{const saved=await success(request,'patch_issue_field_v2',{issueId:issue.summary.id,retryReference:crypto.randomUUID(),field:'dueDate',dueDate:{prior:null,value:null}},zSavedModernIssueView);expect(saved.result.summary.revision).toBe(issue.summary.revision);expect(saved.receipt.eventId).toBeNull();});
 await mcpCase('UC-SYS-0013',async()=>{await failure(request,'create_issue_v2',{...input,title:'Invalid\u0000work',retryReference:crypto.randomUUID()},'validation_failed');const current=await success(request,'get_issue_v2',{issueId:issue.summary.id},zModernIssueView);expect(current.summary.revision).toBe(issue.summary.revision);});
 const members=await success(request,'list_memberships',{projectId:project},zPageMembershipView,'owner');
 const member=members.items.find(value=>value.user.id==='10000000-0000-4000-8000-000000000002');expect(member).toBeDefined();
 const removed=await request.post(apiOrigin+`/api/v1/projects/${project}/memberships/${member!.user.id}/remove`,{headers:await authorization(),data:{expectedRevision:member!.revision}});expect(removed.status()).toBe(200);
 await mcpCase('UC-SYS-0003',async()=>failure(request,'get_issue_v2',{issueId:issue.summary.id},'unavailable_record'));
 await mcpCase('UC-SYS-0008',async()=>failure(request,'create_issue_v2',input,'unavailable_record'));
});

test('MCP collection limits and signed cursor scopes agree with actual typed pages',async({request})=>{
 const project=await isolatedProject(request);
 for(let i=0;i<28;i++)await success(request,'create_label',{projectId:project,name:'cursor '+String(i).padStart(2,'0'),retryReference:crypto.randomUUID()},z.unknown());
 let cursor='';
 await mcpCase('UC-SYS-0015',async()=>{const page=await success(request,'list_labels',{projectId:project},zPageLabelView);expect(page.items).toHaveLength(25);expect(page.totalMatching).toBe(28);expect(page.nextCursor).not.toBeNull();cursor=page.nextCursor!;});
 await mcpCase('UC-SYS-0016',async()=>{const page=await success(request,'list_labels',{projectId:project,page:{limit:100}},zPageLabelView);expect(page.items).toHaveLength(28);expect(page.nextCursor).toBeNull();});
 for(const [id,limit]of[['UC-SYS-0017',0],['UC-SYS-0018',101]]as const)await mcpCase(id,async()=>failure(request,'list_labels',{projectId:project,page:{limit}},'validation_failed'));
 await mcpCase('UC-SYS-0019',async()=>failure(request,'list_labels',{projectId:project,page:{cursor:cursor.slice(0,-8)+'AAAAAAAA'}},'validation_failed'));
 await mcpCase('UC-SYS-0020',async()=>failure(request,'list_labels',{projectId:project,page:{cursor}},'validation_failed','viewer'));
 await mcpCase('UC-SYS-0021',async()=>failure(request,'list_assignees',{projectId:project,page:{cursor}},'validation_failed'));
 await mcpCase('UC-SYS-0022',async()=>failure(request,'list_labels',{projectId:project,query:'cursor 01',page:{cursor}},'validation_failed'));
 await mcpCase('UC-SYS-0024',async()=>{const page=await success(request,'list_labels',{projectId:project,query:'no such label'},zPageLabelView);expect(page.items).toEqual([]);expect(page.nextCursor).toBeNull();expect(page.totalMatching).toBe(0);});
});


for(const channel of ['rest','mcp'] as const)test(channel+' project administrator scope and archived writes enforce current project boundaries',async({request})=>{
 const project=await isolatedProject(request),other=await isolatedProject(request);
 const membersResponse=await request.get(apiOrigin+`/api/v1/projects/${project}/memberships`,{headers:await authorization()});expect(membersResponse.status()).toBe(200);
 const membership=zPageMembershipView.parse(await membersResponse.json()).items.find(value=>value.user.id==='10000000-0000-4000-8000-000000000002');expect(membership).toBeDefined();
 const promotion=await request.put(apiOrigin+`/api/v1/projects/${project}/memberships/${membership!.user.id}`,{headers:await authorization(),data:{expectedRevision:membership!.revision,role:'project_admin'}});expect(promotion.status()).toBe(200);
 async function configuration(projectId:string){const response=await request.get(apiOrigin+`/api/v2/projects/${projectId}/configuration`,{headers:await authorization()});expect(response.status()).toBe(200);return zConfigurationView.parse(await response.json());}
 const config=await configuration(project),foreign=await configuration(other),typeId=crypto.randomUUID();
 const fields={expectedRevision:config.revision,key:'scoped_type',name:'Scoped type',behavior:'standard',retired:false};
 await useCase('UC-SYS-0006',async()=>{
  if(channel==='mcp'){
   const saved=await success(request,'save_issue_type',{projectId:project,typeId,...fields,retryReference:crypto.randomUUID()},zSavedTypeSaved);
   expect(saved.result.configuration.projectId).toBe(project);
   await failure(request,'save_issue_type',{projectId:other,typeId:crypto.randomUUID(),...fields,expectedRevision:foreign.revision,retryReference:crypto.randomUUID()},'forbidden');
  }else{
   const saved=await request.put(apiOrigin+`/api/v2/projects/${project}/issue-types/${typeId}`,{headers:await authorization('member'),data:fields});expect(saved.status()).toBe(201);expect(zSavedTypeSaved.parse(await saved.json()).result.configuration.projectId).toBe(project);
   const denied=await request.put(apiOrigin+`/api/v2/projects/${other}/issue-types/${crypto.randomUUID()}`,{headers:await authorization('member'),data:{...fields,expectedRevision:foreign.revision}});expect(denied.status()).toBe(403);expect(z.object({error:z.object({code:z.literal('forbidden')})}).parse(await denied.json()).error.code).toBe('forbidden');
  }
 },channel);
 const projectResponse=await request.get(apiOrigin+`/api/v1/projects/${project}`,{headers:await authorization()});expect(projectResponse.status()).toBe(200);const current=zProjectView.parse(await projectResponse.json());
 const archive=await request.post(apiOrigin+`/api/v1/projects/${project}/archive`,{headers:await authorization(),data:{expectedRevision:current.revision}});expect(archive.status()).toBe(200);expect(zSavedProjectView.parse(await archive.json()).result.archived).toBe(true);
 await useCase('UC-SYS-0007',async()=>{
  if(channel==='mcp')await failure(request,'create_issue_v2',{projectId:project,title:'Forbidden archived mutation',retryReference:crypto.randomUUID()},'forbidden');
  else{const denied=await request.post(apiOrigin+`/api/v2/projects/${project}/issues`,{headers:await authorization('member'),data:{title:'Forbidden archived mutation'}});expect(denied.status()).toBe(403);expect(z.object({error:z.object({code:z.literal('forbidden')})}).parse(await denied.json()).error.code).toBe('forbidden');}
 },channel);
});
