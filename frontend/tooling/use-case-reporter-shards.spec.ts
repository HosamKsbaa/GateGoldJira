import {afterEach, describe, expect, it, vi} from 'vitest';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {FullConfig,FullResult,Suite,TestCase,TestResult} from '@playwright/test/reporter';
import {z} from 'zod';
import UseCaseReporter from '../e2e/support/use-case-reporter';

const directories:string[]=[];
const originalArguments=[...process.argv];
afterEach(()=>{vi.restoreAllMocks();process.argv=[...originalArguments];for(const directory of directories.splice(0))rmSync(directory,{recursive:true,force:true});});
const executionSchema=z.object({execution:z.object({shard:z.object({current:z.number(),total:z.number()}).nullable(),listing:z.boolean(),fullSelection:z.boolean(),selectionFiltersSha256:z.string().length(64),selectedTests:z.array(z.object({testId:z.string(),identity:z.string().length(64),file:z.string(),line:z.number(),column:z.number(),repeatEachIndex:z.number(),titlePathSha256:z.string().length(64),expectedStatus:z.string()})),attempts:z.array(z.object({testId:z.string(),identity:z.string(),status:z.string(),retry:z.number(),expectedStatus:z.string()}))})});
function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'gg-shards-'));directories.push(directory);
 const catalogPath=join(directory,'catalog.json'),manifestPath=join(directory,'source-manifest.json'),outputPath=join(directory,'report.json');
 writeFileSync(catalogPath,JSON.stringify({cases:[{id:'UC-TST-0001',area:'test',implementation:'implemented',surfaces:['web']}]}));
 writeFileSync(manifestPath,JSON.stringify({'backend/app.go':'a'.repeat(64)}));
 return {reporter:new UseCaseReporter({catalogPath,manifestPath,outputPath}),outputPath};
}
function candidate(id:string):TestCase{return {id,location:{file:join(process.cwd(),'e2e/example.spec.ts'),line:4,column:2},expectedStatus:'passed',repeatEachIndex:0,titlePath:()=>['','chromium','example.spec.ts','public scenario']} as TestCase;}
function config(shard:FullConfig['shard'],grep=/.*/):FullConfig{return {shard,grep,grepInvert:null,forbidOnly:true,projects:[{name:'chromium',testDir:join(process.cwd(),'e2e'),testMatch:/.*\.spec\.ts/,testIgnore:[],grep,grepInvert:null,repeatEach:1}]} as unknown as FullConfig;}
function suite(test:TestCase):Suite{return {allTests:()=>[test]} as Suite;}
const passed={status:'passed'} as FullResult;
function read(path:string){return executionSchema.parse(JSON.parse(readFileSync(path,'utf8')) as unknown).execution;}
describe('source-stable shard execution inventory',()=>{
 it('records selected tests and actual statuses without storing scenario titles',async()=>{
  process.argv=['node','playwright','test','--shard=2/4','--output','/private/current/results'];
  const {reporter,outputPath}=fixture(),test=candidate('actual-id');reporter.onBegin(config({current:2,total:4}),suite(test));
  reporter.onTestEnd(test,{status:'skipped',retry:0,steps:[]} as unknown as TestResult);await reporter.onEnd(passed);
  expect(read(outputPath)).toMatchObject({shard:{current:2,total:4},listing:false,selectedTests:[{file:'e2e/example.spec.ts',line:4,column:2}],attempts:[{testId:'actual-id',status:'skipped',retry:0}]});
  expect(readFileSync(outputPath,'utf8')).not.toContain('public scenario');
 });
 it('keeps identity/filter hashes stable across snapshot IDs, shard numbers and output paths',async()=>{
  const first=fixture(),second=fixture();
  process.argv=['node','playwright','test','--shard=1/4','--output','/private/one/results'];first.reporter.onBegin(config({current:1,total:4}),suite(candidate('absolute-one')));await first.reporter.onEnd(passed);
  process.argv=['node','playwright','test','--shard','2/4','--output=/private/two/results'];second.reporter.onBegin(config({current:2,total:4}),suite(candidate('absolute-two')));await second.reporter.onEnd(passed);
  expect(read(first.outputPath).selectedTests[0]?.identity).toBe(read(second.outputPath).selectedTests[0]?.identity);
  expect(read(first.outputPath).selectionFiltersSha256).toBe(read(second.outputPath).selectionFiltersSha256);
 });
 it('records a real unsharded listing while excluding --list from selection filters',async()=>{
  const listing=fixture(),execution=fixture();
  process.argv=['node','playwright','test','--list'];listing.reporter.onBegin(config(null),suite(candidate('inventory')));await listing.reporter.onEnd(passed);
  process.argv=['node','playwright','test','--shard=1/4'];execution.reporter.onBegin(config({current:1,total:4}),suite(candidate('selected')));await execution.reporter.onEnd(passed);
  expect(read(listing.outputPath)).toMatchObject({listing:true,shard:null,fullSelection:true,attempts:[]});
  expect(read(listing.outputPath).selectionFiltersSha256).toBe(read(execution.outputPath).selectionFiltersSha256);
 });
 it('rejects a filtered or only-permitting inventory as full-suite proof',async()=>{
  const filtered=fixture();process.argv=['node','playwright','test','example.spec.ts','--list'];
  filtered.reporter.onBegin(config(null),suite(candidate('filtered')));await filtered.reporter.onEnd(passed);
  expect(read(filtered.outputPath).fullSelection).toBe(false);
  const only=fixture();process.argv=['node','playwright','test','--list'];
  only.reporter.onBegin({...config(null),forbidOnly:false},suite(candidate('only')));await only.reporter.onEnd(passed);
  expect(read(only.outputPath).fullSelection).toBe(false);
 });
 it('distinguishes actual repetition identities on the same scenario',async()=>{
  const one=fixture(),two=fixture();process.argv=['node','playwright','test'];
  one.reporter.onBegin(config(null),suite(candidate('one')));await one.reporter.onEnd(passed);
  two.reporter.onBegin(config(null),suite({...candidate('two'),repeatEachIndex:1} as TestCase));await two.reporter.onEnd(passed);
  expect(read(one.outputPath).selectedTests[0]?.identity).not.toBe(read(two.outputPath).selectedTests[0]?.identity);
 });
 it('keeps canonical identity stable across actual absolute capture roots',async()=>{
  const first=fixture(),second=fixture();process.argv=['node','playwright','test'];
  const cwd=vi.spyOn(process,'cwd').mockReturnValue('/private/capture-one/source/frontend');
  first.reporter.onBegin(config(null),suite(candidate('one')));await first.reporter.onEnd(passed);
  cwd.mockReturnValue('/private/capture-two/source/frontend');
  second.reporter.onBegin(config(null),suite(candidate('two')));await second.reporter.onEnd(passed);
  expect(read(first.outputPath).selectedTests[0]?.file).toBe('e2e/example.spec.ts');
  expect(read(first.outputPath).selectedTests[0]?.identity).toBe(read(second.outputPath).selectedTests[0]?.identity);
  expect(read(first.outputPath).selectionFiltersSha256).toBe(read(second.outputPath).selectionFiltersSha256);
 });
 it('rejects an actual completion for an unknown selected-test ID',async()=>{
  const {reporter,outputPath}=fixture();process.argv=['node','playwright','test'];
  reporter.onBegin(config(null),suite(candidate('selected')));
  reporter.onTestEnd(candidate('unknown'),{status:'passed',retry:0,steps:[]} as unknown as TestResult);
  expect(await reporter.onEnd(passed)).toEqual({status:'failed'});
  expect(z.object({invalidEvidence:z.literal(true)}).parse(JSON.parse(readFileSync(outputPath,'utf8')) as unknown).invalidEvidence).toBe(true);
  expect(read(outputPath).attempts).toEqual([]);
 });
 it('distinguishes actual grep selections',async()=>{
  const first=fixture(),second=fixture();process.argv=['node','playwright','test'];
  first.reporter.onBegin(config(null,/first/),suite(candidate('first')));await first.reporter.onEnd(passed);
  second.reporter.onBegin(config(null,/second/),suite(candidate('second')));await second.reporter.onEnd(passed);
  expect(read(first.outputPath).selectionFiltersSha256).not.toBe(read(second.outputPath).selectionFiltersSha256);
 });
});
