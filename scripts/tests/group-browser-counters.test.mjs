import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {Session} from 'node:inspector/promises';
import vm from 'node:vm';
import {BrowserCounterGroups} from '../lib/group-browser-counters.mjs';

const require=createRequire(new URL('../../frontend/package.json',import.meta.url));
const range=(startOffset,endOffset,count)=>({startOffset,endOffset,count});
function entry(url='http://127.0.0.1:1000/example.js') {
 return {url,source:'function choose(value){return value?1:2}',functions:[{
  functionName:'choose',isBlockCoverage:true,ranges:[range(0,39,1),range(35,36,0)],
 }]};
}
test('groups only byte-identical code/maps at the same path, ignoring the loopback port',()=>{
 const groups=new BrowserCounterGroups(),map={sources:['example.ts'],sourcesContent:['original']};
 const first=entry(),snapshot=structuredClone(first);groups.add(first,map,{file:'first'});
 groups.add(entry('http://127.0.0.1:2000/example.js'),structuredClone(map),{file:'second'});
 assert.equal(groups.size,1);assert.equal([...groups.values()][0].occurrences,2);assert.deepEqual(first,snapshot);
 groups.add({...entry(),source:'different code'},map,{});
 groups.add(entry(),{...map,sourcesContent:['changed original']},{});
 groups.add(entry('http://127.0.0.1:1000/another.js'),map,{});
 assert.equal(groups.size,4);
});
test('merges real nested ranges without crediting a branch that was never taken',()=>{
 const groups=new BrowserCounterGroups(),first=entry(),second=entry();
 first.functions[0].ranges=[range(0,39,1),range(20,38,0)];
 second.functions[0].ranges=[range(0,39,3),range(20,38,0)];
 groups.add(first,{},{});groups.add(second,{},{});
 assert.deepEqual([...groups.values()][0].coverage.functions[0].ranges,[range(0,39,4),range(20,38,0)]);
 const incompatible=entry();incompatible.functions[0].ranges=[range(0,39,1),range(30,38,0)];
 groups.add(incompatible,{},{});assert.equal(groups.size,2);
 groups.add({...second,functions:[{...second.functions[0],isBlockCoverage:false}]},{},{});assert.equal(groups.size,3);
});
test('invalid or failed source-map inputs cannot be hidden inside a passing group',()=>{
 for(const value of[{...entry(),mapError:true},{...entry(),functions:[]},{...entry(),source:null}]) {
  const groups=new BrowserCounterGroups();groups.add(entry(),{},{});
  assert.throws(()=>groups.add(value,{},{}));assert.equal(groups.size,1);
 }
});

async function capture(code,value) {
 const session=new Session(),url='file:///gategold-coverage-fixture/example.js';session.connect();
 try {
  await session.post('Profiler.enable');
  await session.post('Profiler.startPreciseCoverage',{callCount:true,detailed:true});
  const exports={};vm.runInNewContext(code,{exports},{filename:url});exports.choose(value);
  const result=await session.post('Profiler.takePreciseCoverage');
  const actual=result.result.filter(script=>script.url===url&&script.functions.some(fn=>fn.functionName==='choose'&&fn.ranges[0].count>0));
  assert.equal(actual.length,1,'One actual executed fixture module is required.');
  return {...actual[0],source:code};
 } finally {await session.post('Profiler.stopPreciseCoverage');await session.post('Profiler.disable');session.disconnect();}
}
function booleanCounters(data) {
 const copy=JSON.parse(JSON.stringify(data));
 for(const file of Object.values(copy)) {
  for(const counters of[file.s,file.f])for(const key in counters)counters[key]=Number(counters[key]>0);
  for(const key in file.b)file.b[key]=file.b[key].map(value=>Number(value>0));
 }
 return copy;
}
test('actual V8 branch executions produce the same source maps and covered counters before or after grouping',async()=>{
 const ts=require('typescript'),{createCoverageMap}=require('istanbul-lib-coverage');
 const {default:convert}=await import(require.resolve('ast-v8-to-istanbul'));
 const {parseAstAsync}=await import(require.resolve('vitest/node'));
 const original='export function choose(value: boolean): number { if(value) return 1; else return 2; }';
 const compiled=ts.transpileModule(original,{fileName:'example.ts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,sourceMap:true,inlineSources:true}});
 const sourceMap=JSON.parse(compiled.sourceMapText);
 const entries=[await capture(compiled.outputText,true),await capture(compiled.outputText,false),await capture(compiled.outputText,false)];
 const sequential=createCoverageMap({}),grouped=createCoverageMap({}),groups=new BrowserCounterGroups();
 const remap=async(script,map)=>convert({code:script.source,sourceMap:map,ast:await parseAstAsync(script.source),coverage:{url:script.url,functions:script.functions}});
 for(const script of entries){sequential.merge(await remap(script,sourceMap));groups.add(script,sourceMap,{});}
 assert.ok(groups.size<entries.length,'At least two actual scripts must have exactly matching counter shapes.');
 for(const group of groups.values())grouped.merge(await remap({...group,functions:group.coverage.functions},group.sourceMap));
 assert.deepEqual(booleanCounters(grouped.toJSON()),booleanCounters(sequential.toJSON()));
 assert.deepEqual(grouped.getCoverageSummary().toJSON(),sequential.getCoverageSummary().toJSON());
 assert.equal(grouped.getCoverageSummary().branches.pct,100);
});
