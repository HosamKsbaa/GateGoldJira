# Issue editing and unified attachments — 2026-10-13

The user requested direct editing and actual attachment unification after a screenshot showed
separate upload, Pictures and Files sections. The Product Design audit workflow was applied to
the supplied screenshot and fresh isolated-app browser evidence. Implementation uses the
existing Angular/Go/PostgreSQL app and its feature-first structure.

## Findings and implementation

| Observed problem | Implemented behavior |
| --- | --- |
| Displayed issue values could not be edited where they appeared. | Title, description, assignee, priority, due date and labels open inline editors; explicit Save/Cancel, keyboard controls and Viewer restrictions. |
| Quick edit and full edit duplicated controls away from the values. | Removed the quick-edit disclosure; retained the full form for several fields at once. |
| Comment editing happened away from its original record. | Click your own comment text or Edit comment to edit it in place. Link/image actions do not trigger editing. |
| Uploader, picture gallery and document list had different controls. | One attachment section, count, mixed grid, file queue, refresh control and preview/download/remove pattern. Removed the unused split component implementations. |
| Both rich editors had separate picture and document upload controls. | Both use the same file queue, with clipboard images and private file links retained. Description file uploads advance their own revision sequentially. |
| Closed picture dialogs could remain visible. | Scoped the global image-preview rule to images; native closed dialogs remain hidden. |
| Hidden native file inputs and narrow label editors created horizontal overflow. | Bounded hidden controls; wrapped label actions; expanded the active metadata row. Measured page and drawer widths equal 390px on mobile. |
| The screenshot's fixture picture was missing locally. | Restored only the missing 92-byte canonical demo object, with exact stored SHA-256 and generation; no database edits or user-upload replacement. |

Inline saves preserve their original revision and draft text after failed responses. Explicit
conflict review rebases only the edited field, preserving teammates' changes. Requests reuse
idempotency references when retrying the same intent. Polling pauses while an editor is open.

Newly posted comment pictures join the shared attachment grid in the same transaction. Unsent
pictures remain private drafts. Explicit detach removes the grid item while preserving authorized
historical downloads, and later comment edits/replays do not reattach it. Existing historical
pictures are not bulk reattached. No migration or new dependency was introduced.

## Screenshot evidence

Screenshots are produced by the repository-owned isolated browser runner using disposable
PostgreSQL records, separate local identities and private storage. They represent the real app,
not the user's live company data. The supplied screenshot and the current-turn baseline are
comparison evidence; no blocked live browser control was retried.

Evidence directory: `.local/browser-evidence/issue-refactor/`.

- `before.png`: original separate picture/document areas.
- `inline-desktop.png`: editable values, rich description, metadata and discussion.
- `inline-mobile.png`: 390px layout with the label editor open.
- `drawer-desktop.png`: mixed attachments in the issue drawer.
- `drawer-mobile.png`: full-width phone drawer and accessible metadata.

Initial focused checks: 17 existing browser regressions passed. Four new browser flows passed
following fixes to mobile overflow. The new tests cover direct editing, Save/Cancel, Arabic,
Viewer access, uncertain saves, explicit conflicts, draft restoration, file chooser/drag/drop,
picture preview retry, file downloads, removal and mobile bounds.

Final verification and local service status are recorded below when the full run completes.

## Limits

The UI is Jira-inspired and retains GateGoldJira branding. Pictures and PDFs have built-in
previews; other files download for their native app. Files remain limited to 10 MiB each and
20 per queue. Drafts stay in memory and clear on sign-out/reload. This is not a full Jira feature
parity or WCAG certification claim. Cloud hosting/identity and the pre-existing external
qualification gates remain outside this local refactor.

## Final verification

- Full browser suite, including performance: **57 passed, zero skipped**, 3.6 minutes.
  Run: `.local/browser-tests/fd5a4d6257dd4a5c8a95d63a2fd6d6cd/`.
- New inline editing/attachment tests cover multiple description document uploads without
  self-conflicts, retained Arabic edits, author-only comment edits, native file chooser,
  mixed-file drop, image-preview retry, private download fallback and 390px page/drawer bounds.
- Strict Angular and test type checks passed. Frontend unit tests: **86 passed / 14 files**.
- Production build passed. Initial bundle: **867.21 kB raw / 188.43 kB estimated transfer**.
  The existing 600 kB warning remains; budgets were not increased.
- Generated-artifact drift check passed after sqlc regeneration; API contracts did not change.
- PostgreSQL race checks passed for REST/MCP parity and picture/comment packages. The final
  publication/revision/retained-reference parity scenario passed again with `-race -count=1`;
  both affected packages passed again after the final revision-advance adjustment. Affected
  backend vet checks and the development binary build passed.
- Local 100-trial browser measurements: project p95 **130.79 ms**, board p95 **572.01 ms**.
  These are small-fixture local measurements, not Google Cloud acceptance results.
- Opened and visually reviewed desktop/mobile screenshots. Fixed and rechecked the closed
  dialog visibility and hidden-input/label-editor overflow found during this run. Final
  full-page evidence includes rich descriptions, document links and shared attachment cards.
- `git diff --check` passed. No new dependencies, schema migration or production deployment.

## Local app status

The existing web app at `http://localhost:4201/` and API `/readyz` at `127.0.0.1:21080`
return HTTP 200. The API is running the tested binary with its existing local configuration.
The previous binary is retained at `.local/gategoldjira-development.before-issue-refactor`.
No reseeding, credential replacement or database reset was performed. The missing canonical
fixture was restored only after its original 92-byte content, SHA-256 and generation matched.

## Status dropdown follow-up — 2026-10-13

The user clarified that the missing dropdown was the issue status / board stage control.
Replaced the native status select with an Angular-rendered menu and a visible chevron.
One click renders every configured stage inside the issue page or board drawer. The current
stage is marked, forbidden workflow transitions are disabled with an explanation, and
keyboard arrows/Home/End, Enter, Escape, Tab and outside clicks are supported. Escape closes
only the menu. Status changes retain the existing version/idempotency checks and display
only the confirmed server status; failed moves preserve the saved value. Viewer access stays
read-only. No backend or contract changes were needed.

Assignee and priority also show visible choices on their first click with a persistent
chevron, retaining their explicit Save/Cancel and draft/conflict behavior.

Validation:
- Strict Angular and test typing passed; all 86 unit tests passed.
- Production build passed with the existing 600 kB initial-bundle warning (867.25 kB raw).
- 16 focused browser scenarios passed across custom workflows, daily work, inline editing,
  attachment regressions, subtasks and the new dropdown behaviors. The initial run passed
  15; one new custom-stage fixture incorrectly used a member to edit an owner-created board
  and was correctly rejected with 403. Corrected that fixture to use its owner; the remaining
  scenario passed on its targeted rerun. Application authorization was not changed.
- Runs: `.local/browser-tests/3e49fee833dd4d5dba880dd6a9345649/` and
  `.local/browser-tests/ee90d107296542099c5745003a15d13a/`.
- Inspected `status-dropdown-desktop.png` and `status-dropdown-mobile.png` in the evidence
  directory above. Choices render within the drawer at 1440px and 390px; no horizontal
  overflow. Tests verify actual clicks and visible DOM options rather than native
  `selectOption()` calls, custom Arabic stages, restricted moves, failed-save retry,
  persisted status, board refresh on drawer close, keyboard focus and Viewer restrictions.

## Collaboration section redesign — 2026-10-13

The next supplied screenshot identified the comment composer, subtasks and dependencies as
visually cluttered. This follow-up redesign stays within the existing Angular features:

- One bordered rich-text surface with a compact icon toolbar, placeholder, paperclip file
  chooser, mention/link controls and HTML mode. Text direction stays available for Arabic.
  Counters and the primary Post comment action sit in a compact footer. The shared file queue
  appears when needed; pasted pictures and failed uploads retain their existing retry flow.
- Subtasks use a progress bar and consistent linked-issue rows with title/key, readable stage
  name, assignee and a small overdue indicator. Add subtask is beside the heading; refresh is
  an accessible icon action. Custom completed stages use their category for the parent hint.
- Dependencies reuse the same typed linked-issue row. Blocked By and Blocks have compact
  groups; Add blocker opens a focused search/selection panel with explicit cancellation.
  Existing cycle checks, stale graph review, retained links and completion rules are unchanged.
- Subtasks and dependencies precede Activity. The comment composer precedes existing comments.
  Own-comment editing, history, read-only access and draft retention remain available.
- Document uploads now insert after selected draft text, preserving that text. A confirmed
  comment save clears completed upload rows from the next composer; failed/pending queues
  remain available. No new dependencies, backend changes or migrations.

Visually reviewed screenshots from the disposable browser environment:
`collaboration-desktop.png`, `comment-editor-mobile.png`, `subtasks-mobile.png` and
`dependencies-mobile.png` in `.local/browser-evidence/issue-refactor/`. Desktop shows all
three sections together; mobile checks cover a 390px drawer with no horizontal overflow.

The first focused browser run passed 21 of 23 scenarios. One test needed to accept the new
native file chooser before querying its upload form. The new selected-text upload check also
exercised the document insertion behavior, which was corrected to preserve the selection's
text. Final results are recorded after the affected rerun below.

Final collaboration validation:
- All **23 distinct focused browser scenarios** passed across the runs: the 18 affected
  editor/upload/layout scenarios passed together on rerun (56.6 seconds), plus the five
  dependency/subtask/notification scenarios already passed in the initial run.
- Initial run: `.local/browser-tests/595c71b3296a48cfbe74a32626fb5f2e/`.
  Final affected rerun: `.local/browser-tests/3c983e4b2e624a04a393403dff9c49a1/`.
- Strict Angular and test type checks passed. Unit tests: **86 passed / 14 files**.
- Production build passed: **868.09 kB initial / 188.78 kB estimated transfer**; the existing
  600 kB warning remains. `git diff --check` passed.
- Final local health check found the previous API process stopped. Restarted the existing
  `.local/gategoldjira-development` binary with `backend/.env.local`; web port 4201 and API
  readiness on 21080 now return HTTP 200. No reseeding or credential changes.

## Description editor consistency — 2026-10-13

Continued the UI refactor by bringing description editing into the same compact rich-text
surface as comments. Both use `shared/ui/rich-text-editor.css`; descriptions now have the
icon toolbar, HTML source control, inline link panel, paperclip chooser and Arabic direction
control. No packages or backend changes were required.

- Existing descriptions use the same mounted file queue for picked and pasted files.
  Pending uploads disable HTML mode, avoiding a mode switch that would disable the queue
  while still requiring it to finish. Saving and conflict checks remain intact.
- Adding a document reference preserves selected description text. Confirmed description
  saves dismiss completed upload rows; reopening does not display the previous queue.
- New issues use the description paperclip instead of a second visible file input. A compact
  list shows filenames, upload status and removal controls. Creation still retains drafts
  and retries partial uploads without creating another issue.
- Local sign-in remains memory-only. Reloading requires sign-in again; returning to the
  requested board is exercised by the browser scenarios.

Validation:
- All **24 browser scenarios passed** in
  `.local/browser-tests/cdda6c63608d4d6798a16a16025d14f4/` (1.1 minutes): local access,
  rich editors, pasted pictures, arbitrary files, workflow editing, daily work, inline
  editing, collaboration layout and board/drawer UI.
- Visually reviewed `description-desktop.png` and `description-mobile.png` in
  `.local/browser-evidence/issue-refactor/`; the 390px layout has no horizontal overflow.
  Tests exercise the actual native file chooser, selected Arabic text preservation,
  disabled HTML mode while files are queued and completed queue cleanup after saving.
- Angular and test type checks passed; **86 unit tests passed / 14 files**.
- Production build passed: **868.09 kB initial / 188.81 kB estimated transfer**. The existing
  600 kB initial-bundle warning remains.
- Live web port 4201 and API readiness on 21080 both returned HTTP 200 after validation.
