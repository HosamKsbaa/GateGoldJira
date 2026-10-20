#!/usr/bin/env bash
# Real browser + stdio proxy acceptance, always against a disposable database.
set -euo pipefail
source "$(dirname "$0")/tool-env.sh"
cd "$GATEGOLD_ROOT"
npm install --prefix "$GATEGOLD_ROOT/.local/mcp-remote" --ignore-scripts --no-audit --no-fund mcp-remote@0.15.1
export GATEGOLD_MCP_REMOTE_PROXY="$GATEGOLD_ROOT/.local/mcp-remote/node_modules/mcp-remote/dist/proxy.js"
bash scripts/run-browser-tests.sh mcp-remote.spec.ts
