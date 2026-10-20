# Planning and integrations implementation evidence

Date: 2026-10-13. Scope: the Jira product audit's epic/release planning, Kanban metrics, manual development references and basic stage assignment automation.

## Implemented behavior

- Project Planning creates/edits typed epics and releases with target dates, planning status, derived progress and paginated linked issues. Issue details independently assign/clear an epic and release without changing Task/Bug/Subtask types.
- Kanban reports show completion throughput, measured average cycle time, current aging and unfinished direct blockers. The inclusive UTC date window is at most 366 days, with bounded daily results and separately paginated current work. Timing reads immutable status events, including initial active creation and reopen episodes, without using updatedAt.
- Issue Development creates/edits/removes manual PR/commit/other HTTP/HTTPS references. The backend validates safe absolute URLs without fetching them; removal retains tombstones.
- Project Automation lets Administrators enable/disable a single eligible-assignee rule per stage. The issue-service callback runs after normal workflow/completion checks inside the same mutation transaction and records reassignment audit/notifications. Ineligible configuration stops assigning. Pending backlog work applies rules on activation.
- REST and MCP invoke the same concrete services, using current authorization, typed revisions, caller-scoped exact retry receipts and signed pagination. Seven planning and four integration operations were added to the shared catalog alongside the other audit additions, for 78 total operations and 40 mutations.

Backend feature packages are `backend/internal/features/planning` and `backend/internal/features/integrations`. Frontend feature packages mirror those names. Schema additions are migration 00008 planning and the integration tables in migration 00010. Central application routing registers both features and injects their transaction-bound service callbacks.

## Focused verification completed

All tests use explicit local PostgreSQL configuration and independently created `gg_test_*` databases, preserving the developer database.

| Check | Result |
| --- | --- |
| Planning PostgreSQL race tests | Passed in 4.730s in the final focused run; revisions, concurrent CAS, access loss, cursor scope, retries, progress, reopening, unmeasured completion and custom history fixtures |
| Initial active creation history | Passed; initial Review→Done is measured, To do→Done without an active start is unmeasured |
| REST report date queries | Passed; required YYYY-MM-DD strings are parsed into typed CalendarDate at the transport boundary |
| Integrations PostgreSQL race tests | Passed in 4.288s; URL validation, permissions/revocation, pagination, conflicts, tombstones, cross-channel retries, real move-time assignment/notification and rule eligibility |
| Catalog/contract tests | Passed in 2.428s after generation; all 78 operations/40 mutations and self-contained design schema references |
| OpenAPI/sqlc/SDK generation | Passed after the report query fix; generated schema and client code preserved |
| Strict application TypeScript and browser-test TypeScript | Passed after project-route response guards and actual-stage/in-memory-auth browser fixture corrections |
| Complete backend race suite and go vet | All packages passed |
| Generated artifact drift and architecture boundaries | Passed |
| Complete REST/MCP parity | All 78 operations and 40 mutation replay checks passed in 333.766s |
| Focused browser rerun | 15/15 passed, including both planning/integration journeys |
| Final complete browser suite | 77 functional cases passed in one clean run (3.4 minutes), including both planning/integration journeys |
| Live additive migrations and authenticated reads | Migrations 8–10 applied while preserving existing data; Owner planning, preferences and report reads returned 200 |

`backend/tests/parity/audit_planning_integrations_test.go` extends the unchanged base 60-operation parity helper with all 11 planning/integration operations; the remaining seven audit operations are covered in the same complete matrix. All 78 operations and 40 saved mutation replays passed in 333.766s in the full PostgreSQL race run. Live report parity checks that snapshot/age differences equal elapsed observation time, then compares every remaining typed field exactly. The full backend race suite, go vet, generated-artifact drift check and architecture checks also passed.

Both isolated journeys in `frontend/e2e/planning-integrations.spec.ts` passed in the focused 15/15 browser rerun. They verify Arabic epic/release creation, saved issue association, progress/completion reports, manual link edit/removal and actual reviewer assignment via automation. The journeys read real workflow stage IDs, use accessible combobox roles and sign in after full navigation because local tokens stay in memory. The final complete functional suite passes all 77 cases, including both journeys. Navigation timing was measured separately.

The passing final run captured these accepted screens in the preserved local evidence directory:

- [Epics and releases](../../../.local/browser-evidence/audit-implementation-2026-10-13/planning-epics-releases.png)
- [Kanban reports](../../../.local/browser-evidence/audit-implementation-2026-10-13/kanban-reports.png)
- [Stage assignment automation](../../../.local/browser-evidence/audit-implementation-2026-10-13/stage-assignment-automation.png)
- [Development links](../../../.local/browser-evidence/audit-implementation-2026-10-13/development-links.png)

## Report performance and query plans

The opt-in `TestKanbanReportRepresentativeQueryPlans` seeds two projects, 2,000 issues and 20,000 status transitions. Each project has repeated completion/reopen episodes; half its work remains active. A 31-day report verifies 2,500 completed/measured episodes, 2.4-day average, 500 active issues and a 25-record current-work page with continuation. It exercises the actual service and SQL view, plus EXPLAIN ANALYZE for summary/current-work queries.

The completion view uses ordered window calculations to derive episode boundaries and first recorded starts, avoiding repeated correlated scans per completed episode. Current-work history uses the existing indexed issue/project activity access. PostgreSQL chose `activity_issue_transitions` plus issue-number, user and active-dependency indexes; the older `activity_events_issue_page_idx` remains available for issue-only history predicates. No speculative extra index was added.

Final local race-enabled run: 12 warmed report trials, p50=64.63ms, p95=98.00ms; summary EXPLAIN=28.36ms, current-work EXPLAIN=1.59ms. All focused planning tests including this fixture passed in 7.194s. Typed query-plan evidence is retained in [planning-report-performance-local.json](planning-report-performance-local.json). This is local regression evidence, not Cloud Run latency acceptance. The test's 1500ms ceiling tolerates shared-host load; production performance still requires the deployment load checks.

## Deliberate scope limits

Development integration is manual URL linking; repository webhooks, commit ingestion and provider OAuth are not implemented. Automation supports stage-entry assignment only. Planning supports epics/releases rather than Scrum sprint scheduling. No Auth0 development tenant or production Google Cloud acceptance was available for this local implementation. Those distinctions remain explicit in the product audit and deployment checks.
