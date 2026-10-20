// Chromium and Vitest use different compiler transforms. Report them separately;
// merging incompatible statement/branch maps can inflate the denominator.
import {readFile,readdir,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {inlineSourceMap} from './lib/browser-source-map.mjs';
import {mergeExactCoverage} from './lib/merge-exact-coverage.mjs';
import {capturedFrontendSources,frontendSourcePath,validateUnitCoverageSources} from './lib/coverage-source-provenance.mjs';
import {BrowserCounterGroups} from './lib/group-browser-counters.mjs';
const require=createRequire(resolve('frontend/package.json'));
const {default:convert}=await import(require.resolve('ast-v8-to-istanbul'));
const {parseAstAsync}=await import(require.resolve('vitest/node'));
const {createCoverageMap}=require('istanbul-lib-coverage');
const {createContext}=require('istanbul-lib-report');
const reports=require('istanbul-reports');
const [input,output,unitInput]=process.argv.slice(2);
if(!input||!output)throw new Error('Supply the private raw coverage and output directories.');
// Fail before expensive browser conversion: old same-source unit counters may
// survive a failed or interrupted rerun and must never establish a denominator.
const unitRunHelper=fileURLToPath(new URL('./frontend-unit-run-provenance.py',import.meta.url));
const unitRun=unitInput?JSON.parse((await promisify(execFile)('python3',[unitRunHelper,'validate','--root',resolve('.'),'--directory',dirname(resolve(unitInput))],{encoding:'utf8',maxBuffer:8*1024*1024})).stdout):null;
if(unitInput && createHash('sha256').update(await readFile(unitInput)).digest('hex')!==unitRun.artifacts['coverage-final.json'])
 throw new Error('The supplied unit coverage differs from the passed run raw profile.');
const sourceRoot=resolve(input,'../source');
const captured=JSON.parse(await readFile(resolve(sourceRoot,'source-manifest.json'),'utf8'));
const capturedFrontend=capturedFrontendSources(captured);
const frontendRoots=[resolve('frontend'),resolve(sourceRoot,'frontend')];
const map=createCoverageMap({}),conversionErrors=[],excludedResources=new Set();
let records=0,convertedScripts=0;
// Identical counter shapes avoid remapping the same compiled source repeatedly.
// The ungrouped path remains available to verify complete report equivalence.
const groups=process.env['GATEGOLD_GROUP_BROWSER_COUNTERS']==='0'?null:new BrowserCounterGroups();
function sourcePath(path) {
 return frontendSourcePath(path,capturedFrontend,frontendRoots);
}

async function convertScript(entry,sourceMap,allowed) {
 const converted=await convert({code:entry.source,sourceMap,ast:await parseAstAsync(entry.source),coverage:{url:pathToFileURL(resolve(sourceRoot,'frontend',new URL(entry.url).pathname.slice(1))).href,functions:entry.functions}});
 for(const [path,data] of Object.entries(converted)) {
  const original=path.startsWith('file:')?fileURLToPath(path):path;
  const relative=sourcePath(original);
  if(!relative || ![...allowed.values()].includes(relative))continue;
  const canonical=resolve(sourceRoot,'frontend',relative);
  map.merge({[canonical]:{...data,path:canonical}});
 }
 convertedScripts++;
}
for(const name of (await readdir(input)).filter(n=>n.endsWith('.json.gz')).sort()) {
 for(const entry of JSON.parse(gunzipSync(await readFile(resolve(input,name))).toString('utf8'))) {
  if(!entry.source)continue;
  if(entry.mapError){conversionErrors.push({file:name,reason:'source_map_fetch_failed'});continue;}
  try {
   const sourceMap=inlineSourceMap(entry.source)??entry.sourceMap;
   if(!sourceMap)continue; // Runtime helpers and third-party scripts have no application source.
   const allowed=new Map();
   for(let i=0;i<sourceMap.sources.length;i++) {
    const source=sourceMap.sources[i];
    // Angular gives extracted CSS/template resources a .ts-looking source name.
    // Reject those before resolving only authoritative captured TS members.
    if(source.startsWith('angular:')){excludedResources.add(source);continue;}
    const path=frontendSourcePath(source,capturedFrontend,frontendRoots,sourceMap.sourceRoot);
    if(!path)continue;
    if(sourceMap.sourcesContent?.[i]!==await readFile(resolve(sourceRoot,'frontend',path),'utf8'))throw new Error('Source-map content differs from the captured TypeScript.');
    allowed.set(source,path);
   }
   if(!allowed.size)continue;
   if(groups)groups.add(entry,sourceMap,{allowed,file:name});
   else await convertScript(entry,sourceMap,allowed);
   records++;
  } catch {conversionErrors.push({file:name,reason:'conversion_or_source_validation_failed'});}
 }
}
if(groups)for(const group of groups.values()) {
 try {await convertScript({...group,functions:group.coverage.functions},group.sourceMap,group.context.allowed);}
 catch {conversionErrors.push({file:group.context.file,reason:'conversion_or_source_validation_failed'});}
}
await mkdir(output,{recursive:true});
const browserDirectory=resolve(output,'browser');
const context=createContext({dir:browserDirectory,coverageMap:map});
for(const name of ['json','json-summary','lcovonly','text-summary'])reports.create(name).execute(context);
let unitSummary=null,combinedSummary=null,combinedFiles=0,frontendDenominator=null;
if(unitInput) {
 const unit=createCoverageMap(JSON.parse(await readFile(unitInput,'utf8')));
 const manifest=JSON.parse(await readFile(resolve(dirname(unitInput),'source-manifest.json'),'utf8'));
 validateUnitCoverageSources(manifest,capturedFrontend,unit.files().map(sourcePath));
 const unitContext=createContext({dir:resolve(output,'unit'),coverageMap:unit});
 for(const name of ['json-summary','lcovonly'])reports.create(name).execute(unitContext);
 unitSummary=unit.getCoverageSummary().toJSON();
 const browserByPath=new Map(map.files().map(path=>[sourcePath(path),map.fileCoverageFor(path).toJSON()]));
 const combined=createCoverageMap({});
 for(const path of unit.files()) {
  const relative=sourcePath(path),data=unit.fileCoverageFor(path).toJSON(),browser=browserByPath.get(relative);
  let merged=data;
  if(browser && relative) {
   const actual=createHash('sha256').update(await readFile(resolve(sourceRoot,'frontend',relative))).digest('hex');
   if(manifest[relative]!==actual)conversionErrors.push({file:relative,reason:'unit_and_browser_source_hash_mismatch'});
   else {merged=mergeExactCoverage(data,browser);combinedFiles++;}
  }
  combined.addFileCoverage(merged);
 }
 const combinedContext=createContext({dir:resolve(output,'combined'),coverageMap:combined});
 for(const name of ['json','json-summary','lcovonly','text-summary'])reports.create(name).execute(combinedContext);
 combinedSummary=combined.getCoverageSummary().toJSON();
 // Bind the producer's own summaries, never independently supplied totals.
 // The complete source set above includes files Chromium did not load.
 const summaries={};
 for(const kind of ['unit','combined']) {
  const path=kind+'/coverage-summary.json';
  summaries[kind]={path,sha256:createHash('sha256').update(await readFile(resolve(output,path))).digest('hex')};
 }
 // Keep the complete private run proof beside the derived measurement so the
 // publisher can independently revalidate outcomes, inputs, counters and latest
 // attempt identity. The public measurement contains only its identity and hash.
 const provenanceDirectory=resolve(output,'unit/provenance');
 await mkdir(provenanceDirectory,{recursive:true});
 for(const name of ['unit-attempt.json','unit-run-provenance.json',...Object.keys(unitRun.artifacts)])
  await copyFile(resolve(dirname(unitInput),name),resolve(provenanceDirectory,name));
 const proofPath='unit/provenance/unit-run-provenance.json';
 frontendDenominator={version:1,kind:'validated_full_frontend_typescript_denominator',sources:capturedFrontend,summaries,
  unitRun:{path:proofPath,sha256:createHash('sha256').update(await readFile(resolve(output,proofPath))).digest('hex'),runId:unitRun.runId}};
}
await writeFile(resolve(output,'measurement.json'),JSON.stringify({
 provider:'Chromium V8 with AST-aware source mapping; Vitest reported separately',
 browserScope:'Loaded handwritten frontend/src TypeScript, including bootstrap, with exact captured-source validation; not a full source denominator',
 unitScope:unitInput?'All handwritten frontend/src/**/*.ts, including src/main.ts; specs and the two generated API client directories are excluded':'Not supplied',
 combinedCoverage:combinedSummary,
 frontendDenominator,
 combinedFiles,
 combinedCoverageLimitation:'Conservative projection onto the full Vitest denominator: only exact statement/function/branch source spans with matching file hashes receive browser credit. Incompatible compiler-generated spans are not credited. Percentages are never added and the denominator does not grow.',
 navigationLimit:'Chromium may reset V8 counters on document navigation. SPA execution in captured page fixtures is measured; auxiliary contexts are not automatically captured.',
 records,convertedScripts,identicalScriptGrouping:!!groups,files:map.files().length,browserSummary:map.getCoverageSummary().toJSON(),unitSummary,
 excludedCompiledResources:excludedResources.size,conversionErrors,completeSourceMapping:conversionErrors.length===0,
},null,2)+'\n');
if(conversionErrors.length)process.exitCode=1;
