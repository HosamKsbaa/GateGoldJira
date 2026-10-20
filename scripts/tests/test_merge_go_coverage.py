import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('go_merge',Path(__file__).resolve().parents[1]/'merge-go-coverage.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class GoMergeTests(unittest.TestCase):
    def profile(self,a=0,b=0):return f'mode: atomic\ngategoldjira/backend/app.go:1.1,2.1 2 {a}\ngategoldjira/backend/app.go:3.1,4.1 1 {b}\n'
    def test_unions_covered_blocks_without_adding_denominators_or_percentages(self):
        manifest={'backend/app.go':'same'}
        self.assertEqual(module.merge([(self.profile(1),manifest),(self.profile(0,5),manifest)]),self.profile(1,5))
    def test_rejects_changed_sources_missing_hashes_and_block_maps(self):
        first=(self.profile(),{'backend/app.go':'a'})
        for second in [(self.profile(),{}),(self.profile(),{'backend/app.go':'b'}),(self.profile().replace('3.1,4.1','3.1,5.1'),{'backend/app.go':'a'})]:
            with self.assertRaises(ValueError):module.merge([first,second])
    def test_rejects_empty_negative_and_foreign_profiles(self):
        for text in ['', 'mode: atomic\n',self.profile(-1),self.profile().replace('gategoldjira/backend','foreign')]:
            with self.assertRaises(ValueError):module.merge([(text,{'backend/app.go':'a'})])
    def test_normalizes_repeated_native_go_samples_without_repeating_the_denominator(self):
        for mode,expected_count in [('atomic',8),('count',8),('set',1)]:
            with self.subTest(mode=mode):
                value=1 if mode=='set' else 4
                text=self.profile(value).replace('mode: atomic','mode: '+mode)
                text+=text.splitlines()[1]+'\n'
                result=module.merge([(text,{'backend/app.go':'a'})])
                expected=self.profile(expected_count).replace('mode: atomic','mode: '+mode)
                self.assertEqual(result,expected)
    def test_rejects_conflicting_statement_counts_for_repeated_native_samples(self):
        text=self.profile()+self.profile().splitlines()[1].replace(' 2 0',' 3 1')+'\n'
        with self.assertRaisesRegex(ValueError,'statement counts'):
            module.merge([(text,{'backend/app.go':'a'})])
    def test_authoritative_inventory_rejects_omitted_file_block_and_numstmt(self):
        profile=self.profile(1,1)
        manifest={'backend/app.go':'same','backend/omitted.go':'same'}
        inventory=profile+'gategoldjira/backend/omitted.go:1.1,2.1 3 0\n'
        for truncated in [profile,profile.splitlines()[0]+'\n'+profile.splitlines()[1]+'\n']:
            with self.assertRaisesRegex(ValueError,'authoritative full'):module.merge([(truncated,manifest)],inventory)
        changed=profile.replace(' 2 1',' 3 1')
        with self.assertRaisesRegex(ValueError,'authoritative full'):module.merge([(changed,manifest)],profile)
        self.assertEqual(module.merge([(profile,manifest)],profile),profile)
if __name__=='__main__':unittest.main()
