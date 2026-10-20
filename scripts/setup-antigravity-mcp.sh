#!/usr/bin/env bash
# Configure the tested stdio OAuth proxy without storing a bearer token.
set -euo pipefail
source "$(dirname "$0")/tool-env.sh"
cd "$GATEGOLD_ROOT"
python3 - "$GATEGOLD_ROOT" <<'PY'
import datetime
import json
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.request
import sys
root = Path(sys.argv[1])
endpoint = 'http://localhost:21080/mcp'
try:
    urllib.request.urlopen(endpoint, timeout=10)
    raise SystemExit('The MCP endpoint unexpectedly accepted an unauthenticated request.')
except urllib.error.HTTPError as error:
    if error.code != 401:
        raise SystemExit('Expected an authenticated MCP endpoint before configuring OAuth.')
with urllib.request.urlopen('http://localhost:21080/.well-known/oauth-protected-resource/mcp', timeout=10) as response:
    resource = json.load(response)
with urllib.request.urlopen('http://localhost:21080/.well-known/oauth-authorization-server/oauth', timeout=10) as response:
    discovery = json.load(response)
assert resource['resource'] == endpoint
assert resource['authorization_servers'] == ['http://localhost:21080/oauth']
assert discovery['issuer'] == resource['authorization_servers'][0]
assert 'S256' in discovery['code_challenge_methods_supported']
assert 'none' in discovery['token_endpoint_auth_methods_supported']
paths = [Path.home() / '.gemini/config/mcp_config.json', Path.home() / '.gemini/antigravity-ide/mcp_config.json']
workspace = root / '.agents/mcp_config.json'
if workspace.exists() and 'gategoldjira' in json.loads(workspace.read_text()).get('mcpServers', {}): paths.append(workspace)
backup_dir = root / '.local/antigravity'
backup_dir.mkdir(parents=True, exist_ok=True)
backup_dir.chmod(0o700)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
seen = set()
for index, original in enumerate(paths):
    path = original.resolve()
    if path in seen: continue
    seen.add(path)
    config = json.loads(path.read_text()) if path.exists() else {}
    servers = config.setdefault('mcpServers', {})
    previous = servers.get('gategoldjira', {})
    if previous.get('serverUrl', endpoint) != endpoint:
        raise SystemExit('A different GateGoldJira endpoint is configured; it was not replaced.')
    if previous.get('command') and (previous['command'] != 'npx' or endpoint not in previous.get('args', [])):
        raise SystemExit('A different GateGoldJira command is configured; it was not replaced.')
    if path.exists():
        backup = backup_dir / f'before-proxy-oauth-{stamp}-{index}.json'
        backup.write_bytes(path.read_bytes())
        backup.chmod(0o600)
    entry = {key: value for key, value in previous.items() if key in ('disabled', 'disabledTools')}
    entry['command'] = 'npx'
    entry['args'] = [
        '-y', 'mcp-remote@0.15.1', endpoint,
        '--transport', 'http-only', '--host', '127.0.0.1',
        '--resource', endpoint,
        '--static-oauth-client-info', json.dumps({'client_id': 'gategoldjira-antigravity'}, separators=(',', ':')),
        '--static-oauth-client-metadata', json.dumps({'scope': 'gategoldjira:access', 'token_endpoint_auth_method': 'none'}, separators=(',', ':')),
        '--auth-timeout', '180',
    ]
    servers['gategoldjira'] = entry
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.mcp-oauth-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as file:
            json.dump(config, file, indent=2)
            file.write('\n')
        os.chmod(temporary, 0o600)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)
print('Antigravity now uses the browser OAuth proxy for GateGoldJira. Reload the MCP server; the proxy opens your browser for sign-in and approval. Node.js 22 or newer must be available to Antigravity.')
PY
