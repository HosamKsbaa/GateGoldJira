#!/usr/bin/env python3
"""Reuse one verified pure-Go test backend across immutable source captures."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import shutil
import subprocess
import tempfile

VERSION = 1
TARGET_VARIABLES = (
    'GOOS', 'GOARCH', 'GOAMD64', 'GO386', 'GOARM', 'GOARM64', 'GOMIPS',
    'GOMIPS64', 'GOPPC64', 'GORISCV64', 'GOEXPERIMENT', 'GOFIPS140',
)
DEPENDENCY_VARIABLES = ('GOPROXY', 'GOSUMDB', 'GOPRIVATE', 'GONOPROXY', 'GONOSUMDB', 'GOINSECURE')


def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_digest(path):
    result = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            result.update(chunk)
    return result.hexdigest()


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate captured manifest entry.')
        result[key] = value
    return result


def backend_manifest(source):
    """Bind complete captured backend bytes, including embedded SQL/fixtures."""
    manifest_path = source / 'source-manifest.json'
    if manifest_path.is_symlink():
        raise ValueError('Captured source manifest cannot be a symlink.')
    manifest = json.loads(manifest_path.read_text(), object_pairs_hook=unique_object)
    if not isinstance(manifest, dict):
        raise ValueError('A captured source manifest is required.')
    backend = {}
    for name, checksum in manifest.items():
        if not isinstance(name, str):
            raise ValueError('Invalid captured source path.')
        relative = PurePosixPath(name)
        if relative.is_absolute() or '..' in relative.parts or '\\' in name or str(relative) != name:
            raise ValueError('Captured source paths must be canonical relative paths.')
        if not name.startswith('backend/'):
            continue
        if not isinstance(checksum, str) or not re.fullmatch('[0-9a-f]{64}', checksum):
            raise ValueError('Invalid captured backend checksum.')
        backend[name] = checksum
    if 'backend/go.mod' not in backend:
        raise ValueError('Captured backend/go.mod is required.')
    actual = {}
    if (source / 'backend').is_symlink():
        raise ValueError('Captured backend cannot be a symlink.')
    for path in (source / 'backend').rglob('*'):
        if path.is_symlink():
            raise ValueError('Captured backend symlinks are not supported.')
        if path.is_file():
            actual[path.relative_to(source).as_posix()] = file_digest(path)
        elif not path.is_dir():
            raise ValueError('Captured backend contains an unsupported file.')
    if actual != backend:
        raise ValueError('Captured backend inventory or file bytes do not match the manifest.')
    # A local replacement can read an arbitrary directory outside this bound
    # tree. Custom replacements require a separately designed dependency proof.
    if re.search(r'^\s*replace\b', (source / 'backend/go.mod').read_text(), re.MULTILINE):
        raise ValueError('Custom Go module replacements are not supported by the shared backend cache.')
    return dict(sorted(backend.items()))


def safe_directory(path):
    """Do not follow caller-controlled directory symlinks when publishing."""
    path = path.absolute()
    current = Path(path.anchor)
    for part in path.parts[1:]:
        if part in ('.', '..'):
            raise ValueError('Noncanonical output/cache path.')
        current /= part
        if current.is_symlink():
            raise ValueError('Output/cache directories cannot be symlinks.')
        current.mkdir(exist_ok=True)
        if not current.is_dir():
            raise ValueError('Output/cache parent is not a directory.')
    return path


def safe_output(output, source, cache):
    if '..' in output.parts:
        raise ValueError('Output traversal is not allowed.')
    output = output.absolute()
    if output.is_relative_to(source) or output.is_relative_to(cache):
        raise ValueError('Output must be outside captured sources and the shared backend cache.')
    safe_directory(output.parent)
    if output.is_symlink() or (output.exists() and not output.is_file()):
        raise ValueError('Output must be a regular nonsymlink file.')
    return output


def go_flags(text):
    flags = shlex.split(text)
    for flag in flags:
        if flag not in ('-trimpath', '-trimpath=true', '-buildvcs=false') and not re.fullmatch(r'-p=(?:[1-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-6])', flag):
            raise ValueError('Unsupported GOFLAGS; only -trimpath, -buildvcs=false and -p=1..256 are supported.')
    if len([flag for flag in flags if flag.startswith('-p=')]) > 1:
        raise ValueError('Repeated Go parallelism flags are not supported.')
    return sorted(set(flags))


def build_environment(root, executable, inherited):
    if inherited.get('CGO_ENABLED', '0') != '0':
        raise ValueError('Shared browser backends support CGO_ENABLED=0 only; race runners remain separate.')
    flags = go_flags(inherited.get('GOFLAGS', ''))
    env = {key: inherited[key] for key in ('HOME', 'TMPDIR', 'TEMP', 'TMP', 'SYSTEMROOT') if key in inherited}
    env.update({key: inherited[key] for key in TARGET_VARIABLES + DEPENDENCY_VARIABLES if key in inherited})
    if 'GODEBUG' in inherited:
        env['GODEBUG'] = inherited['GODEBUG']
    env.update({
        'PATH': str(executable.parent) + os.pathsep + os.defpath,
        'GOENV': 'off', 'GOWORK': 'off', 'GOTOOLCHAIN': 'local',
        'CGO_ENABLED': '0', 'GO111MODULE': 'on', 'GOTELEMETRY': 'off',
        'GOFLAGS': ' '.join(flags),
        'GOCACHE': str(safe_directory(root / '.cache/go-build')),
        'GOMODCACHE': str(safe_directory(root / '.cache/go-mod')),
        'GOPATH': str(safe_directory(root / '.tools/gopath')),
    })
    return env


def go_result(executable, arguments, source, env):
    result = subprocess.run([str(executable), *arguments], cwd=source / 'backend', env=env,
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode:
        # Proxy credentials and private tool output must not become metadata/logs.
        raise ValueError(f'Go backend command failed with exit status {result.returncode}.')
    return result.stdout.strip()


def toolchain_inputs(executable, source, env):
    version = go_result(executable, ['version'], source, env)
    effective = json.loads(go_result(executable, ['env', '-json', *TARGET_VARIABLES, 'GOROOT', 'GOTOOLDIR'], source, env))
    if not isinstance(effective, dict) or any(not isinstance(effective.get(key), str) for key in TARGET_VARIABLES + ('GOROOT', 'GOTOOLDIR')):
        raise ValueError('Go did not provide complete effective build settings.')
    goroot, tools = Path(effective['GOROOT']), Path(effective['GOTOOLDIR'])
    if not goroot.is_dir() or not tools.is_dir():
        raise ValueError('The selected Go toolchain directories do not exist.')
    # Bind tools AND standard-library sources, so a same-version local toolchain
    # alteration cannot silently reuse a previously compiled backend.
    files = {'go-executable': file_digest(executable)}
    for label, folder in [('tools', tools), ('stdlib', goroot / 'src'), ('lib', goroot / 'lib'), ('include', goroot / 'pkg/include')]:
        if folder.is_dir():
            for path in sorted(folder.rglob('*')):
                if path.is_file():
                    files[label + '/' + path.relative_to(folder).as_posix()] = file_digest(path)
    if (goroot / 'go.env').is_file():
        files['go.env'] = file_digest(goroot / 'go.env')
    return {'version': version, 'target': {key: effective[key] for key in TARGET_VARIABLES}, 'toolchainSha256': digest(encoded(files))}


def valid_cache(entry, key, inputs):
    if entry.is_symlink():
        raise ValueError('Shared backend cache entries cannot be symlinks.')
    if not entry.is_dir():
        return None
    binary, metadata = entry / 'backend', entry / 'metadata.json'
    if binary.is_symlink() or metadata.is_symlink() or not binary.is_file() or not metadata.is_file():
        return None
    try:
        data = json.loads(metadata.read_text())
        if data.get('version') != VERSION or data.get('key') != key or data.get('inputs') != inputs:
            return None
        if data.get('binarySha256') != file_digest(binary):
            return None
        if binary.stat().st_mode & 0o222 or metadata.stat().st_mode & 0o222:
            return None
        return data
    except (OSError, ValueError, AttributeError):
        return None


def remove_entry(entry):
    if entry.is_symlink():
        raise ValueError('Shared backend cache entries cannot be symlinks.')
    if entry.exists():
        if not entry.is_dir():
            raise ValueError('Unexpected shared backend cache object.')
        entry.chmod(0o700)
        shutil.rmtree(entry)


def build(source, output, root, coverage=False, go='go', inherited=None):
    source, root = source.resolve(strict=True), root.resolve(strict=True)
    cache = safe_directory(root / '.cache/test-backends')
    locks = safe_directory(cache / '.locks')
    output = safe_output(output, source, cache)
    executable = shutil.which(str(go))
    if not executable:
        raise ValueError('The selected Go executable was not found.')
    executable = Path(executable).resolve(strict=True)
    backend = backend_manifest(source)
    env = build_environment(root, executable, os.environ if inherited is None else inherited)
    tools = toolchain_inputs(executable, source, env)
    arguments = ['build', '-trimpath', '-mod=readonly', '-buildvcs=false']
    if coverage:
        arguments += ['-cover', '-covermode=atomic', '-coverpkg=./...']
    inputs = {'backendManifest': backend, 'backendManifestSha256': digest(encoded(backend)),
              'toolchain': tools, 'environmentSha256': digest(encoded(env)),
              'arguments': arguments, 'package': './cmd/gategoldjira', 'cgoEnabled': False}
    key = digest(encoded({'version': VERSION, 'inputs': inputs}))
    entry = cache / key
    descriptor = os.open(locks / (key + '.lock'), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        data = valid_cache(entry, key, inputs)
        reused = data is not None
        if data is None:
            staging = Path(tempfile.mkdtemp(prefix='.build-' + key + '-', dir=cache))
            try:
                binary = staging / 'backend'
                go_result(executable, [*arguments, '-o', str(binary), './cmd/gategoldjira'], source, env)
                if not binary.is_file() or binary.is_symlink():
                    raise ValueError('Go did not produce a regular backend binary.')
                if backend_manifest(source) != backend or toolchain_inputs(executable, source, env) != tools:
                    raise ValueError('Captured backend or toolchain changed during the build.')
                data = {'version': VERSION, 'key': key, 'inputs': inputs, 'binarySha256': file_digest(binary)}
                (staging / 'metadata.json').write_bytes(encoded(data))
                binary.chmod(0o555)
                (staging / 'metadata.json').chmod(0o444)
                remove_entry(entry)
                staging.rename(entry)
                entry.chmod(0o555)
            finally:
                if staging.exists():
                    shutil.rmtree(staging)
        if backend_manifest(source) != backend:
            raise ValueError('Captured backend changed before publication.')
        # A separate run copy allows launcher cleanup without altering the shared
        # immutable inode. Atomic replacement never follows an output symlink.
        output = safe_output(output, source, cache)
        descriptor, temporary = tempfile.mkstemp(prefix='.backend-', dir=output.parent)
        try:
            with os.fdopen(descriptor, 'wb') as target, (entry / 'backend').open('rb') as origin:
                shutil.copyfileobj(origin, target)
                target.flush()
                os.fsync(target.fileno())
            Path(temporary).chmod(0o555)
            if output.is_symlink():
                raise ValueError('Output became a symlink before publication.')
            os.replace(temporary, output)
        finally:
            Path(temporary).unlink(missing_ok=True)
        return {'reused': reused, 'key': key, 'binarySha256': data['binarySha256'],
                'metadataSha256': file_digest(entry / 'metadata.json'),
                'backendManifestSha256': inputs['backendManifestSha256']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--coverage', action='store_true')
    parser.add_argument('--go', default='go', help='Explicit Go executable; useful for isolated toolchain verification.')
    args = parser.parse_args()
    try:
        print(json.dumps(build(args.source, args.output, args.root, args.coverage, args.go), sort_keys=True))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(str(error)) from None
