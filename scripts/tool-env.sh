#!/usr/bin/env bash
# Source this file to prefer the verified, project-local tools when present.
GATEGOLD_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$GATEGOLD_ROOT/.tools/go/bin:$GATEGOLD_ROOT/.tools/node-v24.21.0-linux-x64/bin:$PATH"
export GOCACHE="$(realpath -m "$GATEGOLD_ROOT/.cache/go-build")"
export GOMODCACHE="$(realpath -m "$GATEGOLD_ROOT/.cache/go-mod")"
export GOPATH="$GATEGOLD_ROOT/.tools/gopath"
case " ${GOFLAGS:-} " in
  *" -trimpath "*) ;;
  *) export GOFLAGS="${GOFLAGS:+$GOFLAGS }-trimpath" ;;
esac
