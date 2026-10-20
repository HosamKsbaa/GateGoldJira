# Daily-edit implementation evidence

**Final status (2026-10-14):** migration 18 is adopted locally and the complete suite passes. The phase checkpoints below are historical; their earlier pending/migration-version statements are superseded by [final-verification.md](final-verification.md), [cutover.md](cutover.md) and [readiness.md](readiness.md).
Search classification and typed field patches are implemented; full V2 schema adoption remains pending.

Confirmed real PostgreSQL checks: issue and board suites, preflight, field merge/date/no-op/replay/revocation behavior, strict REST shape/current conflict payload, core HTTP, contract catalog and MCP provider. Numeric/key-prefix REST/MCP parity passed. Media identity/key/retry collision preflight passed on preserved legacy metadata.

The operation catalog and full REST/MCP replay matrix pass at 79 operations / 41 mutations. All seven autosave browser scenarios pass, including mobile choices, date typing, lost response, same-field conflict and unrelated-field merge. The shared API client now adapts PATCH headers as well as POST/PUT. Generated drift, strict app/test typing and all 98 frontend unit tests pass.

Search uses typed numeric equality and escaped literal ILIKE. Prepared-plan performance is still being measured; a predicate change alone is not a scalability claim. Legacy exact totals are retained. No project locks have yet been weakened, and the live database remains at migration 00010.

The first actual 100k-issue prepared workload exposed the general CASE path: forced-generic p95 number 2007.36 ms, complete key 2234.19 ms, title 2152.32 ms; a broad prefix exceeded the request deadline (HTTP 503). These are application results, not EXPLAIN-only estimates. Dedicated query shapes and additive indexes are being verified before this slice is accepted.

Affected issue/board suites, the complete 79-operation REST/MCP replay matrix, contract catalog and MCP protocol passed with the new query shapes. Configuration and migration fixtures initially hit database-creation timeouts while packages ran in parallel; both passed with `go test -p 1`. A concurrent benchmark run was interrupted and is excluded from acceptance. The browser runner now removes its stopped executable after cleanup; 95 stopped copies reclaimed 6.77 GiB while preserving reports/traces/fixture files.

Final 100k/95k-hot-project authenticated workload PASS: 20 measured trials per scenario in both connection plan modes. Numeric p95 23.270 / 15.796 ms; complete key 47.193 / 48.316 ms; title literal 50.340 / 58.439 ms; broad key prefix 353.050 / 119.960 ms; short Arabic no-match 188.676 / 267.258 ms; empty list 81.223 / 158.849 ms. Exact totals and page bounds were checked on every response. Full evidence: `search-prepared-after.json`. Text/default paths deliberately use transaction-local custom planning even on generic-plan connections. The benchmark is sequential and local; 100-user mixed-writer/cloud acceptance remains pending.
