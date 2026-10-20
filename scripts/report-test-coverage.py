#!/usr/bin/env python3
"""Publish a credential-free matrix; reject stale evidence and never infer coverage."""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def application_hash(root):
    spec=importlib.util.spec_from_file_location('source_capture',root/'scripts/capture-test-source.py')
    capture=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(capture)
    def included(path):
        return (path.startswith('backend/') and not path.endswith('_test.go') and not path.startswith('backend/tests/')) or (path.startswith('frontend/src/') and not path.endswith('.spec.ts')) or path.startswith(('frontend/public/','integrations/','infra/sql/')) or path in ['frontend/package-lock.json','frontend/package.json','frontend/angular.json']
    entries=[[str(path),digest((root/path).read_bytes())] for path in capture.source_files(root) if included(str(path))]
    # Path ordering compares directory components; JavaScript's reporter sorts
    # complete path strings. Normalize here too (foo.go sorts before foo/bar.go).
    return digest(json.dumps(sorted(entries),ensure_ascii=False,separators=(',',':')).encode())


def validate_test_sources(report, manifest, root):
    encoded=json.dumps(sorted(manifest.items()),ensure_ascii=False,separators=(',',':')).encode()
    if digest(encoded)!=report.get('sourceManifestSha256'):
        raise ValueError('The execution source manifest does not match its recorded hash.')
    # Full selection metadata describes the producing run, not a later checkout.
    # Validate the complete browser inventory too: an unlabelled new regression,
    # removed test, or changed Playwright config must invalidate old full proof.
    spec=importlib.util.spec_from_file_location('browser_source_capture',Path(__file__).with_name('capture-test-source.py'))
    capture=importlib.util.module_from_spec(spec);spec.loader.exec_module(capture)
    def browser_input(name):
        return name.startswith('frontend/e2e/') or name=='frontend/playwright.config.ts'
    expected={name:value for name,value in manifest.items() if browser_input(name)}
    actual={str(path):digest((root/path).read_bytes()) for path in capture.source_files(root) if browser_input(str(path))}
    if expected!=actual:
        raise ValueError('Browser test/helper inventory or Playwright configuration changed after execution; rerun the current tests.')
    files={entry['file'] for case in report['cases'] for entry in case['evidence']}
    paths=set()
    for name in files:
        relative=Path(name)
        if relative.is_absolute() or '..' in relative.parts or not name.startswith('e2e/'):
            raise ValueError('Execution evidence must name a captured browser test file.')
        paths.add('frontend/'+name)
    paths.update(name for name in manifest if name.startswith('frontend/e2e/support/'))
    for name in paths:
        path=root/name
        if not path.is_file() or manifest.get(name)!=digest(path.read_bytes()):
            raise ValueError('Browser tests or shared helpers changed after execution; rerun the current tests.')
    return len(files)



def browser_execution_scope(report):
    execution=report.get('execution')
    scope={'full':False,'scope':'missing_execution','selectedTests':0,'attempts':0,'timingOptOuts':0}
    if not isinstance(execution,dict):return scope
    scope.update(selectedTests=len(execution.get('selectedTests',[])),attempts=len(execution.get('attempts',[])))
    if execution.get('listing') is not False:return {**scope,'scope':'listing'}
    if execution.get('fullSelection') is not True:return {**scope,'scope':'filtered'}
    if execution.get('shard') is not None:return {**scope,'scope':'partial_shard'}
    merged=execution.get('mergedShards')
    if merged is not None and (type(merged) is not int or merged<2):return {**scope,'scope':'invalid_execution'}
    try:
        # Reuse the exact canonical identity/attempt parser used by the shard
        # merger rather than inventing a second completion vocabulary.
        spec=importlib.util.spec_from_file_location('full_browser_selection',ROOT/'scripts/merge-browser-shards.py')
        merger=importlib.util.module_from_spec(spec);spec.loader.exec_module(merger)
        _,_,selected,attempts=merger.selection(report)
        if len(attempts)!=len(selected):return {**scope,'scope':'retried_or_incomplete'}
        skipped=0
        for (test_id,retry),attempt in attempts.items():
            test=selected[test_id]
            if retry!=0:return {**scope,'scope':'retried_or_incomplete'}
            if attempt['status']=='skipped' and attempt['expectedStatus']==test.get('expectedStatus')=='skipped' and test['file']=='e2e/performance.spec.ts':
                skipped+=1
            elif attempt['status']!='passed' or attempt['expectedStatus']!='passed' or test.get('expectedStatus')!='passed':
                return {**scope,'scope':'unexpected_outcome'}
        return {**scope,'full':True,'scope':'full_unfiltered','timingOptOuts':skipped}
    except (OSError,ValueError,KeyError,TypeError):
        return {**scope,'scope':'invalid_execution'}


def build(report, catalog, catalog_hash, current_app_hash):
    if report.get('version')!=2:
        raise ValueError('Use a version-2 report with source and surface provenance.')
    if report.get('catalogSha256')!=catalog_hash:
        raise ValueError('Catalog changed after this report; run tests on the current catalog.')
    if not report.get('sourceManifestSha256') or report.get('applicationSha256')!=current_app_hash:
        raise ValueError('Application changed after this report; old execution cannot verify new code.')
    evidence={case['id']:case for case in report['cases']}
    expected={case['id'] for case in catalog['cases']}
    if set(evidence)!=expected or len(evidence)!=len(report['cases']):
        raise ValueError('Report must include every current case exactly once.')
    rows=[]
    for case in catalog['cases']:
        observed=evidence[case['id']]
        passed=observed['status']=='passed'
        surfaces=observed.get('verifiedSurfaces',[]) if passed else []
        rows.append({'id':case['id'],'area':case['area'],'title':case['title'],'implementation':case['implementation'],
          'status':observed['status'],'verifiedSurfaces':surfaces,'missingSurfaces':sorted(set(case['surfaces'])-set(surfaces)),
          'evidence':observed['evidence']})
    return {'version':1,'targetPercent':100,'applicationSha256':current_app_hash,'catalogSha256':catalog_hash,
      'suiteStatus':report['suiteStatus'],'invalidEvidence':report.get('invalidEvidence',False),
      'browserExecution':browser_execution_scope(report),
      'total':len(rows),'verified':sum(row['status']=='passed' for row in rows),
      'fullyVerifiedAcrossSurfaces':sum(row['status']=='passed' and not row['missingSurfaces'] for row in rows),
      'outcomes':dict(Counter(row['status'] for row in rows)),
      'blockedExpectations':[row['id'] for row in rows if row['implementation'] in ['external_pending','unclear']],
      'cases':rows}


def render(result):
    lines=['# Current test coverage','','Target: **100%**. A mapped case is counted only after its exact assertions pass on the recorded source.','',
      f"Verified cases: **{result['verified']} / {result['total']}**. Verified on every declared surface: **{result['fullyVerifiedAcrossSurfaces']} / {result['total']}**.",'',
      f"Suite result: `{result['suiteStatus']}`. Invalid evidence: `{result['invalidEvidence']}`.",'',
      f"Browser execution scope: `{result['browserExecution']['scope']}`; selected tests: {result['browserExecution']['selectedTests']}; recorded attempts: {result['browserExecution']['attempts']}; explicit timing opt-outs: {result['browserExecution']['timingOptOuts']}.",'',
      'Browser/API outcome coverage, frontend source coverage and Go statement coverage are separate measurements. They are not interchangeable or added together.','',
      '| Area | Passed cases | All cases | Every declared surface |','|---|---:|---:|---:|']
    for area in sorted({row['area'] for row in result['cases']}):
        rows=[r for r in result['cases'] if r['area']==area]
        lines.append(f"| {area} | {sum(r['status']=='passed' for r in rows)} | {len(rows)} | {sum(r['status']=='passed' and not r['missingSurfaces'] for r in rows)} |")
    lines+=['','## Source coverage','','```json',json.dumps(result.get('sourceCoverage',{}),indent=2),'```','',
      'Go’s built-in coverage reports statements, not branch percentages. Frontend unit reports include unexecuted application TypeScript; browser reports cover loaded source and have documented navigation/context limits. Generated API clients and test code are excluded from frontend application metrics.','',
      '## Remaining cases','','| Case | Outcome | Missing surfaces | Implementation |','|---|---|---|---|']
    for row in result['cases']:
        if row['status']!='passed' or row['missingSurfaces']:
            lines.append(f"| {row['id']} | {row['status']} | {', '.join(row['missingSurfaces'])} | {row['implementation']} |")
    return '\n'.join(lines)+'\n'


def full_source_metrics(metrics):
    code=metrics.get('frontendCombined',metrics.get('frontendUnit',{}))
    go=metrics.get('goStatements',{})
    def complete(value):
        return value.get('total',0)>0 and value.get('covered')==value['total']
    return metrics.get('frontendDenominatorVerified') is True and metrics.get('goDenominatorVerified') is True and all(complete(code.get(metric,{})) for metric in ['lines','branches','functions','statements']) and complete(go)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--use-cases',type=Path,required=True)
    parser.add_argument('--source-manifest',type=Path)
    parser.add_argument('--unit-summary',type=Path)
    parser.add_argument('--combined-summary',type=Path)
    parser.add_argument('--frontend-measurement',type=Path)
    parser.add_argument('--go-summary',type=Path)
    parser.add_argument('--go-profile',type=Path)
    parser.add_argument('--go-provenance',type=Path)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--enforce',action='store_true')
    args=parser.parse_args()
    raw=(ROOT/'docs/use-cases/catalog.json').read_bytes()
    observed=json.loads(args.use_cases.read_text())
    manifest_path=args.source_manifest or args.use_cases.parent/'source/source-manifest.json'
    execution_manifest=json.loads(manifest_path.read_text())
    verified_files=validate_test_sources(observed,execution_manifest,ROOT)
    report=build(observed,json.loads(raw),digest(raw),application_hash(ROOT))
    report['verifiedTestSourceFiles']=verified_files
    metrics={'frontendDenominatorVerified':False}
    if args.unit_summary:
        metrics['frontendUnit']=json.loads(args.unit_summary.read_text())['total']
    if args.combined_summary:
        metrics['frontendCombined']=json.loads(args.combined_summary.read_text())['total']
    if args.frontend_measurement:
        frontend_spec=importlib.util.spec_from_file_location('frontend_proof',ROOT/'scripts/frontend-coverage-provenance.py')
        frontend_proof=importlib.util.module_from_spec(frontend_spec);frontend_spec.loader.exec_module(frontend_proof)
        try:
            metrics['frontendDenominatorVerified']=frontend_proof.validate(args.frontend_measurement,ROOT,args.unit_summary,args.combined_summary)
        except (OSError,ValueError,KeyError,TypeError):
            # Raw counters remain useful diagnostics, but never strict proof.
            metrics['frontendProvenance']='missing_or_unmatched'
    if args.go_profile:
        spec=importlib.util.spec_from_file_location('source_gate',ROOT/'scripts/check-source-coverage.py')
        gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
        profile=args.go_profile.read_text()
        metrics['goDenominatorVerified']=False
        if args.go_provenance:
            proof_spec=importlib.util.spec_from_file_location('go_proof',ROOT/'scripts/go-coverage-provenance.py')
            proof=importlib.util.module_from_spec(proof_spec);proof_spec.loader.exec_module(proof)
            inventory=proof.validate(args.go_provenance,execution_manifest)
            proof.require_complete(profile,inventory)
            metrics['goDenominatorVerified']=True
        metrics['goStatements']=gate.go_counts(profile)
    if args.go_summary:
        match=re.search(r'total:\s+\(statements\)\s+([\d.]+)%',args.go_summary.read_text())
        if not match:raise ValueError('Go statement summary is missing its total.')
        metrics['goStatementsPercent']=float(match.group(1))
    report['sourceCoverage']=metrics
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'use-cases.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    (args.output/'README.md').write_text(render(report))
    print(json.dumps({key:report[key] for key in ['total','verified','fullyVerifiedAcrossSurfaces','suiteStatus','invalidEvidence']}))
    if args.enforce:
        if not report['browserExecution']['full'] or report['suiteStatus']!='passed' or report['invalidEvidence'] or report['fullyVerifiedAcrossSurfaces']!=report['total'] or report['blockedExpectations'] or not full_source_metrics(metrics):
            raise SystemExit('The 100% target has not been met. See the remaining-case and source-coverage reports.')


if __name__=='__main__':main()
