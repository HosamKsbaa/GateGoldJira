# Research decisions

## Search semantics and first delivery

Decision: classify ASCII numeric input safely and query numeric equality; use escaped literal ILIKE matching the existing trigram index for text. Keep zero/overflow empty results, Arabic digits as literal text, key-prefix behavior and old totals. Rationale: the SQL probe found cast/strpos and generic partial-index costs; current parity suites already encode important behavior. Alternatives: generic untyped SQL/filter engines and an external search service add cost without evidence.

## Field saves and guards

Decision: existing Update already skips normalized no-ops. Add prior-value field patch services, keeping old full-revision PUT. Introduce advisory lifecycle participation for all writers first; legacy commands remain exclusive. Only metadata commands become shared with explicit issue locking after revoke/archive/graph races pass. Rationale: globally switching Execute to shared would break existing implicit serialization. Alternatives: removing guards or splitting all revisions is unsafe/needlessly complex.

## Canonical configuration and client transition

Decision: new typed workflow/type/priority/stage IDs and allowed type/workflow bindings, with one default for each configured behavior. Expand then dual-write/backfill, preserving legacy tokens/retry hashes. Use explicitly versioned modern operations before enabling unrepresentable configuration. Rationale: old enum/editor clients cannot represent Story, grouped columns or several workflows; silently mapping them loses meaning.

## Board migration

Decision: inventory active and archived workflow copies, preserve all currently enforced edges, backfill each board's exact column order/effective warnings and all potential re-entering card ranks. Rationale: current transitions intersect all active board workflows; WIP precedence differs from a simple board fallback. Validate tied legacy ranks and old category filters. Alternatives: selecting an arbitrary workflow or only visible cards changes permissions/order.

## Files

Decision: share typed mechanics first, then canonical assets/sessions with preserved UUIDs/object generations/checksums/attribution. Retain old data-picture-id and authenticated content adapters. General file drafts are new explicit behavior; legacy document endpoints keep immediate publication during compatibility. Use configured bounded resumable sessions and final verification outside business row locks. Rationale: PostgreSQL and object storage do not share a transaction, and current 10 MiB checks exist in several boundaries.

## Validation and environment

Decision: populated real PostgreSQL migration/parity/race cases, actual prepared sqlc/pgx workloads and browser flows are required. Local fixtures and private backups suffice for implementation; existing Auth0/provider/Cloud acceptance remains separate. All dependencies stay pinned. The reviewed diagrams and SQL probes are candidate evidence, not proof of final app throughput.

Research sources: accepted docs/database/proposed-v2-design.txt and proposed-v2-review.txt; current migrations 00002–00010; command transaction/queries; issues search/update/order/prerequisites; boards workflow/stages/search tests; attachments/pictures/comments lifecycle code; existing parity/integration/workload suites. Two read-only Phase 0 research agents inspected migration and concurrency paths.

## Prepared-search implementation decision

The actual authenticated 100k fixture found forced-generic CASE queries taking roughly two seconds; broad prefix requests exceeded the five-second deadline. Numeric queries now have separate generated shapes plus a cross-project number index. Text candidates split key/prefix/title lookup so selective text can use trigram and number indexes. Broad project-prefix/default-update lists use ordered query shapes. Text/default search opts into transaction-local custom planning because selectivity and optional filters vary; this ends on commit/rollback and is not a global plan-mode override. The execution plan showed 581.081 ms of JIT compilation in a 610.344 ms query; the app pool disables JIT for interactive work. These choices retain exact legacy totals and typed sqlc models. Acceptance remains based on workload results, not these plan observations alone.
