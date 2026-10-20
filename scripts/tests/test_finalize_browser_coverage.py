"""CLI wiring regressions; real counter/provenance validation lives in its own tests."""
import json
import os
from pathlib import Path
import runpy
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'finalize-browser-coverage.py'


class FinalizeBrowserCoverageTests(unittest.TestCase):
    def test_fresh_unit_directory_is_used_by_converter_and_case_report(self):
        self.check_selected_directory('argument')

    def test_environment_unit_directory_is_used_by_complete_runner(self):
        self.check_selected_directory('environment')

    def test_explicit_argument_overrides_environment(self):
        self.check_selected_directory('both')

    def check_selected_directory(self, mode):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            unit, browser, go, output = [root / name for name in ('fresh-unit', 'browser', 'go', 'report')]
            for directory in (unit, browser, go):
                directory.mkdir()
            (unit / 'coverage-final.json').write_text('{}')
            (go / 'result.json').write_text(json.dumps({'status': 'passed'}))
            (go / 'go-coverage-provenance.json').write_text('{}')
            calls = []

            def command(arguments, **kwargs):
                calls.append(arguments)
                if arguments[0] == 'node':
                    self.assertEqual(arguments[-1], str(unit / 'coverage-final.json'))
                    code = output / 'code'
                    (code / 'combined').mkdir(parents=True)
                    (code / 'combined/coverage-summary.json').write_text('{}')
                    (code / 'measurement.json').write_text(json.dumps({'combinedCoverage': {}}))

            args = [str(SCRIPT), '--run', str(browser), '--go-unit-run', str(go), '--output', str(output)]
            if mode in ('argument', 'both'):
                args += ['--unit-directory', str(unit)]
            environment = {} if mode == 'argument' else {'GATEGOLD_UNIT_COVERAGE_DIRECTORY': str(unit if mode == 'environment' else root / 'missing-other-unit')}
            with patch.dict(os.environ, environment, clear=True), patch.object(sys, 'argv', args), patch('subprocess.run', side_effect=command):
                runpy.run_path(str(SCRIPT), run_name='__main__')
            report = calls[-1]
            self.assertEqual(report[report.index('--unit-summary') + 1], str(output / 'code/unit/coverage-summary.json'))
            self.assertEqual(report[report.index('--combined-summary') + 1], str(output / 'code/combined/coverage-summary.json'))
            self.assertIn('--go-provenance', report)

    def test_missing_explicit_unit_profile_fails_before_any_conversion(self):
        for source in ('argument', 'environment'):
            with self.subTest(source=source), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                args = [str(SCRIPT), '--run', str(root / 'browser')]
                if source == 'argument':
                    args += ['--unit-directory', str(root / 'missing')]
                environment = {'GATEGOLD_UNIT_COVERAGE_DIRECTORY': str(root / 'missing')} if source == 'environment' else {}
                with patch.dict(os.environ, environment, clear=True), patch.object(sys, 'argv', args), patch('subprocess.run') as command:
                    with self.assertRaisesRegex(SystemExit, 'explicitly selected frontend unit coverage profile is missing'):
                        runpy.run_path(str(SCRIPT), run_name='__main__')
                    command.assert_not_called()


if __name__ == '__main__':
    unittest.main()
