# Local MVP readiness

Updated 2026-10-13. The MVP and Jira audit additions are implemented in code with separate strict Angular and Go applications, PostgreSQL persistence, shared typed REST/MCP commands and feature-first ownership. The candidate includes 78 business operations and 40 mutations, custom workflows, ranked backlog planning, epics/releases, reports, mapped CSV import/export, development references, stage assignment rules, notification preferences/reminders and readable activity. The current daily-editing/board follow-up adds Epic/Release autosave, comment body editing in drawers, personal quick filters, assignee/epic grouping and rich code/table/checklist structures. The real-PostgreSQL Go race suite, vet, generated drift/architecture checks, final strict typing, 98 frontend units and post-mobile-correction production build pass. All 113 distinct functional browser scenarios have passing evidence across the full and affected runs, including corrected compact/mobile board layout. This is aggregate coverage, not a clean single 113-pass run. [Current follow-up evidence](daily-editing-board-controls.md) records that distinction. The earlier 99-scenario result remains a historical baseline. The preserved development database remains at schema 10, and local readiness passes without a new migration or reseed. This is local implementation/evidence, not production-launch approval. Real Auth0/Google OAuth, selected assistant sessions, employee usability, account-specific costs and cloud performance/recovery remain external gates. No cloud resources or production site have been provisioned/published.

## Executed checks

| Check | Result |
| --- | --- |
| Real PostgreSQL Go suite, targeted race checks and vet | Pass: `go test -race -count=1 ./...` across all packages with real isolated PostgreSQL, including the 78-operation/40-mutation parity package (334.826 s). `go vet ./...` passes. Rich structures, bounded board epic reads, notification/activity/configuration, planning/integrations, runtime shutdown and fixture identity regressions are included |
| Strict Angular app/templates/test compilation | Pass |
| Frontend units |98 pass across 17 files, including rich structures, grouped card windows, username/password/session behavior, workspace filters, searchable controls and attachment file/binary contracts |
| Browser scenarios |Current follow-up: all 113 distinct functional scenarios have passing evidence: 110 passes in the complete run, 13 passes in the affected 14-case run, then three clean UI passes after a test readiness correction. The only app change after the full run was scoped quick-filter spacing; affected board cases pass. This is aggregate acceptance, not a clean single 113-pass run. Historical metadata baseline: 99 distinct scenarios covered by a 98-pass full run and a four-pass affected-menu rerun with unchanged application source between those two runs. See [current status](daily-editing-board-controls.md#browser-acceptance-status) and [historical accepted evidence](audit-implementation.md#follow-up-immediate-metadata-saving) |
| Local username/password access | Generated private fixture credentials, Owner/Member/Viewer login, wrong401/Disabled403, sign-out/reload, no browser persistence, bounded authentication and production/locality guards pass |
| Local browser timing harness | Historical separate timing case completed 100 project and 100 board navigation measurements: p95 129.21 ms and 554.27 ms. Small local fixture only; its contemporary functional baseline was a clean 77-case run. These measurements do not qualify the current follow-up or cloud performance |
| Managed identity Action | Typed build/CommonJS artifact loads;2unit tests pass; no real tenant |
| Generated contracts |78 business operations/40 mutations plus the separate typed development credential exchange; generated OpenAPI/sqlc/SDK compilation and final frozen drift check pass |
| Role/retry matrix |Pass: expanded 78-operation/40-mutation REST/MCP matrix, including current roles/revocation, revision conflicts, exact cross-channel retry and durable replay. Notification preferences/reminders, planning and integrations are included |
| Durable history | Archive/disable/restore/new instance preserve comment versions, historical picture/mention references, original events, inbox and graph/hierarchy |
| Maximum MCP image | Exact10MiB upload/download passes via official SDK; input13,981,257bytes and complete download13,981,659bytes, one base64 field; actual assistant compatibility pending |
| Runtime SQL grants | Actual disposable PostgreSQL role permits current work/expired reservations and denies DDL/history rewrite/business deletion |
| Full-scale workload |Prior full workload passes with exact seed counts/100 trials per action and complete 10k-issue/50k-inbox/50k-history/500-comment traversal. New report fixture also passes with 2,000 issues/20,000 transitions, 12 warmed trials, p50 64.63 ms/p95 98.00 ms and query-plan evidence; deployment workload qualification remains pending |
| Terraform |CLI1.14.7/provider8.2.0 locked; validation and five credential-free mock plans pass, including disabled SMTP defaults and optional pinned backend Secret Manager settings; real plan pending |
| Independent release artifacts | Backend binary/migration manifest; frontend public-config/CSP/file hashes prepared |
| Dependency checks | npm audits0vulnerabilities; Go scanner0vulnerable called/imported packages. Unused x/crypto/openpgp module advisory GO-2026-5932 has no fixed version and is not imported |
| Architecture/JSON/shell/script typing | Feature/platform imports, all JSON contracts, shell syntax and strict NodeTS release script compilation pass |
| Development process |Pass: current supervised API binary hash matches the verified backend candidate; API127.0.0.1:21080 and web localhost:4201 return HTTP200. Existing Owner sign-in and board read return five cards with bounded epic metadata. Earlier migrations 00008–00010 remain applied at schema 10; this follow-up requires no migration, reseed or credential change. The earlier combined make dev shutdown smoke remains retained evidence |

Pinned stack: Angular22.2.2, TypeScript6.0.3, Node24.21.0, Go1.27.2, PostgreSQL18.6, Go MCP SDK1.8.0, Huma2.39.1, pgx5.11.0, sqlc1.31.1, goose3.28.0, HeyAPI0.99.0, Zod4.6.5, Playwright1.64.0/Chromium156, Tiptap3.31.4. Generated local credentials, password hashes, application tokens and keys stay in ignored private fixture directories; evidence contains identifiers and measurements, not credentials. The local form exchanges username/password for a fresh in-memory session; production/Cloud Run cannot use this fixture endpoint and retain managed OAuth requirements.

The final post-mobile-correction Angular production build passes without warnings at 568.55 kB initial size and 140.29 kB estimated initial transfer, below the unchanged 600 kB warning and 1 MB error budgets. The earlier baseline measured 866.75 kB/~188.32 kB. Rich editor and Auth0 remain lazy chunks. Actual full-scale cloud web/startup measurements remain an external acceptance gate. No acceptance threshold was loosened.

Current follow-up evidence: [daily editing and board controls](daily-editing-board-controls.md). Its full-backend race/vet, generated checks and aggregate 113-scenario browser acceptance pass. Earlier audit evidence remains in the [implementation report](audit-implementation.md), [planning and integrations](planning-and-integrations-2026-10-13.md) and [notification delivery/activity](notification-delivery.md), including the historical 99-scenario metadata baseline. Retained earlier evidence includes [daily-workflow.md](daily-workflow.md), [performance.md](performance.md), the complete 50-test run `.local/browser-tests/7631a40f5df5438cbacb4e4feacbcb05/`, and the 13-test HTML-source draft/rich-text regression `.local/browser-tests/feefc1fdb36b441584dab3ebb93f302d/`. Earlier full-scale local PostgreSQL and 100-navigation-per-view browser measurements pass. Local measures do not certify Cloud latency, idle starts, peak RSS or actual assistant/employee usability.

## Functional requirement evidence

Every FR below has a local implementation/check; the external qualification column lists material unrun environment-specific proof. Links point to owning story evidence or this cross-cutting report. Completion of local evidence does not replace external release gates.

| Requirement | Local evidence | External qualification |
| --- | --- | --- |
|FR-001|[access.md](access.md): identity service/transport tests; access.spec.ts; all-operation revocation/retry matrix|Actual Google/Auth0 tenant OAuth pending.|
|FR-002|[access.md](access.md): identity service/transport tests; access.spec.ts; all-operation revocation/retry matrix|—|
|FR-003|[access.md](access.md): identity service/transport tests; access.spec.ts; all-operation revocation/retry matrix|—|
|FR-004|[access.md](access.md): identity service/transport tests; access.spec.ts; all-operation revocation/retry matrix|—|
|FR-005|[access.md](access.md): identity service/transport tests; access.spec.ts; all-operation revocation/retry matrix|—|
|FR-006|[access.md](access.md): identity service/transport tests; access.spec.ts; all-operation revocation/retry matrix|—|
|FR-007|[projects.md](projects.md): project service/transport tests; projects.spec.ts|—|
|FR-008|[projects.md](projects.md): project service/transport tests; projects.spec.ts|—|
|FR-009|[projects.md](projects.md): project service/transport tests; projects.spec.ts|—|
|FR-010|[issues.md](issues.md): issue assignment/search/default/Unicode tests; issues.spec.ts; organization cases|—|
|FR-011|[issues.md](issues.md): issue assignment/search/default/Unicode tests; issues.spec.ts; organization cases|—|
|FR-012|[issues.md](issues.md): issue assignment/search/default/Unicode tests; issues.spec.ts; organization cases|—|
|FR-013|[issues.md](issues.md): issue assignment/search/default/Unicode tests; issues.spec.ts; organization cases|—|
|FR-014|[issues.md](issues.md): issue assignment/search/default/Unicode tests; issues.spec.ts; organization cases|—|
|FR-015|[boards.md](boards.md): board/move/reorder service and transport tests; boards.spec.ts|—|
|FR-016|[boards.md](boards.md): board/move/reorder service and transport tests; boards.spec.ts|—|
|FR-017|[boards.md](boards.md): board/move/reorder service and transport tests; boards.spec.ts|—|
|FR-018|[boards.md](boards.md): board/move/reorder service and transport tests; boards.spec.ts|—|
|FR-019|[discussion.md](discussion.md): comment author/history/sanitization tests; discussion.spec.ts|—|
|FR-020|[discussion.md](discussion.md): comment author/history/sanitization tests; discussion.spec.ts|—|
|FR-021|[discussion.md](discussion.md): comment author/history/sanitization tests; discussion.spec.ts|—|
|FR-022|Cross-cutting checks above: command transaction/revision/retry tests; catalog/retention/runtime grants; current-access pagination|—|
|FR-023|Cross-cutting checks above: command transaction/revision/retry tests; catalog/retention/runtime grants; current-access pagination|—|
|FR-024|Cross-cutting checks above: command transaction/revision/retry tests; catalog/retention/runtime grants; current-access pagination|—|
|FR-025|Cross-cutting checks above: command transaction/revision/retry tests; catalog/retention/runtime grants; current-access pagination|—|
|FR-026|Cross-cutting checks above: command transaction/revision/retry tests; catalog/retention/runtime grants; current-access pagination|Cloud backup/PITR recovery still pending.|
|FR-027|Cross-cutting checks above: command transaction/revision/retry tests; catalog/retention/runtime grants; current-access pagination|—|
|FR-028|Retained baseline:50 browser cases; keyboard.spec.ts at768/1440px; [issue workspace](issue-workspace.md)|—|
|FR-029|Retained baseline:50 browser cases; keyboard.spec.ts at768/1440px; [issue workspace](issue-workspace.md)|—|
|FR-030|78-operation/40-mutation final REST/MCP matrix passes; retained [MCP core](mcp-core.md) and [attachment evidence](issue-workspace.md) plus current notification/planning/integration parity|20 selected-assistant sessions pending.|
|FR-031|78-operation/40-mutation final REST/MCP matrix passes; retained [MCP core](mcp-core.md) and [attachment evidence](issue-workspace.md) plus current notification/planning/integration parity|Real managed OAuth/client compatibility pending.|
|FR-032|78-operation/40-mutation final REST/MCP matrix passes; retained [MCP core](mcp-core.md) and [attachment evidence](issue-workspace.md) plus current notification/planning/integration parity|—|
|FR-033|78-operation/40-mutation final REST/MCP matrix passes; retained [MCP core](mcp-core.md) and [attachment evidence](issue-workspace.md) plus current notification/planning/integration parity|—|
|FR-034|Final 78-operation catalog and 40 cross-channel mutation replays pass via signed-human SDK/REST tests; retained [MCP core](mcp-core.md) and [attachment extension](issue-workspace.md)|—|
|FR-035|Cross-cutting checks above: empty-state/keyboard browser cases; retained history/picture test; closed catalog without permanent business deletion|—|
|FR-036|Cross-cutting checks above: empty-state/keyboard browser cases; retained history/picture test; closed catalog without permanent business deletion|—|
|FR-037|[boards.md](boards.md): named board owner/current role tests; boards.spec.ts|—|
|FR-038|[boards.md](boards.md): named board owner/current role tests; boards.spec.ts|—|
|FR-039|[discussion.md](discussion.md): 30 Arabic round-trip fixtures; sanitization/ownership/private picture tests; discussion.spec.ts|—|
|FR-040|[discussion.md](discussion.md): 30 Arabic round-trip fixtures; sanitization/ownership/private picture tests; discussion.spec.ts|Selected assistant max-picture compatibility pending; maximum-size official SDK transfer passes.|
|FR-041|[discussion.md](discussion.md): 30 Arabic round-trip fixtures; sanitization/ownership/private picture tests; discussion.spec.ts|Actual Cloud IAM/bucket enforcement pending; local privacy and mock plan pass.|
|FR-042|[discussion.md](discussion.md): 30 Arabic round-trip fixtures; sanitization/ownership/private picture tests; discussion.spec.ts|—|
|FR-043|[dependencies.md](dependencies.md): direct/combined cycle and Done-guard real PostgreSQL races; dependencies.spec.ts|—|
|FR-044|[dependencies.md](dependencies.md): direct/combined cycle and Done-guard real PostgreSQL races; dependencies.spec.ts|—|
|FR-045|[dependencies.md](dependencies.md): direct/combined cycle and Done-guard real PostgreSQL races; dependencies.spec.ts|—|
|FR-046|[dependencies.md](dependencies.md): direct/combined cycle and Done-guard real PostgreSQL races; dependencies.spec.ts|—|
|FR-047|[discussion.md](discussion.md): exact24h draft expiry/cleanup/failed upload tests; private storage and Scheduler candidate|Actual authenticated Scheduler execution pending; local cleanup checks pass.|
|FR-048|[organization.md](organization.md): company-midnight, ALL labels/filter/date limits tests; dates-labels.spec.ts|—|
|FR-049|[organization.md](organization.md): company-midnight, ALL labels/filter/date limits tests; dates-labels.spec.ts|—|
|FR-050|[organization.md](organization.md): company-midnight, ALL labels/filter/date limits tests; dates-labels.spec.ts|—|
|FR-051|[organization.md](organization.md): company-midnight, ALL labels/filter/date limits tests; dates-labels.spec.ts|—|
|FR-052|[boards.md](boards.md): Review/order/full saved-view counts, equal/exceeded soft WIP tests; boards.spec.ts|—|
|FR-053|[boards.md](boards.md): Review/order/full saved-view counts, equal/exceeded soft WIP tests; boards.spec.ts|—|
|FR-054|[boards.md](boards.md): Review/order/full saved-view counts, equal/exceeded soft WIP tests; boards.spec.ts|—|
|FR-055|[organization.md](organization.md): immutable one-level hierarchy/mixed cycles/completion races; subtasks.spec.ts|—|
|FR-056|[organization.md](organization.md): immutable one-level hierarchy/mixed cycles/completion races; subtasks.spec.ts|—|
|FR-057|[organization.md](organization.md): immutable one-level hierarchy/mixed cycles/completion races; subtasks.spec.ts|—|
|FR-058|[organization.md](organization.md): immutable one-level hierarchy/mixed cycles/completion races; subtasks.spec.ts|—|
|FR-059|[notifications.md](notifications.md): exact9 producer reason cases;100-trial recipient/dedup tests; current private inbox/revoke races; notifications.spec.ts|—|
|FR-060|[notifications.md](notifications.md): exact9 producer reason cases;100-trial recipient/dedup tests; current private inbox/revoke races; notifications.spec.ts|—|
|FR-061|[notifications.md](notifications.md): exact9 producer reason cases;100-trial recipient/dedup tests; current private inbox/revoke races; notifications.spec.ts|—|
|FR-062|[notifications.md](notifications.md): exact9 producer reason cases;100-trial recipient/dedup tests; current private inbox/revoke races; notifications.spec.ts|—|
|FR-063|[notifications.md](notifications.md): exact9 producer reason cases;100-trial recipient/dedup tests; current private inbox/revoke races; notifications.spec.ts|—|
|DEV-AUTH-001|[access.md](access.md): private generated passwords/hashes, real credential exchange, current full Go race/vet/auth-security checks, zero client drift and retained29-test browser baseline|Development fixture only; managed production OAuth remains required.|
|UX-006, UX-007|[issue-workspace.md](issue-workspace.md): native whole-card/row opening, retained drag/keyboard controls and prominent focusable comments/attachments|—|
|ATT-001–ATT-003|[issue-workspace.md](issue-workspace.md): typed private documents, current-access REST/MCP, validation/retry/revision/retention and real browser workflows|Cloud storage/cost/performance qualification remains pending.|

## Success criteria

| Criterion | Evidence/status |
| --- | --- |
|SC-001|Pending>=10representative employees/90% unaided<=5min. Ten local prepared accounts verified;0human sessions. [usability.md](usability.md) |
|SC-002|Local role/denial/revoke/cross-project/author/last-Admin cases pass via REST/MCP. Real OAuth issuance remains separate |
|SC-003|Local full-scale API timings and100small-fixture browser trials pass. Full-scale cloud/network/30min idle-start web measurements pending |
|SC-004|Pending20**complete** selected-assistant sessions, each covering the entire required flow. SDK parity is not a substitute. [assistant-workflows.md](../../../backend/tests/mcp/assistant-workflows.md) |
|SC-005|The final expanded 40-mutation REST/MCP matrix passes, including restart/cross-channel replay at23h59, stale/no-op/current-revoke and durable retention checks |
|SC-006|Full local seed traversal retrieves10kissues,50kinbox,50khistory and500comments once; board/filter pagination and100card rendering bounds pass |
|SC-007|Core keyboard/error/empty/status flows verified at768and1440widths;390px navigation/board verified; alternatives to drag available |
|SC-008|Saved/temporary filters do not mutate issues; shared order and explicit/combined blocker/child guards pass |
|SC-009|30Arabic/mixed-language fixtures, safe HTML and unauthorized private picture round trips pass |
|SC-010|100maximum10MiB HTTP uploads pass locally; failed/lost upload preserves editor and retry. Real network file-selection-to-ready cloud/browser timing pending |
|SC-011|Calendar, midnight, duplicate labels, all-selected filters, limit/rollback and authorized intersections pass |
|SC-012|Hierarchy/independence/progress/combined-cycle/parent-Done races and no automatic parent completion pass |
|SC-013|100producer trials exact non-actor reason/recipient unions, private read state/retry/revoke and next-read availability pass locally; cloud timing pending |
|SC-014|Review/shared order, saved-view WIP, equal/exceeded limits and current creator/Admin permissions pass |

## External gates and next execution packet

No additional account setup is necessary to continue ordinary local development. Cloud launch still requires the public tenant/client configuration, actual Google billing/project/credit terms, selected assistant/version, representative employees and an explicitly authorized isolated target. No credentials need to be pasted into this report.

- [hosting.md](hosting.md): credit balance/scope/expiry, actual region-selected cost export and employee identity entitlement pending.
- [test-target.md](test-target.md): real Terraform plan and target bootstrap/deployment pending; prepared scripts only validate/mock-plan/build by default.
- [performance.md](performance.md): full cloud/network/idle-start and overload/RSS/query-plan measurement pending; no tier/min-instance change selected.
- [recovery.md](recovery.md): real backup/PITR/immutable-object drill and measured RPO<=5min/RTO<=4h pending. The harness explicitly skips without a prepared clone.
- [release.md](release.md): additive separate-identity migration, backend-first named-revision canary, compatible frontend and rollback steps prepared; no external rollout performed.
- [usability.md](usability.md) and assistant workflow ledger: real human/client sessions pending.

The eight original external tasks remain unchecked. The earlier audit implementation had a clean 77-case functional browser run; that is historical evidence, followed by the 93-case live-search run and 99 distinct metadata scenarios across full/focused runs. The current follow-up passes full-backend checks and preserved-runtime smoke, with all 113 distinct browser scenarios covered by passing full/affected-run evidence. [tasks.md](../tasks.md) records the current status. This report does not claim the release gate is complete. The preserved database is at schema 10 after applying planning migration 00008, notification migration 00009 and backlog/integration migration 00010. It retains one project, five issues, two comments, two pictures, zero document files and four existing users, plus one disabled/unapproved system reminder actor without a login binding or project membership. Existing credentials are unchanged. API/web readiness and existing Owner planning/preferences/report reads return HTTP200. Earlier private-attachment smoke results remain retained evidence. User-owned spec/checklist changes are preserved. No Git commit or PR has been created.


Custom workflow/rich text evidence: [board-editor-rich-text.md](board-editor-rich-text.md) maps HTML-001–HTML-003, FLOW-001–FLOW-004 and ATT-004 to the current backend/browser checks and records upload/create limits. New stages have no fixed count and appear across project boards; editing/retries and completion rules stay authoritative in the shared typed services.


Daily workflow evidence: [daily-workflow.md](daily-workflow.md) maps DAILY-001–DAILY-009 to shared stage retirement/WIP, inline and bulk actions, drawer/mobile use, drafts/uploads/previews, sorted/private searches, backlog/archive/clone/watch/links and foreground refresh. The local credentials and4users/1project/5issues/2boards were preserved during additive rollout.

## Latest UI refinement

The earlier 2026-10-13 Jira-style frontend refinement is retained in [ui-refinement.md](ui-refinement.md), with its 53 browser checks, 86 unit tests, responsive screenshots and bundle warning. Those numbers describe that baseline. The subsequent historical audit candidate added backend contracts and deployment settings; its backend race/vet checks, 90 frontend units, generated checks, 556.38 kB/137.71 kB build and clean 77-case browser run passed at that stage. Later live-search and metadata evidence is retained below. The current follow-up has 98 passing units and a 568.55 kB/140.29 kB warning-free build, with aggregate 113-scenario browser acceptance detailed in [its report](daily-editing-board-controls.md).

## Current onboarding and runtime references

[Quickstart](../quickstart.md) covers combined `make dev` supervision, custom stages, arbitrary private files, planning/adoption scenarios and current rollout status. The [managed identity guide](../../../identity/auth0/README.md) explains exact-email approval and project roles: approval does not send an invitation email, create a local password or replace provider setup. The first managed Administrator uses the tested operator-only [bootstrap command](../../../backend/cmd/gategoldjira/bootstrap.go).

[Notification delivery](notification-delivery.md) documents the local 60-second worker, the existing authenticated five-minute production maintenance job, its 20-second notification slice, bounded durable retries/deduplication and disabled-by-default SMTP. Optional SMTP passwords use pinned backend Secret Manager references; no real message or deployment has run. Delivery is at least once and holds permission guards during the bounded SMTP send, so deployed relay latency remains a measurement requirement. [Planning/integration evidence](planning-and-integrations-2026-10-13.md) distinguishes epics/releases, Kanban metrics, manual development links and stage-entry assignment from unimplemented repository ingestion or Scrum scheduling.

Historical automatic blocker search follow-up: the same-key/reopening and rapid-edit suppression was fixed, the manual search button removed, and searching feedback added. Its nine affected browser journeys, strict types, 90 units and build passed. The complete 77-case audit run was the baseline at that stage; see [implementation evidence](audit-implementation.md#follow-up-automatic-blocker-search).

Bare-number follow-up: typing `2` or `002` finds exact issue 2 in the current
project. The shared issue and board queries retain permissions, paging and other
filters. Affected Go packages with PostgreSQL/race detection, REST/MCP search
parity, vet, strict types, 90 units and 17 selected browser journeys pass. Live
search confirms only `DEMO-2`; no migration was required. See
[numeric search evidence](audit-implementation.md#follow-up-bare-issue-numbers).

Historical live-search/popup follow-up: its complete functional browser suite
passed all 93 journeys in one clean 4.2-minute run. All text lookups update while
typing, and issue fields/shared pickers float above their containing pages and
dialogs. Strict types, 90 frontend units, architecture checks and the latest
567.35 kB / 139.88 kB production build pass. Twenty local warmed typing trials
measured p95 184.34 ms; API search p95 was 6.07 ms. Both existing local listeners
remain ready. Earlier frontend runs remain historical evidence; backend and
external qualification gates are unchanged. See [accepted evidence](audit-implementation.md#follow-up-live-searches-and-popup-fields).


Historical immediate metadata saving follow-up: assignee, priority and picked/cleared dates
save on selection in the issue page and board preview. Typed date segments commit
on Enter or leaving the field. Failures retain immutable retry intent; reviewed
conflicts preserve unrelated latest values and restore keyboard focus. All 99
functional scenarios are covered by the final 98-pass full run plus the four-pass
menu rerun after a test focus correction, with no application changes between them.
Strict types, 90 units, architecture and the 567.35 kB / 139.87 kB production build
pass. The existing local web/API listeners remain healthy. See [verification and
screenshots](audit-implementation.md#follow-up-immediate-metadata-saving).
