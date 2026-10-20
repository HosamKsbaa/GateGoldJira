# Daily editing and board controls

Updated 2026-10-13. This follow-up implements comment editing in issue drawers, automatic Epic/Release saving, project teammate search, personal quick filters, assignee/epic swimlanes and richer descriptions/comments. Angular and Go remain separate, strictly typed applications. REST and MCP use the existing authorized services and generated contracts. No migration, database reseed, credential replacement or cloud deployment is part of this follow-up.

## Implemented behavior

### Comments and rich text

Clicking the text of your own editable comment opens its editor on both an issue page and a board drawer. Links, picture controls, attachment previews and other interactive controls retain their own actions; a surrounding issue dialog no longer suppresses ordinary comment text clicks. Existing author permissions and immutable comment history still apply.

Descriptions and comments support code blocks, tables and checklists through the visual toolbar and HTML source. The typed renderer displays the same structures in saved content, previews and retained comment versions. Checklist completion is editable in the editor; saved content and history display the stored completion state without becoming a separate mutation surface. Table controls insert/remove tables and add/delete rows or columns. Nested checklist content retains surrounding text and table structure when an in-memory draft is restored.

Both Go sanitizers accept the semantic structures and bounded table cell spans from 1 through 20. Stored checklist HTML carries `data-type` and Boolean `data-checked` state; executable inputs, buttons, event handlers, arbitrary styles and remote pictures remain excluded. Existing Arabic direction, mentions, links and private picture/document references retain their permission checks. Rich editor extensions stay in lazy chunks; the new table/list dependencies match the existing Tiptap 3.31.4 version.

### Epic and Release selections

Selecting or clearing either field saves immediately. An unchanged value does not issue another write. Both choices lock while a write is pending, and the command includes the confirmed value of the other field. A successful write updates the confirmed planning revision and shows **Planning updated**.

A failed or uncertain write retains its exact request body, selected names and retry reference in the existing in-memory draft service. Navigation and drawer closure ask before leaving pending planning. Returning to the issue restores the selection and original retry intent. **Retry save** repeats that intent; **Cancel** discards it and reads the current confirmed assignment, including a write accepted before its response was lost. Drafts clear on reload or sign-out with the existing session policy.

A stale revision requires **Review latest planning**, followed by explicit **Apply reviewed change**. Review fetches current planning, rebases only the field the user changed and retains the other person's newest value. Apply uses a new retry reference for that reviewed intent. Generation, issue and session guards prevent a late response for another issue or earlier session from replacing the visible selection or unlocking its controls. Viewers retain read-only planning access.

### Board lookup, filters and grouping

In **Filters → Assignment filter → Specific teammate**, the picker searches eligible teammates in the current project as the user types. It follows authorized page cursors and suppresses responses for old search terms, projects or sessions. It is not restricted to people present on the currently loaded cards. The duplicate permanent toolbar picker was removed after the compact-board regression detected an extra tall row.

**My quick filters** save named personal filters through the existing saved-search service. They are reusable across boards in the same project and narrow the board's saved view. They do not create shared team filters or change issues. Save/removal retains retry intent while the manager remains open; conflicts can be reviewed before explicit apply. Escape and the close action return focus to the manager's summary.

**Group by → Assignee / Epic** partitions the existing loaded column windows into horizontal swimlanes, including Unassigned and No epic. Grouping does not request a complete board or duplicate card windows for each lane: the existing maximum of 100 loaded cards per column is shared across all lanes. **Load more** expands that shared column window. Lane counts describe loaded cards; status totals and WIP warnings continue to describe the full authorized saved board view, including cards hidden by temporary filters.

Drag and keyboard moves retain the shared project status/rank model. Grouping never introduces an independent per-lane order. A move to a different assignee/epic lane is rejected instead of silently changing assignment or planning. Users change those fields explicitly in issue details. Existing prerequisite guards, allowed transitions, keyboard alternatives and soft WIP warnings remain authoritative.

The additive optional `CardPage.epics` field contains epic metadata only for the cards returned by that authorized page. One bounded same-project batch read supplies it; there is no planning request or database query per card. The generated REST/MCP contract and frontend SDK include this metadata without adding a mutation operation.

## Confirmed engineering checks

| Check | Confirmed result | Evidence |
| --- | --- | --- |
| Full real-PostgreSQL Go race suite and vet | Pass: `go test -race -count=1 ./...` and `go vet ./...`; REST/MCP parity package 334.826 seconds | `.local/jira-ux-upgrades-go-final.log` |
| Generated contract drift | Pass for OpenAPI, sqlc and typed frontend SDK/validators | `.local/jira-ux-upgrades-generated-final.log` |
| Feature/platform architecture | Pass | `.local/jira-ux-upgrades-architecture-final.log` |
| Strict app/template and test typing | Pass | `.local/jira-ux-upgrades-checks-accepted.log` |
| Frontend units | 98 tests across 17 files pass | `.local/jira-ux-upgrades-checks-accepted.log` |
| Production frontend build | Final post-mobile-correction build passes, initial raw 568.55 kB / estimated transfer 140.29 kB; no warnings, unchanged 600 kB warning / 1 MB error budgets | `.local/jira-ux-upgrades-checks-accepted.log` |
| Preserved development API | Supervised process is ready and binary hash matches the verified candidate | `.local/jira-ux-upgrades-api-rollout.json` |
| Existing workspace smoke | Web/API HTTP200; existing Owner sign-in and board read pass; five existing cards returned with bounded epic metadata | `.local/jira-ux-upgrades-live-smoke.json` |

These results do not rerun or certify cloud performance, paid hosting, real SMTP, employee identity or selected assistant usability. Existing local credentials and data remain intact; no schema change was required.

## Browser acceptance status

The six new planning-autosave journeys and two existing planning/integration journeys passed in isolated run `.local/browser-tests/0ff34b9df05c42dfa2c419ced7b024c7/`. All four rich-text/comment journeys passed in `.local/browser-tests/77b38162e4f945fd9c54cf2239cd8825/` after correcting issues found during development. These were mixed runs with failures in other cases; only their passing subsets are accepted here. Focused board verification has covered live teammate lookup and cursors, personal quick filters, bounded grouped pagination, shared rank/status moves and rejection of cross-group assignment changes. The corrected swimlane case, including actual drag moves and a 390-pixel mobile viewport, passed in `.local/browser-tests/27d0976dbde1427a8311510b7632d23a/`. Earlier failed development runs remain retained diagnostics, not accepted evidence.

The first complete functional run finished with **111 passing and two failing cases** in 5.6 minutes: `.local/browser-tests/b594d5c275ff45f38d192ea03febf085/`, log `.local/jira-ux-upgrades-browser-final.log`. One failed before bootstrap because five required modules returned `ERR_NETWORK_CHANGED`; sanitized trace findings are in `.local/jira-ux-upgrades-activity-bootstrap-diagnostic.json`. The other caught the duplicate toolbar picker pushing columns down to 389 pixels, beyond the existing compact-layout limit of 310. The duplicate picker was removed while preserving the live picker in Filters; the original geometry assertion remains unchanged.

The second complete functional run finished with **110 passing and three failing cases** in 5.5 minutes: `.local/browser-tests/234822685b8d42dc9f27bb1e054a7617/`, log `.local/jira-ux-upgrades-browser-accepted.log`. The earlier activity startup case passed unchanged. Remaining failures identified an exact label-text test selector that did not match the wrapping select, a pre-drag coordinate helper releasing outside the destination after reflow, and board columns still 7.5 pixels below the existing compactness limit.

The selector now uses the control's accessible combobox role/name. Both board drag acceptance files share the proven helper that follows the current destination rectangle and asserts the release point is inside it. Original persisted status/WIP assertions and the application’s outside-container safety guard remain intact. Quick-filter bottom spacing changed from 12 to 4 pixels without shrinking controls; the original `<310px` assertion remains unchanged. This scoped board style is the only application change after the second complete run.

The affected run `.local/browser-tests/11773528ad0143169b3cb12c7f7add4c/` passed **13 of 14 cases** in 56.5 seconds, including all three previously failing cases, actual card drag, unchanged compactness, personal filters and mobile containment. Its remaining failure reached the comment editor while the initial authorized discussion read was still pending. The test now explicitly waits for `contenteditable=true` before filling its draft. The final UI rerun `.local/browser-tests/80158b862e184a32bb48828722e76c67/` passed **all three cases** in 18.0 seconds, retaining keyboard tabs, rich draft retention, mobile behavior and screenshots. No application change followed that readiness correction.

**Final local acceptance: all 113 distinct functional scenarios have passing evidence across these full and affected runs.** This is not a clean single 113-pass run. `.local/jira-ux-upgrades-browser-coverage.json` records each scenario and its passing log; no failing case was removed or skipped. The only application change after the second full run was scoped quick-filter spacing, and its affected board cases passed afterward. Final strict app/test typing, 98 units and the 568.55 kB / 140.29 kB production build pass on the final source.

Fresh desktop/mobile board, swimlane, issue and rich-content screenshots were inspected. Standard board columns start at y309.5, preserving the existing `<310px` check; grouped mobile boards remain within a 390-pixel document while stages scroll inside the canvas. Safe code, table and checklist content, Arabic text, read-only content and planning retry/restoration are visible in the retained screenshots. The evidence directory is `.local/browser-evidence/daily-editing-board-controls-2026-10-13/`; its `manifest.json` records artifact and final source hashes, exact aggregate browser semantics, unchanged external gates and runtime smoke. Logs and screenshots contain local test fixtures, not credentials.
The preserved-runtime smoke was repeated successfully: `.local/jira-ux-upgrades-live-smoke.json` records web/API HTTP200, preserved Owner sign-in and five existing board cards. The earlier 99-scenario metadata evidence remains historical.

## Remaining scope

The current code review identifies these remaining items, in priority order:

1. **Cloning fidelity:** `frontend/src/app/features/issues/components/issue-actions/issue-actions.component.ts` converts rich descriptions to `textContent` and stores them as plain text. Tables, checklist structure and code formatting are lost. Preserve sanitized structure while explicitly handling references to private files belonging to the source issue.
2. **Consistent direct editing:** labels still use Save/Cancel and issue type is edited through the full issue form. This is a UX follow-up; current persistence and authorization checks pass.
3. **Mention busy state:** `frontend/src/app/features/comments/components/mention-picker/mention-picker.component.ts` binds `[disabled]` to a reactive-control input. Angular warns and can leave the input editable while its parent saves. Selection/search handlers guard the disabled state, so this is a small interaction issue. Synchronize the FormControl enabled state instead of using the template binding.
4. **Workflow controls:** current stage order, allowed moves, WIP, blocker/subtask completion and assignment rules work. Configurable required fields and reviewer approval are additional workflow features; `WorkflowColumn` currently has no such rule model.
5. **Large-board navigation:** stage headers currently scroll away vertically with the cards. The accepted large-window fixture produces a roughly 3,846-pixel board at a 960-pixel viewport. Sticky stage headers would keep status context visible while browsing many issues; bounded loading is already enforced.
6. **Team conveniences:** quick filters are personal and repository links are manual. Team-shared filters and automatic pull-request/commit synchronization would need explicit models and provider integration.

Managed employee onboarding, real message delivery and Google Cloud deployment/recovery remain the external gates described in [readiness](readiness.md). This report does not mark these follow-ups or external gates complete. The review covers current source and local regression evidence; it is not a representative-employee usability study or a cloud performance/recovery qualification.
