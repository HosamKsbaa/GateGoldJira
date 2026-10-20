#!/usr/bin/env bash
# Run both applications together without reseeding, replacing credentials or
# stopping listeners owned by another terminal.
set -euo pipefail
GATEGOLD_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
source "$GATEGOLD_ROOT/scripts/tool-env.sh"
cd "$GATEGOLD_ROOT"
for executable in curl ss setsid flock; do
  command -v "$executable" >/dev/null || { printf 'Local development needs %s.\n' "$executable" >&2; exit 1; }
done
if [[ ! -f backend/.env.local || ! -f frontend/public/config.local.json ]]; then
  printf 'Run make setup-dev, then configure the local API and web settings.\n' >&2
  exit 1
fi
set -a
source backend/.env.local
set +a
if [[ "${APP_ENV:-development}" != development || -n "${K_SERVICE:-}" || "${PORT:-21080}" != 21080 ]]; then
  printf 'make dev requires local development on API port 21080, matching the Angular proxy.\n' >&2
  exit 1
fi
GATEGOLD_WEB_PORT="${GATEGOLD_WEB_PORT:-4201}"
if [[ ! "$GATEGOLD_WEB_PORT" =~ ^[0-9]+$ ]] || ((GATEGOLD_WEB_PORT<1 || GATEGOLD_WEB_PORT>65535)); then
  printf 'GATEGOLD_WEB_PORT must be between 1 and 65535.\n' >&2
  exit 1
fi
mkdir -p .local
exec 9>.local/dev-supervisor.lock
if ! flock -n 9; then
  printf 'A development supervisor is already running for this checkout.\n' >&2
  exit 1
fi
(cd backend && python3 "$GATEGOLD_ROOT/scripts/with-project-storage.py" --root "$GATEGOLD_ROOT" --kind build -- go build -o ../.local/supervised-api-next ./cmd/gategoldjira)
mv .local/supervised-api-next .local/supervised-api
api_pid=''
web_pid=''
api_restarts=0
web_restarts=0
cleanup() {
  trap - EXIT INT TERM
  for owned_pid in "$api_pid" "$web_pid"; do
    if [[ -n "$owned_pid" ]] && kill -0 "$owned_pid" 2>/dev/null; then
      kill -TERM -- "-$owned_pid" 2>/dev/null || true
    fi
  done
  for owned_pid in "$api_pid" "$web_pid"; do
    [[ -z "$owned_pid" ]] || wait "$owned_pid" 2>/dev/null || true
  done
}
trap cleanup EXIT
trap 'exit 0' INT TERM
port_in_use() { [[ -n "$(ss -ltnH "sport = :$1")" ]]; }
start_api() {
  ((api_restarts+=1))
  if ((api_restarts>5)); then printf 'API restart limit reached. See .local/dev-api.log.\n' >&2; exit 1; fi
  (cd backend && exec setsid ../.local/supervised-api) >>.local/dev-api.log 2>&1 9>&- &
  api_pid=$!
  printf 'Starting API; logs: .local/dev-api.log\n'
}
start_web() {
  ((web_restarts+=1))
  if ((web_restarts>5)); then printf 'Web restart limit reached. See .local/dev-web.log.\n' >&2; exit 1; fi
  (cd frontend && exec setsid env PORT="$GATEGOLD_WEB_PORT" npm start -- --host 127.0.0.1 --port "$GATEGOLD_WEB_PORT") >>.local/dev-web.log 2>&1 9>&- &
  web_pid=$!
  printf 'Starting web app; logs: .local/dev-web.log\n'
}
if port_in_use 21080; then printf 'Reusing the API listener on port 21080.\n'; else start_api; fi
if port_in_use "$GATEGOLD_WEB_PORT"; then printf 'Reusing the web listener on port %s.\n' "$GATEGOLD_WEB_PORT"; else start_web; fi
previous_health=''
printf 'Open http://localhost:%s. Ctrl+C stops only processes started by this supervisor.\n' "$GATEGOLD_WEB_PORT"
while true; do
  if [[ -n "$api_pid" ]] && ! kill -0 "$api_pid" 2>/dev/null; then wait "$api_pid" 2>/dev/null || true; api_pid=''; fi
  if [[ -n "$web_pid" ]] && ! kill -0 "$web_pid" 2>/dev/null; then wait "$web_pid" 2>/dev/null || true; web_pid=''; fi
  if [[ -z "$api_pid" ]] && ! port_in_use 21080; then start_api; fi
  if [[ -z "$web_pid" ]] && ! port_in_use "$GATEGOLD_WEB_PORT"; then start_web; fi
  health='waiting'
  if curl --silent --fail --max-time 2 http://127.0.0.1:21080/readyz >/dev/null && curl --silent --fail --max-time 2 "http://127.0.0.1:$GATEGOLD_WEB_PORT/" >/dev/null; then health='ready'; fi
  if [[ "$health" != "$previous_health" ]]; then
    if [[ "$health" == ready ]]; then printf 'API and web are ready.\n'; else printf 'Waiting for API/database and web readiness; logs are retained in .local.\n'; fi
    previous_health="$health"
  fi
  sleep 2
done
