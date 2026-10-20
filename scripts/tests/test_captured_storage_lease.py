"""Captured source shares only its real, locked and registered owner's lease.

All projects, metadata, symlinks and child commands are temporary fixtures.
No migration, database, browser, actual project admission or cleanup is run.
"""
from contextlib import contextmanager
import fcntl
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('captured_storage_watchdog', ROOT / 'scripts/with-project-storage.py')
GUARD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GUARD)


class CapturedStorageLeaseTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='gategold-captured-storage-')
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.owner = self.base / 'owner'
        self.owner.mkdir()
        self.lease = 'a' * 32
        self.run_id = 'b' * 32
        self.kind = 'go-verification'
        self.run_name = '.local/' + self.kind + '/' + self.run_id
        self.snapshot = self.make_snapshot(self.run_name)
        self.directory = GUARD.lease_directory(self.owner)
        self.metadata = self.directory / (self.lease + '.json')
        self.lock = self.directory / (self.lease + '.lock')
        self.lock.touch()
        self.write_metadata()
        self.environment = patch.dict(os.environ, {
            'GATEGOLD_STORAGE_LEASE': self.lease,
            'GATEGOLD_STORAGE_ROOT': str(self.owner),
        })
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def make_snapshot(self, relative):
        snapshot = self.owner / relative / 'source'
        for root in (self.owner, snapshot):
            (root / 'scripts').mkdir(parents=True, exist_ok=True)
            (root / 'backend').mkdir(exist_ok=True)
            (root / 'backend/go.mod').write_text('module example.test/fixture\n')
            (root / 'scripts/tool-env.sh').write_text('# temporary marker\n')
            (root / 'compose.dev.yaml').write_text('services: {}\n')
            shutil.copyfile(ROOT / 'scripts/project-storage.py', root / 'scripts/project-storage.py')
        (self.owner / '.cache').mkdir(exist_ok=True)
        # This is the real capture shape that must not become permission for an
        # independent snapshot admission to traverse/delete shared caches.
        (snapshot / '.cache').symlink_to(self.owner / '.cache', target_is_directory=True)
        manifest = {'backend/go.mod': hashlib.sha256((snapshot / 'backend/go.mod').read_bytes()).hexdigest()}
        (snapshot / 'source-manifest.json').write_text(json.dumps(manifest))
        return snapshot

    def write_metadata(self, **changes):
        metadata = {
            'version': 1, 'leaseId': self.lease, 'locked': True,
            'pid': os.getpid(), 'reservationBytes': 2 * 1024**3,
            'paths': [self.run_name],
        }
        metadata.update(changes)
        self.metadata.write_text(json.dumps(metadata))

    @contextmanager
    def held(self):
        with self.lock.open('r+') as stream:
            fcntl.flock(stream, fcntl.LOCK_EX)
            try:
                yield stream
            finally:
                fcntl.flock(stream, fcntl.LOCK_UN)

    def test_registered_go_snapshot_shares_held_owner_lease(self):
        with self.held():
            self.assertTrue(GUARD.inherited_lease(self.snapshot))

    def test_registered_browser_snapshot_shares_held_owner_lease(self):
        self.run_name = '.local/browser-tests/' + self.run_id
        snapshot = self.make_snapshot(self.run_name)
        self.write_metadata()
        with self.held():
            self.assertTrue(GUARD.inherited_lease(snapshot))

    def test_nested_command_preserves_owner_environment_and_status_without_second_admission(self):
        marker = self.base / 'child.json'
        source = (
            'import json,os,pathlib; '
            'pathlib.Path(' + repr(str(marker)) + ').write_text(json.dumps({'
            '"lease":os.environ["GATEGOLD_STORAGE_LEASE"],'
            '"root":os.environ["GATEGOLD_STORAGE_ROOT"]})); '
            'raise SystemExit(7)'
        )
        before = self.metadata.read_bytes()
        with self.held():
            self.assertEqual(GUARD.run(self.snapshot, 'migration', [], [sys.executable, '-c', source]), 7)
            self.assertEqual(self.metadata.read_bytes(), before)
            self.assertTrue(GUARD.inherited_lease(self.snapshot))
        self.assertEqual(json.loads(marker.read_text()), {'lease': self.lease, 'root': str(self.owner)})
        self.assertFalse((self.snapshot / '.local/storage').exists())
        self.assertEqual(sorted(path.name for path in self.directory.iterdir()), [self.lease + '.json', self.lease + '.lock'])

    def test_nested_output_protection_stays_on_the_registered_owner_run(self):
        with self.held():
            self.assertEqual(GUARD.run(self.snapshot, 'nested', ['.local/browser-tests/' + 'd' * 32], [sys.executable, '-c', 'pass']), 0)
            self.assertTrue(GUARD.inherited_lease(self.snapshot))
        self.assertEqual(json.loads(self.metadata.read_text())['paths'], [self.run_name])
        self.assertFalse((self.snapshot / '.local/storage').exists())

    def test_nested_output_paths_cannot_escape_the_snapshot(self):
        for path in ['/tmp/other-run', '../other-run', '.local/../other-run']:
            with self.subTest(path=path), self.held():
                with self.assertRaises(ValueError):
                    GUARD.run(self.snapshot, 'nested', [path], [sys.executable, '-c', 'raise SystemExit(99)'])
        self.assertEqual(json.loads(self.metadata.read_text())['paths'], [self.run_name])

    def test_snapshot_run_must_be_exactly_registered_not_a_sibling_or_broad_parent(self):
        for paths in [[], ['.local/go-verification'], ['.local/go-verification/' + 'c' * 32], ['.local/browser-tests/' + self.run_id]]:
            with self.subTest(paths=paths):
                self.write_metadata(paths=paths)
                with self.held():
                    self.assertFalse(GUARD.inherited_lease(self.snapshot))

    def test_unregistered_snapshot_cannot_fall_back_to_unsafe_independent_admission(self):
        self.write_metadata(paths=[])
        marker = self.base / 'must-not-run'
        with self.held():
            result = GUARD.run(self.snapshot, 'migration', [], [sys.executable, '-c', 'from pathlib import Path; Path(' + repr(str(marker)) + ').touch()'])
        self.assertEqual(result, 125)
        self.assertFalse(marker.exists())
        self.assertTrue((self.snapshot / '.cache').is_symlink())

    def test_another_declared_owner_root_cannot_authorize_this_snapshot(self):
        other = self.base / 'other-owner'
        other.mkdir()
        with self.held(), patch.dict(os.environ, {'GATEGOLD_STORAGE_ROOT': str(other)}):
            self.assertFalse(GUARD.inherited_lease(self.snapshot))

    def test_outside_source_and_non_uuid_run_names_are_not_captures(self):
        for relative in ['outside/' + self.run_id, '.local/go-verification/not-a-uuid', '.local/go-verification/full-fixture', '.local/browser-tests/' + self.run_id + '/nested']:
            with self.subTest(relative=relative):
                snapshot = self.make_snapshot(relative)
                self.write_metadata(paths=[relative])
                with self.held():
                    self.assertFalse(GUARD.inherited_lease(snapshot))

    def test_a_source_alias_link_does_not_borrow_the_registered_real_snapshot_authority(self):
        alias = self.base / 'source-alias'
        alias.symlink_to(self.snapshot, target_is_directory=True)
        with self.held():
            self.assertFalse(GUARD.inherited_lease(alias))

    def test_linked_run_ancestor_is_not_a_real_capture(self):
        actual = self.owner / self.run_name
        moved = self.base / 'moved-run'
        actual.rename(moved)
        actual.symlink_to(moved, target_is_directory=True)
        with self.held():
            self.assertFalse(GUARD.inherited_lease(self.snapshot))

    def test_linked_owner_root_is_not_accepted_as_parent_authority(self):
        alias = self.base / 'owner-alias'
        alias.symlink_to(self.owner, target_is_directory=True)
        with self.held(), patch.dict(os.environ, {'GATEGOLD_STORAGE_ROOT': str(alias)}):
            self.assertFalse(GUARD.inherited_lease(alias / self.run_name / 'source'))

    def test_missing_or_linked_manifest_cannot_authorize_capture_sharing(self):
        manifest = self.snapshot / 'source-manifest.json'
        contents = manifest.read_text()
        manifest.unlink()
        with self.held():
            self.assertFalse(GUARD.inherited_lease(self.snapshot))
        external = self.base / 'manifest.json'
        external.write_text(contents)
        manifest.symlink_to(external)
        with self.held():
            self.assertFalse(GUARD.inherited_lease(self.snapshot))

    def test_a_directory_named_manifest_is_not_regular_provenance(self):
        manifest = self.snapshot / 'source-manifest.json'
        manifest.unlink()
        manifest.mkdir()
        with self.held():
            self.assertFalse(GUARD.inherited_lease(self.snapshot))

    def test_manifest_must_be_a_nonempty_safe_source_fingerprint_map(self):
        manifest = self.snapshot / 'source-manifest.json'
        for value in ['not json', '{}', '[]', json.dumps({'backend/go.mod': 'not-a-sha256'}), json.dumps({'../go.mod': 'a' * 64}), json.dumps({'/outside/go.mod': 'a' * 64})]:
            with self.subTest(value=value):
                manifest.write_text(value)
                with self.held():
                    self.assertFalse(GUARD.inherited_lease(self.snapshot))

    def test_missing_released_or_mismatched_owner_lock_does_not_share_authority(self):
        self.assertFalse(GUARD.inherited_lease(self.snapshot))
        self.lock.unlink()
        self.assertFalse(GUARD.inherited_lease(self.snapshot))
        self.lock.touch()
        for changes in [{'locked': False}, {'leaseId': 'c' * 32}, {'version': 2}]:
            with self.subTest(changes=changes):
                self.write_metadata(**changes)
                with self.held():
                    self.assertFalse(GUARD.inherited_lease(self.snapshot))

    def test_linked_metadata_or_lock_is_rejected_even_if_the_external_lock_is_held(self):
        external_metadata = self.base / 'metadata.json'
        self.metadata.rename(external_metadata)
        self.metadata.symlink_to(external_metadata)
        with self.held():
            self.assertFalse(GUARD.inherited_lease(self.snapshot))
        self.metadata.unlink()
        self.write_metadata()
        external_lock = self.base / 'lock'
        self.lock.rename(external_lock)
        self.lock.symlink_to(external_lock)
        with self.held():
            self.assertFalse(GUARD.inherited_lease(self.snapshot))

    def test_linked_owner_lease_metadata_directory_is_rejected(self):
        moved = self.base / 'lease-files'
        self.directory.rename(moved)
        self.directory.symlink_to(moved, target_is_directory=True)
        with self.held():
            self.assertFalse(GUARD.inherited_lease(self.snapshot))

    def test_malformed_owner_metadata_is_not_a_held_authority(self):
        for contents in ['not json', '[]', 'null', '{"locked": true}']:
            with self.subTest(contents=contents):
                self.metadata.write_text(contents)
                with self.held():
                    self.assertFalse(GUARD.inherited_lease(self.snapshot))

    def test_cli_does_not_resolve_a_linked_source_alias_into_an_authorized_capture(self):
        alias = self.base / 'linked-source'
        alias.symlink_to(self.snapshot, target_is_directory=True)
        marker = self.base / 'must-not-run-alias'
        with self.held():
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/with-project-storage.py'), '--root', str(alias), '--', sys.executable, '-c', 'from pathlib import Path; Path(' + repr(str(marker)) + ').touch()'], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 125)
        self.assertFalse(marker.exists())

    def test_cli_genuine_registered_snapshot_reuses_the_parent_lease(self):
        marker = self.base / 'allowed-child'
        with self.held():
            result = subprocess.run([sys.executable, str(ROOT / 'scripts/with-project-storage.py'), '--root', str(self.snapshot), '--', sys.executable, '-c', 'from pathlib import Path; Path(' + repr(str(marker)) + ').touch(); raise SystemExit(7)'], capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 7)
        self.assertTrue(marker.exists())
        self.assertFalse((self.snapshot / '.local/storage').exists())


if __name__ == '__main__':
    unittest.main()
