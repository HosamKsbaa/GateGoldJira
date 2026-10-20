# Development storage policy

Cache cleanup and bounded retention are standing project requirements. Keep databases, uploaded user files, identities, backups and the latest complete verification evidence intact.

## Run builds and tests through the guard

The Makefile and the browser, unit-coverage, backend-coverage, contract-generation and release scripts use `scripts/with-project-storage.py`. The guard runs maintenance before admission, holds a process-independent file lock for each active job, and checks disk use every 15 seconds. Nested commands share the outer lease and register their run directories. On a limit violation it terminates only its own command group and returns exit status 125. Do not bypass that refusal.

| Limit | Default |
|---|---:|
| Free-space floor before admission | 10 GiB plus 2 GiB reserved per active/new heavy job |
| Concurrent heavy jobs | 4 |
| Rebuildable Go cache soft budget | 6 GiB |
| Shared test-backend binaries soft budget | 1 GiB |
| Retained verification runs soft budget | 12 GiB |
| Runtime stop: remaining free space | Below 5 GiB |
| Runtime stop: Go cache | Above 10 GiB |
| Runtime stop: managed verification runs | Above 20 GiB |

Soft budgets trigger cleanup between jobs. Active jobs, pinned evidence and incomplete work are protected; if they prevent meeting a budget, admission fails instead of deleting them. The watchdog does not control unrelated applications or guarantee against another process filling the disk between samples.

## Inspect and clean

```bash
make storage-plan    # Report a deletion plan; no files changed.
make storage-clean   # Remove eligible old runs and oversized rebuildable caches.
```

Maintenance is restricted to `.cache/go-build`, `.cache/test-backends`, `.local/browser-tests` and `.local/go-verification`, plus its own `.local/storage` metadata. It rejects symlink roots, unexpected run names and unsafe metadata. It never runs Docker pruning or deletes database volumes, backups or user data.

An interrupted cohort can leave incomplete snapshots or recent unmerged shards protected. Once their runners have ended and the cohort is deliberately abandoned, use `python3 scripts/project-storage.py --root "$PWD" retire --path .local/browser-tests/RUN_ID --reason 'Superseded by retained verification; runner ended'`, repeating `--path` for each selected run, then run `make storage-clean`. Retirement refuses active jobs, pinned runs and dependencies of retained verification. It records an inode-bound audit under `.local/storage/retired-runs.json`; it never rewrites historical results or changes a failure into a pass.

Go module downloads and installed Node/browser dependencies remain shared rather than copied into each source snapshot. Clear them only for a specific reason: removing them merely forces downloads on the next build.

## Preserve verification

Explicit protection paths live in the ignored `.local/storage-pins.json` file. Keep that file when relocating local evidence. Maintenance also discovers the newest completed full browser verification and its shard/source dependencies, and the current successful Go verification. An active lease protects all registered run paths. Recent completed runs and a recent failure are retained within the configured budget; pending shard groups must remain protected until merged or deliberately abandoned.

Preserve the producer-bound source snapshots, original counters and proof files, not just percentage summaries. A merged source link may point to a shard snapshot, and its `shards.json` may reference shard-index JSON files. Removing those dependencies breaks verification. Published summaries under `docs/use-cases/current-coverage` remain in Git; raw results, credentials, logs, traces and upload fixtures remain ignored and private.

The cleanup audit under `.local/storage/cleanup-2026-10-20` records hashes of the retained verification files before cleanup. Historical verification remains evidence of the recorded application and harness versions; changes to these scripts require new relevant checks.

## Reuse backend builds

Browser tests use `scripts/build-test-backend.py` to build one immutable, source-bound pure-Go backend per effective input set. The cache key binds the complete captured backend manifest, actual toolchain inputs, target, supported build flags and ordinary versus coverage instrumentation. Builds use `-trimpath`, a canonical module-cache path, readonly modules and disabled VCS stamping. Identical shards reuse the same validated binary; each run gets its own removable copy. Race-enabled backend tests remain a separate build variant.

Completed shard merges hard-link immutable compressed counters on the same filesystem, falling back to copies across filesystems. This avoids storing identical raw coverage twice while retaining both evidence paths.
