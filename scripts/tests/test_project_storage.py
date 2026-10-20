"""Storage policy regressions use temporary repositories, never real project cleanup."""
import contextlib
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'project-storage.py'
spec = importlib.util.spec_from_file_location('project_storage', SCRIPT)
storage = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = storage
spec.loader.exec_module(storage)


class ProjectStorage(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / 'repository'
        for marker in ['backend/go.mod', 'scripts/tool-env.sh', 'compose.dev.yaml']:
            file = self.root / marker
            file.parent.mkdir(parents=True, exist_ok=True)
            file.write_text('fixture')
        self.manager = storage.Storage(self.root)

    def tearDown(self):
        self.temporary.cleanup()

    def write(self, name, data=b'fixture'):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return path

    def json(self, name, value):
        return self.write(name, json.dumps(value).encode())

    def run_fixture(self, number, status='passed', age=0, base='.local/browser-tests', shard=None):
        name = base + '/' + f'{number:032x}'
        self.write(name + '/artifact', b'x' * 8192)
        report = {'suiteStatus': status, 'execution': {'fullSelection': True, 'listing': False, 'shard': shard}}
        file = self.json(name + '/use-case-results.json', report)
        stamp = time.time() - age
        os.utime(file, (stamp, stamp))
        os.utime(self.root / name, (stamp, stamp))
        return name

    def pins(self, *paths):
        self.json('.local/storage-pins.json', {'version': 1, 'paths': list(paths), 'reason': 'keep proof'})

    def cache(self, name='.cache/go-build'):
        self.write(name + '/data', b'x' * 16384)
        return self.root / name

    @contextlib.contextmanager
    def lease(self, number=1, paths=(), reservation=2*storage.GIB):
        lease = f'{number:032x}'
        path = self.manager.leases / (lease + '.lock')
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            self.manager.atomic_json(self.manager.leases / (lease + '.json'), {
                'version': 1, 'leaseId': lease, 'locked': True, 'pid': os.getpid(),
                'paths': list(paths), 'reservationBytes': reservation,
            })
            yield lease

    def test_unrecognized_root_is_refused(self):
        with self.assertRaises(storage.UnsafeStorage):
            storage.Storage(self.root.parent)

    def test_linked_managed_root_is_refused(self):
        outside = self.root.parent / 'outside'
        outside.mkdir()
        self.write('outside-marker')
        (self.root / '.cache').symlink_to(outside)
        with self.assertRaises(storage.UnsafeStorage):
            storage.Storage(self.root)
        self.assertTrue(outside.exists())

    def test_internal_link_is_not_followed_or_deleted(self):
        outside = self.root.parent / 'outside'
        outside.mkdir()
        sentinel = outside / 'keep'
        sentinel.write_bytes(b'x' * 200000)
        name = self.run_fixture(1, age=500)
        (self.root / name / 'external').symlink_to(outside, target_is_directory=True)
        os.utime(self.root / name, (time.time()-500, time.time()-500))
        self.run_fixture(2, age=200)
        self.run_fixture(3, age=100)
        size, _ = self.manager.size(self.root / name)
        self.assertLess(size, sentinel.stat().st_size)
        self.manager.maintain()
        self.assertFalse((self.root / name).exists())
        self.assertEqual(sentinel.stat().st_size, 200000)

    def test_nested_pin_protects_entire_run(self):
        name = self.run_fixture(1, age=500)
        self.run_fixture(2, age=200)
        self.run_fixture(3, age=100)
        self.pins(name + '/source/manifest.json')
        self.manager.maintain()
        self.assertTrue((self.root / name).exists())

    def test_ancestor_pin_protects_every_run(self):
        for number in range(5):
            self.run_fixture(number, age=100+number)
        self.pins('.local/browser-tests')
        self.assertEqual(self.manager.scan()['deletions'], [])

    def test_escaping_pin_is_refused_before_any_deletion(self):
        name = self.run_fixture(1)
        self.pins('../outside')
        with self.assertRaises(storage.UnsafeStorage):
            self.manager.maintain()
        self.assertTrue((self.root / name).exists())

    def test_retains_two_successes_and_one_failure_per_root(self):
        for base in storage.RUN_ROOTS:
            old = self.run_fixture(1, age=500, base=base)
            middle = self.run_fixture(2, age=200, base=base)
            newest = self.run_fixture(3, age=100, base=base)
            failed_old = self.run_fixture(4, 'failed', age=400, base=base)
            failed_new = self.run_fixture(5, 'failed', age=50, base=base)
            self.manager.maintain()
            self.assertFalse((self.root / old).exists())
            self.assertFalse((self.root / failed_old).exists())
            for kept in [middle, newest, failed_new]:
                self.assertTrue((self.root / kept).exists())

    def test_fresh_completed_shards_wait_for_their_future_merge(self):
        names = [self.run_fixture(number, age=60*number, shard={'current': number, 'total': 8})
                 for number in range(1, 7)]
        self.manager.maintain()
        self.assertTrue(all((self.root / name).exists() for name in names))

    def test_old_unmerged_shards_do_not_gain_permanent_retention(self):
        names = [self.run_fixture(number, age=90000+number, shard={'current': number, 'total': 8})
                 for number in range(1, 5)]
        self.manager.maintain()
        self.assertEqual(sum((self.root / name).exists() for name in names), 2)

    def test_latest_full_index_resolves_real_shard_index_dependencies(self):
        names = [self.run_fixture(number, age=90000+number) for number in range(1, 9)]
        indices = []
        for number, name in enumerate(names, 1):
            index = self.json(f'.local/coverage/final-v9-shard-{number}.json', {
                'status': 'passed', 'runDirectory': str(self.root / name)})
            indices.append(str(index))
        merged = '.local/browser-tests/full-v9-2026-10-20'
        self.write(merged + '/source-placeholder')
        self.json(merged + '/use-case-results.json', {
            'suiteStatus': 'passed', 'execution': {'fullSelection': True, 'listing': False, 'shard': None}})
        self.json(merged + '/shards.json', {'inputs': indices})
        (self.root / merged / 'source').symlink_to(self.root / names[0] / 'source')
        self.json('.local/coverage/full-v9.json', {'status': 'passed', 'runDirectory': str(self.root / merged)})
        self.manager.maintain()
        self.assertTrue(all((self.root / name).exists() for name in names))
        self.assertIn(merged, self.manager.latest_pins())

    def test_latest_passed_backend_index_protects_old_go_proof(self):
        old = self.run_fixture(1, age=500, base=storage.RUN_ROOTS[1])
        self.run_fixture(2, age=200, base=storage.RUN_ROOTS[1])
        self.run_fixture(3, age=100, base=storage.RUN_ROOTS[1])
        self.json('.local/coverage/backend-unit.json', {'status': 'passed', 'runDirectory': str(self.root / old)})
        self.manager.maintain()
        self.assertTrue((self.root / old).exists())

    def test_only_latest_full_index_is_automatically_protected(self):
        old = self.run_fixture(1, age=500)
        new = self.run_fixture(2, age=100)
        first = self.json('.local/coverage/full-old.json', {'status': 'passed', 'runDirectory': str(self.root / old)})
        second = self.json('.local/coverage/full-new.json', {'status': 'passed', 'runDirectory': str(self.root / new)})
        os.utime(first, (100, 100))
        os.utime(second, (200, 200))
        self.assertEqual(self.manager.latest_pins(), {new})

    def test_outside_shard_reference_is_refused(self):
        name = self.run_fixture(1)
        self.json(name + '/shards.json', {'inputs': [str(self.root.parent / 'outside')]})
        with self.assertRaises(storage.UnsafeStorage):
            self.manager.closure(name)

    def test_unknown_run_child_refuses_cleanup(self):
        self.write('.local/browser-tests/not-an-owned-run/keep')
        with self.assertRaises(storage.UnsafeStorage):
            self.manager.maintain()
        self.assertTrue((self.root / '.local/browser-tests/not-an-owned-run/keep').exists())

    def test_plan_cli_is_dry_even_with_stale_metadata(self):
        self.run_fixture(1, age=500)
        self.run_fixture(2, age=200)
        self.run_fixture(3, age=100)
        before = sorted(str(p.relative_to(self.root)) for p in self.root.rglob('*'))
        result = subprocess.run([sys.executable, str(SCRIPT), '--root', str(self.root), 'plan'],
                                capture_output=True, text=True, check=True)
        after = sorted(str(p.relative_to(self.root)) for p in self.root.rglob('*'))
        self.assertEqual(before, after)
        self.assertEqual(json.loads(result.stdout)['plannedDeletionCount'], 1)

    def test_oversized_caches_are_rebuildable_and_evicted_without_jobs(self):
        for name in storage.CACHE_ROOTS:
            self.cache(name)
        self.manager.limits.go_cache = self.manager.limits.binaries = 1
        result = self.manager.maintain()
        self.assertEqual(result['removedRunsOrCaches'], 2)
        self.assertTrue(all((self.root / name).is_dir() for name in storage.CACHE_ROOTS))
        self.assertTrue(all(not (self.root / name / 'data').exists() for name in storage.CACHE_ROOTS))

    def test_active_flock_blocks_cache_eviction_and_unscoped_run_pruning(self):
        self.cache()
        self.manager.limits.go_cache = 1
        for number in range(4):
            self.run_fixture(number, age=100+number)
        with self.lease():
            result = self.manager.maintain()
            self.assertEqual(result['activeJobs'], 1)
            self.assertTrue(result['violations'])
            self.assertTrue((self.root / '.cache/go-build/data').exists())
            self.assertEqual(len(list((self.root / '.local/browser-tests').iterdir())), 4)

    def test_released_flock_is_stale_regardless_of_pid_namespace(self):
        with self.lease() as lease:
            record = self.manager.leases / (lease + '.json')
            self.assertIn(lease, self.manager.lease_records()[0])
        self.assertIn(lease, self.manager.lease_records()[1])
        self.manager.maintain()
        self.assertFalse(record.exists())

    def test_pid_reuse_is_not_treated_as_live(self):
        identity = storage.process_identity(os.getpid())
        self.assertIsNotNone(identity['processStart'])
        identity['processStart'] = 'different'
        self.assertFalse(storage.pid_alive(identity))

    def test_inaccessible_pid_is_conservatively_live(self):
        record = {'pid': 123456, 'bootId': 'same', 'pidNamespace': 'same', 'processStart': 'old'}
        with patch.object(storage, 'process_identity', return_value={
                'pid': 123456, 'bootId': 'same', 'pidNamespace': 'same', 'processStart': None}), \
                patch.object(storage.os, 'kill', side_effect=PermissionError):
            self.assertTrue(storage.pid_alive(record))

    def test_begin_refuses_free_floor_and_creates_no_lease(self):
        limits = storage.Limits(free_floor=100, reservation=20)
        self.manager.limits = limits
        with patch.object(storage.shutil, 'disk_usage', return_value=shutil._ntuple_diskusage(1000, 881, 119)):
            result, code = self.manager.begin('a'*32, os.getpid(), 'test', [])
        self.assertEqual(code, 125)
        self.assertEqual(result['requiredFreeBytes'], 120)
        self.assertFalse((self.manager.leases / ('a'*32 + '.json')).exists())

    def test_begin_reserves_for_existing_jobs_and_enforces_job_count(self):
        self.manager.limits.free_floor = 100
        self.manager.limits.reservation = 20
        self.manager.limits.max_jobs = 1
        with self.lease(reservation=20), patch.object(
                storage.shutil, 'disk_usage', return_value=shutil._ntuple_diskusage(1000, 870, 130)):
            result, code = self.manager.begin('a'*32, os.getpid(), 'test', [])
        self.assertEqual(code, 125)
        self.assertEqual(result['requiredFreeBytes'], 140)
        self.assertTrue(any('job limit' in reason for reason in result['violations']))

    def test_existing_requested_run_is_protected_during_begin_cleanup(self):
        wanted = self.run_fixture(1, age=500)
        self.run_fixture(2, age=200)
        self.run_fixture(3, age=100)
        self.manager.limits.free_floor = self.manager.limits.reservation = 0
        result, code = self.manager.begin('a'*32, os.getpid(), 'test', [wanted])
        self.assertEqual(code, 0)
        self.assertTrue((self.root / wanted).exists())
        self.assertEqual(result['paths'], [wanted])

    def test_protect_requires_live_flock_and_safe_direct_run(self):
        path = '.local/browser-tests/' + 'b'*32
        with self.lease() as lease:
            self.assertEqual(self.manager.protect(lease, [path])['paths'], [path])
            with self.assertRaises(storage.UnsafeStorage):
                self.manager.protect(lease, ['.local/pictures'])
        with self.assertRaises(storage.UnsafeStorage):
            self.manager.protect(lease, [path])

    def test_end_is_idempotent_and_does_not_delete_runner_data(self):
        name = self.run_fixture(1)
        with self.lease(paths=[name]) as lease:
            self.manager.end(lease)
            self.manager.end(lease)
        self.assertTrue((self.root / name).exists())

    def test_runtime_hard_limits_return_125_without_cleaning(self):
        self.cache()
        self.manager.limits.runtime_go = 1
        result, code = self.manager.check()
        self.assertEqual(code, 125)
        self.assertTrue(result['violations'])
        self.assertTrue((self.root / '.cache/go-build/data').exists())

    def test_pin_quota_exhaustion_preserves_protected_proof(self):
        name = self.run_fixture(1)
        self.pins(name)
        self.manager.limits.runs = 1
        result = self.manager.maintain()
        self.assertTrue(result['violations'])
        self.assertTrue((self.root / name).exists())

    def test_changed_inode_is_refused_before_deletion(self):
        name = self.run_fixture(1)
        entry = self.manager.inventory()[0][0]
        shutil.rmtree(self.root / name)
        (self.root / name).symlink_to(self.root / 'backend', target_is_directory=True)
        with self.assertRaises(storage.UnsafeStorage):
            self.manager.remove(entry)
        self.assertTrue((self.root / 'backend/go.mod').exists())

    def test_persistent_app_data_and_databases_are_outside_scope(self):
        protected = ['.local/pictures/data', '.local/identity/key', '.local/backups/db.sql',
                     '.local/volumes/postgres/data', 'database.dump']
        for path in protected:
            self.write(path)
        self.manager.maintain()
        self.assertTrue(all((self.root / path).is_file() for path in protected))

    def test_cli_supplied_unheld_lock_cannot_register_job(self):
        result = subprocess.run([sys.executable, str(SCRIPT), '--root', str(self.root),
                                 'begin', '--lease', 'a'*32, '--kind', 'test'],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 125)
        self.assertTrue(json.loads(result.stdout)['refused'])


if __name__ == '__main__':
    unittest.main()
