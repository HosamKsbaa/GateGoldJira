"""Exercise admission, nesting and owned-process shutdown without large files."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('storage_watchdog', ROOT / 'scripts/with-project-storage.py')
GUARD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(GUARD)

HELPER = '''import fcntl,json,sys
from pathlib import Path
a=sys.argv[1:]; root=Path(a[1]); action=a[2]; opts=a[3:]
directory=root/'.local/storage/leases'; directory.mkdir(parents=True,exist_ok=True)
with (root/'actions').open('a') as out:out.write(action+'\\n')
lease=opts[opts.index('--lease')+1] if '--lease' in opts else ''
if action=='begin':
 if (root/'refuse').exists():sys.exit(125)
 with (directory/(lease+'.lock')).open('r+') as lock:
  try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB);sys.exit(3)
  except BlockingIOError:pass
 (directory/(lease+'.json')).write_text(json.dumps({'locked':True}))
 print(json.dumps({'leaseId':lease}))
elif action=='end':(directory/(lease+'.json')).unlink(missing_ok=True)
elif action=='check' and (root/'violate').exists():
 print(json.dumps({'violations':['fixture disk limit']}));sys.exit(125)
'''


class StorageWatchdogTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='gategold-storage-watchdog-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        (self.root / 'scripts').mkdir()
        (self.root / 'scripts/project-storage.py').write_text(HELPER)
        self.environment = patch.dict(os.environ, {'GATEGOLD_STORAGE_LEASE': '', 'GATEGOLD_STORAGE_ROOT': ''})
        self.environment.start()
        self.addCleanup(self.environment.stop)

    def run_command(self, source, interval=.05):
        return GUARD.run(self.root, 'fixture', [], [sys.executable, '-c', source], interval=interval)

    def actions(self):
        path = self.root / 'actions'
        return path.read_text().splitlines() if path.exists() else []

    def test_success_holds_lease_releases_metadata_and_preserves_exit_status(self):
        result = self.run_command('import os; assert os.environ["GATEGOLD_STORAGE_LEASE"]; raise SystemExit(7)')
        self.assertEqual(result, 7)
        self.assertEqual([action for action in self.actions() if action != 'check'], ['begin', 'end'])
        self.assertEqual(list((self.root / '.local/storage/leases').iterdir()), [])

    def test_refused_admission_never_starts_command(self):
        (self.root / 'refuse').touch()
        marker = self.root / 'must-not-exist'
        self.assertEqual(self.run_command('from pathlib import Path; Path(' + repr(str(marker)) + ').touch()'), 125)
        self.assertFalse(marker.exists())
        self.assertEqual(self.actions(), ['begin'])

    def test_watchdog_stops_only_its_owned_child_group(self):
        (self.root / 'violate').touch()
        marker = self.root / 'terminated'
        source = 'import signal,time,pathlib; signal.signal(signal.SIGTERM,lambda *_:(pathlib.Path(' + repr(str(marker)) + ').touch(),exit(0))); time.sleep(60)'
        self.assertEqual(self.run_command(source, interval=.15), 125)
        self.assertTrue(marker.exists())
        self.assertEqual(self.actions(), ['begin', 'check', 'end'])

    def test_nested_command_reuses_a_genuine_held_lease_and_protects_run(self):
        directory = GUARD.lease_directory(self.root)
        lease = 'a' * 32
        (directory / (lease + '.json')).write_text(json.dumps({'locked': True}))
        with (directory / (lease + '.lock')).open('w') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            with patch.dict(os.environ, {'GATEGOLD_STORAGE_LEASE': lease, 'GATEGOLD_STORAGE_ROOT': str(self.root)}):
                self.assertEqual(GUARD.run(self.root, 'nested', ['.local/browser-tests/' + 'b' * 32], [sys.executable, '-c', 'pass']), 0)
        self.assertEqual(self.actions(), ['protect'])

    def test_spoofed_or_released_inherited_lease_cannot_skip_admission(self):
        directory = GUARD.lease_directory(self.root)
        lease = 'a' * 32
        (directory / (lease + '.json')).write_text(json.dumps({'locked': True}))
        (directory / (lease + '.lock')).touch()
        with patch.dict(os.environ, {'GATEGOLD_STORAGE_LEASE': lease, 'GATEGOLD_STORAGE_ROOT': str(self.root)}):
            self.assertEqual(self.run_command('pass'), 0)
        self.assertEqual([action for action in self.actions() if action != 'check'], ['begin', 'end'])

    def test_signal_forwarding_cleans_lease_and_returns_signal_status(self):
        # A separate wrapper process receives SIGTERM; the test runner survives.
        marker = self.root / 'child-ready'
        source = 'from pathlib import Path; import time; Path(' + repr(str(marker)) + ').touch(); time.sleep(60)'
        wrapper = subprocess.Popen([sys.executable, str(ROOT / 'scripts/with-project-storage.py'), '--root', str(self.root), '--', sys.executable, '-c', source])
        try:
            import time
            deadline = time.monotonic() + 5
            while not marker.exists() and time.monotonic() < deadline:
                time.sleep(.01)
            self.assertTrue(marker.exists())
            wrapper.send_signal(signal.SIGTERM)
            self.assertEqual(wrapper.wait(timeout=5), 143)
        finally:
            if wrapper.poll() is None:
                wrapper.kill()
                wrapper.wait()
        self.assertEqual([action for action in self.actions() if action != 'check'], ['begin', 'end'])

    def test_owned_descendant_is_stopped_after_its_leader_has_exited(self):
        import time
        marker = self.root / 'descendant'
        descendant = 'import os,signal,time,pathlib; signal.signal(signal.SIGTERM,signal.SIG_IGN); pathlib.Path(' + repr(str(marker)) + ').write_text(str(os.getpid())); time.sleep(60)'
        parent = 'import subprocess,sys,time,pathlib; subprocess.Popen([sys.executable,"-c",' + repr(descendant) + ']); marker=pathlib.Path(' + repr(str(marker)) + ');\nwhile not marker.exists():time.sleep(.01)'
        leader = subprocess.Popen([sys.executable, '-c', parent], start_new_session=True)
        try:
            leader.wait(timeout=5)
            self.assertTrue(marker.exists())
            GUARD.stop_owned_group(leader, grace=.1)
            status = Path('/proc', marker.read_text(), 'stat')
            deadline = time.monotonic() + 2
            while status.exists() and status.read_text().split(') ', 1)[1][0] != 'Z' and time.monotonic() < deadline:
                time.sleep(.01)
            self.assertTrue(not status.exists() or status.read_text().split(') ', 1)[1][0] == 'Z')
        finally:
            try:os.killpg(leader.pid, signal.SIGKILL)
            except ProcessLookupError:pass
            leader.wait()

    def test_cancellation_during_process_construction_is_not_lost(self):
        original = subprocess.Popen

        def interrupted_spawn(*args, **kwargs):
            process = original(*args, **kwargs)
            if kwargs.get('start_new_session'):
                os.kill(os.getpid(), signal.SIGTERM)
            return process

        with patch.object(GUARD.subprocess, 'Popen', side_effect=interrupted_spawn):
            self.assertEqual(self.run_command('import time; time.sleep(60)'), 143)
        self.assertEqual(self.actions(), ['begin', 'end'])

    def test_symlink_metadata_and_empty_command_are_rejected(self):
        outside = self.root / 'outside'
        outside.mkdir()
        (self.root / '.local').symlink_to(outside, target_is_directory=True)
        with self.assertRaises(ValueError):self.run_command('pass')
        with self.assertRaises(ValueError):GUARD.run(self.root, 'fixture', [], [])
        self.assertEqual(list(outside.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
