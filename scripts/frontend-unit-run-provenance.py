#!/usr/bin/env python3
"""Bind a successful complete Vitest run to its current inputs and raw counters.

The root-local latest-attempt index intentionally invalidates older successful
measurements as soon as another unit run starts, even when application bytes do
not change. Raw results and absolute runner paths stay in private artifacts.
"""
import argparse
import fcntl
from functools import wraps
import hashlib
import json
from pathlib import Path
import os
import uuid

KIND = 'passed_full_frontend_unit_run'
ARTIFACTS = ('coverage-final.json', 'coverage-summary.json', 'source-manifest.json', 'vitest-results.json')
REQUIRED = ('.node-version', 'frontend/package.json', 'frontend/package-lock.json', 'frontend/vitest.config.ts')


def digest(data):
    return hashlib.sha256(data).hexdigest()


def atomic(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    temporary.write_text(json.dumps(data, sort_keys=True, indent=2) + '\n')
    os.replace(temporary, path)


def read(path):
    if not path.is_file() or path.is_symlink():
        raise ValueError('A required private unit-run artifact is absent or linked.')
    return json.loads(path.read_text())


def latest_path(root):
    return root / '.local/coverage/frontend-unit-run.json'


def current_inputs(root):
    paths = set(REQUIRED)
    for pattern in ('frontend/src/**/*', 'frontend/tooling/**/*', 'frontend/e2e/support/**/*.ts',
                    'frontend/tsconfig*.json', 'scripts/*.py', 'scripts/*.sh', 'scripts/*.mjs',
                    'scripts/lib/*.mjs', 'docs/use-cases/*.json'):
        paths.update(file.relative_to(root).as_posix() for file in root.glob(pattern)
                     if file.is_file() and (file.suffix in ('.ts', '.js', '.mjs', '.json', '.html', '.css', '.scss', '.py', '.sh')))
    # The lock binds declared dependencies; installed metadata also binds the
    # actual Vitest/V8/compiler/reporting package versions when present.
    for name in ('.package-lock.json', 'vitest/package.json', '@vitest/coverage-v8/package.json',
                 'typescript/package.json', '@angular/compiler/package.json', '@angular/core/package.json',
                 'istanbul-lib-coverage/package.json'):
        file = root / 'frontend/node_modules' / name
        if file.is_file():
            paths.add(file.relative_to(root).as_posix())
    result = {}
    for name in sorted(paths):
        file = root / name
        # A shared node_modules directory is normal in immutable source captures;
        # application/test/config input files themselves must be regular files.
        if not file.is_file() or file.is_symlink():
            raise ValueError('A required frontend unit input is absent or linked: ' + name)
        result[name] = digest(file.read_bytes())
    if not any(name.startswith('frontend/src/') and name.endswith('.ts') for name in result):
        raise ValueError('The complete frontend unit source inventory is empty.')
    if not any(name.startswith('frontend/tsconfig') for name in result):
        raise ValueError('Frontend unit TypeScript configuration is missing.')
    return result


def unit_specs(inputs):
    return sorted(name for name in inputs if name.endswith('.spec.ts')
                  and name.startswith(('frontend/src/', 'frontend/tooling/')))


def result_counts(result, root, expected):
    if (result.get('success') is not True or not expected
            or result.get('numFailedTests') != 0 or result.get('numPendingTests') != 0
            or result.get('numTodoTests') != 0 or result.get('numFailedTestSuites') != 0
            or result.get('numPendingTestSuites') != 0
            or result.get('numTotalTestSuites', 0) <= 0
            or result.get('numTotalTestSuites') != result.get('numPassedTestSuites')
            or result.get('snapshot', {}).get('failure') is True):
        raise ValueError('Only an entirely passed, nonempty full Vitest run can verify unit coverage.')
    actual, assertions = [], 0
    for suite in result.get('testResults', []):
        name = Path(suite.get('name', ''))
        try:
            relative = name.relative_to(root).as_posix() if name.is_absolute() else name.as_posix()
        except ValueError as error:
            raise ValueError('A Vitest result is outside the captured unit source.') from error
        items = suite.get('assertionResults', [])
        if suite.get('status') != 'passed' or not items or any(item.get('status') != 'passed' for item in items):
            raise ValueError('A unit file has failed, skipped, unfinished, or empty results.')
        actual.append(relative)
        assertions += len(items)
    if sorted(actual) != expected or len(actual) != len(set(actual)):
        raise ValueError('Vitest results must contain every current unit spec exactly once.')
    if (assertions <= 0 or result.get('numTotalTests') != assertions
            or result.get('numPassedTests') != assertions):
        raise ValueError('Vitest success counters do not match actual passed assertions.')
    return {'files': len(actual), 'passed': assertions}


def serialized(action):
    """Do not let concurrent starts/finishes overwrite another attempt's state."""
    @wraps(action)
    def run(root, *args):
        root = root.resolve()
        lock = latest_path(root).with_suffix('.lock')
        lock.parent.mkdir(parents=True, exist_ok=True)
        with lock.open('a') as handle:
            fcntl.flock(handle, fcntl.LOCK_EX)
            return action(root, *args)
    return run


@serialized
def start(root, directory):
    root, directory = root.resolve(), directory.resolve()
    run_id = uuid.uuid4().hex
    # Publish running first: failed source discovery must invalidate old proof too.
    state = {'version': 1, 'runId': run_id, 'status': 'running', 'directory': str(directory), 'root': str(root)}
    atomic(latest_path(root), state)
    directory.mkdir(parents=True, exist_ok=True)
    atomic(directory / 'unit-attempt.json', state)
    for name in ('unit-run-provenance.json', 'vitest-results.json'):
        (directory / name).unlink(missing_ok=True)
    state['inputs'] = current_inputs(root)
    state['specs'] = unit_specs(state['inputs'])
    if not state['specs']:
        raise ValueError('No current frontend unit specs were discovered.')
    atomic(directory / 'unit-attempt.json', state)
    atomic(latest_path(root), state)
    return run_id


@serialized
def fail(root, directory, run_id):
    head = read(latest_path(root))
    if head.get('runId') != run_id:
        raise ValueError('A different unit attempt owns the latest-run index.')
    # Vitest clears its reports directory at startup. The root-local index owns
    # the running snapshot; the directory copy is restored on completion/failure.
    atomic(directory / 'unit-attempt.json', {**head, 'status': 'failed'})
    atomic(latest_path(root), {**head, 'status': 'failed'})


@serialized
def finish(root, directory, run_id):
    root, directory = root.resolve(), directory.resolve()
    head = read(latest_path(root))
    state = head
    if head.get('runId') != run_id or head.get('status') != 'running':
        raise ValueError('Only the latest running unit attempt can publish success.')
    if state.get('directory') != str(directory) or head.get('directory') != str(directory):
        raise ValueError('The unit attempt does not own this coverage directory.')
    if state.get('inputs') != current_inputs(root) or state.get('specs') != unit_specs(state['inputs']):
        raise ValueError('Frontend unit source, tests, configuration, or dependencies changed during execution.')
    counts = result_counts(read(directory / 'vitest-results.json'), root, state['specs'])
    hashes = {name: digest((directory / name).read_bytes()) for name in ARTIFACTS}
    proof = {'version': 1, 'kind': KIND, 'status': 'passed', 'runId': run_id,
             'inputs': state['inputs'], 'specs': state['specs'], 'counts': counts, 'artifacts': hashes}
    atomic(directory / 'unit-run-provenance.json', proof)
    proof_sha = digest((directory / 'unit-run-provenance.json').read_bytes())
    # Commit last. An interruption between these writes remains fail-closed.
    atomic(directory / 'unit-attempt.json', {**state, 'status': 'passed', 'proofSha256': proof_sha})
    atomic(latest_path(root), {**head, 'status': 'passed', 'proofSha256': proof_sha, 'counts': counts})
    return validate(root, directory)


def validate(root, directory):
    root, directory = root.resolve(), directory.resolve()
    proof = read(directory / 'unit-run-provenance.json')
    head, attempt = read(latest_path(root)), read(directory / 'unit-attempt.json')
    proof_sha = digest((directory / 'unit-run-provenance.json').read_bytes())
    if (proof.get('version') != 1 or proof.get('kind') != KIND or proof.get('status') != 'passed'
            or not proof.get('runId') or any(value.get('status') != 'passed'
            or value.get('runId') != proof['runId'] or value.get('proofSha256') != proof_sha for value in (head, attempt))):
        raise ValueError('A passed latest full frontend unit attempt with bound proof is required.')
    if (proof.get('inputs') != current_inputs(root) or proof.get('specs') != unit_specs(proof['inputs'])
            or attempt.get('inputs') != proof['inputs'] or attempt.get('specs') != proof['specs']):
        raise ValueError('Current frontend unit source, tests, configuration, or dependencies differ from the passed run.')
    if set(proof.get('artifacts', {})) != set(ARTIFACTS):
        raise ValueError('The passed unit run must bind all raw coverage and result artifacts.')
    for name in ARTIFACTS:
        file = directory / name
        if not file.is_file() or file.is_symlink() or digest(file.read_bytes()) != proof['artifacts'][name]:
            raise ValueError('Frontend unit coverage or result artifact bytes differ from the passed run.')
    # Private results retain the actual producing root; copied measurement
    # artifacts are checked against its exact canonical relative spec inventory.
    if attempt.get('directory') != head.get('directory') or not Path(attempt.get('root', '')).is_absolute():
        raise ValueError('The private unit attempt has inconsistent producing identity.')
    counts = result_counts(read(directory / 'vitest-results.json'), Path(attempt['root']), proof['specs'])
    if proof.get('counts') != counts or head.get('counts') != counts:
        raise ValueError('Passed unit assertion counts differ from their bound result.')
    return proof


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('start', 'finish', 'fail', 'validate'))
    parser.add_argument('--root', required=True, type=Path)
    parser.add_argument('--directory', required=True, type=Path)
    parser.add_argument('--run-id')
    args = parser.parse_args()
    if args.action == 'start':
        print(start(args.root, args.directory))
    elif args.action == 'validate':
        print(json.dumps(validate(args.root, args.directory), sort_keys=True))
    elif args.action == 'finish':
        finish(args.root, args.directory, args.run_id)
    else:
        fail(args.root, args.directory, args.run_id)


if __name__ == '__main__':
    main()
