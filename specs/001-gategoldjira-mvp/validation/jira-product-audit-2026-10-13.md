# GateGoldJira product and functional audit — 2026-10-13

GateGoldJira has a working local Kanban foundation. Its main weakness is now the effort required to perform everyday work: planning the backlog, finding people and issues, editing a workflow, and reaching the discussion. It is not yet qualified for production company use: real identity, deployment, recovery, representative-user usability and cloud performance still need evidence.

This audit exercised the application and reviewed its implementation against a practical Jira-style workflow. Automated success means the tested behavior worked; it does not mean every possible combination, browser, device or enterprise feature was tested.

## Scope and evidence

- Current application source, Angular browser UI, Go service, PostgreSQL, private local file storage and REST/MCP behavior.
- Repository-owned Playwright runner with disposable accounts, databases and files. The screenshots show the real application with audit fixtures, not changes to the user's company data.
- Desktop at 1440 × 1000 and mobile viewport at 390 × 844. Additional existing scenarios exercise tablet layouts, keyboard interaction and error states.
- Current-run screenshots are preserved in `.local/browser-evidence/jira-audit-2026-10-13/`. This directory is local evidence, excluded from Git. The numbered walkthrough below embeds the accepted screenshots.
- Direct control of the user's browser was unavailable after automatic approval review rejected it; the established isolated runner provided the alternative. No attempt was made to bypass that restriction.
- The earlier reported blocker-search bug was fixed as already requested. Newly discovered audit findings below remain open for implementation.

## Confirmed defects and operational findings

| ID | Priority / state | Evidence and impact | Completion criterion |
| --- | --- | --- | --- |
| AUDIT-01 | High — fixed locally | Searching `de` could not find an issue such as `DEMO-2` unless its title happened to contain that text. The issue and board SQL supported an exact issue key or a title substring only. | Project-key prefixes now work case-insensitively across issue search, board filters and REST/MCP; complete keys remain exact. Tests cover pagination, Arabic, literal `%`/`_`, and project permissions. |
| AUDIT-02 | High — open | Creating an issue from the Backlog view sends the normal create request without retaining backlog context. The saved issue is active, so planned work enters the board instead. Reproduced in a disposable project, screen 17. | Create from Backlog persists backlog membership, appears in Backlog, and stays off the active board. Cover upload retries and uncertain-response retries without duplicate issues. |
| AUDIT-03 | Medium — open | Related-issue search returns the first 25 matches and discards `nextCursor`. With 27 matches, the remaining two cannot be reached through that broad result list. A narrower search is a workaround. Reproduced in screen 18. | All pages are reachable with a clear more-results control or accessible autocomplete; changing the query resets pagination and excludes the current issue. |
| AUDIT-04 | Low — open | Projects shows the supposed hidden label “Search loaded projects” beside/over the search icon, breaking alignment. Screen 03. The `visually-hidden` helper is not defined for that component. | Use the established accessible hiding utility or a deliberately visible aligned label; verify the input still has an accessible name. |
| OPS-01 | Medium — restored; cause unproven | The local API was stopped while the web server remained available. That state makes the UI appear broken even though it loads. The tested API binary was rebuilt and restarted with existing configuration; both local web and API health checks returned HTTP 200 afterward. | Provide a reliable combined development start/health workflow and retained logs. Determine the stop cause before claiming it resolved permanently. |

Relevant implementation:

- [Issue search predicates](/home/mr-h/Documents/basher/New/GateGoldJira/backend/internal/features/issues/queries.sql:55) and [board predicates](/home/mr-h/Documents/basher/New/GateGoldJira/backend/internal/features/boards/queries.sql:36).
- [Backlog creation context](/home/mr-h/Documents/basher/New/GateGoldJira/frontend/src/app/features/issues/pages/issue-list/issue-list.page.ts:212).
- [Related search discards the cursor](/home/mr-h/Documents/basher/New/GateGoldJira/frontend/src/app/features/issues/components/issue-actions/issue-actions.component.ts:48).
- [Project search label](/home/mr-h/Documents/basher/New/GateGoldJira/frontend/src/app/features/projects/pages/project-list/project-list.page.ts:27).
- [Reproduced open defects](/home/mr-h/Documents/basher/New/GateGoldJira/frontend/e2e/jira-audit-findings.spec.ts). These two cases deliberately use Playwright `test.fail`; the runner's “passed” summary means the expected failure occurred, not that the product behavior works. Remove the expected-failure annotations when implementing the fixes.

### Fixed blocker search

The fresh regression opens a subtask, searches `de`, selects another assigned issue, adds the blocker, and verifies that the remove-blocker action appears. Self-links remain excluded. The local API now runs this fix. No schema migration, reseeding or credential replacement was performed.

![A partial project key now returns blocker candidates](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/blocker-prefix-search.png)

## Recommended implementation order

### 1. Make everyday work reliable and quick

Fix AUDIT-02 and AUDIT-03 first, then the small Projects layout defect. Consolidate assignee, label, blocker and related-issue selection around a searchable picker with keyboard navigation, paging, loading, no-results and error states. It must retain project permissions, Arabic text and stale-response protection. Screens 06 and 18 show the current extra search-and-select steps.

Replace the long default create form with title, type and a compact description, showing optional fields on demand. Keep Create and Cancel visible while scrolling, and preserve the chosen project/stage/backlog context. The current form's submit action is below the captured 1000px viewport (screen 06).

Move discussion closer to the description. Collapse empty attachments, subtasks and dependency sections; retain clear Add actions and counts. Group related work coherently so “Related issues”, “Subtasks”, “Blocked by” and “Blocks” do not feel like four unrelated tools. Keep the unified attachment queue and private preview/download behavior already implemented. Screens 07–08 show how much empty structure precedes a comment.

For mobile, put the description and discussion before secondary timestamps and metadata, with a compact Details disclosure. Preserve the stage jump control and keyboard alternative to dragging. Screen 16 shows the entire first viewport consumed before the description begins.

### 2. Give Kanban a real planning and measurement workflow

Backlog currently exists as an issue flag and an advanced list filter. Build a clearly titled Backlog view with ordering, selection and an explicit move-to-board action; show which work is planned versus active. Jira's Kanban backlog supports arranging future work and moving it into selected development, which is the relevant comparison for this product. [Atlassian: Kanban backlog](https://support.atlassian.com/jira-software-cloud/docs/use-your-kanban-backlog/).

Add lightweight larger-work grouping and milestones/releases when the team needs to coordinate several issues. An epic groups a larger body of work; a version groups delivery into a release. Neither is implemented in the current product. Keep the first implementation small: an optional group, target date and progress. [Atlassian: epics](https://support.atlassian.com/jira-software-cloud/docs/what-is-an-epic/), [Atlassian: versions](https://support.atlassian.com/jira-software-cloud/docs/what-is-a-version/).

Add a Kanban report covering throughput, cycle time, aging work and blocked work. Derive durations from transition/history events, not the last-updated timestamp. Clearly define start/completion categories and handling of reopened work. Jira provides control-chart and cumulative-flow reporting; these are more useful to this Kanban MVP than immediately adding Scrum ceremonies. [Atlassian: reports](https://support.atlassian.com/jira-software-cloud/docs/generate-a-report/).

### 3. Make workflow changes understandable

Custom stages, ordering, allowed moves, retirement/remapping and WIP warnings already work. The editor's limitation is usability: four stages already produce a long page, and each additional stage expands the set of transition checkboxes. Screen 09 shows two separate save areas and both category-level and stage-level WIP controls.

Use a compact stage list with a focused editor for the selected stage and its allowed destinations. Show one clear pending-changes summary and explain that these changes affect every board in the project. Verify the design with ten or more stages, long Arabic names, retirement of a populated stage, keyboard reordering and unsaved-change navigation. Keep the server's graph validation and revision checks.

### 4. Help a team adopt and trust the product

| Gap | Small useful next step | Acceptance evidence |
| --- | --- | --- |
| Notifications only inside the app | Notification preferences plus email/digest or due-date reminders, according to team needs | Correct recipients, no leakage after membership revocation, deduplication, retry and opt-out tests. Existing mentions, assignments, watchers and unread state remain. Jira's notification schemes illustrate event/recipient email behavior. [Atlassian](https://support.atlassian.com/jira-cloud-administration/docs/configure-notification-schemes/). |
| No migration workflow | CSV import preview and filtered export | Field mapping, row errors, duplicate handling, permission scope and formula-safe export. This reduces the cost of moving existing work. [Atlassian: import/export](https://support.atlassian.com/jira-cloud-administration/docs/import-and-export-your-data-to-and-from-jira-cloud/). |
| Activity feed is technical | Human-readable issue keys, names, summaries and filters | A team lead can identify who changed which issue without interpreting UUIDs or API operation names; technical details remain available on demand. Screen 14. |
| Production onboarding unqualified | Real identity setup, invitation/approval and first-login journey | A fresh employee can sign in and see only their projects; revoked employees lose web, MCP and file access. Local fixture authentication is not evidence for the external provider. |
| No development integration/automation UI | Start with linked pull requests and one genuinely useful rule | Explicit permissions, actor attribution and retry behavior; select based on actual team workflow rather than copying every Jira feature. |

### 5. Keep optional complexity optional

The current issue types, priorities and roles are intentionally limited. Custom fields, granular permission schemes, cross-project dependencies, shared filters, time tracking and comment reactions may be useful later, but they are not prerequisites for a simple company Kanban tool. Same-project links are an MVP constraint, not a failed implementation.

Sprints, story points, velocity and burndown should wait unless the team chooses Scrum. Existing saved searches, bulk updates, clone, archive, watchers and related links are present; they should not be listed as missing. HTML clone fidelity is a possible improvement: the current clone deliberately converts a rich description to plain text.

## Numbered product walkthrough

“Working” means the local tested flow worked. “Needs refinement” describes observable friction, not a claim that its underlying operation failed.

### 01. Sign in — working locally; production identity unverified

Clear username/password form and local-environment disclosure. Authentication, invalid credentials and role boundaries are covered by local tests. A real company account/provider journey remains outside this environment; in-memory local sessions end on reload as currently designed.

![01 Sign in](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/01-sign-in.png)

### 02. Workspace — working; limited planning overview

Navigation and personal work entry points are available. The overview does not yet provide delivery trends or a complete team planning view. Assess those against the reporting recommendation rather than adding more decorative dashboard cards.

![02 Workspace](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/02-workspace.png)

### 03. Projects — working; visible layout defect

Project create/edit/archive and membership-aware access work. The search label/icon alignment is broken (AUDIT-04). The search says it searches loaded projects, which should remain explicit until a complete server search is provided.

![03 Projects](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/03-projects.png)

### 04. Project overview — working

Project navigation and board entry points are understandable. Larger-work grouping, release targets and delivery reports are absent; add them only as real planning surfaces.

![04 Project overview](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/04-project-overview.png)

### 05. Kanban board — working

Cards expose status, assignee, priority, labels, due dates and blocked/subtask state. Drag-and-drop, same-column ordering, allowed transitions, WIP warnings and permission restrictions pass local scenarios. Metadata can become dense; avoid adding more badges by default.

![05 Board](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/05-board.png)

### 06. Create issue — working; too much visible form

Rich descriptions and optional fields work. A separate assignee search followed by a dropdown, plus a separate labels search, requires unnecessary steps. The submit action is below the viewport. Use compact defaults and a persistent action footer.

![06 Create issue](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/06-create-issue.png)

### 07. Issue detail — working; information order needs refinement

The drawer keeps board context and supports direct field editing and status selection. Metadata is editable, and retry/conflict tests cover retained drafts. Long secondary sections obscure the main task and discussion.

![07 Issue detail](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/07-issue-drawer.png)

### 08. Collaboration — working; empty sections add friction

Arabic/English rich text, pasted pictures, file uploads, private previews, comment edits and mentions work in the browser suite. Add comment focuses the composer correctly. Empty related-work sections occupy significant vertical space above the composer; collapse them. The comment picture and upload-size limits are documented constraints, not test failures.

![08 Collaboration](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/08-collaboration.png)

### 09. Workflow editor — working; scales poorly as a form

Custom stages are supported. The long list of per-stage transition checkboxes and two save areas make the edit harder to understand. The screenshot was captured as the owner; an earlier capture attempt as a member correctly could not edit the owner's board.

![09 Workflow editor](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/09-workflow.png)

### 10. Backlog — partial; one confirmed creation defect

A populated backlog is shown, but its page still says “Issues” and hides backlog state in advanced filters. It lacks a dedicated planning/ranking interaction. AUDIT-02 additionally loses backlog context during creation.

![10 Backlog](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/10-backlog.png)

### 11. Inbox — working; in-app delivery only

Assignment/mention notifications, issue navigation and read state work. The captured inbox is populated. Filtering still uses an Apply action; external delivery, reminder scheduling and preferences are not implemented.

![11 Inbox](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/11-notifications.png)

### 12. Company users — working locally; onboarding not qualified

Administrative account approval and restrictions are covered locally. Do not equate fixture-password access with a tested invitation or production first-login journey.

![12 Company users](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/12-user-administration.png)

### 13. Project access — working

Administrator/member/viewer roles and membership revocation are enforced in local scenarios. The permission model is deliberately coarse; a Jira-style granular scheme is a possible later requirement, not an observed defect.

![13 Project access](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/13-project-access.png)

### 14. Activity — working; too technical for routine review

Audit events exist, including actor/operation context. Raw IDs and operation names make the feed harder for a team lead to scan. Prefer linked issue keys and plain-language changes, retaining technical fields in a disclosure.

![14 Activity](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/14-activity.png)

### 15. Mobile board — working in the tested viewport

No page-level horizontal overflow was measured. The stage jump control helps navigate the horizontally arranged columns. Card metadata and some controls are small; real touch-device checks remain necessary.

![15 Mobile board](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/15-mobile-board.png)

### 16. Mobile issue — working; content priority needs refinement

The drawer fits the viewport and offers status/edit/comment actions. The Details card occupies most of the first screen, pushing the description below it. Collapse secondary metadata and place the work itself earlier.

![16 Mobile issue](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/16-mobile-issue.png)

### 17. Create from Backlog — reproduced failure

The screenshot records the resulting issue; the API assertion provides the decisive evidence that `summary.backlog` is not true. Screenshot appearance alone cannot prove membership in the backlog. See AUDIT-02 and the expected-failure test.

![17 Backlog creation loses context](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/17-backlog-create-context.png)

### 18. Broad related-issue lookup — reproduced pagination failure

The result list has 25 Link issue actions after creating 27 matches. DOM inspection and the test establish that no next-page control is available; the viewport image shows only part of this long list. See AUDIT-03.

![18 Related issue lookup](/home/mr-h/Documents/basher/New/GateGoldJira/.local/browser-evidence/jira-audit-2026-10-13/18-related-search-pagination.png)

## Verification results

| Check | Outcome and scope |
| --- | --- |
| Browser suite with local performance enabled | 63 distinct scenarios passed across the full run and corrected walkthrough rerun. The initial full run was 62 passed / 1 failed: the screenshot fixture used a member for owner-only settings. Correcting that fixture passed; this was not a product permission defect. |
| Additional exploratory defect tests | Two known expected failures reproduced: Backlog create context and related-search pagination. These are explicitly excluded from the working-scenario total. |
| Frontend unit tests | 86 passed across 14 files. |
| Static checks | Angular and browser-test type checks, generated-artifact drift check, architecture check and `git diff --check` passed. |
| Production frontend build | Passed, with an existing size warning: initial bundle 868.09 kB raw / 188.81 kB estimated transfer against the 600 kB raw warning budget. The budget was not raised. |
| Go tests | Full `go test -race -count=1 ./...` with required PostgreSQL tests passed; `go vet ./...` passed. Coverage includes the 60-operation REST/MCP catalog/parity checks and the new prefix-search regression. |
| Local timing | 100 warm trials each: project p95 129.60 ms, board p95 601.86 ms. These are development-server/small-fixture results, not cloud service-level acceptance. |
| Local service check | Web `127.0.0.1:4201/` and API `127.0.0.1:21080/readyz` returned HTTP 200 after the API restart. |

Browser scenarios cover authentication and role boundaries; project creation/edit/archive; issue creation and inline edits; failed/uncertain writes and revision conflicts; labels/dates; board ordering, custom stages and WIP; dependency cycles and completion guards; subtasks; HTML sanitization and Arabic; pasted images, private files, previews, download/retry/detach; mentions and inbox; MCP changes visible in the web app; keyboard/viewport behavior; bulk actions, backlog, archive, clone, watchers, links and saved searches.

Run evidence:

- Initial prefix failure: `.local/browser-tests/a5f27214d69748ed96a92c33ab1cb8d6/`.
- Full browser run: `.local/browser-tests/ca52115db5d44a2a9b53ea9e7c098873/`.
- Corrected owner walkthrough: `.local/browser-tests/f1e1a7b15aaa4829a03a2bb1fcecfd5a/`.
- Final populated walkthrough: `.local/browser-tests/f6e01ac0b59945a1a088e88580b84f06/`.
- Reproduced open defects: `.local/browser-tests/9e7b7aaac1374b50b9cf7e9385916bd6/`.
- Final prefix regression: `.local/browser-tests/1c352d153d194a9684fb94a3ac9ab7cf/`.
- Go suite output: `.local/jira-audit-go-tests.log`.
- New tests: `frontend/e2e/jira-audit.spec.ts`, `frontend/e2e/audit-walkthrough.spec.ts`, `frontend/e2e/jira-audit-findings.spec.ts`, `backend/tests/parity/search_prefix_test.go`.

Use `source scripts/tool-env.sh` before local tool commands. The disposable runner is `RUN_BROWSER_PERFORMANCE=1 bash scripts/run-browser-tests.sh`. Its focused Playwright arguments can reproduce the audit cases without modifying the company database.

## Evidence limits and release gates

- No exhaustive browser/device matrix, screen-reader audit or WCAG certification. Screenshots show small helper text and compact controls, but automated counts include inline links and underlying content; they are not violation counts. Test contrast, target spacing, keyboard navigation, screen readers and Arabic bidirectional selection explicitly before release.
- The usability test prepares ten fixture accounts. It does not represent ten real employees completing tasks. Task T137 remains open.
- REST/MCP parity and protocol tests are not the twenty real assistant-client workflows required by T135. A real provider/OAuth client remains necessary.
- No actual Auth0 tenant journey, Google Cloud deployment, regional performance, scale/overload acceptance, billing-credit verification or cloud backup/PITR drill was completed. The opt-in scale and cloud recovery test paths were not run. Local backup tests cannot substitute for these.
- Existing external tasks T135, T137, T139 and T143–T147 remain open. No production publication or infrastructure provisioning occurred.
- Screenshots establish visible layout and state; assertions and source inspection establish the two workflow defects. Neither alone proves complete usability, security or production readiness.

The next implementation should fix the two workflow defects and streamline creating, finding and discussing work. Then add a proper ranked backlog and basic Kanban reporting, while qualifying identity, hosting and recovery before company rollout.
