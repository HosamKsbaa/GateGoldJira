#!/usr/bin/env python3
"""Bind full Go counters to an independently executed complete block inventory."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location('normalized_go_profile', ROOT / 'scripts/merge-go-coverage.py')
_parser = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_parser)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def block_map(profile):
    mode, rows = _parser.read_profile(profile)
    if mode != 'mode: atomic' or not rows:
        raise ValueError('Full Go coverage requires nonempty atomic instrumentation.')
    return {location: size for location, (size, _) in rows.items()}


def require_complete(profile, inventory):
    expected = block_map(inventory)
    if block_map(profile) != expected:
        raise ValueError('Go profile differs from the authoritative full block/statement inventory.')
    return expected


def json_stream(text):
    decoder, result, offset = json.JSONDecoder(), [], 0
    while offset < len(text):
        if text[offset].isspace():
            offset += 1
            continue
        item, offset = decoder.raw_decode(text, offset)
        result.append(item)
    return result


def backend_sources(source):
    manifest = json.loads((source / 'source-manifest.json').read_text())
    backend = {name: value for name, value in manifest.items() if name.startswith('backend/')}
    if not backend:
        raise ValueError('The captured backend source manifest is empty.')
    for name, value in backend.items():
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts or digest((source / name).read_bytes()) != value:
            raise ValueError('Captured backend sources differ from their manifest.')
    return backend


def packages(source):
    backend = (source / 'backend').resolve()
    result = subprocess.run(['go', 'list', '-mod=readonly', '-json', './...'], cwd=backend, check=True, capture_output=True, text=True)
    records = []
    for package in json_stream(result.stdout):
        name = package['ImportPath']
        if not name.startswith('gategoldjira/backend') or package.get('Error'):
            raise ValueError('The full Go package inventory contains an invalid package.')
        files = {}
        for filename in package.get('GoFiles', []) + package.get('CgoFiles', []):
            file = (Path(package['Dir']) / filename).resolve()
            relative = file.relative_to(backend)
            files[str(relative)] = digest(file.read_bytes())
        records.append({'importPath': name, 'name': package['Name'], 'files': files})
    if not records or len({row['importPath'] for row in records}) != len(records):
        raise ValueError('A complete, distinct Go package inventory is required.')
    return sorted(records, key=lambda row: row['importPath'])


def validate_inventory_events(log, inventory):
    expected = {row['importPath'] for row in inventory}
    if not expected or len(expected)!=len(inventory):
        raise ValueError('The authoritative Go inventory requires distinct complete packages.')
    finished = set()
    for event in json_stream(log):
        if event.get('Test') or event.get('Action') == 'fail':
            raise ValueError('The independent inventory must run no tests and finish every package.')
        if event.get('Action') in ['pass', 'skip']:
            name = event.get('Package')
            if name not in expected or name in finished:
                raise ValueError('The independent Go inventory has unexpected or repeated packages.')
            finished.add(name)
    if finished != expected:
        raise ValueError('The independent Go inventory did not finish the complete package set.')


def validate_full_log(log, inventory):
    if re.search(r'^(?:FAIL\b|--- FAIL:|panic:)', log, re.MULTILINE):
        raise ValueError('The retained full Go test run contains a failure.')
    finished = {match.group(1) for line in log.splitlines() if (match := re.match(r'^(?:ok\s+|\?\s+|[ \t]+)(gategoldjira/backend(?:/\S+)?)\s', line))}
    if finished != {row['importPath'] for row in inventory}:
        raise ValueError('The retained full Go run did not finish every inventoried package.')


def passed_run(run):
    result = json.loads((run / 'result.json').read_text())
    if result.get('status') != 'passed' or Path(result['runDirectory']).resolve() != run.resolve():
        raise ValueError('An actual successful full Go runner result is required.')


def create(run):
    run = run.resolve()
    passed_run(run)
    source = run / 'source'
    before = backend_sources(source)
    inventory_packages = packages(source)
    full = run / 'go-unit-statements.out'
    validate_full_log((run / 'tests.log').read_text(), inventory_packages)
    # The official coverage driver instruments all ./... packages, including
    # generated and test-support packages. No test selection contributes proof:
    # -run '^$' independently obtains the complete native block denominator.
    directory = Path(tempfile.mkdtemp(prefix='go-denominator-', dir=run))
    directory.chmod(0o700)
    inventory = directory / 'inventory.out'
    command = ['go', 'test', '-mod=readonly', '-count=1', '-race', '-p', '1', '-covermode=atomic', '-coverpkg=./...', '-run', '^$', '-coverprofile=' + str(inventory), '-json', './...', '-timeout=5m']
    with (directory / 'inventory-tests.jsonl').open('w') as output:
        subprocess.run(command, cwd=source / 'backend', stdout=output, stderr=subprocess.STDOUT, check=True)
    validate_inventory_events((directory / 'inventory-tests.jsonl').read_text(), inventory_packages)
    if backend_sources(source) != before or packages(source) != inventory_packages:
        raise ValueError('Go sources or actual package inputs changed during inventory capture.')
    shape = require_complete(full.read_text(), inventory.read_text())
    (directory / 'packages.json').write_bytes(encoded(inventory_packages))
    paths = {'profile': 'go-unit-statements.out', 'fullTestLog': 'tests.log', 'inventory': str(inventory.relative_to(run)), 'inventoryLog': str((directory / 'inventory-tests.jsonl').relative_to(run)), 'packages': str((directory / 'packages.json').relative_to(run))}
    proof = {'version': 1, 'kind': 'official_full_go_denominator', 'backendSources': before,
             'goVersion': subprocess.run(['go', 'version'], check=True, capture_output=True, text=True).stdout.strip(),
             'packageCount': len(inventory_packages), 'blockCount': len(shape), 'statementCount': sum(shape.values()),
             'blockMapSha256': digest(encoded(shape)), 'files': {key: {'path': value, 'sha256': digest((run / value).read_bytes())} for key, value in paths.items()}}
    target = run / 'go-coverage-provenance.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_bytes(encoded(proof))
    temporary.chmod(0o600)
    temporary.replace(target)
    return target


def validate(provenance, current_manifest=None):
    provenance = provenance.resolve()
    run = provenance.parent
    passed_run(run)
    proof = json.loads(provenance.read_text())
    if proof.get('version') != 1 or proof.get('kind') != 'official_full_go_denominator':
        raise ValueError('Authoritative Go denominator provenance is required.')
    if backend_sources(run / 'source') != proof['backendSources']:
        raise ValueError('Go denominator provenance belongs to different captured sources.')
    if current_manifest is not None and {name: value for name, value in current_manifest.items() if name.startswith('backend/')} != proof['backendSources']:
        raise ValueError('Go coverage sources/tests differ from the current captured backend.')
    files = {}
    for key in ['profile', 'fullTestLog', 'inventory', 'inventoryLog', 'packages']:
        record = proof['files'][key]
        relative = Path(record['path'])
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Go provenance artifact paths must remain within their owned run.')
        path = run / relative
        if not path.is_file() or path.is_symlink() or digest(path.read_bytes()) != record['sha256']:
            raise ValueError('A bound Go coverage artifact changed or is missing: ' + key)
        files[key] = path
    inventory_packages = json.loads(files['packages'].read_text())
    if len(inventory_packages) != proof['packageCount'] or not inventory_packages:
        raise ValueError('The authoritative Go package inventory differs.')
    for package in inventory_packages:
        for name, value in package['files'].items():
            if proof['backendSources'].get('backend/' + name) != value:
                raise ValueError('The instrumented Go package file differs from its captured hash.')
    validate_inventory_events(files['inventoryLog'].read_text(), inventory_packages)
    validate_full_log(files['fullTestLog'].read_text(), inventory_packages)
    inventory = files['inventory'].read_text()
    shape = require_complete(files['profile'].read_text(), inventory)
    if (len(shape) != proof['blockCount'] or sum(shape.values()) != proof['statementCount'] or digest(encoded(shape)) != proof['blockMapSha256']):
        raise ValueError('The authoritative Go block denominator changed.')
    return inventory


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('create').add_argument('--run', type=Path, required=True)
    sub.add_parser('validate').add_argument('--provenance', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'create':
        print(create(args.run))
    else:
        shape = block_map(validate(args.provenance))
        print(json.dumps({'verified': True, 'blocks': len(shape), 'statements': sum(shape.values())}))
