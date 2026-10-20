"""A latest failed/unfinished run must invalidate older same-app unit totals."""
import copy
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from unittest.mock import patch
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('frontend_unit_run', ROOT / 'scripts/frontend-unit-run-provenance.py')
MODULE = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(MODULE)


def initialize(root):
    for name, body in {
        '.node-version': '24.21.0\n', 'frontend/package.json': '{"scripts":{"test":"vitest run"}}',
        'frontend/package-lock.json': '{"lockfileVersion":3}',
        'frontend/vitest.config.ts': "include: ['src/**/*.spec.ts', 'tooling/**/*.spec.ts']",
        'frontend/tsconfig.spec.json': '{"compilerOptions":{"strict":true}}',
        'frontend/src/app/unit.ts': 'export const unexecuted = false;\n',
        'frontend/src/app/unit.spec.ts': 'unit test body',
    }.items():
        file = root / name
        file.parent.mkdir(parents=True, exist_ok=True)
        if not file.exists():
            file.write_text(body)


def artifacts(root, directory):
    specs = MODULE.unit_specs(MODULE.current_inputs(root))
    result = {'success': True, 'numFailedTests': 0, 'numPendingTests': 0, 'numTodoTests': 0,
              'numFailedTestSuites': 0, 'numPendingTestSuites': 0,
              'numTotalTestSuites': len(specs), 'numPassedTestSuites': len(specs),
              'numTotalTests': len(specs), 'numPassedTests': len(specs), 'snapshot': {'failure': False},
              'testResults': [{'name': str(root / name), 'status': 'passed',
                               'assertionResults': [{'status': 'passed', 'title': 'actual assertion'}]} for name in specs]}
    for name in MODULE.ARTIFACTS:
        (directory / name).write_text(json.dumps(result if name == 'vitest-results.json' else {'bound': name}))
    return result


def successful_run(root, directory):
    initialize(root)
    run_id = MODULE.start(root, directory)
    artifacts(root, directory)
    proof = MODULE.finish(root, directory, run_id)
    return proof


class FrontendUnitRunProof(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.directory = self.root / '.local/coverage/frontend-unit'
        initialize(self.root)

    def tearDown(self): self.temp.cleanup()
    def success(self): return successful_run(self.root, self.directory)

    def test_fresh_complete_success_binds_results_inputs_and_raw_artifacts(self):
        proof = self.success()
        self.assertEqual(proof['counts'], {'files': 1, 'passed': 1})
        self.assertEqual(set(proof['artifacts']), set(MODULE.ARTIFACTS))
        self.assertIn('frontend/src/app/unit.ts', proof['inputs'])
        self.assertIn('frontend/src/app/unit.spec.ts', proof['inputs'])
        self.assertIn('frontend/package-lock.json', proof['inputs'])
        self.assertEqual(MODULE.validate(self.root, self.directory), proof)
        private_copy = self.root / 'measurement/unit/provenance'
        shutil.copytree(self.directory, private_copy)
        self.assertEqual(MODULE.validate(self.root, private_copy), proof)

    def test_old_copied_success_rejects_new_failed_same_application_attempt(self):
        self.success()
        copied = self.root / 'measurement/unit'; shutil.copytree(self.directory, copied)
        previous_inputs = MODULE.current_inputs(self.root)
        run_id = MODULE.start(self.root, self.directory)
        MODULE.fail(self.root, self.directory, run_id)
        self.assertEqual(previous_inputs, MODULE.current_inputs(self.root))
        self.assertEqual(MODULE.read(MODULE.latest_path(self.root))['status'], 'failed')
        with self.assertRaisesRegex(ValueError, 'passed latest'): MODULE.validate(self.root, copied)

    def test_old_success_rejects_interrupted_latest_attempt_in_another_directory(self):
        self.success()
        copied = self.root / 'measurement/unit'; shutil.copytree(self.directory, copied)
        MODULE.start(self.root, self.root / 'other-private-unit-directory')
        with self.assertRaisesRegex(ValueError, 'passed latest'): MODULE.validate(self.root, copied)
        with self.assertRaisesRegex(ValueError, 'passed latest'): MODULE.validate(self.root, self.directory)

    def test_changed_tests_config_lock_installed_dependency_and_bootstrap_reject(self):
        installed = self.root / 'frontend/node_modules/vitest/package.json'
        installed.parent.mkdir(parents=True); installed.write_text('{"version":"pinned"}')
        main = self.root / 'frontend/src/main.ts'; main.write_text('bootstrap();')
        self.success()
        for name in ['frontend/src/app/unit.spec.ts', 'frontend/vitest.config.ts', 'frontend/tsconfig.spec.json',
                     'frontend/package-lock.json', 'frontend/node_modules/vitest/package.json', 'frontend/src/main.ts']:
            file = self.root / name; original = file.read_bytes(); file.write_bytes(original + b'\n')
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Current frontend unit'): MODULE.validate(self.root, self.directory)
            file.write_bytes(original)
        self.assertEqual(MODULE.validate(self.root, self.directory)['status'], 'passed')

    def test_changed_raw_profile_summary_manifest_or_result_bytes_reject(self):
        self.success()
        for name in MODULE.ARTIFACTS:
            file = self.directory / name; original = file.read_bytes(); file.write_bytes(original + b'\n')
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'artifact bytes'): MODULE.validate(self.root, self.directory)
            file.write_bytes(original)

    def test_new_or_deleted_unexecuted_unit_file_rejects_old_run(self):
        self.success()
        new = self.root / 'frontend/src/app/new.spec.ts'; new.write_text('new test')
        with self.assertRaisesRegex(ValueError, 'Current frontend unit'): MODULE.validate(self.root, self.directory)
        new.unlink(); (self.root / 'frontend/src/app/unit.spec.ts').unlink()
        with self.assertRaisesRegex(ValueError, 'Current frontend unit'): MODULE.validate(self.root, self.directory)

    def test_full_inventory_rejects_missing_duplicate_or_foreign_results(self):
        second = self.root / 'frontend/tooling/reporter.spec.ts'; second.parent.mkdir(); second.write_text('reporter test')
        run_id = MODULE.start(self.root, self.directory)
        original = artifacts(self.root, self.directory)
        variants = [original['testResults'][:1], original['testResults'] + original['testResults'][:1],
                    [{**original['testResults'][0], 'name': '/foreign/frontend/src/other.spec.ts'}, original['testResults'][1]]]
        for items in variants:
            result = {**original, 'testResults': items}
            (self.directory / 'vitest-results.json').write_text(json.dumps(result))
            with self.subTest(items=items), self.assertRaises(ValueError): MODULE.finish(self.root, self.directory, run_id)
        self.assertEqual(MODULE.read(MODULE.latest_path(self.root))['status'], 'running')

    def test_failed_skipped_todo_empty_and_inconsistent_counts_cannot_stamp_success(self):
        run_id = MODULE.start(self.root, self.directory); original = artifacts(self.root, self.directory)
        variants = []
        for change in ({'success': False}, {'numFailedTests': 1}, {'numPendingTests': 1}, {'numTodoTests': 1},
                       {'numFailedTestSuites': 1}, {'numPendingTestSuites': 1}, {'numPassedTests': 2},
                       {'numTotalTests': 2}, {'numPassedTestSuites': 2}, {'snapshot': {'failure': True}}):
            variants.append({**original, **change})
        for status in ('failed', 'pending', 'todo', 'skipped'):
            changed = copy.deepcopy(original); changed['testResults'][0]['assertionResults'][0]['status'] = status; variants.append(changed)
        changed = copy.deepcopy(original); changed['testResults'][0]['assertionResults'] = []; variants.append(changed)
        for result in variants:
            (self.directory / 'vitest-results.json').write_text(json.dumps(result))
            with self.subTest(result=result), self.assertRaises(ValueError): MODULE.finish(self.root, self.directory, run_id)
        self.assertFalse((self.directory / 'unit-run-provenance.json').exists())

    def test_source_mutation_during_run_never_publishes_passed_proof(self):
        run_id = MODULE.start(self.root, self.directory); artifacts(self.root, self.directory)
        (self.root / 'frontend/src/app/unit.ts').write_text('different implementation')
        with self.assertRaisesRegex(ValueError, 'changed during execution'): MODULE.finish(self.root, self.directory, run_id)
        self.assertEqual(MODULE.read(MODULE.latest_path(self.root))['status'], 'running')

    def test_superseded_attempt_cannot_publish_or_fail_another_run(self):
        first = MODULE.start(self.root, self.directory); artifacts(self.root, self.directory)
        other = self.root / 'other'; latest = MODULE.start(self.root, other)
        with self.assertRaisesRegex(ValueError, 'latest running'): MODULE.finish(self.root, self.directory, first)
        with self.assertRaisesRegex(ValueError, 'different unit attempt'): MODULE.fail(self.root, self.directory, first)
        self.assertEqual(MODULE.read(MODULE.latest_path(self.root))['runId'], latest)

    def test_concurrent_start_cannot_overwrite_a_newer_attempt_with_an_older_snapshot(self):
        entered, release, second_requested = Event(), Event(), Event()
        original = MODULE.current_inputs
        calls = 0
        def inputs(root):
            nonlocal calls
            calls += 1
            if calls == 1:
                entered.set()
                if not release.wait(2): raise AssertionError('first discovery was never released')
            return original(root)
        other = self.root / 'second-directory'
        def second():
            second_requested.set()
            return MODULE.start(self.root, other)
        with patch.object(MODULE, 'current_inputs', inputs), ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(MODULE.start, self.root, self.directory)
            self.assertTrue(entered.wait(2))
            later = pool.submit(second)
            self.assertTrue(second_requested.wait(2))
            release.set()
            first_id, later_id = first.result(2), later.result(2)
        head = MODULE.read(MODULE.latest_path(self.root))
        self.assertEqual(head['runId'], later_id)
        self.assertEqual(head['directory'], str(other))
        with self.assertRaisesRegex(ValueError, 'latest running'): MODULE.finish(self.root, self.directory, first_id)

    def test_converter_rejects_an_unbound_raw_argument_before_browser_processing(self):
        dependency = ROOT / 'frontend/node_modules/vitest/package.json'
        if not dependency.exists() or not shutil.which('node'):
            self.skipTest('The Node/Vitest integration check requires installed frontend dependencies.')
        (self.root / 'frontend/node_modules').symlink_to((ROOT / 'frontend/node_modules').resolve(), target_is_directory=True)
        self.success()
        alias = self.directory / 'unbound.json'; alias.write_text('{}')
        result = subprocess.run(['node', str(ROOT / 'scripts/report-browser-code-coverage.mjs'),
                                 str(self.root / 'absent-browser-input'), str(self.root / 'report'), str(alias)],
                                cwd=self.root, capture_output=True, text=True, timeout=15)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('supplied unit coverage differs from the passed run raw profile', result.stderr)
        self.assertFalse((self.root / 'report/measurement.json').exists())

    def test_missing_proof_unbound_attempt_and_proof_tampering_fail_closed(self):
        with self.assertRaises(ValueError): MODULE.validate(self.root, self.directory)
        self.success()
        file = self.directory / 'unit-run-provenance.json'; original = file.read_text(); file.write_text(original + '\n')
        with self.assertRaisesRegex(ValueError, 'passed latest'): MODULE.validate(self.root, self.directory)
        file.write_text(original)
        (self.directory / 'unit-attempt.json').unlink()
        with self.assertRaises(ValueError): MODULE.validate(self.root, self.directory)

    def test_failed_input_discovery_still_invalidates_previous_good_proof(self):
        self.success()
        copied = self.root / 'measurement/unit'; shutil.copytree(self.directory, copied)
        (self.root / 'frontend/vitest.config.ts').unlink()
        with self.assertRaisesRegex(ValueError, 'required frontend unit input'): MODULE.start(self.root, self.directory)
        self.assertEqual(MODULE.read(MODULE.latest_path(self.root))['status'], 'running')
        with self.assertRaisesRegex(ValueError, 'passed latest'): MODULE.validate(self.root, copied)


if __name__ == '__main__': unittest.main()
