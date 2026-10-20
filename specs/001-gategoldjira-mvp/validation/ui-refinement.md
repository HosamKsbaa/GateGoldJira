# Jira-style UI refinement — 2026-10-13

Scope: the existing Angular workspace, Kanban board, issue drawer/full page, activity editor
and issue search. Intended outcome: Jira-like hierarchy and density, more visible work,
clearer actions and usable desktop/mobile navigation. No dependencies or backend contracts
were changed.

## Observations and implemented response

| Step | Screen / action | Initial friction | Result |
| --- | --- | --- | --- |
| 1 | Workspace → board | Repeated context, filters, stage selector and help pushed cards down. | Compact heading and one toolbar; desktop sidebar collapse; filters in a bounded panel with close/Escape focus restoration; help below the board. |
| 2 | Card → issue drawer | Duplicate status and comment/attachment controls crowded the description. | Wider drawer, a single status/action bar, clear description and separate metadata panel. |
| 3 | Comment → history → comment | Activity was hidden below an always-expanded editor. | Comments/History tabs with Arrow/Home/End keyboard navigation. The mounted editor retains Arabic and rich-text drafts. Add comment returns focus to it. |
| 4 | Rich comment / pictures | Manual picture upload took space even during ordinary typing. | Picture chooser disclosed on demand; clipboard images, HTML mode, mentions and document references retained. |
| 5 | Issue search | Saved-search setup was always visible. | Saved searches use a labeled disclosure; selected issue rows have a visible tint; existing advanced filters and bulk actions retained. |
| 6 | Phone / narrow board | Controls competed with cards; stage selector could disagree with horizontal scroll. | Compact toolbar, horizontally scrollable columns, scroll-aware stage navigation, full-width issue drawer and retained mobile navigation focus trap. |

Screenshots were captured from the real Angular/Go app against disposable PostgreSQL fixtures,
not the user's live data. Before screenshots are in `.local/browser-evidence/ui-refinement/before/`.
Final screenshot locations and verification results are recorded below after the checks finish.

## Evidence limits

This is a Jira-inspired implementation using GateGoldJira's existing tokens/components. It does
not claim exact Jira visual parity, Atlassian branding, full WCAG certification or completion of
the separate employee usability study. Keyboard, labels and responsive bounds are exercised in
Chromium; screen-reader and other-browser manual acceptance remain separate qualifications.

## Visual review

Clean-fixture capture: `.local/browser-tests/393078afe0814ef18bcdfaedbf5e4fd6/`
(1/1 screenshot flow passed). All seven final images were opened and inspected at native
viewport proportions and preserved in `.local/browser-evidence/ui-refinement/reviewed/`:

- `board-desktop.png`: 1440×960, sidebar visible, all four default columns.
- `board-focus.png`: same viewport with the sidebar collapsed.
- `board-phone.png`: 390×844, mobile controls and To do column.
- `issue-desktop.png` and `issue-phone.png`: drawer, single action bar, description and discussion.
- `issues-desktop.png` and `issues-phone.png`: loaded search results, filters and responsive table.

At 1440×960, the board starts at 275.5px (`layout.json`), compared with roughly 418px in the
before capture. The recovered space is used by the existing cards. The mobile table scrolls
inside its container; the page and drawer remain bounded. The drawer and board retain clear
close/create controls. No unresolved clipping was observed on these screens. This screenshot
review is limited to the represented states; functional checks cover the additional workflows.

## Local app

The existing web server responds on localhost:4201. The development API had stopped; it was
restarted from the existing tested binary/configuration and now returns 200 from /readyz on
127.0.0.1:21080. No reseed, schema change, production deployment or identity replacement was
performed for this UI work.

## Final verification

- Full browser suite: **53 passed, zero skipped**, 3.3 minutes, including drag/drop, workflows,
  roles, stale edits/retries, Arabic/HTML, clipboard pictures, arbitrary attachments, subtasks,
  notifications, mobile navigation and the new UI checks. Run:
  `.local/browser-tests/d8bbf5f7c59e437ea8b137252a81c7a1/`.
- Frontend unit suite: **86 passed across 14 files**. Strict Angular/template and test TypeScript
  checks pass. Go feature/platform architecture check and whitespace check pass.
- Production build passes: 867.22kB raw initial bundle, 188.49kB estimated transfer. The existing
  600kB initial-bundle warning remains; no limits were raised. The board component stylesheet
  is now below its 8 kB warning threshold.
- Browser timing: 100 trials each, project navigation p95=121.06ms and board navigation
  p95=593.73ms, below the existing 2 second local regression budget. These are development
  fixture measurements, not Google Cloud acceptance.
- Final full-page issue and 768px tablet board screenshots were also inspected from the full
  suite. Clean comparison images remain in the separate `reviewed/` directory.

The first full run exposed a changed Viewer label and a test tied to the removed duplicate
status chip. The explicit Read-only access label was restored, and the subtask assertion now
verifies the visible Issue status control. No permission assertion was removed. A subsequent
complete run passed all 53 tests. The new mobile test also verifies stage selection after both
programmatic stage jumps and horizontal scrolling.

Scope-specific UI work is complete. The original eight external OAuth, employee usability,
assistant/cloud and recovery qualifications remain recorded separately in tasks.md.
