#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/tool-env.sh"
source "$GATEGOLD_ROOT/scripts/storage-guard.sh"
gategold_guard contracts "$0" "$@"
cd "$GATEGOLD_ROOT/backend"
mkdir -p api
api_temporary="$(mktemp api/openapi.XXXXXX)"
fixture_temporary="$(mktemp tests/contracts/openapi-fixture.XXXXXX)"
mcp_temporary="$(mktemp api/mcp-tools.XXXXXX)"
trap 'rm -f "$api_temporary" "$fixture_temporary" "$mcp_temporary"' EXIT
go run ./cmd/contracts > "$api_temporary"
go run ./cmd/contract-fixture > "$fixture_temporary"
go run ./cmd/mcp-contracts > "$mcp_temporary"
mv "$api_temporary" api/openapi.json
mv "$fixture_temporary" tests/contracts/openapi-fixture.json
mv "$mcp_temporary" api/mcp-tools.json
if [[ -f sqlc.yaml ]]; then
  go tool sqlc generate
else
  go tool sqlc generate -f tests/contracts/sqlc.yaml
fi
cd "$GATEGOLD_ROOT/frontend"
npm run generate:api
npm run generate:fixture

node "$GATEGOLD_ROOT/scripts/annotate-zod-purity.mjs"
