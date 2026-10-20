#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/tool-env.sh"
source "$GATEGOLD_ROOT/scripts/storage-guard.sh"
gategold_guard backend "$0" "$@"
cd "$GATEGOLD_ROOT"
: "${TEST_DATABASE_URL:?Set the explicit isolated-test administrator connection.}"
run_directory="$GATEGOLD_ROOT/.local/go-verification/$(python3 -c 'import uuid; print(uuid.uuid4().hex)')"
gategold_protect_run "${run_directory#"$GATEGOLD_ROOT/"}"
index="$GATEGOLD_ROOT/.local/coverage/backend-unit.json"
mkdir -p "$run_directory" "$(dirname "$index")"
chmod 700 "$run_directory"
write_result() {
  python3 - "$index" "$run_directory" "$1" <<'PY'
import json
from pathlib import Path
import sys
index,run,status=sys.argv[1:]
data=json.dumps({'runDirectory':run,'status':status})+'\n'
Path(index).write_text(data)
(Path(run)/'result.json').write_text(data)
PY
}
finish() {
  local result=$?
  trap - EXIT
  if [[ $result == 0 ]]; then write_result passed; else write_result failed; fi
  printf 'Go coverage run: %s\n' "$run_directory"
  exit "$result"
}
trap finish EXIT
# Interrupted verification must never leave a successful index. Bash can defer
# a signal until its foreground child exits; make the signal's outcome explicit.
trap 'exit 130' INT
trap 'exit 143' TERM
write_result running
python3 scripts/capture-test-source.py --output "$run_directory/source"
if REQUIRE_POSTGRES_TESTS=1 go -C "$run_directory/source/backend" test -count=1 -race -p 1 -covermode=atomic -coverpkg=./... -coverprofile="$run_directory/go-unit-statements.out" ./... -timeout=30m > "$run_directory/tests.log" 2>&1; then
  go -C "$run_directory/source/backend" tool cover -func="$run_directory/go-unit-statements.out" > "$run_directory/go-unit-statements.txt"
  # Bind the successful full run only after an independent official no-test
  # instrumentation proves its complete package/block denominator. A provenance
  # failure changes the final index back to failed through the EXIT trap.
  write_result passed
  python3 scripts/go-coverage-provenance.py create --run "$run_directory"
  tail -1 "$run_directory/go-unit-statements.txt"
else
  result=$?
  # Raw failure output can contain private fixtures. Keep it in the owned run.
  sed -n '/^--- FAIL:/p; /^FAIL[[:space:]]/p' "$run_directory/tests.log"
  exit "$result"
fi
