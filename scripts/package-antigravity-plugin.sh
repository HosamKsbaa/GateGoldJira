#!/usr/bin/env bash
# Build an installable local artifact. This does not publish or deploy anything.
set -euo pipefail
source "$(dirname "$0")/tool-env.sh"
cd "$GATEGOLD_ROOT/integrations/antigravity"
npm run build
python3 - "$GATEGOLD_ROOT" <<'PY'
import hashlib
import json
from pathlib import Path
import zipfile
import sys

root = Path(sys.argv[1])
integration = root / 'integrations/antigravity'
source = integration / 'dist/gategoldjira'
version = json.loads((integration / 'package.json').read_text())['version']
output = root / '.local/releases'
output.mkdir(parents=True, exist_ok=True)
archive = output / f'gategoldjira-antigravity-{version}.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as package:
    for path in sorted(source.rglob('*')):
        if path.is_file():
            package.write(path, Path('gategoldjira') / path.relative_to(source))
digest = hashlib.sha256(archive.read_bytes()).hexdigest()
archive.with_suffix('.zip.sha256').write_text(digest + '  ' + archive.name + '\n')
print('Created ' + str(archive))
print('Archive size: ' + str(archive.stat().st_size) + ' bytes')
import subprocess
subprocess.run([sys.executable, str(root / 'scripts/verify-antigravity-plugin-package.py'), str(archive)], check=True)
PY
