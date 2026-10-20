# Tasks: Scalable GateGoldJira Core

**Source**: spec.md, plan.md, data-model.md, contracts/ and reviewed V2.
**Tests**: risk-focused automated acceptance is explicitly required.
**Execution**: sequential tasks below; no implementation task is checked before its evidence.

## Setup

Preserve current runtime and test assumptions.

- [X] T001 Capture private migration-00010 backup and source/runtime baseline in `.local/backups/` and `specs/002-scalable-core/validation/baseline.md`; preserve the live project and existing specs.
- [X] T002 Verify pinned tools/ignore files and real PostgreSQL isolated test setup in `scripts/tool-env.sh`, `.gitignore`, `backend/tests/testenv/` and `Makefile`.
- [X] T003 Run unchanged search/guard/contract/type baselines and record results in `specs/002-scalable-core/validation/baseline.md`.

## Foundational compatibility

Establish named IDs and preflight before canonical expansion.

- [X] T004 Add named configuration IDs/checked values in `backend/internal/platform/command/` and preflight contracts in `backend/internal/features/configuration/types.go` without changing old retry models.
- [X] T005 Implement read-only workflow/media collision and legacy mode preflight in `backend/internal/features/configuration/preflight.go` and populated fixture tests in `backend/tests/migrations/scalable_core_test.go`.

## US1: fast daily edits

Existing number/prefix/literal search parity and independent field merges pass.

- [X] T006 [US1] Author classifier/literal tests in `backend/internal/platform/command/search_query_test.go` and field CAS/no-op/replay/revoke cases in `backend/internal/features/issues/field_patch_test.go`.
- [X] T007 [US1] Implement bounded numeric/key/text classification in `backend/internal/platform/command/search_query.go`; update issue and board card/count predicates together; add measured generated search paths in `issues/search_paths.sql`, lookup indexes in `backend/db/migrations/00011_search_paths.sql` and request-specific text planning; regenerate sqlc.
- [X] T008 [US1] Implement typed assignee/priority/due-date prior-value patches in `backend/internal/features/issues/field_patch.go`, preserving full PUT guards and normalized no-ops.
- [X] T009 [US1] Expose the shared field patch through `backend/internal/features/issues/http.go`, `mcp.go` and the operation catalog; regenerate OpenAPI/TypeScript and extend parity/catalog tests.
- [X] T010 [US1] Use patches in `frontend/src/app/features/issues/` autosaves and preserve conflict/draft/retry behavior; extend `frontend/e2e/issue-field-autosave.spec.ts`.
- [X] T011 [US1] Run affected real PostgreSQL/search/field/parity/browser/type checks and actual prepared-query measurements; record `specs/002-scalable-core/validation/daily-edits.md`.

## US2: project configuration

Admin isolation, dynamic choices and valid defaults pass.

- [X] T012 [US2] Add populated expansion migration cases in `backend/tests/migrations/scalable_core_test.go`, including retired tokens, archived boards and original timestamps/retries.
- [X] T013 [US2] Add canonical workflows/stages/types/priorities/bindings and nullable issue/rule references in `backend/db/migrations/00012_scalable_configuration.sql`; seed/backfill existing projects safely with source equivalence checks.
- [X] T014 [US2] Implement configuration reads, defaults, taxonomy edits/retirement and bridge seeding in `backend/internal/features/configuration/{queries.sql,service.go,taxonomy.go}`; extend `backend/sqlc.yaml` and runtime grants.
- [X] T015 [US2] Extend project roles and all member-eligibility checks in `backend/internal/features/projects/`, `identity/`, `issues/`, `integrations/` and `platform/command/`; test project-admin boundaries.
- [X] T016 [US2] Expose versioned typed configuration REST/MCP in `backend/internal/features/configuration/{http.go,mcp.go}` and app wiring; preserve legacy representability/upgrade contracts.
- [X] T017 [US2] Add project-admin taxonomy/default preparation settings and scoped people management in `frontend/src/app/features/projects/` and `issues/`; regenerate clients and test retained retired values; modern issue choices are completed with T023 after the canonical issue contract.
- [X] T018 [US2] Run configuration/default/role/bridge parity and browser checks; record `specs/002-scalable-core/validation/configuration.md`.

## US3: canonical workflows

Two workflows coexist; default changes and staged retirement preserve work.

- [X] T019 [US3] Add lifecycle advisory participation and concurrency tests in `backend/internal/platform/command/{queries.sql,transaction.go}` and `backend/tests/integration/`; legacy writers remain exclusive.
- [X] T020 [US3] Opt verified metadata patch/read paths into shared lifecycle plus focused issue locks; prove different-issue concurrency and preserve archive/revoke/old-PUT/graph races.
- [X] T021 [US3] Implement workflow editing/bindings/stage intake/retirement and bounded issue migration in `backend/internal/features/configuration/{workflows.go,migration.go}` with transaction/default-board coverage tests.
- [X] T022 [US3] Add canonical-write expansion in `backend/db/migrations/00014_canonical_issue_writes.sql`, bridge normalized issue references, implement identifier-based modern issue create/edit/read contracts and switch canonical transition checks in `backend/internal/features/issues/` and `boards/`; preserve old category filters and historical snapshots.
- [X] T023 [US3] Add typed workflow editor/binding/migration UI in `frontend/src/app/features/projects/` and adapt issue type/priority/default/stage selection in `issues/` to canonical identifiers; test default changes and existing workflow progression.
- [X] T024 [US3] Run workflow/migration/race/parity/browser checks and record `specs/002-scalable-core/validation/workflows.md`.

## US4: independent boards

Grouping, independent ranks and full saved-view limits work across access channels.

- [X] T025 [US4] Author populated rank/WIP/category-filter and grouped-column fixtures in `backend/internal/features/boards/layout_test.go` and `backend/tests/migrations/scalable_core_test.go`.
- [X] T026 [US4] Add board columns/mappings/ranks and exact legacy order/WIP backfill in `backend/db/migrations/00015_independent_boards.sql` without discarding old order data.
- [X] T027 [US4] Implement typed layout and phase-aware prepared cards/counts in `backend/internal/features/boards/{layout.go,cards.go,queries.sql}` with broad/selective/terminal query paths.
- [X] T028 [US4] Implement column-scoped reorder/ambiguous move/anchor checks in `backend/internal/features/boards/movement.go`; preserve graph/backlog/issue-content revisions.
- [X] T029 [US4] Implement eligible hard WIP and sorted capacity guards across every occupancy-changing command in `backend/internal/features/boards/wip.go` and affected issue/configuration services.
- [X] T030 [US4] Expose modern board/layout/card/move/reorder operations and generated contracts; gate unrepresentable older editors in `boards/{http.go,mcp.go}`.
- [X] T031 [US4] Adapt CDK drag/drop, column grouping/settings and live pagination in `frontend/src/app/features/boards/`; test two layouts of the same issue and hard-limit races.
- [X] T032 [US4] Run populated order equivalence, concurrency, parity, browser and prepared rank-tail/selectivity workloads; record `specs/002-scalable-core/validation/boards.md`.

## US5: typed fields and approvals

Values and current-context review rules remain correct through edits/retirement.

- [X] T033 [US5] Author kind/choice/default/required-rule/approval race cases in `backend/internal/features/configuration/fields_test.go` and `backend/internal/features/issues/approvals_test.go`.
- [X] T034 [US5] Add field definitions/options/typed values, transition requirements and retained votes in `backend/db/migrations/00016_fields_approvals.sql`, including precise CHECK/composite FK/indexes.
- [X] T035 [US5] Implement field configuration/value commands and required-field retirement checks in `configuration/fields.go` and `issues/custom_fields.go` with precision-safe typed unions.
- [X] T036 [US5] Implement vote/current-context validation and explicit resubmit in `issues/approvals.go`; coordinate issue/configuration/workflow revisions and shared move services.
- [X] T037 [US5] Expose field/rule/approval REST/MCP contracts and app wiring; regenerate and verify catalog/permission parity.
- [X] T038 [US5] Add typed field editors and approval/resubmit UI in `frontend/src/app/features/projects/` and `issues/`; test preserved votes, rejection and content edits.
- [X] T039 [US5] Run constraints, races, parity and browser checks; record `specs/002-scalable-core/validation/fields-approvals.md`.

## US6: unified attachments

Old references and new image/file drafts share recoverable typed sessions.

- [X] T040 [US6] Author asset/retry collision, draft, old-version, lease, cleanup and content-revocation cases in `backend/internal/features/attachments/` and `backend/tests/migrations/`.
- [X] T041 [US6] Extract common typed reservation/transfer/finalize mechanics in `backend/internal/features/attachments/` while retaining image/document validators and old endpoint results.
- [X] T042 [US6] Add canonical asset/session and version-attachment references in `backend/db/migrations/00017_unified_assets.sql`; preserve original identity/keys/generations/hashes/attribution.
- [X] T043 [US6] Switch picture/document/comment/description adapters to canonical assets in `pictures/`, `attachments/`, `comments/` and `issues/description_pictures.go` without rewriting immutable HTML.
- [X] T044 [US6] Implement shared document/image drafts and reference-aware bounded reconciliation in `attachments/{drafts.go,maintenance.go}`; retain old immediate-publication compatibility.
- [X] T045 [US6] Implement bounded resumable session start/chunks/final verification in `attachments/resumable.go` and existing `platform/objectstore/` boundary, with configured sizes and no transfer under business locks.
- [X] T046 [US6] Expose shared asset/session REST/MCP and generated models; update frontend unified upload/paste/attachment components and resumable progress/cancel/retry UX.
- [X] T047 [US6] Run media migration/parity/race/Arabic/browser/max-file/cleanup checks; record `specs/002-scalable-core/validation/attachments.md`.

## US7: adoption and performance

Preserved local data and complete shared daily behavior pass before storage retirement.

- [X] T048 [US7] Add full populated migration/replay/report/source equivalence assertions in `backend/tests/migrations/` and an explicit compatibility/cutover guide under feature validation.
- [X] T049 [US7] Finish canonical SQL/service consumers and remove obsolete mutable status/type/priority/rank/workflow/media storage through `backend/db/migrations/00018_retire_legacy_core.sql` only after compatibility checks.
- [X] T050 [US7] Update planning/history/filter/import/runtime grants and all generated artifacts to canonical ownership; verify target 44-table catalog and remaining constraints.
- [X] T051 [US7] Run complete Go real PostgreSQL/race/vet, strict Angular/app/test/unit, production build, generated/architecture and browser suites; repair failures before adoption.
- [X] T052 [US7] Add 100k-issue hot-project mixed-writer and prepared-query workload in `backend/tests/performance/` and browser action measurements; record p50/p95/p99, errors, waits and memory.
- [X] T053 [US7] Apply verified migrations to backed-up local data, restart local services and inspect the first-party app; update current schema/PlantUML and feature validation evidence.
- [X] T054 [US7] Document existing external provider/cloud/idle-start/restore acceptance as pending in `specs/002-scalable-core/validation/readiness.md`; do not provision an unknown target or claim local evidence closes hosted gates.

## Dependencies and execution

Setup → foundational → US1 → US2 → US3 → US4 → US5 → US6 → US7. Canonical references precede modern boards/rules/media retirement. Search/patch delivery is independently usable while later tasks remain pending.

Within each completed schema/model phase, independent test files and frontend styling can be validated in parallel by tools; edits sharing generated contracts/SQL occur sequentially. The execution checkout remains one shared workspace.

## Implementation strategy

Deliver and verify each slice, marking only confirmed work. Preserve existing data, old retry models and supported legacy operations until the documented transition. All hooks are absent in this project and therefore skipped. Hosted external acceptance remains explicitly pending instead of blocking authorized local construction.

## Phase 2: Modern client completion and 200k capacity

User follow-up on 2026-10-15 explicitly authorizes native bulk/saved-search UI, safe activation, correction of the 200k board latency and complete regression testing. Preserve the 44-table ownership model and existing company data.

- [X] T055 Complete native saved-search create/apply/update/rename/remove, exact multi-value filters, private drafts, lost-response retries and conflict review in the issue-list UI; add browser acceptance per FR-001/FR-002/FR-016/FR-017 (partial).
- [X] T056 Complete typed native bulk selection/actions with scoped choices, selected-field CAS, workflow transition checks, partial failures, unchanged saves and frozen uncertain retries; test native and mixed-project behavior per FR-001/FR-003/FR-016 (partial).
- [X] T057 Add current project-admin activation readiness and guarded idempotent activation with defaults/workflow/default-board coverage validation, stale-review rejection, archive/revocation/concurrency checks and shared REST/MCP outcome tests per FR-004/FR-008/FR-016/FR-017 (missing).
- [X] T058 Add explicit first-party activation review/confirmation and refresh behavior, protected drafts and same-reference retry; generate concrete Go/TypeScript/OpenAPI/MCP contracts and verify catalog/grants per FR-017 and plan: client transition (missing).
- [X] T059 Capture actual 200k board query plans, fix the measured bottleneck without stale totals, extra tables or raised budgets; verify page/rank/count equivalence and repeat prepared/mixed load at 100k and 200k per SC-003/SC-005 (partial).
- [X] T060 Run complete real PostgreSQL Go/race/vet, strict Angular/app/test typing, units, production build, generated/architecture and all browser acceptance; repair failures per FR-018 (partial after follow-up changes).
- [X] T061 Back up preserved local data and objects, adopt verified follow-up migration/build without reseeding, smoke current compatibility and public readiness flows, and update current schema/evidence per FR-001/FR-017 (partial).
- [X] T062 Refresh final readiness/client boundary/performance reports with actual completed native UI and measured 200k capacity, keeping provider/cloud/idle-start/external restore gates explicit per SC-004/SC-005 and plan: external acceptance (partial).

## Phase 3: Code quality corrections

User follow-up on 2026-10-16 authorizes fixing the four reviewed issues, regression tests, browser CI and full verification.

- [X] T063 Correct supported Vitest cache configuration and verify strict app/test compilation.
- [X] T064 Prevent stale project ownership in reused settings/workflow/field/membership editors; test same-project reuse, project switches, access guards and draft cancellation in unit/browser acceptance.
- [X] T065 Reset and validate bulk scoped choices on project/workflow changes without altering uncertain retry intents; cover stale choices and late responses.
- [X] T066 Route `make db-migrate` through the guarded owner CLI and test populated historical migration, preserved content/assets and restart safety in an isolated database.
- [X] T067 Add isolated Chromium/PostgreSQL browser acceptance to CI using pinned tools and cleanup, without publishing private identity or trace artifacts.
- [X] T068 Run strict Angular/test typing, frontend/identity units/builds, real PostgreSQL Go/race/vet, generated/architecture and complete browser acceptance; document evidence and remaining external gates.
