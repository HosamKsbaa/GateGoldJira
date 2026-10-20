#!/usr/bin/env python3
"""Owner deployment for a separate GateGoldJira service; never replaces Homes."""
import base64
import fcntl
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import pwd
import re
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request

ROOT = Path('/opt/gategoldjira')
CONFIG = Path('/etc/gategoldjira')


def atomic(path, data, mode=0o644):
    temporary = path.with_name(path.name + '.next')
    with temporary.open('wb') as output:
        output.write(data if isinstance(data, bytes) else data.encode())
    temporary.chmod(mode)
    os.replace(temporary, path)


def command(*args, env=None):
    result = subprocess.run(args, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode:
        raise RuntimeError('Owner deployment command failed: ' + args[0])
    return result.stdout.strip()


def checked_bundle(path, checksum):
    info = path.lstat()
    if not path.is_file() or path.is_symlink() or info.st_size > 100 * 1024**2:
        raise ValueError('Release archive must be a bounded regular file.')
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != checksum:
        raise ValueError('Release archive checksum mismatch.')
    archive = tarfile.open(fileobj=io.BytesIO(data), mode='r:gz')
    members = archive.getmembers()
    if sum(member.size for member in members) > 200 * 1024**2:
        raise ValueError('Release expands beyond its bound.')
    for member in members:
        name = PurePosixPath(member.name)
        if name.is_absolute() or '..' in name.parts or not member.isfile() or str(name) != member.name:
            raise ValueError('Release members must be canonical regular files.')
        if member.name not in ('gategoldjira', 'manifest.json', 'source-manifest.json') and not member.name.startswith('site/'):
            raise ValueError('Unexpected release member.')
    names = [member.name for member in members]
    if len(set(names)) != len(names):
        raise ValueError('Duplicate release member.')
    if not {'gategoldjira','manifest.json','source-manifest.json','site/index.html','site/config.production.json'} <= set(names):
        raise ValueError('Required release files are missing.')
    manifest = json.load(archive.extractfile('manifest.json'))
    expected = {entry['path']: entry['sha256'] for entry in manifest['files']}
    if set(expected) != set(names) - {'manifest.json'}:
        raise ValueError('Release inventory mismatch.')
    for name, checksum in expected.items():
        if hashlib.sha256(archive.extractfile(name).read()).hexdigest() != checksum:
            raise ValueError('Release file checksum mismatch.')
    return archive, manifest


def prepare(config):
    release = config['release']
    archive, manifest = checked_bundle(Path(config['archive']), config['archiveSha256'])
    directory = ROOT / 'releases' / release
    if directory.exists():
        for member in archive.getmembers():
            target = directory/member.name
            if target.is_symlink() or not target.is_file() or target.read_bytes() != archive.extractfile(member).read():
                raise RuntimeError('An immutable release differs; refusing replacement.')
    directory.mkdir(parents=True, exist_ok=True)
    for member in archive.getmembers():
        target = directory / member.name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(archive.extractfile(member).read())
        target.chmod(0o755 if member.name == 'gategoldjira' else 0o644)
    if not manifest.get('sourceSha256'):
        raise RuntimeError('Release source identity is missing.')
    try:
        user = pwd.getpwnam('gategoldjira')
    except KeyError:
        command('useradd', '--system', '--user-group', '--home-dir', '/var/lib/gategoldjira', '--shell', '/usr/sbin/nologin', 'gategoldjira')
        user = pwd.getpwnam('gategoldjira')
    state = Path('/var/lib/gategoldjira')
    state.mkdir(mode=0o700, exist_ok=True)
    os.chown(state, user.pw_uid, user.pw_gid)
    CONFIG.mkdir(mode=0o755, exist_ok=True)
    identity = CONFIG / 'identity'
    identity.mkdir(mode=0o700, exist_ok=True)
    for name in ('signing-key.pem', 'accounts.json', 'cursor-secret'):
        data = base64.b64decode(config['privateFiles'][name], validate=True)
        path = identity / name
        if path.exists() and path.read_bytes() != data:
            raise RuntimeError('Existing production identity would change; refusing an ordinary deployment.')
        atomic(path, data, 0o600)
    atomic(CONFIG / 'db-ca.crt', base64.b64decode(config['privateFiles']['db-ca.crt'], validate=True), 0o644)
    origin = 'https://' + config['hostname']
    environment = {
        'APP_ENV': 'production', 'DEPLOYMENT_TARGET': 'vm', 'AUTH_MODE': 'password',
        'DATABASE_URL': config['runtimeDatabaseURL'], 'COMPANY_TIMEZONE': 'Africa/Cairo',
        'AUTH_ISSUER': origin+'/', 'REST_AUDIENCE': origin+'/api', 'MCP_AUDIENCE': origin+'/mcp',
        'AUTH_REQUIRED_SCOPE': 'gategoldjira:access', 'ALLOWED_ORIGINS': origin,
        'MCP_BROWSER_OAUTH_ENABLED': 'true', 'STORAGE_MODE': 'local',
        'LOCAL_PICTURE_DIRECTORY': '/var/lib/gategoldjira/pictures',
        'NOTIFICATION_APP_URL': origin, 'NOTIFICATION_WORKER_INTERVAL_SECONDS': '60',
    }
    contents = ''.join(key+'='+value+'\n' for key,value in environment.items())
    if (CONFIG/'runtime.env').exists() and (CONFIG/'runtime.env').read_text() != contents:
        raise RuntimeError('Existing runtime settings differ; review configuration before deployment.')
    atomic(CONFIG/'runtime.env', contents, 0o600)
    operator = dict(environment, DATABASE_URL=config['migrationDatabaseURL'],
        PASSWORD_SIGNING_KEY_FILE=str(identity/'signing-key.pem'), PASSWORD_CREDENTIALS_FILE=str(identity/'accounts.json'),
        CURSOR_SECRET_FILE=str(identity/'cursor-secret'), PATH='/usr/bin:/bin')
    binary = str(directory/'gategoldjira')
    command(binary, 'migrate', env=operator)
    if not (ROOT/'active.json').exists() and not (ROOT/'owner-bootstrap.json').exists():
        command(binary, 'bootstrap-owner', '--email', config['ownerEmail'], '--name', config['ownerName'],
                '--subject', 'password|'+config['ownerUsername'], env=operator)
        atomic(ROOT/'owner-bootstrap.json', json.dumps({'username':config['ownerUsername'],'email':config['ownerEmail']})+'\n', 0o600)
    atomic(Path('/etc/systemd/system/gategoldjira@.service'), config['systemdUnit'])
    (ROOT/'deployment').mkdir(exist_ok=True)
    atomic(ROOT/'deployment/Caddyfile.template', config['caddyTemplate'])
    command('systemctl', 'daemon-reload')
    print(json.dumps({'phase':'prepared', 'release':release, 'migrated':True, 'sourceSha256':manifest['sourceSha256']}))


def activate(config):
    release = config['release']
    old = json.loads((ROOT/'active.json').read_text()) if (ROOT/'active.json').exists() else None
    port = 21082 if old and old['port'] == 21081 else 21081
    directory = ROOT/'releases'/release
    manifest = json.loads((directory/'manifest.json').read_text())
    atomic(directory/'release.env', 'PORT='+str(port)+'\n')
    unit = 'gategoldjira@'+release+'.service'
    caddy = Path('/etc/caddy/Caddyfile')
    site = Path('/etc/caddy/gategoldjira.caddy')
    old_main = caddy.read_bytes()
    old_site = site.read_bytes() if site.exists() else None
    try:
        command('systemctl', 'start', unit)
        for _ in range(80):
            try:
                with urllib.request.urlopen('http://127.0.0.1:'+str(port)+'/readyz', timeout=2) as response:
                    if response.status == 200: break
            except OSError: pass
            time.sleep(.25)
        else: raise RuntimeError('Candidate API did not become ready.')
        contents = (ROOT/'deployment/Caddyfile.template').read_text().replace('@HOSTNAME@', config['hostname']).replace('@PORT@',str(port)).replace('@RELEASE@', release)
        atomic(site, contents)
        include = b'import /etc/caddy/gategoldjira.caddy'
        proposed = old_main if include in old_main else old_main.rstrip()+b'\n\n'+include+b'\n'
        candidate = directory/'Caddyfile.candidate'
        atomic(candidate, proposed)
        command('caddy', 'validate', '--config', str(candidate), '--adapter', 'caddyfile')
        atomic(caddy, proposed)
        command('systemctl', 'reload', 'caddy')
        for _ in range(60):
            try:
                with urllib.request.urlopen('https://'+config['hostname']+'/sign-in', timeout=5) as response:
                    if response.status == 200: break
            except OSError: pass
            time.sleep(1)
        else: raise RuntimeError('Trusted public HTTPS did not become ready.')
        for path in ('/readyz', '/internal', '/api/v1/auth/local-sign-in'):
            try:
                urllib.request.urlopen('https://'+config['hostname']+path, timeout=5).close()
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    continue
            raise RuntimeError('Public operational/fixture route denial failed.')
        current = {'release':release, 'port':port, 'sourceSha256':manifest['sourceSha256'],
                   'binarySha256':manifest['binarySha256'], 'origin':'https://'+config['hostname']}
        command('systemctl', 'enable', unit)
        if old: atomic(ROOT/'previous.json', json.dumps(old, indent=2)+'\n')
        atomic(ROOT/'active.json', json.dumps(current, indent=2)+'\n')
        if old:
            subprocess.run(['systemctl', 'disable', '--now', 'gategoldjira@'+old['release']+'.service'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(json.dumps(dict(current, phase='deployed', trustedHTTPS=True)))
    except Exception:
        atomic(caddy, old_main)
        if old_site is None: site.unlink(missing_ok=True)
        else: atomic(site, old_site)
        subprocess.run(['systemctl','reload','caddy'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        subprocess.run(['systemctl','disable','--now',unit], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        raise


def main():
    if os.geteuid() != 0: raise RuntimeError('Owner access is required.')
    config = json.load(sys.stdin)
    if not re.fullmatch(r'[a-z0-9][a-z0-9.-]{2,200}', config['hostname']) or not re.fullmatch(r'[a-z0-9-]{4,80}', config['release']):
        raise ValueError('Invalid fixed deployment identity.')
    ROOT.mkdir(parents=True, exist_ok=True)
    with Path('/run/homes-deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if config['phase'] == 'prepare': prepare(config)
        elif config['phase'] == 'activate': activate(config)
        else: raise ValueError('Unknown owner deployment phase.')


if __name__ == '__main__':
    main()
