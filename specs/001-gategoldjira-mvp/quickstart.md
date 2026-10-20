# Quickstart and Acceptance Guide

**Status**: The MVP and Jira audit additions are implemented in code: company/project roles, projects/issues/assignments, custom Kanban stages and drag/keyboard ordering, rich Arabic descriptions/comments and private files, blocked-by work, due dates/labels/subtasks, epics/releases, ranked backlog planning, reports, CSV import/export, development references, stage assignment rules, notification preferences/reminders and readable activity. The current follow-up adds automatic Epic/Release saving, comment text editing in drawers, personal board filters, assignee/epic swimlanes and rich code/table/checklist structures. All 78 business operations and 40 mutations share typed REST/MCP services. Strict Angular app/test compilation, 98 frontend units, the complete PostgreSQL-backed Go race suite and vet, and generated drift/architecture checks pass; the five credential-free Terraform plans remain retained earlier evidence. The final post-mobile-correction frontend build passes without warnings at 568.55 kB initial size and 140.29 kB estimated transfer. The preserved development database remains at schema 10, and existing Owner/API/web readiness passes without a new migration or reseed. Focused browser checks pass and the complete current browser run is in progress; earlier 77/93/99-scenario results describe previous candidates. Real Google/Auth0 OAuth, 20 actual assistant sessions, 10 representative employee sessions, account-specific costs and Cloud performance/restore gates remain pending; see [validation/readiness.md](validation/readiness.md).
**References**: [plan.md](plan.md), [data-model.md](data-model.md), [REST](contracts/rest-api.md), [MCP](contracts/mcp.md), [research/costs](research.md).

## Local setup

Use Go1.27.2, Node24.21.0/npm11.19.0, Docker Compose and Make. This workspace has the verified runtimes in ignored `.tools/`; `scripts/tool-env.sh` and Make use them when present. Other checkouts must install those pinned runtimes and run `npm ci` separately in `frontend/` and `identity/auth0/`.

From the repository root:

```bash
make setup-dev
make db-up
make db-seed
make contracts
make build
make typecheck
make test-integration
```

`setup-dev` creates ignored local environment/config files only when missing. `db-seed` applies migrations and creates four local identities (Owner, Member, Viewer and Disabled), one project, two boards, five issues including a subtask, a blocker link, a label, an Arabic formatted comment, a private gallery image and an inbox entry. Migrations retain a separate disabled, unapproved reminder actor with no identity binding or project membership; it is not another login account. Repeated seeding preserves existing work and roles. Local fixture usernames are `owner`, `member`, `viewer` and `disabled`; unique random passwords are generated in private ignored `.local/identity/accounts.json`, with bcrypt hashes in `.local/identity/credentials.json`. Repeated `db-seed`/`dev-tokens` preserves existing credentials. Signing keys and one-hour, audience-specific token files are also written with private permissions below `.local/identity/`; no password, key or token is logged. `make dev-tokens` adds missing credentials to an older local setup and refreshes token files used by programmatic REST/MCP checks. Fixture commands reject production, Cloud Run and non-loopback databases. These fixtures do not exercise real Google/Auth0 OAuth.

Start both applications together:

```bash
make dev
```

This supervisor checks readiness, preserves logs in `.local/dev-api.log` and `.local/dev-web.log`, and restarts only the processes it starts, up to five attempts. It reuses existing API/web listeners without stopping them. Ctrl+C stops its own process groups. It never seeds the database or changes credentials. Angular reloads frontend changes; restart `make dev` after Go changes to rebuild the API. Separate terminals remain available:

```bash
make dev-api
```

```bash
make dev-web
```

The Go API listens on `127.0.0.1:21080`; Angular uses port4201 by default (`GATEGOLD_WEB_PORT` overrides it) and runs on `http://localhost:4201` and proxies `/api` and `/mcp` to that port. Open the sign-in page, enter `owner` and its generated password from `.local/identity/accounts.json`, and choose **Sign in locally**. This account is the local company Administrator; `member` and `viewer` demonstrate project permissions. The Disabled fixture cannot sign in. Password sign-in creates a fresh one-hour token, so an expired token file does not require a manual refresh for web login. The browser keeps the session token only in memory; reload or sign-out returns to sign-in. Passwords clear after submission and are not saved in browser storage. The Owner can approve/edit users and manage project roles. Generic health/readiness, OAuth resource metadata and the development-only credential exchange are public; company data still requires an approved active identity. Production and Cloud Run retain managed Auth0 login and cannot use the local fixture endpoint.

Verify the public process endpoints:

```bash
curl --fail http://127.0.0.1:21080/healthz
curl --fail http://127.0.0.1:21080/readyz
```

Both applications build independently. `make test` runs Go/unit/frontend checks; `make test-parity` checks the current MCP/REST providers and local OAuth fixtures; `make test-integration` requires real isolated PostgreSQL databases and never treats a missing database as success. `make check-generated` checks reproducibility against current generated output; `python3 scripts/check-architecture.py` checks Go package boundaries after sourcing `scripts/tool-env.sh`. The exported API contains the implemented business DTOs; the separate fixture is used only in contract tests.

Click an issue card or issue row to open its details. **Add comment** focuses the rich editor, which supports Arabic and mixed-language text. Paste or drop PNG/JPEG/WebP pictures into descriptions or comments, or use **Attach files** to upload multiple files of any kind, up to 10 MiB each and 20 per queue. Pictures and PDFs have private previews; other files download. Recognized document formats retain validation, and unknown formats remain opaque downloads. Current authorized users can read files; Members/Admins can upload or detach them, while Viewers have read-only access. Detach removes a file from the current list and retains its private history. Existing databases need the additive migrations before running a compatible backend. This preserved workspace is now at schema 10, with migrations 00008–00010 applied; its existing credentials and company work are retained. API readiness on port 21080 and the web on port 4201 return HTTP 200, and Owner planning/preferences/report reads pass. See [issue workspace evidence](validation/issue-workspace.md) and [rich text/custom workflow evidence](validation/board-editor-rich-text.md).

`make test-browser` creates its own temporary PostgreSQL database, API, identities and web port, then runs actual Chromium tests and drops the temporary database. Install its pinned browser once with `source scripts/tool-env.sh` and `cd frontend && PLAYWRIGHT_BROWSERS_PATH="$GATEGOLD_ROOT/.cache/playwright" npx playwright install chromium`. Angular uses polling to work on machines whose native file-watcher limit is exhausted. `make test-perf` now runs the full isolated local workload and writes `.local/performance/local.json`; `make test-restore` compiles the cloud verification harness and explicitly skips without a configured restored clone. `make prepare-test-target` validates/mock-plans the candidate; `make prepare-backend-release` and `scripts/release-frontend.sh` prepare independent review artifacts without deployment. Real Auth0 tenant/OAuth, selected assistant interoperability, employee usability and Google Cloud restoration/cost checks remain pending; the user chose to continue locally without an Auth0 tenant.

## End-to-end validation scenarios

Use fixtures and the actual operation schemas. Run relevant actions through both web and the registered Go-SDK MCP client; for SC-004 also record the selected assistant client/version and perform 20 complete user-delegated sessions.

| Scenario | Expected outcome |
| --- | --- |
| Admin approves a user, grants Viewer/Member, disables/demotes/removes access | Correct effective roles on next REST/MCP/image call; invalid assignments cleared; historical authors remain; last Admin cannot be disabled/demoted |
| Create/edit/archive/restore a project | Immutable unique normalized key and issue IDs; archive read-only; membership admin still works; restore preserves work |
| Create/search/edit/assign an issue, then retry and send a stale edit | Defaults and immutable reporter; authorized My Issues/search filters only; one effect/event on retry; conflict preserves newer values |
| Create a filtered board, add/rename/reorder custom stages, and drag/change stage with hidden cards | No fixed stage count; saved project workflow and shared issue order persist across boards; keyboard alternatives, completion/transition rules and hidden relative order are preserved; failure restores confirmed state |
| Set Review WIP limit2 and move third matching issue; add temporary filter | Move succeeds with textual3/2 warning; full saved-view count unchanged by temporary visibility; equal2 does not warn |
| Link A blocked by B, attempt Done, finish/reopen B; add graph cycle | Done blocked until direct prerequisites finish; no automatic dependent status change; reopen warning; self/cross-project/combined parent cycle denied |
| Add Arabic/bilingual formatted comment with uploaded picture/mention; edit it | Safe supported formatting/direction/text preserved; original authorship/history retained; only author can edit; unsupported HTML stripped with notice; newly added mentions notify once |
| Fail an upload/save, expire a private draft, revoke access to a copied picture URL | Unsent text retained for current editor session; no incomplete reference; exact24h access expiry; next unauthorized read denied |
| Open an issue from card/row padding; upload pictures and Arabic-named PDF/documents; retry a lost upload response | Native navigation and drag both work; comment draft remains; file downloads use current authorization; one upload effect on retry; Viewer cannot mutate |
| Detach a document after another session edits the issue | Conflict refreshes current details, explicit reviewed retry is required, unsent comment remains, and retained file bytes stay private |
| Set due dates/labels across company midnight; repeat differently cased label | Dates never shift; today/undated not overdue; past reopened work overdue; same label reused; combined AND/range/parent filters correct |
| Create/complete subtasks while racing parent Done or child reopen | One-level immutable relationship; accurate progress; no Done parent with unfinished child; last child does not complete parent automatically |
| Combine reporter/assignee/mention recipient roles, retry, edit mentions, revoke access | One entry per event/affected issue/eligible non-actor; no failed-event notifications; own-only inbox/counts/read states in both channels, hidden entries contribute nothing |
| Restart backend, switch Cloud Run instances, traverse every unchanged collection | Saved work/history/pictures/inbox/read state survive; no session affinity; default 25/max 100 pages cover each authorized match once |
| Rank backlog work, retry a reorder and activate selected issues | Independent revision-checked planning order, drag and keyboard controls, exact retry and valid board-stage placement |
| Create epics/releases, link issues and inspect Kanban reports | Typed planning membership, derived progress, bounded date/current-work results and explicit completion/reopen measurements |
| Preview/import a mapped CSV, retry partial outcomes and export filtered work | Stable row identities, authorized typed fields, no duplicate confirmed rows and formula-safe exported cells |
| Add a development reference and enter a stage with an assignment rule | Validated manual link, eligible assignee, atomic issue assignment, matched-rule history and a private notification |
| Save Inbox preferences with a lost response, opt in to due reminders and revoke access before delivery | Exact revision/retry behavior, bounded durable deduplication, current company-date reminders and no revoked/opted-out delivery; email remains disabled without backend SMTP configuration |

Check keyboard core flows at >=768px with focus/labels/readable errors and all required controls. Test >=30 Arabic/bilingual examples including identifiers, punctuation, lists and descriptions; inspect no script execution or remote picture exposure. Record SC-001 usability results for >=10 representative employees, with >=90% finishing the core flow in5min.

## Performance validation

The deterministic local performance fixtures match the full spec:50 concurrent users;20 projects;10k issues (2k children, up to2k/project);20k comments (up to500/issue);3 boards/project;1k dependencies;1k pictures averaging1MiB plus10MiB trials;10labels/project;dates on half issues;50knotifications;>=20% Arabic/bilingual content.

```bash
make test-perf
```

Expected report includes region, tier, instance min/max, network/browser, dataset seed, read/write mix, concurrent user load, sample counts, startup and query/pool/lock/memory measurements. Use >=100 trials/action; ordinary company laptop, >=10Mbps and <=100ms region RTT. Measure warm and first project/board after 30 minutes idle separately:
- Warm web action p95 <=2s; idle-start project/board p95 <=5s.
- Internal ordinary API engineering budget: p95 read <=500ms/write <=750ms on warm service, excluding picture bytes. This supports the web target and is still a measurement gate.
- Picture selection-to-confirmation p95 <=30s for >=100 uploads including 10 MiB.
- Notifications on next authorized read, p95 availability <=5s for >=100 producing actions.
- No record/list loads exceed100, no initial whole-board rendering, no per-card database query pattern.
- Transfer concurrency/memory stays below configured1GiB; max-picture MCP JSON does not duplicate base64 or exceed16MiB.

If min 0 misses idle-start after startup tuning, test min 1 and reforecast cost. If shared SQL misses capacity, tune query plans first then test dedicated tier. Failing budget is unresolved work; do not declare acceptance because the language is fast. Test SQL connection exhaustion/temporary Cloud Run over-scaling and controlled retry behavior.

## Before Google Cloud launch

Pinned Terraform, Firebase configuration, separate migration command/identity and release/restore runbooks are prepared. No paid Cloud target is authorized/configured. Before target execution:
1. Verify actual Google Billing credit balance/SKU scope/expiry and europe-west1 price estimate; configure gross-cost alerts.
2. Configure Auth0 tenant, separate audiences/resource profile, Google connection, compiled typed claims Action, approved Admin binding and registered client. Prove PKCE/challenge/discovery and wrong-audience/ID-token rejection.
3. Apply narrow runtime/migration/maintenance identities, private storage, connector/IAM DB auth, limits/timeouts, backup/PITR/deletion protection and authenticated maintenance every five minutes.
4. Load-test the exact candidate tier; verify connection-role limit and administrative headroom; record single-zone availability limitation.
5. Run restore validation before company data.

## Restore validation and rollout

```bash
make test-restore
```

This cloud-stage target creates an isolated restore candidate only when an explicitly configured test environment is present. It restores a known backup/PITR point and references immutable published objects; verifies permissions, comment versions, graph/child invariants, audits and inbox state; measures RPO<=5min and RTO<=4h; records recovery/cutover steps and removes drill resources. Repeat quarterly. The harness is prepared; no actual cloud recovery has run. These are measured release targets, not Google guarantees.

Migration/release order: backup/check restore readiness -> apply additive migration with separate migration identity -> deploy compatible backend/canary -> smoke test REST/MCP -> publish frontend. Keep previous backend image/Firebase version for rollback. Rollback applications first; do not run destructive schema down-migrations over company data. New incompatible contracts require an explicit version/window and migration plan.

## Checks possible today

Application checks above are runnable locally. Planning artifact syntax and managed-file integrity can also be checked:

```bash
python3 -m json.tool specs/001-gategoldjira-mvp/contracts/domain.schema.json > /dev/null
python3 -m json.tool specs/001-gategoldjira-mvp/contracts/operations.json > /dev/null
specify integration status --json
```

Artifact validation additionally checks local schema references, unique operation/tool/route identities, required retry/revision declarations, document links, all 63 FR coverage and all 14 SC coverage. It does not imply any application test or cloud benchmark has run.


## Board editing, rich text and files

Open a Kanban board and choose **Board settings → Columns and issue flow**. Add stage names and categories, rename or drag/reorder columns, choose allowed moves, then **Save board settings**. There is no fixed stage count. Names, order, stage warnings and allowed moves are shared across every board in the project. Saving a workflow reconciles earlier per-board rules. Creator/Administrator permissions and stale-revision review still apply. Use Remove stage and choose a replacement to move existing work and retire the old identity. Move issues in batches first if the stage contains more than100 issues. Keep at least one unstarted and one completed stage. Completed categories enforce blockers/subtasks. Each stage has an optional WIP warning; blank inherits the board category limit,0 disables warnings.

Descriptions and comments have **Visual editor**, **HTML source** and **Preview HTML** controls. Arabic direction, headings, lists, links and marks are supported. Paste or drop a PNG/JPEG/WebP file directly into either visual editor; the private upload runs and inserts the picture. Failed uploads preserve the selected file and retry. The new-issue form accepts pasted pictures and files before creation; failed uploads can be retried without creating another issue. **Attach files → Choose files** accepts multiple files of any kind, up to10MiB each and20per queue. Known documents retain format checks; other files are opaque downloads. Scripts/remote pictures are removed from rich HTML; saved pictures and attachments require current account/project access.

Migrations00005–00010 are additive. Deploy with the existing migration command before the compatible API/frontend. Preserve migrations/data on application rollback; do not narrow stage or MIME constraints over saved custom data. The local API is21080 and the web is4201. Credentials remain in the private ignored identity directory and are unchanged by this update.


## Daily issue workflow

- Click a board card to open its issue drawer, keep the board position, and use **Open full issue** when needed. Status, assignee, priority and due date can be edited directly; conflicts require reviewing current data. Drag/drop and keyboard moves use the same project rules.
- Use **More actions** to clone, archive/restore or move unstarted work into the backlog. The board's **Backlog** tab opens that planning list. A clone copies fields and text; files, comments, links and children remain on the original.
- **Watch issue** subscribes you to authorized issue changes. **Related issues** supports relates-to/duplicates; **Blocked by** still represents unfinished prerequisite work. Reader-accessible **Activity** shows retained issue changes without exposing private inbox/subscription history.
- Issue search supports exact custom stages, teammates, due/priority sorting and private saved searches. Select up to100 writable issues for bulk changes; each issue has an independent result, and conflicts remain selected. Use Archived issues in advanced filters to restore retained work.
- Draft descriptions/comments/board settings and selected files stay in memory across app navigation, with a leave warning. Sign-out or reloading clears these drafts. Issue creation keeps the saved issue ID during partial file failure so Retry continues the original creation.
- Pictures and PDFs have private previews; other files download. **Attach a file reference** inserts a document link into rich descriptions/comments. File access is checked again when opened, including from a saved comment.
- Foreground pages refresh approximately every30seconds while idle/online. Editing, uploads, bulk selection and pending requests pause refresh; expanded page windows are preserved.

After migrations, apply `infra/sql/runtime-grants.sql` using the schema owner for a restricted runtime role. The new issue organization and attachment tables need the explicit grants; history and business deletion remain denied. Keep populated tables/stage identities when rolling back application code. Production identity and Google Cloud qualification remain separate pending gates.

## Account onboarding and notifications

For the managed Google sign-in deployment, an Administrator opens **Company users → Approve a user**, enters the employee's exact verified Google email, and then opens the project **Members** page to grant Viewer or Member access. Company Administrators already have workspace-wide project access. Share the workspace URL with that person; they sign in with the same approved Google account. Ordinary account approval alone gives no project access, and the approval form does not send an invitation email. Disable the company account or remove its project membership to revoke access on the next authorized call. Historical comments retain their author.

Local development continues to use the existing four private test credentials. Approving another email does not mint a local password or turn it into a fixture account. The approved Google flow requires the configured Auth0 tenant and remains an external launch gate; see [identity configuration](../../identity/auth0/README.md).

The first managed Administrator is created through the operator-only [owner bootstrap command](../../backend/cmd/gategoldjira/bootstrap.go) after schema, grants and identity configuration are ready. Its [PostgreSQL regression](../../backend/cmd/gategoldjira/bootstrap_test.go) verifies that it cannot become a general registration route. Subsequent approvals use Company users; no public self-registration or automatic invitation email is provided.

Open **Inbox → Notification preferences** to select events and delivery channels. Defaults preserve all Inbox events, with email and due reminders off. Email settings are saved but show **Email delivery is not configured** until the backend has SMTP configured. Due-date reminders need both the reminder switch and the **Due date** event; they apply to unfinished work due today in the company time zone. Preferences use revisions and retry references, so a lost response can be retried without a second save. See [delivery settings and validation](validation/notification-delivery.md).

Development runs its notification worker on the server lifetime context with a default 60-second interval. Production reuses authenticated maintenance every five minutes, reserving 20 seconds for notification work within the 30-second request budget. Optional SMTP credentials remain backend-only and use pinned Secret Manager versions in Cloud Run. SMTP acceptance is at least once, and deployed relay latency still needs measurement. These runtime details are implemented and locally verified; real deployment and message delivery remain external configuration work.

Historical automatic blocker search follow-up: the same-key/reopening and rapid-edit suppression was fixed, the manual search button removed, and searching feedback added. Its nine affected browser journeys, strict types, 90 units and build passed. The complete 77-case audit run was the baseline at that stage; see [implementation evidence](validation/audit-implementation.md#follow-up-automatic-blocker-search).

In **Add a blocker**, type an issue number such as `2`, a full key such as
`DEMO-2`, or a title. Results appear as you type. A number matches exactly the
same-project issue with that number (`002` also matches 2); the current issue is
excluded. Full keys, project-key prefixes and titles remain searchable. The
same numeric rule applies to issue searches and board filters; see
[verification](validation/audit-implementation.md#follow-up-bare-issue-numbers).

Text searches now update as you type throughout the workspace: global and board
search, issue filters, blockers/related work/parents, teammates, mentions, labels
and company activity. Global suggestions support Arrow keys and Enter to open an
issue, or **View all results** for the full list. A global number can match that
number in several accessible projects; use the full key to identify one project.
History requires a complete issue key or a complete paired resource kind/UUID.

Click an issue's assignee, priority, due date or labels to open a floating editor.
Assignee and priority save as soon as you choose an option. Selecting or clearing
a date also saves immediately; when typing date segments, press Enter or leave
the field to save the completed date. These metadata fields have no ordinary
Save button. A failed write keeps the selection with **Retry save**; a conflict
requires **Review latest and keep my draft**, then **Apply reviewed change**.
Labels, titles and descriptions retain their explicit Save/Cancel actions.
Escape or an outside click closes an unchanged menu. Searchable form choices
also float above the form. Menus support Arabic
direction and remain bounded on phones. The board and search input stay in place
while filtering. See [the latest metadata verification](validation/audit-implementation.md#follow-up-immediate-metadata-saving) and [live-search evidence](validation/audit-implementation.md#follow-up-live-searches-and-popup-fields).

## Daily editing and board controls follow-up

Epic and Release now save when you select or clear a value in issue details, including the board drawer. Both choices lock during saving. Failed planning stays in an in-memory draft with **Retry save** and **Cancel**; the app asks before leaving it, and reopening restores the selection. If another person changes planning first, use **Review latest planning**, then **Apply reviewed change**. Review preserves the other person's latest value for the field you did not change. Reload or sign-out clears local drafts.

On a board, open **Filters → Assignment filter → Specific teammate** to search any eligible project teammate. Use **My quick filters → Save or manage filters** to save the current filters under a personal name. These filters are reusable on boards in the same project; they remain personal. Click an active filter again to clear its temporary selection. Escape or **Close quick filter manager** closes the manager and returns keyboard focus.

Use **Group by → Assignee / Epic** to show swimlanes. Grouping partitions the cards already loaded, with at most 100 loaded cards per column across all lanes. Use the column's **Load more** to extend that window. WIP warnings and status totals continue to count the full saved board view. Dragging changes status and shared order; it does not change an issue's assignee or epic. Move within its group, or edit assignment/planning in issue details first. Keyboard move controls remain available.

Click the body of your own comment to edit it, including inside a board drawer. Links and attachment previews keep their normal actions. Description and comment toolbars now provide code blocks, tables and checklists, including row/column controls. You can change checklist completion while editing; saved content/history display its recorded state. Arabic, HTML source, private pictures, documents and retained versions remain supported.

Final app/test typing, 98 frontend units, the full real-PostgreSQL Go race suite, vet, generated drift, architecture and the 568.55 kB/140.29 kB production build pass. The preserved local API/web and existing Owner workspace smoke pass without a migration, reseed or credential change. Focused planning, rich-text and corrected mobile swimlane checks pass; the final complete browser run is in progress. See [current behavior and verification status](validation/daily-editing-board-controls.md) for the final validation fields.
