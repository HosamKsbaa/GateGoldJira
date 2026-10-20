#!/usr/bin/env python3
"""Bound GateGoldJira's rebuildable caches and completed verification runs only."""
import argparse
from contextlib import contextmanager
from dataclasses import dataclass
import fcntl
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import socket
import stat
import sys
import time
import uuid

GIB = 1024**3
RUN = re.compile(r'(?:[0-9a-f]{32}|full-[A-Za-z0-9][A-Za-z0-9._-]{0,180})\Z')
LEASE = re.compile(r'[0-9a-f]{32}\Z')
RUN_ROOTS = ('.local/browser-tests', '.local/go-verification')
CACHE_ROOTS = ('.cache/go-build', '.cache/test-backends')


class UnsafeStorage(ValueError):
    pass


def require(condition, message):
    if not condition:
        raise UnsafeStorage(message)


def relative(value):
    path = PurePosixPath(value)
    require(isinstance(value, str) and value and not path.is_absolute() and
            '..' not in path.parts and '.' not in path.parts and str(path) == value,
            'Paths must be normalized project-relative names.')
    return value


def intersects(left, right):
    a, b = PurePosixPath(left).parts, PurePosixPath(right).parts
    return a[:len(b)] == b or b[:len(a)] == a


def run_path(value):
    value = relative(value)
    path = PurePosixPath(value)
    require(str(path.parent) in RUN_ROOTS and RUN.fullmatch(path.name),
            'Lease paths must name a direct owned verification run.')
    return value


def regular_json(path, maximum=64 * 1024 * 1024):
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and info.st_size <= maximum, 'Metadata must be a bounded regular file.')
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as source:
        opened = os.fstat(source.fileno())
        require((opened.st_dev, opened.st_ino) == (info.st_dev, info.st_ino),
                'Metadata changed while opening it.')
        return json.load(source)


def process_identity(pid):
    """An inaccessible process is unknown, never presumed dead."""
    try:
        boot = Path('/proc/sys/kernel/random/boot_id').read_text().strip()
        namespace = os.readlink('/proc/self/ns/pid')
    except OSError:
        boot, namespace = None, None
    try:
        text = Path('/proc', str(pid), 'stat').read_text()
        start = text[text.rfind(')') + 2:].split()[19]
        return {'pid': pid, 'bootId': boot, 'pidNamespace': namespace, 'processStart': start}
    except (OSError, IndexError):
        return {'pid': pid, 'bootId': boot, 'pidNamespace': namespace, 'processStart': None}


def pid_alive(record):
    if record.get('host') not in (None, socket.gethostname()):
        return True
    current = process_identity(record['pid'])
    if record.get('bootId') and current.get('bootId') and record['bootId'] != current['bootId']:
        return False
    if record.get('pidNamespace') != current.get('pidNamespace'):
        return True
    if current['processStart'] is not None:
        return record.get('processStart') in (None, current['processStart'])
    try:
        os.kill(record['pid'], 0)
        return True
    except ProcessLookupError:
        return False
    except (PermissionError, OSError):
        return True


@dataclass
class Limits:
    go_cache: int = 6 * GIB
    binaries: int = GIB
    runs: int = 12 * GIB
    free_floor: int = 10 * GIB
    reservation: int = 2 * GIB
    runtime_free: int = 5 * GIB
    runtime_go: int = 10 * GIB
    runtime_runs: int = 20 * GIB
    max_jobs: int = 4


@dataclass
class Entry:
    name: str
    size: int
    identity: tuple
    modified: float
    status: str = 'unknown'
    pending_shard: bool = False


class Storage:
    def __init__(self, root, limits=None):
        self.root = Path(root).absolute()
        self.limits = limits or Limits()
        require(self.root == self.root.resolve(), 'Project root cannot contain symbolic-link components.')
        for marker in ('backend/go.mod', 'scripts/tool-env.sh', 'compose.dev.yaml'):
            path = self.root / marker
            require(path.is_file() and not path.is_symlink(), 'Choose the actual GateGoldJira project root.')
        self.state = self.root / '.local/storage'
        self.leases = self.state / 'leases'
        for name in ('.local', '.cache', '.local/storage', '.local/storage/leases',
                     *RUN_ROOTS, *CACHE_ROOTS):
            self.safe_directory(name)

    def safe_directory(self, name):
        path = self.root
        for part in PurePosixPath(name).parts:
            path /= part
            if path.exists() or path.is_symlink():
                require(not path.is_symlink() and path.is_dir(), 'Managed roots must be real directories.')
        return path

    @contextmanager
    def lock(self, mutate):
        lock = self.state / 'maintenance.lock'
        if not mutate and not lock.exists():
            yield
            return
        self.safe_directory('.local/storage')
        if mutate:
            self.state.mkdir(parents=True, exist_ok=True, mode=0o700)
        flags = (os.O_RDWR | os.O_CREAT) if mutate else os.O_RDONLY
        fd = os.open(lock, flags | os.O_NOFOLLOW, 0o600)
        try:
            require(stat.S_ISREG(os.fstat(fd).st_mode), 'Maintenance lock must be regular.')
            fcntl.flock(fd, fcntl.LOCK_EX if mutate else fcntl.LOCK_SH)
            yield
        finally:
            os.close(fd)

    def atomic_json(self, path, value):
        self.safe_directory(str(path.parent.relative_to(self.root)))
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        require(not path.is_symlink(), 'Metadata links are not accepted.')
        temporary = path.with_name('.' + path.name + '.' + uuid.uuid4().hex)
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        try:
            with os.fdopen(fd, 'w') as target:
                json.dump(value, target, sort_keys=True)
                target.write('\n')
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)

    def held(self, lease):
        require(LEASE.fullmatch(lease), 'Invalid lease ID.')
        path = self.leases / (lease + '.lock')
        if not path.exists() and not path.is_symlink():
            return None
        fd = os.open(path, os.O_RDWR | os.O_NOFOLLOW)
        try:
            require(stat.S_ISREG(os.fstat(fd).st_mode), 'Lease lock must be regular.')
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return True
            fcntl.flock(fd, fcntl.LOCK_UN)
            return False
        finally:
            os.close(fd)

    def lease_records(self):
        active, stale = {}, []
        if not self.leases.exists():
            return active, stale
        for path in self.leases.iterdir():
            require(not path.is_symlink() and path.is_file(), 'Unexpected lease metadata child.')
            require(path.suffix in ('.json', '.lock') and LEASE.fullmatch(path.stem),
                    'Unknown lease metadata name.')
            if path.suffix != '.json':
                continue
            data = regular_json(path, 65536)
            require(data.get('version') == 1 and data.get('leaseId') == path.stem and
                    type(data.get('pid')) is int and data['pid'] > 1 and
                    type(data.get('reservationBytes')) is int and data['reservationBytes'] >= 0,
                    'Malformed lease metadata.')
            data['paths'] = [run_path(name) for name in data.get('paths', [])]
            alive = (self.held(path.stem) is not False) if data.get('locked') is True else pid_alive(data)
            if alive:
                active[path.stem] = data
            else:
                stale.append(path.stem)
        return active, stale

    def pins(self):
        path = self.root / '.local/storage-pins.json'
        if not path.exists() and not path.is_symlink():
            return set()
        data = regular_json(path, 1024 * 1024)
        require(data.get('version') == 1 and isinstance(data.get('paths'), list),
                'Pins must use version 1 and a relative paths list.')
        return {relative(name) for name in data['paths']}

    def owned_reference(self, value):
        path = Path(value)
        if not path.is_absolute():
            path = self.root / relative(value)
        require(path == path.absolute() and path.is_relative_to(self.root), 'Verification reference leaves the project.')
        return run_path(path.relative_to(self.root).as_posix())

    def dependency(self, value):
        path = Path(value)
        if not path.is_absolute():
            path = self.root / relative(value)
        require(path.is_relative_to(self.root), 'Verification dependency leaves the project.')
        name = path.relative_to(self.root).as_posix()
        if PurePosixPath(name).parent.as_posix() in RUN_ROOTS:
            return self.owned_reference(str(path))
        require(name.startswith('.local/coverage/') and path.suffix == '.json',
                'Shard references must name owned runs or coverage indices.')
        relative(name)
        self.safe_directory(path.parent.relative_to(self.root).as_posix())
        data = regular_json(path, 1024 * 1024)
        require(data.get('status') in ('passed', 'failed') and isinstance(data.get('runDirectory'), str),
                'Shard index must identify a completed owned run.')
        return self.owned_reference(data['runDirectory'])

    def closure(self, name):
        pending, protected = [run_path(name)], set()
        while pending:
            current = pending.pop()
            if current in protected:
                continue
            require(len(protected) < 128, 'Verification dependency closure is too large.')
            path = self.safe_directory(current)
            require(path.exists(), 'Latest verification dependency is missing.')
            protected.add(current)
            shards = path / 'shards.json'
            if shards.exists():
                data = regular_json(shards, 1024 * 1024)
                require(isinstance(data.get('inputs'), list) and len(data['inputs']) <= 64,
                        'Malformed verification shard dependencies.')
                pending += [self.dependency(item) for item in data['inputs']]
            source = path / 'source'
            if source.is_symlink():
                target = Path(os.path.abspath(source.parent / os.readlink(source)))
                require(target.name == 'source', 'Unknown verification source link.')
                pending.append(self.owned_reference(str(target.parent)))
        return protected

    def latest_pins(self):
        coverage = self.root / '.local/coverage'
        if not coverage.exists():
            return set()
        self.safe_directory('.local/coverage')
        candidates = list(coverage.glob('full-*.json')) + list(coverage.glob('browser-run*.json'))
        candidates += list(coverage.glob('complete-*/browser-run*.json'))
        full = []
        for index in candidates:
            data = regular_json(index, 1024 * 1024)
            if data.get('status') != 'passed' or not data.get('runDirectory'):
                continue
            name = self.owned_reference(data['runDirectory'])
            path = self.safe_directory(name)
            report_path = path / 'use-case-results.json'
            if not report_path.exists():
                continue
            report = regular_json(report_path)
            execution = report.get('execution', {})
            if (report.get('suiteStatus') == 'passed' and execution.get('fullSelection') is True
                    and execution.get('listing') is False and execution.get('shard') is None):
                full.append((index.stat().st_mtime_ns, name))
        protected = self.closure(max(full)[1]) if full else set()
        backend = coverage / 'backend-unit.json'
        if backend.exists():
            data = regular_json(backend, 1024 * 1024)
            if data.get('status') == 'passed':
                protected |= self.closure(self.owned_reference(data['runDirectory']))
        return protected

    def size(self, path):
        """Count allocated blocks through no-follow directory descriptors."""
        fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        first = os.fstat(fd)
        size, pending = first.st_blocks * 512, [fd]
        try:
            while pending:
                directory = pending.pop()
                try:
                    with os.scandir(directory) as entries:
                        for child in entries:
                            try:
                                info = child.stat(follow_symlinks=False)
                                size += info.st_blocks * 512
                                if stat.S_ISDIR(info.st_mode):
                                    require(info.st_dev == first.st_dev, 'Mounted filesystems are outside managed storage.')
                                    opened = os.open(child.name, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=directory)
                                    actual = os.fstat(opened)
                                    if (actual.st_dev, actual.st_ino) != (info.st_dev, info.st_ino):
                                        os.close(opened)
                                        raise UnsafeStorage('Storage entry changed during inventory.')
                                    pending.append(opened)
                                else:
                                    require(stat.S_ISREG(info.st_mode) or stat.S_ISLNK(info.st_mode),
                                            'Special files are not accepted in managed storage.')
                            except FileNotFoundError:
                                continue
                finally:
                    os.close(directory)
        finally:
            for directory in pending:
                os.close(directory)
        last = path.lstat()
        require((first.st_dev, first.st_ino) == (last.st_dev, last.st_ino),
                'Managed entry changed during inventory.')
        return size, (first.st_dev, first.st_ino)

    def inventory(self):
        runs, caches = [], []
        retired = self.retired_runs()
        for base in RUN_ROOTS:
            parent = self.safe_directory(base)
            if not parent.exists():
                continue
            for child in parent.iterdir():
                require(RUN.fullmatch(child.name) and not child.is_symlink() and child.is_dir(),
                        'Unknown child in owned verification-run root; cleanup refused.')
                size, identity = self.size(child)
                status, modified = 'unknown', child.stat().st_mtime
                for filename, key in [('result.json', 'status'), ('use-case-results.json', 'suiteStatus')]:
                    marker = child / filename
                    if marker.exists() or marker.is_symlink():
                        data = regular_json(marker)
                        status = data.get(key, 'unknown')
                        if status in ('timedout', 'interrupted'):
                            status = 'failed'
                        modified = max(modified, marker.stat().st_mtime)
                        break
                pending_shard = False
                report = child / 'use-case-results.json'
                if report.exists():
                    metadata = regular_json(report)
                    pending_shard = (metadata.get('execution', {}).get('shard') is not None
                                     and status in ('passed', 'failed')
                                     and time.time() - modified < 24 * 60 * 60)
                name = base + '/' + child.name
                record = retired.get(name)
                if record and identity == (record['device'], record['inode']):
                    status, pending_shard = 'retired', False
                runs.append(Entry(name, size, identity, modified, status, pending_shard))
        for base in CACHE_ROOTS:
            path = self.safe_directory(base)
            if path.exists():
                size, identity = self.size(path)
                caches.append(Entry(base, size, identity, path.stat().st_mtime))
        return runs, caches

    def scan(self, extra_pins=()):
        active, stale = self.lease_records()
        pins = self.pins() | self.latest_pins() | set(extra_pins)
        runs, caches = self.inventory()
        leased = {path for data in active.values() for path in data['paths']}
        unscoped = any(not data['paths'] for data in active.values())
        keep = pins | leased | {entry.name for entry in runs if entry.pending_shard}
        for base in RUN_ROOTS:
            available = [entry for entry in runs if str(PurePosixPath(entry.name).parent) == base
                         and not any(intersects(entry.name, pin) for pin in keep)]
            keep.update(entry.name for entry in sorted(
                (item for item in available if item.status == 'passed'), key=lambda item: item.modified, reverse=True)[:2])
            keep.update(entry.name for entry in sorted(
                (item for item in available if item.status == 'failed'), key=lambda item: item.modified, reverse=True)[:1])
        deletions = [entry for entry in runs if not unscoped and entry.status in ('passed', 'failed', 'retired') and
                     not any(intersects(entry.name, pin) for pin in keep)]
        for entry in caches:
            cap = self.limits.go_cache if entry.name == CACHE_ROOTS[0] else self.limits.binaries
            if not active and entry.size > cap and not any(intersects(entry.name, pin) for pin in pins):
                deletions.append(entry)
        return {'active': active, 'stale': stale, 'pins': pins, 'keep': keep,
                'runs': runs, 'caches': caches, 'deletions': sorted(deletions, key=lambda item: item.modified)}

    def retired_runs(self):
        path = self.state / 'retired-runs.json'
        if not path.exists() and not path.is_symlink():
            return {}
        data = regular_json(path, 1024 * 1024)
        require(data.get('version') == 1 and isinstance(data.get('entries'), dict) and len(data['entries']) <= 1024,
                'Retired runs require a bounded versioned audit record.')
        for name, entry in data['entries'].items():
            run_path(name)
            require(isinstance(entry, dict) and type(entry.get('device')) is int and type(entry.get('inode')) is int
                    and isinstance(entry.get('reason'), str) and 1 <= len(entry['reason']) <= 500,
                    'Malformed retired-run audit record.')
        return data['entries']

    def retire(self, paths, reason):
        """Record an explicit abandonment without rewriting historical results."""
        require(isinstance(reason, str) and 1 <= len(reason.strip()) <= 500, 'A bounded retirement reason is required.')
        selected = {run_path(name) for name in paths}
        require(selected and len(selected) <= 1024, 'Choose explicit owned runs to retire.')
        scan = self.scan()
        require(not scan['active'], 'Run retirement requires no active heavy jobs.')
        available = {entry.name: entry for entry in scan['runs']}
        require(selected <= available.keys(), 'A selected run is missing.')
        protected = set(scan['pins'])
        for entry in scan['runs']:
            if entry.name not in selected and any(intersects(entry.name, keep) for keep in scan['keep']):
                protected |= self.closure(entry.name)
        require(not any(intersects(name, pin) for name in selected for pin in protected),
                'Cannot retire pinned verification or a dependency of a retained run.')
        records = self.retired_runs()
        for name in selected:
            entry = available[name]
            require(entry.status in ('unknown', 'running', 'retired') or entry.pending_shard,
                    'Explicit retirement is limited to incomplete or unmerged shard runs.')
            records[name] = {'device': entry.identity[0], 'inode': entry.identity[1],
                             'reason': reason.strip(), 'retiredAt': time.time()}
        require(len(records) <= 1024, 'Retirement audit is full.')
        self.atomic_json(self.state / 'retired-runs.json', {'version': 1, 'entries': records})
        return {'version': 1, 'retiredRuns': sorted(selected), 'reason': reason.strip(), 'deleted': False}

    def summary(self, scan):
        free = shutil.disk_usage(self.root).free
        deleted = {entry.name for entry in scan['deletions']}
        retained_runs = sum(entry.size for entry in scan['runs'] if entry.name not in deleted)
        cache_sizes = {entry.name: entry.size for entry in scan['caches']}
        violations = []
        if retained_runs > self.limits.runs:
            violations.append('Protected/recent/incomplete verification runs exceed the retained-run soft budget.')
        for name, cap in [(CACHE_ROOTS[0], self.limits.go_cache), (CACHE_ROOTS[1], self.limits.binaries)]:
            if name not in deleted and cache_sizes.get(name, 0) > cap:
                violations.append('An active or pinned cache exceeds its soft budget: ' + name)
        return {
            'version': 1, 'activeJobs': len(scan['active']), 'staleLeases': len(scan['stale']),
            'freeBytes': free, 'cacheBytes': cache_sizes,
            'runBytes': sum(entry.size for entry in scan['runs']), 'retainedRunBytes': retained_runs,
            'protectedRunBytes': sum(entry.size for entry in scan['runs'] if any(intersects(entry.name, pin) for pin in scan['pins'])),
            'plannedDeletionCount': len(scan['deletions']),
            'plannedDeletionBytes': sum(entry.size for entry in scan['deletions']),
            'plannedDeletions': [{'path': item.name, 'bytes': item.size} for item in scan['deletions'][:64]],
            'deletionListTruncated': len(scan['deletions']) > 64, 'violations': violations,
        }

    def remove(self, entry):
        """Quarantine by atomic rename, verify the scanned inode, then fd-safe remove."""
        require(shutil.rmtree.avoids_symlink_attacks, 'Safe directory deletion is unavailable on this platform.')
        path = self.root / entry.name
        self.safe_directory(str(path.parent.relative_to(self.root)))
        info = path.lstat()
        require(stat.S_ISDIR(info.st_mode) and (info.st_dev, info.st_ino) == entry.identity,
                'Managed target changed before deletion.')
        trash = self.state / 'trash'
        self.safe_directory('.local/storage/trash')
        trash.mkdir(parents=True, exist_ok=True, mode=0o700)
        destination = trash / uuid.uuid4().hex
        os.rename(path, destination)
        moved = destination.lstat()
        if (moved.st_dev, moved.st_ino) != entry.identity:
            if not path.exists() and not path.is_symlink():
                os.rename(destination, path)
            raise UnsafeStorage('Managed target changed during quarantine; no deletion performed.')
        shutil.rmtree(destination)
        if entry.name in CACHE_ROOTS:
            path.mkdir(mode=0o700)

    def maintain(self, extra_pins=()):
        scan = self.scan(extra_pins)
        for entry in scan['deletions']:
            self.remove(entry)
        for lease in scan['stale']:
            (self.leases / (lease + '.json')).unlink()
            if self.held(lease) is False:
                (self.leases / (lease + '.lock')).unlink()
        result = self.summary(self.scan(extra_pins))
        result['removedRunsOrCaches'] = len(scan['deletions'])
        return result

    def begin(self, lease, pid, kind, paths):
        require(LEASE.fullmatch(lease), 'Lease ID must be 32 lowercase hex characters.')
        require(type(pid) is int and pid > 1, 'Lease owner must be a live runner PID.')
        require(re.fullmatch(r'[A-Za-z0-9_-]{1,64}', kind), 'Job kind must be a short public identifier.')
        paths = sorted({run_path(path) for path in paths})
        existing = self.leases / (lease + '.json')
        require(not existing.exists() and not existing.is_symlink(), 'A lease with this ID already exists.')
        locked = self.held(lease) is True
        identity = process_identity(pid)
        require(locked or identity['processStart'] is not None, 'An accessible owner or wrapper-held lease lock is required.')
        result = self.maintain(paths)
        active, _ = self.lease_records()
        needed = self.limits.free_floor + self.limits.reservation + sum(item['reservationBytes'] for item in active.values())
        if len(active) >= self.limits.max_jobs:
            result['violations'].append('Concurrent heavy-job limit reached.')
        if result['freeBytes'] < needed:
            result['violations'].append('Insufficient free disk for the configured floor plus all job reservations.')
        if result['violations']:
            result['requiredFreeBytes'] = needed
            return result, 125
        self.atomic_json(existing, {'version': 1, 'leaseId': lease, 'kind': kind, 'locked': locked,
                                   'paths': paths, 'reservationBytes': self.limits.reservation,
                                   'createdAt': time.time(), 'host': socket.gethostname(), **identity})
        return {'version': 1, 'leaseId': lease, 'locked': locked, 'paths': paths,
                'reservationBytes': self.limits.reservation}, 0

    def protect(self, lease, paths):
        require(LEASE.fullmatch(lease), 'Invalid lease ID.')
        path = self.leases / (lease + '.json')
        data = regular_json(path, 65536)
        require(data.get('leaseId') == lease and data.get('locked') is True and self.held(lease) is True,
                'Protect requires the existing live wrapper-held lease.')
        data['paths'] = sorted({*data.get('paths', []), *(run_path(name) for name in paths)})
        self.atomic_json(path, data)
        return {'version': 1, 'leaseId': lease, 'paths': data['paths']}

    def end(self, lease):
        require(LEASE.fullmatch(lease), 'Invalid lease ID.')
        path = self.leases / (lease + '.json')
        if path.exists() or path.is_symlink():
            regular_json(path, 65536)
            path.unlink()
        if self.held(lease) is False:
            (self.leases / (lease + '.lock')).unlink()
        return {'version': 1, 'leaseId': lease, 'ended': True}

    def check(self):
        scan = self.scan()
        result = self.summary(scan)
        result['violations'] = []
        if result['freeBytes'] < self.limits.runtime_free:
            result['violations'].append('Runtime free-disk floor reached.')
        if result['cacheBytes'].get(CACHE_ROOTS[0], 0) > self.limits.runtime_go:
            result['violations'].append('Runtime Go-cache hard limit reached.')
        if result['runBytes'] > self.limits.runtime_runs:
            result['violations'].append('Runtime retained-run hard limit reached; pins remain protected.')
        return result, 125 if result['violations'] else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    for name, value in [('go-cache', 6*GIB), ('test-backends', GIB), ('runs', 12*GIB),
                        ('free-floor', 10*GIB), ('reservation', 2*GIB), ('runtime-free', 5*GIB),
                        ('runtime-go', 10*GIB), ('runtime-runs', 20*GIB)]:
        parser.add_argument('--' + name + '-bytes', type=int, default=value)
    parser.add_argument('--max-jobs', type=int, default=4)
    sub = parser.add_subparsers(dest='command', required=True)
    for name in ['plan', 'maintain', 'check']:
        sub.add_parser(name)
    begin = sub.add_parser('begin')
    begin.add_argument('--lease')
    begin.add_argument('--pid', type=int, default=os.getppid())
    begin.add_argument('--kind', required=True)
    begin.add_argument('--path', action='append', default=[])
    for name in ['end', 'protect']:
        command = sub.add_parser(name)
        command.add_argument('--lease', required=True)
        if name == 'protect':
            command.add_argument('--path', action='append', required=True)
    retire = sub.add_parser('retire')
    retire.add_argument('--path', action='append', required=True)
    retire.add_argument('--reason', required=True)
    args = parser.parse_args()
    values = [args.go_cache_bytes, args.test_backends_bytes, args.runs_bytes,
              args.free_floor_bytes, args.reservation_bytes, args.runtime_free_bytes,
              args.runtime_go_bytes, args.runtime_runs_bytes, args.max_jobs]
    require(all(value >= 0 for value in values) and args.max_jobs > 0, 'Storage budgets must be nonnegative.')
    limits = Limits(*values)
    storage = Storage(args.root, limits)
    mutating = args.command not in ['plan', 'check']
    with storage.lock(mutating):
        code = 0
        if args.command == 'plan':
            result = storage.summary(storage.scan())
        elif args.command == 'maintain':
            result = storage.maintain()
            code = 125 if result['violations'] else 0
        elif args.command == 'check':
            result, code = storage.check()
        elif args.command == 'begin':
            if args.lease is not None:
                require(storage.held(args.lease) is True, 'A supplied lease ID requires the wrapper-held flock.')
            result, code = storage.begin(args.lease or uuid.uuid4().hex, args.pid, args.kind, args.path)
        elif args.command == 'protect':
            result = storage.protect(args.lease, args.path)
        elif args.command == 'retire':
            result = storage.retire(args.path, args.reason)
        else:
            result = storage.end(args.lease)
    print(json.dumps(result, sort_keys=True))
    return code


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (UnsafeStorage, OSError, ValueError, KeyError, TypeError) as error:
        print(json.dumps({'version': 1, 'violations': [str(error)], 'refused': True}), file=sys.stdout)
        sys.exit(125)
