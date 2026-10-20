import importlib.util
from pathlib import Path
import unittest
import json
import tempfile

spec=importlib.util.spec_from_file_location('coverage_report',Path(__file__).resolve().parents[1]/'report-test-coverage.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class CoverageReportTests(unittest.TestCase):
    def catalog(self):return {'cases':[{'id':'UC-TST-0001','area':'test','title':'Exact outcome','implementation':'implemented','surfaces':['web','rest']}]}
    def report(self):return {'version':2,'catalogSha256':'catalog','sourceManifestSha256':'source','applicationSha256':'app','suiteStatus':'passed','cases':[{'id':'UC-TST-0001','status':'passed','verifiedSurfaces':['rest'],'evidence':[]}]}
    def test_missing_ui_surface_cannot_be_counted_as_fully_verified(self):
        result=module.build(self.report(),self.catalog(),'catalog','app')
        self.assertEqual(result['verified'],1)
        self.assertEqual(result['fullyVerifiedAcrossSurfaces'],0)
        self.assertEqual(result['cases'][0]['missingSurfaces'],['web'])
    def test_failure_does_not_keep_passing_surface_from_another_step(self):
        report=self.report();report['cases'][0]['status']='failed'
        result=module.build(report,self.catalog(),'catalog','app')
        self.assertEqual(result['verified'],0)
        self.assertEqual(result['cases'][0]['verifiedSurfaces'],[])
    def test_stale_catalog_and_stale_application_are_rejected(self):
        for field in ['catalogSha256','applicationSha256','sourceManifestSha256']:
            report=self.report();report[field]=None
            with self.subTest(field=field),self.assertRaises(ValueError):module.build(report,self.catalog(),'catalog','app')
    def test_duplicate_and_missing_report_cases_are_rejected(self):
        report=self.report();report['cases']*=2
        with self.assertRaises(ValueError):module.build(report,self.catalog(),'catalog','app')
        report['cases']=[]
        with self.assertRaises(ValueError):module.build(report,self.catalog(),'catalog','app')
    def test_report_requires_source_and_surface_aware_format(self):
        report=self.report();report['version']=1
        with self.assertRaises(ValueError):module.build(report,self.catalog(),'catalog','app')
    def test_full_source_gate_uses_exact_counters_instead_of_rounded_percentages(self):
        code={name:{'covered':100000,'total':100000,'pct':100} for name in ['lines','branches','functions','statements']}
        metrics={'frontendDenominatorVerified':True,'goDenominatorVerified':True,'frontendCombined':code,'goStatements':{'covered':10,'total':10},'goStatementsPercent':100}
        self.assertTrue(module.full_source_metrics(metrics))
        code['branches']['covered']=99999
        self.assertFalse(module.full_source_metrics(metrics))
        code['branches']['covered']=100000
        metrics['goStatements']['covered']=9
        self.assertFalse(module.full_source_metrics(metrics))
        del metrics['goStatements']
        self.assertFalse(module.full_source_metrics(metrics))
    def test_combined_source_can_complete_unit_gaps_but_empty_denominators_cannot_pass(self):
        code={name:{'covered':2,'total':2} for name in ['lines','branches','functions','statements']}
        metrics={'frontendDenominatorVerified':True,'goDenominatorVerified':True,'frontendCombined':code,'frontendUnit':{},'goStatements':{'covered':1,'total':1}}
        self.assertTrue(module.full_source_metrics(metrics))
        metrics['goStatements']={'covered':0,'total':0}
        self.assertFalse(module.full_source_metrics(metrics))
    def test_exact_hundred_without_verified_go_denominator_cannot_pass(self):
        metrics={'frontendCombined':{key:{'covered':1,'total':1} for key in ['lines','branches','functions','statements']},'goStatements':{'covered':1,'total':1}}
        self.assertFalse(module.full_source_metrics(metrics))
        metrics['goDenominatorVerified']=False
        self.assertFalse(module.full_source_metrics(metrics))
    def test_complete_stats_without_verified_frontend_producer_cannot_pass(self):
        metrics={'goDenominatorVerified':True,'frontendCombined':{key:{'covered':1,'total':1} for key in ['lines','branches','functions','statements']},'goStatements':{'covered':1,'total':1}}
        self.assertFalse(module.full_source_metrics(metrics))
        metrics['frontendDenominatorVerified']=False
        self.assertFalse(module.full_source_metrics(metrics))
        metrics['frontendDenominatorVerified']=True
        self.assertTrue(module.full_source_metrics(metrics))

    def full_execution(self):
        title=module.digest(b'public test title');identity=module.digest(json.dumps(['e2e/test.spec.ts',1,1,0,title],separators=(',',':')).encode())
        return {'fullSelection':True,'listing':False,'shard':None,'selectionFiltersSha256':'d'*64,
                'selectedTests':[{'testId':'actual-id','identity':identity,'file':'e2e/test.spec.ts','line':1,'column':1,'repeatEachIndex':0,'titlePathSha256':title,'expectedStatus':'passed'}],
                'attempts':[{'testId':'actual-id','identity':identity,'retry':0,'status':'passed','expectedStatus':'passed'}]}

    def test_full_actual_execution_and_valid_merged_scope_are_recognized(self):
        report=self.report();report['execution']=self.full_execution()
        self.assertTrue(module.browser_execution_scope(report)['full'])
        report['execution']['mergedShards']=8
        self.assertTrue(module.browser_execution_scope(report)['full'])

    def test_filtered_listing_single_shard_missing_duplicate_retried_and_unexpected_execution_cannot_be_full(self):
        for change in ['filtered','listing','shard','missing','duplicate','retry','unexpected_pass','failed','bad_identity']:
            report=self.report();execution=self.full_execution();report['execution']=execution
            if change=='filtered':execution['fullSelection']=False
            if change=='listing':execution['listing']=True
            if change=='shard':execution['shard']={'current':1,'total':8}
            if change=='missing':execution['attempts']=[]
            if change=='duplicate':execution['attempts']*=2
            if change=='retry':execution['attempts'].append({**execution['attempts'][0],'retry':1})
            if change=='unexpected_pass':execution['attempts'][0]['expectedStatus']='failed'
            if change=='failed':execution['attempts'][0]['status']='failed'
            if change=='bad_identity':execution['selectedTests'][0]['identity']='incorrect'
            with self.subTest(change=change):self.assertFalse(module.browser_execution_scope(report)['full'])

    def test_only_the_explicit_instrumentation_timing_opt_out_can_be_skipped(self):
        report=self.report();execution=self.full_execution();report['execution']=execution
        selected=execution['selectedTests'][0];selected.update(file='e2e/performance.spec.ts',expectedStatus='skipped')
        selected['identity']=module.digest(json.dumps([selected['file'],1,1,0,selected['titlePathSha256']],separators=(',',':')).encode())
        execution['attempts'][0].update(identity=selected['identity'],status='skipped',expectedStatus='skipped')
        self.assertEqual(module.browser_execution_scope(report),{'full':True,'scope':'full_unfiltered','selectedTests':1,'attempts':1,'timingOptOuts':1})
        selected['file']='e2e/feature.spec.ts'
        selected['identity']=module.digest(json.dumps([selected['file'],1,1,0,selected['titlePathSha256']],separators=(',',':')).encode())
        execution['attempts'][0]['identity']=selected['identity']
        self.assertFalse(module.browser_execution_scope(report)['full'])

    def test_execution_manifest_validates_test_and_shared_helper_contents(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            files={'frontend/e2e/test.spec.ts':'actual browser assertions','frontend/e2e/support/session.ts':'actual account helper'}
            for name,text in files.items():
                path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
            manifest={name:module.digest(text.encode()) for name,text in files.items()}
            report=self.report();report['cases'][0]['evidence']=[{'file':'e2e/test.spec.ts'}]
            report['sourceManifestSha256']=module.digest(json.dumps(sorted(manifest.items()),ensure_ascii=False,separators=(',',':')).encode())
            self.assertEqual(module.validate_test_sources(report,manifest,root),1)
            for name in files:
                path=root/name;path.write_text('changed assertions or helper')
                with self.assertRaisesRegex(ValueError,'changed after execution'):module.validate_test_sources(report,manifest,root)
                path.write_text(files[name])
            report['sourceManifestSha256']='different manifest'
            with self.assertRaisesRegex(ValueError,'recorded hash'):module.validate_test_sources(report,manifest,root)
    def test_complete_browser_inventory_and_config_must_match_even_without_case_evidence(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            files={'frontend/e2e/test.spec.ts':'mapped browser assertions',
                   'frontend/e2e/unlabelled.spec.ts':'unlabelled regression',
                   'frontend/e2e/support/session.ts':'shared account helper',
                   'frontend/playwright.config.ts':'actual full-suite configuration'}
            for name,text in files.items():
                path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
            manifest={name:module.digest(text.encode()) for name,text in files.items()}
            report=self.report();report['cases'][0]['evidence']=[{'file':'e2e/test.spec.ts'}]
            report['sourceManifestSha256']=module.digest(json.dumps(sorted(manifest.items()),ensure_ascii=False,separators=(',',':')).encode())
            report['execution']=self.full_execution()
            self.assertEqual(module.validate_test_sources(report,manifest,root),1)
            self.assertTrue(module.browser_execution_scope(report)['full'])
            for name in files:
                path=root/name;original=path.read_bytes()
                path.write_bytes(original+b' changed')
                with self.subTest(change='changed',name=name),self.assertRaisesRegex(ValueError,'changed after execution'):module.validate_test_sources(report,manifest,root)
                path.write_bytes(original);path.unlink()
                with self.subTest(change='deleted',name=name),self.assertRaisesRegex(ValueError,'changed after execution'):module.validate_test_sources(report,manifest,root)
                path.write_bytes(original)
            for name in ['frontend/e2e/new-unexecuted.spec.ts','frontend/e2e/support/new-unexecuted-helper.ts']:
                path=root/name;path.write_text('new current browser input')
                with self.subTest(change='added',name=name),self.assertRaisesRegex(ValueError,'changed after execution'):module.validate_test_sources(report,manifest,root)
                path.unlink()
            # Adding a configuration where the captured diagnostic had none is
            # inventory drift too, not merely a change to an existing file.
            config=root/'frontend/playwright.config.ts';config.unlink()
            without_config={name:value for name,value in manifest.items() if name!='frontend/playwright.config.ts'}
            report['sourceManifestSha256']=module.digest(json.dumps(sorted(without_config.items()),ensure_ascii=False,separators=(',',':')).encode())
            self.assertEqual(module.validate_test_sources(report,without_config,root),1)
            config.write_text(files['frontend/playwright.config.ts'])
            with self.assertRaisesRegex(ValueError,'changed after execution'):module.validate_test_sources(report,without_config,root)
            report['sourceManifestSha256']=module.digest(json.dumps(sorted(manifest.items()),ensure_ascii=False,separators=(',',':')).encode())
            # A diagnostic run can still be published on matched source, but its
            # actual filtered metadata must remain explicitly short of full.
            report['execution']['fullSelection']=False
            self.assertEqual(module.validate_test_sources(report,manifest,root),1)
            self.assertEqual(module.browser_execution_scope(report)['scope'],'filtered')
            self.assertFalse(module.browser_execution_scope(report)['full'])

    def test_execution_evidence_cannot_escape_the_captured_browser_tests(self):
        for name in ['../private','/absolute/test.ts','e2e/../../private','other/test.ts']:
            manifest={};report=self.report();report['cases'][0]['evidence']=[{'file':name}]
            report['sourceManifestSha256']=module.digest(b'[]')
            with self.subTest(name=name),self.assertRaisesRegex(ValueError,'captured browser test'):module.validate_test_sources(report,manifest,Path('/tmp'))
    def test_application_hash_matches_reporter_full_path_order(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            script=root/'scripts/capture-test-source.py';script.parent.mkdir()
            script.write_text("def source_files(root):\n    return sorted(p.relative_to(root) for p in (root/'backend').rglob('*.go'))\n")
            files={'backend/internal/foo/bar.go':'nested source','backend/internal/foo.go':'sibling source'}
            for name,text in files.items():
                path=root/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_text(text)
            expected=module.digest(json.dumps(sorted([name,module.digest(text.encode())] for name,text in files.items()),separators=(',',':')).encode())
            self.assertEqual(module.application_hash(root),expected)
            (root/'backend/internal/foo.go').write_text('changed source')
            self.assertNotEqual(module.application_hash(root),expected)

if __name__=='__main__':unittest.main()
