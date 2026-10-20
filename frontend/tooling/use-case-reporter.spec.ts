import {afterEach, describe, expect, it} from 'vitest';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {FullResult, TestCase, TestResult, TestStep} from '@playwright/test/reporter';
import UseCaseReporter from '../e2e/support/use-case-reporter';
import {z} from 'zod';

const reports:string[]=[];
afterEach(()=>{for(const path of reports.splice(0))rmSync(path,{recursive:true,force:true});});
const summary=z.object({verified:z.number(),invalidEvidence:z.boolean(),applicationSha256:z.string().nullable(),cases:z.array(z.object({status:z.string(),verifiedSurfaces:z.array(z.string()),caseSha256:z.string()}))});
function setup(requireFull=false,surfaces=['web']) {
  const directory=mkdtempSync(join(tmpdir(),'gg-evidence-'));reports.push(directory);
  const catalogPath=join(directory,'catalog.json'),manifestPath=join(directory,'source-manifest.json'),outputPath=join(directory,'report.json');
  writeFileSync(catalogPath,JSON.stringify({cases:[{id:'UC-TST-0001',area:'test',implementation:'implemented',surfaces}]}));
  writeFileSync(manifestPath,JSON.stringify({'backend/example.go':'a'.repeat(64)}));
  return {reporter:new UseCaseReporter({catalogPath,manifestPath,outputPath,requireFull}),outputPath};
}
function step(title='use-case: UC-TST-0001 [web]',hasAssertion=true,assertionError=false):TestStep {
  return {title,category:'test.step',steps:hasAssertion?[{title:'expect.toBe',category:'expect',steps:[],...(assertionError?{error:{message:'caught assertion failure'}}:{})} as unknown as TestStep]:[]} as unknown as TestStep;
}
function record(reporter:UseCaseReporter,steps:TestStep[],status:TestResult['status']='passed',retry=0,expectedStatus:TestCase['expectedStatus']='passed') {
  reporter.onTestEnd({id:'fixture',location:{file:join(process.cwd(),'e2e/fixture.spec.ts'),line:1,column:1},expectedStatus} as TestCase,{steps,status,retry} as TestResult);
}
const passed={status:'passed'} as FullResult;
function read(path:string) {return summary.parse(JSON.parse(readFileSync(path,'utf8')) as unknown);}
describe('use-case evidence cannot overstate successful execution',()=>{
  it('accepts exact first-attempt assertions with explicit surface and source provenance',async()=>{
    const {reporter,outputPath}=setup(true);record(reporter,[step()]);
    expect(await reporter.onEnd(passed)).toBeUndefined();
    expect(read(outputPath)).toMatchObject({verified:1,invalidEvidence:false,cases:[{status:'passed',verifiedSurfaces:['web']}]});
    expect(read(outputPath).applicationSha256).toMatch(/^[0-9a-f]{64}$/);
  });
  it('records a declared internal frontend-service surface without claiming browser coverage',async()=>{
    const {reporter,outputPath}=setup(true,['frontend_service']);record(reporter,[step('use-case: UC-TST-0001 [frontend_service]')]);
    expect(await reporter.onEnd(passed)).toBeUndefined();
    expect(read(outputPath)).toMatchObject({verified:1,invalidEvidence:false,cases:[{status:'passed',verifiedSurfaces:['frontend_service']}]});
    expect(read(outputPath).cases[0]?.verifiedSurfaces).not.toContain('web');
  });
  it('rejects an internal-service result attributed to a browser-only case',async()=>{
    const {reporter,outputPath}=setup(true,['web']);record(reporter,[step('use-case: UC-TST-0001 [frontend_service]')]);
    expect(await reporter.onEnd(passed)).toEqual({status:'failed'});expect(read(outputPath).invalidEvidence).toBe(true);
    expect(read(outputPath).cases[0]?.verifiedSurfaces).toEqual([]);
  });
  it('fails steps with no actual expect assertion',async()=>{
    const {reporter,outputPath}=setup();record(reporter,[step(undefined,false)]);
    expect(await reporter.onEnd(passed)).toEqual({status:'failed'});
    expect(read(outputPath).cases[0]?.status).toBe('assertion_missing');
  });
  it('does not let another successful step hide a failure or a caught assertion',async()=>{
    const {reporter,outputPath}=setup();record(reporter,[step(undefined,true,true),step()]);
    await reporter.onEnd(passed);expect(read(outputPath).verified).toBe(0);expect(read(outputPath).cases[0]?.status).toBe('failed');
  });
  it.each(['failed','skipped','timedOut','interrupted'] as const)('does not count %s tests even if an earlier step passed',async status=>{
    const {reporter,outputPath}=setup();record(reporter,[step()],status);await reporter.onEnd(passed);
    expect(read(outputPath).verified).toBe(0);
  });
  it('does not count expected failures or flaky retries',async()=>{
    const a=setup();record(a.reporter,[step()],'passed',0,'failed');await a.reporter.onEnd(passed);expect(read(a.outputPath).verified).toBe(0);
    const b=setup();record(b.reporter,[step()],'passed',1);await b.reporter.onEnd(passed);expect(read(b.outputPath).cases[0]?.status).toBe('flaky');
  });
  it('allows a deliberately canceled transport when the semantic outcome assertions pass',async()=>{
    const {reporter,outputPath}=setup();
    const action=step();action.steps.push({title:'route.fulfill',category:'pw:api',steps:[],error:{message:'canceled after navigation'}} as unknown as TestStep);
    record(reporter,[action]);await reporter.onEnd(passed);expect(read(outputPath).verified).toBe(1);
  });
  it('counts a successful polling assertion once despite failed internal attempts',async()=>{
    const {reporter,outputPath}=setup();
    const action=step();
    const assertion=action.steps[0]!;
    assertion.steps.push({title:'Expect "toBe"',category:'expect',steps:[],error:{message:'not ready yet'}} as unknown as TestStep);
    assertion.steps.push({title:'Expect "toBe"',category:'expect',steps:[]} as unknown as TestStep);
    record(reporter,[action]);await reporter.onEnd(passed);
    expect(read(outputPath).verified).toBe(1);
    expect(JSON.parse(readFileSync(outputPath,'utf8'))).toMatchObject({cases:[{evidence:[{assertions:1,result:'passed'}]}]});
  });
  it('rejects a caught failed polling assertion even after a later assertion passes',async()=>{
    const {reporter,outputPath}=setup();
    const action=step(undefined,true,true);
    action.steps[0]!.steps.push({title:'Expect "toBe"',category:'expect',steps:[],error:{message:'still not ready'}} as unknown as TestStep);
    record(reporter,[action,step()]);await reporter.onEnd(passed);
    expect(read(outputPath).verified).toBe(0);
    expect(read(outputPath).cases[0]?.status).toBe('failed');
  });
  it('rejects unknown, malformed and mismatched surface labels',async()=>{
    for(const title of ['use-case: UC-TST-9999 [web]','use-case: invalid','use-case: UC-TST-0001 [rest]']) {
      const {reporter,outputPath}=setup();record(reporter,[step(title)]);
      expect(await reporter.onEnd(passed)).toEqual({status:'failed'});expect(read(outputPath).invalidEvidence).toBe(true);
    }
  });
  it('reports invalid evidence locations without retaining arbitrary step titles',async()=>{
    const {reporter,outputPath}=setup();
    record(reporter,[step('use-case: private-fixture-value'),step('use-case: UC-TST-0001 [rest]')]);
    await reporter.onEnd(passed);
    const raw=readFileSync(outputPath,'utf8');
    expect(raw).not.toContain('private-fixture-value');
    expect(JSON.parse(raw)).toMatchObject({invalidEvidenceDetails:[
      {reason:'malformed_label',id:null,surface:null,line:1},
      {reason:'undeclared_surface',id:'UC-TST-0001',surface:'rest',line:1},
    ]});
  });
  it('keeps unexecuted cases and unattributed surfaces out of the full gate',async()=>{
    const a=setup(true);expect(await a.reporter.onEnd(passed)).toEqual({status:'failed'});expect(read(a.outputPath).cases[0]?.status).toBe('not_run');
    const b=setup(true);record(b.reporter,[step('use-case: UC-TST-0001')]);expect(await b.reporter.onEnd(passed)).toEqual({status:'failed'});expect(read(b.outputPath).cases[0]?.verifiedSurfaces).toEqual([]);
    const c=setup(true,['web','rest']);record(c.reporter,[step()]);expect(await c.reporter.onEnd(passed)).toEqual({status:'failed'});
  });
  it('requires every declared surface and a passing suite for full coverage',async()=>{
    const {reporter}=setup(true,['web','rest']);record(reporter,[step(),step('use-case: UC-TST-0001 [rest]')]);
    expect(await reporter.onEnd({status:'failed'} as FullResult)).toEqual({status:'failed'});
  });
});
