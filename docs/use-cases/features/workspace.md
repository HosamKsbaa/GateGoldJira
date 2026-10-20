# Workspace, navigation and shared controls

Current shell, workspace dashboard, global discovery, shared input behavior and foreground refresh. Domain-specific editors and permissions are documented in their own areas.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `shell`: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30)
- `search`: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542)
- `navigation`: [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456)
- `home`: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12)
- `dashboard`: [frontend/src/app/core/workspace/workspace.page.ts:542](../../../frontend/src/app/core/workspace/workspace.page.ts#L542)
- `picker`: [frontend/src/app/shared/ui/searchable-picker.component.ts:26](../../../frontend/src/app/shared/ui/searchable-picker.component.ts#L26)
- `popup`: [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2)
- `drafts`: [frontend/src/app/core/drafts/drafts.service.ts:64](../../../frontend/src/app/core/drafts/drafts.service.ts#L64)
- `refresh`: [frontend/src/app/core/refresh/foreground-refresh.ts:3](../../../frontend/src/app/core/refresh/foreground-refresh.ts#L3)
- `routes`: [frontend/src/app/app.routes.ts:5](../../../frontend/src/app/app.routes.ts#L5)
- `bulkOwnership`: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:474](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L474)

## Cases

<a id="uc-shl-0001"></a>
### UC-SHL-0001 — Open workspace

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Open the root workspace route.

**Expected results**

- The current display name, workspace navigation and accessible work summaries are displayed.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts).

<a id="uc-shl-0002"></a>
### UC-SHL-0002 — Workspace initial loading

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Open the workspace while dashboard reads are pending.

**Expected results**

- A loading status is displayed until the current dashboard result is available.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts).

<a id="uc-shl-0003"></a>
### UC-SHL-0003 — Workspace load failure

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Fail the dashboard request.

**Expected results**

- An actionable dashboard error and Refresh workspace control are displayed.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts).

<a id="uc-shl-0004"></a>
### UC-SHL-0004 — Retry workspace load

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Select Refresh workspace after a failed dashboard read.

**Expected results**

- The current workspace is requested again and the successful result replaces the error.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts).

<a id="uc-shl-0005"></a>
### UC-SHL-0005 — Open personal assigned work

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Assigned to me.

**Expected results**

- Issues opens with self-assignee and open-work filters.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts).

<a id="uc-shl-0006"></a>
### UC-SHL-0006 — Open review work

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Ready for review.

**Expected results**

- Issues opens with the review category filter across accessible projects.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts).

<a id="uc-shl-0007"></a>
### UC-SHL-0007 — Open blocked work

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Blocked work.

**Expected results**

- Issues opens with unfinished blocked-work filters.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts).

<a id="uc-shl-0008"></a>
### UC-SHL-0008 — Open accessible projects

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Active projects.

**Expected results**

- The authorized project directory opens.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts).

<a id="uc-shl-0009"></a>
### UC-SHL-0009 — Open dashboard project

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate a project title in Jump back into a project.

**Expected results**

- That exact project overview opens.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts).

<a id="uc-shl-0010"></a>
### UC-SHL-0010 — Open dashboard project boards

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Board on a dashboard project card.

**Expected results**

- The board directory for that project opens.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts).

<a id="uc-shl-0011"></a>
### UC-SHL-0011 — Open dashboard project issues

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Issues on a dashboard project card.

**Expected results**

- Issues opens with that project filter.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts).

<a id="uc-shl-0012"></a>
### UC-SHL-0012 — Dashboard project empty state

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account with no accessible projects.

**Steps**

1. Open the dashboard with no accessible projects.

**Expected results**

- A No projects yet explanation and project-directory action appear.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [coverage-workspace.spec.ts](../../../frontend/e2e/coverage-workspace.spec.ts).

<a id="uc-shl-0013"></a>
### UC-SHL-0013 — Open assigned issue from workspace

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate a row under My open work.

**Expected results**

- The selected issue detail opens.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [coverage-workspace-extra.spec.ts](../../../frontend/e2e/coverage-workspace-extra.spec.ts).

<a id="uc-shl-0014"></a>
### UC-SHL-0014 — Assigned work empty state

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Open the dashboard with no self-assigned open issues.

**Expected results**

- The caught-up state appears without fabricated work.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [coverage-workspace.spec.ts](../../../frontend/e2e/coverage-workspace.spec.ts).

<a id="uc-shl-0015"></a>
### UC-SHL-0015 — Read company timezone

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Inspect the workspace company-timezone label.

**Expected results**

- The approved identity company timezone is displayed.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts).

<a id="uc-shl-0016"></a>
### UC-SHL-0016 — Workspace administrator shortcut

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. As a company administrator, activate Manage users on the workspace.

**Expected results**

- The company account administration page opens.

Sources: [frontend/src/app/core/workspace/workspace.page.ts:12](../../../frontend/src/app/core/workspace/workspace.page.ts#L12).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts).

<a id="uc-shl-0017"></a>
### UC-SHL-0017 — Navigate using brand

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate the GateGoldJira brand.

**Expected results**

- The root workspace route opens.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0018"></a>
### UC-SHL-0018 — Collapse desktop sidebar

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Collapse sidebar.

**Expected results**

- The sidebar is hidden and the trigger exposes its collapsed state.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0019"></a>
### UC-SHL-0019 — Expand desktop sidebar

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Expand sidebar.

**Expected results**

- The sidebar returns with current project context.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0020"></a>
### UC-SHL-0020 — Open mobile navigation

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Toggle navigation at a compact viewport.

**Expected results**

- Navigation opens as a modal region and the main content is inert.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0021"></a>
### UC-SHL-0021 — Dismiss mobile backdrop

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Close navigation outside the mobile sidebar.

**Expected results**

- Navigation closes without changing the route.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0022"></a>
### UC-SHL-0022 — Dismiss mobile navigation using Escape

Actor: `user` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Press Escape inside the open mobile sidebar.

**Expected results**

- Navigation closes.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0023"></a>
### UC-SHL-0023 — Mobile navigation focus confinement

Actor: `user` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Use Tab and Shift+Tab in open compact navigation.

**Expected results**

- Focus remains in the modal navigation until dismissal.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0024"></a>
### UC-SHL-0024 — Mobile navigation closes after navigation

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Follow a sidebar route on a compact viewport.

**Expected results**

- The destination opens and the sidebar closes.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0025"></a>
### UC-SHL-0025 — Resize navigation mode

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Resize across the compact-navigation breakpoint.

**Expected results**

- Navigation mode updates and the open mobile sidebar resets.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0026"></a>
### UC-SHL-0026 — Skip repeated navigation

Actor: `user` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Focus and activate Skip to content.

**Expected results**

- Keyboard focus moves to main content.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0027"></a>
### UC-SHL-0027 — Navigate current project issues

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Project issues in the current project navigation.

**Expected results**

- The list opens scoped to the current project.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0028"></a>
### UC-SHL-0028 — Navigate current project backlog

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Project backlog.

**Expected results**

- The current project backlog opens.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0029"></a>
### UC-SHL-0029 — Navigate current project planning

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Epics & releases.

**Expected results**

- Current project planning opens.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0030"></a>
### UC-SHL-0030 — Navigate current project reports

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Project reports.

**Expected results**

- Current project reports open.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0031"></a>
### UC-SHL-0031 — Navigate current project transfer

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Import & export.

**Expected results**

- Current project transfer opens.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0032"></a>
### UC-SHL-0032 — Navigate project board directory

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Manage boards.

**Expected results**

- Current project board directory opens.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0033"></a>
### UC-SHL-0033 — Navigate account MCP connections

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Account MCP tokens in the header.

**Expected results**

- The signed-in account connection-management route opens.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0034"></a>
### UC-SHL-0034 — Navigate notification inbox

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate the notification bell.

**Expected results**

- The current account inbox opens.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0035"></a>
### UC-SHL-0035 — Unread navigation indicator

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Receive an accessible unread notification and refresh the summary.

**Expected results**

- Header/sidebar unread indicators reflect current accessible unread count.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts), [coverage-workspace-extra.spec.ts](../../../frontend/e2e/coverage-workspace-extra.spec.ts).

<a id="uc-shl-0036"></a>
### UC-SHL-0036 — Create from current writable project

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate global Create issue with a writable current project.

**Expected results**

- The Issues route opens its creation dialog for that project.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts), [coverage-workspace-extra.spec.ts](../../../frontend/e2e/coverage-workspace-extra.spec.ts).

<a id="uc-shl-0037"></a>
### UC-SHL-0037 — Create fallback project

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate global Create issue while current project is archived or viewer-only and a loaded writable project exists.

**Expected results**

- A loaded active writable project is selected for creation.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts), [coverage-workspace-extra.spec.ts](../../../frontend/e2e/coverage-workspace-extra.spec.ts).

<a id="uc-shl-0038"></a>
### UC-SHL-0038 — Hide unavailable global creation

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Open the shell with no loaded writable project.

**Expected results**

- Global Create issue is absent.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts), [coverage-workspace.spec.ts](../../../frontend/e2e/coverage-workspace.spec.ts).

<a id="uc-shl-0039"></a>
### UC-SHL-0039 — Create from backlog context

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate global Create issue while viewing a backlog.

**Expected results**

- The creation navigation preserves the backlog destination.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0040"></a>
### UC-SHL-0040 — Resolve project from issue deep link

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Open a full issue URL directly.

**Expected results**

- The shell resolves that issue project instead of relying on previously loaded directory rows.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0041"></a>
### UC-SHL-0041 — Resolve project from board deep link

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Open a board URL directly.

**Expected results**

- The shell resolves the board project and board context.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts), [coverage-workspace-extra.spec.ts](../../../frontend/e2e/coverage-workspace-extra.spec.ts).

<a id="uc-shl-0042"></a>
### UC-SHL-0042 — Ignore outdated project context

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Navigate from project A to B before A context reads complete.

**Expected results**

- A delayed result cannot replace B context.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts), [coverage-workspace-extra.spec.ts](../../../frontend/e2e/coverage-workspace-extra.spec.ts).

<a id="uc-shl-0043"></a>
### UC-SHL-0043 — Clear inaccessible project context

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Open an inaccessible project or lose project access before its context loads.

**Expected results**

- The shell clears failed context without displaying unauthorized metadata.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts), [coverage-workspace-extra.spec.ts](../../../frontend/e2e/coverage-workspace-extra.spec.ts).

<a id="uc-shl-0044"></a>
### UC-SHL-0044 — Unknown route fallback

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Open an unknown application route.

**Expected results**

- The configured fallback returns to the guarded workspace.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts), [coverage-workspace-extra.spec.ts](../../../frontend/e2e/coverage-workspace-extra.spec.ts).

<a id="uc-shl-0045"></a>
### UC-SHL-0045 — Clear shell on sign-out

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Sign out while shell data and search are populated.

**Expected results**

- Project context, search content, account navigation and personal state clear.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30), [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Related test files: [workspace-ux.spec.ts](../../../frontend/e2e/workspace-ux.spec.ts), [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0046"></a>
### UC-SHL-0046 — Global numeric search

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Type a bare issue number into Search all issues.

**Expected results**

- Authorized numeric matches appear as typing results.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Shared business operations: `search_issues_v2`.

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0047"></a>
### UC-SHL-0047 — Global key search

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Type a complete issue key into Search all issues.

**Expected results**

- Authorized matching issues appear without a search-button click.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Shared business operations: `search_issues_v2`.

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0048"></a>
### UC-SHL-0048 — Global title search

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Type title text into Search all issues.

**Expected results**

- Authorized title matches appear without form submission.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Shared business operations: `search_issues_v2`.

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0049"></a>
### UC-SHL-0049 — Global Arabic search

Actor: `user` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Type Arabic or mixed-direction title text.

**Expected results**

- Results preserve the text and readable bidirectional labels.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Shared business operations: `search_issues_v2`.

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0050"></a>
### UC-SHL-0050 — Clear global query

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Clear all nonwhitespace search text.

**Expected results**

- The popup closes and pending search is cancelled.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Shared business operations: `search_issues_v2`.

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0051"></a>
### UC-SHL-0051 — Global search pending state

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Keep the latest search request pending.

**Expected results**

- Searching issues is announced and stale matches are cleared.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Shared business operations: `search_issues_v2`.

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0052"></a>
### UC-SHL-0052 — Global search no matches

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Complete a successful query with no matches.

**Expected results**

- No matching issues appears after loading ends.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Shared business operations: `search_issues_v2`.

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0053"></a>
### UC-SHL-0053 — Global search failure

Actor: `user` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Fail the current global search.

**Expected results**

- An error and Retry search control appear.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Shared business operations: `search_issues_v2`.

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0054"></a>
### UC-SHL-0054 — Retry global search

Actor: `user` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Retry search after a current search error.

**Expected results**

- The current query is requested again.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Shared business operations: `search_issues_v2`.

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0055"></a>
### UC-SHL-0055 — Global result suggestion bound

Actor: `user` · Kind: `performance` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Search a query matching more than eight issues.

**Expected results**

- The popup shows at most eight suggestions and preserves the server total for View all results.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Shared business operations: `search_issues_v2`.

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0056"></a>
### UC-SHL-0056 — Open global suggestion

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate one popup issue link.

**Expected results**

- The correct issue opens and the popup closes.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Shared business operations: `search_issues_v2`.

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0057"></a>
### UC-SHL-0057 — View all global results

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate View all results.

**Expected results**

- Issues opens with the current query.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Shared business operations: `search_issues_v2`.

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0058"></a>
### UC-SHL-0058 — Global search keyboard selection

Actor: `user` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Use ArrowDown or ArrowUp and Enter on an available suggestion.

**Expected results**

- The active authorized suggestion opens.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0059"></a>
### UC-SHL-0059 — Dismiss global popup

Actor: `user` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Press Escape or dismiss the auto popover.

**Expected results**

- The popup closes without navigating to a suggestion.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0060"></a>
### UC-SHL-0060 — Global search stale result

Actor: `user` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Type query A then B and deliver A last.

**Expected results**

- Only B can populate matches or error state.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Shared business operations: `search_issues_v2`.

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0061"></a>
### UC-SHL-0061 — Global search session switch

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Change signed-in identity while search is pending.

**Expected results**

- Previous-account results cannot populate the new session.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Shared business operations: `search_issues_v2`.

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0062"></a>
### UC-SHL-0062 — Global popup viewport placement

Actor: `user` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Open global suggestions near viewport boundaries, then resize or scroll the visual viewport.

**Expected results**

- The top-layer popup is repositioned within available visual viewport bounds.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542), [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Related test files: [global-live-search.spec.ts](../../../frontend/e2e/global-live-search.spec.ts).

<a id="uc-shl-0063"></a>
### UC-SHL-0063 — Shared picker open

Actor: `user` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Focus a searchable picker.

**Expected results**

- A labelled choices popup opens.

Sources: [frontend/src/app/shared/ui/searchable-picker.component.ts:26](../../../frontend/src/app/shared/ui/searchable-picker.component.ts#L26).

Related test files: [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0064"></a>
### UC-SHL-0064 — Shared picker remove selection

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate a selected chip remove control.

**Expected results**

- Only that selected value is removed through the owning control.

Sources: [frontend/src/app/shared/ui/searchable-picker.component.ts:26](../../../frontend/src/app/shared/ui/searchable-picker.component.ts#L26).

Related test files: [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0065"></a>
### UC-SHL-0065 — Shared picker latest query

Actor: `user` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Type a new query in a searchable picker.

**Expected results**

- The parent receives the query; loading state prevents selecting old choices.

Sources: [frontend/src/app/shared/ui/searchable-picker.component.ts:26](../../../frontend/src/app/shared/ui/searchable-picker.component.ts#L26).

Related test files: [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0066"></a>
### UC-SHL-0066 — Shared picker load more

Actor: `user` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Activate Load more choices when another page exists.

**Expected results**

- The owning feature is asked for its next page.

Sources: [frontend/src/app/shared/ui/searchable-picker.component.ts:26](../../../frontend/src/app/shared/ui/searchable-picker.component.ts#L26).

Related test files: [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0067"></a>
### UC-SHL-0067 — Shared picker dismiss

Actor: `user` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Use Done choosing, Escape or outside pointer dismissal.

**Expected results**

- The picker closes with no fabricated selection.

Sources: [frontend/src/app/shared/ui/searchable-picker.component.ts:26](../../../frontend/src/app/shared/ui/searchable-picker.component.ts#L26).

Related test files: [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts).

<a id="uc-shl-0068"></a>
### UC-SHL-0068 — Popup flips above trigger

Actor: `user` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Open a popup with insufficient room below and more room above.

**Expected results**

- The popup is placed above its trigger within viewport bounds.

Sources: [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Related test files: [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts), [coverage-workspace-extra.spec.ts](../../../frontend/e2e/coverage-workspace-extra.spec.ts).

<a id="uc-shl-0069"></a>
### UC-SHL-0069 — RTL popup anchoring

Actor: `user` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Open an anchored popup on an RTL trigger.

**Expected results**

- Preferred alignment follows the right edge while staying in the viewport.

Sources: [frontend/src/app/shared/ui/position-anchored-popup.ts:2](../../../frontend/src/app/shared/ui/position-anchored-popup.ts#L2).

Related test files: [keyboard.spec.ts](../../../frontend/e2e/keyboard.spec.ts), [coverage-workspace-extra.spec.ts](../../../frontend/e2e/coverage-workspace-extra.spec.ts).

<a id="uc-shl-0070"></a>
### UC-SHL-0070 — Guard dirty navigation

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Navigate away while a supported editor has a registered dirty draft.

**Expected results**

- A leave confirmation protects the in-memory draft.

Sources: [frontend/src/app/core/drafts/drafts.service.ts:64](../../../frontend/src/app/core/drafts/drafts.service.ts#L64).

<a id="uc-shl-0071"></a>
### UC-SHL-0071 — Cancel dirty navigation

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Decline the dirty-editor leave confirmation.

**Expected results**

- The current route and draft remain available.

Sources: [frontend/src/app/core/drafts/drafts.service.ts:64](../../../frontend/src/app/core/drafts/drafts.service.ts#L64).

<a id="uc-shl-0072"></a>
### UC-SHL-0072 — Restore same-tab draft

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Leave then revisit a supported editor in the same signed-in tab.

**Expected results**

- Its retained draft can be restored according to the owning feature.

Sources: [frontend/src/app/core/drafts/drafts.service.ts:64](../../../frontend/src/app/core/drafts/drafts.service.ts#L64).

<a id="uc-shl-0073"></a>
### UC-SHL-0073 — Clear drafts on session change

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Change the authentication session epoch.

**Expected results**

- Registered issue, comment, upload, planning, field, bulk, board and saved-search drafts clear.

Sources: [frontend/src/app/core/drafts/drafts.service.ts:64](../../../frontend/src/app/core/drafts/drafts.service.ts#L64).

Related test files: [coverage-session-draft-matrix.spec.ts](../../../frontend/e2e/coverage-session-draft-matrix.spec.ts).

Related cases: [UC-SHL-0083](../features/workspace.md#uc-shl-0083), [UC-SHL-0084](../features/workspace.md#uc-shl-0084), [UC-SHL-0085](../features/workspace.md#uc-shl-0085), [UC-SHL-0086](../features/workspace.md#uc-shl-0086), [UC-SHL-0087](../features/workspace.md#uc-shl-0087), [UC-SHL-0088](../features/workspace.md#uc-shl-0088), [UC-SHL-0089](../features/workspace.md#uc-shl-0089), [UC-SHL-0090](../features/workspace.md#uc-shl-0090).

Note: The umbrella scenario encloses the complete native UI matrix in one recorded step: issue, comment and selected-file drafts, planning retry intent, custom-field input, bulk retry intent, board layout edits and saved-search retry intent. Each draft is first restored through ordinary navigation to prove registration; then visible sign out/sign in changes the account within the same SPA document. Native search/navigation reopens the scope, previous private intent is absent and actual service readbacks are unchanged. A partial family run does not claim the umbrella expectation.

<a id="uc-shl-0074"></a>
### UC-SHL-0074 — Warn on browser reload with dirty draft

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Reload or close a tab with a registered dirty editor.

**Expected results**

- The browser receives the beforeunload warning request; accepting reload ends memory-only draft retention.

Sources: [frontend/src/app/core/drafts/drafts.service.ts:64](../../../frontend/src/app/core/drafts/drafts.service.ts#L64).

<a id="uc-shl-0075"></a>
### UC-SHL-0075 — Foreground refresh visible and idle

Actor: `user` · Kind: `performance` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Allow the foreground timer while the document is visible, online and the owning feature permits refresh.

**Expected results**

- One refresh starts without overlapping an existing refresh.

Sources: [frontend/src/app/core/refresh/foreground-refresh.ts:3](../../../frontend/src/app/core/refresh/foreground-refresh.ts#L3).

<a id="uc-shl-0076"></a>
### UC-SHL-0076 — Pause foreground refresh when hidden

Actor: `user` · Kind: `performance` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Hide the document during refresh timer ticks.

**Expected results**

- New periodic refresh work is skipped while hidden.

Sources: [frontend/src/app/core/refresh/foreground-refresh.ts:3](../../../frontend/src/app/core/refresh/foreground-refresh.ts#L3).

<a id="uc-shl-0077"></a>
### UC-SHL-0077 — Resume refresh after reconnect

Actor: `user` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed into an active approved account and has access to the relevant project.

**Steps**

1. Restore online or visible state when the feature allows refresh.

**Expected results**

- A refresh is attempted without discarding confirmed content on failure.

Sources: [frontend/src/app/core/refresh/foreground-refresh.ts:3](../../../frontend/src/app/core/refresh/foreground-refresh.ts#L3).

<a id="uc-shl-0078"></a>
### UC-SHL-0078 — History back navigation

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The account has access to the relevant project; preserve the described browser history, board pagination or role fixture.

**Steps**

1. Navigate across two supported routes, then use browser Back.

**Expected results**

- The preceding guarded route and its URL-driven context are restored.

Sources: [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456), [frontend/src/app/app.routes.ts:5](../../../frontend/src/app/app.routes.ts#L5).

<a id="uc-shl-0079"></a>
### UC-SHL-0079 — History forward navigation

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The account has access to the relevant project; preserve the described browser history, board pagination or role fixture.

**Steps**

1. Use browser Forward after navigating back.

**Expected results**

- The forward guarded route and current context are restored.

Sources: [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456), [frontend/src/app/app.routes.ts:5](../../../frontend/src/app/app.routes.ts#L5).

<a id="uc-shl-0080"></a>
### UC-SHL-0080 — Find shell default board beyond first page

Actor: `user` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The account has access to the relevant project; preserve the described browser history, board pagination or role fixture.

**Steps**

1. Open a project whose default board sorts after the first board listing page.

**Expected results**

- The shell resolves the default board across paginated board listings and the Board shortcut opens that board.

Sources: [frontend/src/app/app.component.ts:456](../../../frontend/src/app/app.component.ts#L456).

Gaps: [GAP-SHL-001](../gaps.md#gap-shl-001).

<a id="uc-shl-0081"></a>
### UC-SHL-0081 — Project administrator automation navigation

Actor: `project_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The account has access to the relevant project; preserve the described browser history, board pagination or role fixture.

**Steps**

1. Open a project as its project administrator and inspect the Automation navigation entry.

**Expected results**

- The project administrator sees the Automation shortcut and can open that project automation route.

Sources: [frontend/src/app/app.component.ts:30](../../../frontend/src/app/app.component.ts#L30).

Gaps: [GAP-SHL-002](../gaps.md#gap-shl-002).

<a id="uc-shl-0082"></a>
### UC-SHL-0082 — Closing global search safely restores focus

Actor: `user` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The user is signed in and the global search popover contains a current result.

**Steps**

1. Type an authorized issue query, then activate View all results or a result link while the search input is the popover focus-return target.

**Expected results**

- The destination opens, pending search is canceled and the popover remains closed. Focus restoration does not reenter showPopover or produce an application runtime error.

Sources: [frontend/src/app/app.component.ts:542](../../../frontend/src/app/app.component.ts#L542).

Shared business operations: `search_issues_v2`.

Related test files: [coverage-workspace.spec.ts](../../../frontend/e2e/coverage-workspace.spec.ts).

Note: The browser fixture fails on uncaught page errors and Angular runtime-error console events.

<a id="uc-shl-0083"></a>
### UC-SHL-0083 — Clear issue drafts on same-SPA account switch

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The first approved account has a registered unsaved issue draft in a supported editor.
- A different approved account can access the underlying project after signing in.

**Steps**

1. Use the visible Sign out action, then sign in as the other account without reloading the SPA.
2. Reopen the same issue editor or scope.

**Expected results**

- The previous account issue draft is not restored into the new session; only current persisted data and new-session selections are shown.

Sources: [frontend/src/app/core/drafts/drafts.service.ts:64](../../../frontend/src/app/core/drafts/drafts.service.ts#L64).

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts).

Related cases: [UC-SHL-0073](../features/workspace.md#uc-shl-0073).

Note: Atomic account-switch boundary for the issue draft family; UC-SHL-0073 remains the umbrella expectation for all eight families.

<a id="uc-shl-0084"></a>
### UC-SHL-0084 — Clear comment drafts on same-SPA account switch

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The first approved account has a registered unsaved comment draft in a supported editor.
- A different approved account can access the underlying project after signing in.

**Steps**

1. Use the visible Sign out action, then sign in as the other account without reloading the SPA.
2. Reopen the same comment editor or scope.

**Expected results**

- The previous account comment draft is not restored into the new session; only current persisted data and new-session selections are shown.

Sources: [frontend/src/app/core/drafts/drafts.service.ts:64](../../../frontend/src/app/core/drafts/drafts.service.ts#L64).

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts).

Related cases: [UC-SHL-0073](../features/workspace.md#uc-shl-0073).

Note: Atomic account-switch boundary for the comment draft family; UC-SHL-0073 remains the umbrella expectation for all eight families.

<a id="uc-shl-0085"></a>
### UC-SHL-0085 — Clear upload drafts on same-SPA account switch

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The first approved account has a registered unsaved upload draft in a supported editor.
- A different approved account can access the underlying project after signing in.

**Steps**

1. Use the visible Sign out action, then sign in as the other account without reloading the SPA.
2. Reopen the same upload editor or scope.

**Expected results**

- The previous account upload draft is not restored into the new session; only current persisted data and new-session selections are shown.

Sources: [frontend/src/app/core/drafts/drafts.service.ts:64](../../../frontend/src/app/core/drafts/drafts.service.ts#L64).

Related test files: [issue-inline-editing.spec.ts](../../../frontend/e2e/issue-inline-editing.spec.ts).

Related cases: [UC-SHL-0073](../features/workspace.md#uc-shl-0073).

Note: Atomic account-switch boundary for the upload draft family; UC-SHL-0073 remains the umbrella expectation for all eight families.

<a id="uc-shl-0086"></a>
### UC-SHL-0086 — Clear planning drafts on same-SPA account switch

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The first approved account has a registered unsaved planning draft in a supported editor.
- A different approved account can access the underlying project after signing in.

**Steps**

1. Use the visible Sign out action, then sign in as the other account without reloading the SPA.
2. Reopen the same planning editor or scope.

**Expected results**

- The previous account planning draft is not restored into the new session; only current persisted data and new-session selections are shown.

Sources: [frontend/src/app/core/drafts/drafts.service.ts:64](../../../frontend/src/app/core/drafts/drafts.service.ts#L64).

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts).

Related cases: [UC-SHL-0073](../features/workspace.md#uc-shl-0073).

Note: Atomic account-switch boundary for the planning draft family; UC-SHL-0073 remains the umbrella expectation for all eight families.

<a id="uc-shl-0087"></a>
### UC-SHL-0087 — Clear field drafts on same-SPA account switch

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The first approved account has a registered unsaved field draft in a supported editor.
- A different approved account can access the underlying project after signing in.

**Steps**

1. Use the visible Sign out action, then sign in as the other account without reloading the SPA.
2. Reopen the same field editor or scope.

**Expected results**

- The previous account field draft is not restored into the new session; only current persisted data and new-session selections are shown.

Sources: [frontend/src/app/core/drafts/drafts.service.ts:64](../../../frontend/src/app/core/drafts/drafts.service.ts#L64).

Related test files: [coverage-fields.spec.ts](../../../frontend/e2e/coverage-fields.spec.ts).

Related cases: [UC-SHL-0073](../features/workspace.md#uc-shl-0073).

Note: Atomic account-switch boundary for the field draft family; UC-SHL-0073 remains the umbrella expectation for all eight families.

<a id="uc-shl-0088"></a>
### UC-SHL-0088 — Clear bulk drafts on same-SPA account switch

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The first approved account has a registered unsaved bulk draft in a supported editor.
- A different approved account can access the underlying project after signing in.

**Steps**

1. Use the visible Sign out action, then sign in as the other account without reloading the SPA.
2. Reopen the same bulk editor or scope.

**Expected results**

- The previous account bulk draft is not restored into the new session; only current persisted data and new-session selections are shown.

Sources: [frontend/src/app/core/drafts/drafts.service.ts:64](../../../frontend/src/app/core/drafts/drafts.service.ts#L64).

Related test files: [coverage-issue-discovery.spec.ts](../../../frontend/e2e/coverage-issue-discovery.spec.ts).

Related cases: [UC-SHL-0073](../features/workspace.md#uc-shl-0073).

Note: Atomic account-switch boundary for the bulk draft family; UC-SHL-0073 remains the umbrella expectation for all eight families.

<a id="uc-shl-0089"></a>
### UC-SHL-0089 — Clear board drafts on same-SPA account switch

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The first approved account has a registered unsaved board draft in a supported editor.
- A different approved account can access the underlying project after signing in.

**Steps**

1. Use the visible Sign out action, then sign in as the other account without reloading the SPA.
2. Reopen the same board editor or scope.

**Expected results**

- The previous account board draft is not restored into the new session; only current persisted data and new-session selections are shown.

Sources: [frontend/src/app/core/drafts/drafts.service.ts:64](../../../frontend/src/app/core/drafts/drafts.service.ts#L64).

Related test files: [coverage-boards.spec.ts](../../../frontend/e2e/coverage-boards.spec.ts).

Related cases: [UC-SHL-0073](../features/workspace.md#uc-shl-0073).

Note: Atomic account-switch boundary for the board draft family; UC-SHL-0073 remains the umbrella expectation for all eight families.

<a id="uc-shl-0090"></a>
### UC-SHL-0090 — Clear saved-search drafts on same-SPA account switch

Actor: `user` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The first approved account has a registered unsaved saved-search draft in a supported editor.
- A different approved account can access the underlying project after signing in.

**Steps**

1. Use the visible Sign out action, then sign in as the other account without reloading the SPA.
2. Reopen the same saved-search editor or scope.

**Expected results**

- The previous account saved-search draft is not restored into the new session; only current persisted data and new-session selections are shown.

Sources: [frontend/src/app/core/drafts/drafts.service.ts:64](../../../frontend/src/app/core/drafts/drafts.service.ts#L64).

Related test files: [coverage-issue-discovery.spec.ts](../../../frontend/e2e/coverage-issue-discovery.spec.ts).

Related cases: [UC-SHL-0073](../features/workspace.md#uc-shl-0073).

Note: Atomic account-switch boundary for the saved-search draft family; UC-SHL-0073 remains the umbrella expectation for all eight families.

<a id="uc-shl-0091"></a>
### UC-SHL-0091 — Release destroyed bulk editor ownership after a late response

Actor: `user` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The signed-in writer has a same-tab retained native bulk draft after explicitly confirming navigation away.
- The first bulk field write was accepted by the real service; its reply is held while the original bulk component has been destroyed and the clean Backlog route is active.

**Steps**

1. Deliver the accepted bulk reply after the original component is destroyed.
2. Use the visible Issues link to leave the clean Backlog route in the same signed-in tab.

**Expected results**

- The late completion does not re-register the destroyed bulk editor as active dirty work: the clean Backlog route leaves successfully without an unrelated draft confirmation.

Sources: [frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts:474](../../../frontend/src/app/features/issues/components/bulk-actions/modern-bulk-actions.component.ts#L474), [frontend/src/app/core/drafts/drafts.service.ts:64](../../../frontend/src/app/core/drafts/drafts.service.ts#L64).

Shared business operations: `patch_issue_field_v2`.

Related test files: [coverage-bulk-destroyed-ownership.spec.ts](../../../frontend/e2e/coverage-bulk-destroyed-ownership.spec.ts).

Related cases: [UC-SHL-0070](../features/workspace.md#uc-shl-0070), [UC-SHL-0072](../features/workspace.md#uc-shl-0072), [UC-ISS-0165](../features/issues.md#uc-iss-0165).

Note: The browser fixture holds the actual accepted server reply and uses ordinary links and the native leave confirmation. No Angular internals or fabricated server responses are used.

Note: This atomic case covers dirty-ownership release only. Same-tab draft restoration and exact accepted-item replay remain independently required by UC-SHL-0072 and UC-ISS-0165; they are not inferred from this case.
