#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/tool-env.sh"
sdk_directory="${GATEGOLD_PLUGIN_SDK:-$HOME/.gemini/config/node_modules/sidecar_sdk}"
test -f "$sdk_directory/register_loader.js" || { echo 'Antigravity sidecar_sdk is required for host integration verification.' >&2; exit 1; }
export GATEGOLD_PLUGIN_SDK="$sdk_directory"
export GATEGOLD_BUILD_PLUGIN_FROM_SOURCE=1
cd "$GATEGOLD_ROOT"
bash scripts/run-browser-tests.sh antigravity-plugin.spec.ts
