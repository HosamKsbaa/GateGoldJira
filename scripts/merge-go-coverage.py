#!/usr/bin/env python3
"""Merge exact Go block counters only when both captured sources match."""
import argparse
import json
from pathlib import Path


def read_profile(text):
    lines=text.splitlines()
    if not lines or lines[0] not in ['mode: atomic','mode: count','mode: set']:
        raise ValueError('A real Go coverage profile is required.')
    rows={}
    for line in lines[1:]:
        location,size,count=line.rsplit(' ',2)
        size,count=int(size),int(count)
        if size<0 or count<0:
            raise ValueError('Invalid coverage block.')
        previous=rows.get(location)
        if previous:
            if previous[0]!=size:
                raise ValueError('Duplicate coverage blocks have different statement counts.')
            # go test -coverpkg=./... emits the same block from several test
            # packages. Match Go's cover.ParseProfilesFromReader: one denominator
            # entry, OR for set mode and summed samples for count/atomic modes.
            count=previous[1]|count if lines[0]=='mode: set' else previous[1]+count
        rows[location]=(size,count)
    return lines[0],rows


def merge(profiles, inventory=None):
    profiles=list(profiles)
    mode=None
    merged={}
    file_shapes={}
    hashes={}
    for text,manifest in profiles:
        current,rows=read_profile(text)
        if mode is not None and mode!=current:
            raise ValueError('Coverage counter modes differ.')
        mode=current
        shapes={}
        for location,(size,count) in rows.items():
            name=location.rsplit(':',1)[0]
            if not name.startswith('gategoldjira/backend/') or not name.endswith('.go'):
                raise ValueError('Coverage source is outside the captured application.')
            relative=name.removeprefix('gategoldjira/')
            digest=manifest.get(relative)
            if not digest or any(other.get(relative)!=digest for _,other in profiles) or (relative in hashes and hashes[relative]!=digest):
                raise ValueError('Coverage sources differ or lack a captured hash: '+relative)
            hashes[relative]=digest
            shapes.setdefault(relative,{})[location]=size
            previous=merged.get(location)
            if previous and previous[0]!=size:
                raise ValueError('Coverage block statement counts differ.')
            merged[location]=(size,max(previous[1] if previous else 0,count))
        for name,shape in shapes.items():
            if name in file_shapes and file_shapes[name]!=shape:
                raise ValueError('Coverage block maps differ: '+name)
            file_shapes[name]=shape
    if mode is None or not merged:
        raise ValueError('No nonempty source coverage was supplied.')
    if inventory is not None:
        expected_mode,expected=read_profile(inventory)
        if expected_mode!=mode or {key:size for key,(size,_) in merged.items()} != {key:size for key,(size,_) in expected.items()}:
            raise ValueError('Merged Go profile differs from its authoritative full block denominator.')
    return mode+'\n'+''.join(f'{location} {size} {count}\n' for location,(size,count) in sorted(merged.items()))


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--profile',type=Path,action='append',required=True)
    parser.add_argument('--manifest',type=Path,action='append',required=True)
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--go-provenance',type=Path,required=True)
    args=parser.parse_args()
    if len(args.profile)!=len(args.manifest):raise SystemExit('Each profile requires its captured source manifest.')
    import importlib.util
    proof_spec=importlib.util.spec_from_file_location('go_proof',Path(__file__).with_name('go-coverage-provenance.py'))
    proof=importlib.util.module_from_spec(proof_spec);proof_spec.loader.exec_module(proof)
    profiles=[(p.read_text(),json.loads(m.read_text())) for p,m in zip(args.profile,args.manifest)]
    inventory=proof.validate(args.go_provenance,profiles[-1][1])
    result=merge(profiles,inventory)
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(result)
