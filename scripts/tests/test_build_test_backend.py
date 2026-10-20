"""Isolated fake-Go checks for verified, path-independent backend reuse."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('build_backend', ROOT / 'scripts/build-test-backend.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

FAKE_GO = r'''#!/usr/bin/env python3
import hashlib,json,os,pathlib,sys,time
home=pathlib.Path(__file__).parent
args=sys.argv[1:]
if args==['version']:
 print((home/'version').read_text().strip());raise SystemExit
if args[:2]==['env','-json']:
 values={key:os.environ.get(key,'') for key in args[2:]}
 values.update({'GOOS':os.environ.get('GOOS','linux'),'GOARCH':os.environ.get('GOARCH','amd64'),'GOROOT':str(home/'goroot'),'GOTOOLDIR':str(home/'goroot/pkg/tool')})
 print(json.dumps(values));raise SystemExit
if args[0]=='build':
 with (home/'build-calls.jsonl').open('a') as calls:
  calls.write(json.dumps({'cwd':os.getcwd(),'args':args,'moduleCache':os.environ['GOMODCACHE'],'cgo':os.environ['CGO_ENABLED'],'goenv':os.environ['GOENV'],'gowork':os.environ['GOWORK'],'toolchain':os.environ['GOTOOLCHAIN']})+'\n')
 if (home/'fail').exists():
  print('Private proxy password must stay private',file=sys.stderr);raise SystemExit(43)
 if (home/'pause').exists():time.sleep(.1)
 if (home/'mutate-source').exists():pathlib.Path('main.go').write_text('changed during build')
 if (home/'mutate-tool').exists():(home/'goroot/pkg/tool/compile').write_text('changed during build')
 target=pathlib.Path(args[args.index('-o')+1])
 target.write_bytes(b'fake executable '+hashlib.sha256(pathlib.Path('main.go').read_bytes()).digest()+str('-cover' in args).encode())
 raise SystemExit
raise SystemExit(7)
'''


class SharedTestBackend(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.base = Path(self.temporary.name)
        self.project = self.base / 'project'
        self.project.mkdir()
        self.tools = self.base / 'tools'
        self.tools.mkdir()
        self.go = self.tools / 'go'
        self.go.write_text(FAKE_GO)
        self.go.chmod(0o755)
        (self.tools / 'version').write_text('go version go1.27.2 linux/amd64')
        for path in ['src/runtime/runtime.go', 'pkg/tool/compile', 'pkg/tool/link', 'lib/time/zoneinfo.zip', 'pkg/include/textflag.h']:
            file = self.tools / 'goroot' / path
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text('pinned toolchain input')
        self.source = self.capture('capture-a')
        self.env = {'PATH': os.environ['PATH'], 'HOME': str(self.base), 'GOFLAGS': '-buildvcs=false -trimpath'}

    def tearDown(self):
        # Immutable entries are intentionally not writable during normal reuse.
        for path in self.base.rglob('*'):
            if path.is_dir() and not path.is_symlink():
                path.chmod(0o700)
        self.temporary.cleanup()

    def capture(self, name):
        path = self.base / name
        backend = path / 'backend'
        backend.mkdir(parents=True)
        (backend / 'main.go').write_text('package main\nfunc main() {}\n')
        (backend / 'go.mod').write_text('module gategoldjira/backend\ngo 1.27.2\n')
        (backend / 'schema.sql').write_text('SELECT 1;')
        self.remanifest(path)
        return path

    def remanifest(self, source):
        records = {p.relative_to(source).as_posix(): MODULE.file_digest(p) for p in (source / 'backend').rglob('*') if p.is_file()}
        (source / 'source-manifest.json').write_text(json.dumps(records))

    def output(self, name='first'):
        return self.base / 'runs' / name / 'gategoldjira'

    def build(self, source=None, output=None, coverage=False, env=None):
        return MODULE.build(source or self.source, output or self.output(), self.project, coverage, self.go, self.env if env is None else env)

    def calls(self):
        path = self.tools / 'build-calls.jsonl'
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    def entry(self, result):
        return self.project / '.cache/test-backends' / result['key']

    def test_reuses_identical_verified_captures_at_different_absolute_paths(self):
        first = self.build()
        second = self.build(self.capture('differently-named-capture'), self.output('second'))
        self.assertFalse(first['reused'])
        self.assertTrue(second['reused'])
        self.assertEqual(first['key'], second['key'])
        self.assertEqual(first['binarySha256'], MODULE.file_digest(self.output('second')))
        self.assertEqual(len(self.calls()), 1)
        self.assertEqual(self.calls()[0]['moduleCache'], str(self.project / '.cache/go-mod'))
        self.assertEqual(self.calls()[0]['args'][:4], ['build', '-trimpath', '-mod=readonly', '-buildvcs=false'])
        self.assertEqual({key: self.calls()[0][key] for key in ['cgo', 'goenv', 'gowork', 'toolchain']}, {'cgo': '0', 'goenv': 'off', 'gowork': 'off', 'toolchain': 'local'})

    def test_output_is_a_separate_immutable_inode_and_its_removal_does_not_remove_cache(self):
        result = self.build()
        cached = self.entry(result) / 'backend'
        self.assertNotEqual(cached.stat().st_ino, self.output().stat().st_ino)
        self.assertEqual(cached.stat().st_mode & 0o222, 0)
        self.assertEqual((self.entry(result) / 'metadata.json').stat().st_mode & 0o222, 0)
        self.output().unlink()
        self.assertTrue(self.build()['reused'])

    def test_changed_source_embedded_assets_and_coverage_options_invalidate_reuse(self):
        first = self.build()
        (self.source / 'backend/schema.sql').write_text('SELECT 2;')
        self.remanifest(self.source)
        second = self.build(output=self.output('asset'))
        covered = self.build(output=self.output('covered'), coverage=True)
        self.assertEqual(len({first['key'], second['key'], covered['key']}), 3)
        self.assertEqual(len(self.calls()), 3)
        self.assertIn('-cover', self.calls()[-1]['args'])
        self.assertIn('-covermode=atomic', self.calls()[-1]['args'])
        self.assertIn('-coverpkg=./...', self.calls()[-1]['args'])

    def test_effective_target_flags_environment_and_toolchain_changes_invalidate_reuse(self):
        keys = [self.build()['key']]
        for name, changes in [('target', {'GOOS': 'windows'}), ('parallelism', {'GOFLAGS': '-trimpath -p=2'}), ('experiments', {'GOEXPERIMENT': 'newexperiment'}), ('proxy', {'GOPROXY': 'https://user:private-password@proxy.invalid'})]:
            keys.append(self.build(output=self.output(name), env={**self.env, **changes})['key'])
        (self.tools / 'version').write_text('go version go1.27.3 linux/amd64')
        keys.append(self.build(output=self.output('version'))['key'])
        (self.tools / 'goroot/src/runtime/runtime.go').write_text('different same-version standard library')
        keys.append(self.build(output=self.output('stdlib'))['key'])
        (self.tools / 'goroot/pkg/tool/compile').write_text('different same-version compiler')
        keys.append(self.build(output=self.output('compiler'))['key'])
        self.assertEqual(len(keys), len(set(keys)))
        metadata = '\n'.join(p.read_text() for p in (self.project / '.cache/test-backends').glob('*/metadata.json'))
        self.assertNotIn('private-password', metadata)
        self.assertNotIn('proxy.invalid', metadata)

    def test_arbitrary_inherited_build_inputs_are_stripped_or_rejected(self):
        first = self.build()
        second = self.build(output=self.output('safe'), env={**self.env, 'CC': '/untrusted/compiler', 'GOWORK': '/private/workspace', 'GOENV': '/private/config', 'GOCACHEPROG': '/private/program', 'LD_PRELOAD': '/private/library'})
        self.assertEqual(first['key'], second['key'])
        self.assertTrue(second['reused'])
        for flags in ['-overlay=private.json', '-modfile=other.mod', '-ldflags=-X=private', '-trimpath=false', '-race', '-p=0', '-p=257', '-p=1 -p=2']:
            with self.subTest(flags=flags), self.assertRaisesRegex(ValueError, 'Unsupported GOFLAGS|Repeated Go'):
                self.build(env={**self.env, 'GOFLAGS': flags})
        with self.assertRaisesRegex(ValueError, 'CGO_ENABLED=0'):
            self.build(env={**self.env, 'CGO_ENABLED': '1'})
        self.assertEqual(len(self.calls()), 1)

    def test_binary_corruption_writable_metadata_and_wrong_metadata_rebuild(self):
        result = self.build()
        binary = self.entry(result) / 'backend'
        binary.chmod(0o755)
        binary.write_bytes(b'corrupted')
        rebuilt = self.build(output=self.output('rebuilt'))
        self.assertFalse(rebuilt['reused'])
        self.assertEqual(result['binarySha256'], rebuilt['binarySha256'])
        metadata = self.entry(result) / 'metadata.json'
        metadata.chmod(0o644)
        self.assertFalse(self.build(output=self.output('permissions'))['reused'])
        metadata = self.entry(result) / 'metadata.json'
        metadata.chmod(0o644)
        data = json.loads(metadata.read_text())
        data['key'] = 'wrong'
        metadata.write_text(json.dumps(data))
        metadata.chmod(0o444)
        self.assertFalse(self.build(output=self.output('wrong-key'))['reused'])
        self.assertEqual(len(self.calls()), 4)

    def test_concurrent_equal_builds_publish_once_under_the_per_key_lock(self):
        second = self.capture('parallel-capture')
        (self.tools / 'pause').touch()
        with ThreadPoolExecutor(max_workers=2) as pool:
            a = pool.submit(self.build)
            b = pool.submit(self.build, second, self.output('parallel'))
            results = [a.result(), b.result()]
        self.assertEqual(sorted(result['reused'] for result in results), [False, True])
        self.assertEqual(len(self.calls()), 1)

    def test_unlisted_missing_changed_and_symlink_sources_fail_before_compilation(self):
        original = (self.source / 'backend/main.go').read_text()
        (self.source / 'backend/main.go').write_text('unbound bytes')
        with self.assertRaisesRegex(ValueError, 'inventory or file bytes'):
            self.build()
        (self.source / 'backend/main.go').write_text(original)
        (self.source / 'backend/unlisted.go').write_text('unlisted')
        with self.assertRaisesRegex(ValueError, 'inventory or file bytes'):
            self.build()
        (self.source / 'backend/unlisted.go').unlink()
        (self.source / 'backend/schema.sql').unlink()
        with self.assertRaisesRegex(ValueError, 'inventory or file bytes'):
            self.build()
        (self.source / 'backend/schema.sql').symlink_to(self.tools / 'version')
        with self.assertRaisesRegex(ValueError, 'symlinks'):
            self.build()
        self.assertEqual(self.calls(), [])

    def test_manifest_traversal_duplicate_keys_and_symlink_manifest_fail_closed(self):
        path = self.source / 'source-manifest.json'
        for name in ['../private', '/backend/main.go', 'backend/../private', 'backend//main.go', 'backend\\main.go']:
            path.write_text(json.dumps({name: 'a' * 64}))
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'canonical relative'):
                self.build()
        path.write_text('{"backend/go.mod":"a","backend/go.mod":"b"}')
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            self.build()
        path.unlink()
        path.symlink_to(self.tools / 'version')
        with self.assertRaisesRegex(ValueError, 'manifest cannot be a symlink'):
            self.build()

    def test_custom_module_replacements_cannot_read_unbound_dependency_trees(self):
        for replacement in ['replace example.test/private => ../unbound', 'replace (\n example.test/private => /private/dependency\n)']:
            (self.source / 'backend/go.mod').write_text('module gategoldjira/backend\ngo 1.27.2\n' + replacement + '\n')
            self.remanifest(self.source)
            with self.subTest(replacement=replacement), self.assertRaisesRegex(ValueError, 'module replacements'):
                self.build()
        self.assertEqual(self.calls(), [])

    def test_source_or_toolchain_mutation_during_build_is_never_published(self):
        for marker in ['mutate-source', 'mutate-tool']:
            with self.subTest(marker=marker):
                (self.tools / marker).touch()
                with self.assertRaisesRegex(ValueError, 'inventory or file bytes|changed during'):
                    self.build()
                (self.tools / marker).unlink()
                self.remanifest(self.source)
                cache = self.project / '.cache/test-backends'
                self.assertEqual([p for p in cache.iterdir() if not p.name.startswith('.')], [])
                self.assertEqual(list(cache.glob('.build-*')), [])
                self.assertFalse(self.output().exists())

    def test_failed_compilation_has_no_entry_output_or_sensitive_error(self):
        (self.tools / 'fail').touch()
        with self.assertRaisesRegex(ValueError, '^Go backend command failed with exit status 43\\.$'):
            self.build()
        self.assertFalse(self.output().exists())
        self.assertEqual(list((self.project / '.cache/test-backends').glob('.build-*')), [])

    def test_output_traversal_symlink_parent_and_internal_paths_cannot_modify_the_target(self):
        target = self.base / 'protected'
        target.write_text('must remain unchanged')
        link = self.base / 'output-link'
        link.symlink_to(target)
        parent = self.base / 'linked-parent'
        parent.symlink_to(self.base / 'project', target_is_directory=True)
        bad = [link, parent / 'binary', self.base / 'runs/../protected', self.source / 'new/binary', self.project / '.cache/test-backends/binary']
        for output in bad:
            with self.subTest(output=output), self.assertRaisesRegex(ValueError, 'symlink|traversal|outside captured'):
                self.build(output=output)
        self.assertEqual(target.read_text(), 'must remain unchanged')
        self.assertFalse((self.source / 'new').exists())
        self.assertEqual(self.calls(), [])

    def test_symlinked_cache_directory_and_entry_fail_without_following_them(self):
        outside = self.base / 'outside'
        outside.mkdir()
        (self.project / '.cache').mkdir()
        cache = self.project / '.cache/test-backends'
        cache.symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'directories cannot be symlinks'):
            self.build()
        self.assertEqual(list(outside.iterdir()), [])
        cache.unlink()
        result = self.build()
        MODULE.remove_entry(self.entry(result))
        self.entry(result).symlink_to(outside, target_is_directory=True)
        with self.assertRaisesRegex(ValueError, 'entries cannot be symlinks'):
            self.build(output=self.output('second'))
        self.assertEqual(list(outside.iterdir()), [])

    def test_cli_emits_only_small_bound_json_and_has_an_explicit_root(self):
        result = subprocess.run(['python3', str(ROOT / 'scripts/build-test-backend.py'), '--root', str(self.project), '--source', str(self.source), '--output', str(self.output()), '--go', str(self.go), '--coverage'], env=self.env, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        self.assertEqual(set(data), {'reused', 'key', 'binarySha256', 'metadataSha256', 'backendManifestSha256'})
        self.assertFalse(data['reused'])
        self.assertEqual(data['binarySha256'], MODULE.file_digest(self.output()))


if __name__ == '__main__':
    unittest.main()
