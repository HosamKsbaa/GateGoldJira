#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/tool-env.sh"
if [[ "$#" != 3 ]]; then
  echo 'Usage: release-frontend.sh PUBLIC_CONFIG FRONTEND_ORIGIN FIREBASE_SITE_ID' >&2
  exit 2
fi
(cd "$GATEGOLD_ROOT/frontend" && npm run typecheck && npm run build)
node "$GATEGOLD_ROOT/scripts/prepare-frontend-release.ts" "$1" "$2" "$3"
