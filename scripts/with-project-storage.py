#!/usr/bin/env python3
"""Run a heavy project command under a storage lease and a disk watchdog."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import uuid


def lease_directory(root):
    directory = root / '.local/storage/leases'
    current = root
    for part in ('.local', 'storage', 'leases'):
        current = current / part
        if current.is_symlink():
            raise ValueError('Storage metadata must not use symlinks.')
        current.mkdir(exist_ok=True)
    return directory


def inherited_lease(root):
    lease = os.environ.get('GATEGOLD_STORAGE_LEASE', '')
    if len(lease) != 32 or any(c not in '0123456789abcdef' for c in lease):
        return False
    owner_text = os.environ.get('GATEGOLD_STORAGE_ROOT', '')
    owner = Path(owner_text)
    if not owner.is_absolute() or str(owner.resolve()) != owner_text:
        return False
    captured_run = None
    if root != owner:
        try:
            relative = root.relative_to(owner)
        except ValueError:
            return False
        parts = relative.parts
        if (len(parts) != 4 or parts[0] != '.local' or parts[1] not in ('go-verification', 'browser-tests')
                or len(parts[2]) != 32 or any(c not in '0123456789abcdef' for c in parts[2])
                or parts[3] != 'source'
                or any((owner.joinpath(*parts[:index])).is_symlink() for index in range(1, 5))):
            return False
        manifest = root / 'source-manifest.json'
        if not manifest.is_file() or manifest.is_symlink():
            return False
        try:
            sources = json.loads(manifest.read_text())
        except (OSError, ValueError):
            return False
        if not isinstance(sources, dict) or not sources or any(
                not isinstance(name, str) or not name or Path(name).is_absolute() or '..' in Path(name).parts
                or not isinstance(digest, str) or len(digest) != 64
                or any(c not in '0123456789abcdef' for c in digest)
                for name, digest in sources.items()):
            return False
        captured_run = Path(*parts[:3]).as_posix()
    directory = owner / '.local/storage/leases'
    if any((owner / name).is_symlink() for name in ('.local', '.local/storage', '.local/storage/leases')):
        return False
    metadata, lock = directory / (lease + '.json'), directory / (lease + '.lock')
    if metadata.is_symlink() or lock.is_symlink() or not metadata.is_file():
        return False
    try:
        with lock.open('r+') as stream:
            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                value = json.loads(metadata.read_text())
                if not isinstance(value, dict):
                    return False
                return value.get('locked') is True and (captured_run is None or (
                    value.get('version') == 1 and value.get('leaseId') == lease
                    and isinstance(value.get('paths'), list) and captured_run in value['paths']))
    except (OSError, ValueError):
        pass
    return False


def stop_owned_group(process, grace=10):
    # Popen created this new session/group. The leader may have exited while
    # a compiler or browser descendant still owns the group and disk lease.
    def group_exists():
        try:
            os.killpg(process.pid, 0)
            return True
        except ProcessLookupError:
            return False

    if not group_exists():
        process.wait()
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    deadline = time.monotonic() + grace
    while group_exists() and time.monotonic() < deadline:
        process.poll()
        time.sleep(.025)
    if group_exists():
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
    process.wait()


def run(root, kind, paths, command, interval=15):
    if not command:
        raise ValueError('A command is required after --.')
    if inherited_lease(root):
        # The outer command owns admission, watchdog and the process group.
        if paths:
            owner = Path(os.environ['GATEGOLD_STORAGE_ROOT'])
            if owner != root:
                if any(Path(path).is_absolute() or '..' in Path(path).parts for path in paths):
                    raise ValueError('Captured commands may register only paths inside their owned source run.')
                # All nested outputs belong to the already registered run.
                paths = [Path(*root.relative_to(owner).parts[:3]).as_posix()]
            arguments = [sys.executable, str(owner / 'scripts/project-storage.py'), '--root', str(owner),
                         'protect', '--lease', os.environ['GATEGOLD_STORAGE_LEASE']]
            for path in paths:
                arguments.extend(['--path', path])
            subprocess.run(arguments, check=True, stdout=subprocess.DEVNULL)
        return subprocess.call(command)
    helper = root / 'scripts/project-storage.py'
    directory = lease_directory(root)
    lease = uuid.uuid4().hex
    lock = directory / (lease + '.lock')
    descriptor = os.open(lock, os.O_RDWR | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    fcntl.flock(descriptor, fcntl.LOCK_EX)
    base = [sys.executable, str(helper), '--root', str(root)]
    process, admitted, requested_signal = None, False, None

    def interrupted(number, _frame):
        nonlocal requested_signal
        requested_signal = number
        # A signal may interrupt Popen.wait while its waitpid lock is held.
        # Never re-enter poll/wait or a cleanup subprocess from that handler.

    previous = {number: signal.signal(number, interrupted) for number in (signal.SIGINT, signal.SIGTERM)}
    try:
        args = ['begin', '--lease', lease, '--pid', str(os.getpid()), '--kind', kind]
        for path in paths:
            args.extend(['--path', path])
        result = subprocess.run(base + args, capture_output=True, text=True)
        if result.returncode:
            print(result.stdout or result.stderr or 'Storage admission refused.', file=sys.stderr)
            return 125
        admitted = True
        if requested_signal:
            return 128 + requested_signal
        environment = os.environ.copy()
        environment.update(GATEGOLD_STORAGE_LEASE=lease, GATEGOLD_STORAGE_ROOT=str(root))
        process = subprocess.Popen(command, env=environment, start_new_session=True)
        next_check = time.monotonic() + interval
        while True:
            if requested_signal:
                stop_owned_group(process)
                return 128 + requested_signal
            try:
                # Observe cancellation promptly without running the disk scan
                # more often than the configured watchdog interval.
                status = process.wait(timeout=min(.1, max(0, next_check - time.monotonic())))
                return 128 + requested_signal if requested_signal else (status if status >= 0 else 128 - status)
            except subprocess.TimeoutExpired:
                if requested_signal or time.monotonic() < next_check:
                    continue
                result = subprocess.run(base + ['check'], capture_output=True, text=True)
                if result.returncode:
                    print('Storage watchdog stopped this command: ' + (result.stdout or result.stderr).strip(), file=sys.stderr)
                    stop_owned_group(process)
                    return 125
                next_check = time.monotonic() + interval
    finally:
        if process is not None:
            stop_owned_group(process)
        if admitted:
            result = subprocess.run(base + ['end', '--lease', lease], capture_output=True, text=True)
            if result.returncode:
                print('Storage lease cleanup needs attention: ' + (result.stderr or result.stdout).strip(), file=sys.stderr)
        os.close(descriptor)
        lock.unlink(missing_ok=True)
        for number, handler in previous.items():
            signal.signal(number, handler)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--kind', default='build')
    parser.add_argument('--path', action='append', default=[])
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    try:
        absolute_root = args.root.absolute()
        if any(path.is_symlink() for path in (absolute_root, *absolute_root.parents)):
            raise ValueError('Storage roots must not use symlink aliases.')
        return run(args.root.resolve(), args.kind, args.path, command)
    except (ValueError, OSError) as error:
        print('Storage guard: ' + str(error), file=sys.stderr)
        return 125


if __name__ == '__main__':
    sys.exit(main())
