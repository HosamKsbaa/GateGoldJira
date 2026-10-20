"""Owner deployment archive checks use local temporary files only."""
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('vm_web_install', ROOT/'infra/compute/install-web.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class ReleaseArchive(unittest.TestCase):
    def archive(self, directory, extra=None):
        files = {'gategoldjira':b'executable','source-manifest.json':b'{}','site/index.html':b'page','site/config.production.json':b'{}'}
        if extra: files.update(extra)
        files['manifest.json'] = json.dumps({'files':[{'path':name,'sha256':hashlib.sha256(data).hexdigest()} for name,data in files.items()]}).encode()
        path = Path(directory)/'release.tar.gz'
        with tarfile.open(path,'w:gz') as archive:
            for name,data in files.items():
                info = tarfile.TarInfo(name);info.size=len(data);archive.addfile(info,io.BytesIO(data))
        return path,hashlib.sha256(path.read_bytes()).hexdigest()

    def test_exact_secret_free_inventory_is_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            path,digest=self.archive(directory)
            archive,manifest=installer.checked_bundle(path,digest)
            self.assertEqual(len(manifest['files']),4)
            archive.close()

    def test_checksum_traversal_and_private_configuration_are_refused(self):
        for extra in [{'../outside':b'no'},{'runtime.env':b'private'},{'/etc/secret':b'no'}]:
            with self.subTest(extra=list(extra)), tempfile.TemporaryDirectory() as directory:
                path,digest=self.archive(directory,extra)
                with self.assertRaises(ValueError):installer.checked_bundle(path,digest)
        with tempfile.TemporaryDirectory() as directory:
            path,_=self.archive(directory)
            with self.assertRaises(ValueError):installer.checked_bundle(path,'0'*64)

    def check_activation_rollback(self, fail_validation):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);app=root/'app';etc=root/'etc'
            (app/'releases/new-release').mkdir(parents=True);(app/'deployment').mkdir();etc.mkdir()
            (app/'releases/new-release/manifest.json').write_text('{}')
            (app/'deployment/Caddyfile.template').write_text('@HOSTNAME@ @PORT@ @RELEASE@')
            previous={'release':'old-release','port':21081}
            (app/'active.json').write_text(json.dumps(previous))
            (etc/'Caddyfile').write_text('unchanged Homes routing\n')
            (etc/'gategoldjira.caddy').write_text('old GateGoldJira routing\n')
            def paths(value):
                if str(value).startswith('/etc/caddy/'):
                    return etc/Path(value).name
                return Path(value)
            def command(*args,**kwargs):
                if fail_validation and args[0]=='caddy':raise RuntimeError('candidate rejected')
                return ''
            class Ready:
                status=200
                def __enter__(self):return self
                def __exit__(self,*args):pass
                def close(self):pass
            with patch.object(installer,'ROOT',app),patch.object(installer,'Path',paths),patch.object(installer,'command',command),patch.object(installer.urllib.request,'urlopen',return_value=Ready()),patch.object(installer.subprocess,'run') as run:
                with self.assertRaises(RuntimeError):installer.activate({'release':'new-release','hostname':'jira.example.test'})
                self.assertTrue(any(call.args[0]==['systemctl','disable','--now','gategoldjira@new-release.service'] for call in run.call_args_list))
            self.assertEqual((etc/'Caddyfile').read_text(),'unchanged Homes routing\n')
            self.assertEqual((etc/'gategoldjira.caddy').read_text(),'old GateGoldJira routing\n')
            self.assertEqual(json.loads((app/'active.json').read_text()),previous)

    def test_failed_caddy_validation_restores_configuration_and_previous_state(self):
        self.check_activation_rollback(fail_validation=True)

    def test_public_operational_route_exposure_rolls_back_candidate(self):
        self.check_activation_rollback(fail_validation=False)


if __name__ == '__main__': unittest.main()
