# Compatibility and completed local cutover

Expand → backfill → switch → verify → retire → adopt. Initial retirement completed locally on 2026-10-14; the verified migration 19 follow-up was adopted on 2026-10-15 with the original company preserved. [final-verification.md](final-verification.md) and [adoption-completion.json](adoption-completion.json) contain the current evidence; [adoption.json](adoption.json) retains the initial migration 13 → 18 results.

The owner migrator first commits expansion through 17, completes guarded configuration/board/asset batches and validates canonical references, then applies migration 18. It does not run retirement before its source backfills. The post-retirement inventory is 44 application tables. Migration 19 adds only the compact active-stage count index. The owner CLI applies it after guarded expansion and retirement. Old API names are compatibility views over canonical owners; original category tokens, retry hashes/results and immutable migration evidence remain available.

The populated migration suite verifies all 33 migration-10 source projections, bounded backfill interruption/resume, original accepted saves across canonical expansion, constraints and restart safety. The final full race suite also passes the complete real-service REST/MCP replay and permission matrix. The separate fresh live migration-13 snapshot verifies all 39 source projections against migration 18 without changing original values. The fresh migration-18 follow-up snapshot verifies all 44 source projections against migration 19 exactly.

## Local procedure performed

1. Confirmed the API process by its exact project binary path, sent it SIGTERM and waited for drain. No shared Chromium/systemd scope or unrelated listener was stopped.
2. Confirmed no active database writer, captured a private database dump and object archive together, retained checksums/source projections, then paused cleanup claims.
3. Applied the verified owner CLI and restored the original cleanup flag. Validated all original projections and the 44-table catalog before reopening the API.
4. Preserved the prior binary, installed the verified binary and restarted the API with existing environment/account files. Kept the existing Angular listener and existing project mode.
5. Verified API/web readiness, original sign-in, existing boards/issues/comments, native numeric search, token-audience isolation and byte-for-byte retained objects. The initial retirement smoke verified unchanged autosave replay; the follow-up verified public readiness, unconfirmed-activation rejection and member/viewer denial without flipping project mode.
6. Restored the fresh backup into isolated local database/object targets, upgraded that clone and verified all original projections and published asset SHA/size/generation identities.
7. Captured the actual schema-only SQL/catalog and rendered current PlantUML diagrams. The existing tab's visual inspection was blocked by browser policy; separate automated frontend acceptance passed 153 cases. No visual inspection of that tab is claimed.

Backups remain private under ignored `.local/backups/`; `.local/modern-backup-path` points to the current fresh drained pair; `.local/retirement-backup-path` retains the earlier retirement pair. Never reseed the existing company to obtain a passing smoke result.

## Repair and rollback boundary

Migration 18 retires old physical owners after verified compatibility; a running old backend binary must not be reintroduced against it. The previous binary is recovery evidence, not an in-place database downgrade path. Prefer tested forward repair for new canonical work. A full rollback requires traffic/cleanup drain and restoring the paired database/object snapshot into a verified target, then rechecking permissions, receipts and references before reopening. Restoring only the database can lose files or generations, and restoring the old snapshot discards subsequent work unless it is first preserved/reconciled.

Both the initial retirement pair and the fresh follow-up pair were restored and tested locally. The follow-up clone retained all 44 projections, 15 object files, four SHA/size/generation-verified published assets and 16 accepted receipts. The live project remains in its previous client mode; activation uses the explicit public review/confirmation flow described in [native-client-boundary.md](native-client-boundary.md). Provider, external object-store, hosted idle-start and a full external paired restore remain separately pending in [readiness.md](readiness.md).
