"""A small all-covered fragment must never become the full Go denominator."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import subprocess

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('go_provenance', ROOT / 'scripts/go-coverage-provenance.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class CompleteNativeInventory(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.run = Path(self.temp.name)
        self.source = self.run / 'source'
        source = self.source / 'backend/app.go'
        source.parent.mkdir(parents=True)
        source.write_text('package app\nfunc Work() {}\n')
        self.backend = {'backend/app.go': MODULE.digest(source.read_bytes())}
        (self.source / 'source-manifest.json').write_text(json.dumps(self.backend))
        (self.run / 'result.json').write_text(json.dumps({'status': 'passed', 'runDirectory': str(self.run)}))
        self.full = 'mode: atomic\ngategoldjira/backend/app.go:1.1,2.1 2 1\ngategoldjira/backend/app.go:3.1,4.1 3 0\n'
        inventory = self.full.replace(' 2 1', ' 2 0')
        self.packages = [{'importPath': 'gategoldjira/backend', 'name': 'app', 'files': {'app.go': self.backend['backend/app.go']}}]
        data = {'profile': ('go-unit-statements.out', self.full),
                'fullTestLog': ('tests.log', 'ok\tgategoldjira/backend\t0.1s\n'),
                'inventory': ('denominator/inventory.out', inventory),
                'inventoryLog': ('denominator/inventory.jsonl', json.dumps({'Action': 'start', 'Package': 'gategoldjira/backend'}) + '\n' + json.dumps({'Action': 'pass', 'Package': 'gategoldjira/backend'}) + '\n'),
                'packages': ('denominator/packages.json', json.dumps(self.packages))}
        files = {}
        for key, (name, text) in data.items():
            path = self.run / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
            files[key] = {'path': name, 'sha256': MODULE.digest(path.read_bytes())}
        shape = MODULE.block_map(inventory)
        self.proof = {'version': 1, 'kind': 'official_full_go_denominator', 'backendSources': self.backend,
                      'packageCount': 1, 'blockCount': 2, 'statementCount': 5,
                      'blockMapSha256': MODULE.digest(MODULE.encoded(shape)), 'files': files}
        self.path = self.run / 'go-coverage-provenance.json'
        self.write_proof()

    def tearDown(self):
        self.temp.cleanup()

    def write_proof(self):
        self.path.write_text(json.dumps(self.proof))

    def test_full_native_profile_and_repeated_samples_validate_against_exact_inventory(self):
        inventory = MODULE.validate(self.path, self.backend)
        self.assertEqual(MODULE.require_complete(self.full + self.full.splitlines()[1] + '\n', inventory), MODULE.block_map(self.full))
        self.assertEqual(sum(MODULE.block_map(inventory).values()), 5)

    def test_omitted_block_file_changed_numstmt_and_counter_mode_are_rejected(self):
        inventory = self.full + 'gategoldjira/backend/omitted.go:1.1,2.1 4 0\n'
        for profile in [self.full, self.full.replace(' 2 1', ' 3 1'), self.full.replace('mode: atomic', 'mode: set')]:
            with self.subTest(profile=profile), self.assertRaises(ValueError): MODULE.require_complete(profile, inventory)
        with self.assertRaises(ValueError): MODULE.require_complete('mode: atomic\n', self.full)

    def test_profile_log_package_and_inventory_artifacts_are_bound_to_the_successful_run(self):
        for record in self.proof['files'].values():
            path = self.run / record['path']
            before = path.read_bytes()
            path.write_bytes(before + b' ')
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, 'artifact changed'): MODULE.validate(self.path)
            path.write_bytes(before)
        (self.run / 'result.json').write_text(json.dumps({'status': 'failed', 'runDirectory': str(self.run)}))
        with self.assertRaisesRegex(ValueError, 'successful full'): MODULE.validate(self.path)

    def test_current_captured_backend_source_set_and_bytes_must_match(self):
        for changed in [{'backend/app.go': 'changed'}, {**self.backend, 'backend/new.go': 'unmeasured'}]:
            with self.subTest(changed=changed), self.assertRaisesRegex(ValueError, 'current captured backend'): MODULE.validate(self.path, changed)
        (self.source / 'backend/app.go').write_text('changed implementation')
        with self.assertRaisesRegex(ValueError, 'Captured backend sources'): MODULE.validate(self.path)

    def test_truncated_profile_cannot_be_rebound_without_the_complete_instrumentation_map(self):
        path = self.run / 'go-unit-statements.out'
        path.write_text(self.full.splitlines()[0] + '\n' + self.full.splitlines()[1] + '\n')
        self.proof['files']['profile']['sha256'] = MODULE.digest(path.read_bytes())
        self.write_proof()
        with self.assertRaisesRegex(ValueError, 'authoritative full block'): MODULE.validate(self.path)

    def test_package_runs_are_complete_distinct_and_have_no_selected_inventory_tests(self):
        for events in [[], [{'Action': 'pass', 'Package': 'other'}], [{'Action': 'fail', 'Package': 'gategoldjira/backend'}],
                       [{'Action': 'run', 'Package': 'gategoldjira/backend', 'Test': 'TestAccidentallySelected'}],
                       [{'Action': 'pass', 'Package': 'gategoldjira/backend'}] * 2]:
            with self.subTest(events=events), self.assertRaises(ValueError): MODULE.validate_inventory_events('\n'.join(map(json.dumps, events)), self.packages)
        with self.assertRaisesRegex(ValueError, 'every inventoried package'): MODULE.validate_full_log('', self.packages)
        with self.assertRaisesRegex(ValueError, 'failure'): MODULE.validate_full_log('FAIL gategoldjira/backend\n', self.packages)

    def test_create_executes_official_whole_package_instrumentation_and_binds_artifacts(self):
        calls=[]
        def driver(command, **kwargs):
            calls.append(command)
            if command[:2]==['go','test']:
                profile=next(item.removeprefix('-coverprofile=') for item in command if item.startswith('-coverprofile='))
                Path(profile).write_text(self.full)
                kwargs['stdout'].write(json.dumps({'Action':'pass','Package':'gategoldjira/backend'})+'\n')
                return SimpleNamespace(returncode=0)
            if command==['go','version']:return SimpleNamespace(stdout='go version go1.27.2 linux/amd64\n')
            raise AssertionError('Unexpected external command')
        with patch.object(MODULE,'packages',return_value=self.packages),patch.object(MODULE.subprocess,'run',side_effect=driver):
            created=MODULE.create(self.run)
        self.assertEqual(MODULE.block_map(MODULE.validate(created)),MODULE.block_map(self.full))
        command=calls[0]
        self.assertEqual(command[command.index('-run')+1],'^$')
        self.assertIn('-coverpkg=./...',command)
        self.assertIn('./...',command)
        self.assertIn('-race',command)
        self.assertIn('-json',command)
        with patch.object(MODULE,'packages',return_value=self.packages),patch.object(MODULE.subprocess,'run',side_effect=subprocess.CalledProcessError(1,command)):
            with self.assertRaises(subprocess.CalledProcessError):MODULE.create(self.run)

    def test_rebound_package_source_hash_or_duplicate_package_inventory_is_rejected(self):
        packages=self.run/self.proof['files']['packages']['path']
        invalid=[{**self.packages[0],'files':{'app.go':'wrong-hash'}}]
        packages.write_text(json.dumps(invalid))
        self.proof['files']['packages']['sha256']=MODULE.digest(packages.read_bytes());self.write_proof()
        with self.assertRaisesRegex(ValueError,'package file differs'):MODULE.validate(self.path)
        with self.assertRaisesRegex(ValueError,'distinct complete'):MODULE.validate_inventory_events('',self.packages*2)

    def test_missing_provenance_and_escaping_artifact_paths_fail_closed(self):
        with self.assertRaises(FileNotFoundError): MODULE.validate(self.run / 'missing.json')
        self.proof['files']['inventory']['path'] = '../outside.out'
        self.write_proof()
        with self.assertRaisesRegex(ValueError, 'owned run'): MODULE.validate(self.path)


if __name__ == '__main__': unittest.main()
