#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/tool-env.sh"
source "$GATEGOLD_ROOT/scripts/storage-guard.sh"
gategold_guard migration "$0" "$@"
cd "$GATEGOLD_ROOT/backend"
export APP_ENV="${APP_ENV:-development}"
export DATABASE_URL="${DATABASE_URL:-${TEST_DATABASE_URL:?Set DATABASE_URL or TEST_DATABASE_URL to the schema-owner connection.}}"
exec go run ./cmd/gategoldjira migrate
