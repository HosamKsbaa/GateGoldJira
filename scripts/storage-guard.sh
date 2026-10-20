#!/usr/bin/env bash
# Source after tool-env.sh. Nested commands share the outer disk watchdog.
gategold_guard() {
  local kind="$1" entry
  shift
  entry="$(realpath "$1")"
  shift
  if [[ "${GATEGOLD_STORAGE_ENTRY:-}" != "$entry" ]]; then
    exec python3 "$GATEGOLD_ROOT/scripts/with-project-storage.py" --root "$GATEGOLD_ROOT" --kind "$kind" -- \
      env "GATEGOLD_STORAGE_ENTRY=$entry" bash "$entry" "$@"
  fi
}

gategold_protect_run() {
  python3 "$GATEGOLD_ROOT/scripts/project-storage.py" --root "$GATEGOLD_ROOT" protect \
    --lease "${GATEGOLD_STORAGE_LEASE:?Heavy jobs require the storage guard.}" --path "$1" >/dev/null
}
