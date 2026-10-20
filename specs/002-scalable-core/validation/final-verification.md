# Final local refactor verification

The following original acceptance was completed on 2026-10-15 against migration 19 and the existing pinned toolchain. It is historical evidence, including the 44-table catalog and local data adoption at that date. Follow-up native bulk editing, saved searches, administrative activation and the measured 200k board correction were implemented. Angular and Go REST/MCP remain separate, strictly typed applications. October 16 code-quality verification is recorded separately in [code-quality corrections](code-quality-corrections.md); concurrent MCP-token/browser OAuth work adds migrations 20–22 to the current source, without implying another migration of the existing company by this verification task.

## October 16 code-quality follow-up

The four reviewed fixes, native UI regressions found by retained acceptance cases, source-capture/CI checks and database-test isolation correction are documented in [code-quality corrections](code-quality-corrections.md). Current checks include 114 frontend units, three snapshot-runner regressions, strict application/test compilation, the production build and current affected Go race packages. [Structural results](code-quality-results.json) distinguish full-run and follow-up outcomes. The current source compiles across the complete Go test tree, vet is clean, generated artifacts are reproducible and vulnerability scanning finds no affected call paths. Company adoption was not repeated by this task.

## October 15 automated checks (historical)

| Check | Result and evidence |
|---|---|
| Entire Go suite with isolated real PostgreSQL and race detector | PASS: `go test -race ./... -count=1 -timeout=30m`. All packages pass; the complete 133-operation / 71-mutation REST/MCP matrix took 1,039.808 s. `.local/modern-final-race.log`. |
| Vet | PASS: `go vet ./...`, zero diagnostics. `.local/modern-final-vet.log`. |
| Generated artifacts and architecture | PASS: reproducible Go/SQL/TypeScript/OpenAPI/MCP artifacts and feature boundary checks. `.local/modern-final-generated.log`. |
| Angular app/templates and test compilation | PASS: strict `ngc` and test TypeScript compilation. `.local/modern-final-frontend-repaired.log`. |
| Frontend units | PASS: 19 files, 105 tests. Same final frontend log. |
| Production Angular build | PASS in 9.826 s. Initial bundle 603.85 kB: a 3.85 kB warning above the unchanged 600 kB soft budget, below the unchanged 1 MB hard limit. Same final frontend log. |
| Complete browser suite | PASS: 153 cases in 7.5 minutes, including action performance. `.local/modern-final-browser-repaired.log`. |
| Prepared, mixed and full-scale workloads | PASS: 26 prepared search scenarios, 40 prepared board scenarios / 800 requests, 100k and two 200k hot-project runs, plus full 10k/1 GiB acceptance. [Performance evidence](modern-completion-performance.md). |

The browser suite covers sign-in/roles, live numeric/key/Arabic search, popup choices and autosave, rich descriptions/comments/pictures, files and recoverable uploads, dependencies/subtasks, drag/drop, independent boards/WIP, workflow/taxonomy retirement, typed fields/approvals, CSV, planning/backlog, assignment rules, inbox and conflict/retry behavior across desktop/tablet/phone. Nine added cases cover native bulk actions and selected-field CAS, saved-search privacy and exact multi-value filters, activation/stale reviews, lost responses, navigation recovery and a deliberately late startup response.

The first follow-up whole-browser run exposed five failures. They were repaired: backlog dragging now waits for confirmed refresh, startup searches cannot replace a newer selected project, native remounts retain project scope, and saved-search tests identify their own records in the shared disposable company. The affected rerun and deterministic delayed-response case passed before the final 153-case rerun. Backend/generated sources did not change after the final Go race/vet checks; final frontend checks cover the repaired frontend.

Opt-in scale tests were executed separately from ordinary Go tests, under quiet local load. The original failed 200k report and before/after query plans remain retained; no latency budget was increased. Warm browser p95 is 123.87 ms for project navigation, 590.85 ms for board navigation and 204.38 ms from typing an exact key to visible search results. These use the Angular development server and a small disposable company, separately from the 200k server workload.

## Existing local data adoption

Only the verified project-owned API was gracefully drained; the existing Angular listener was kept. A fresh private paired database/object backup, SHA manifests and all 44 source-table projections were captured before migration. Cleanup was paused and restored to its original setting. The verified owner CLI applied migration 18 → 19; every original projection remained exactly equal before reopening traffic. The prior API binary is retained privately.

- 44 application tables, 374 columns, 92 foreign keys and 14 views; the new compact active-stage index is valid.
- Original one project, five issues, four comments, four assets, two boards and 16 retry receipts retained. Original accounts and project mode are preserved; no reseeding occurred.
- Live API/web readiness, existing owner sign-in, legacy/native issue reads, rich comments, both boards, numeric/key native searches and authenticated asset downloads passed.
- All 15 original object files match the fresh backup byte-for-byte. Four published assets downloaded with retained bytes and checksum identities.
- Public administrator activation readiness passed. Unconfirmed activation returns 422; member/viewer readiness requests return 403. These checks did not activate the existing project. REST-only tokens remain rejected by MCP.
- The fresh paired backup restored into a new isolated database/object directory and upgraded to 19. All 44 projections matched, all 15 object files restored, four published assets passed SHA/size/generation checks and all 16 original accepted receipts remained intact.

[adoption-completion.json](adoption-completion.json) contains structural counts and boolean evidence only. Dumps, object archives, original rows, accounts and credentials remain private in ignored `.local/` storage. Current schema/PlantUML diagrams were regenerated from the actual adopted database. Earlier [adoption.json](adoption.json) retains the migration 13 → 18 evidence.

The in-app browser security policy blocked inspection of the existing local tab. No alternate browser, URL or protocol route was used to bypass it. Actual local adoption was checked through authenticated API/data/object evidence; the isolated automated browser suite independently verified frontend behavior. Manual visual inspection of the existing tab is not claimed.

## Remaining acceptance limits

[Client boundary](native-client-boundary.md) explains the current native UI and administrative activation. The later native-client implementation can promote a legacy project during a canonical write; the former no-automatic-promotion statement is historical. No public downgrade endpoint is provided.

[Readiness](readiness.md) retains real Auth0/Google OAuth, GCS/IAM, hosted latency/idle-start, billing and external paired restore acceptance as pending. Local tests do not establish production readiness or hosted speed. The corrected 200k broad-board workload passed locally twice; the 200/300 ms stretch goals are not universally met, and unlimited capacity is not claimed.

All nine requirements checklist items remain reviewer-owned and passed. No `.specify/extensions.yml` exists; implementation hooks are absent.
