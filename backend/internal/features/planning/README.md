# Project planning and Kanban reports

This feature owns project epics/releases, issue planning associations and history-based Kanban reporting. It keeps Task/Bug/Subtask issue types and existing parent relationships intact. `RegisterHTTP` and `RegisterMCP` call the same typed `Service`; generated OpenAPI, SDK and Zod validators come from the Go contracts.

`planning_items` stores immutable epic/release kind, name, description, nullable target date and planned/active/complete status. Members and Administrators manage active projects; Viewers can read. Linked progress is derived from current nonarchived issues. `planning_issue` stores each issue's optional epic/release with an independent revision: `0` before a saved row, positive revisions thereafter. Associations require the same project and correct kind.

Every write uses the shared command runner: current authorization, short project lock, revision CAS, caller-scoped idempotency and retained actor-attributed audit. A replay across REST/MCP preserves the saved result and event; a no-op creates no event. Planning conflicts expose a typed current planning record. Collections use signed pages with a default 25/max 100 limit and the ordinary 1 MiB envelope budget.

Reports accept an inclusive UTC date window of at most 366 days. The SQL views in migration 00008 read retained status fields rather than `updated_at`. Initial In progress/Review creation starts a measured episode; an unfinished→Done transition counts a completion. First In progress/Review entry starts its clock, returning to To do retains it, and reopening Done starts another episode. A completion without a recorded start counts throughput but contributes nothing to the nullable cycle-time average. The current-work page excludes archived, backlog and Done issues, reports current unfinished direct blockers, and calculates creation/cycle age at explicit `snapshotAt`.

The issue-time and project-time activity indexes in migration 00003 support correlated history lookups and the bounded completion window. Migration00008 adds project/issue transition and planning pagination/progress indexes. Keep timing definitions stable when modifying SQL; historical stage category prefixes survive stage renames and retirement.

Focused verification:

```sh
source ../scripts/tool-env.sh
TEST_DATABASE_URL='postgres://gategoldjira:local-development-only@127.0.0.1:54329/gategoldjira?sslmode=disable' REQUIRE_POSTGRES_TESTS=1 go test -race -count=1 ./internal/features/planning
RUN_SCALE_TESTS=1 TEST_DATABASE_URL='postgres://gategoldjira:local-development-only@127.0.0.1:54329/gategoldjira?sslmode=disable' REQUIRE_POSTGRES_TESTS=1 go test -count=1 -run TestKanbanReportRepresentativeQueryPlans -v ./internal/features/planning
```

Tests create/drop independent `gg_test_*` databases. They cover access loss, typed conflicts, concurrent changes, cursor scope, cross-channel retry, history/reopen timing, unmeasured completions, active initial creation, HTTP calendar query parsing and an opt-in 20,000-transition query-plan/performance fixture. The project-level frontend pages are `ProjectPlanningPage` and `KanbanReportPage`; the issue field component is `IssuePlanningComponent` (`gg-issue-planning`). Browser journeys live in `frontend/e2e/planning-integrations.spec.ts`.
