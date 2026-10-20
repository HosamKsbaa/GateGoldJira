#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/tool-env.sh"
source "$GATEGOLD_ROOT/scripts/storage-guard.sh"
gategold_guard browser "$0" "$@"
cd "$GATEGOLD_ROOT"
test -z "${K_SERVICE:-}" || { echo 'Browser fixtures require a local development machine.' >&2; exit 1; }
run_id="$(python3 -c 'import uuid; print(uuid.uuid4().hex)')"
database_name="gg_browser_${run_id}"
run_directory="$GATEGOLD_ROOT/.local/browser-tests/$run_id"
gategold_protect_run ".local/browser-tests/$run_id"
mkdir -p "$run_directory/identity"
chmod 700 "$run_directory" "$run_directory/identity"
write_run_index() {
  python3 - "$run_directory" "$1" <<'PYSTATUS'
import json
from pathlib import Path
import sys
directory,status=sys.argv[1:]
(Path(directory)/'result.json').write_text(json.dumps({'runDirectory':directory,'status':status})+'\n')
PYSTATUS
  if [[ -n "${GATEGOLD_BROWSER_RUN_INDEX:-}" ]]; then
    python3 - "$GATEGOLD_BROWSER_RUN_INDEX" "$run_directory" "$1" <<'PY'
import json
from pathlib import Path
import sys
path,run,status=sys.argv[1:]
target=Path(path);target.parent.mkdir(parents=True,exist_ok=True)
target.write_text(json.dumps({'runDirectory':run,'status':status})+'\n')
PY
  fi
}
write_run_index running
source_directory="$run_directory/source"
python3 scripts/capture-test-source.py --output "$source_directory" || { write_run_index failed; exit 1; }
server_pid=''
database_created=''
cleanup() {
  local result=$?
  trap - EXIT
  if [[ -n "$server_pid" ]]; then kill -TERM "$server_pid" 2>/dev/null || true; wait "$server_pid" 2>/dev/null || true; fi
  if [[ -d "$run_directory/go-coverage" ]]; then
    go tool covdata textfmt -i="$run_directory/go-coverage" -o="$run_directory/go-statements.out" || result=1
    (cd "$source_directory/backend" && go tool cover -func="$run_directory/go-statements.out") >"$run_directory/go-statements.txt" || result=1
    # Parallel shards retain their private raw counters for one source-validated
    # aggregate conversion. Ordinary single-run reporting remains unchanged.
    if [[ -f "$run_directory/use-case-results.json" && "${GATEGOLD_DEFER_BROWSER_COVERAGE_REPORT:-0}" != 1 ]]; then
      (cd "$source_directory" && node scripts/report-browser-code-coverage.mjs "$run_directory/js-coverage" "$run_directory/coverage-report") || result=1
    fi
  fi
  if [[ -f "$run_directory/use-case-results.json" ]]; then
    python3 "$source_directory/scripts/print-coverage-summary.py" "$run_directory/use-case-results.json"
  fi
  rm -f "$run_directory/gategoldjira"
  if [[ -n "$database_created" ]]; then
    docker compose -f "$GATEGOLD_ROOT/compose.dev.yaml" exec -T postgres psql --username=gategoldjira --dbname=postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE $database_name WITH (FORCE);" >/dev/null || result=1
  fi
  if [[ $result == 0 ]]; then write_run_index passed; else write_run_index failed; fi
  exit "$result"
}
trap cleanup EXIT
if [[ "${GATEGOLD_BUILD_PLUGIN_FROM_SOURCE:-}" == 1 ]]; then
  (cd "$source_directory/integrations/antigravity" && npm run typecheck && npm test && npm run build)
  export GATEGOLD_PLUGIN_PACKAGE="$source_directory/integrations/antigravity/dist/gategoldjira"
fi
docker compose -f compose.dev.yaml exec -T postgres psql --username=gategoldjira --dbname=postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $database_name;" >/dev/null
database_created=1
export APP_ENV=development AUTH_MODE=development STORAGE_MODE=local COMPANY_TIMEZONE=Africa/Cairo
# Email acceptance uses its own loopback SMTP worker. Never inherit a developer's
# configured provider into the isolated primary browser-test server.
export SMTP_ADDRESS='' SMTP_FROM='' SMTP_USERNAME='' SMTP_PASSWORD='' SMTP_ALLOW_LOCAL_PLAINTEXT=false
read -r PORT GATEGOLD_WEB_PORT < <(python3 -c 'import socket; a=socket.socket(); b=socket.socket(); a.bind(("127.0.0.1",0)); b.bind(("127.0.0.1",0)); print(a.getsockname()[1], b.getsockname()[1]); a.close(); b.close()')
export PORT GATEGOLD_WEB_PORT
export DATABASE_URL="postgres://gategoldjira:local-development-only@127.0.0.1:54329/$database_name?sslmode=disable"
export GATEGOLD_E2E_SERVER_BINARY="$run_directory/gategoldjira"
export AUTH_ISSUER="http://127.0.0.1:$PORT/development-identity/" REST_AUDIENCE="http://127.0.0.1:$PORT/api" MCP_AUDIENCE="http://127.0.0.1:$PORT/mcp"
export GATEGOLD_WEB_URL="http://127.0.0.1:$GATEGOLD_WEB_PORT"
export AUTH_REQUIRED_SCOPE=gategoldjira:access ALLOWED_ORIGINS="$GATEGOLD_WEB_URL"
export DEV_SIGNING_KEY_FILE="$run_directory/identity/signing-key.pem" CURSOR_SECRET_FILE="$run_directory/cursor-secret"
export LOCAL_PICTURE_DIRECTORY="$run_directory/pictures"
if [[ "${GATEGOLD_CAPTURE_CODE_COVERAGE:-}" == 1 ]]; then
  mkdir -p "$run_directory/go-coverage" "$run_directory/js-coverage"
  export GOCOVERDIR="$run_directory/go-coverage"
  export GATEGOLD_JS_COVERAGE_DIRECTORY="$run_directory/js-coverage"
  python3 scripts/build-test-backend.py --root "$GATEGOLD_ROOT" --source "$source_directory" --output "$run_directory/gategoldjira" --coverage
else
  python3 scripts/build-test-backend.py --root "$GATEGOLD_ROOT" --source "$source_directory" --output "$run_directory/gategoldjira"
fi
"$run_directory/gategoldjira" dev-init
# Compatibility stories share a fixed-choice legacy Demo; native stories create
# their own projects and exercise public activation. dev-init defaults to modern.
# Only this fresh, disposable database is adjusted, before any server starts.
[[ "$database_name" =~ ^gg_browser_[0-9a-f]{32}$ ]] || exit 1
docker compose -f compose.dev.yaml exec -T postgres psql --username=gategoldjira --dbname="$database_name" -v ON_ERROR_STOP=1 -c "UPDATE projects SET core_mode='legacy' WHERE id='20000000-0000-4000-8000-000000000001' AND key='DEMO';" >/dev/null
"$run_directory/gategoldjira" >"$run_directory/server.log" 2>&1 &
server_pid=$!
ready=''
for attempt in {1..40}; do
  if curl --fail --silent "http://127.0.0.1:$PORT/readyz" >/dev/null; then ready=1; break; fi
  sleep .25
done
test -n "$ready" || { echo 'The isolated browser-test backend did not become ready.' >&2; exit 1; }
export GATEGOLD_E2E_DATABASE_NAME="$database_name"
export GATEGOLD_USE_CASE_REPORT="$run_directory/use-case-results.json"
export GATEGOLD_E2E_API="http://127.0.0.1:$PORT" GATEGOLD_E2E_TOKENS="$run_directory/identity/tokens"
export GATEGOLD_E2E_ACCOUNTS="$run_directory/identity/accounts.json"
export GATEGOLD_E2E_EVIDENCE="$GATEGOLD_ROOT/.local/browser-evidence" PLAYWRIGHT_BROWSERS_PATH="$GATEGOLD_ROOT/.cache/playwright"
mkdir -p "$GATEGOLD_E2E_EVIDENCE"
cd "$source_directory/frontend"
npm run test:e2e -- --output "$run_directory/results" "$@"
