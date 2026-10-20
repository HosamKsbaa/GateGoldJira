#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/tool-env.sh"
source "$GATEGOLD_ROOT/scripts/storage-guard.sh"
gategold_guard frontend "$0" "$@"
cd "$GATEGOLD_ROOT"
coverage_directory="${GATEGOLD_UNIT_COVERAGE_DIRECTORY:-$GATEGOLD_ROOT/.local/coverage/frontend-unit}"
coverage_directory="$(python3 -c 'import pathlib,sys;print(pathlib.Path(sys.argv[1]).resolve())' "$coverage_directory")"
# Starting invalidates older successful measurements before Vitest can fail or
# abort, even when the application source has not changed.
run_id="$(python3 scripts/frontend-unit-run-provenance.py start --root "$GATEGOLD_ROOT" --directory "$coverage_directory")"
cleanup() {
  status=$?
  if ((status != 0)); then
    python3 scripts/frontend-unit-run-provenance.py fail --root "$GATEGOLD_ROOT" --directory "$coverage_directory" --run-id "$run_id" || true
  fi
}
trap cleanup EXIT
# No filters or forwarded positional arguments: every discovered unit file must
# appear in the bound JSON results, with no skipped tests or .only execution.
(cd frontend && GATEGOLD_UNIT_COVERAGE_DIRECTORY="$coverage_directory" npm test -- --coverage --allowOnly=false --passWithNoTests=false --reporter=default --reporter=json --outputFile.json="$coverage_directory/vitest-results.json")
python3 scripts/frontend-coverage-manifest.py > "$coverage_directory/source-manifest.json"
python3 scripts/frontend-unit-run-provenance.py finish --root "$GATEGOLD_ROOT" --directory "$coverage_directory" --run-id "$run_id"
