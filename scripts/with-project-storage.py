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
    if os.environ.get('GATEGOLD_STORAGE_ROOT') != str(root):
        return False
    directory = root / '.local/storage/leases'
    if any((root / name).is_symlink() for name in ('.local', '.local/storage', '.local/storage/leases')):
        return False
    metadata, lock = directory / (lease + '.json'), directory / (lease + '.lock')
    if metadata.is_symlink() or lock.is_symlink() or not metadata.is_file():
        return False
    try:
        with lock.open('r+') as stream:
            try:
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return json.loads(metadata.read_text()).get('locked') is True
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
            arguments = [sys.executable, str(root / 'scripts/project-storage.py'), '--root', str(root),
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
        if process is not None:
            stop_owned_group(process)

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
        while True:
            if requested_signal:
                stop_owned_group(process)
                return 128 + requested_signal
            try:
                status = process.wait(timeout=interval)
                return 128 + requested_signal if requested_signal else (status if status >= 0 else 128 - status)
            except subprocess.TimeoutExpired:
                result = subprocess.run(base + ['check'], capture_output=True, text=True)
                if result.returncode:
                    print('Storage watchdog stopped this command: ' + (result.stdout or result.stderr).strip(), file=sys.stderr)
                    stop_owned_group(process)
                    return 125
    finally:
        if process is not None:
            stop_owned_group(process)
        for number, handler in previous.items():
            signal.signal(number, handler)
        if admitted:
            result = subprocess.run(base + ['end', '--lease', lease], capture_output=True, text=True)
            if result.returncode:
                print('Storage lease cleanup needs attention: ' + (result.stderr or result.stdout).strip(), file=sys.stderr)
        os.close(descriptor)
        lock.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--kind', default='build')
    parser.add_argument('--path', action='append', default=[])
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    try:
        return run(args.root.resolve(), args.kind, args.path, command)
    except (ValueError, OSError) as error:
        print('Storage guard: ' + str(error), file=sys.stderr)
        return 125


if __name__ == '__main__':
    sys.exit(main())
