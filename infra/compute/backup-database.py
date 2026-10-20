#!/usr/bin/env python3
"""Back up only GateGoldJira using the DB VM's existing object-creator identity."""
import base64
import datetime
import hashlib
import http.client
import json
import os
from pathlib import Path
import subprocess
import tempfile
import urllib.parse
import urllib.request

BUCKET = 'homes-eg-2657-database-backups'


def main():
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix='gategoldjira-backup-') as directory:
        dump = Path(directory)/'gategoldjira.dump'
        with dump.open('wb') as output:
            subprocess.run(['runuser','-u','postgres','--','pg_dump','--format=custom','--dbname=gategoldjira'], stdout=output, check=True, timeout=600)
        subprocess.run(['pg_restore','--list',str(dump)], stdout=subprocess.DEVNULL, check=True)
        digest, md5 = hashlib.sha256(), hashlib.md5()
        with dump.open('rb') as source:
            for chunk in iter(lambda: source.read(1024*1024), b''):
                digest.update(chunk); md5.update(chunk)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        request = urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', headers={'Metadata-Flavor':'Google'})
        with opener.open(request, timeout=10) as response:
            token = json.load(response)['access_token']
        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
        name = f'postgresql/daily/gategoldjira-{timestamp}.dump'
        query = urllib.parse.urlencode({'uploadType':'media','name':name,'ifGenerationMatch':'0'})
        connection = http.client.HTTPSConnection('storage.googleapis.com', timeout=120)
        with dump.open('rb') as data:
            connection.request('POST',f'/upload/storage/v1/b/{BUCKET}/o?{query}',body=data,headers={'Authorization':'Bearer '+token,'Content-Type':'application/octet-stream','Content-Length':str(dump.stat().st_size)})
            response = connection.getresponse()
            body = response.read(65536)
            if response.status not in (200,201): raise RuntimeError('Private backup upload failed: HTTP '+str(response.status))
            receipt = json.loads(body)
        connection.close()
        if receipt.get('md5Hash') != base64.b64encode(md5.digest()).decode() or int(receipt.get('size',-1)) != dump.stat().st_size:
            raise RuntimeError('Uploaded backup size or checksum did not match.')
        result = {'bucket':BUCKET,'object':name,'bytes':dump.stat().st_size,'sha256':digest.hexdigest(),'generation':receipt['generation'],'completedAt':timestamp}
        Path('/var/lib/postgresql/gategoldjira-backup-last.json').write_text(json.dumps(result)+'\n')
        print(json.dumps(result))


if __name__ == '__main__': main()
