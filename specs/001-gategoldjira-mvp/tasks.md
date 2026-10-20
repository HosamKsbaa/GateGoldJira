---
description: "Executable full MVP task list with feature-first Angular/Go ownership"
---

# Tasks: GateGoldJira Full MVP

**Generated**: 2026-10-11. **Implementation started**: 2026-10-12. Checked tasks record completed, verified work; pending tasks and external acceptance gates are not complete.
**Input**: [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts](contracts/operations.json), [quickstart.md](quickstart.md) and the [constitution](../../.specify/memory/constitution.md).
**Prerequisites**: Approved feature-first plan and all contract/design artifacts. Git is initialized; feature directory is `specs/001-gategoldjira-mvp`.
**Tests**: Focused automated coverage is required by the specification's acceptance/security/concurrency criteria and constitution quality gates. Author the story behavior/contract cases before service implementation; establish failing behavior cases against concrete signatures, then pass them after implementation. A missing import alone is not useful failure evidence. This does not require blanket TDD or implementation-mirroring tests.
**Organization**: Setup, shared foundations, ten story phases in spec priority order, then full MVP verification/hosting. All ten stories are mandatory; US1 alone is an access-control increment, not the requested release.

## Format: `[ID] [P?] [Story] Description`

- Every checklist line has a sequential task ID, concrete action, repository-relative file paths and explicit requirement references where applicable.
- `[P]` permits concurrent work only within the documented wave after its listed prerequisites finish. It never overrides dependencies or permits shared-file edits.
- `[US1]`–`[US10]` map to the spec stories. Setup/foundation/polish tasks have no story label.
- `Depends: T...` adds task-specific prerequisites; every story also depends on the entire foundation checkpoint and its story dependencies below. Unmarked tasks follow their section order.
- Source artifacts are created during implementation. Generated SQL/SDK/validators are regenerated, never hand-edited. This task generation creates only documentation.

## Path Conventions and Ownership

Angular UI/API adapters live in `frontend/src/app/features/<feature>/`; app auth/config lives in `core/`, reused UI in `shared/`, immutable generated client in `api/generated/`. Go feature services/types/HTTP/MCP adapters/query inputs and colocated tests live in `backend/internal/features/<feature>/`; concrete runtime support lives in `backend/internal/platform/` and wiring in `backend/internal/app/`. Migrations stay in `backend/db/migrations/`; sqlc emits one package at `backend/internal/platform/database/dbgen/`.

Do not introduce global controllers/services/repositories trees, a layer hierarchy per feature, duplicated REST/MCP business rules, an event bus, caches/queues/microservices or custom fields/workflows. Reuse one caller/transaction/lock order for cross-feature changes. Existing schema-proposal.sql is preserved as a broader separate proposal and is not applied.

Tables shared by several stories, guarded completion/ranking, activity writing and the complete notification rule engine are intentionally foundational. US1 assignment cleanup needs the issue table, US2 creates the default board, and US4 moves must already respect blocker/child rules. Later stories add actual commands/UI, not permissive temporary business-rule stubs. Prepared fixtures make each acceptance scenario runnable without other features' screens.

Public services authenticate with separate REST/MCP audiences and one approved identity mapping. Deployment/tenant/employee/client values are external execution gates: build the reviewable config/harness first and run external actions only for an explicitly authorized configured target. Record unmet gates as pending, never as successful acceptance. No cloud provisioning/publishing is authorized by generating this document.

## Phase 1: Setup (Shared Infrastructure)
**Goal**: Create independently buildable Angular/Go applications and reproducible local tooling.
**Independent test / checkpoint**: Pinned dependencies install, both empty applications build, and local PostgreSQL starts without cloud credentials.
- [X] T001 Create the feature-first application skeleton and ignored-local-secret rules in `frontend/src/app/app.routes.ts`, `backend/cmd/gategoldjira/main.go` and `.gitignore`; follow plan.md ownership rules and preserve all Spec Kit files. Do not initialize or overwrite the protected Git placeholder. Covers: FR-028.
- [X] T002 Pin the researched Go/Huma/MCP/pgx/sqlc/goose/auth/storage dependencies and build image in `backend/go.mod`, `backend/go.sum` and `backend/Dockerfile`; use exact versions/image digests from research.md and record any compile-required adjustment in research.md. Gate: constitution-required typed architecture/tooling/operation.
- [X] T003 Initialize standalone Angular with strict TypeScript, strictTemplates, typed forms, CDK, generated fetch SDK/Zod and lazy Tiptap dependencies in `frontend/package.json`, `frontend/package-lock.json`, `frontend/angular.json` and `frontend/tsconfig.json`; pin Node and researched versions. Depends: T001. Covers: FR-028.
- [X] T004 [P] Create the independently compiled strict TypeScript Action/config workspace in `identity/auth0/package.json`, `identity/auth0/tsconfig.json` and `identity/auth0/tenant.example.json`; declare separate REST/MCP audiences and manual public-client registration. Depends: T001. Covers: FR-001, FR-031.
- [X] T005 [P] Create persistent local PostgreSQL Compose, backend secret-free examples and browser public config in `compose.dev.yaml`, `backend/.env.example` and `frontend/public/config.example.json`; separate local storage/token modes and production mode. Depends: T001. Covers: FR-026.
- [X] T006 Configure meaningful Go/PostgreSQL fixtures and Vitest/Playwright runners in `backend/tests/testenv/postgres.go`, `frontend/vitest.config.ts` and `frontend/playwright.config.ts`; isolate test databases and pin auxiliary tools. Depends: T002, T003, T005. Covers: SC-002, SC-007.
- [X] T007 Create the quickstart generation/build/dev/test commands in `Makefile`, `scripts/generate-contracts.sh` and `scripts/check-generated.sh`; generate Huma OpenAPI, sqlc code, SDK and Zod validators reproducibly without editing generated output. Depends: T002, T003. Gate: constitution-required typed architecture/tooling/operation.
- [X] T008 Compile a concrete nullable/date/enum/decimal-revision/Unicode contract fixture in `backend/tests/contracts/fixture_test.go` and `frontend/src/app/api/contract-fixture.spec.ts`; generate its client/parsers and reject malformed JSON while tolerating additive response fields. Block feature work until all researched pins compile together. Depends: T007, T006. Covers: FR-023, FR-024, FR-032.
- [X] T009 Create independent Angular type/template/build and Go compile/vet/race jobs plus contract regeneration checks in `.github/workflows/ci.yml`; run real PostgreSQL checks, pinned dependency audits and govulncheck; enforce feature/platform import boundaries. Depends: T008. Gate: constitution-required typed architecture/tooling/operation.

## Phase 2: Foundational (Blocking Prerequisites)
**Goal**: Establish shared typed infrastructure and invariants before any public business operation.
**Independent test / checkpoint**: Real PostgreSQL tests prove lock ordering, retry semantics, guarded completion and atomic event persistence; both transports deny unauthenticated company access.
- [X] T010 Define concrete UUID IDs, revisions, calendar dates, actor/operation context and safe failures in `backend/internal/platform/command/types.go` and feature-owned `types.go` files under `backend/internal/features/`; match all wire enums/nullability in domain.schema.json, isolate dynamic SDK/JSON data and use Unicode counts. Covers: FR-011, FR-023, FR-024, FR-031, FR-034.
- [X] T011 Create ordered goose migration `backend/db/migrations/00001_identity_projects.sql` for company settings/guard, users/provider bindings, projects/membership tombstones and fixed status-order rows; enforce keys/email uniqueness, immutable relationships and retained attribution. Do not apply schema-proposal.sql. Covers: FR-002, FR-003, FR-006, FR-007, FR-008, FR-009, FR-036.
- [X] T012 Create `backend/db/migrations/00002_work_boards.sql` for issues, labels/associations, dependency tombstones, boards and shared ranks; include same-project FKs, Subtask-parent equivalence, fixed enums, project counters, default-board uniqueness and all planned query indexes. Depends: T011. Covers: FR-010, FR-011, FR-012, FR-015, FR-018, FR-037, FR-043, FR-048, FR-050, FR-052, FR-053, FR-055, FR-058.
- [X] T013 Create `backend/db/migrations/00003_collaboration.sql` for comments/immutable versions/references, pictures/reservations, activity events, notification dedupe and retry records; use restrictive historical FKs and retention/expiry indexes. Depends: T012. Covers: FR-019, FR-020, FR-025, FR-026, FR-027, FR-036, FR-040, FR-041, FR-047, FR-059, FR-061, FR-062.
- [X] T014 Configure explicit feature/platform query inputs and a single pgx output in `backend/sqlc.yaml`, `backend/internal/platform/database/queries.sql` and `backend/internal/platform/database/dbgen/`; generate typed SQL against all baseline migrations and map JSONB into validated concrete structs. Depends: T013, T010. Gate: constitution-required typed architecture/tooling/operation.
- [X] T015 Implement runtime-validated settings and bounded PostgreSQL pool/connector setup in `backend/internal/platform/config/config.go` and `backend/internal/platform/database/database.go`; default Africa/Cairo, propagate cancellation, max10/min0 pool, production IAM connector lazy refresh and reject development modes in Cloud Run. Depends: T014. Gate: constitution-required typed architecture/tooling/operation.
- [X] T016 [P] Implement verified issuer/signature/expiry/scope and audience-specific human-token adapters in `backend/internal/platform/auth/verifier.go`; validate provider responses and trusted first-binding claims, cache only signing keys, reject ID tokens/Google tokens/client-credentials impersonation. Depends: T015. Covers: FR-001, FR-031, FR-034.
- [X] T017 [P] Implement streaming private-object storage and explicit persistent local adapter in `backend/internal/platform/objectstore/store.go` and `backend/internal/platform/objectstore/local.go`; validate generations/checksums/provider responses and provide one two-transfer semaphore before large reads/decodes. Depends: T015. Covers: FR-026, FR-040, FR-041, FR-047.
- [X] T018 Implement the shared transaction/retry protocol in `backend/internal/platform/command/transaction.go`, `backend/internal/platform/command/retry.go` and `backend/internal/platform/command/queries.sql`: company shared/exclusive guard, caller retry claim before sorted project locks, canonical cross-transport hashes, 48h retention, current access before replay, authorized typed conflicts and ambiguous-commit retry guidance. Depends: T015. Covers: FR-005, FR-023, FR-024, FR-025, FR-026, FR-032, FR-034.
- [X] T019 Implement typed append-only activity writing in `backend/internal/features/activity/writer.go` and `backend/internal/features/activity/queries.sql`; one event identity per saved command, complete relevant changes and actor/channel/time, safe personal read-state metadata, no duplicate no-op/replay events or sensitive payload logs. Accept the existing transaction without importing producer features. Depends: T018. Covers: FR-027, FR-036.
- [X] T020 Implement synchronous notification rule evaluation/writing in `backend/internal/features/notifications/events.go` and `backend/internal/features/notifications/queries.sql`; accept concrete affected-issue facts plus existing transaction, implement the entire spec recipient table, current eligibility, actor exclusion, reason unions and event/issue/recipient uniqueness. Do not import issue/comment services or add a queue. Depends: T019. Covers: FR-060, FR-061, FR-063, SC-013.
- [X] T021 [P] Implement combined explicit-blocker/parent-child graph queries and shared completion/reopen guards in `backend/internal/features/issues/prerequisites.go` and `backend/internal/features/issues/prerequisites.sql`; serialize checks with project locks and bound unfinished-work responses. All later move/create/link services must use these real guards, even before their UIs exist. Depends: T018, T012. Covers: FR-043, FR-044, FR-045, FR-046, FR-055, FR-057, FR-058.
- [X] T022 [P] Implement shared per-project/status gap ranks, append/midpoint/bounded rebalance and independent order revisions in `backend/internal/features/issues/order.go` and `backend/internal/features/issues/order.sql`; preserve hidden-card order and never change unrelated content revisions. Depends: T018, T012. Covers: FR-016, FR-018, FR-024.
- [X] T023 Implement typed parameterized filter/cursor primitives and payload budgeting in `backend/internal/platform/command/pagination.go`; signed operation/caller/filter/sort cursors, 25 default/100 max, 1MiB JSON pages, last-returned continuation, no cursor authority and safe errors. Depends: T010, T015. Covers: FR-014, FR-017, FR-021, FR-022, FR-023, FR-034, SC-006.
- [X] T024 Implement Huma setup and shared HTTP errors/middleware in `backend/internal/platform/httpapi/server.go`; exact CORS origins, authenticated production OpenAPI, only generic health/readiness/public auth metadata, Idempotency-Key mapping, unknown input rejection, deadlines and redacted correlation logging. Depends: T016, T018, T023. Covers: FR-001, FR-023, FR-024, FR-025, FR-031, FR-034, FR-035.
- [X] T025 Implement official SDK stateless Streamable HTTP setup in `backend/internal/platform/mcpapi/server.go` and typed result/failure envelopes in `backend/internal/platform/mcpapi/result.go`; authenticate initialize/discovery/calls, public protected-resource metadata/challenge, separate MCP audience, supported protocols, 16MiB input/output caps, short picture text output and 30s transport/5s ordinary service deadlines. Acquire the shared transfer gate before SDK body decoding for large or unknown-length requests, not only after base64 allocation. Depends: T016, T018, T017, T023. Covers: FR-001, FR-023, FR-025, FR-030, FR-031, FR-032, FR-034.
- [X] T026 Regenerate all accumulated foundational query inputs serially before compiling and wire runtime/concrete feature dependencies in `backend/internal/app/app.go` and `backend/cmd/gategoldjira/main.go`; keep platform independent of features, producer->notification/activity and comments->pictures dependencies acyclic, share transactions, and register only implemented services. Parallel helper tasks author separate source/query files; this join owns the shared sqlc output. Depends: T019, T020, T021, T022, T024, T025. Gate: constitution-required typed architecture/tooling/operation.
- [X] T027 [P] Add and run real PostgreSQL concurrency tests in `backend/tests/integration/foundation_test.go` for guard/project/retry lock order, duplicate retries/different input, rollback audit+notification atomicity, graph cycles, parent races and rank rebalance. Verify migrations from an empty database and prevent partial commits. Depends: T026. Covers: FR-024, FR-025, FR-026, FR-027, FR-045, FR-057, FR-061, SC-005, SC-008, SC-012, SC-013.
- [X] T028 [P] Add and run typed boundary/transport tests in `backend/tests/contracts/boundaries_test.go` for both MCP branches, null/date/Unicode limits, unknown inputs, additive response compatibility, wrong audiences and oversize/busy outcomes. Add malformed-response browser fixtures in `frontend/src/app/api/generated-client.spec.ts`. Depends: T026. Covers: FR-001, FR-023, FR-031, FR-032, FR-034, SC-002.
- [X] T029 Complete local owner/fixture CLI scaffolding, seed isolated records for every story and validate the quickstart commands in `backend/cmd/gategoldjira/fixtures.go` and `specs/001-gategoldjira-mvp/quickstart.md`; both applications build separately and no paid cloud is required. Depends: T027, T028. Gate: constitution-required typed architecture/tooling/operation.

**Blocking checkpoint**: Finish every foundational task before starting a story. No domain request may bypass these shared rules.

## Phase 3: User Story 1 — Control Company and Project Access (P1)
**Goal**: Approved users sign in with current company/project roles; Admins manage access safely.
**Independent test / checkpoint**: With prepared Admin/two projects, approve and bind a Member/Viewer, exercise both channels, revoke access/clear assignments, and reject removal of the last active Admin.

### Tests and acceptance fixtures
- [X] T030 [P] [US1] Author failing real PostgreSQL lifecycle/role/binding tests in `backend/internal/features/identity/service_test.go`; include last-Admin races, preserved memberships, one-time provider binding, assignment cleanup and historical attribution. Depends: T029. Covers: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, SC-002.
- [X] T031 [P] [US1] Author catalog-driven permission/privacy fixtures in `backend/internal/features/identity/transport_test.go` for get_me, users, memberships, assignees and mention candidates; verify summary-only selections, tombstone revision0/regrant, inactive and unrelated accounts. Depends: T029. Covers: FR-001, FR-003, FR-004, FR-005, FR-006, FR-013, FR-059, SC-002.

### Implementation and verification
- [X] T032 [US1] Implement typed identity/membership commands and authorized queries in `backend/internal/features/identity/types.go` and `backend/internal/features/identity/queries.sql`; expose only permitted fields, case-insensitive emails and retained membership revisions; regenerate SQL. Depends: T030, T031. Covers: FR-002, FR-003, FR-004, FR-013, FR-022, FR-059.
- [X] T033 [US1] Implement approved-account issuer/subject binding and owner-only Admin bootstrap in `backend/internal/features/identity/binding.go`, `backend/cmd/gategoldjira/bootstrap.go` and `identity/auth0/src/verified-email-action.ts`; trust validated verified claims only for first binding, never self-register/rebind after email changes. Depends: T032, T004. Covers: FR-001, FR-002, FR-031.
- [X] T034 [US1] Implement approval/update/disable/Admin lifecycle, effective roles and next-action account checks in `backend/internal/features/identity/service.go`; exclusive company guard protects last Admin and atomically clears newly ineligible assignments with history across sorted projects. Restore never reassigns old work. Depends: T033. Covers: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-013, FR-027, FR-036.
- [X] T035 [US1] Implement grant/change/remove membership and minimal eligible-assignee/mention lists in `backend/internal/features/identity/membership.go`; archive permits membership administration, current eligibility governs all queries and mutations, tombstones protect regrant conflicts. Depends: T034. Covers: FR-003, FR-004, FR-005, FR-013, FR-022, FR-024, FR-059.
- [X] T036 [P] [US1] Implement all nine identity catalog REST operations in `backend/internal/features/identity/http.go` with concrete Huma DTOs and the same identity service. Depends: T035. Covers: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-013, FR-023, FR-059.
- [X] T037 [P] [US1] Implement the same nine named tools in `backend/internal/features/identity/mcp.go`, including candidate summaries and actual caller semantics; publish concrete schemas and delegate every rule to the identity service. Depends: T035. Covers: FR-030, FR-031, FR-032, FR-059.
- [X] T038 [US1] Register identity adapters and regenerate OpenAPI/SQL/SDK/validators via `backend/internal/app/app.go` and `scripts/generate-contracts.sh`; verify catalog compatibility before Angular consumes the client. Depends: T036, T037. Gate: constitution-required typed architecture/tooling/operation.
- [X] T039 [US1] Implement public config validation, PKCE sign-in/get_me and generated-client authentication in `frontend/src/app/core/auth/auth.service.ts` and `frontend/src/app/core/config/config.service.ts`; isolate local fixture mode, derive UI permissions from fresh server data and clear stale protected state on denial. Depends: T038. Covers: FR-001, FR-003, FR-005, FR-028, FR-034.
- [X] T040 [US1] Implement typed approved-user/role and project-membership forms in `frontend/src/app/features/administration/administration.api.ts`, `frontend/src/app/features/administration/pages/users/users.page.ts` and `frontend/src/app/features/administration/pages/memberships/memberships.page.ts`; show current conflicts, last-Admin failures, labels/focus and allowed actions. Depends: T039. Covers: FR-002, FR-003, FR-004, FR-006, FR-028, FR-029, FR-035.
- [X] T041 [US1] Wire lazy Admin/auth routes in `frontend/src/app/app.routes.ts` and pass `frontend/e2e/access.spec.ts` plus the authored service/transport cases; prove permissions change on the next read/write in REST/MCP and no public registration. Depends: T040. Covers: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-029, FR-032, FR-034, SC-002, SC-007.

## Phase 4: User Story 2 — Create and Organize Projects (P1)
**Goal**: Create recognizable projects with a default board and preserve archived work.
**Independent test / checkpoint**: Create/edit a project, reject duplicate/changed keys, archive while another writer edits, administer membership, restore, and verify retained content through REST/MCP.

### Tests and acceptance fixtures
- [X] T042 [P] [US2] Author lifecycle/default-board/archival race cases in `backend/internal/features/projects/service_test.go` using prepared issues/comments and current identity fixtures. Depends: T041. Covers: FR-007, FR-008, FR-009, FR-015, FR-024, FR-026, FR-036.
- [X] T043 [P] [US2] Author field-boundary, permissions, pagination and six-operation REST/MCP fixtures in `backend/internal/features/projects/transport_test.go`; project text must remain plain text. Depends: T041. Covers: FR-007, FR-008, FR-009, FR-022, FR-023, FR-032, FR-035.

### Implementation and verification
- [X] T044 [US2] Implement concrete project commands and authorized list/get/write queries in `backend/internal/features/projects/types.go` and `backend/internal/features/projects/queries.sql`; normalize immutable key, preserve revisions and regenerate SQL. Depends: T042, T043. Covers: FR-007, FR-008, FR-009, FR-022, FR-024.
- [X] T045 [US2] Implement project creation/edit/archive/restore in `backend/internal/features/projects/service.go`; atomically create default All Issues board with unset WIP and four order rows, retain content/memberships, reject archive races and emit shared audit/retry results. Depends: T044. Covers: FR-007, FR-008, FR-009, FR-015, FR-025, FR-026, FR-027, FR-036, FR-053.
- [X] T046 [P] [US2] Implement list_projects/get_project/create_project/update_project/archive_project/restore_project in `backend/internal/features/projects/http.go`. Depends: T045. Covers: FR-007, FR-008, FR-009, FR-023.
- [X] T047 [P] [US2] Implement the same six typed service-backed tools in `backend/internal/features/projects/mcp.go`. Depends: T045. Covers: FR-030, FR-031, FR-032.
- [X] T048 [US2] Register project adapters and regenerate contracts/client through `backend/internal/app/app.go` and `scripts/generate-contracts.sh`; verify both authored transport fixtures. Depends: T046, T047. Gate: constitution-required typed architecture/tooling/operation.
- [X] T049 [US2] Implement project selection, typed create/edit/archive/restore forms, active/archived views and empty states in `frontend/src/app/features/projects/projects.api.ts`, `frontend/src/app/features/projects/pages/project-list/project-list.page.ts` and `frontend/src/app/features/projects/projects.routes.ts`; compose membership administration without coupling feature pages. Depends: T048. Covers: FR-007, FR-008, FR-009, FR-028, FR-029, FR-035.
- [X] T050 [US2] Run lifecycle/parity and keyboard browser cases in `frontend/e2e/projects.spec.ts`; reload/sign-out/restart and verify default board/history/membership restoration and inaccessible-project nondisclosure. Depends: T049. Covers: FR-009, FR-015, FR-026, FR-029, FR-032, FR-033, FR-036, SC-002, SC-005, SC-007.

## Phase 5: User Story 3 — Create, Find, and Assign Issues (P1)
**Goal**: Record independent issue work, search accessible projects and assign responsibility.
**Independent test / checkpoint**: Create defaults, search/My Issues with AND filters, assign/clear, reject stale or ineligible changes, retry across channels and retain immutable identifiers/reporter after restart.

### Tests and acceptance fixtures
- [X] T051 [P] [US3] Author issue creation/assignment/number-allocation/retry/concurrency cases in `backend/internal/features/issues/service_test.go`; exercise existing guard/rank/event helpers and Subtask immutability with seeded children. Depends: T050. Covers: FR-010, FR-011, FR-012, FR-013, FR-023, FR-024, FR-025, SC-005.
- [X] T052 [P] [US3] Author search/get/create/update parity fixtures in `backend/internal/features/issues/transport_test.go`; cover all typed filters, unknown fields, unavailable records, explicit nulls, fresh-read full replacements and authorized bounded results. Depends: T050. Covers: FR-014, FR-022, FR-023, FR-024, FR-032, FR-034, SC-002, SC-006.

### Implementation and verification
- [X] T053 [US3] Implement issue commands and bounded authorized queries in `backend/internal/features/issues/types.go`, `backend/internal/features/issues/queries.sql` and `backend/internal/features/issues/search.go`; exact key/case-insensitive substring and AND filters include dates/labels/parent/blocked state and prerequisiteFor continuation, stable modified order, aggregates and no N+1. Regenerate SQL. Depends: T051, T052. Covers: FR-010, FR-011, FR-012, FR-014, FR-022, FR-044, FR-049, FR-051, FR-056.
- [X] T054 [US3] Implement create/read/update/assign/clear in `backend/internal/features/issues/service.go`; atomically allocate identifiers, append shared rank, preserve reporter/project/parent, validate current assignee and all editable fields including dueDate/labelIds, reject ordinary Subtask creation/conversion and commit event/audit/retry/notifications together. Depends: T053. Covers: FR-010, FR-011, FR-012, FR-013, FR-018, FR-023, FR-024, FR-025, FR-026, FR-027, FR-048, FR-050, FR-056, FR-058, FR-060, FR-061.
- [X] T055 [P] [US3] Implement search_issues/get_issue/create_issue/update_issue in `backend/internal/features/issues/http.go`; expose derived blockers/overdue/child progress and all four order revisions for detail moves. Depends: T054. Covers: FR-014, FR-022, FR-023, FR-044, FR-049, FR-056.
- [X] T056 [P] [US3] Implement the same four typed tools in `backend/internal/features/issues/mcp.go` with identical fields/defaults/retry/current-state outcomes. Depends: T054. Covers: FR-030, FR-031, FR-032, FR-034.
- [X] T057 [US3] Register issue adapters and regenerate typed contracts/client through `backend/internal/app/app.go` and `scripts/generate-contracts.sh`. Depends: T055, T056. Gate: constitution-required typed architecture/tooling/operation.
- [X] T058 [US3] Implement the validated generated-client adapter and typed forms in `frontend/src/app/features/issues/issues.api.ts` and `frontend/src/app/features/issues/components/issue-form/issue-form.component.ts`; preserve all fields from fresh reads, distinguish retries/new intentions and reject stale writes visibly. Depends: T057. Covers: FR-010, FR-011, FR-013, FR-023, FR-024, FR-025, FR-029.
- [X] T059 [US3] Implement paginated search/My Issues and plain-text issue details in `frontend/src/app/features/issues/pages/issue-list/issue-list.page.ts`, `frontend/src/app/features/issues/pages/issue-detail/issue-detail.page.ts` and `frontend/src/app/features/issues/issues.routes.ts`; lazy data sections, assignee summaries, blocked/overdue/progress projections and clear empty/read-only states. Depends: T058. Covers: FR-012, FR-013, FR-014, FR-022, FR-028, FR-029, FR-035, FR-044, FR-049, FR-056.
- [X] T060 [US3] Run prepared-fixture issue/assignment/parity and keyboard tests in `frontend/e2e/issues.spec.ts`; check Unicode limits, concurrent unique numbering, all unchanged search pages, conflict recovery, retry with the original reference and restart persistence. Depends: T059. Covers: FR-010, FR-011, FR-012, FR-013, FR-014, FR-022, FR-024, FR-025, FR-026, FR-029, FR-032, FR-033, SC-002, SC-005, SC-006, SC-007.

## Phase 6: User Story 4 — Create and Use Kanban Boards (P1)
**Goal**: Use named shared views with drag/keyboard order, Review and soft WIP warnings.
**Independent test / checkpoint**: With seeded dates/labels/children/blockers, create a saved view, load all columns, drag/reorder hidden-card views, use keyboard alternatives, archive/restore and compare full saved-view WIP counts in both channels.

### Tests and acceptance fixtures
- [X] T061 [P] [US4] Author ownership/default-board/WIP/count/order/rebalance cases in `backend/internal/features/boards/service_test.go`; seed blocked issues and children, preserve unseen-card relative order and reject stale source-board/order revisions. Depends: T060. Covers: FR-015, FR-016, FR-017, FR-018, FR-024, FR-037, FR-038, FR-052, FR-053, FR-054, SC-008, SC-014.
- [X] T062 [P] [US4] Author seven board and two issue-movement catalog fixtures in `backend/internal/features/boards/transport_test.go`; include full saved versus visible counts, archived-board reads/move denials, permission loss and parameter intersections. Depends: T060. Covers: FR-017, FR-022, FR-023, FR-032, FR-037, FR-038, FR-054, SC-002, SC-006, SC-014.

### Implementation and verification
- [X] T063 [US4] Implement typed board settings/snapshots/card queries in `backend/internal/features/boards/types.go` and `backend/internal/features/boards/queries.sql`; casefold unique names, saved+temporary AND filters, REPEATABLE READ initial counts/pages, 1MiB portions and order-aware cursor invalidation. Regenerate SQL. Depends: T061, T062. Covers: FR-015, FR-017, FR-018, FR-022, FR-037, FR-038, FR-052, FR-053, FR-054.
- [X] T064 [US4] Implement create/read/update/archive/restore in `backend/internal/features/boards/service.go`; current creator write access/Admin, fixed default name/scope/no archive, nullable limits1..1000, saved counts unaffected by temporary filters/loading, no issue copies/content changes. Depends: T063. Covers: FR-015, FR-017, FR-025, FR-026, FR-027, FR-037, FR-038, FR-052, FR-053, FR-054.
- [X] T065 [US4] Implement guarded status move/reorder in `backend/internal/features/issues/move.go` and extend `backend/internal/features/issues/queries.sql`; require entity/source/target order and supplied-board revisions, actual neighbor IDs, append on status change, shared hidden order and bounded prerequisites. WIP never blocks a valid move; update derived dependent/parent events atomically. Depends: T064, T021, T022. Covers: FR-016, FR-018, FR-024, FR-025, FR-027, FR-044, FR-045, FR-052, FR-054, FR-057, FR-060, FR-061.
- [X] T066 [P] [US4] Implement seven board endpoints in `backend/internal/features/boards/http.go` and move_issue/reorder_issue in `backend/internal/features/issues/http.go`. Depends: T065. Covers: FR-015, FR-016, FR-017, FR-018, FR-037, FR-038, FR-052, FR-053, FR-054.
- [X] T067 [P] [US4] Implement the same board/move/order tools in `backend/internal/features/boards/mcp.go` and `backend/internal/features/issues/mcp.go`, returning counts/limits/warnings and consistent failures. Depends: T065. Covers: FR-030, FR-031, FR-032, FR-052, FR-053, FR-054.
- [X] T068 [US4] Register the board/movement adapters and regenerate contracts/client via `backend/internal/app/app.go` and `scripts/generate-contracts.sh`. Depends: T066, T067. Gate: constitution-required typed architecture/tooling/operation.
- [X] T069 [US4] Implement generated-client board/movement adapters in `frontend/src/app/features/boards/boards.api.ts` and typed saved/temporary filter controls in `frontend/src/app/features/boards/components/board-filters/board-filters.component.ts`; retain typed date/label/parent filters for later controls. Depends: T068. Covers: FR-017, FR-023, FR-024, FR-025, FR-028, FR-037.
- [X] T070 [US4] Implement named-board selection/create/manage/archive/restore and default/custom WIP controls in `frontend/src/app/features/boards/pages/board-settings/board-settings.page.ts`; show ownership/permission limits, conflicts and unset/1..1000 validation. Depends: T069. Covers: FR-028, FR-029, FR-035, FR-037, FR-038, FR-053.
- [X] T071 [US4] Implement fixed four-column Kanban with CDK dragging, keyboard status/Move Before/After controls and stable-ID cards in `frontend/src/app/features/boards/pages/kanban/kanban.page.ts` and `frontend/src/app/features/boards/components/issue-card/issue-card.component.ts`; show all required card fields and textual full-view WIP warnings. Depends: T069. Covers: FR-015, FR-016, FR-018, FR-028, FR-029, FR-044, FR-049, FR-052, FR-054, FR-056.
- [X] T072 [US4] Add bounded per-column load-more/windowing and safe optimistic state in `frontend/src/app/features/boards/boards.store.ts` and `frontend/src/app/features/boards/boards.routes.ts`; start25 cards/column, cap rendered cards, restore confirmed state on failure, explain filter exits and refresh invalidated cursors. Depends: T070, T071. Covers: FR-016, FR-017, FR-022, FR-024, FR-028, FR-029, FR-033, SC-003, SC-006.
- [X] T073 [US4] Run browser/service/parity cases in `frontend/e2e/boards.spec.ts`; test no issue changes from board settings, shared ordering, hidden cards, equal/exceeded WIP, Review/reopen persistence, all loaded portions and keyboard at768px. Re-run with later label/subtask controls before full MVP acceptance. Depends: T072. Covers: FR-015, FR-016, FR-017, FR-018, FR-026, FR-029, FR-032, FR-037, FR-038, FR-052, FR-053, FR-054, SC-006, SC-007, SC-008, SC-014.

## Phase 7: User Story 5 — Coordinate Work with Blocked-By Dependencies (P1)
**Goal**: Show another developer’s prerequisite work and prevent premature completion.
**Independent test / checkpoint**: Link A blocked by B, inspect both directions, reject Done until every blocker completes, reopen/remove links, and reject cross-project/self/combined parent cycles and stale races.

### Tests and acceptance fixtures
- [X] T074 [P] [US5] Author dependency/Done/reopen/cycle/race cases in `backend/internal/features/issues/dependencies_test.go`; use the foundation parent graph and existing status service, including multiple blockers and a Done dependent whose existing blocker reopens. Depends: T073. Covers: FR-043, FR-044, FR-045, FR-046, FR-057, FR-058, SC-008, SC-012.
- [X] T075 [P] [US5] Author list/add/remove dependency role/retry/conflict fixtures in `backend/internal/features/issues/dependencies_transport_test.go`; ensure reciprocal summaries, bounded unfinished lists and duplicate-add no-op. Depends: T073. Covers: FR-022, FR-024, FR-025, FR-032, FR-043, FR-044, FR-045, FR-046.

### Implementation and verification
- [X] T076 [US5] Implement directed list/add/remove and reciprocal/current blocked projections in `backend/internal/features/issues/dependencies.go` and `backend/internal/features/issues/dependencies.sql`; graph revisions, same-project constraints, combined-cycle CTE, no unfinished new blocker on Done and tombstones/history. Regenerate SQL and insert blocked/resolved recipient events in the existing transaction. Depends: T074, T075. Covers: FR-024, FR-025, FR-027, FR-036, FR-043, FR-044, FR-045, FR-046, FR-058, FR-060, FR-061.
- [X] T077 [P] [US5] Implement list_dependencies/add_dependency/remove_dependency in `backend/internal/features/issues/http.go`. Depends: T076. Covers: FR-023, FR-043, FR-044, FR-045, FR-046.
- [X] T078 [P] [US5] Implement the same concrete typed tools in `backend/internal/features/issues/mcp.go` without changing actor or workflow semantics. Depends: T076. Covers: FR-030, FR-031, FR-032, FR-043, FR-045, FR-046.
- [X] T079 [US5] Register dependency adapters and regenerate contracts/client via `backend/internal/app/app.go` and `scripts/generate-contracts.sh`. Depends: T077, T078. Gate: constitution-required typed architecture/tooling/operation.
- [X] T080 [US5] Implement Blocked By/Blocks management, eligible same-project issue selection and responsible-developer/status links in `frontend/src/app/features/issues/components/dependencies/dependencies.component.ts`; integrate typed failures and unfinished work navigation into issue details and board moves. Depends: T079. Covers: FR-028, FR-029, FR-043, FR-044, FR-045, FR-046.
- [X] T081 [US5] Run browser and both-channel graph/concurrency acceptance in `frontend/e2e/dependencies.spec.ts`; inspect every blocker, prohibit only premature Done, preserve dependent status after reopen and verify no duplicate/audit loss on retries. Depends: T080. Covers: FR-025, FR-026, FR-029, FR-032, FR-033, FR-043, FR-044, FR-045, FR-046, FR-058, SC-005, SC-007, SC-008, SC-012.

## Phase 8: User Story 6 — Work Through an MCP-Connected Assistant (P1)
**Goal**: Provide authenticated typed discovery, human OAuth compatibility and traceable service parity for the entire catalog.
**Independent test / checkpoint**: Reference client discovers concrete tools, executes approved core work and compares next web reads. Full50-tool/20-session acceptance runs after US7–US10 providers land; never substitute mock tools for missing features.

### Tests and acceptance fixtures
- [X] T082 [P] [US6] Author protocol/OAuth/discovery/no-impersonation parity cases in `backend/tests/mcp/protocol_test.go`; distinguish HTTP auth/protocol/business failures, validate both output branches and reject caller-ID injection. Scope executable cases to registered providers until the final full-catalog gate. Depends: T081. Covers: FR-001, FR-023, FR-030, FR-031, FR-032, FR-034, SC-002.
- [X] T083 [P] [US6] Author safe Admin-history tests in `backend/internal/features/activity/service_test.go`; retained attribution, stable resource filtering, relevant field changes and no private-inbox body/provider secrets. Depends: T081. Covers: FR-022, FR-027, FR-036.

### Implementation and verification
- [X] T084 [US6] Implement list_activity service/queries and both adapters in `backend/internal/features/activity/service.go`, `backend/internal/features/activity/queries.sql`, `backend/internal/features/activity/http.go` and `backend/internal/features/activity/mcp.go`; paginate time/id and enforce Admin authority with typed safe changes. Depends: T083. Covers: FR-022, FR-027, FR-030, FR-031, FR-032, FR-036.
- [X] T085 [US6] Implement the registered public Go-SDK OAuth/reference client in `backend/tests/mcp/client.go` with exact redirects, S256 PKCE, resource metadata/AS discovery and declared protocols; verify stateless initialization/calls across backend instances and restart. Depends: T082. Covers: FR-026, FR-030, FR-031, FR-032, FR-033, FR-034.
- [X] T086 [US6] Complete issuer/client deployment definitions and compatibility procedure in `identity/auth0/tenant.example.json` and `identity/auth0/README.md`; managed Google connection, separate audiences/scope, registered public clients/manual CIMD, DCR off unless a selected client requires managed configuration, entitlement checks before launch. No custom OAuth server. Depends: T085, T033. Covers: FR-001, FR-030, FR-031, FR-032.
- [X] T087 [US6] Implement shared catalog/schema/annotation checks in `backend/tests/contracts/catalog_test.go`; registered operation names match the catalog subset during incremental work, concrete self-contained input/output schemas, unknown fields rejected, honest readOnly/idempotent/destructive annotations and no generic SQL/send_notification/act_as tools. Final equality check belongs to T133. Depends: T082. Covers: FR-023, FR-025, FR-030, FR-031, FR-032.
- [X] T088 [US6] Register history and regenerate the client in `backend/internal/app/app.go`, then implement keyboard-accessible filtered Admin history in `frontend/src/app/features/administration/pages/activity/activity.page.ts`; keep personal inbox content private. Depends: T084. Covers: FR-027, FR-028, FR-029, FR-035.
- [X] T089 [US6] Run reference-client core identity/project/issue/board/dependency/history parity and next-browser-read cases in `backend/tests/parity/core_test.go`; record actual actor/event/retry consistency and wrong-audience/Viewer/revoked denials. Full rich-comment/date/child/inbox assistant acceptance is T135. Depends: T085, T086, T087, T088. Covers: FR-027, FR-030, FR-031, FR-032, FR-033, FR-034, SC-002, SC-005, SC-008.

**Completion dependency**: Transport/core parity is an early P1 increment. US6 remains open until all feature providers pass T133 and actual full assistant workflows pass T135; no mock tools satisfy missing features.

## Phase 9: User Story 7 — Discuss Work with HTML, Pictures, and Arabic (P2)
**Goal**: Save safe versioned bilingual rich comments with durable private pictures.
**Independent test / checkpoint**: Write/edit a bilingual formatted picture comment, compare both channels and old versions, exercise author-only/Viewer/revoked access, max files, failures and exact24h draft expiry.

### Tests and acceptance fixtures
- [X] T090 [P] [US7] Author rich-HTML/author/version/empty/Unicode/reference-set cases in `backend/internal/features/comments/service_test.go`; include malicious HTML, sanitized notices, old mention eligibility and retained pictures. Depends: T060, T089. Covers: FR-019, FR-020, FR-021, FR-023, FR-024, FR-025, FR-035, FR-036, FR-039, FR-042, FR-059, SC-009.
- [X] T091 [P] [US7] Author picture-format/size/draft/publication/retry/revocation/cleanup race cases in `backend/internal/features/pictures/service_test.go`; interrupted transfer, failed commit, generation preconditions, restore pause and no deletion of uncertain/published objects. Depends: T060, T089. Covers: FR-026, FR-036, FR-040, FR-041, FR-047, SC-009, SC-010.
- [X] T092 [US7] Author comment/version and all five picture transport fixtures in `backend/tests/parity/discussion_test.go`; compare multipart/base64 business inputs, typed errors, forbidden references and 16MiB/10MiB limits with no duplicate payload. Depends: T060, T089. Covers: FR-019, FR-020, FR-021, FR-022, FR-023, FR-032, FR-039, FR-040, FR-041, FR-042, FR-047, SC-009, SC-010.

### Implementation and verification
- [X] T093 [US7] Implement picture/reservation commands and permission/expiry queries in `backend/internal/features/pictures/types.go` and `backend/internal/features/pictures/queries.sql`; permanent metadata, technical lease/checksum states, draft uploader checks and issue association. Regenerate SQL. Depends: T091, T092. Covers: FR-022, FR-026, FR-040, FR-041, FR-047.
- [X] T094 [US7] Implement bounded PNG/JPEG/WebP header/MIME/10MiB validation and upload/gallery publication in `backend/internal/features/pictures/service.go` and `backend/internal/features/pictures/upload.go`; reserve before transfer, hold no project lock/DB connection during I/O, confirm generation then short current-permission commit, safe retry recovery and correct descriptions/filenames. Depends: T093, T017. Covers: FR-023, FR-025, FR-026, FR-027, FR-040, FR-041, FR-047.
- [X] T095 [US7] Implement comment-draft prepare/publish and current-gallery detach in `backend/internal/features/pictures/publication.go`; same-issue complete drafts, uploader+exact expiry checks, no accessible partial object, immutable published bytes and retained previous-version/current-reference history. Coordinate final metadata changes in the caller transaction without importing comments. Depends: T094. Covers: FR-024, FR-025, FR-027, FR-036, FR-041, FR-047.
- [X] T096 [US7] Implement bounded expiry/reservation/retry maintenance in `backend/internal/features/pictures/maintenance.go` and service-authenticated `backend/internal/platform/httpapi/maintenance.go`; exact24h SQL denial, hourly batches100/physical target25h, Google service token exact audience/allowlisted identity, known failed reservation+matching generation only, pause during restore and retain uncertain published objects. Depends: T095. Covers: FR-025, FR-036, FR-041, FR-047.
- [X] T097 [US7] Implement canonical HTML/mention/picture parsing, sanitation and plain-text derivation in `backend/internal/features/comments/html.go`; exact allowed nodes/attributes/HTTP(S) links, dir controls, matching explicit ID sets, safe labels, no remote/data images, max64KiB/5000 visible characters/five pictures and picture-only comments. Preserve original Unicode and return sanitation notices. Depends: T090, T092. Covers: FR-019, FR-023, FR-035, FR-039, FR-041, FR-042, FR-059.
- [X] T098 [US7] Implement comment commands/queries and add/edit/list/version service in `backend/internal/features/comments/types.go`, `backend/internal/features/comments/queries.sql` and `backend/internal/features/comments/service.go`; author-only current-write access even for Admin, immutable authorship/version references, oldest-first portions, new mention validation versus historical IDs, picture prepare outside locks/final atomic save plus notification facts/retry. Depends: T097, T095. Covers: FR-019, FR-020, FR-021, FR-022, FR-024, FR-025, FR-026, FR-027, FR-036, FR-039, FR-041, FR-042, FR-047, FR-059, FR-060, FR-061.
- [X] T099 [P] [US7] Implement four comment and five picture REST endpoints in `backend/internal/features/comments/http.go` and `backend/internal/features/pictures/http.go`; multipart mapping, authenticated binary proxy, safe Content-Disposition, private no-store/nosniff and current permissions on every read. Depends: T098, T096. Covers: FR-019, FR-020, FR-021, FR-023, FR-039, FR-040, FR-041, FR-047.
- [X] T100 [P] [US7] Implement the same nine service-backed tools in `backend/internal/features/comments/mcp.go` and `backend/internal/features/pictures/mcp.go`; HTML+plainText, strict bounded base64, shared semaphore before decode, one binary field and explicit short TextContent. Depends: T098, T096. Covers: FR-030, FR-031, FR-032, FR-039, FR-040, FR-041, FR-042, FR-047.
- [X] T101 [US7] Register comment/picture adapters and service-authenticated maintenance, then regenerate SQL/OpenAPI/client in `backend/internal/app/app.go` and `scripts/generate-contracts.sh`. Depends: T099, T100. Gate: constitution-required typed architecture/tooling/operation.
- [X] T102 [US7] Implement typed picture API and shared feature upload/gallery controls in `frontend/src/app/features/pictures/pictures.api.ts`, `frontend/src/app/features/pictures/components/picture-upload/picture-upload.component.ts` and `frontend/src/app/features/pictures/components/picture-gallery/picture-gallery.component.ts`; selection/paste/drop, preview/description, retry status and authenticated lazy blobs with object-URL cleanup/no service-worker cache. Depends: T101. Covers: FR-028, FR-029, FR-040, FR-041, FR-042, FR-047.
- [X] T103 [US7] Implement a lazy Angular Tiptap adapter/editor in `frontend/src/app/features/comments/components/comment-editor/comment-editor.component.ts` and `frontend/src/app/features/comments/comments.api.ts`; supported formatting, typed canonical references, Unicode/byte counters, inline previews, dir controls, notices and current-session unsent-text preservation on upload/save/conflict failures. Depends: T102. Covers: FR-019, FR-020, FR-023, FR-028, FR-029, FR-039, FR-040, FR-042, FR-047.
- [X] T104 [US7] Implement typed safe node rendering and paged thread/history in `frontend/src/app/features/comments/comment-renderer.ts` and `frontend/src/app/features/comments/components/comment-thread/comment-thread.component.ts`; no unsafe Angular bypass, authenticated images, preserved RTL/LTR/copy text, edited indicators and author-only controls. Compose gallery/thread into issue details. Depends: T103. Covers: FR-020, FR-021, FR-022, FR-028, FR-029, FR-035, FR-036, FR-039, FR-041, FR-042.
- [X] T105 [US7] Run both-channel security/Arabic/history/upload-failure and browser cases in `frontend/e2e/discussion.spec.ts` and `backend/tests/fixtures/arabic.json`; at least30 mixed examples, every supported format, valid picture-only content, Viewer reading, newly revoked copied downloads, draft expiry and restart. Load-time never waits for every full picture. Depends: T104. Covers: FR-019, FR-020, FR-021, FR-026, FR-029, FR-032, FR-033, FR-035, FR-036, FR-039, FR-040, FR-041, FR-042, FR-047, SC-007, SC-009, SC-010.

## Phase 10: User Story 8 — Organize Work with Due Dates and Labels (P2)
**Goal**: Set timezone-stable calendar deadlines and reusable Unicode project labels.
**Independent test / checkpoint**: Set/clear valid dates across company midnight, create casefold-reused/Arabic labels, enforce ten labels and combine inclusive/AND filters in lists and boards through both channels.

### Tests and acceptance fixtures
- [X] T106 [P] [US8] Author date/label/midnight/filter tests in `backend/internal/features/issues/dates_labels_test.go`; invalid/leap dates, past/today/undated/Done/reopen, casefold races, 40-character/ten-label caps, same-project IDs and reversed ranges. Depends: T073. Covers: FR-048, FR-049, FR-050, FR-051, SC-011.
- [X] T107 [P] [US8] Author list_labels/create_label plus issue/board date/filter parity cases in `backend/internal/features/issues/dates_labels_transport_test.go`; seeded subtasks keep independent labels/dates and archive denies writes. Depends: T073. Covers: FR-014, FR-022, FR-023, FR-032, FR-048, FR-049, FR-050, FR-051, SC-011.

### Implementation and verification
- [X] T108 [US8] Implement reusable label listing/create-or-reuse and date/label validation/projections in `backend/internal/features/issues/dates_labels.go` and `backend/internal/features/issues/dates_labels.sql`; preserve display text, casefold lookup keys, request-wide companyToday and parameterized inclusive/ALL filters. Extend existing update/events rather than duplicate commands; label-only changes notify nobody. Regenerate SQL. Depends: T106, T107. Covers: FR-014, FR-022, FR-023, FR-027, FR-048, FR-049, FR-050, FR-051, FR-060.
- [X] T109 [P] [US8] Implement list_labels/create_label and complete date/label contract fields in `backend/internal/features/issues/http.go`. Depends: T108. Covers: FR-048, FR-049, FR-050, FR-051.
- [X] T110 [P] [US8] Implement the same label tools and complete issue/search/board date semantics in `backend/internal/features/issues/mcp.go`. Depends: T108. Covers: FR-030, FR-031, FR-032, FR-048, FR-049, FR-050, FR-051.
- [X] T111 [US8] Regenerate typed contracts/client and register label adapters in `backend/internal/app/app.go` and `scripts/generate-contracts.sh`. Depends: T109, T110. Gate: constitution-required typed architecture/tooling/operation.
- [X] T112 [US8] Implement typed calendar and reusable-label controls in `frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts`; integrate into create/detail, My Issues/search and `frontend/src/app/features/boards/components/board-filters/board-filters.component.ts`; use calendar strings/server companyToday, Arabic labels and field errors without browser Date shifts. Depends: T111. Covers: FR-014, FR-028, FR-029, FR-048, FR-049, FR-050, FR-051.
- [X] T113 [US8] Run real PostgreSQL/parity and keyboard filter acceptance in `frontend/e2e/dates-labels.spec.ts`; company-midnight boundary with injected clock, all selected labels, unassigned/parent/date intersections, archived/Viewer denial, reopen overdue and whole-change rollback on excess labels. Depends: T112. Covers: FR-014, FR-023, FR-029, FR-032, FR-048, FR-049, FR-050, FR-051, SC-007, SC-011.

## Phase 11: User Story 9 — Split Work into Subtasks (P2)
**Goal**: Create one-level independent child work with guarded explicit parent completion.
**Independent test / checkpoint**: Create assigned children under a Task/Bug, read accurate progress/My Issues/board parent links, reject nesting/reparenting/type conversion and race parent Done against child create/reopen through both channels.

### Tests and acceptance fixtures
- [X] T114 [P] [US9] Author hierarchy/defaults/completion/cycle/concurrency tests in `backend/internal/features/issues/subtasks_test.go`; immutable same-project parent, no nested children/Subtask conversions, seeded blockers and Done-parent reopen protection. Depends: T081, T113. Covers: FR-011, FR-012, FR-045, FR-055, FR-056, FR-057, FR-058, SC-008, SC-012.
- [X] T115 [P] [US9] Author list_subtasks/create_subtask and independent child-work parity fixtures in `backend/internal/features/issues/subtasks_transport_test.go`; permissions, conflicts/retries, all editable fields and no automatic parent completion. Depends: T081, T113. Covers: FR-022, FR-024, FR-025, FR-032, FR-055, FR-056, FR-057, FR-058, SC-012.

### Implementation and verification
- [X] T116 [US9] Implement child create/list/progress in `backend/internal/features/issues/subtasks.go` and `backend/internal/features/issues/subtasks.sql`; non-Done Task/Bug only, own number/reporter/defaults/rank, immutable parent/type, combined guards under project lock and exact parent-created/last-child-Done notification facts. Existing issue/search/move services remain authoritative. Regenerate SQL. Depends: T114, T115. Covers: FR-011, FR-012, FR-018, FR-027, FR-055, FR-056, FR-057, FR-058, FR-060, FR-061.
- [X] T117 [P] [US9] Implement list_subtasks/create_subtask and finish child/progress read projections in `backend/internal/features/issues/http.go`. Depends: T116. Covers: FR-055, FR-056, FR-057, FR-058.
- [X] T118 [P] [US9] Implement the same child tools and immutable relationship/progress output in `backend/internal/features/issues/mcp.go`. Depends: T116. Covers: FR-030, FR-031, FR-032, FR-055, FR-056, FR-057, FR-058.
- [X] T119 [US9] Register child adapters and regenerate contracts/client through `backend/internal/app/app.go` and `scripts/generate-contracts.sh`. Depends: T117, T118. Gate: constitution-required typed architecture/tooling/operation.
- [X] T120 [US9] Implement bounded child list/create and Done/total progress in `frontend/src/app/features/issues/components/subtasks/subtasks.component.ts`; parent links/parent filters in details, My Issues and board cards, independent dates/labels/assignment/comments/pictures, prerequisite navigation and explicit reopen guidance. Depends: T119, T105. Covers: FR-014, FR-015, FR-028, FR-029, FR-055, FR-056, FR-057, FR-058.
- [X] T121 [US9] Run child browser/parity and real PostgreSQL races in `frontend/e2e/subtasks.spec.ts`; parent Done vs child create/reopen cannot commit invalid state, mixed parent/explicit cycles reject, last child only updates progress and due/label/content independence persists after restart. Depends: T120. Covers: FR-026, FR-029, FR-032, FR-045, FR-055, FR-056, FR-057, FR-058, SC-005, SC-007, SC-008, SC-012.

## Phase 12: User Story 10 — Mention People and Receive Notifications (P2)
**Goal**: Select validated teammate mentions and use a durable private in-app inbox.
**Independent test / checkpoint**: With reporter/assignee/Viewer/actor/revoked fixtures, exercise every recipient-table event, newly added mentions/dedupe, own-only counts and read/unread/mark-all in both channels, including Arabic and restart.

### Tests and acceptance fixtures
- [X] T122 [P] [US10] Author every recipient-table/new-mention/edit/no-op/dedupe case in `backend/internal/features/notifications/service_test.go`; current eligibility, actor exclusion, multiple roles/reasons and zero events from label-only/read-state/failed commands. Depends: T105, T113, T121. Covers: FR-059, FR-060, FR-061, FR-063, SC-013.
- [X] T123 [P] [US10] Author own-only inbox/count/read-state/mark-all and historical-mention parity/privacy fixtures in `backend/internal/features/notifications/transport_test.go`; Admin cannot inspect others, unknown/inaccessible same unavailable outcome, revoke races and accessible-snapshot marks. Depends: T105, T113, T121. Covers: FR-022, FR-024, FR-025, FR-032, FR-034, FR-059, FR-062, FR-063, SC-002, SC-013.

### Implementation and verification
- [X] T124 [US10] Finish current-reader selected mentions/candidate integration in `backend/internal/features/comments/mentions.go` and `backend/internal/features/identity/queries.sql`; parsed ID sets exactly match arguments, unselected @text stays plain, retained historical IDs are allowed but only eligible newly added mentions notify. Preserve server-controlled Arabic labels. Depends: T122, T123. Covers: FR-013, FR-022, FR-039, FR-042, FR-059, FR-060, FR-061.
- [X] T125 [US10] Implement personal newest-first list/get/summary/read-unread/mark-all service in `backend/internal/features/notifications/service.go`, `backend/internal/features/notifications/types.go` and `backend/internal/features/notifications/queries.sql`; current permission predicates for data/counts, shared company/sorted project locks then notification rows, revisions/retries, private audit metadata and no downstream events. Regenerate SQL. Depends: T122, T123. Covers: FR-022, FR-024, FR-025, FR-026, FR-027, FR-034, FR-062, FR-063.
- [X] T126 [US10] Verify and complete notification fact integration in `backend/internal/features/issues/service.go`, `backend/internal/features/issues/move.go`, `backend/internal/features/issues/dependencies.go`, `backend/internal/features/issues/subtasks.go` and `backend/internal/features/comments/service.go`; compare before/after blocked and last-child transitions, combine all affected-issue reasons in one transaction and never defer inbox delivery. Depends: T124, T125. Covers: FR-027, FR-060, FR-061, FR-063, SC-013.
- [X] T127 [P] [US10] Implement get_inbox_summary/list_notifications/get_notification/set_notification_read/mark_all_notifications_read in `backend/internal/features/notifications/http.go`; GET remains pure and returned counts/results reveal only the caller. Depends: T126. Covers: FR-062, FR-063.
- [X] T128 [P] [US10] Implement the same five typed tools in `backend/internal/features/notifications/mcp.go`; no recipient override or direct sending tool, same read-state and permission semantics. Depends: T126. Covers: FR-030, FR-031, FR-032, FR-059, FR-060, FR-061, FR-062, FR-063.
- [X] T129 [US10] Register inbox adapters and regenerate the client through `backend/internal/app/app.go` and `scripts/generate-contracts.sh`. Depends: T127, T128. Gate: constitution-required typed architecture/tooling/operation.
- [X] T130 [US10] Implement keyboard @ candidate selection/identity chips in `frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts` and compose it into the comment editor; summaries only, exact selected IDs, ordinary @text and historical mentions preserved. Depends: T129. Covers: FR-028, FR-029, FR-039, FR-042, FR-059.
- [X] T131 [US10] Implement personal typed inbox API/route/page and unread badge in `frontend/src/app/features/notifications/notifications.api.ts`, `frontend/src/app/features/notifications/pages/inbox/inbox.page.ts` and `frontend/src/app/features/notifications/notifications.routes.ts`; pagination/unread filter, explicit mark-on-open, read/unread/mark-all, refresh-on-open/actions and no live-sync worker. Preserve Arabic and current-access navigation. Depends: T130. Covers: FR-022, FR-028, FR-029, FR-033, FR-035, FR-062, FR-063.
- [X] T132 [US10] Run browser/service/parity and restart/revocation cases in `frontend/e2e/notifications.spec.ts`; at least100 producer trials, exact recipient/reason sets once, next-read availability p95<=5s, private read state, no hidden unread counts or further notification loops. Depends: T131. Covers: FR-026, FR-029, FR-032, FR-033, FR-059, FR-060, FR-061, FR-062, FR-063, SC-002, SC-007, SC-013.

## Phase 13: Polish & Cross-Cutting Concerns
**Goal**: Prove the entire MVP and prepare affordable, reproducible Google Cloud operation.
**Independent test / checkpoint**: All77 requirements have evidence, all50 operations and26 mutations pass parity, full workloads meet budgets, and deployment/recovery gates have concrete reviewable outputs.
- [X] T133 Run full50-operation catalog/REST/MCP schema and compatibility checks in `backend/tests/contracts/catalog_test.go`; exactly26 mutations carry retries, all errors/nullable outputs/filter/path rules and annotations match the design, protected discovery has no records and all required providers are real. Regenerate and verify zero drift. Depends: T132, T089. Covers: FR-022, FR-023, FR-024, FR-025, FR-030, FR-031, FR-032, FR-034.
- [X] T134 Complete/run full role/outcome/retry/concurrency/retention matrix in `backend/tests/parity/catalog_test.go` and `backend/tests/integration/retention_test.go`; every operation, all26 mutations replay within24h across channels, revoked replays denied, stale state safe, lists traverse once, audit/history retained after sign-out/restart/instance switch and no permanent-delete routes. Depends: T133. Covers: FR-001, FR-003, FR-005, FR-006, FR-022, FR-023, FR-024, FR-025, FR-026, FR-027, FR-030, FR-031, FR-032, FR-033, FR-034, FR-036, SC-002, SC-005, SC-006, SC-008, SC-009, SC-011, SC-012, SC-013, SC-014.
- [ ] T135 Execute and record at least20 complete actual assistant workflows in `backend/tests/mcp/assistant-workflows.md` using the selected client/version; all SC-004 actions including max-picture/OAuth, Arabic mention/inbox and WIP must work without web writes, then match the next browser read. This closes US6 only after all providers. Depends: T134, T105, T113, T121, T132. Covers: FR-030, FR-031, FR-032, FR-033, FR-039, FR-040, FR-042, FR-059, FR-062, SC-004.
- [X] T136 [P] Complete/run every FR-028 keyboard/focus/error/empty-state flow at desktop/tablet widths>=768 in `frontend/e2e/keyboard.spec.ts`; include drag alternatives, collapsed/loading WIP, conflicts/prerequisites, Arabic mixed identifiers and protected picture rendering. Use text rather than color-only state. Depends: T132. Covers: FR-028, FR-029, FR-035, FR-042, FR-052, FR-054, SC-007, SC-009, SC-014.
- [ ] T137 [P] Create prepared accounts, timed usability script and anonymized result sheet in `frontend/e2e/usability.spec.ts` and `specs/001-gategoldjira-mvp/validation/usability.md`; validate the core flow with>=10 representative employees and record>=90% completing in5min without assistance, or retain failed evidence for correction. Depends: T132. Covers: FR-028, FR-029, SC-001.
- [X] T138 Implement deterministic full-scale seed/load generation and reports in `backend/tests/performance/seed.go`, `backend/tests/performance/load_test.go` and `backend/tests/performance/report.go`; use every plan/spec quantity (50 users,20 projects,10k issues/2k children,20k comments,3 boards/project,1k links/1k pictures,10 labels/project,half dated,50k inbox entries,>=20%Arabic), max10MiB images and at least100 trials/action. Depends: T134. Covers: SC-003, SC-006, SC-010, SC-013.
- [ ] T139 [P] Create pinned Terraform candidate resources in `infra/terraform/main.tf`, `infra/terraform/variables.tf` and `infra/terraform/outputs.tf`: europe-west1 Cloud Run2nd gen/request billing/1vCPU/1GiB/concurrency40/min0/max2/boost/60s, Cloud SQL Enterprise18/db-g1-small/10GiBSSD/50GiB auto-growth cap, registry and private separate staging/published buckets. Validate/plan; provisioning requires an explicitly authorized target. Depends: T132. Covers: SC-003, SC-010.
- [X] T140 [P] Create static SPA Firebase rewrites, public runtime config, cache/security headers and independent build/deploy config in `infra/firebase/firebase.json`, `frontend/public/config.production.example.json` and `scripts/release-frontend.sh`; no backend/DB secrets in browser and no picture caching. Prepare reviewable deployment output. Depends: T132. Covers: FR-028, FR-035, FR-041.
- [X] T141 Implement least-privilege runtime/migration/maintenance IAM, Secret Manager injection, IAM DB authentication/encrypted connector route and separate bucket permissions in `infra/terraform/iam.tf` and `infra/terraform/secrets.tf`; published delete denied to runtime, public access prevented, authorized SQL networks empty and exact callback/CORS/service audiences. Depends: T139, T140. Covers: FR-001, FR-031, FR-041, FR-047.
- [X] T142 Implement daily30/PITR7/final30 backups, deletion protection, published30day soft delete, hourly authenticated Scheduler and gross-cost/performance alerts in `infra/terraform/recovery.tf` and `infra/terraform/monitoring.tf`; pin dedicated tier/min1 alternatives without silently applying them. Depends: T141. Covers: FR-026, FR-036, FR-041, FR-047.
- [ ] T143 Create actual-account deployment checklist and recurring-cost worksheet in `specs/001-gategoldjira-mvp/validation/hosting.md`; verify the $200 Cloud credit SKU scope/balance/expiry, actual regional/free-tier prices and Auth0 tenant/workforce/client entitlements. Reforecast gross min0 $32–46, min1 $45–60 and dedicated SQL $56–70 assumptions before selecting a target; do not treat credits as recurring savings. Depends: T142, T086. Gate: constitution-required typed architecture/tooling/operation.
- [ ] T144 Create the reviewable isolated test-target procedure in `scripts/prepare-test-target.sh` and `specs/001-gategoldjira-mvp/validation/test-target.md`; show the Terraform plan, artifact IDs, narrow identities, compiled Auth0 Action/client/audiences and fixture plan before execution. Only for an explicitly authorized test target, apply candidate infrastructure, additive migrations, backend/Firebase preview and approved fixtures; verify OAuth/health/backup availability and record URLs/region/builds. Keep production publication separate and record this gate pending if authorization/account inputs are absent. Depends: T143, T141, T142, T138. Gate: constitution-required typed architecture/tooling/operation.
- [ ] T145 Run full browser/API/picture/inbox and overload measurements in `frontend/e2e/performance.spec.ts` and `backend/tests/performance/load_test.go`; warm web p95<=2s, idle-start after30min p95<=5s, warm API read<=500ms/write<=750ms, upload>=100 trials p95<=30s and notifications>=100 p95<=5s. Record region/network/tier, query/lock/pool/memory, rendered-card bounds and no N+1. Measure max-image MCP once without duplicated base64, two-transfer saturation and temporary over-scaling. Cloud measurements require the authorized configured test target; local runs never claim Cloud acceptance. Depends: T138, T144. Covers: FR-017, FR-022, FR-040, FR-047, FR-063, SC-003, SC-006, SC-010, SC-013.
- [ ] T146 Resolve measured query/index/render/startup/pool bottlenecks in their owning feature files and record results in `specs/001-gategoldjira-mvp/validation/performance.md`; if tuning fails, benchmark/cost-review dedicated SQL or min1 before choosing them, then repeat only failed/newly affected checks. Do not declare the candidate tier fast merely because it is Go. Depends: T145. Covers: SC-003, SC-006, SC-010, SC-013.
- [ ] T147 Implement/run `make test-restore` in `backend/tests/recovery/restore_test.go` and document evidence in `specs/001-gategoldjira-mvp/validation/recovery.md`; authorized isolated cloud target only, verify backup/PITR plus immutable pictures/old versions/permissions/graphs/history/inbox, pause/reconcile cleanup, measure RPO<=5min/RTO<=4h, document cutover and quarterly drills and remove explicitly created drill resources. Depend on available backups; never claim unrun recovery passed. Depends: T142, T144, T134. Covers: FR-026, FR-036, FR-041, FR-047, SC-005.
- [X] T148 Create additive-migration/backend-first compatible release/canary/smoke and rollback procedure in `scripts/release-backend.sh` and `specs/001-gategoldjira-mvp/validation/release.md`; prior Go/Firebase artifacts available, migration identity separate, no destructive down migration, additive-response compatibility verified. Publish/apply only to explicitly authorized configured targets. Depends: T146, T147, T135, T136, T137. Covers: FR-026, FR-032, FR-033, FR-036.
- [X] T149 Run all relevant build/type/template/Go/static/generated/security checks, reproduce quickstart without paid cloud and assemble per-FR/SC evidence plus unresolved external gates in `specs/001-gategoldjira-mvp/validation/readiness.md` and `specs/001-gategoldjira-mvp/quickstart.md`; all ten stories define MVP scope, no incomplete cloud/auth/performance/usability claim. Update completion checkboxes only for work actually performed. Depends: T148. Gate: constitution-required typed architecture/tooling/operation.

## Dependencies & Execution Order

### Phase Dependencies

Setup -> all foundations -> business stories -> full verification/hosting/release. Phase headings follow spec priority; the graph below governs actual readiness. Each story's test files are authored before its models/services, feature services before adapters, adapter registration/generation before frontend clients, and behavior verification before its checkpoint. Serial tasks may touch shared files; do not schedule them in parallel.

### User Story Dependencies

| Story | Required implemented prerequisites | Completion gate |
| --- | --- | --- |
| US1 access | Entire foundation | T041 |
| US2 projects | US1 | T050 |
| US3 issues | US1, US2 | T060 |
| US4 boards/Review/WIP | US3; foundation completion/rank/event rules | T073; recheck date/child enhancements after US8/US9 |
| US5 dependencies | US3, US4 movement; foundation combined graph | T081 |
| US6 MCP | Foundation/US1 for OAuth; implemented feature providers for their tools | T089 early; T133 and T135 after US7–US10 for full story |
| US7 discussion/pictures/Arabic | US3 and core MCP harness; existing candidate/event primitives | T105; selected-mention UI completed in US10 |
| US8 dates/labels | US3, US4 for combined board filters | T113 |
| US9 subtasks | US3, US5 graph, US8 fields; US7 only for complete child discussion/gallery composition | T121 |
| US10 mentions/inbox | US7 plus all producers US3/US4/US5/US8/US9 | T132 |

```text
Setup -> Foundation -> US1 -> US2 -> US3 -> US4 -> US5
                                      |       |       |
                                      |       +-> US8 -> US9 --+
                                      +-> US6 core -> US7 -----+-> US10
                                                               |
                              all providers -> full US6 catalog/assistant gate
                                                               |
                         all acceptance + hosting/performance/restore -> release
```

US6 core does not depend on US10, so the final US6 gate creates no cycle. External production OAuth/client and cloud evidence can be collected only after the documented account/target prerequisites are available. All ordinary local development remains free of those dependencies.

### Parallel Opportunities and Examples per Story

Before concurrent work, finish each row's listed prerequisite tasks. Each pair below owns different files; the later serial register/generate task handles shared app/client output. Multiple developers are an execution option, not authorization to spawn agents during task generation.

| Story | Parallel authoring wave | Parallel adapter wave | Serial join |
| --- | --- | --- | --- |
| US1 | T030 + T031 | T036 + T037 after T035 | T038 |
| US2 | T042 + T043 | T046 + T047 after T045 | T048 |
| US3 | T051 + T052 | T055 + T056 after T054 | T057 |
| US4 | T061 + T062 | T066 + T067 after T065 | T068 |
| US5 | T074 + T075 | T077 + T078 after T076 | T079 |
| US6 | T082 + T083 | No shared registry/client edits concurrently | T089; final T135 |
| US7 | T090 + T091 | T099 + T100 after T098/T096 | T101 |
| US8 | T106 + T107 | T109 + T110 after T108 | T111 |
| US9 | T114 + T115 | T117 + T118 after T116 | T119 |
| US10 | T122 + T123 | T127 + T128 after T126 | T129 |

Additional safe waves: T004 + T005 after layout; T016 + T017 after runtime setup; T021 + T022 after command primitives; the two foundation test files after wiring; T136 + T137 after US10; T139 + T140 after all story providers. Story-level US7 and US8 work may overlap only with separate owners/files; edits to issues/queries, app wiring, generated outputs, board filters and migrations remain serialized.

## Contract Ownership

| Owner/story | Exact operation names (also MCP tools) |
| --- | --- |
| Identity / US1 | get_me, list_users, approve_user, update_user, list_memberships, set_membership, remove_membership, list_assignees, list_mention_candidates |
| Projects / US2 | list_projects, get_project, create_project, update_project, archive_project, restore_project |
| Issues / US3 | search_issues, get_issue, create_issue, update_issue |
| Boards + issue order / US4 | list_boards, create_board, get_board, list_board_cards, update_board, archive_board, restore_board, move_issue, reorder_issue |
| Issues dependencies / US5 | list_dependencies, add_dependency, remove_dependency |
| Activity / US6 | list_activity |
| Comments + pictures / US7 | list_comments, create_comment, update_comment, list_comment_versions, list_pictures, upload_picture, get_picture, download_picture, detach_gallery_picture |
| Issues labels / US8 | list_labels, create_label |
| Issues children / US9 | list_subtasks, create_subtask |
| Notifications / US10 | get_inbox_summary, list_notifications, get_notification, set_notification_read, mark_all_notifications_read |

The full catalog gate checks these50 unique actions and26 mutations; business logic is not copied into adapters. Broad issue updates carry due dates/labels from US3 because the wire contract already requires them; US8 adds dedicated selection/filter UI and label catalog commands. Foundation guards/event rules protect seeded and subsequently created children/blockers at every stage.

## Implementation Strategy

### First Increment and Full MVP Scope

Complete setup/foundations and US1 first; validate approved access before exposing company work. Then deliver projects/issues/boards/dependencies, core MCP, rich discussion, dates/labels, children and the complete inbox. These are validated increments; only the entire ten-story scope plus release gates is the requested MVP. Do not label an access-only or issue-only demo as the finished MVP.

### Incremental Delivery

At each story checkpoint pass its authored behavioral/DB/transport/browser cases with prepared fixtures, regenerate affected contracts and run static/build checks. Re-run an earlier workflow when a later feature changes it, particularly board/date/child composition and notification producer facts. Test actual assistant OAuth and maximum-image payload support, then measure the complete workload and restore objectives in the authorized target. Hosting setup/configuration is reviewable before external execution; report unmet external gates separately.

### Evidence and Handoff

Only mark tasks complete when their behavior and checks have actually run. Preserve failed measurements and adjust feature/query/config choices before retrying affected checks. The readiness report includes every requirement, versions/build IDs, real client/region/workload, recurring costs, migration/rollback and pending gates. No speculative deletion or scope expansion is part of this MVP.

## Requirement Coverage Index

Each reference below names actionable implementation or verification tasks; this index does not claim successful implementation. All14 SC require pre-release buildable fixtures/harnesses or validation work; none is a post-launch business KPI.

| Requirement | Task IDs |
| --- | --- |
| FR-001 | T004, T016, T024, T025, T028, T030, T031, T033, T034, T036, T039, T041, T082, T086, T134, T141 |
| FR-002 | T011, T030, T032, T033, T034, T036, T040, T041 |
| FR-003 | T011, T030, T031, T032, T034, T035, T036, T039, T040, T041, T134 |
| FR-004 | T030, T031, T032, T034, T035, T036, T040, T041 |
| FR-005 | T018, T030, T031, T034, T035, T036, T039, T041, T134 |
| FR-006 | T011, T030, T031, T034, T036, T040, T041, T134 |
| FR-007 | T011, T042, T043, T044, T045, T046, T049 |
| FR-008 | T011, T042, T043, T044, T045, T046, T049 |
| FR-009 | T011, T042, T043, T044, T045, T046, T049, T050 |
| FR-010 | T012, T051, T053, T054, T058, T060 |
| FR-011 | T010, T012, T051, T053, T054, T058, T060, T114, T116 |
| FR-012 | T012, T051, T053, T054, T059, T060, T114, T116 |
| FR-013 | T031, T032, T034, T035, T036, T051, T054, T058, T059, T060, T124 |
| FR-014 | T023, T052, T053, T055, T059, T060, T107, T108, T112, T113, T120 |
| FR-015 | T012, T042, T045, T050, T061, T063, T064, T066, T071, T073, T120 |
| FR-016 | T022, T061, T065, T066, T071, T072, T073 |
| FR-017 | T023, T061, T062, T063, T064, T066, T069, T072, T073, T145 |
| FR-018 | T012, T022, T054, T061, T063, T065, T066, T071, T073, T116 |
| FR-019 | T013, T090, T092, T097, T098, T099, T103, T105 |
| FR-020 | T013, T090, T092, T098, T099, T103, T104, T105 |
| FR-021 | T023, T090, T092, T098, T099, T104, T105 |
| FR-022 | T023, T032, T035, T043, T044, T052, T053, T055, T059, T060, T062, T063, T072, T075, T083, T084, T092, T093, T098, T104, T107, T108, T115, T123, T124, T125, T131, T133, T134, T145 |
| FR-023 | T008, T010, T018, T023, T024, T025, T028, T036, T043, T046, T051, T052, T054, T055, T058, T062, T069, T077, T082, T087, T090, T092, T094, T097, T099, T103, T107, T108, T113, T133, T134 |
| FR-024 | T008, T010, T018, T022, T024, T027, T035, T042, T044, T051, T052, T054, T058, T060, T061, T065, T069, T072, T075, T076, T090, T095, T098, T115, T123, T125, T133, T134 |
| FR-025 | T013, T018, T024, T025, T027, T045, T051, T054, T058, T060, T064, T065, T069, T075, T076, T081, T087, T090, T094, T095, T096, T098, T115, T123, T125, T133, T134 |
| FR-026 | T005, T013, T017, T018, T027, T042, T045, T050, T054, T060, T064, T073, T081, T085, T091, T093, T094, T098, T105, T121, T125, T132, T134, T142, T147, T148 |
| FR-027 | T013, T019, T027, T034, T045, T054, T064, T065, T076, T083, T084, T088, T089, T094, T095, T098, T108, T116, T125, T126, T134 |
| FR-028 | T001, T003, T039, T040, T049, T059, T069, T070, T071, T072, T080, T088, T102, T103, T104, T112, T120, T130, T131, T136, T137, T140 |
| FR-029 | T040, T041, T049, T050, T058, T059, T060, T070, T071, T072, T073, T080, T081, T088, T102, T103, T104, T105, T112, T113, T120, T121, T130, T131, T132, T136, T137 |
| FR-030 | T025, T037, T047, T056, T067, T078, T082, T084, T085, T086, T087, T089, T100, T110, T118, T128, T133, T134, T135 |
| FR-031 | T004, T010, T016, T024, T025, T028, T033, T037, T047, T056, T067, T078, T082, T084, T085, T086, T087, T089, T100, T110, T118, T128, T133, T134, T135, T141 |
| FR-032 | T008, T018, T025, T028, T037, T041, T043, T047, T050, T052, T056, T060, T062, T067, T073, T075, T078, T081, T082, T084, T085, T086, T087, T089, T092, T100, T105, T107, T110, T113, T115, T118, T121, T123, T128, T132, T133, T134, T135, T148 |
| FR-033 | T050, T060, T072, T081, T085, T089, T105, T131, T132, T134, T135, T148 |
| FR-034 | T010, T016, T018, T023, T024, T025, T028, T039, T041, T052, T056, T082, T085, T089, T123, T125, T133, T134 |
| FR-035 | T024, T040, T043, T049, T059, T070, T088, T090, T097, T104, T105, T131, T136, T140 |
| FR-036 | T011, T013, T019, T034, T042, T045, T050, T076, T083, T084, T090, T091, T095, T096, T098, T104, T105, T134, T142, T147, T148 |
| FR-037 | T012, T061, T062, T063, T064, T066, T069, T070, T073 |
| FR-038 | T061, T062, T063, T064, T066, T070, T073 |
| FR-039 | T090, T092, T097, T098, T099, T100, T103, T104, T105, T124, T130, T135 |
| FR-040 | T013, T017, T091, T092, T093, T094, T099, T100, T102, T103, T105, T135, T145 |
| FR-041 | T013, T017, T091, T092, T093, T094, T095, T096, T097, T098, T099, T100, T102, T104, T105, T140, T141, T142, T147 |
| FR-042 | T090, T092, T097, T098, T100, T102, T103, T104, T105, T124, T130, T135, T136 |
| FR-043 | T012, T021, T074, T075, T076, T077, T078, T080, T081 |
| FR-044 | T021, T053, T055, T059, T065, T071, T074, T075, T076, T077, T080, T081 |
| FR-045 | T021, T027, T065, T074, T075, T076, T077, T078, T080, T081, T114, T121 |
| FR-046 | T021, T074, T075, T076, T077, T078, T080, T081 |
| FR-047 | T013, T017, T091, T092, T093, T094, T095, T096, T098, T099, T100, T102, T103, T105, T141, T142, T145, T147 |
| FR-048 | T012, T054, T106, T107, T108, T109, T110, T112, T113 |
| FR-049 | T053, T055, T059, T071, T106, T107, T108, T109, T110, T112, T113 |
| FR-050 | T012, T054, T106, T107, T108, T109, T110, T112, T113 |
| FR-051 | T053, T106, T107, T108, T109, T110, T112, T113 |
| FR-052 | T012, T061, T063, T064, T065, T066, T067, T071, T073, T136 |
| FR-053 | T012, T045, T061, T063, T064, T066, T067, T070, T073 |
| FR-054 | T061, T062, T063, T064, T065, T066, T067, T071, T073, T136 |
| FR-055 | T012, T021, T114, T115, T116, T117, T118, T120, T121 |
| FR-056 | T053, T054, T055, T059, T071, T114, T115, T116, T117, T118, T120, T121 |
| FR-057 | T021, T027, T065, T074, T114, T115, T116, T117, T118, T120, T121 |
| FR-058 | T012, T021, T054, T074, T076, T081, T114, T115, T116, T117, T118, T120, T121 |
| FR-059 | T013, T031, T032, T035, T036, T037, T090, T097, T098, T122, T123, T124, T128, T130, T132, T135 |
| FR-060 | T020, T054, T065, T076, T098, T108, T116, T122, T124, T126, T128, T132 |
| FR-061 | T013, T020, T027, T054, T065, T076, T098, T116, T122, T124, T126, T128, T132 |
| FR-062 | T013, T123, T125, T127, T128, T131, T132, T135 |
| FR-063 | T020, T122, T123, T125, T126, T127, T128, T131, T132, T145 |
| SC-001 | T137 |
| SC-002 | T006, T028, T030, T031, T041, T050, T052, T060, T062, T082, T089, T123, T132, T134 |
| SC-003 | T072, T138, T139, T145, T146 |
| SC-004 | T135 |
| SC-005 | T027, T050, T051, T060, T081, T089, T121, T134, T147 |
| SC-006 | T023, T052, T060, T062, T072, T073, T134, T138, T145, T146 |
| SC-007 | T006, T041, T050, T060, T073, T081, T105, T113, T121, T132, T136 |
| SC-008 | T027, T061, T073, T074, T081, T089, T114, T121, T134 |
| SC-009 | T090, T091, T092, T105, T134, T136 |
| SC-010 | T091, T092, T105, T138, T139, T145, T146 |
| SC-011 | T106, T107, T113, T134 |
| SC-012 | T027, T074, T081, T114, T115, T121, T134 |
| SC-013 | T020, T027, T122, T123, T126, T132, T134, T138, T145, T146 |
| SC-014 | T061, T062, T073, T134, T136 |

## Local development username/password addendum (2026-10-12)

These tasks implement the user's DEV-AUTH-001 request in spec.md; they do not complete any pending external production acceptance gate. The existing50 business operations remain the REST/MCP catalog.

- [X] T150 [US1] Generate and preserve private local fixture usernames/random passwords and bcrypt records with the local identity CLI in `backend/cmd/gategoldjira/main.go` and `backend/internal/platform/auth/`; verify hash checking, existing-file preservation, private permissions and production guards. Covers: DEV-AUTH-001, FR-001, FR-002.
- [X] T151 [US1] Implement the development-only typed username/password exchange at `POST /api/v1/auth/local-sign-in` in `backend/internal/platform/auth/` and app wiring, with fresh signed access tokens, current active approval and bounded login work; regenerate API SDK/validators and test invalid, disabled and production cases. Depends: T150. Covers: DEV-AUTH-001, FR-001, FR-005.
- [X] T152 [US1] Replace token-paste UI with labeled typed Username/Password controls in `frontend/src/app/core/auth/`; validate the generated response, keep tokens only in memory, clear the password and protected state at the appropriate boundaries, and display failed-login errors. Depends: T151. Covers: DEV-AUTH-001, FR-028, FR-029.
- [X] T153 [US1] Update the isolated runner and typed credential helpers in `scripts/run-browser-tests.sh` and `frontend/e2e/support/session.ts`; verify Owner/Member/Viewer password login, wrong/disabled credentials, private browser storage and sign-out/reload in `frontend/e2e/access.spec.ts` and `frontend/e2e/keyboard.spec.ts`. Depends: T150, T152. Covers: DEV-AUTH-001, FR-001, FR-005, FR-028.
- [X] T154 Update `specs/001-gategoldjira-mvp/quickstart.md` and `validation/access.md` with the generated account location and local-mode limitations; run focused auth, strict typing/generated drift and actual browser acceptance before recording the requested local login as complete. Depends: T151, T152, T153. Covers: DEV-AUTH-001.

## Generation Summary

| Group | Tasks | Independent acceptance |
| --- | --- | --- |
| Setup (Shared Infrastructure) | 9 | Pinned dependencies install, both empty applications build, and local PostgreSQL starts without cloud credentials. |
| Foundational (Blocking Prerequisites) | 20 | Real PostgreSQL tests prove lock ordering, retry semantics, guarded completion and atomic event persistence; both transports deny unauthenticated company access. |
| US1 | 12 | With prepared Admin/two projects, approve and bind a Member/Viewer, exercise both channels, revoke access/clear assignments, and reject removal of the last active Admin. |
| US2 | 9 | Create/edit a project, reject duplicate/changed keys, archive while another writer edits, administer membership, restore, and verify retained content through REST/MCP. |
| US3 | 10 | Create defaults, search/My Issues with AND filters, assign/clear, reject stale or ineligible changes, retry across channels and retain immutable identifiers/reporter after restart. |
| US4 | 13 | With seeded dates/labels/children/blockers, create a saved view, load all columns, drag/reorder hidden-card views, use keyboard alternatives, archive/restore and compare full saved-view WIP counts in both channels. |
| US5 | 8 | Link A blocked by B, inspect both directions, reject Done until every blocker completes, reopen/remove links, and reject cross-project/self/combined parent cycles and stale races. |
| US6 | 8 | Reference client discovers concrete tools, executes approved core work and compares next web reads. Full50-tool/20-session acceptance runs after US7–US10 providers land; never substitute mock tools for missing features. |
| US7 | 16 | Write/edit a bilingual formatted picture comment, compare both channels and old versions, exercise author-only/Viewer/revoked access, max files, failures and exact24h draft expiry. |
| US8 | 8 | Set/clear valid dates across company midnight, create casefold-reused/Arabic labels, enforce ten labels and combine inclusive/AND filters in lists and boards through both channels. |
| US9 | 8 | Create assigned children under a Task/Bug, read accurate progress/My Issues/board parent links, reject nesting/reparenting/type conversion and race parent Done against child create/reopen through both channels. |
| US10 | 11 | With reporter/assignee/Viewer/actor/revoked fixtures, exercise every recipient-table event, newly added mentions/dedupe, own-only counts and read/unread/mark-all in both channels, including Arabic and restart. |
| Polish & Cross-Cutting Concerns | 17 | All77 requirements have evidence, all50 operations and26 mutations pass parity, full workloads meet budgets, and deployment/recovery gates have concrete reviewable outputs. |
| Jira-style workspace addendum | 6 | Real navigation/data, whole-card dragging, native dialogs, responsive desktop/tablet/phone layouts and retained permission/retry/Arabic workflows pass browser acceptance. |
| Local development sign-in addendum | 5 | Generated private credentials sign in active fixture roles, reject wrong/disabled users, preserve current authorization, clear browser session state and remain unavailable outside local development. |
| Issue workspace/document attachments addendum | 6 | Whole-card/row navigation retains drag; Arabic comments and private pictures/documents work through real API/browser workflows; typed REST/MCP permissions, validation, retries, revision conflicts and retained history pass. |

**Total**: 149 original MVP tasks plus5 local development sign-in tasks,6 Jira-style workspace tasks,6 issue workspace/document attachment tasks and8 rich-text/custom-workflow/arbitrary-file tasks (174 total, including8 rich-text/custom-workflow/arbitrary-file tasks); 54 marked `[P]`; 63 functional requirements,14 success criteria and DEV-AUTH-001/UX-001–UX-007/ATT-001–ATT-003 mapped; completion is recorded above as checks actually pass. Format, operation ownership, dependency references and feature-first paths are validated at generation. No extension hooks are installed.


## Jira-style workspace addendum

- [X] T155 [P] Build shared design tokens, typed icons and responsive sidebar/top-bar shell with working project/board navigation in `frontend/src/styles.css`, `frontend/src/app/app.component.ts` and `frontend/src/app/shared/ui/`. Covers: UX-001, UX-005.
- [X] T156 [P] Redesign board/cards/settings with whole-card drag, clear drop feedback, compact metadata and retained keyboard/blocked/WIP/retry/bounded-window behavior in `frontend/src/app/features/boards/`. Covers: UX-002, UX-005.
- [X] T157 [P] Redesign issue list/detail/create/edit and discussion presentation using progressive filters and clear metadata in `frontend/src/app/features/issues/` and related comments components. Covers: UX-003, UX-004.
- [X] T158 [P] Redesign workspace/projects/notifications around real company data and working actions in their existing feature pages. Covers: UX-001, UX-004.
- [X] T159 Verify desktop/tablet/mobile UX, actual whole-card drag and keyboard/permission/error workflows with browser acceptance and screenshots; retain no more than100 visible cards per column. Covers: UX-002, UX-005.
- [X] T160 Run strict app/template/test checking, production build and relevant regressions; record final UX evidence and rollout limits in `validation/ux.md`. Depends: T155, T156, T157, T158, T159. Covers: UX-001–UX-005.

## Issue workspace and document attachments addendum

- [X] T161 Extend native issue links over card/list surfaces while retaining parent links, move controls and drag navigation suppression in `frontend/src/app/features/boards/` and `frontend/src/app/features/issues/pages/issue-list/`. Covers: UX-006.
- [X] T162 Promote comments and attachments, add working editor/upload focus actions and integrate document attachments on `frontend/src/app/features/issues/pages/issue-detail/`. Covers: UX-007.
- [X] T163 Add private document metadata migration, generated sqlc queries, file validation, pagination, idempotent upload, current-access downloads, revision-checked detach and audit in `backend/internal/features/attachments/`. Covers: ATT-001–ATT-003.
- [X] T164 Register typed REST/MCP attachment operations, regenerate OpenAPI and frontend SDK/validators, and verify actual PostgreSQL permissions, retries, detach and transport consistency. Depends: T163. Covers: ATT-001, ATT-002.
- [X] T165 Build typed private document list/upload/download/detach with file picker/drop, clear constraints, role gating and retained inputs on errors in `frontend/src/app/features/attachments/`. Depends: T164. Covers: ATT-001–ATT-003.
- [X] T166 Verify body-click versus drag, Arabic comments, pictures and PDF/document workflows against the real API; run strict checks/build/relevant backend and browser regressions, apply the additive local migration and record evidence in `validation/issue-workspace.md`. Depends: T161, T162, T164, T165. Covers: UX-006, UX-007, ATT-001–ATT-003.


## Rich text, custom workflow editor and arbitrary files addendum

- [X] T167 Add typed rich descriptions, explicit legacy plain-text format, safe HTML source/visual rendering and REST/MCP revision/retry compatibility in the issue feature and generated contracts. Covers: HTML-001, HTML-002.
- [X] T168 Add persistent workflow settings, stage identity/category registration, dynamic order/counters, allowed-move validation, project-board propagation, completed-category guards and additive migration00005. Depends: T167. Covers: FLOW-001–FLOW-004.
- [X] T169 Build the board editor with unlimited stage creation, names/category/order/transition controls, real drag/keyboard movement and retained stale drafts. Depends: T168. Covers: FLOW-001–FLOW-004.
- [X] T170 Build descriptions/comments visual and HTML editing with Arabic support and safe previews; fix empty-description retry drift and preserve permissions. Depends: T167. Covers: HTML-001, HTML-002.
- [X] T171 Support direct clipboard/drop private pictures in both rich editors, same-issue published description references, pending-upload retention and own committed revision reconciliation. Depends: T170. Covers: HTML-003.
- [X] T172 Extend private attachments to any file kind using opaque downloads; preserve known-format validation, filenames, size, retries, permissions and retained history across REST/MCP. Covers: ATT-004.
- [X] T173 Verify custom stages including45-stage backend workflow, actual browser card/column drag, Arabic/source editing, clipboard pictures, Viewer reads, opaque downloads, stale revisions and cross-channel retries with PostgreSQL and isolated browsers. Depends: T169, T171, T172. Covers: FLOW-004, HTML-001–HTML-003, ATT-004.
- [X] T174 Run strict Angular/template/test checks, production build, complete backend/browser regressions and generated drift; apply the additive local migration, restart the API and record evidence in validation/board-editor-rich-text.md. Depends: T173. Covers: FLOW-004, HTML-001–HTML-003, ATT-004.

Updated total:174 tasks (166 previous +8 in this addendum); completion remains recorded by actual evidence, with the prior eight external qualification tasks still pending.


## Daily Jira workflow completion (2026-10-13)

- [X] T175 Specify the accepted daily workflow scope, compatibility, data changes and acceptance checks. Covers: DAILY-001–DAILY-009.
- [X] T176 Implement project-wide workflow enforcement, stage retirement/replacement and per-stage WIP, with real PostgreSQL permission/revision/prerequisite and REST/MCP tests. Covers: DAILY-001–DAILY-009.
- [X] T177 Expose reader-scoped issue activity and add inline status/assignment/priority/date actions with revision-conflict recovery. Covers: DAILY-001–DAILY-009.
- [X] T178 Implement session-only draft preservation, navigation/discard protection and creation-time file queues with safe partial-upload retry. Covers: DAILY-001–DAILY-009.
- [X] T179 Unify attachments, multiple-file queues, private image/PDF previews and rich-text attachment references. Covers: DAILY-001–DAILY-009.
- [X] T180 Implement custom-stage/teammate filtering, sorted paginated search, private saved searches and bounded bulk edit outcomes. Covers: DAILY-001–DAILY-009.
- [X] T181 Implement backlog planning, issue archive/restore, cloning, watchers and retained relates-to/duplicates links with REST/MCP parity. Covers: DAILY-001–DAILY-009.
- [X] T182 Implement board issue preview dialog, avatar filters, eligible-stage creation, compact mobile controls and accurate workflow preview. Covers: DAILY-001–DAILY-009.
- [X] T183 Implement foreground idle refresh for boards, issue discussion/history and inbox without losing drafts or pending actions. Covers: DAILY-001–DAILY-009.
- [X] T184 Run complete backend/real PostgreSQL/race/vet, generated drift, strict Angular/test type checks, unit/browser regressions, production build and affected performance checks; inspect current UI screenshots. Covers: DAILY-001–DAILY-009.
- [X] T185 Apply additive local migrations, restart the existing development API, smoke-test preserved local data and document final behavior, tests and remaining external gates. Covers: DAILY-001–DAILY-009.

Daily workflow completion evidence: [validation/daily-workflow.md](validation/daily-workflow.md). Updated total:185tasks;177complete, with the original eight external qualification tasks pending.

## Jira-style UI refinement (2026-10-13)

- [X] T186 Capture and inspect the existing UI; refine shell/sidebar, compact board toolbar and responsive stage controls. Covers: UI-001, UI-002.
- [X] T187 Consolidate issue actions/details, implement keyboard activity tabs with retained drafts, and simplify rich-text/saved-search controls. Covers: UI-003, UI-004.
- [X] T188 Verify current-run screenshots, desktop/mobile keyboard behavior, strict checks/build, unit and full browser regressions; document UI evidence and limits. Covers: UI-001–UI-004.

UI refinement evidence: [validation/ui-refinement.md](validation/ui-refinement.md). Updated total: 188 tasks; 180 complete, with 8 external qualification tasks pending.

## Direct issue editing and unified attachments (2026-10-13)

- [X] T189 Replace duplicate quick-edit controls with typed inline title/description/assignee/priority/date/label editing, automatic assignee/priority/date saving, session drafts, explicit conflict review and in-place own-comment editing. Covers: UI-005, UI-006.
- [X] T190 Unify picture/document lists, upload queues and previews; support keyboard, mixed drag/drop, private downloads, explicit stale-removal review and responsive metadata editing. Remove unused split implementations. Covers: UI-007, UI-008.
- [X] T191 Include newly posted comment pictures in shared attachments atomically, retain draft privacy and detached references, regenerate sqlc and add backend parity assertions. Covers: UI-008.
- [X] T192 Finish strict types, unit/build/generated checks, backend PostgreSQL/race tests, full browser regressions and current-run screenshot review; update the local app and validation evidence. Covers: UI-005–UI-008.

Evidence: [validation/issue-refactor.md](validation/issue-refactor.md).

Updated total: 192 tasks; 184 complete, with the original 8 external qualification tasks pending.

## Product audit implementation (2026-10-13)

- [X] T193 Specify the authorized audit scope, additive schema/contract design and feature-first implementation plan. Covers: AUDIT-IMP-001–011.
- [X] T194 [P] Fix project-search layout, related-search pagination and typed searchable issue-form pickers. Covers: AUDIT-IMP-002,009.
- [X] T195 [P] Simplify creation and issue discussion/mobile detail while preserving drafts, files and conflicts. Covers: AUDIT-IMP-003.
- [X] T196 [P] Replace workflow transition checkbox walls with focused stage editing and clear impact/save behavior. Covers: AUDIT-IMP-004.
- [X] T197 Implement atomic backlog creation and independent revision-checked planning order with generated queries and REST/MCP parity. Covers: AUDIT-IMP-001.
- [X] T198 Build dedicated ranked Backlog planning with drag/keyboard order, selection and move-to-board. Depends: T197. Covers: AUDIT-IMP-001.
- [X] T199 [P] Implement project epics/releases and issue membership with typed services, migrations, audit and REST/MCP. Covers: AUDIT-IMP-005.
- [X] T200 Build planning views and issue membership controls. Depends: T199. Covers: AUDIT-IMP-005.
- [X] T201 [P] Implement indexed bounded transition-based Kanban metrics and report UI with documented reopened-work semantics. Covers: AUDIT-IMP-006.
- [X] T202 [P] Implement notification preferences, durable outbox/reminders, sender configuration and opt-out/dedup/revocation tests. Covers: AUDIT-IMP-007.
- [X] T203 Build Inbox preferences and readable activity with useful filters. Depends: T202. Covers: AUDIT-IMP-007,009.
- [X] T204 Implement mapped CSV preview/import with stable row identities, retries, partial outcomes, and filtered formula-safe export. Covers: AUDIT-IMP-008.
- [X] T205 Build CSV import/export UI and typed REST/MCP verification. Depends: T204. Covers: AUDIT-IMP-008.
- [X] T206 Implement validated development links and an auditable stage-entry assignment rule with web/MCP access. Covers: AUDIT-IMP-010.
- [X] T207 Complete reviewable employee invitation/approval/first-login guidance and reliable combined local service startup/health/logs. Covers: AUDIT-IMP-011.
- [X] T208 Integrate routes/navigation/services, regenerate all contracts/queries and verify feature architecture and strict boundaries. Depends: T194–207. Covers: AUDIT-IMP-001–011.
- [X] T209 Run real PostgreSQL permission/retry/revision/metrics/import/delivery tests and full Go race/vet/generated checks. Depends: T208. Covers: AUDIT-IMP-001–011.
- [X] T210 Run full Angular types/unit/build and browser regression, new planning/adoption flows, mobile/keyboard screenshots and affected local performance checks. Depends: T208. Covers: AUDIT-IMP-001–011.
- [X] T211 Apply validated additive local migrations, restart preserved local services and record final evidence and external qualification limits. Depends: T209,T210. Covers: AUDIT-IMP-001–011.

Audit implementation evidence: [validation/audit-implementation.md](validation/audit-implementation.md). Updated total: 211 tasks; 203 complete, with the original eight external qualification tasks pending.

## Daily editing and board controls follow-up (2026-10-13)

- [X] T212 Add immediate Epic/Release saving with immutable session drafts, synchronous pending locks, safe conflict review/rebase, Cancel refresh and issue/session stale-response guards. Covers: UI-010.
- [X] T213 Fix own-comment body editing in board dialogs; implement safe code blocks, tables and checklists across both rich editors, typed rendering, sanitizers and retained versions. Covers: UI-009, HTML-004.
- [X] T214 Add live paginated eligible-teammate selection and private named quick filters through the existing project APIs. Covers: UI-011, UI-013.
- [X] T215 Add assignee/epic swimlanes over bounded shared-order card windows and batched authorized epic metadata; retain WIP, keyboard movement and safe cross-group drag behavior. Covers: UI-012.
- [X] T216 Verify strict app/test types, units/build/generated/architecture checks, backend real PostgreSQL/race/vet and complete functional browser acceptance; inspect fresh desktop/mobile screenshots. Depends: T212–T215. Covers: UI-009–UI-013, HTML-004.
- [X] T217 Restart the verified preserved local API, confirm current web/API readiness, and document accepted evidence, personal/grouping semantics and unchanged external gates. Depends: T216. Covers: UI-009–UI-013, HTML-004.

Evidence: [daily editing and board controls](validation/daily-editing-board-controls.md). Final source passes strict types, 98 units, backend PostgreSQL/race/vet, generated/architecture checks, production build and all 113 distinct browser scenarios across full/affected runs, with fresh inspected screenshots and preserved runtime smoke. This is aggregate browser coverage, not a clean single full run.

Updated total: 217 tasks; 209 complete, with the original eight external qualification tasks pending.
