#!/usr/bin/env python3
"""Deploy a reviewed, already-built archive through existing owner/IAP access."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import urllib.parse

PROJECT = 'homes-eg-2657'
ACCOUNT = 'hosamchakasba@gmail.com'
ZONE = 'europe-west1-b'


def cli(*args):
    return subprocess.check_output(['gcloud',*args,'--project='+PROJECT,'--account='+ACCOUNT],text=True).strip()


class Remote:
    def __init__(self, name, username, key):
        self.name = name
        identity = cli('compute','instances','describe',name,'--zone='+ZONE,'--format=value(id)')
        proxy = 'gcloud compute start-iap-tunnel '+name+' 22 --listen-on-stdin --project='+PROJECT+' --zone='+ZONE+' --account='+ACCOUNT+' --verbosity=error'
        self.ssh = ['ssh','-i',str(key),'-o','BatchMode=yes','-o','IdentitiesOnly=yes','-o','StrictHostKeyChecking=yes',
                    '-o','UserKnownHostsFile='+str(Path.home()/'.ssh/google_compute_known_hosts'),'-o','HostKeyAlias=compute.'+identity,
                    '-o','ProxyCommand='+proxy,username+'@'+name]

    def python(self, source, payload, binary=False):
        encoded = base64.b64encode(source.encode()).decode()
        command = 'sudo -n python3 -c '+shlex.quote("import base64;exec(base64.b64decode('"+encoded+"'))")
        data = payload if binary else json.dumps(payload).encode()
        result = subprocess.run([*self.ssh,command],input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if result.returncode:
            # Keep diagnostics private. Payloads and secrets never enter arguments/logs.
            error = Path(os.environ['GATEGOLD_DEPLOY_PRIVATE'])/(self.name+'-error.log')
            error.write_bytes(result.stderr);error.chmod(0o600)
            raise RuntimeError('Remote step failed on '+self.name+'; private diagnostics: '+str(error))
        return result.stdout.decode().strip()


def database_url(role, password):
    return 'postgres://'+role+':'+urllib.parse.quote(password,safe='')+'@homes-db.europe-west1-b.c.homes-eg-2657.internal/gategoldjira?sslmode=verify-full&sslrootcert=/etc/gategoldjira/db-ca.crt'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive',type=Path,required=True)
    parser.add_argument('--private',type=Path,required=True)
    parser.add_argument('--evidence',type=Path,required=True)
    parser.add_argument('--ssh-key',type=Path,required=True)
    parser.add_argument('--username',default='hosamchakasba_gmail_com')
    args = parser.parse_args()
    source = Path(__file__).resolve().parent
    args.evidence.mkdir(parents=True,exist_ok=True)
    os.environ['GATEGOLD_DEPLOY_PRIVATE'] = str(args.private)
    settings = json.loads((args.private/'deployment.json').read_text())
    archive = args.archive.read_bytes()
    checksum = hashlib.sha256(archive).hexdigest()
    web = Remote('homes-web',args.username,args.ssh_key)
    database = Remote('homes-db',args.username,args.ssh_key)
    if not (args.evidence/'database-provisioned.json').exists():
        print('Creating the isolated GateGoldJira database and roles.',flush=True)
        result = database.python((source/'provision-database.py').read_text(),settings)
        (args.evidence/'database-provisioned.json').write_text(result+'\n')
    print('Uploading the verified immutable release.',flush=True)
    upload = '''import hashlib,json,os,shutil,sys
from pathlib import Path
data=sys.stdin.buffer.read(100*1024**2+1)
if len(data)>100*1024**2 or shutil.disk_usage('/').free < 1024**3+3*len(data): raise RuntimeError('Release size or web VM free-space floor refused')
directory=Path('/var/tmp/gategoldjira');directory.mkdir(mode=0o700,exist_ok=True)
path=directory/(hashlib.sha256(data).hexdigest()+'.tar.gz')
path.write_bytes(data);path.chmod(0o600)
print(json.dumps({'archive':str(path)}))'''
    staged = json.loads(web.python(upload,archive,binary=True))
    payload = dict(settings,phase='prepare',archive=staged['archive'],archiveSha256=checksum,
                   runtimeDatabaseURL=database_url('gategoldjira_app',settings['runtimePassword']),
                   migrationDatabaseURL=database_url('gategoldjira_migrator',settings['migrationPassword']),
                   systemdUnit=(source/'gategoldjira@.service').read_text(),caddyTemplate=(source/'Caddyfile.template').read_text())
    print('Applying schema migrations and preparing the unprivileged API service.',flush=True)
    result = web.python((source/'install-web.py').read_text(),payload)
    (args.evidence/'web-prepared.json').write_text(result+'\n')
    print('Applying the separate runtime role grants and configuring private database backups.',flush=True)
    grants = (source.parent/'sql/runtime-grants.sql').read_text()
    configure = '''import json,subprocess,sys
from pathlib import Path
c=json.load(sys.stdin)
result=subprocess.run(['runuser','-u','postgres','--','psql','-X','-q','-v','ON_ERROR_STOP=1','-v','runtime_db_user=gategoldjira_app','--dbname=gategoldjira'],input=c['grants'],text=True,capture_output=True)
if result.returncode: raise RuntimeError('Runtime privilege setup failed')
files={'/usr/local/sbin/gategoldjira-backup-database':c['backup'],'/etc/systemd/system/gategoldjira-database-backup.service':c['service'],'/etc/systemd/system/gategoldjira-database-backup.timer':c['timer']}
for name,data in files.items():
 p=Path(name);p.write_text(data);p.chmod(0o755 if name.startswith('/usr/local/sbin/') else 0o644)
subprocess.run(['systemctl','daemon-reload'],check=True)
subprocess.run(['systemctl','enable','--now','gategoldjira-database-backup.timer'],check=True,capture_output=True)
subprocess.run(['systemctl','start','gategoldjira-database-backup.service'],check=True,capture_output=True)
print(Path('/var/lib/postgresql/gategoldjira-backup-last.json').read_text())'''
    result = database.python(configure,{'grants':grants,'backup':(source/'backup-database.py').read_text(),
            'service':(source/'gategoldjira-database-backup.service').read_text(),'timer':(source/'gategoldjira-database-backup.timer').read_text()})
    (args.evidence/'database-backup.json').write_text(result+'\n')
    print('Checking candidate readiness and switching only the GateGoldJira HTTPS site.',flush=True)
    result = web.python((source/'install-web.py').read_text(),dict(settings,phase='activate'))
    (args.evidence/'deployment.json').write_text(result+'\n')
    print(result,flush=True)


if __name__ == '__main__': main()
