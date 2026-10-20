# Local dates, labels and subtasks checkpoint

Verified 2026-10-12 against isolated PostgreSQL 18.6 and Chromium fixtures.

- Full mandatory PostgreSQL Go race suite and vet pass after the new label/subtask providers. Exactly 45 REST and MCP operations have concrete adapters and self-contained schemas; generated SDK includes label and subtask endpoints.
- Date tests cover invalid/leap dates, Cairo midnight, inclusive boundaries, ALL label matching, undated/Done/reopened overdue behavior, exact clears and whole-change rollback. Label tests cover trimmed display text, Arabic, full Unicode casefold reuse, concurrent duplicate creation, forty Unicode characters, foreign-project labels, bounded pages, Viewer and archived write denial.
- Real REST/MCP parity passes for label creation/reuse/listing, immutable retries across restart, child creation/listing, parent/assignment/date/label intersections and saved/temporary board filters. Revoked access is checked before replay.
- Child tests cover independent defaults/reporter/key/fields, immutable parent/type, no nesting or automatic parent completion, accurate progress, mixed parent/explicit cycles and parent Done racing with child create or reopen. Only one compatible race outcome commits.
- Nine browser cases pass in `.local/browser-tests/88ba39b1bf784de59890a1fea72469ae`; the remaining Kanban case passes after an exact locator correction in `.local/browser-tests/9d9cd76ce8fa4b0a98d1b87a1c280e52`. They cover independent child dates/labels/discussion, parent navigation/filtering, explicit completion, Viewer access, reusable Arabic labels, calendar clear/filter controls, rich discussion and protected pictures, bounded Kanban cards, reorder, guarded Done and uncertain retries. The corrected case verifies drag/drop, keyboard moves, soft Review WIP warnings and tablet width.
- Strict Angular application/template and test compilation pass for typed date/label, parent-selection and subtask controls. Child and candidate pages replace bounded result windows instead of growing unbounded lists.

Private inbox and selected-mention UI now pass their local checkpoint; see notifications.md. Actual Auth0/assistant OAuth, cloud measurements, recovery and employee usability are not claimed by local fixtures.
