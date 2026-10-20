# Jira audit implementation — 2026-10-13

The recommended company Kanban improvements from the
[product audit](jira-product-audit-2026-10-13.md) are implemented. Angular and
Go remain separate, with strict generated contracts, PostgreSQL persistence,
feature-first ownership and shared REST/MCP services. All 77 functional
browser journeys, 90 frontend unit tests and the complete PostgreSQL-backed
Go race suite pass. The preserved local app runs schema 10. Accepted screenshots
and reproducible local evidence are recorded below.

## Delivered behavior

| Area | Result |
| --- | --- |
| Daily issue work | Compact creation with visible actions, optional fields, searchable/paginated Arabic-capable pickers, discussion beside Description, and compact mobile Details. Existing rich HTML, clipboard pictures, unified private attachments, inline edits, drafts and explicit conflict review remain. |
| Search and navigation | Blocker/related results beyond the first page are reachable. The Projects label is accessible and aligned; a newly created/edited project remains reachable beyond the first directory page. Delayed create responses cannot use another project's draft or file queue. |
| Workflow editing | One focused stage editor, compact stage list, one named save region and explicit project-wide impact. Custom stages, ordering, retirement/remapping, allowed moves, completion guards and soft WIP warnings remain. |
| Backlog | A dedicated ranked view with drag and keyboard ordering, selection and move-to-board. Planned creation is atomic, has independent order revisions, and stays off the active board. Returning work receives a fresh trailing rank. |
| Planning | Epics and releases with target dates, status, linked issues and derived completion progress; independent, revision-checked issue associations. |
| Reports | Throughput, measured cycle time, aging work and blockers from retained transition events, with bounded date windows/pages and documented reopen semantics. |
| Notifications | Event/channel preferences, opted-in due reminders, durable deduplicated outbox, bounded retries and optional instant/digest SMTP. Inbox and activity show readable people, issue keys and company-calendar filters. SMTP remains off without configuration. |
| Migration | Mapped CSV preview, explicit confirmation, row errors, partial outcomes, resumable retries, source-key duplicate detection and filtered paginated export with spreadsheet formula protection. |
| Development | Retained manual pull-request/commit links and an Administrator-managed stage-entry assignment rule, with eligible-user checks, attribution and normal workflow guards. |
| Adoption and local operation | Exact-email approval/project-role/first-login guidance, tested operator owner bootstrap, and combined `make dev` supervision with readiness and retained logs. |

AUDIT-02/03/04 are addressed. The previous blocker-prefix fix remains covered.
The shared catalog now has **78 business operations and 40 mutations**;
development credential exchange is separate from that catalog.

## Verification

| Check | Observed result |
| --- | --- |
| Complete Go/PostgreSQL suite | `go test -race -count=1 -timeout=15m ./...` passed, followed by `go vet ./...`. Disposable databases preserve live company data. |
| REST/MCP parity | All 78 operations and 40 mutation replays pass through real services, including restart, permissions and revocation. Parity package: 333.766 seconds. |
| Generated contracts and boundaries | `scripts/check-generated.sh` and `scripts/check-architecture.py` passed; OpenAPI/sqlc/SDK/Zod are consistent. |
| Angular | Final strict app/template/browser-test types, all 90 unit tests and production build passed. Initial bundle: 556.38 kB, estimated transfer 137.63 kB; unchanged budgets pass. |
| Corrected browser journeys | All 15 focused journeys passed, including actual downloaded-CSV reimport with zero new issues, ten-stage editing, Arabic project retention, planning progress and reviewer assignment. |
| Status-menu keyboard regression | Four focused journeys pass. Rapid ArrowDown/ArrowDown/Enter before deferred rendering selects and persists In progress; reopening, mobile selection, restricted stages and failed moves remain covered. |
| Complete browser suite | All 77 functional journeys passed in one clean run (3.4 minutes), including the new rapid-key regression. No expected failures or retries; navigation timing is recorded separately. |
| Local browser timing | Separate timing case completed 100 project and 100 board navigation measurements; p95 129.21/554.27 ms. [Timing evidence](../../../.local/browser-evidence/audit-implementation-2026-10-13/browser-performance-local.json). This is a small local fixture, not cloud acceptance. |
| Kanban report workload | Two projects, 2,000 issues and 20,000 transitions; 12 warm report trials: p50 64.63 ms, p95 98.00 ms. Summary/current-work EXPLAIN: 28.36/1.59 ms. [Query-plan evidence](planning-report-performance-local.json). |
| Infrastructure candidate | Terraform validation and five credential-free mocked plans pass, including disabled SMTP and pinned backend secret references. No deployment occurred. |
| Preserved local runtime | Schema 10, API readiness and web HTTP 200, existing Owner credentials and new planning/preferences/report reads HTTP 200. Retained sample picture download HTTP 200. |

Focused PostgreSQL cases also cover source-identity encoding, resumed transient
batch failures, rank collisions after returning work, preference opt-out,
revocation during delivery, reminders without SMTP, digest grouping, worker
shutdown and restricted runtime SQL grants. Browser scenarios retain Member,
Viewer and Administrator behavior, Arabic/HTML, files, drag/keyboard moves,
stale edits, uncertain responses and mobile bounds. No expected-failure
annotations remain for the audit defects.

The final status-menu fix retains the intended keyboard selection independently
of deferred rendering. A read-only review found no additional actionable focus
or workflow-guard regressions. The test sends all three keys in one browser task
and checks the persisted API status; it does not rely on increasing a timeout.

Final run evidence:

- Functional browser run: `.local/browser-tests/0cb7ae8b2401473c815d155dd67243df/`; log `.local/audit-implementation-browser-accepted-functional.log`.
- Focused status regression: `.local/browser-tests/e31d017bc7da4ce299bea2f3c1cdfe43/`; four cases pass.
- Frontend checks/build: `.local/audit-implementation-frontend-accepted.log`.
- Complete backend race/vet: `.local/audit-implementation-go-final.log`; generated/boundary checks: `.local/audit-implementation-generated.log`.
- Navigation timing: the timing case in run `c1e003508a8b4526addbd1ab9e233335` completed its 200 measurements. That process stopped before its last case, so its overall run is not counted as acceptance. The later clean 77-case functional run supplies that evidence.

Reproduce the functional run with `bash scripts/run-browser-tests.sh --grep-invert
'100 warmed browser route reads'`. The separate opt-in timing case uses
`RUN_BROWSER_PERFORMANCE=1 bash scripts/run-browser-tests.sh performance.spec.ts`.
Both runners isolate the database, accounts, files and ports.

## Accepted interface evidence

The final run captured and visually checked the real application at desktop,
tablet and phone sizes. Screenshots and non-secret measurements are preserved
under `.local/browser-evidence/audit-implementation-2026-10-13/`, with a
[hash manifest](../../../.local/browser-evidence/audit-implementation-2026-10-13/manifest.json).
They establish visible states; browser assertions establish saved behavior.

| Flow | Accepted captures |
| --- | --- |
| Everyday issue work | [Compact creation](../../../.local/browser-evidence/audit-implementation-2026-10-13/compact-create.png), [issue workspace](../../../.local/browser-evidence/audit-implementation-2026-10-13/jira-issue-desktop.png) |
| Board and workflow | [Board](../../../.local/browser-evidence/audit-implementation-2026-10-13/jira-board-desktop.png), [phone board](../../../.local/browser-evidence/audit-implementation-2026-10-13/jira-board-phone.png), [ten-stage focused editor](../../../.local/browser-evidence/audit-implementation-2026-10-13/focused-workflow.png) |
| Status selection | [Desktop dropdown](../../../.local/browser-evidence/audit-implementation-2026-10-13/status-dropdown-desktop.png), [phone dropdown](../../../.local/browser-evidence/audit-implementation-2026-10-13/status-dropdown-mobile.png) |
| Planning and measurement | [Ranked backlog](../../../.local/browser-evidence/audit-implementation-2026-10-13/ranked-backlog.png), [epics/releases](../../../.local/browser-evidence/audit-implementation-2026-10-13/planning-epics-releases.png), [Kanban reports](../../../.local/browser-evidence/audit-implementation-2026-10-13/kanban-reports.png) |
| Team adoption | [CSV import/export](../../../.local/browser-evidence/audit-implementation-2026-10-13/csv-import-export.png), [phone notification preferences](../../../.local/browser-evidence/audit-implementation-2026-10-13/notification-preferences-mobile.png), [readable activity](../../../.local/browser-evidence/audit-implementation-2026-10-13/readable-company-activity.png) |
| Development workflow | [Stage assignment rule](../../../.local/browser-evidence/audit-implementation-2026-10-13/stage-assignment-automation.png), [development links](../../../.local/browser-evidence/audit-implementation-2026-10-13/development-links.png) |

## Local rollout and data preservation

Only additive migrations 00008–00010 were applied. Aggregate checks before and
after showed one project, five issues, two comments, two pictures and zero
document attachments unchanged. The four existing users and their private
credentials were preserved; migration 00009 adds one disabled, unapproved
reminder actor without an identity binding or membership.

The verified GateGoldJira API process was replaced with the tested build using
its existing private configuration. The web listener was retained. An
eight-second `scripts/dev.sh` smoke reused both listeners, reported readiness,
and left them available after the supervisor stopped. Logs remain in `.local`.
No reseeding, password replacement, cloud deployment or real email occurred.

## Detailed guides and remaining qualification

- [Backlog and CSV contracts/round trips](../../../backend/internal/features/issues/README.md).
- [Planning, metrics and integration evidence](planning-and-integrations-2026-10-13.md).
- [Notification delivery, permissions and SMTP tradeoffs](notification-delivery.md).
- [Onboarding and local operation](../quickstart.md).
- [Current readiness and external release gates](readiness.md).

Preserve exported `sourceKey` and `sourceKeyEncoding` columns when reimporting:
base64url metadata retains exact external identities without spreadsheet
formula interpretation. CSV export does not include comments, attachments or
audit history and is not a database backup.

Real Auth0/Google authorization, configured SMTP delivery/relay latency,
Google Cloud deployment/cost/performance/recovery, twenty actual assistant
sessions and ten employee usability sessions remain external qualification.
SMTP is at least once; its bounded send holds permission guards, so slow relay
latency can delay conflicting writes. These limits are documented rather than
treated as completed cloud acceptance.

The implementation covers the audit's recommended Kanban scope. Manual
development links do not ingest repositories; automation handles stage
assignment. Scrum scheduling and optional enterprise customization remain
outside this scope. Automated passes cover the recorded scenarios, not every
possible device or combination.

## Follow-up: automatic blocker search

The Add a blocker picker now searches displayed issue keys or titles as the user
types, with immediate searching feedback and a 120 ms typing delay. The manual
Find blockers button is removed; Enter and an error-only Retry search action
remain available. The input retains Arabic direction, keyboard selection,
same-project scope, self exclusion and paginated candidates.

The previous debounce's duplicate suppression could clear results without
sending another request when the same key was entered after reopening, or after
rapid A→B→A edits. A lifecycle-scoped timer now replaces that suppression,
cancels on close/context change/destruction, and retains generation guards so
older responses cannot replace the latest query. Empty loading results no longer
announce a premature no-match message.

Verification: all nine affected browser journeys pass in one clean run
(31.3 seconds), including repeated keys, held older responses, real keyboard
linking on a phone, Arabic title search, key-prefix lookup and dependency
completion/cycle/conflict guards. Strict app/template/test compilation, all
90 units and production build pass (556.38 kB initial / 137.71 kB estimated
transfer, within unchanged budgets). This focused follow-up supplements the
earlier complete 77-case audit run; it is not described as a new 80-case full run.
Backend services, contracts and schema were unchanged.

Run: `.local/browser-tests/84914f7275134b29a03f3cfba7e561be/`.
Logs: `.local/blocker-live-search-browser-accepted.log` and
`.local/blocker-live-search-frontend.log`. Accepted visible states:
[desktop](../../../.local/browser-evidence/blocker-live-search-2026-10-13/blocker-live-search-desktop.png) and
[phone](../../../.local/browser-evidence/blocker-live-search-2026-10-13/blocker-live-search-mobile.png).

## Follow-up: bare issue numbers

Typing `2` in Add a blocker now finds issue 2 in the current project immediately
after the existing 120 ms typing delay. Leading zeros and surrounding spaces
are accepted. Digit-only queries are exact number lookups; issue 12 or an
unrelated title containing 2 is excluded. Full issue keys, project-key prefixes
and literal title searches retain their previous behavior.

All seven issue search/count and board saved/temporary count/card predicates
use the same rule. Numeric input stays text, so zero or oversized numbers return
no matches safely. Existing permission checks, other filters and paging remain
in effect. The picker help now mentions issue numbers explicitly.

Verification: the complete affected Go issue/board packages pass with PostgreSQL
and race detection; focused bare-number and existing key-prefix REST/MCP parity
tests plus affected-package vet pass. Contract regeneration and architecture
checks show no drift. Strict app/template/test types, 90 units and the production
build pass (556.38 kB initial / 137.74 kB estimated transfer). All 17 selected
browser journeys pass in a clean 57.0-second run, including exact 2 versus 12,
title-only distractors, current-project/self exclusions, leading zeros, phone
keyboard selection, repeated queries, delayed responses and existing board and
dependency guards. This is focused regression coverage; the earlier full audit
run remains the complete-suite baseline.

The verified local API was replaced with the tested build, preserving its
private environment, credentials and company data. No schema migration or
reseeding was needed. Live authenticated search confirms that `2`, `002` and
`DEMO-2` each return only `DEMO-2`; both API and web listeners are ready.

Run: `.local/browser-tests/2c11178a1b14470bb33313e9111d8714/`.
Logs: `.local/numeric-search-go-accepted.log`,
`.local/numeric-search-browser.log`, `.local/numeric-search-frontend.log`,
`.local/numeric-search-generated-build.log`.
Live receipt: `.local/numeric-search-live-smoke.json`.
Accepted captures:
[desktop](../../../.local/browser-evidence/numeric-search-2026-10-13/blocker-numeric-search-desktop.png) and
[phone](../../../.local/browser-evidence/numeric-search-2026-10-13/blocker-numeric-search-mobile.png).

## Follow-up: live searches and popup fields

All text lookups now update while typing: global issues, issue lists, board
queries and temporary filters, blockers, related issues, parent issues,
assignees, mentions, labels, automation assignees, project directory and company
activity. Server lookups use a short 120 ms typing delay with immediate loading
feedback. Context/session ownership and generation checks prevent older replies
from replacing the current query. Global search cancels superseded requests and
offers keyboard selection, Arabic title matching and access-scoped suggestions.
History retains complete issue-key/UUID validation and paired resource filters;
partial invalid identifiers show validation without submitting an invalid read.

Assignee, priority, due date and label editors now float in the browser top layer
beside their triggers. Shared searchable pickers use the same positioning helper.
Menus stay within the viewport, follow scrolling/resizing, support RTL and close
with Escape, outside clicks or keyboard focus leaving the field. Opening a menu
does not shift the issue Details rows or the create/edit form footer. The board
drawer no longer swallows clicks because of its enclosing dialog. Explicit saves,
revision review and retry references remain in effect; edit triggers are disabled
while saving.

Board filtering keeps the board and focused search input mounted, reuses project
context and bounds column reads. Stale count replies do not start obsolete card
reads. Filter changes queue behind active writes and preserve uncertain move
retries. Repeated query-only navigation avoids redundant workspace context reads.
Assignee choices use a bounded, session/project-scoped cache and refresh in the
background, so reopening a verified menu can show choices immediately.

Local measurements distinguish server work from interface waits. Twenty warmed
reads against the existing five-issue development company measured issue-search
p95 6.07 ms and assignee-choice p95 3.59 ms. Twenty warmed browser typing-to-visible
result trials in the isolated company measured p95 184.34 ms and maximum 186.20 ms,
including the typing delay. These are local measurements, not cloud acceptance.

Verification: all 93 functional browser journeys pass in one clean run
(4.2 minutes), including live numeric/Arabic queries, rapid repeated queries,
delayed older replies, cache reopening, mobile/RTL popup bounds, keyboard/outside
closing, drag and drop, permissions, attachments, uncertain saves and move retries.
Strict app/template/test types, all 90 frontend units, architecture checks and
the production build pass. Initial bundle: 567.35 kB / 139.88 kB estimated transfer,
within unchanged budgets. The separate opt-in 100-navigation timing case was not
repeated; the new 20-trial typing measurement ran in the functional suite.
Backend contracts and schema were unchanged during this follow-up.

The existing localhost:4201 listener serves the new live-search code and returns
HTTP 200; the preserved API listener returns HTTP 200 readiness. No credentials,
company records or database volumes were reset. Browser verification used a
disposable company database that the runner removed on completion.

Run: `.local/browser-tests/ea906fdcebdf48ce98a28f0942888f8b/`.
Logs: `.local/all-live-search-browser-final.log` and
`.local/all-live-search-frontend-final.log`.
Accepted evidence and checksums:
[manifest](../../../.local/browser-evidence/all-live-search-2026-10-13/manifest.json),
[global suggestions](../../../.local/browser-evidence/all-live-search-2026-10-13/global-live-search.png),
[assignee popup](../../../.local/browser-evidence/all-live-search-2026-10-13/issue-assignee-popup-desktop.png),
[phone popup](../../../.local/browser-evidence/all-live-search-2026-10-13/issue-details-popup-mobile.png).


## Follow-up: immediate metadata saving

Assignee and priority choices now save immediately in issue details and the board
preview. Picking or clearing a due date also saves immediately. Manually typed
native date segments stay local until Enter or leaving the field, avoiding writes
of intermediate years or accidental clearing from an incomplete date. These three
menus have no ordinary Save footer. Selecting the confirmed value closes without
an issue write. Titles, descriptions and labels retain their explicit draft actions.

Pending writes lock repeat changes and show saving feedback. Failed writes retain
the selected value and exact original payload/retry reference. A lost accepted
reply can be retried without another revision. A conflict requires review and
explicit application; only the selected field is applied to the latest issue,
preserving other developers' changes. After review, focus moves to **Apply reviewed
change** without scrolling, so Escape remains available. Existing error summaries
receive focus on failed writes. Menus remain bounded on desktop, phone and RTL views.

Verification covers all **99 distinct functional browser scenarios**. The final
full run passed **98**, with one test sending keyboard events before the reopened
menu had focus. After synchronizing its focus assertions, the affected four-case
menu suite passed **4/4**; application source was unchanged between these runs.
The earlier review-focus issue was fixed in the application and passed in the
98-pass full run. All six new autosave cases passed in that same run, covering
persistence/clear/unassignment, no-op navigation, native date typing, mobile pending
writes, lost accepted replies and concurrent edits. Viewer denial and exact write,
revision and retry counts are checked against real isolated PostgreSQL.

Strict app/template/test types, all **90 frontend units**, architecture checks and
the production build pass. Initial bundle: **567.35 kB / 139.87 kB** estimated
transfer, within unchanged budgets. The existing localhost:4201 listener serves
the autosave and review-focus changes; both the web app and preserved API readiness
return HTTP 200. No schema migration, dependency addition or data reset was needed.
Browser runners removed their disposable databases on completion.

Full run: `.local/browser-tests/7adecec1c7044a4baa7e28826533b422/` (4.3 minutes).
Focused run: `.local/browser-tests/00d4ab7e53284c9896adeb708607b594/` (16.5 seconds).
Logs: `.local/issue-autosave-browser-accepted.log`,
`.local/issue-autosave-keyboard-accepted.log` and
`.local/issue-autosave-frontend-final.log`.
Accepted evidence and checksums:
[manifest](../../../.local/browser-evidence/issue-autosave-2026-10-13/manifest.json),
[assignee menu](../../../.local/browser-evidence/issue-autosave-2026-10-13/issue-assignee-popup-desktop.png),
[RTL phone menu](../../../.local/browser-evidence/issue-autosave-2026-10-13/issue-details-popup-mobile.png),
[pending save](../../../.local/browser-evidence/issue-autosave-2026-10-13/issue-autosave-mobile-pending.png),
[retry retained selection](../../../.local/browser-evidence/issue-autosave-2026-10-13/issue-autosave-mobile-retry.png).
