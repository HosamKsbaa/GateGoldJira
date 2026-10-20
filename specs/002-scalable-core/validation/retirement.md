# Canonical ownership and compatibility (migration 18)

The owner migrator commits expansion through 17, completes its guarded batches
and validates references before applying 18. Re-running it is safe after cutover.
`Expand` is an explicit owner-only preparation step for source equivalence checks.

The actual post-retirement catalog contains 44 application tables. Canonical
issue, board and assignment rows are `issue_records`, `board_records` and
`assignment_rule_records`; their former names are compatibility views. One
`attachments` table owns images/files and one `upload_reservations` table owns
all transfer modes. Retained comment versions reference `comment_version_attachments`.

Old status/type/priority/rank, board workflow/WIP copies and assignment stage
strings are no longer independently mutable columns. Compatibility writes map
old supported contracts into scoped canonical IDs and board-owned order. Native
ordering stays independent. A stage-owned compatibility revision preserves old
order guards; it propagates into board columns only for legacy projects.
Original migration ranks and workflow JSON are retained as immutable evidence,
not an active source of configuration or order.

Type behavior enforces same-project parents and one subtask level. Existing
composite workflow/type/stage/priority and media/version foreign keys remain.
Runtime grants allow current state changes without schema changes, business-row
removal, retained-history rewriting or published-object deletion.

Native readers skip old order/workflow JSON. Count/completion/filter predicates
use canonical IDs and stage categories. Retirement replaces the child-progress
and due-reminder indexes that dropping status would otherwise remove. Native
board metadata and unfiltered counts read canonical physical rows directly.

Navigation and workspace search use native readers across mixed configurations.
Legacy project selection restores the existing editor. Modern backlog replies
include batched canonical choices; creation keeps its draft and original intent.
CSV imports accept bounded scoped choice keys/IDs/names, retain source identity,
and export real choice keys plus canonical IDs. Native creation still requires an
eligible initial stage; an existing exported source resolves to its retained issue.
Automation accepts a scoped stage ID and keeps the original token contract.
Images and documents retain the common recoverable transfer and publication path.

## Verified retirement

- All feature, migration, integration and app regressions passed after retirement
  and canonical filter conversion (`.local/refactor-final-functional.log`).
- New race acceptance passed for native CSV/backlog/source replay, scoped
  assignment-stage identity, the actual 44-table catalog, immutable migration
  evidence and repeated adoption (approximately two seconds per package).
- Angular app/templates/tests and 105 unit tests passed. Production build passed;
  initial bundle 602.54 kB retains a 2.54 kB warning above the 600 kB soft budget.
- Warm 100k-issue/100-user mixed load passed after restoring the child index and
  direct native board reads: p95 search 246.65 ms, board 496.74 ms, priority
  435.70 ms and comments 601.28 ms. Report: `mixed-retired-native.json`.
  This is local evidence with a tight board margin, not hosted acceptance.

The complete race/catalog/browser checks and backed-up local adoption now pass;
see [final-verification.md](final-verification.md). All 39 live source projections
and the fresh paired restore passed. Failed intermediate performance reports are
retained so the missing-index regression and its correction are reviewable.
