# Project operating rules

## Disk use is a standing user requirement

The user requires cache cleanup and bounded test retention for all future work in this project.

- Run heavy builds and tests through the storage guard used by the project scripts and Makefile. Check available space before starting; respect its concurrency, cache and free-space limits. Do not bypass a stopped guard or start repeated full suites without a new reason to test.
- Use the shared source-bound backend builder for browser tests. Use consistent `-trimpath` Go builds; do not compile a separate identical backend for every temporary snapshot or shard.
- Keep the latest complete verification, its source snapshots, raw counters, successful unit/Go proofs and required shard dependencies. Use the managed retention tool for old test runs. Do not delete evidence still referenced by a retained verification or an active run.
- Build caches are rebuildable. Database contents, database volumes, user uploads, identities and backups are not caches. Never prune or delete them to reclaim disk space. Existing isolated test runners may create and remove only their own disposable test databases as part of their normal lifecycle.
- Never run broad Docker pruning or cleanup outside this project's explicit cache/test-output roots. Do not automatically install, download or rebuild deleted caches just to check that cleanup worked.
- After changing build, coverage or retention scripts, run the relevant regression tests and a bounded smoke check. Preserve historical results honestly; script changes do not establish a new full application verification.

See `docs/development-storage.md` for the maintained limits, cleanup commands and evidence policy.
