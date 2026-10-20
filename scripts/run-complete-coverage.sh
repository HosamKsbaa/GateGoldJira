#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/tool-env.sh"
source "$GATEGOLD_ROOT/scripts/storage-guard.sh"
gategold_guard complete "$0" "$@"
cd "$GATEGOLD_ROOT"
# A complete gate uses Playwright's strict, unfiltered CI collection settings.
export CI=1
# Browser execution may cover code that has no separate unit test. Enforce the
# combined, source-matched denominator after both providers have completed.
GATEGOLD_ENFORCE_CODE_COVERAGE=0 bash scripts/run-unit-coverage.sh
bash scripts/run-backend-coverage.sh
report_directory="$GATEGOLD_ROOT/.local/coverage/complete-$(python3 -c 'import uuid; print(uuid.uuid4().hex)')"
mkdir -p "$report_directory"
result=0
GATEGOLD_BROWSER_RUN_INDEX="$report_directory/browser-run.json" GATEGOLD_CAPTURE_CODE_COVERAGE=1 RUN_BROWSER_PERFORMANCE=0 bash scripts/run-browser-tests.sh "$@" || result=$?
arguments=(--run-index "$report_directory/browser-run.json" --output "$report_directory/report")
if [[ "${GATEGOLD_REQUIRE_FULL_SOURCE_COVERAGE:-}" == 1 ]]; then arguments+=(--enforce); fi
python3 scripts/finalize-browser-coverage.py "${arguments[@]}" || result=$?
exit "$result"
