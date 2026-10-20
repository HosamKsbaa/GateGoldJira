# Backlog planning, ranking and activation

Planned work has ordering independent of active board columns. Browser bulk activation processes at most 100 selected issues through individual organization commands; it is not one atomic bulk transaction.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `page`: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236)
- `service`: [backend/internal/features/issues/backlog.go:63](../../../backend/internal/features/issues/backlog.go#L63)
- `reorder`: [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125)
- `organization`: [backend/internal/features/issues/organization.go:50](../../../backend/internal/features/issues/organization.go#L50)
- `transport`: [backend/internal/features/issues/backlog_transport.go:11](../../../backend/internal/features/issues/backlog_transport.go#L11)

## Cases

<a id="uc-blg-0001"></a>
### UC-BLG-0001 — Read planned work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open the project's Backlog page.

**Expected results**

- Ranked planned issues and a total count appear.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236), [backend/internal/features/issues/backlog.go:63](../../../backend/internal/features/issues/backlog.go#L63).

Shared business operations: `list_backlog`.

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-backlog-native-validation.spec.ts](../../../frontend/e2e/coverage-backlog-native-validation.spec.ts).

<a id="uc-blg-0002"></a>
### UC-BLG-0002 — Read backlog issue metadata

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Inspect a planned row.

**Expected results**

- Key, title, category, assignee, due state, blockers and labels describe the issue.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

<a id="uc-blg-0003"></a>
### UC-BLG-0003 — Open a planned issue

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Follow a backlog issue link.

**Expected results**

- The dedicated issue route opens.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

<a id="uc-blg-0004"></a>
### UC-BLG-0004 — Load more planned work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Choose More planned work.

**Expected results**

- The next cursor page appends without duplicate rows.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236), [backend/internal/features/issues/backlog.go:63](../../../backend/internal/features/issues/backlog.go#L63).

Shared business operations: `list_backlog`.

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-BLG-0037](../features/backlog.md#uc-blg-0037).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BLG-0037.

<a id="uc-blg-0005"></a>
### UC-BLG-0005 — Read an empty backlog

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open a project with no planned work.

**Expected results**

- The empty state explains creating planned work or sending unstarted work to backlog.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

<a id="uc-blg-0006"></a>
### UC-BLG-0006 — Create planned work

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Create an issue using the backlog form.

**Expected results**

- The issue is created in backlog without briefly appearing as active board work.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Shared business operations: `create_issue_v2`.

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

<a id="uc-blg-0007"></a>
### UC-BLG-0007 — Create planned work with attachments

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Create a backlog issue with queued files or pictures.

**Expected results**

- Uploads finish against the one created issue before the form completes.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Shared business operations: `create_issue_v2`.

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

Related cases: [UC-BLG-0006](../features/backlog.md#uc-blg-0006), [UC-AST-0060](../features/assets.md#uc-ast-0060).

Note: Binary transfer details are owned by the attachments catalog.

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BLG-0006, UC-AST-0060.

<a id="uc-blg-0008"></a>
### UC-BLG-0008 — Cancel backlog creation

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Close creation and resolve its draft confirmation.

**Expected results**

- The form closes without creating another issue; focus returns to the create trigger.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

<a id="uc-blg-0009"></a>
### UC-BLG-0009 — Drag a planned issue earlier

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Drag a loaded row earlier in backlog.

**Expected results**

- The new backlog order survives refresh without changing active board ordering.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236), [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125).

Shared business operations: `reorder_backlog`.

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

Related cases: [UC-BLG-0038](../features/backlog.md#uc-blg-0038).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BLG-0038.

<a id="uc-blg-0010"></a>
### UC-BLG-0010 — Rank a planned issue earlier with keyboard controls

Actor: `writer` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Use the Rank earlier button.

**Expected results**

- The new backlog order is saved without requiring a drag gesture.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236), [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125).

Shared business operations: `reorder_backlog`.

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

Related cases: [UC-BLG-0038](../features/backlog.md#uc-blg-0038).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BLG-0038.

<a id="uc-blg-0011"></a>
### UC-BLG-0011 — Drag a planned issue later

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Drag a loaded row later in backlog.

**Expected results**

- The new backlog order survives refresh without changing active board ordering.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236), [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125).

Shared business operations: `reorder_backlog`.

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

Related cases: [UC-BLG-0039](../features/backlog.md#uc-blg-0039).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BLG-0039.

<a id="uc-blg-0012"></a>
### UC-BLG-0012 — Rank a planned issue later with keyboard controls

Actor: `writer` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Use the Rank later button.

**Expected results**

- The new backlog order is saved without requiring a drag gesture.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236), [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125).

Shared business operations: `reorder_backlog`.

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

Related cases: [UC-BLG-0039](../features/backlog.md#uc-blg-0039).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BLG-0039.

<a id="uc-blg-0013"></a>
### UC-BLG-0013 — Select one planned issue

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Select its checkbox.

**Expected results**

- The selected issue contributes to the activation count.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

<a id="uc-blg-0014"></a>
### UC-BLG-0014 — Deselect one planned issue

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Clear its selected checkbox.

**Expected results**

- The issue no longer contributes to the activation count.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

<a id="uc-blg-0015"></a>
### UC-BLG-0015 — Select loaded planned issues

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Choose Select loaded.

**Expected results**

- Up to 100 currently loaded rows are selected.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

<a id="uc-blg-0016"></a>
### UC-BLG-0016 — Clear backlog selection

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Turn off Select loaded.

**Expected results**

- Selection is cleared.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

<a id="uc-blg-0017"></a>
### UC-BLG-0017 — Activate one planned issue

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Choose Move to board for one backlog row.

**Expected results**

- The issue becomes active and disappears from backlog.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236), [backend/internal/features/issues/organization.go:50](../../../backend/internal/features/issues/organization.go#L50).

Shared business operations: `organize_issue`.

Related test files: [coverage-boards.spec.ts](../../../frontend/e2e/coverage-boards.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-backlog-native-validation.spec.ts](../../../frontend/e2e/coverage-backlog-native-validation.spec.ts).

<a id="uc-blg-0018"></a>
### UC-BLG-0018 — Activate selected planned work

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Choose Move selected to board.

**Expected results**

- Each confirmed issue leaves backlog and the success count advances.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236), [backend/internal/features/issues/organization.go:50](../../../backend/internal/features/issues/organization.go#L50).

Shared business operations: `organize_issue`.

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

Related cases: [UC-BLG-0017](../features/backlog.md#uc-blg-0017).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BLG-0017.

<a id="uc-blg-0019"></a>
### UC-BLG-0019 — Preserve successful partial activation

Actor: `writer` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Retry after a later selected issue fails to activate.

**Expected results**

- Previously confirmed issues remain removed while unconfirmed work is available to retry.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Shared business operations: `organize_issue`.

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

Related cases: [UC-BLG-0017](../features/backlog.md#uc-blg-0017), [UC-BLG-0031](../features/backlog.md#uc-blg-0031).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BLG-0017, UC-BLG-0031.

<a id="uc-blg-0020"></a>
### UC-BLG-0020 — Apply stage assignment on activation

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Activate planned work whose current stage has an enabled assignment rule.

**Expected results**

- The stage-entry assignment hook runs in the activation transaction.

Sources: [backend/internal/features/issues/organization.go:50](../../../backend/internal/features/issues/organization.go#L50), [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Shared business operations: `organize_issue`.

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-backlog-native-validation.spec.ts](../../../frontend/e2e/coverage-backlog-native-validation.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-blg-0021"></a>
### UC-BLG-0021 — Keep backlog read-only for viewers

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open backlog using viewer access.

**Expected results**

- Creation, selection, ranking and activation controls are unavailable.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236), [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125).

Shared business operations: `list_backlog`.

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

Related cases: [UC-BLG-0040](../features/backlog.md#uc-blg-0040).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BLG-0040.

<a id="uc-blg-0022"></a>
### UC-BLG-0022 — Reject ranking by a viewer

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Actor has only viewer access.

**Steps**

1. Submit a reorder command without project write authority.

**Expected results**

- The server refuses the write.

Sources: [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125), [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Shared business operations: `reorder_backlog`.

Related test files: [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-backlog-native-validation.spec.ts](../../../frontend/e2e/coverage-backlog-native-validation.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-blg-0023"></a>
### UC-BLG-0023 — Reject more than 100 selected issues

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Select issue 101 for one activation batch.

**Expected results**

- The extra selection is refused with a visible limit message.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

<a id="uc-blg-0024"></a>
### UC-BLG-0024 — Reject self-anchored backlog reorder

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Use the moving issue as its own neighbor.

**Expected results**

- Validation requires another planned issue.

Sources: [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125).

Shared business operations: `reorder_backlog`.

Related test files: [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

<a id="uc-blg-0025"></a>
### UC-BLG-0025 — Reject ranking active board work

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Rank an issue currently outside backlog.

**Expected results**

- Only current backlog work can be ranked.

Sources: [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125).

Shared business operations: `reorder_backlog`.

Related test files: [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

<a id="uc-blg-0026"></a>
### UC-BLG-0026 — Reject ranking an archived backlog issue

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Rank archived planned work.

**Expected results**

- Archived work cannot be ranked.

Sources: [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125).

Shared business operations: `reorder_backlog`.

Related test files: [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

<a id="uc-blg-0027"></a>
### UC-BLG-0027 — Reject an active-board reorder anchor

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Choose a neighbor outside backlog.

**Expected results**

- The anchor must be a current backlog issue.

Sources: [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125).

Shared business operations: `reorder_backlog`.

Related test files: [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

<a id="uc-blg-0028"></a>
### UC-BLG-0028 — Reject a foreign-project reorder anchor

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Choose a neighbor in another project.

**Expected results**

- The anchor is unavailable in this scoped operation.

Sources: [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125).

Shared business operations: `reorder_backlog`.

Related test files: [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

<a id="uc-blg-0029"></a>
### UC-BLG-0029 — Reject a stale backlog order

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Reorder using an earlier backlog-order revision.

**Expected results**

- Conflict requires reloading current planning order.

Sources: [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125), [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Shared business operations: `reorder_backlog`.

Related test files: [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-backlog-native-validation.spec.ts](../../../frontend/e2e/coverage-backlog-native-validation.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-blg-0030"></a>
### UC-BLG-0030 — Reject a cursor after backlog ordering changes

Actor: `reader` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Continue pagination using a cursor from an older backlog order.

**Expected results**

- The signed cursor scope refuses stale ordering.

Sources: [backend/internal/features/issues/backlog.go:63](../../../backend/internal/features/issues/backlog.go#L63), [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Shared business operations: `list_backlog`.

Related test files: [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-backlog-native-validation.spec.ts](../../../frontend/e2e/coverage-backlog-native-validation.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-blg-0031"></a>
### UC-BLG-0031 — Retry uncertain backlog creation

Actor: `writer` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Retry after an accepted create response is lost.

**Expected results**

- The frozen original create/reference resolves to one backlog issue.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Shared business operations: `create_issue_v2`.

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

<a id="uc-blg-0032"></a>
### UC-BLG-0032 — Retain one created issue during upload retry

Actor: `writer` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Retry after issue creation succeeds but a queued upload fails.

**Expected results**

- The existing issue ID is reused instead of issuing another create.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Shared business operations: `create_issue_v2`.

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

Related cases: [UC-BLG-0031](../features/backlog.md#uc-blg-0031), [UC-AST-0063](../features/assets.md#uc-ast-0063).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BLG-0031, UC-AST-0063.

<a id="uc-blg-0033"></a>
### UC-BLG-0033 — Ignore another project's delayed creation

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Navigate to another project before the old create returns.

**Expected results**

- The old result cannot mark or upload the destination project's draft.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

<a id="uc-blg-0034"></a>
### UC-BLG-0034 — Replace backlog context on project navigation

Actor: `reader` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Navigate to another project's backlog while a read is pending.

**Expected results**

- Old lists, selection and pending commands reset; stale replies are ignored.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts).

<a id="uc-blg-0035"></a>
### UC-BLG-0035 — Bound backlog rank maintenance

Actor: `writer` · Kind: `performance` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Reorder a dense ranking whose required rebalance exceeds the service bound.

**Expected results**

- A safe failure refuses unbounded rebalance work.

Sources: [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125), [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Shared business operations: `reorder_backlog`.

Related test files: [backlog_import_test.go](../../../backend/internal/features/issues/backlog_import_test.go), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-blg-0036"></a>
### UC-BLG-0036 — Retain Arabic planned titles

Actor: `writer` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Create and read planned work with Arabic text.

**Expected results**

- The exact title remains readable with automatic direction.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Shared business operations: `create_issue_v2`, `list_backlog`.

Related test files: [backlog-planning.spec.ts](../../../frontend/e2e/backlog-planning.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-BLG-0041](../features/backlog.md#uc-blg-0041).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BLG-0041.

<a id="uc-blg-0037"></a>
### UC-BLG-0037 — Read another backlog cursor page

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request a bounded backlog page and its signed continuation.

**Expected results**

- The next distinct issue summaries retain ranked order, total and current order revision.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236), [backend/internal/features/issues/backlog.go:63](../../../backend/internal/features/issues/backlog.go#L63).

Shared business operations: `list_backlog`.

Related test files: [coverage-boards.spec.ts](../../../frontend/e2e/coverage-boards.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-BLG-0004](../features/backlog.md#uc-blg-0004).

Note: Atomic service outcome separated from native UI case UC-BLG-0004.

<a id="uc-blg-0038"></a>
### UC-BLG-0038 — Persist backlog rank before a neighbor

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Submit a revision-aware backlog reorder before another current planned issue.

**Expected results**

- A fresh backlog read retains the requested order without changing issue content or active-board rank.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236), [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125).

Shared business operations: `reorder_backlog`.

Related test files: [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-BLG-0009](../features/backlog.md#uc-blg-0009).

Note: Atomic service outcome separated from native UI case UC-BLG-0009.

<a id="uc-blg-0039"></a>
### UC-BLG-0039 — Persist backlog rank after a neighbor

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Submit a revision-aware backlog reorder after another current planned issue.

**Expected results**

- A fresh backlog read retains the requested order without changing issue content or active-board rank.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236), [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125).

Shared business operations: `reorder_backlog`.

Related test files: [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-BLG-0011](../features/backlog.md#uc-blg-0011).

Note: Atomic service outcome separated from native UI case UC-BLG-0011.

<a id="uc-blg-0040"></a>
### UC-BLG-0040 — Enforce viewer backlog service access

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Read planned work as a viewer and attempt planned issue creation or activation.

**Expected results**

- The authorized read succeeds while current write permission rejects creation and activation.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236), [backend/internal/features/issues/backlog.go:125](../../../backend/internal/features/issues/backlog.go#L125).

Shared business operations: `list_backlog`.

Related test files: [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-BLG-0021](../features/backlog.md#uc-blg-0021).

Note: Atomic service outcome separated from native UI case UC-BLG-0021.

<a id="uc-blg-0041"></a>
### UC-BLG-0041 — Retain Arabic planned text through service

Actor: `writer` · Kind: `localization` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Create planned work with an Arabic title and read the stored ranked issue.

**Expected results**

- The exact Unicode title and backlog identity persist.

Sources: [frontend/src/app/features/issues/pages/backlog/backlog.page.ts:236](../../../frontend/src/app/features/issues/pages/backlog/backlog.page.ts#L236).

Shared business operations: `create_issue_v2`, `list_backlog`.

Related test files: [coverage-boards.spec.ts](../../../frontend/e2e/coverage-boards.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-BLG-0036](../features/backlog.md#uc-blg-0036).

Note: Atomic service outcome separated from native UI case UC-BLG-0036.
