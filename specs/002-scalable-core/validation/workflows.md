# Canonical workflow validation (in progress)

**Final status (2026-10-14):** migration 18 is adopted locally and the complete suite passes. The phase checkpoints below are historical; their earlier pending/migration-version statements are superseded by [final-verification.md](final-verification.md), [cutover.md](cutover.md) and [readiness.md](readiness.md).
T019–T020: project lifecycle participation and narrow field edits pass against isolated real PostgreSQL databases. The legacy mutation path remains exclusive; ordinary reads and the assignee/priority/due-date patch use a shared lifecycle guard. Metadata patches lock only their target issue, and shared metadata cannot satisfy the legacy graph/order write guard. Repeatable-read views retain a project row guard so a view waiting behind archive/configuration changes cannot authorize an obsolete snapshot.

Verified actual overlapping issue-row waits, independent edits to another issue, unrelated-field merges on one issue, a single winner for same-field competing edits, and the race between a legacy full PUT and a field patch. Existing archive/revocation/restart/history, parent completion/child reopen/create, dependency completion/cycle, atomic cross-channel retries and notification delivery checks passed. Account-disable cleanup also passed. Replaying a result still rechecks current access before returning it.

Commands (sequential, no simultaneous load benchmarks):

```
go test -p 1 -count=1 ./internal/features/issues ./tests/integration ./internal/features/identity ./internal/features/notifications -run 'TestFieldPatch|TestConcurrentSameIssue|TestParentDone|TestArchiveRevocation|TestAtomicRetries|TestLegacyMutationsParticipate|TestProjectReadersWait|TestDelivery|TestEmail'
go test -p 1 -count=1 ./internal/features/issues ./internal/features/identity -run 'TestSharedMetadataCannot|TestConcurrentDependencyGraph|TestDisableClears|TestParentDoneAndChild'
```

First command: issues 58.900s, integration 48.132s, notifications 14.442s; identity had no matching tests and is covered explicitly by the second command. Second command: issues 22.925s, identity 4.149s. Database fixture creation has a 60s setup budget under observed host disk pressure; application commands retain their 5s deadline.

Canonical editing, modern issue contracts, workflow migration/UI and their acceptance remain pending. Migration 00013 has not yet been adopted in the live local database at this checkpoint. No hosted or mixed-writer performance result is inferred from these checks.

## Workflow service validation

T021 backend services pass. Named workflow/stage/transition identities, project configuration revision guards, scoped permissions, no-op saves and current-access retry replay are implemented. Independent paginated workflow/stage reads do not impose a fixed stage-count limit. Draft workflows/stages can be assembled incrementally; active bindings and occupied workflows retain an initial stage and a path to completion through linear reverse traversal. Open and occupied stages must remain visible on the default board.

Changing a type's default binding affects future creation only. Historical bindings remain for existing issues. Workflow retirement requires replacing default bindings. Stage retirement requires a prior intake closure, no remaining issues or assignment rules, and safe completion/default-board coverage.

Stage migration uses bounded batches of 1–100 issues and preserves completion category, scoped type/workflow bindings, issue history/notifications, content/order revisions and retry identity. The existing issue movement collaborator owns those outcomes; canonical workflow/stage identities are recorded with the issue movement event. A failure on the second issue rolls the entire batch back. An incomplete draft workflow is rejected before any issue mutation. Concurrent configuration edits from one revision produce one accepted change and one typed conflict.

Complete suites passed: configuration 15.982s, issues 29.604s, boards 15.109s, populated migrations 2.129s. Generated artifacts regenerated without drift; feature/platform import boundaries passed. Versioned workflow transport, modern issue contracts and the editor UI remain T022–T024; this service result does not close those tasks.

## Local lifecycle adoption and browser checks

The preserved local database was backed up to the private ignored `pre-lifecycle-migration-00013.dump`, migration 00013 was applied, and only the verified workspace-owned API listener was restarted. Readiness returned; the applied version is 13 and zero issues are missing canonical references. The project remains in legacy mode while the remaining modern contracts and UI are built. No accounts, passwords, tokens or project fixtures were replaced.

Playwright passed all 11 scenarios in `issue-field-autosave.spec.ts` and `project-configuration.spec.ts` (43.4s) in isolated databases. Strict Angular/template typing and test-source typing passed; 17 unit files / 99 tests passed. API contract regeneration remained drift-free before adding the subsequent workflow transport operations.

## Workflow REST/MCP transport slice

Nine typed workflow operations now share the configuration services: paginated workflows/stages/transitions/type bindings; workflow/stage/transition saves; binding save; bounded migration. The combined catalog is version 1.5.0 with 95 operations and 49 mutations. OpenAPI, TypeScript and MCP schemas were generated from Go.

The complete contract and MCP protocol suites passed (5.856s / 11.751s). The 95-operation / 49-mutation real-service matrix passed (38.565s), including actual cross-workflow issue migration, HTTP/MCP equality, original-reference replay after instance restart at 23h59m, current caller revocation and viewer denial. An initial nullable-permission schema failure was repaired with `Nullable[TransitionPermission]`, keeping the checked member/project-admin enum and explicit null branch consistent across both transports. Modern issue CRUD and the workflow UI remain pending within T022–T024. The live API still runs the verified lifecycle build; these additional endpoints have not yet been adopted there.

## Canonical issue command slice (T022)

Canonical issue reads/create/edit/move and selected-field CAS now use actual type/priority/workflow/stage identifiers and current names. Custom defaults resolve once inside the guarded creation transaction; replay after changed defaults returns the original accepted result. Typed choices retain retirement state, and unchanged retired references remain editable. Subtask behavior, immutable parent relationships, initial-stage entry, transition permission, blocker/child completion and reopening rules are preserved. Priority sorting and cursors retain bigint precision, and a search page loads metadata in one batch rather than one query per issue. Shared filters now support scoped type/priority/workflow/stage IDs consistently across card/count/search paths.

Migration 00014 is expansion-only and remains **unapplied locally**. It validates stage category/token equivalence, requires complete canonical references after bounded backfill, and makes modern references authoritative while retaining internal legacy projections until T049. Canonical movement updates references and projections atomically. Conflicting old-column writes are rejected. Public V1 core editors/read/search return explicit upgrade guidance for modern projects, while original accepted V1 retry receipts remain replayable behind current access checks. Modern-mode activation is not public until first-party integration is ready.

Contract version 1.6.0 now has 102 operations / 53 mutations, including paginated current-workflow transition options. Before the transition-options addition, 101-operation / 53-mutation parity passed (40.902s), with contract/protocol checks 3.092s / 2.683s. The complete backend run with all 102 operations passed configuration 6.791s, boards 17.561s, populated migrations 2.047s, contracts 2.962s, MCP 8.055s and parity 65.414s. Its issue suite found only an outdated 24-tool count; updating it to 31 concrete tools was followed by a clean full issue run (37.731s). Strict frontend app/test typing and import boundaries passed.

Focused canonical tests passed: CRUD + populated expansion/backfill (4.631s / 2.615s), field CAS/independent-issue row waits (9.696s), Arabic/numeric/choice search and precise priority pages with affected board checks (7.233s / 5.885s), and legacy upgrade/replay compatibility (6.714s). UI integration, mixed-user load, refreshed prepared-query measurements, and remaining storage consolidation remain pending; no timing from test duration is presented as a response-time result.

## Workflow editor preparation UI

A lazy, project-admin guarded workflow settings page is available in source at `/projects/{id}/workflows`, linked from issue configuration. It pages workflows/stages/transitions/type bindings, edits checked stage/category/order/intake state and directed moves, and provides typed binding/batch-migration forms. One frozen discriminated intent retains original identifiers/body/reference after an ambiguous response; conflict review preserves the draft and prevents stale saves. Route and reload warnings cover unsaved workflow drafts, and logout clears protected state.

Playwright preparation scenarios passed (3 tests / 15.4s): Arabic workflow/stage creation, precision-safe position 9007199254740993, directed moves, lost accepted response replay without another configuration revision, and conflict review. The completed layout screenshot was visually inspected. An early native form reload was repaired with the active Angular form group; accessible combobox locators replaced exact implicit-label text matching for selects. Strict Angular/template and test typing passed.

This is a **partial T023** result. Binding/migration controls remain gated in legacy projects; modern issue forms/detail/board integration and a safe public activation flow are still being implemented. The local API stays on schema 13 and its existing verified binary; migration 14 and these additional source endpoints are not adopted there yet.

## Local preparation screen adoption

The verified backend build with 102 registered operations and the workflow preparation page now run locally. The prior supervisor had stopped; the existing development supervisor was started again, preserving its configured credentials and database. API readiness and web HTTP 200 returned. Schema remains 13 and zero projects are in modern mode; migration 14 was not applied and no accounts or project data were reseeded.

The production frontend build passed; the workflow page stays lazy (35.68 kB / 7.92 kB estimated transfer). All 99 frontend unit tests passed again. Modern issue API wrappers are present but first-party issue forms, inline editors and boards still use their legacy paths; T023 remains unchecked.


## Native issue client integration — T023

Identifier-based form, detail, field editor, paged status popup and search/create components now use the generated V2 issue DTOs. Current type/priority/workflow/stage identities and names are preserved, including retired choices and bigint positions. Creation can omit choices to resolve current server defaults or explicitly select a bound workflow. Existing issues progress on their own workflow after a creation default changes. Legacy projects retain the V1 editor during expansion; explicit `clientVersion` upgrade guidance selects the native issue screen. Ancillary discussion/media/relationship components accept a typed legacy-or-native record, without synthesizing fixed enum values for custom choices.

Real browser checks: 21 scenarios passed in 57.2 s in a fresh disposable database. Seven native scenarios cover Arabic custom types/priorities, automatic field saves, unchanged existing workflows, two workflow defaults, retained retired choices, read-only viewers, loss-of-response retry, selected-field conflict review, subtask creation/list refresh and numeric live search. The other 14 cover unchanged legacy autosaves, configuration and workflow preparation. Screenshots were inspected; traces/screenshots are retained under `.local/browser-tests/104308602aa74990ba9feb267a75833e/results/` and the earlier native detail capture `424e0f59ed72478a922b01bdd91346d0/results/`.

Browser evidence exposed and repaired an HTTP error serialization bug: the custom native error wrapper emitted `{}` at HTTP 409. It now uses the common `TypedStatusError` serializer. `TestCanonicalHTTPFailuresKeepTypedCurrentAndAuthorizationEnvelope` passes against real PostgreSQL, proving an authorized current issue is present on conflict and absent for viewers/unsigned callers. Native subtask creation now refreshes the child list, and screen switching retains an in-progress numeric query.

Strict Angular application/templates and test typing pass; 17 unit files / 99 tests pass (1.33 s); production build passes (12.118 s). Go import boundaries pass. The affected real database suites pass: issues 24.747 s, configuration 3.731 s, boards 8.826 s, migrations 1.402 s. The combined backend command ended with SIGTERM during parity and is not counted as a parity pass; that package is rerun independently. No production/cloud performance claim follows from these test runtimes.

Adoption remains gated: live projects are still legacy and migration 00014 remains unapplied locally. Native board layouts (T031) and the remaining first-party filter/bulk/backlog/global-search/planning/import consumer closure (T050) must be ready before publishing modern-mode activation. The native search/create screen is an integration slice; it is not evidence that every V1 auxiliary UI is already converted. No live project was flipped or reseeded. Local services were restored through `scripts/dev.sh` using existing credentials/configuration after the old supervisor stopped.

Independent full REST/MCP parity rerun PASS: 102 operations / 53 accepted mutation receipts, 54.162 s. The final combined browser rerun PASS: all 21 scenarios, 57.2 s, evidence `.local/browser-tests/104308602aa74990ba9feb267a75833e/results/`. T023 is checked; T024 remains pending the expanded 100k prepared search measurements and final generated drift check.


## T024 prepared search acceptance

PASS: authenticated HTTP + pgx/sqlc prepared search, isolated 100,000 issues with a 95,000-issue hot project; 26 scenarios, one warmup and 20 measured requests each, both connection plan-cache modes. Exact totals/page bounds and canonical identities were checked. The run is sequential local loopback, not 100-active-user/cloud evidence. Full measurements: `workflow-search-prepared.json` (59.97 s test runtime).

The first expanded run failed at canonical priority sorting with HTTP 503/request deadline; incomplete pre-fix evidence is retained in `workflow-search-priority-before.json`. Priority ordering had a correlated lookup for each candidate and the alternate-sort path used generic optional-filter estimates. Replace the scalar lookup with a priority join, and use transaction-local concrete planning for alternate sorts, preserving the generated queries and old/null-reference semantics. Legacy/canonical stable cursor/sorting/project-isolation tests pass after the fix (1.668 s); generated drift passes.

Post-fix native p95 generic/custom connection modes: number 4.67/17.41 ms; complete key 76.78/60.20 ms; broad key prefix 111.11/133.32 ms; short Arabic no-match 173.50/145.09 ms; empty query 87.99/85.62 ms; 95k matching type-ID filter 93.86/103.32 ms; 95k priority-ID sort 287.48/314.22 ms. Every measured action meets the 500 ms release budget. Broad priority sorting and one legacy Arabic case exceed the 200 ms stretch goal; they are not claimed to meet that stretch target. There is no new cache/service/index dependency.

T024 is checked. T025–T054 remain; no modern-mode activation or local migration 00014 was performed. Final mixed-writer and browser-action/load/cloud gates remain separate.
