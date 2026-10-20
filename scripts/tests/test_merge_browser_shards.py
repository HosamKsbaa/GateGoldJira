"""No percentage arithmetic: only complete, source-matched execution may merge."""
import copy
import errno
import gzip
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('browser_shards', ROOT / 'scripts/merge-browser-shards.py')
MERGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MERGE)


def fixture():
    catalog = {'cases': [{'id': 'UC-TST-0001', 'title': 'Authored order before parsed fields', 'area': 'test', 'implementation': 'implemented', 'surfaces': ['web', 'rest']}]}
    case = catalog['cases'][0]
    tests = []
    for number in [1, 2]:
        item = {'testId': 'absolute-run-id-' + str(number), 'file': 'e2e/example.spec.ts',
                'line': number, 'column': 1, 'repeatEachIndex': 0, 'titlePathSha256': MERGE.digest(str(number).encode()), 'expectedStatus': 'passed'}
        item['identity'] = MERGE.digest(MERGE.canonical([item['file'], number, 1, 0, item['titlePathSha256']]))
        tests.append(item)
    reports = []
    for number, test in enumerate(tests, 1):
        evidence = {'testId': test['testId'], 'file': test['file'], 'line': test['line'], 'retry': 0,
                    'surface': ['web', 'rest'][number - 1], 'result': 'passed', 'assertions': 1}
        row = {**case, 'caseSha256': MERGE.case_hash(case), 'evidence': [evidence],
               'verifiedSurfaces': [evidence['surface']], 'status': 'passed'}
        reports.append({'version': 2, 'suiteStatus': 'passed', 'catalogSha256': 'a' * 64,
                        'sourceManifestSha256': 'b' * 64, 'applicationSha256': 'c' * 64,
                        'invalidEvidence': False, 'invalidEvidenceDetails': [], 'cases': [row],
                        'execution': {'shard': {'current': number, 'total': 2}, 'listing': False, 'fullSelection': True,
                                      'selectionFiltersSha256': 'd' * 64, 'selectedTests': [test],
                                      'attempts': [{'testId': test['testId'], 'identity': test['identity'],
                                                    'retry': 0, 'status': 'passed', 'expectedStatus': 'passed'}]}})
    inventory = copy.deepcopy(reports[0])
    inventory['execution'].update(shard=None, listing=True, selectedTests=tests, attempts=[])
    return catalog, reports, inventory


class StrictShardUnion(unittest.TestCase):
    def test_exact_union_recomputes_cases_and_surfaces(self):
        catalog, reports, inventory = fixture()
        result = MERGE.merge_reports(reports, inventory, catalog)
        self.assertEqual(result['verified'], 1)
        self.assertEqual(result['percent'], 100)
        self.assertEqual(result['cases'][0]['verifiedSurfaces'], ['rest', 'web'])
        self.assertEqual(len(result['execution']['selectedTests']), 2)
        self.assertNotEqual(result['cases'][0]['evidence'][0]['testId'], 'absolute-run-id-1')

    def test_incomplete_duplicate_and_inconsistent_shards_are_rejected(self):
        for change in ['missing', 'duplicate', 'total', 'overlap', 'no_attempt', 'empty', 'filters', 'filtered_inventory', 'inventory_missing']:
            with self.subTest(change=change):
                catalog, reports, inventory = fixture()
                if change == 'missing': reports.pop()
                if change == 'duplicate': reports[1]['execution']['shard']['current'] = 1
                if change == 'total': reports[1]['execution']['shard']['total'] = 3
                if change == 'overlap': reports[1] = copy.deepcopy(reports[0]); reports[1]['execution']['shard']['current'] = 2
                if change == 'no_attempt': reports[1]['execution']['attempts'] = []
                if change == 'empty': reports[1]['execution']['selectedTests'] = []
                if change == 'filters': reports[1]['execution']['selectionFiltersSha256'] = 'e' * 64
                if change == 'filtered_inventory': inventory['execution']['fullSelection'] = False
                if change == 'inventory_missing': inventory['execution']['selectedTests'].pop()
                with self.assertRaises(ValueError): MERGE.merge_reports(reports, inventory, catalog)

    def test_failure_flaky_missing_assertion_and_invalid_cannot_be_laundered(self):
        for outcome in ['failed', 'flaky', 'assertion_missing', 'invalid', 'suite_failure', 'test_failure']:
            with self.subTest(outcome=outcome):
                catalog, reports, inventory = fixture()
                if outcome in ['failed', 'flaky', 'assertion_missing']:
                    reports[0]['cases'][0]['evidence'][0]['result'] = outcome
                    if outcome == 'assertion_missing': reports[0]['cases'][0]['evidence'][0]['assertions'] = 0
                if outcome == 'invalid': reports[0]['invalidEvidence'] = True
                if outcome == 'suite_failure': reports[0]['suiteStatus'] = 'failed'
                if outcome == 'test_failure':
                    reports[0]['execution']['attempts'][0]['status'] = 'failed'
                    reports[0]['cases'][0]['evidence'][0]['result'] = 'failed'
                result = MERGE.merge_reports(reports, inventory, catalog)
                self.assertEqual(result['suiteStatus'], 'failed')
                if outcome in ['failed', 'flaky', 'assertion_missing', 'test_failure']:
                    self.assertEqual(result['verified'], 0)
                if outcome == 'invalid': self.assertTrue(result['invalidEvidence'])

    def test_failed_timedout_interrupted_and_invalid_inventory_rejected(self):
        for outcome in ['failed', 'timedout', 'interrupted', 'invalid']:
            with self.subTest(outcome=outcome):
                catalog, reports, inventory = fixture()
                if outcome == 'invalid': inventory['invalidEvidence'] = True
                else: inventory['suiteStatus'] = outcome
                with self.assertRaises(ValueError): MERGE.merge_reports(reports, inventory, catalog)

    def test_unlabelled_unexpected_pass_cannot_hide_in_a_passing_global_status(self):
        catalog, reports, inventory = fixture()
        reports[0]['cases'][0].update(evidence=[], status='not_run', verifiedSurfaces=[])
        reports[0]['execution']['attempts'][0]['expectedStatus'] = 'failed'
        self.assertEqual(MERGE.merge_reports(reports, inventory, catalog)['suiteStatus'], 'failed')

    def test_skipped_attempts_never_create_passing_surface_evidence(self):
        catalog, reports, inventory = fixture()
        reports[0]['execution']['attempts'][0]['status'] = 'skipped'
        with self.assertRaises(ValueError): MERGE.merge_reports(reports, inventory, catalog)
        reports[0]['cases'][0].update(evidence=[], status='not_run', verifiedSurfaces=[])
        result = MERGE.merge_reports(reports, inventory, catalog)
        self.assertEqual(result['cases'][0]['verifiedSurfaces'], ['rest'])


class ExactSourceRuns(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'current'
        self.root.mkdir()
        for name in ['scripts/report-test-coverage.py', 'scripts/capture-test-source.py', 'scripts/merge-go-coverage.py']:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
        self.catalog, self.reports, self.inventory = fixture()
        source_files = {'docs/use-cases/catalog.json': json.dumps(self.catalog),
                        'frontend/e2e/example.spec.ts': 'real test fixture',
                        'frontend/e2e/support/helper.ts': 'real shared helper',
                        'backend/app.go': 'package app\nfunc App() {}\n'}
        for name, content in source_files.items():
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
        self.manifest = {str(path.relative_to(self.root)): MERGE.digest(path.read_bytes())
                         for path in self.root.rglob('*') if path.is_file()}
        self.manifest_bytes = json.dumps(self.manifest, sort_keys=True).encode()
        publisher = MERGE.load_module('fixture_publish', self.root / 'scripts/report-test-coverage.py')
        headers = {'catalogSha256': MERGE.digest((self.root / 'docs/use-cases/catalog.json').read_bytes()),
                   'sourceManifestSha256': MERGE.digest(MERGE.canonical(sorted(self.manifest.items()))),
                   'applicationSha256': publisher.application_hash(self.root)}
        self.indexes = []
        for number, report in enumerate(self.reports, 1):
            report.update(headers)
            run = Path(self.temp.name) / ('shard-' + str(number))
            shutil.copytree(self.root, run / 'source')
            (run / 'source/source-manifest.json').write_bytes(self.manifest_bytes)
            (run / 'use-case-results.json').write_text(json.dumps(report))
            (run / 'js-coverage').mkdir()
            (run / 'js-coverage/same-name.json.gz').write_bytes(gzip.compress(b'[]'))
            (run / 'go-statements.out').write_text('mode: atomic\ngategoldjira/backend/app.go:1.1,2.1 1 ' + str(number) + '\n')
            index = Path(self.temp.name) / ('index-' + str(number) + '.json')
            index.write_text(json.dumps({'runDirectory': str(run), 'status': 'passed'}))
            self.indexes.append(index)
        self.inventory.update(headers)
        self.inventory_path = Path(self.temp.name) / 'inventory.json'
        self.inventory_path.write_text(json.dumps(self.inventory))
        self.output = Path(self.temp.name) / 'combined'

    def tearDown(self): self.temp.cleanup()

    def merge(self): return MERGE.merge_runs(self.indexes, self.inventory_path, self.output, self.root)

    def test_real_files_merge_with_private_raw_counters_and_exact_go_maps(self):
        result = self.merge()
        self.assertEqual(result['suiteStatus'], 'passed')
        self.assertTrue((self.output / 'source').is_symlink())
        self.assertEqual(len(list((self.output / 'js-coverage').iterdir())), 2)
        self.assertTrue((self.output / 'go-statements.out').read_text().endswith(' 1 2\n'))
        self.assertEqual(self.output.stat().st_mode & 0o777, 0o700)
        run = Path(json.loads(self.indexes[0].read_text())['runDirectory'])
        original = run / 'js-coverage/same-name.json.gz'
        retained = self.output / 'js-coverage/shard-1-same-name.json.gz'
        self.assertEqual(original.stat().st_ino, retained.stat().st_ino)
        original.unlink()
        self.assertEqual(gzip.decompress(retained.read_bytes()), b'[]')

    def test_counter_retention_copies_across_filesystems_but_does_not_hide_io_errors(self):
        source = Path(self.temp.name) / 'counter.json.gz'
        source.write_bytes(gzip.compress(b'["immutable"]'))
        target = Path(self.temp.name) / 'retained.json.gz'
        with patch.object(MERGE.os, 'link', side_effect=OSError(errno.EXDEV, 'another filesystem')):
            MERGE.retain_counter(source, target)
        self.assertEqual(source.read_bytes(), target.read_bytes())
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)
        target.unlink()
        with patch.object(MERGE.os, 'link', side_effect=OSError(errno.ENOSPC, 'full disk')):
            with self.assertRaises(OSError): MERGE.retain_counter(source, target)
        self.assertFalse(target.exists())

    def test_changed_current_test_helper_app_catalog_and_captured_source_rejected(self):
        for name in ['frontend/e2e/example.spec.ts', 'frontend/e2e/support/helper.ts', 'backend/app.go', 'docs/use-cases/catalog.json']:
            with self.subTest(name=name):
                target = self.root / name
                original = target.read_bytes()
                target.write_bytes(original + b' ')
                with self.assertRaises(ValueError): self.merge()
                target.write_bytes(original)
        run = Path(json.loads(self.indexes[0].read_text())['runDirectory'])
        (run / 'source/backend/app.go').write_text('different captured source')
        with self.assertRaises(ValueError): self.merge()

    def test_added_current_test_and_changed_playwright_config_rejected(self):
        added = self.root / 'frontend/e2e/new-unexecuted.spec.ts'
        added.write_text('a new unexecuted regression')
        with self.assertRaises(ValueError): self.merge()
        added.unlink()
        config = self.root / 'frontend/playwright.config.ts'
        config.write_text('changed test selection config')
        with self.assertRaises(ValueError): self.merge()

    def test_manifest_case_hash_and_unfinished_index_mismatch_rejected(self):
        for kind in ['manifest', 'case', 'unfinished']:
            with self.subTest(kind=kind):
                index = self.indexes[1]
                index_original = index.read_bytes()
                run = Path(json.loads(index_original)['runDirectory'])
                target = run / ('source/source-manifest.json' if kind == 'manifest' else 'use-case-results.json')
                original = target.read_bytes()
                if kind == 'manifest': target.write_bytes(original + b' ')
                elif kind == 'case':
                    report = json.loads(original)
                    report['cases'][0]['caseSha256'] = 'f' * 64
                    target.write_text(json.dumps(report))
                else: index.write_text(json.dumps({'runDirectory': str(run), 'status': 'running'}))
                with self.assertRaises(ValueError): self.merge()
                index.write_bytes(index_original)
                target.write_bytes(original)

    def test_failed_run_index_preserved_even_if_report_says_passed(self):
        index = self.indexes[0]
        data = json.loads(index.read_text()); data['status'] = 'failed'; index.write_text(json.dumps(data))
        self.assertEqual(self.merge()['suiteStatus'], 'failed')


if __name__ == '__main__': unittest.main()
