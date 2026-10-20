# Jira-style workspace validation

Verified 2026-10-12. UX-001–UX-005 and tasks T155–T160 are complete locally. The frontend remains a separate strict Angular application with feature-owned pages, the existing Go/PostgreSQL services, and generated REST types. No UI framework, package dependency, database migration, or cloud resource was added.

## Delivered behavior

| Requirement | Implementation and evidence |
| --- | --- |
| UX-001 | Shared typed SVG icons and tokens; sidebar project context, active navigation, global issue search/create, inbox count and Admin links. Dashboard totals come from bounded API searches. Global search works both within Issues and when entering it from another screen. |
| UX-002 | Whole-card and title-link dragging, native-link clicks, visible drop placeholders, four horizontal columns, touch drag delay, keyboard status/rank alternatives and real board creation. WIP warnings remain soft; blocked Done, shared ordering, retry rollback and 100-card window remain enforced. |
| UX-003 | Compact issue table, status/priority/assignee/date metadata, progressive filters with an active-filter count, native create/edit dialogs and a two-column detail view. Repeated global Create works after dismissal; cancellation is disabled during an in-flight save. |
| UX-004 | Consistent project directory/overview, board settings, inbox, Arabic comments and mention/editor controls. Existing assignments, subtasks, dependency, private picture, HTML sanitation, stale edit and permission flows pass their regressions. |
| UX-005 | Desktop 1440×960, tablet 768×1024 and phone 390×844. Board columns scroll horizontally without document overflow; issue tables scroll within their container. Closed phone navigation is removed from keyboard access; opening traps focus and makes main content inert, Escape restores the trigger. Native issue dialogs make background content inert. Reduced-motion styling is retained. |

## Executed checks

- Strict Angular application/template checking and TypeScript unit/browser-test checking: pass.
- Vitest: **67 tests pass across 11 files**.
- Full isolated PostgreSQL/Chromium suite: **33 pass, one opt-in timing case skipped**, run `.local/browser-tests/e19f60474f564d5f9d1690a31a1b4684/`. Includes actual card-body/title-link dragging, persisted moves, keyboard ranking, guarded Done, WIP counts, retry identity, 100-card bound, Arabic comments/images/mentions, project archive/access, Viewer restrictions, phone navigation and dialogs.
- Fresh-demo screenshot run: **one pass**, `.local/browser-tests/9e3f0c2390bc41bb90a27752c7118872/`. Screenshots were inspected at desktop, tablet and phone sizes.
- Production build: pass; initial output **852.93 kB raw / 186.29 kB estimated transfer**. The existing 600 kB warning remains; the unchanged 1 MB error budget passes. This UI work does not establish a new cloud performance result.
- Go feature/platform import-boundary check: pass. Backend business code and generated contracts were unchanged by this UI work; prior PostgreSQL/REST/MCP evidence remains in the other validation reports.
- Live user-facing development app: actual Owner username/password sign-in and project navigation verified at `http://localhost:4201`; backend readiness returns 200 on `127.0.0.1:21080`. The existing user browser tab is left on the Kanban board.

## Screenshots

Local evidence is kept in the ignored `.local/browser-evidence/` directory:

- `jira-board-desktop.png`
- `jira-board-tablet.png`
- `jira-board-phone.png`
- `jira-workspace-desktop.png`
- `jira-issue-desktop.png`

The eight external identity, assistant, employee-study, billing, cloud deployment/performance and recovery tasks remain pending as recorded in [readiness.md](readiness.md). No production launch or external rollout occurred.
