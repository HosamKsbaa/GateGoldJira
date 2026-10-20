"""Unbound or stale frontend totals must remain diagnostics, never full-source proof."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import shutil
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('frontend_provenance', ROOT / 'scripts/frontend-coverage-provenance.py')
MODULE = importlib.util.module_from_spec(SPEC); SPEC.loader.exec_module(MODULE)
UNIT_SPEC = importlib.util.spec_from_file_location('unit_test_fixtures', ROOT / 'scripts/tests/test_frontend_unit_run_provenance.py')
UNIT_FIXTURES = importlib.util.module_from_spec(UNIT_SPEC); UNIT_SPEC.loader.exec_module(UNIT_FIXTURES)


class FullFrontendCounterProvenance(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        app = self.root / 'frontend/src/app'; app.mkdir(parents=True)
        (app / 'loaded.ts').write_text('export const loaded = true;\n')
        (app / 'unloaded.ts').write_text('export const unloaded = false;\n')
        (app.parent / 'main.ts').write_text('void bootstrapApplication();\n')
        (app.parent / 'main.spec.ts').write_text('bootstrap test is excluded')
        retained = app.parent / 'features/generated'; retained.mkdir(parents=True)
        (retained / 'handwritten.ts').write_text('export const ordinaryFolder = true;\n')
        (app / 'unit.spec.ts').write_text('test code is outside application metrics')
        generated = app / 'api/generated'; generated.mkdir(parents=True)
        (generated / 'client.ts').write_text('generated transport code is outside application metrics')
        fixture = app / 'api/fixture-generated'; fixture.mkdir(parents=True)
        (fixture / 'client.ts').write_text('generated fixture transport is excluded')
        self.directory = self.root / 'report'; self.directory.mkdir()
        self.paths = {}
        summaries = {}
        for kind in ['unit', 'combined']:
            path = self.directory / kind / 'coverage-summary.json'; path.parent.mkdir()
            path.write_text(json.dumps({'total': {name: {'covered': 2, 'total': 2, 'pct': 100} for name in ['lines', 'branches', 'functions', 'statements']}}))
            self.paths[kind] = path
            summaries[kind] = {'path': str(path.relative_to(self.directory)), 'sha256': MODULE.digest(path.read_bytes())}
        self.measurement = self.directory / 'measurement.json'
        self.proof = {'completeSourceMapping': True, 'conversionErrors': [], 'frontendDenominator': {
            'version': 1, 'kind': MODULE.KIND, 'sources': MODULE.current_sources(self.root), 'summaries': summaries}}
        self.unit_directory = self.root / '.local/coverage/frontend-unit'
        unit_proof = UNIT_FIXTURES.successful_run(self.root, self.unit_directory)
        copied = self.directory / 'unit/provenance'
        shutil.copytree(self.unit_directory, copied)
        self.proof['frontendDenominator']['unitRun'] = {
            'path': 'unit/provenance/unit-run-provenance.json', 'runId': unit_proof['runId'],
            'sha256': MODULE.digest((copied / 'unit-run-provenance.json').read_bytes())}
        # The fixture adds another ordinary source only when absent.
        self.proof['frontendDenominator']['sources'] = MODULE.current_sources(self.root)
        self.write()

    def tearDown(self): self.temp.cleanup()
    def write(self): self.measurement.write_text(json.dumps(self.proof))
    def validate(self, unit=None, combined=None):
        return MODULE.validate(self.measurement, self.root, unit or self.paths['unit'], combined)

    def test_current_full_source_set_and_exact_producer_summaries_validate(self):
        self.assertTrue(self.validate(combined=self.paths['combined']))
        self.assertEqual(set(MODULE.current_sources(self.root)), {'src/app/loaded.ts', 'src/app/unloaded.ts', 'src/main.ts', 'src/features/generated/handwritten.ts', 'src/app/unit.ts'})

    def test_missing_or_changed_bootstrap_cannot_use_an_app_only_proof(self):
        original = dict(self.proof['frontendDenominator']['sources'])
        del self.proof['frontendDenominator']['sources']['src/main.ts']; self.write()
        with self.assertRaisesRegex(ValueError, 'complete current'): self.validate()
        self.proof['frontendDenominator']['sources'] = original; self.write()
        (self.root / 'frontend/src/main.ts').write_text('void differentBootstrap();\n')
        with self.assertRaisesRegex(ValueError, 'complete current'): self.validate()

    def test_stale_summary_for_the_same_unchanged_application_is_rejected(self):
        stale = self.root / 'old-summary.json'; stale.write_text(self.paths['unit'].read_text().replace('"covered": 2', '"covered": 1'))
        with self.assertRaisesRegex(ValueError, 'summary bytes'): self.validate(unit=stale)
        self.paths['combined'].write_text(self.paths['combined'].read_text() + '\n')
        with self.assertRaisesRegex(ValueError, 'summary bytes'): self.validate(combined=self.paths['combined'])

    def test_changed_unloaded_source_added_and_deleted_application_files_are_rejected(self):
        file = self.root / 'frontend/src/app/unloaded.ts'; original = file.read_text()
        file.write_text('changed code never loaded by Chromium')
        with self.assertRaisesRegex(ValueError, 'complete current'): self.validate()
        file.write_text(original)
        added = file.parent / 'new.ts'; added.write_text('new unmeasured source')
        with self.assertRaisesRegex(ValueError, 'complete current'): self.validate()
        added.unlink(); file.unlink()
        with self.assertRaisesRegex(ValueError, 'complete current'): self.validate()

    def test_missing_measurement_mapping_errors_and_wrong_producer_cannot_verify(self):
        with self.assertRaises(ValueError): MODULE.validate(None, self.root, self.paths['unit'])
        with self.assertRaises(FileNotFoundError): MODULE.validate(self.root / 'missing.json', self.root, self.paths['unit'])
        for change in [{'frontendDenominator': None}, {'completeSourceMapping': False}, {'conversionErrors': [{'reason': 'mapping_failed'}]}]:
            previous = dict(self.proof); self.proof.update(change); self.write()
            with self.assertRaises(ValueError): self.validate()
            self.proof = previous
        self.proof['frontendDenominator']['kind'] = 'browser_loaded_subset'; self.write()
        with self.assertRaises(ValueError): self.validate()

    def test_missing_summary_and_escaping_bound_paths_are_rejected(self):
        self.paths['unit'].unlink()
        with self.assertRaises(ValueError): self.validate()
        self.proof['frontendDenominator']['summaries']['unit']['path'] = '../outside.json'; self.write()
        with self.assertRaisesRegex(ValueError, 'producer output'): self.validate()

    def test_good_measurement_cannot_survive_new_failed_or_unfinished_same_app_run(self):
        unit = UNIT_FIXTURES.MODULE
        run_id = unit.start(self.root, self.unit_directory)
        with self.assertRaisesRegex(ValueError, 'passed latest'): self.validate(combined=self.paths['combined'])
        unit.fail(self.root, self.unit_directory, run_id)
        with self.assertRaisesRegex(ValueError, 'passed latest'): self.validate(combined=self.paths['combined'])

    def test_changed_spec_config_and_bound_raw_profile_invalidate_published_measurement(self):
        for name in ['frontend/src/app/unit.spec.ts', 'frontend/vitest.config.ts']:
            file = self.root / name; original = file.read_bytes(); file.write_bytes(original + b'\n')
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'Current frontend unit'): self.validate()
            file.write_bytes(original)
        raw = self.directory / 'unit/provenance/coverage-final.json'; raw.write_text('{}')
        with self.assertRaisesRegex(ValueError, 'artifact bytes'): self.validate()

    def test_missing_or_changed_unit_proof_cannot_supply_full_denominator(self):
        record = self.proof['frontendDenominator'].pop('unitRun'); self.write()
        with self.assertRaisesRegex(ValueError, 'unit-run proof'): self.validate()
        self.proof['frontendDenominator']['unitRun'] = record; self.write()
        bound = self.directory / record['path']; bound.write_text(bound.read_text() + '\n')
        with self.assertRaisesRegex(ValueError, 'proof bytes'): self.validate()


if __name__ == '__main__': unittest.main()
