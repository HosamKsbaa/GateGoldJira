#!/usr/bin/env bash
# Build an immutable review artifact; this command has no Cloud write actions.
set -euo pipefail
source "$(dirname "$0")/tool-env.sh"
source "$GATEGOLD_ROOT/scripts/storage-guard.sh"
gategold_guard release "$0" "$@"
cd "$GATEGOLD_ROOT"
mkdir -p .local/releases/backend-build
(cd backend && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o "$GATEGOLD_ROOT/.local/releases/backend-build/gategoldjira" ./cmd/gategoldjira)
python3 - <<'PY'
import hashlib,json,pathlib,datetime
root=pathlib.Path.cwd();binary=root/'.local/releases/backend-build/gategoldjira'
digest=hashlib.sha256(binary.read_bytes()).hexdigest();out=root/'.local/releases'/('backend-'+digest[:16]);out.mkdir(exist_ok=True)
(out/'gategoldjira').write_bytes(binary.read_bytes());(out/'gategoldjira').chmod(0o755)
files=[root/'backend/Dockerfile',root/'backend/go.mod',root/'backend/go.sum',*sorted((root/'backend/db/migrations').glob('*.sql'))]
manifest={'artifactId':digest[:16],'binarySha256':digest,'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'platform':'linux/amd64','files':[{'path':str(p.relative_to(root)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files],'containerDigest':None,'deploymentExecuted':False,'migrationMode':'additive up only; separate IAM identity'}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Prepared backend artifact: '+str(out));print('Registry image digest and target-specific canary remain pending; no Cloud action ran.')
PY
