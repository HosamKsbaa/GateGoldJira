import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('coverage_check',Path(__file__).resolve().parents[1]/'check-source-coverage.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
def checked(unit, profile):return module.check(unit,profile,profile)
class SourceCoverageGateTests(unittest.TestCase):
    def metrics(self,total=2,covered=2):return {'total':{name:{'total':total,'covered':covered,'pct':100} for name in ['lines','branches','functions','statements']}}
    def test_accepts_exact_counters(self):self.assertEqual(checked(self.metrics(),'mode: atomic\nexample.go:1.1,2.1 2 1\n'),{})
    def test_rejects_rounded_hundred_and_empty_reports(self):
        for unit in [self.metrics(100000,99999),self.metrics(0,0)]:
            self.assertIn('frontend.branches',checked(unit,'mode: atomic\nexample.go:1.1,2.1 2 1\n'))
        self.assertIn('go.statements',checked(self.metrics(),'mode: atomic\n'))
    def test_rejects_uncovered_go_blocks_despite_other_high_execution_counts(self):self.assertEqual(checked(self.metrics(),'mode: atomic\nexample.go:1.1,2.1 2 999999\nexample.go:2.1,3.1 1 0\n'),{'go.statements':{'covered':2,'total':3}})
    def test_invalid_or_negative_profiles_fail(self):
        for profile in ['', 'unknown', 'mode: atomic\nexample.go:1.1,2.1 2 -1\n']:
            with self.assertRaises(ValueError):checked(self.metrics(),profile)
    def test_native_repeated_samples_union_covered_statements_once(self):
        profile='mode: atomic\nexample.go:1.1,2.1 2 0\nexample.go:1.1,2.1 2 8\nexample.go:2.1,3.1 1 0\n'
        self.assertEqual(module.go_counts(profile),{'covered':2,'total':3})
        self.assertEqual(checked(self.metrics(),profile),{'go.statements':{'covered':2,'total':3}})
    def test_missing_or_truncated_authoritative_denominator_cannot_pass(self):
        complete='mode: atomic\nexample.go:1.1,2.1 2 1\nomitted.go:1.1,2.1 3 0\n'
        truncated='mode: atomic\nexample.go:1.1,2.1 2 1\n'
        with self.assertRaisesRegex(ValueError,'authoritative'):module.check(self.metrics(),truncated)
        with self.assertRaisesRegex(ValueError,'complete block'):module.check(self.metrics(),truncated,complete)
    def test_conflicting_duplicate_statement_counts_cannot_satisfy_the_gate(self):
        profile='mode: atomic\nexample.go:1.1,2.1 2 1\nexample.go:1.1,2.1 3 1\n'
        with self.assertRaises(ValueError):module.go_counts(profile)
if __name__=='__main__':unittest.main()
