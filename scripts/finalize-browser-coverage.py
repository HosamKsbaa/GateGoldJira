#!/usr/bin/env python3
"""Collect source-matched public reports from exactly one isolated browser run."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--run',type=Path)
parser.add_argument('--run-index',type=Path)
parser.add_argument('--go-unit-run',type=Path)
parser.add_argument('--enforce',action='store_true')
parser.add_argument('--output',type=Path,default=ROOT/'.local/coverage/browser')
args=parser.parse_args()
if args.run and args.run_index:raise SystemExit('Choose one exact browser run input.')
if args.run_index:
    index=json.loads(args.run_index.read_text())
    if index.get('status') not in ['passed','failed']:raise SystemExit('The indexed browser run has not finished.')
    run=Path(index['runDirectory']).resolve()
elif args.run:
    run=args.run.resolve()
else:
    candidates=list((ROOT/'.local/browser-tests').glob('*/use-case-results.json'))
    if len(candidates)!=1:raise SystemExit('Pass --run explicitly unless this checkout has exactly one browser report.')
    run=candidates[0].parent
unit=ROOT/'.local/coverage/frontend-unit/coverage-final.json'
command=['node',str(ROOT/'scripts/report-browser-code-coverage.mjs'),str(run/'js-coverage'),str(args.output/'code')]
if unit.is_file():command.append(str(unit))
subprocess.run(command,cwd=ROOT,check=True)
go_profile=run/'go-statements.out'
go_summary=run/'go-statements.txt'
unit_run=args.go_unit_run
go_provenance=None
unit_index=ROOT/'.local/coverage/backend-unit.json'
if unit_run is None and unit_index.is_file():
    index=json.loads(unit_index.read_text())
    if index.get('status')!='passed':raise SystemExit('The indexed backend coverage run did not pass.')
    unit_run=Path(index['runDirectory'])
if unit_run:
    if json.loads((unit_run/'result.json').read_text()).get('status')!='passed':raise SystemExit('The backend coverage run did not pass.')
    go_provenance=unit_run/'go-coverage-provenance.json'
    if not go_provenance.is_file():raise SystemExit('The full Go run lacks authoritative denominator provenance; validate it with scripts/go-coverage-provenance.py create --run <run>.')
    merged=args.output/'go-statements.out'
    subprocess.run([sys.executable,str(ROOT/'scripts/merge-go-coverage.py'),
      '--profile',str(unit_run/'go-unit-statements.out'),'--manifest',str(unit_run/'source/source-manifest.json'),
      '--profile',str(go_profile),'--manifest',str(run/'source/source-manifest.json'),'--go-provenance',str(go_provenance),'--output',str(merged)],cwd=ROOT,check=True)
    go_profile=merged
    go_summary=args.output/'go-statements.txt'
    with go_summary.open('w') as target:
        subprocess.run(['go','tool','cover','-func='+str(go_profile.resolve())],cwd=unit_run/'source/backend',stdout=target,check=True)
command=[sys.executable,str(ROOT/'scripts/report-test-coverage.py'),'--use-cases',str(run/'use-case-results.json'),'--go-summary',str(go_summary),'--go-profile',str(go_profile),'--output',str(args.output/'cases')]
if go_provenance:command+=['--go-provenance',str(go_provenance)]
if unit.is_file():command+=['--unit-summary',str(args.output/'code/unit/coverage-summary.json')]
combined=args.output/'code/combined/coverage-summary.json'
# A reused output directory can retain an older combined report. Only this
# invocation's source-validated converter result may supply the denominator.
measurement=json.loads((args.output/'code/measurement.json').read_text())
if unit.is_file() and measurement.get('combinedCoverage') is not None and combined.is_file():command+=['--combined-summary',str(combined)]
command+=['--frontend-measurement',str(args.output/'code/measurement.json')]
if args.enforce:command+=['--enforce']
subprocess.run(command,cwd=ROOT,check=True)
