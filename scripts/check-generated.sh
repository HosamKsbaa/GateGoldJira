#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/tool-env.sh"
cd "$GATEGOLD_ROOT"
snapshot="$(mktemp)"
trap 'rm -f "$snapshot"' EXIT
python3 scripts/generated-manifest.py > "$snapshot"
bash scripts/generate-contracts.sh
python3 scripts/generated-manifest.py | diff -u "$snapshot" -
