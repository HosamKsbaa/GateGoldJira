#!/usr/bin/env python3
"""Combine a complete, disjoint Playwright shard set on identical frozen sources.

The inventory is a real unsharded `playwright test --list` UseCaseReporter report.
Raw browser counters are retained for the existing exact-source converter; Go
blocks are merged by the existing exact-map merger, never by adding percentages.
"""
import argparse
import copy
import hashlib
import importlib.util
import json
import errno
import os
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
HEX = set('0123456789abcdef')


def digest(value):
    return hashlib.sha256(value).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode()


def retain_counter(source, destination):
    """Completed counter files are immutable; share their bytes on one volume."""
    try:
        os.link(source, destination, follow_symlinks=False)
    except OSError as error:
        if error.errno not in [errno.EXDEV, errno.EPERM, errno.EOPNOTSUPP]:
            raise
        shutil.copyfile(source, destination)
    destination.chmod(0o600)


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(value):
    return isinstance(value, str) and len(value) == 64 and set(value) <= HEX


def case_hash(case):
    # UseCaseReporter validates these four fields with Zod first; its passthrough
    # output emits declared keys before the retained authored fields.
    leading = ['id', 'area', 'implementation', 'surfaces']
    projected = {key: case[key] for key in leading}
    projected.update({key: value for key, value in case.items() if key not in leading})
    return digest(canonical(projected))


def test_location(test):
    name = test.get('file')
    require(isinstance(name, str), 'Selected tests require a relative file.')
    path = Path(name)
    require(not path.is_absolute() and '..' not in path.parts and name.startswith('e2e/'),
            'Selected tests must belong to captured e2e sources.')
    require(type(test.get('line')) is int and test['line'] > 0 and
            type(test.get('column')) is int and test['column'] > 0 and
            type(test.get('repeatEachIndex')) is int and test['repeatEachIndex'] >= 0 and
            sha(test.get('titlePathSha256')), 'Selected test locations must be canonical.')
    expected = digest(canonical([name, test['line'], test['column'], test['repeatEachIndex'], test['titlePathSha256']]))
    require(test.get('identity') == expected, 'Canonical selected test identity differs.')
    require(isinstance(test.get('testId'), str) and test['testId'], 'Missing actual Playwright test ID.')
    return name


def selection(report, listing=False):
    execution = report.get('execution')
    require(isinstance(execution, dict) and execution.get('listing') is listing,
            'A real reporter execution/listing declaration is required.')
    require(execution.get('fullSelection') is True,
            'Full-suite merging requires unfiltered test discovery with forbidOnly enabled (CI=1).')
    require(sha(execution.get('selectionFiltersSha256')), 'Missing effective selection-filter hash.')
    tests = execution.get('selectedTests')
    require(isinstance(tests, list) and tests, 'Empty selected shards cannot establish completion.')
    by_identity, by_id = {}, {}
    for test in tests:
        test_location(test)
        require(test['identity'] not in by_identity and test['testId'] not in by_id,
                'Duplicate selected tests in one report.')
        by_identity[test['identity']] = test
        by_id[test['testId']] = test
    attempts = execution.get('attempts')
    require(isinstance(attempts, list), 'Missing actual test attempts.')
    require(not listing or not attempts, 'An inventory cannot contain executed test attempts.')
    observed = {}
    for attempt in attempts:
        test = by_id.get(attempt.get('testId'))
        require(test and attempt.get('identity') == test['identity'], 'An attempt was not selected.')
        retry = attempt.get('retry')
        require(type(retry) is int and retry >= 0 and attempt.get('status') in
                ['passed', 'failed', 'timedOut', 'skipped', 'interrupted'] and
                attempt.get('expectedStatus') in ['passed', 'failed', 'skipped'],
                'Invalid actual test attempt status.')
        key = (test['testId'], retry)
        require(key not in observed, 'Duplicate test attempt.')
        observed[key] = attempt
    if not listing:
        for test in tests:
            retries = sorted(retry for test_id, retry in observed if test_id == test['testId'])
            require(retries and retries == list(range(len(retries))), 'Selected tests did not finish all attempts.')
    return execution, by_identity, by_id, observed


def case_status(evidence):
    for status in ['failed', 'flaky', 'assertion_missing']:
        if any(item['result'] == status for item in evidence):
            return status
    return 'passed' if evidence else 'not_run'


def validate_report(report, manifest_bytes, catalog_bytes, root, source, publisher):
    require(report.get('version') == 2, 'Only version-2 exact-source reports can be merged.')
    require(report.get('suiteStatus') in ['passed', 'failed', 'timedout', 'interrupted'],
            'The browser report did not finish.')
    require(report.get('catalogSha256') == digest(catalog_bytes), 'Current catalog hashes differ.')
    manifest = json.loads(manifest_bytes)
    require(isinstance(manifest, dict) and manifest, 'A complete captured source manifest is required.')
    require(report.get('sourceManifestSha256') == digest(canonical(sorted(manifest.items()))),
            'Recorded source manifest hash differs.')
    for name, expected in manifest.items():
        path = Path(name)
        require(isinstance(name, str) and not path.is_absolute() and '..' not in path.parts and sha(expected),
                'Unsafe captured source manifest entry.')
        actual = source / path
        require(actual.is_file() and digest(actual.read_bytes()) == expected, 'Captured source bytes differ: ' + name)
    require((source / 'docs/use-cases/catalog.json').read_bytes() == catalog_bytes,
            'The captured catalog bytes differ from the current catalog.')
    capture = load_module('current_shard_capture', root / 'scripts/capture-test-source.py')
    current_manifest = {str(path): digest((root / path).read_bytes()) for path in capture.source_files(root)}
    require(manifest == current_manifest,
            'The complete current source/test/config inventory differs from the frozen capture.')
    require(report.get('applicationSha256') == publisher.application_hash(root),
            'Application sources changed after execution.')
    publisher.validate_test_sources(report, manifest, root)
    catalog = json.loads(catalog_bytes)
    cases = report.get('cases')
    require(isinstance(cases, list), 'A complete case inventory is required.')
    by_id = {case['id']: case for case in cases}
    require(len(by_id) == len(cases) and set(by_id) == {case['id'] for case in catalog['cases']},
            'Each report must contain exactly the same full current case inventory.')
    for case in catalog['cases']:
        row = by_id[case['id']]
        require(row.get('caseSha256') == case_hash(case) and all(row.get(key) == case[key]
                for key in ['area', 'implementation', 'surfaces']), 'Case source/classification hashes differ.')
        evidence = row.get('evidence')
        require(isinstance(evidence, list) and row.get('status') == case_status(evidence),
                'Case statuses must preserve every actual evidence outcome.')
        for item in evidence:
            require(item.get('result') in ['passed', 'failed', 'flaky', 'assertion_missing'] and
                    type(item.get('assertions')) is int and item['assertions'] >= 0 and
                    item.get('surface') in [*case['surfaces'], 'unspecified'], 'Invalid case evidence.')
            if item['result'] == 'passed':
                require(item['assertions'] > 0 and item.get('retry') == 0,
                        'A passing claim needs first-attempt assertions.')
            if item['result'] == 'assertion_missing':
                require(item['assertions'] == 0, 'Assertion-missing status was altered.')
    return manifest, by_id


def merge_reports(reports, inventory, catalog):
    """Strict pure merger; file/source provenance is checked by merge_runs first."""
    require(inventory.get('suiteStatus') == 'passed' and inventory.get('invalidEvidence') is False,
            'The full unsharded inventory must complete without discovery errors or invalid evidence.')
    inventory_exec, expected, _, _ = selection(inventory, listing=True)
    require(inventory_exec.get('shard') is None, 'The full inventory must be unsharded.')
    declarations, seen, all_attempts, selected = set(), set(), [], []
    merged = copy.deepcopy(reports[0])
    template = {case['id']: case for case in catalog['cases']}
    merged_cases = {}
    suite_failed = False
    details = []
    for report in reports:
        execution, identities, actual_ids, attempts = selection(report)
        declaration = execution.get('shard')
        require(isinstance(declaration, dict) and type(declaration.get('current')) is int and
                type(declaration.get('total')) is int and declaration['total'] > 1 and
                1 <= declaration['current'] <= declaration['total'], 'An explicit valid shard declaration is required.')
        shard = (declaration['current'], declaration['total'])
        require(shard not in declarations, 'A shard declaration was supplied twice.')
        declarations.add(shard)
        require(execution['selectionFiltersSha256'] == inventory_exec['selectionFiltersSha256'],
                'Effective grep/project/file selections differ.')
        require(not seen.intersection(identities), 'Actual selected tests overlap across shards.')
        require(set(identities) <= set(expected), 'A shard selected a test outside the full inventory.')
        for identity, test in identities.items():
            require(all(test[key] == expected[identity][key] for key in
                    ['file', 'line', 'column', 'repeatEachIndex', 'titlePathSha256']), 'Selected test identity/location differs.')
            selected.append({**test, 'testId': identity, 'originalTestId': test['testId'], 'shard': shard[0]})
        seen.update(identities)
        for attempt in attempts.values():
            all_attempts.append({**attempt, 'testId': attempt['identity'], 'originalTestId': attempt['testId'], 'shard': shard[0]})
            if (attempt['status'] not in ['passed', 'skipped'] or attempt['retry'] > 0 or
                    (attempt['status'] == 'passed' and attempt['expectedStatus'] != 'passed')):
                suite_failed = True
        suite_failed |= report['suiteStatus'] != 'passed' or report.get('invalidEvidence') is not False
        details.extend(report.get('invalidEvidenceDetails', []))
        for row in report['cases']:
            require(row['id'] in template, 'Unknown merged case.')
            target = merged_cases.setdefault(row['id'], {**copy.deepcopy(row), 'evidence': []})
            for item in row['evidence']:
                test = actual_ids.get(item['testId'])
                require(test and item.get('file') == test['file'] and item.get('line') == test['line'],
                        'Evidence names a test outside its actual selected shard.')
                attempt = attempts.get((item['testId'], item['retry']))
                require(attempt, 'Case evidence has no actual selected test attempt.')
                if item['result'] in ['passed', 'flaky', 'assertion_missing']:
                    require(attempt['status'] == 'passed' and attempt['expectedStatus'] == 'passed',
                            'A nonpassing test attempt cannot establish passing evidence.')
                target['evidence'].append({**copy.deepcopy(item), 'testId': test['identity'],
                                          'originalTestId': item['testId'], 'shard': shard[0]})
    totals = {total for _, total in declarations}
    require(len(totals) == 1, 'Declared shard totals differ.')
    total = totals.pop()
    require(declarations == {(number, total) for number in range(1, total + 1)},
            'Every shard 1..N must finish exactly once.')
    require(seen == set(expected), 'The exact full selected test inventory is incomplete.')
    require(set(merged_cases) == set(template), 'Merged case inventory differs.')
    for row in merged_cases.values():
        row['status'] = case_status(row['evidence'])
        row['verifiedSurfaces'] = sorted({item['surface'] for item in row['evidence']
                                         if item['result'] == 'passed' and item['surface'] != 'unspecified'})
        suite_failed |= row['status'] in ['failed', 'flaky', 'assertion_missing']
    cases = [merged_cases[case['id']] for case in catalog['cases']]
    eligible = [row for row in cases if row['implementation'] not in ['external_pending', 'unclear']]
    verified = sum(row['status'] == 'passed' for row in eligible)
    merged.update(suiteStatus='failed' if suite_failed else 'passed', cases=cases,
                  invalidEvidence=any(report['invalidEvidence'] for report in reports), invalidEvidenceDetails=details,
                  total=len(cases), eligible=len(eligible), verified=verified,
                  percent=100 * verified / len(eligible) if eligible else 0,
                  unresolved=[row['id'] for row in cases if row['implementation'] in ['external_pending', 'unclear']],
                  execution={'shard': None, 'listing': False, 'fullSelection': True, 'mergedShards': total,
                             'selectionFiltersSha256': inventory_exec['selectionFiltersSha256'],
                             'selectedTests': sorted(selected, key=lambda test: test['identity']),
                             'attempts': all_attempts})
    return merged


def merge_runs(inputs, inventory_path, output, root=ROOT):
    require(not output.exists(), 'Choose a new private combined-run directory.')
    require(len(inputs) > 1, 'Supply every shard, never one partial run.')
    publisher = load_module('browser_publish', root / 'scripts/report-test-coverage.py')
    go_merger = load_module('go_merge', root / 'scripts/merge-go-coverage.py')
    catalog_bytes = (root / 'docs/use-cases/catalog.json').read_bytes()
    reports, manifests, profiles, runs = [], [], [], []
    manifest_bytes = None
    for index_path in inputs:
        index = json.loads(index_path.read_text())
        require(index.get('status') in ['passed', 'failed'], 'A shard run index has not finished.')
        run = Path(index['runDirectory']).resolve()
        require(run not in runs, 'The same physical shard run was supplied twice.')
        source = run / 'source'
        raw = (source / 'source-manifest.json').read_bytes()
        require(manifest_bytes is None or raw == manifest_bytes, 'Captured manifest bytes differ across shards.')
        manifest_bytes = raw
        report = json.loads((run / 'use-case-results.json').read_text())
        manifest, _ = validate_report(report, raw, catalog_bytes, root, source, publisher)
        if index['status'] != 'passed':
            report['suiteStatus'] = 'failed'
        execution, identities, _, _ = selection(report)
        for test in identities.values():
            name = 'frontend/' + test_location(test)
            require(manifest.get(name) == digest((root / name).read_bytes()),
                    'A selected browser test changed after execution.')
        require((run / 'js-coverage').is_dir(), 'Every measured shard requires its raw browser coverage directory.')
        profiles.append(((run / 'go-statements.out').read_text(), manifest))
        manifests.append(manifest)
        reports.append(report)
        runs.append(run)
    inventory = json.loads(inventory_path.read_text())
    require(all(inventory.get(key) == reports[0].get(key) for key in
                ['version', 'catalogSha256', 'sourceManifestSha256', 'applicationSha256']),
            'The full selected inventory must use the exact same captured sources.')
    merged = merge_reports(reports, inventory, json.loads(catalog_bytes))
    profile = go_merger.merge(profiles)
    output.mkdir(parents=True, mode=0o700)
    (output / 'source').symlink_to(runs[0] / 'source', target_is_directory=True)
    (output / 'js-coverage').mkdir(mode=0o700)
    for number, run in enumerate(runs, 1):
        for path in sorted((run / 'js-coverage').iterdir()):
            require(path.is_file() and not path.is_symlink() and path.name.endswith('.json.gz'),
                    'Raw browser coverage must be regular compressed counter files.')
            destination = output / 'js-coverage' / ('shard-' + str(number) + '-' + path.name)
            retain_counter(path, destination)
    (output / 'go-statements.out').write_text(profile)
    (output / 'use-case-results.json').write_text(json.dumps(merged, ensure_ascii=False, indent=2) + '\n')
    (output / 'shards.json').write_text(json.dumps({'version': 1, 'inventorySha256': digest(inventory_path.read_bytes()),
        'sourceManifestFileSha256': digest(manifest_bytes), 'inputs': [str(path.resolve()) for path in inputs],
        'selectedTests': len(merged['execution']['selectedTests']), 'status': merged['suiteStatus']}, indent=2) + '\n')
    return merged


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--shard-index', action='append', type=Path, required=True)
    parser.add_argument('--inventory', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--index-output', type=Path, required=True)
    args = parser.parse_args()
    report = merge_runs(args.shard_index, args.inventory, args.output.resolve())
    # The existing finalizer also expects a source-matched Go function summary.
    import subprocess
    with (args.output / 'go-statements.txt').open('w') as target:
        subprocess.run(['go', 'tool', 'cover', '-func=' + str((args.output / 'go-statements.out').resolve())],
                       cwd=args.output / 'source/backend', stdout=target, check=True)
    args.index_output.parent.mkdir(parents=True, exist_ok=True)
    args.index_output.write_text(json.dumps({'runDirectory': str(args.output.resolve()), 'status': report['suiteStatus']}) + '\n')
    print(json.dumps({'status': report['suiteStatus'], 'shards': report['execution']['mergedShards'],
                      'selectedTests': len(report['execution']['selectedTests']), 'verifiedCases': report['verified']}))
    return 0 if report['suiteStatus'] == 'passed' else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, KeyError, TypeError, FileNotFoundError) as error:
        raise SystemExit(str(error)) from None
