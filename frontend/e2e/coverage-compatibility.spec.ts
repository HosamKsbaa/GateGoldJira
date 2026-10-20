import {expect,type APIRequestContext} from '@playwright/test';
import {test} from './support/browser-test';
import {useCase,type UseCaseSurface} from './support/use-case';
import {isolatedProject,useModernIssues} from './support/project';
import {authorization,callTool} from './support/coverage-access';
import {apiOrigin,localFixturesAvailable,signIn,token} from './support/session';
import {z} from 'zod';
import {zSavedIssueView,zIssueView,zPageIssueSummary,zSavedBoardSummary,zBoardView,zCardPage,zSavedMoveResult,zModernIssueView,zSavedPictureView,zPictureView,zPagePictureView,zSavedAttachmentView,zAttachmentView,zPageAttachmentView} from '../src/app/api/generated/zod.gen';

test.skip(!localFixturesAvailable,'Requires disposable PostgreSQL, local identities and the real MCP endpoint.');
test.use({trace:'off'});
type Channel=Extract<UseCaseSurface,'rest'|'mcp'>;
const mutations=new Set(['create_issue','create_board','reorder_issue','update_board','upload_picture','detach_gallery_picture','upload_attachment','detach_attachment','update_issue','patch_issue_field','move_issue']);
async function success<S extends z.ZodType>(request:APIRequestContext,channel:Channel,name:string,args:object,method:string,path:string,body:object|undefined,schema:S,reference=crypto.randomUUID()):Promise<z.output<S>> {
 if(channel==='mcp'){
  const response=await callTool(request,name,{...args,...(mutations.has(name)?{retryReference:reference}:{})});expect(response.status()).toBe(200);
  const wire=z.object({result:z.object({structuredContent:z.object({ok:z.literal(true),data:z.unknown()})})}).parse(await response.json());return schema.parse(wire.result.structuredContent.data);
 }
 const response=await request.fetch(apiOrigin+'/api/v1'+path,{method,headers:await authorization('owner',reference),...(body?{data:body}:{})});
 expect(response.ok(),name).toBe(true);return schema.parse(await response.json());
}
async function denied(request:APIRequestContext,channel:Channel,name:string,args:object,method:string,path:string,body?:object){
 const response=channel==='mcp'?await callTool(request,name,{...args,...(mutations.has(name)?{retryReference:crypto.randomUUID()}:{})}):await request.fetch(apiOrigin+'/api/v1'+path,{method,headers:await authorization(),...(body?{data:body}:{})});
 const failure=z.object({error:z.object({code:z.literal('validation_failed'),fieldErrors:z.array(z.object({field:z.string(),message:z.string()}))})});
 if(channel==='rest')expect(response.status()).toBe(422);else expect(response.status()).toBe(200);
 const raw:unknown=await response.json();
 const data=channel==='rest'?failure.parse(raw):z.object({result:z.object({isError:z.literal(true),structuredContent:z.object({ok:z.literal(false),error:failure})})}).parse(raw).result.structuredContent.error;
 expect(data.error.fieldErrors.some(error=>error.field==='clientVersion')).toBe(true);
}
for(const channel of ['rest','mcp'] as const){
 test(channel+' retains legacy issue/board contracts and rejects fresh lossy operations after activation',async({request})=>{
  const project=await isolatedProject(request),reference=crypto.randomUUID(),title='Compatibility عربي '+crypto.randomUUID();
  const create=()=>success(request,channel,'create_issue',{projectId:project,title},'POST',`/projects/${project}/issues`,{title},zSavedIssueView,reference);
  const created=await useCase('UC-CMP-0003',async()=>{const value=await create();expect(value.result.summary).toMatchObject({projectId:project,title,type:'task',priority:'medium',status:'todo'});return value;},channel);
  let issue=created.result;
  await useCase('UC-CMP-0001',async()=>{const value=await success(request,channel,'get_issue',{issueId:issue.summary.id},'GET','/issues/'+issue.summary.id,undefined,zIssueView);expect(value.summary.id).toBe(issue.summary.id);expect(value.reporter.id).toBe('10000000-0000-4000-8000-000000000001');},channel);
  await useCase('UC-CMP-0002',async()=>{const body={filters:{projectIds:[project],query:title},page:{limit:1}};const value=await success(request,channel,'search_issues',body,'POST','/issues/search',body,zPageIssueSummary);expect(value.items.map(v=>v.id)).toEqual([issue.summary.id]);expect(value.nextCursor).toBeNull();},channel);
  const neighbor=(await success(request,channel,'create_issue',{projectId:project,title:'Neighbor'},'POST',`/projects/${project}/issues`,{title:'Neighbor'},zSavedIssueView)).result;
  issue=await success(request,channel,'get_issue',{issueId:issue.summary.id},'GET','/issues/'+issue.summary.id,undefined,zIssueView);
  await useCase('UC-CMP-0007',async()=>{const body={expectedRevision:issue.summary.revision,expectedOrderRevision:issue.sourceOrderRevision,neighborIssueId:neighbor.summary.id,placement:'after'};const saved=await success(request,channel,'reorder_issue',{issueId:issue.summary.id,...body},'POST',`/issues/${issue.summary.id}/reorder`,body,zSavedMoveResult);expect(saved.result.issue.summary.id).toBe(issue.summary.id);const reread=await success(request,channel,'get_issue',{issueId:issue.summary.id},'GET','/issues/'+issue.summary.id,undefined,zIssueView);expect(BigInt(reread.sourceOrderRevision)).toBeGreaterThan(BigInt(issue.sourceOrderRevision));issue=reread;},channel);
  const board=await useCase('UC-CMP-0008',async()=>{const body={name:'Compatibility board',savedFilters:{}};const result=await success(request,channel,'create_board',{projectId:project,...body},'POST',`/projects/${project}/boards`,body,zSavedBoardSummary);expect(result.result).toMatchObject({projectId:project,name:body.name,default:false});return result.result;},channel);
  await useCase('UC-CMP-0009',async()=>{const read=await success(request,channel,'get_board',{boardId:board.id},'GET','/boards/'+board.id,undefined,zBoardView);expect(read.columns.map(c=>c.status)).toEqual(['todo','in_progress','review','done']);},channel);
  await useCase('UC-CMP-0010',async()=>{const body={temporaryFilters:{},page:{limit:1}};const read=await success(request,channel,'list_board_cards',{boardId:board.id,status:'todo',...body},'POST',`/boards/${board.id}/columns/todo/search`,body,zCardPage);expect(read.items).toHaveLength(1);expect(read.nextCursor).not.toBeNull();},channel);
  await useCase('UC-CMP-0011',async()=>{const body={expectedRevision:board.revision,name:'Retained legacy settings',savedFilters:{},wipLimits:{inProgress:2,review:1}};const saved=await success(request,channel,'update_board',{boardId:board.id,...body},'PUT','/boards/'+board.id,body,zSavedBoardSummary);expect(saved.result.name).toBe(body.name);expect(saved.result.wipLimits.inProgress).toBe(2);},channel);
  await useModernIssues(project);
  await useCase('UC-CMP-0022',async()=>{const replay=await create();expect(replay.receipt.replayed).toBe(true);expect(replay.result.summary.id).toBe(issue.summary.id);},channel);
  const base='/issues/'+issue.summary.id;
  for(const [id,name,args,method,path,body] of [
   ['UC-CMP-0025','get_issue',{issueId:issue.summary.id},'GET',base,undefined],
   ['UC-CMP-0026','search_issues',{filters:{projectIds:[project]}},'POST','/issues/search',{filters:{projectIds:[project]}}],
   ['UC-CMP-0027','create_issue',{projectId:project,title:'Fresh legacy'},'POST',`/projects/${project}/issues`,{title:'Fresh legacy'}],
   ['UC-CMP-0028','get_board',{boardId:board.id},'GET','/boards/'+board.id,undefined],
   ['UC-CMP-0029','create_board',{projectId:project,name:'Fresh legacy',savedFilters:{}},'POST',`/projects/${project}/boards`,{name:'Fresh legacy',savedFilters:{}}],
   ['UC-CMP-0030','list_board_cards',{boardId:board.id,status:'todo'},'POST',`/boards/${board.id}/columns/todo/search`,{}],
  ] as const)await useCase(id,async()=>denied(request,channel,name,args,method,path,body),channel);
  const currentResponse=await request.get(apiOrigin+'/api/v2/issues/'+issue.summary.id,{headers:await authorization()});expect(currentResponse.status()).toBe(200);const current=zModernIssueView.parse(await currentResponse.json());
  const editable={title:'Forbidden old full save',description:'',type:'task',priority:'medium',assigneeId:null,dueDate:null,labelIds:[]};
  const update={expectedRevision:current.summary.revision,editable};
  await useCase('UC-CMP-0004',async()=>denied(request,channel,'update_issue',{issueId:issue.summary.id,...update},'PUT',base,update),channel);
  const patch={field:'dueDate',dueDate:{prior:null,value:'2027-01-01'}};
  await useCase('UC-CMP-0005',async()=>denied(request,channel,'patch_issue_field',{issueId:issue.summary.id,...patch},'PATCH',base+'/fields',patch),channel);
  const move={expectedRevision:current.summary.revision,targetStatus:'in_progress',expectedSourceOrderRevision:issue.sourceOrderRevision,expectedTargetOrderRevision:'1'};
  await useCase('UC-CMP-0006',async()=>denied(request,channel,'move_issue',{issueId:issue.summary.id,...move},'POST',base+'/move',move),channel);
 });
}

const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGN8tsWNgYGBiYGBgYGBAQAXSgHkeDr16gAAAABJRU5ErkJggg==','base64');
for(const channel of ['rest','mcp'] as const){
 test(channel+' retains picture and document adapters, authorized downloads and references after detachment',async({request})=>{
  const project=await isolatedProject(request);
  const created=await success(request,channel,'create_issue',{projectId:project,title:'Retained assets'},'POST',`/projects/${project}/issues`,{title:'Retained assets'},zSavedIssueView);
  const issueId=created.result.summary.id;
  async function uploadPicture(publication:'gallery'|'comment_draft'){
   const metadata={filename:'صورة.png',description:'صورة توضيحية',mimeType:'image/png',publication};
   if(channel==='mcp')return success(request,channel,'upload_picture',{issueId,upload:{...metadata,dataBase64:image.toString('base64')}},'POST','',undefined,zSavedPictureView);
   const response=await request.post(apiOrigin+`/api/v1/issues/${issueId}/pictures`,{headers:await authorization(),multipart:{metadata:JSON.stringify(metadata),file:{name:metadata.filename,mimeType:metadata.mimeType,buffer:image}}});expect(response.status()).toBe(201);return zSavedPictureView.parse(await response.json());
  }
  const picture=await useCase('UC-CMP-0015',async()=>{const saved=await uploadPicture('gallery');expect(saved.result).toMatchObject({filename:'صورة.png',state:'published',inGallery:true,byteSize:image.length});return saved.result;},channel);
  const draft=(await uploadPicture('comment_draft')).result;
  await useCase('UC-CMP-0012',async()=>{const value=await success(request,channel,'list_pictures',{issueId,includeOwnDrafts:true},'GET',`/issues/${issueId}/pictures?includeOwnDrafts=true`,undefined,zPagePictureView);expect(value.items.map(p=>p.id)).toEqual(expect.arrayContaining([picture.id,draft.id]));const ordinary=await request.get(apiOrigin+`/api/v1/issues/${issueId}/pictures`,{headers:await authorization('viewer')});expect(ordinary.status()).toBe(200);expect(zPagePictureView.parse(await ordinary.json()).items.map(p=>p.id)).toEqual([picture.id]);},channel);
  await useCase('UC-CMP-0013',async()=>{expect((await success(request,channel,'get_picture',{pictureId:picture.id},'GET','/pictures/'+picture.id,undefined,zPictureView)).id).toBe(picture.id);},channel);
  async function pictureBytes(){
   if(channel==='mcp')return Buffer.from((await success(request,channel,'download_picture',{pictureId:picture.id},'GET','',undefined,z.object({picture:zPictureView,dataBase64:z.string()}))).dataBase64,'base64');
   const response=await request.get(apiOrigin+'/api/v1/pictures/'+picture.id+'/content',{headers:await authorization()});expect(response.status()).toBe(200);expect(response.headers()['cache-control']).toBe('private, no-store');return response.body();
  }
  await useCase('UC-CMP-0014',async()=>{expect(await pictureBytes()).toEqual(image);},channel);
  await useCase('UC-CMP-0016',async()=>{const current=await success(request,channel,'get_issue',{issueId},'GET','/issues/'+issueId,undefined,zIssueView);const body={expectedIssueRevision:current.summary.revision};const saved=await success(request,channel,'detach_gallery_picture',{pictureId:picture.id,...body},'POST',`/pictures/${picture.id}/detach`,body,zSavedPictureView);expect(saved.result.inGallery).toBe(false);expect(await pictureBytes()).toEqual(image);},channel);
  const bytes=Buffer.from('retained document\nمرحبا');
  const attachment=await useCase('UC-CMP-0020',async()=>{
   const metadata={filename:'متطلبات.txt',mimeType:'text/plain'};
   if(channel==='mcp'){const saved=await success(request,channel,'upload_attachment',{issueId,upload:{...metadata,dataBase64:bytes.toString('base64')}},'POST','',undefined,zSavedAttachmentView);expect(saved.result.attached).toBe(true);return saved.result;}
   const response=await request.post(apiOrigin+`/api/v1/issues/${issueId}/attachments`,{headers:await authorization(),multipart:{metadata:JSON.stringify(metadata),file:{name:metadata.filename,mimeType:metadata.mimeType,buffer:bytes}}});expect(response.status()).toBe(201);const saved=zSavedAttachmentView.parse(await response.json());expect(saved.result.attached).toBe(true);return saved.result;
  },channel);
  await useCase('UC-CMP-0017',async()=>{const value=await success(request,channel,'list_attachments',{issueId},'GET',`/issues/${issueId}/attachments`,undefined,zPageAttachmentView);expect(value.items.map(a=>a.id)).toContain(attachment.id);},channel);
  await useCase('UC-CMP-0018',async()=>{const value=await success(request,channel,'get_attachment',{attachmentId:attachment.id},'GET','/attachments/'+attachment.id,undefined,zAttachmentView);expect(value).toMatchObject({id:attachment.id,filename:'متطلبات.txt',byteSize:bytes.length});},channel);
  async function attachmentBytes(){
   if(channel==='mcp')return Buffer.from((await success(request,channel,'download_attachment',{attachmentId:attachment.id},'GET','',undefined,z.object({attachment:zAttachmentView,dataBase64:z.string()}))).dataBase64,'base64');
   const response=await request.get(apiOrigin+'/api/v1/attachments/'+attachment.id+'/content',{headers:await authorization()});expect(response.status()).toBe(200);expect(response.headers()['cache-control']).toBe('private, no-store');return response.body();
  }
  await useCase('UC-CMP-0019',async()=>{expect(await attachmentBytes()).toEqual(bytes);},channel);
  await useCase('UC-CMP-0021',async()=>{const current=await success(request,channel,'get_issue',{issueId},'GET','/issues/'+issueId,undefined,zIssueView);const body={expectedIssueRevision:current.summary.revision};const saved=await success(request,channel,'detach_attachment',{attachmentId:attachment.id,...body},'POST',`/attachments/${attachment.id}/detach`,body,zSavedAttachmentView);expect(saved.result.attached).toBe(false);expect(await attachmentBytes()).toEqual(bytes);},channel);
 });
}
test('first-party routes use canonical editors for a legacy-marked project',async({page,request})=>{
 const project=await isolatedProject(request);
 const created=await request.post(apiOrigin+`/api/v1/projects/${project}/issues`,{headers:await authorization(),data:{title:'Canonical route over retained data'}});expect(created.status()).toBe(201);const issue=zSavedIssueView.parse(await created.json()).result;
 await useCase('UC-CMP-0023',async()=>{await signIn(page,'owner','/issues/'+issue.summary.id,/Canonical route over retained data/);await expect(page.locator('gg-modern-issue-actions')).toBeVisible();await expect(page.getByRole('heading',{name:'Details',exact:true})).toBeVisible();},'web');
});

test('published clients cannot downgrade a promoted project',async({request})=>{
 const project=await isolatedProject(request);await useModernIssues(project);
 await useCase('UC-CMP-0024',async()=>{
  const denied=await request.post(apiOrigin+`/api/v2/projects/${project}/configuration/activation`,{headers:await authorization(),data:{mode:'legacy',confirm:true}});expect(denied.status()).toBe(422);
  const current=await request.get(apiOrigin+`/api/v2/projects/${project}/configuration`,{headers:await authorization()});expect(current.status()).toBe(200);expect(z.object({mode:z.literal('modern')}).parse(await current.json()).mode).toBe('modern');
 },'rest');
 await useCase('UC-CMP-0024',async()=>{
  const names:string[]=[];let cursor:string|undefined;const seen=new Set<string>();
  do {
   const response=await request.post(apiOrigin+'/mcp',{headers:{Authorization:'Bearer '+await token('owner','mcp'),Accept:'application/json, text/event-stream','MCP-Protocol-Version':'2025-11-25'},data:{jsonrpc:'2.0',id:1,method:'tools/list',params:cursor?{cursor}:{}}});
   expect(response.status()).toBe(200);
   const wire=z.object({result:z.object({tools:z.array(z.object({name:z.string()})),nextCursor:z.string().optional()})}).parse(await response.json());
   names.push(...wire.result.tools.map(tool=>tool.name));cursor=wire.result.nextCursor;
   if(cursor){expect(seen.has(cursor)).toBe(false);seen.add(cursor);}
  } while(cursor);
  expect(names.length).toBeGreaterThan(100);expect(names.some(name=>/downgrade|legacy_mode/i.test(name))).toBe(false);
 },'mcp');
});
