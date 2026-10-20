import type { Reporter, TestCase, TestResult, TestStep, FullResult, FullConfig, Suite } from '@playwright/test/reporter';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';

const catalogSchema = z.object({ cases: z.array(z.object({
  id: z.string(), area: z.string(), implementation: z.string(), surfaces: z.array(z.string()),
}).passthrough()) });
const surfaceSchema = z.enum(['web','rest','mcp','operator','background','plugin','frontend_service']);
interface Evidence {
  testId: string; file: string; line: number; retry: number; surface: string;
  result: 'passed' | 'failed' | 'flaky' | 'assertion_missing'; assertions: number;
}
interface SelectedTest {testId:string;identity:string;file:string;line:number;column:number;repeatEachIndex:number;titlePathSha256:string;expectedStatus:string}
interface TestAttempt {testId:string;identity:string;status:string;retry:number;expectedStatus:string}
function selectionArguments(args:string[]):string[] {
  const skip=new Set(['--shard','--output','--workers','--reporter']);
  const kept:string[]=[];
  for(let index=0;index<args.length;index++) {
    const value=args[index]!;
    if(value==='--list')continue;
    if(skip.has(value)){index++;continue;}
    if([...skip].some(flag=>value.startsWith(flag+'=')))continue;
    kept.push(value);
  }
  return kept;
}
function expression(value:unknown):unknown {
  if(value instanceof RegExp)return {source:value.source,flags:value.flags};
  if(Array.isArray(value))return value.map(expression);
  return value;
}
interface RecordedCase { id: string; area: string; implementation: string; surfaces: string[]; caseSha256: string; evidence: Evidence[] }
interface ReporterOptions {catalogPath?: string; manifestPath?: string; outputPath?: string; requireFull?: boolean}
const pattern = /^use-case: (UC-[A-Z]{2,5}-\d{4})(?: \[([a-z_]+)\])?$/;
function sha256(value: string): string {return createHash('sha256').update(value).digest('hex');}
function assertions(step: TestStep): number {
  // Polling assertions contain unsuccessful internal matcher attempts. Count
  // the completed public assertion once, rather than counting each attempt.
  return step.category === 'expect' ? 1 : step.steps.reduce((sum, child) => sum + assertions(child), 0);
}
function failed(step: TestStep): boolean {
  if (step.category === 'expect') return !!step.error;
  // A canceled transport call can be an intentional recovery precondition.
  // A successful assertion owns the outcome of its internal polling attempts.
  // Caught public assertions and failed semantic steps still invalidate proof.
  return (step.category === 'test.step' && !!step.error) || step.steps.some(failed);
}
function labeledSteps(steps: TestStep[]): TestStep[] {
  return steps.flatMap(step => [...(step.title.startsWith('use-case: ') ? [step] : []), ...labeledSteps(step.steps)]);
}

/** Emits IDs, hashes and statuses only; credentials and error payloads stay private. */
export default class UseCaseReporter implements Reporter {
  private readonly cases: Map<string, RecordedCase>;
  private readonly catalogHash: string;
  private readonly sourceHash: string | null;
  private readonly appHash: string | null;
  private invalid = false;
  private execution: {shard:{current:number;total:number}|null;listing:boolean;fullSelection:boolean;selectionFiltersSha256:string;selectedTests:SelectedTest[];attempts:TestAttempt[]}|null=null;
  private selectedById=new Map<string,SelectedTest>();
  private readonly invalidDetails: {reason:string;id:string|null;surface:string|null;file:string;line:number}[]=[];
  constructor(private readonly options: ReporterOptions = {}) {
    const raw = readFileSync(options.catalogPath ?? resolve('../docs/use-cases/catalog.json'), 'utf8');
    this.catalogHash = sha256(raw);
    const manifestPath = options.manifestPath ?? resolve('../source-manifest.json');
    const manifest = existsSync(manifestPath) ? z.record(z.string(),z.string()).parse(JSON.parse(readFileSync(manifestPath,'utf8')) as unknown) : null;
    this.sourceHash = manifest ? sha256(JSON.stringify(Object.entries(manifest).sort())) : null;
    const application = manifest ? Object.entries(manifest).filter(([path]) =>
      (path.startsWith('backend/') && !path.endsWith('_test.go') && !path.startsWith('backend/tests/')) ||
      (path.startsWith('frontend/src/') && !path.endsWith('.spec.ts')) || path.startsWith('frontend/public/') ||
      path.startsWith('integrations/') || path.startsWith('infra/sql/') ||
      ['frontend/package-lock.json','frontend/package.json','frontend/angular.json'].includes(path),
    ).sort() : null;
    this.appHash = application ? sha256(JSON.stringify(application)) : null;
    this.cases = new Map(catalogSchema.parse(JSON.parse(raw) as unknown).cases.map(item => [item.id, {
      id:item.id,area:item.area,implementation:item.implementation,surfaces:item.surfaces,
      caseSha256:sha256(JSON.stringify(item)),evidence:[],
    }]));
  }
  onBegin(config:FullConfig,suite:Suite):void {
    const selected=suite.allTests().map(test=>{
      const file=relative(resolve('.'),test.location.file),titlePathSha256=sha256(JSON.stringify(test.titlePath()));
      return {testId:test.id,identity:sha256(JSON.stringify([file,test.location.line,test.location.column,test.repeatEachIndex,titlePathSha256])),file,line:test.location.line,column:test.location.column,repeatEachIndex:test.repeatEachIndex,titlePathSha256,expectedStatus:test.expectedStatus};
    }).sort((a,b)=>a.identity.localeCompare(b.identity));
    this.selectedById=new Map(selected.map(test=>[test.testId,test]));
    const args=selectionArguments(process.argv.slice(2));
    const unfiltered=(value:unknown):boolean=>value instanceof RegExp?value.source==='.*'&&value.flags==='':Array.isArray(value)&&value.length===1&&unfiltered(value[0]);
    const noInverse=(value:unknown):boolean=>value==null||(Array.isArray(value)&&value.length===0);
    const fullSelection=args.length===1&&args[0]==='test'&&config.forbidOnly&&unfiltered(config.grep)&&noInverse(config.grepInvert)&&config.projects.every(project=>unfiltered(project.grep)&&noInverse(project.grepInvert));
    const filters={arguments:args,forbidOnly:config.forbidOnly,grep:expression(config.grep),grepInvert:expression(config.grepInvert),projects:config.projects.map(project=>({name:project.name,testDir:relative(resolve('.'),project.testDir),testMatch:expression(project.testMatch),testIgnore:expression(project.testIgnore),grep:expression(project.grep),grepInvert:expression(project.grepInvert),repeatEach:project.repeatEach}))};
    this.execution={shard:config.shard,listing:process.argv.includes('--list'),fullSelection,selectionFiltersSha256:sha256(JSON.stringify(filters)),selectedTests:selected,attempts:[]};
  }
  onTestEnd(test: TestCase, result: TestResult): void {
    if(this.execution) {
      const selected=this.selectedById.get(test.id);
      if(!selected)this.invalid=true;
      else this.execution.attempts.push({testId:test.id,identity:selected.identity,status:result.status,retry:result.retry,expectedStatus:test.expectedStatus});
    }
    for (const step of labeledSteps(result.steps)) {
      const match = pattern.exec(step.title);
      const record = match?.[1] ? this.cases.get(match[1]) : undefined;
      const surface = match?.[2];
      if (!record || (surface && (!surfaceSchema.safeParse(surface).success || !record.surfaces.includes(surface)))) {
        this.invalid = true;
        this.invalidDetails.push({reason:!match?'malformed_label':!record?'unknown_case':'undeclared_surface',
          id:match?.[1]??null,surface:surface && surfaceSchema.safeParse(surface).success?surface:null,
          file:relative(resolve('.'),test.location.file),line:test.location.line});
        continue;
      }
      const count = assertions(step);
      const passed = result.status === 'passed' && test.expectedStatus === 'passed' && !failed(step);
      record.evidence.push({
        testId:test.id,file:relative(resolve('.'),test.location.file),line:test.location.line,
        retry:result.retry,assertions:count,surface:surface ?? 'unspecified',
        result:!passed ? 'failed' : count === 0 ? 'assertion_missing' : result.retry > 0 ? 'flaky' : 'passed',
      });
    }
  }
  async onEnd(result: FullResult): Promise<{status?: FullResult['status']} | void> {
    const cases = [...this.cases.values()].map(record => ({...record,
      verifiedSurfaces:[...new Set(record.evidence.filter(e=>e.result==='passed' && e.surface!=='unspecified').map(e=>e.surface))],
      status:record.evidence.some(e=>e.result==='failed') ? 'failed' :
        record.evidence.some(e=>e.result==='flaky') ? 'flaky' :
        record.evidence.some(e=>e.result==='assertion_missing') ? 'assertion_missing' :
        record.evidence.length ? 'passed' : 'not_run',
    }));
    // An intentionally unavailable action can have a passing negative outcome.
    // Provider acceptance and unresolved expectations remain explicit blockers.
    const eligible = cases.filter(c=>!['external_pending','unclear'].includes(c.implementation));
    const verified = eligible.filter(c=>c.status==='passed');
    const output = resolve(this.options.outputPath ?? process.env['GATEGOLD_USE_CASE_REPORT'] ?? '../.local/use-case-results.json');
    mkdirSync(dirname(output),{recursive:true});
    writeFileSync(output,JSON.stringify({
      version:2,catalogSha256:this.catalogHash,sourceManifestSha256:this.sourceHash,applicationSha256:this.appHash,suiteStatus:result.status,
      coverageDefinition:'Passing first-attempt scenarios with expect assertions inside explicitly identified use-case steps. Surface coverage is recorded only when explicitly declared. No inferred legacy coverage.',
      total:cases.length,eligible:eligible.length,verified:verified.length,percent:eligible.length ? 100*verified.length/eligible.length : 0,
      unresolved:cases.filter(c=>['external_pending','unclear'].includes(c.implementation)).map(c=>c.id),
      invalidEvidence:this.invalid,invalidEvidenceDetails:this.invalidDetails,execution:this.execution,cases,
    },null,2)+'\n');
    const strict = this.options.requireFull ?? process.env['GATEGOLD_REQUIRE_FULL_USE_CASE_COVERAGE']==='1';
    const unresolved = cases.some(c=>['external_pending','unclear'].includes(c.implementation));
    const missingSurface = cases.some(c=>c.surfaces.some(surface=>!c.verifiedSurfaces.includes(surface)));
    if (this.invalid || cases.some(c=>c.status==='assertion_missing') || (strict &&
      (result.status!=='passed' || !this.sourceHash || unresolved || missingSurface || cases.some(c=>c.status!=='passed')))) return {status:'failed'};
  }
  printsToStdio(): boolean {return false;}
}
