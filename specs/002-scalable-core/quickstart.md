# Validation guide

Use the existing pinned project-local tools. Run from repository root. Existing tests create isolated PostgreSQL databases; never reseed the working project or reuse it as a test fixture.

1. Capture a private local migration-00010 schema/data backup and record baseline runtime/migration versions under validation/baseline.md.
2. Run affected Go/real PostgreSQL tests and existing numeric/key/board search parity before and after the first slice. Use `make test-integration` only with the configured local test server.
3. Run `make contracts`, strict app/test typing, relevant unit/browser cases and `make check-generated` after changing transport/schema contracts.
4. In two prepared sessions, edit assignee and priority from the same initial issue; both persist. Competing same-field edits conflict. Choose the current value and verify no revision/event/inbox change.
5. On populated migration fixtures, compare all old identities, stage/category filters, rank sequences, WIP values, old retries, comments/versions/files and reports. Verify retirement/default/coverage invariants and admin isolation.
6. Exercise independent board grouping, ambiguous drops, warning/hard limit races, typed fields, approvals/resubmission, Arabic rich text and interrupted/canceled file sessions.
7. Measure actual API/browser/SQL prepared plans with hot-project mixed writers, sparse/stale/full ranks and rare/short Arabic queries. Record warmup, data, concurrency, timings/percentiles, errors, pool/lock waits and memory; use existing release budgets.
8. Apply validated additive local migrations to preserved data, restart the local API and inspect the first-party UI. Keep backups and document the compatibility/cutover boundary.

Hosted provider/assistant, Cloud Run idle-start/tier and backup restore checks require the existing authorized configured target. Local passes do not mark them complete.

## Supported migration entry

Run `make db-migrate` from the repository root. It invokes the application owner CLI through `scripts/migrate-database.sh`, including guarded configuration, board and asset backfills before retirement. Do not replace it with raw `goose up` against a populated historical database.

The command uses an explicitly supplied `DATABASE_URL` schema-owner connection; otherwise it falls back to `TEST_DATABASE_URL` (the local development default). `APP_ENV` defaults to development for the local Make entry. Production requires `APP_ENV=production`, the intended `CLOUD_SQL_INSTANCE` and password-free IAM schema-owner configuration. Never use a production connection merely to run tests or fixtures.

`make test-browser` creates and deletes a separate `gg_browser_*` database, test identities and object directory. The CI browser job runs this same entry with Chromium and browser timing enabled on its own disposable runner. Private identity files, upload bytes and failure traces are not published as CI artifacts. A GitHub execution requires committing/pushing the workflow; local acceptance does not claim a hosted CI run.
