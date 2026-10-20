#!/usr/bin/env python3
"""Check exact counters rather than rounded percentages or empty reports."""
import argparse
import importlib.util
import json
from pathlib import Path

_spec=importlib.util.spec_from_file_location('coverage_profile_parser',Path(__file__).with_name('merge-go-coverage.py'))
_profile=importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_profile)


def go_counts(go_profile):
    covered=total=0
    _,rows=_profile.read_profile(go_profile)
    for statements,count in rows.values():
        total+=statements
        if count>0:covered+=statements
    return {'covered':covered,'total':total}


def check(unit, go_profile, inventory=None):
    if inventory is None:
        raise ValueError('An authoritative complete Go inventory is required.')
    actual_mode,actual=_profile.read_profile(go_profile)
    expected_mode,expected=_profile.read_profile(inventory)
    if actual_mode!='mode: atomic' or actual_mode!=expected_mode or {key:size for key,(size,_) in actual.items()} != {key:size for key,(size,_) in expected.items()}:
        raise ValueError('Go profile differs from its complete block denominator.')
    totals={}
    for metric in ['lines','branches','functions','statements']:
        value=unit['total'][metric]
        if value['total']<1 or value['covered']!=value['total']:
            totals['frontend.'+metric]={'covered':value['covered'],'total':value['total']}
    go=go_counts(go_profile)
    if go['total']<1 or go['covered']!=go['total']:totals['go.statements']=go
    return totals


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--unit-summary',type=Path,required=True)
    parser.add_argument('--frontend-measurement',type=Path,required=True)
    parser.add_argument('--go-profile',type=Path,required=True)
    parser.add_argument('--go-provenance',type=Path,required=True)
    args=parser.parse_args()
    proof_spec=importlib.util.spec_from_file_location('go_proof',Path(__file__).with_name('go-coverage-provenance.py'))
    proof=importlib.util.module_from_spec(proof_spec);proof_spec.loader.exec_module(proof)
    root=Path(__file__).resolve().parents[1]
    frontend_spec=importlib.util.spec_from_file_location('frontend_proof',root/'scripts/frontend-coverage-provenance.py')
    frontend=importlib.util.module_from_spec(frontend_spec);frontend_spec.loader.exec_module(frontend)
    frontend.validate(args.frontend_measurement,root,args.unit_summary)
    capture_spec=importlib.util.spec_from_file_location('current_source_capture',root/'scripts/capture-test-source.py')
    capture=importlib.util.module_from_spec(capture_spec);capture_spec.loader.exec_module(capture)
    import hashlib
    backend={str(path):hashlib.sha256((root/path).read_bytes()).hexdigest() for path in capture.source_files(root) if str(path).startswith('backend/')}
    inventory=proof.validate(args.go_provenance,backend)
    missing=check(json.loads(args.unit_summary.read_text()),args.go_profile.read_text(),inventory)
    print(json.dumps({'targetPercent':100,'belowTarget':missing}))
    if missing:raise SystemExit('Source coverage is below100%; uncovered counters remain.')
