# Boards, columns, card movement and filters

Current independent Kanban boards. Workflow/stage definitions belong to workflows; this area owns column mapping, board-local ranks and WIP. Existing test references are evidence locations, not fresh pass claims.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `page`: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82)
- `template`: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html:1](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html#L1)
- `settings`: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78)
- `store`: [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34)
- `layout`: [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65)
- `movement`: [backend/internal/features/boards/movement.go:83](../../../backend/internal/features/boards/movement.go#L83)
- `wip`: [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12)
- `filters`: [frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts:36](../../../frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts#L36)
- `quickFilters`: [frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts:227](../../../frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts#L227)
- `card`: [frontend/src/app/features/boards/components/native-issue-card/native-issue-card.component.ts:13](../../../frontend/src/app/features/boards/components/native-issue-card/native-issue-card.component.ts#L13)
- `lifecycle`: [backend/internal/features/boards/service.go:500](../../../backend/internal/features/boards/service.go#L500)
- `nativeMcp`: [backend/internal/features/boards/native_mcp.go:10](../../../backend/internal/features/boards/native_mcp.go#L10)
- `directory`: [backend/internal/features/boards/reads.go:105](../../../backend/internal/features/boards/reads.go#L105)
- `assigneePicker`: [frontend/src/app/features/boards/components/board-assignee-picker/board-assignee-picker.component.ts:1](../../../frontend/src/app/features/boards/components/board-assignee-picker/board-assignee-picker.component.ts#L1)

## Cases

<a id="uc-brd-0001"></a>
### UC-BRD-0001 — List project boards

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Open the project's Boards page.

**Expected results**

- Accessible named boards show creator and archive state.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/reads.go:105](../../../backend/internal/features/boards/reads.go#L105).

Shared business operations: `list_boards`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0002"></a>
### UC-BRD-0002 — Page through project boards

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose to load more project boards.

**Expected results**

- The next cursor page appends to the directory.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/reads.go:105](../../../backend/internal/features/boards/reads.go#L105).

Shared business operations: `list_boards`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-BRD-0095](../features/boards.md#uc-brd-0095).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BRD-0095.

<a id="uc-brd-0003"></a>
### UC-BRD-0003 — Create an independent board

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Enter a valid board name and create it.

**Expected results**

- A new board appears with default stage mappings and independent card ordering.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65).

Shared business operations: `create_board_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0004"></a>
### UC-BRD-0004 — Open the Kanban board

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Open an accessible board.

**Expected results**

- Ordered columns and full saved-view counts appear with bounded card pages.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-surface-followup.spec.ts](../../../frontend/e2e/coverage-board-surface-followup.spec.ts).

<a id="uc-brd-0005"></a>
### UC-BRD-0005 — Rename a board

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Actor is the eligible board creator; board and project are active.
- Actor can manage this active board.

**Steps**

1. Save a changed name on a board the actor created.

**Expected results**

- The new board name survives reload.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0006"></a>
### UC-BRD-0006 — Add a board column

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Actor can manage this active board.

**Steps**

1. Add and save a new column on a manageable board.

**Expected results**

- The independently identified column appears after reload.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0007"></a>
### UC-BRD-0007 — Rename a board column

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Actor can manage this active board.

**Steps**

1. Save a new column name.

**Expected results**

- Its heading changes without renaming mapped workflow stages.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0008"></a>
### UC-BRD-0008 — Move a column earlier

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Actor can manage this active board; the column has a neighbor in the requested direction.
- Actor can manage this active board.

**Steps**

1. Use the column's earlier control and save the layout.

**Expected results**

- The new column order survives reload.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-BRD-0096](../features/boards.md#uc-brd-0096).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BRD-0096.

<a id="uc-brd-0009"></a>
### UC-BRD-0009 — Move a column later

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Actor can manage this active board; the column has a neighbor in the requested direction.
- Actor can manage this active board.

**Steps**

1. Use the column's later control and save the layout.

**Expected results**

- The new column order survives reload.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-BRD-0097](../features/boards.md#uc-brd-0097).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BRD-0097.

<a id="uc-brd-0010"></a>
### UC-BRD-0010 — Remove a board column

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Actor can manage this board; at least two columns exist; required default-board coverage remains.
- Actor can manage this active board.

**Steps**

1. Remove a column and save a valid remaining layout.

**Expected results**

- The removed column is absent; issues retain their workflow stages.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0011"></a>
### UC-BRD-0011 — Group stages in a column

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Actor can manage this active board; selected stages belong to the project.
- Actor can manage this active board.

**Steps**

1. Select several stages for one column and save.

**Expected results**

- Issues at those stages display together in that column.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

<a id="uc-brd-0012"></a>
### UC-BRD-0012 — Map stages from several workflows

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Actor can manage this active board; multiple project workflows exist.
- Actor can manage this active board.

**Steps**

1. Map project stages from different workflows into one column.

**Expected results**

- Column grouping retains each issue's assigned workflow.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

<a id="uc-brd-0013"></a>
### UC-BRD-0013 — Save a permanent board view

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Actor can manage this active nondefault board.
- Actor can manage this active board.

**Steps**

1. Change a nondefault board's saved filters and save its layout.

**Expected results**

- Future board reads start from the restricted saved view.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0014"></a>
### UC-BRD-0014 — Set a warning WIP limit

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Save a warning limit below the column's saved-view occupancy.

**Expected results**

- The full-view excess is indicated while eligible moves remain permitted.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html:1](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html#L1).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0015"></a>
### UC-BRD-0015 — Set a hard WIP limit

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Save a valid hard capacity for the column.

**Expected results**

- Later occupancy-increasing writes are subject to the saved-view capacity.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0016"></a>
### UC-BRD-0016 — Clear a warning WIP limit

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Clear the warning limit and save.

**Expected results**

- The column has no warning threshold.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0017"></a>
### UC-BRD-0017 — Archive a nondefault board

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Archive a board the actor can manage.

**Expected results**

- The board remains readable and becomes read-only.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/service.go:500](../../../backend/internal/features/boards/service.go#L500).

Shared business operations: `archive_board`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0018"></a>
### UC-BRD-0018 — Restore an archived board

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Restore an archived manageable board.

**Expected results**

- Eligible board writes become available again.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/service.go:500](../../../backend/internal/features/boards/service.go#L500).

Shared business operations: `restore_board`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0019"></a>
### UC-BRD-0019 — Search the board by number

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Type an issue number in the board search input.

**Expected results**

- Matching cards update after the short typing debounce without a search-button click.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

Related cases: [UC-BRD-0098](../features/boards.md#uc-brd-0098).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BRD-0098.

<a id="uc-brd-0020"></a>
### UC-BRD-0020 — Search the board by key

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Type a full issue key in the board search input.

**Expected results**

- Matching cards update after the short typing debounce without a search-button click.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

Related cases: [UC-BRD-0099](../features/boards.md#uc-brd-0099).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BRD-0099.

<a id="uc-brd-0021"></a>
### UC-BRD-0021 — Search the board by title

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Type title text in the board search input.

**Expected results**

- Matching cards update after the short typing debounce without a search-button click.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-BRD-0100](../features/boards.md#uc-brd-0100).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BRD-0100.

<a id="uc-brd-0022"></a>
### UC-BRD-0022 — Search Arabic board titles

Actor: `reader` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Type Arabic title text.

**Expected results**

- Matching Arabic issues appear with readable bidirectional text.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html:1](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html#L1).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

Related cases: [UC-BRD-0101](../features/boards.md#uc-brd-0101).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BRD-0101.

<a id="uc-brd-0023"></a>
### UC-BRD-0023 — Show only my work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Enable Only my issues.

**Expected results**

- Temporary results contain the signed-in actor's assigned work within the saved view.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0024"></a>
### UC-BRD-0024 — Filter by stage category

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose one stage category.

**Expected results**

- Only cards in that category remain.

Sources: [frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts:36](../../../frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts#L36), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0025"></a>
### UC-BRD-0025 — Filter by issue types

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose issue type IDs.

**Expected results**

- Only cards matching the chosen types remain.

Sources: [frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts:36](../../../frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts#L36), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0026"></a>
### UC-BRD-0026 — Filter by priorities

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose priority IDs.

**Expected results**

- Only cards matching the chosen priorities remain.

Sources: [frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts:36](../../../frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts#L36), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0027"></a>
### UC-BRD-0027 — Filter unassigned work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose Unassigned.

**Expected results**

- Only unassigned matching cards remain.

Sources: [frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts:36](../../../frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts#L36), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0028"></a>
### UC-BRD-0028 — Filter a specific teammate

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose Specific teammate and select an eligible user.

**Expected results**

- Only that teammate's matching cards remain.

Sources: [frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts:36](../../../frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts#L36), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0029"></a>
### UC-BRD-0029 — Filter blocked work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose Blocked.

**Expected results**

- Only cards with unfinished blockers remain.

Sources: [frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts:36](../../../frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts#L36), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0030"></a>
### UC-BRD-0030 — Filter unblocked work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose Unblocked.

**Expected results**

- Only cards without unfinished blockers remain.

Sources: [frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts:36](../../../frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts#L36), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0031"></a>
### UC-BRD-0031 — Filter a due-date range

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Set valid Due from and Due through dates.

**Expected results**

- Only matching due-date cards remain.

Sources: [frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts:36](../../../frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts#L36), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0032"></a>
### UC-BRD-0032 — Filter overdue work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose Overdue.

**Expected results**

- Only currently overdue matching cards remain.

Sources: [frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts:36](../../../frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts#L36), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0033"></a>
### UC-BRD-0033 — Filter work that is not overdue

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose Not overdue.

**Expected results**

- Results apply the server's current non-overdue predicate.

Sources: [frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts:36](../../../frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts#L36), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0034"></a>
### UC-BRD-0034 — Filter by parent

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose a parent issue.

**Expected results**

- Results contain matching children of that parent.

Sources: [frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts:36](../../../frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts#L36), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0035"></a>
### UC-BRD-0035 — Filter by labels

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose label IDs.

**Expected results**

- The selected labels narrow the board's saved view.

Sources: [frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts:36](../../../frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts#L36), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0036"></a>
### UC-BRD-0036 — Search board assignee choices

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Type a teammate name in the assignment picker.

**Expected results**

- Eligible choices update as typed and cursor pages can be loaded.

Sources: [frontend/src/app/features/boards/components/board-assignee-picker/board-assignee-picker.component.ts:1](../../../frontend/src/app/features/boards/components/board-assignee-picker/board-assignee-picker.component.ts#L1).

Shared business operations: `list_assignees`.

Related test files: [board-grouping-quick-filters.spec.ts](../../../frontend/e2e/board-grouping-quick-filters.spec.ts).

Related cases: [UC-ISS-0197](../features/issues.md#uc-iss-0197), [UC-PRJ-0056](../features/projects.md#uc-prj-0056).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-ISS-0197, UC-PRJ-0056.

<a id="uc-brd-0037"></a>
### UC-BRD-0037 — Clear temporary filters

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose Clear filters.

**Expected results**

- The board returns to its permanent saved view.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-surface-followup.spec.ts](../../../frontend/e2e/coverage-board-surface-followup.spec.ts).

Related cases: [UC-BRD-0004](../features/boards.md#uc-brd-0004), [UC-BRD-0013](../features/boards.md#uc-brd-0013).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BRD-0004, UC-BRD-0013.

<a id="uc-brd-0038"></a>
### UC-BRD-0038 — Save a personal quick filter

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Name and save the board's current temporary filter.

**Expected results**

- A personal quick-filter button becomes available on boards in this project.

Sources: [frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts:227](../../../frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts#L227).

Shared business operations: `save_issue_search`.

Related test files: [board-grouping-quick-filters.spec.ts](../../../frontend/e2e/board-grouping-quick-filters.spec.ts).

Related cases: [UC-ISS-0144](../features/issues.md#uc-iss-0144).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-ISS-0144.

<a id="uc-brd-0039"></a>
### UC-BRD-0039 — Update a same-named personal quick filter

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Save current filters using an existing personal filter's exact name.

**Expected results**

- That filter's criteria update at its current revision.

Sources: [frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts:227](../../../frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts#L227).

Shared business operations: `save_issue_search`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

Related cases: [UC-ISS-0146](../features/issues.md#uc-iss-0146).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-ISS-0146.

<a id="uc-brd-0040"></a>
### UC-BRD-0040 — Apply a personal quick filter

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose an inactive personal quick-filter button.

**Expected results**

- Stored filter values narrow this board's saved view.

Sources: [frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts:227](../../../frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts#L227).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0041"></a>
### UC-BRD-0041 — Toggle off an active quick filter

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose the already active quick-filter button.

**Expected results**

- Temporary filters clear.

Sources: [frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts:227](../../../frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts#L227).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0042"></a>
### UC-BRD-0042 — Remove a personal quick filter

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Remove a saved personal quick filter.

**Expected results**

- The removed filter no longer appears as an active choice.

Sources: [frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts:227](../../../frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts#L227).

Shared business operations: `save_issue_search`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-surface-followup.spec.ts](../../../frontend/e2e/coverage-board-surface-followup.spec.ts).

<a id="uc-brd-0043"></a>
### UC-BRD-0043 — Keep quick filters private

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Read quick filters while signed in as a different project user.

**Expected results**

- Another user's personal filter is not disclosed.

Sources: [frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts:227](../../../frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts#L227).

Shared business operations: `list_saved_searches`.

Related test files: [board-grouping-quick-filters.spec.ts](../../../frontend/e2e/board-grouping-quick-filters.spec.ts), [coverage-board-surface-followup.spec.ts](../../../frontend/e2e/coverage-board-surface-followup.spec.ts).

<a id="uc-brd-0044"></a>
### UC-BRD-0044 — Group cards by assignee

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose assignee in Group by.

**Expected results**

- Loaded cards partition into matching lanes with an explicit unassigned/no-epic lane.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html:1](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html#L1).

Related test files: [board-grouping-quick-filters.spec.ts](../../../frontend/e2e/board-grouping-quick-filters.spec.ts).

<a id="uc-brd-0045"></a>
### UC-BRD-0045 — Group cards by epic

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose epic in Group by.

**Expected results**

- Loaded cards partition into matching lanes with an explicit unassigned/no-epic lane.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html:1](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html#L1).

Related test files: [board-grouping-quick-filters.spec.ts](../../../frontend/e2e/board-grouping-quick-filters.spec.ts).

<a id="uc-brd-0046"></a>
### UC-BRD-0046 — Collapse a swimlane

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Collapse one grouped lane.

**Expected results**

- Only that lane's card cells change visibility; shared column state remains.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html:1](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html#L1).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0047"></a>
### UC-BRD-0047 — Expand a swimlane

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Expand one grouped lane.

**Expected results**

- Only that lane's card cells change visibility; shared column state remains.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html:1](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html#L1).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0048"></a>
### UC-BRD-0048 — Move a card by drag and drop

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Drag a card into a column with one eligible destination stage.

**Expected results**

- The stage changes through the authoritative workflow and board refreshes.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [backend/internal/features/boards/movement.go:83](../../../backend/internal/features/boards/movement.go#L83).

Shared business operations: `move_board_card_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

Related cases: [UC-BRD-0102](../features/boards.md#uc-brd-0102).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BRD-0102.

<a id="uc-brd-0049"></a>
### UC-BRD-0049 — Choose an ambiguous destination stage

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Drop a card into a column with several eligible stages.

**Expected results**

- A chooser requests an explicit destination instead of guessing.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [backend/internal/features/boards/movement.go:83](../../../backend/internal/features/boards/movement.go#L83).

Shared business operations: `list_issue_transitions_v2`, `move_board_card_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

Related cases: [UC-BRD-0103](../features/boards.md#uc-brd-0103).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BRD-0103.

<a id="uc-brd-0050"></a>
### UC-BRD-0050 — Cancel a destination chooser

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Cancel the stage chooser.

**Expected results**

- No movement is committed.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0051"></a>
### UC-BRD-0051 — Move through the card menu

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Select a destination in a card's Move controls.

**Expected results**

- The move follows the same stage eligibility and completion guards as dragging.

Sources: [frontend/src/app/features/boards/components/native-issue-card/native-issue-card.component.ts:13](../../../frontend/src/app/features/boards/components/native-issue-card/native-issue-card.component.ts#L13), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [backend/internal/features/boards/movement.go:83](../../../backend/internal/features/boards/movement.go#L83).

Shared business operations: `move_board_card_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

Related cases: [UC-BRD-0102](../features/boards.md#uc-brd-0102).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BRD-0102.

<a id="uc-brd-0052"></a>
### UC-BRD-0052 — Reorder a card before a neighbor

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Choose a loaded same-column neighbor and Move before.

**Expected results**

- Only this board's card order changes; issue content and another board's rank remain unchanged.

Sources: [frontend/src/app/features/boards/components/native-issue-card/native-issue-card.component.ts:13](../../../frontend/src/app/features/boards/components/native-issue-card/native-issue-card.component.ts#L13), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34), [backend/internal/features/boards/movement.go:83](../../../backend/internal/features/boards/movement.go#L83).

Shared business operations: `reorder_board_card_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0053"></a>
### UC-BRD-0053 — Reorder a card after a neighbor

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Choose a loaded same-column neighbor and Move after.

**Expected results**

- Only this board's card order changes; issue content and another board's rank remain unchanged.

Sources: [frontend/src/app/features/boards/components/native-issue-card/native-issue-card.component.ts:13](../../../frontend/src/app/features/boards/components/native-issue-card/native-issue-card.component.ts#L13), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34), [backend/internal/features/boards/movement.go:83](../../../backend/internal/features/boards/movement.go#L83).

Shared business operations: `reorder_board_card_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0054"></a>
### UC-BRD-0054 — Open an issue drawer from a card

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Click a card body, title or issue key.

**Expected results**

- The selected issue opens in the board drawer.

Sources: [frontend/src/app/features/boards/components/native-issue-card/native-issue-card.component.ts:13](../../../frontend/src/app/features/boards/components/native-issue-card/native-issue-card.component.ts#L13), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0055"></a>
### UC-BRD-0055 — Open a card in another tab

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Use a modified click on its issue link.

**Expected results**

- The normal link opens the issue separately instead of forcing a drawer.

Sources: [frontend/src/app/features/boards/components/native-issue-card/native-issue-card.component.ts:13](../../../frontend/src/app/features/boards/components/native-issue-card/native-issue-card.component.ts#L13).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0056"></a>
### UC-BRD-0056 — Open a full issue from the drawer

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose Open full issue.

**Expected results**

- The dedicated issue route opens.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html:1](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html#L1).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0057"></a>
### UC-BRD-0057 — Close an issue drawer

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Close the drawer after saving issue changes.

**Expected results**

- The board refreshes to reflect saved issue data.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0058"></a>
### UC-BRD-0058 — Create an issue from the board

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Complete the board Create issue form.

**Expected results**

- The issue is created once, queued uploads finish, and its drawer opens.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82).

Shared business operations: `create_issue_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

Related cases: [UC-ISS-0022](../features/issues.md#uc-iss-0022), [UC-AST-0060](../features/assets.md#uc-ast-0060), [UC-AST-0063](../features/assets.md#uc-ast-0063).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-ISS-0022, UC-AST-0060, UC-AST-0063.

<a id="uc-brd-0059"></a>
### UC-BRD-0059 — Cancel board issue creation

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Cancel issue creation and resolve any dirty-draft prompt.

**Expected results**

- No new issue is created; focus returns to the create trigger.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0060"></a>
### UC-BRD-0060 — Read a board as a viewer

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Open a board using viewer project access.

**Expected results**

- Cards can be read while creation, dragging and mutation controls are unavailable.

Sources: [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html:1](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html#L1).

Shared business operations: `get_board_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

Related cases: [UC-BRD-0104](../features/boards.md#uc-brd-0104).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BRD-0104.

<a id="uc-brd-0061"></a>
### UC-BRD-0061 — Reject layout edit by a nonmanager

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Submit a layout save for a board another user owns.

**Expected results**

- The server refuses mutation unless the actor has project administration authority.

Sources: [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65), [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-brd-0062"></a>
### UC-BRD-0062 — Reject board writes while archived

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Submit a card move against an archived board.

**Expected results**

- The server refuses the move.

Sources: [backend/internal/features/boards/movement.go:83](../../../backend/internal/features/boards/movement.go#L83), [frontend/src/app/features/boards/components/native-issue-card/native-issue-card.component.ts:13](../../../frontend/src/app/features/boards/components/native-issue-card/native-issue-card.component.ts#L13), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `move_board_card_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-brd-0063"></a>
### UC-BRD-0063 — Reject duplicate column identifiers

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Submit two columns with the same ID.

**Expected results**

- Layout validation rejects the duplicate ID.

Sources: [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65), [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0064"></a>
### UC-BRD-0064 — Reject duplicate column names

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Submit case-insensitively duplicate trimmed column names.

**Expected results**

- Layout validation rejects the duplicate name.

Sources: [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65), [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12), [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-brd-0065"></a>
### UC-BRD-0065 — Reject a stage mapped twice

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Map the same stage into two columns.

**Expected results**

- Layout validation rejects repeated stage ownership.

Sources: [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65), [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12), [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-brd-0066"></a>
### UC-BRD-0066 — Reject a foreign-project stage mapping

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Map a stage belonging to another project.

**Expected results**

- Layout validation refuses the foreign stage.

Sources: [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65), [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0067"></a>
### UC-BRD-0067 — Keep at least one column

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Submit a layout containing no columns.

**Expected results**

- Layout validation refuses an empty board.

Sources: [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65), [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0068"></a>
### UC-BRD-0068 — Protect default-board name

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Rename the default All Issues board.

**Expected results**

- The protected default name is retained.

Sources: [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65), [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0069"></a>
### UC-BRD-0069 — Protect default-board saved view

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Restrict the default board with permanent filters.

**Expected results**

- The unrestricted default saved view is retained.

Sources: [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65), [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0070"></a>
### UC-BRD-0070 — Protect required default stage coverage

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Omit an intake or occupied stage from the default board.

**Expected results**

- Saving is rejected until required coverage is restored.

Sources: [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65), [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12), [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-brd-0071"></a>
### UC-BRD-0071 — Reject hard capacity below occupancy

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Save a hard limit below the full saved-view count.

**Expected results**

- The layout transaction is rejected.

Sources: [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65), [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12), [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-brd-0072"></a>
### UC-BRD-0072 — Reject hard capacity without a limit

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Select hard-block mode with no numeric limit.

**Expected results**

- The layout is rejected.

Sources: [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65), [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12), [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-brd-0073"></a>
### UC-BRD-0073 — Reject relative hard-capacity filters

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Save a hard board using actor-relative or time-relative filters.

**Expected results**

- Validation requires deterministic issue-owned filters.

Sources: [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65), [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12), [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-brd-0074"></a>
### UC-BRD-0074 — Reject blocked hard-capacity filters

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Save a hard board using blocked or prerequisite-derived criteria.

**Expected results**

- Validation refuses capacity dependent on other work.

Sources: [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65), [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12), [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-brd-0075"></a>
### UC-BRD-0075 — Reject an invalid WIP threshold

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Submit a WIP limit outside 1–1000.

**Expected results**

- Validation rejects the threshold.

Sources: [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65), [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12), [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Shared business operations: `save_board_layout_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-brd-0076"></a>
### UC-BRD-0076 — Protect the default board from archive

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Attempt to archive the default board.

**Expected results**

- The default board remains active.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/service.go:500](../../../backend/internal/features/boards/service.go#L500).

Shared business operations: `archive_board`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0077"></a>
### UC-BRD-0077 — Reject an ineligible workflow destination

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Drop into a column with no eligible transition.

**Expected results**

- A visible explanation appears and no issue stage changes.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [backend/internal/features/boards/movement.go:83](../../../backend/internal/features/boards/movement.go#L83).

Shared business operations: `move_board_card_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

Related cases: [UC-BRD-0105](../features/boards.md#uc-brd-0105).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BRD-0105.

<a id="uc-brd-0078"></a>
### UC-BRD-0078 — Show unfinished completion prerequisites

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Move an issue to Done while blockers or required child work remain unfinished.

**Expected results**

- The move fails and unfinished prerequisite links can be read and paged.

Sources: [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html:1](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html#L1).

Shared business operations: `move_board_card_v2`, `search_issues_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-surface-followup.spec.ts](../../../frontend/e2e/coverage-board-surface-followup.spec.ts).

<a id="uc-brd-0079"></a>
### UC-BRD-0079 — Prevent cross-swimlane ownership changes

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Drag between different assignee or epic lanes.

**Expected results**

- The drop does not implicitly change assignee or epic.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0080"></a>
### UC-BRD-0080 — Retry an uncertain original move

Actor: `writer` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Retry after the move response is lost.

**Expected results**

- The original frozen input and retry reference confirm once without duplicate side effects.

Sources: [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34), [backend/internal/features/boards/movement.go:83](../../../backend/internal/features/boards/movement.go#L83).

Shared business operations: `move_board_card_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0081"></a>
### UC-BRD-0081 — Reject stale card/order revisions

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Move using an issue, layout or column revision changed by another actor.

**Expected results**

- A typed conflict prevents overwriting newer state.

Sources: [backend/internal/features/boards/movement.go:83](../../../backend/internal/features/boards/movement.go#L83).

Shared business operations: `move_board_card_v2`, `reorder_board_card_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-brd-0082"></a>
### UC-BRD-0082 — Review conflicting board settings

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Review current settings after a stale layout save.

**Expected results**

- The local draft remains for explicit review and a new revision-aware save.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Shared business operations: `save_board_layout_v2`.

Related test files: [board-editor-rich-text.spec.ts](../../../frontend/e2e/board-editor-rich-text.spec.ts).

Related cases: [UC-BRD-0106](../features/boards.md#uc-brd-0106).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-BRD-0106.

<a id="uc-brd-0083"></a>
### UC-BRD-0083 — Serialize the final hard-WIP slot

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Compete with another writer for a column's final hard-capacity slot.

**Expected results**

- Only capacity-valid occupancy commits.

Sources: [backend/internal/features/boards/wip.go:12](../../../backend/internal/features/boards/wip.go#L12).

Shared business operations: `move_board_card_v2`.

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

<a id="uc-brd-0084"></a>
### UC-BRD-0084 — Close board popups by keyboard

Actor: `reader` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Press Escape in filters or quick-filter management.

**Expected results**

- The popup closes and focus returns to its summary trigger.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts:227](../../../frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts#L227).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0085"></a>
### UC-BRD-0085 — Jump to a distant board column

Actor: `reader` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Choose a column using Jump to column on a narrow screen.

**Expected results**

- The requested column scrolls into view.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html:1](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html#L1).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0086"></a>
### UC-BRD-0086 — Bound initial board loading

Actor: `reader` · Kind: `performance` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Open a many-column board.

**Expected results**

- Initial fan-out covers the first four columns with at most three concurrent card loaders.

Sources: [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Related test files: [performance.spec.ts](../../../frontend/e2e/performance.spec.ts).

<a id="uc-brd-0087"></a>
### UC-BRD-0087 — Load later columns when visible

Actor: `reader` · Kind: `performance` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Scroll an unloaded later column into view.

**Expected results**

- Its card page loads on demand.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0088"></a>
### UC-BRD-0088 — Bound a paged column to 200 cards

Actor: `reader` · Kind: `performance` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Load enough column pages to exceed 200 unique loaded cards.

**Expected results**

- The latest 200-card window remains with a skipped-window notice and continuing cursor.

Sources: [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html:1](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html#L1).

Related test files: [board-grouping-quick-filters.spec.ts](../../../frontend/e2e/board-grouping-quick-filters.spec.ts).

<a id="uc-brd-0089"></a>
### UC-BRD-0089 — Partition grouped windows without duplication

Actor: `reader` · Kind: `performance` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Group a column after paging its cards.

**Expected results**

- Each loaded issue belongs to one lane while sharing the same bounded column window.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Related test files: [board-grouping-quick-filters.spec.ts](../../../frontend/e2e/board-grouping-quick-filters.spec.ts).

<a id="uc-brd-0090"></a>
### UC-BRD-0090 — Reveal a moved card in an unloaded destination

Actor: `writer` · Kind: `performance` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Move to a later previously unloaded column.

**Expected results**

- The target column explicitly loads after the confirmed move.

Sources: [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0091"></a>
### UC-BRD-0091 — Defer refresh during local work

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Keep a draft, drag or modal open while foreground refresh becomes due.

**Expected results**

- Refresh waits until the interaction is safe.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82).

Related test files: [daily-workflow.spec.ts](../../../frontend/e2e/daily-workflow.spec.ts).

<a id="uc-brd-0092"></a>
### UC-BRD-0092 — Discard superseded board reads

Actor: `reader` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Change board/filter context while an older request is pending.

**Expected results**

- Generation, abort and session checks stop older results from replacing the current board.

Sources: [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Related test files: [modern-boards.spec.ts](../../../frontend/e2e/modern-boards.spec.ts).

<a id="uc-brd-0093"></a>
### UC-BRD-0093 — Clear old quick-filter success during a new save

Actor: `reader` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Start a second quick-filter save after a previous successful save, and delay its acknowledgement.

**Expected results**

- The previous success notice clears while the second request is pending; its action stays disabled, and the new success appears only after acknowledgement.

Sources: [frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts:227](../../../frontend/src/app/features/boards/components/board-quick-filters/board-quick-filters.component.ts#L227).

Related test files: [coverage-boards.spec.ts](../../../frontend/e2e/coverage-boards.spec.ts).

Gaps: [GAP-BRD-001](../gaps.md#gap-brd-001).

Note: Reproduced stale success feedback in the browser; the send path now clears its notice before each request.

Note: Implementation status is separate from the first-attempt runtime evidence ledger.

<a id="uc-brd-0094"></a>
### UC-BRD-0094 — Debounce expanded board query typing

Actor: `reader` · Kind: `performance` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Rapidly type a query in the expanded board filter.

**Expected results**

- The complete final text is retained and one query read begins after the 120 ms debounce; discrete choice filters remain immediate.

Sources: [frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts:36](../../../frontend/src/app/features/boards/components/native-board-filters/native-board-filters.component.ts#L36), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82).

Related test files: [coverage-boards.spec.ts](../../../frontend/e2e/coverage-boards.spec.ts).

Gaps: [GAP-BRD-002](../gaps.md#gap-brd-002).

Note: A 12-character input reproduced 12 metadata requests. The expanded text control now debounces before emitting filters.

Note: Implementation status is separate from the first-attempt runtime evidence ledger.

<a id="uc-brd-0095"></a>
### UC-BRD-0095 — Read another board directory cursor page

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Request a bounded board page, then request its signed next cursor.

**Expected results**

- The later board summaries are distinct, remain project-scoped and include correct continuation metadata.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/reads.go:105](../../../backend/internal/features/boards/reads.go#L105).

Shared business operations: `list_boards`.

Related test files: [coverage-boards.spec.ts](../../../frontend/e2e/coverage-boards.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-BRD-0002](../features/boards.md#uc-brd-0002).

Note: Atomic service outcome separated from native UI case UC-BRD-0002.

<a id="uc-brd-0096"></a>
### UC-BRD-0096 — Persist a column earlier in layout order

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Actor can manage this active board; the column has a neighbor in the requested direction.
- Actor can manage this active board.

**Steps**

1. Submit a valid layout placing an existing column earlier than its neighbor, then read it again.

**Expected results**

- The saved column ID order persists while existing stage mappings retain their identities.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65).

Shared business operations: `save_board_layout_v2`.

Related test files: [coverage-boards.spec.ts](../../../frontend/e2e/coverage-boards.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-BRD-0008](../features/boards.md#uc-brd-0008).

Note: Atomic service outcome separated from native UI case UC-BRD-0008.

<a id="uc-brd-0097"></a>
### UC-BRD-0097 — Persist a column later in layout order

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Actor can manage this active board; the column has a neighbor in the requested direction.
- Actor can manage this active board.

**Steps**

1. Submit a valid layout placing an existing column later than its neighbor, then read it again.

**Expected results**

- The saved column ID order persists while existing stage mappings retain their identities.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78), [backend/internal/features/boards/layout_update.go:65](../../../backend/internal/features/boards/layout_update.go#L65).

Shared business operations: `save_board_layout_v2`.

Related test files: [coverage-boards.spec.ts](../../../frontend/e2e/coverage-boards.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-BRD-0009](../features/boards.md#uc-brd-0009).

Note: Atomic service outcome separated from native UI case UC-BRD-0009.

<a id="uc-brd-0098"></a>
### UC-BRD-0098 — Match board cards by number through service

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Request board card pages using a number query and the current saved view.

**Expected results**

- Only authorized matching issue identities are returned within the permanent saved view.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [coverage-boards.spec.ts](../../../frontend/e2e/coverage-boards.spec.ts), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

Related cases: [UC-BRD-0019](../features/boards.md#uc-brd-0019).

Note: Atomic service outcome separated from native UI case UC-BRD-0019.

<a id="uc-brd-0099"></a>
### UC-BRD-0099 — Match board cards by key through service

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Request board card pages using a key query and the current saved view.

**Expected results**

- Only authorized matching issue identities are returned within the permanent saved view.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [coverage-boards.spec.ts](../../../frontend/e2e/coverage-boards.spec.ts), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

Related cases: [UC-BRD-0020](../features/boards.md#uc-brd-0020).

Note: Atomic service outcome separated from native UI case UC-BRD-0020.

<a id="uc-brd-0100"></a>
### UC-BRD-0100 — Match board cards by title through service

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Request board card pages using a title query and the current saved view.

**Expected results**

- Only authorized matching issue identities are returned within the permanent saved view.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [coverage-boards.spec.ts](../../../frontend/e2e/coverage-boards.spec.ts), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

Related cases: [UC-BRD-0021](../features/boards.md#uc-brd-0021).

Note: Atomic service outcome separated from native UI case UC-BRD-0021.

<a id="uc-brd-0101"></a>
### UC-BRD-0101 — Match board cards by Arabic title through service

Actor: `reader` · Kind: `localization` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Request board card pages using a Arabic title query and the current saved view.

**Expected results**

- Only authorized matching issue identities are returned within the permanent saved view.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html:1](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html#L1).

Shared business operations: `get_board_v2`, `list_board_cards_v2`.

Related test files: [coverage-boards.spec.ts](../../../frontend/e2e/coverage-boards.spec.ts), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

Related cases: [UC-BRD-0022](../features/boards.md#uc-brd-0022).

Note: Atomic service outcome separated from native UI case UC-BRD-0022.

<a id="uc-brd-0102"></a>
### UC-BRD-0102 — Move a board card through an eligible stage

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Submit a revision-aware board-card move to a column with one eligible stage.

**Expected results**

- The issue stage changes through its current workflow and fresh board/card reads expose the accepted destination.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [backend/internal/features/boards/movement.go:83](../../../backend/internal/features/boards/movement.go#L83).

Shared business operations: `move_board_card_v2`.

Related test files: [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-BRD-0048](../features/boards.md#uc-brd-0048).

Note: Atomic service outcome separated from native UI case UC-BRD-0048.

<a id="uc-brd-0103"></a>
### UC-BRD-0103 — Require an explicit ambiguous board destination

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Move into a column with several eligible destinations without a targetStageId, then choose one valid target ID explicitly.

**Expected results**

- The ambiguous command is rejected without changing issue state; an explicit eligible target stage can be committed.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [backend/internal/features/boards/movement.go:83](../../../backend/internal/features/boards/movement.go#L83).

Shared business operations: `list_issue_transitions_v2`, `move_board_card_v2`.

Related test files: [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-BRD-0049](../features/boards.md#uc-brd-0049).

Note: Atomic service outcome separated from native UI case UC-BRD-0049.

<a id="uc-brd-0104"></a>
### UC-BRD-0104 — Enforce viewer access on board service commands

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with access to the project.

**Steps**

1. Read board metadata/cards as a viewer and attempt an issue/card mutation.

**Expected results**

- Authorized board/card reads succeed while current project permission denies the mutation.

Sources: [frontend/src/app/features/boards/modern-boards.store.ts:34](../../../frontend/src/app/features/boards/modern-boards.store.ts#L34), [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html:1](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.html#L1).

Shared business operations: `get_board_v2`.

Related test files: [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-BRD-0060](../features/boards.md#uc-brd-0060).

Note: Atomic service outcome separated from native UI case UC-BRD-0060.

<a id="uc-brd-0105"></a>
### UC-BRD-0105 — Reject an ineligible board-card target

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.

**Steps**

1. Submit a board move into a column with no eligible current-workflow destination.

**Expected results**

- Validation returns a safe failure and the stored issue stage and order remain unchanged.

Sources: [frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts:82](../../../frontend/src/app/features/boards/pages/modern-kanban/modern-kanban.page.ts#L82), [backend/internal/features/boards/movement.go:83](../../../backend/internal/features/boards/movement.go#L83).

Shared business operations: `move_board_card_v2`.

Related test files: [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-BRD-0077](../features/boards.md#uc-brd-0077).

Note: Atomic service outcome separated from native UI case UC-BRD-0077.

<a id="uc-brd-0106"></a>
### UC-BRD-0106 — Reject a stale board-layout revision

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as an eligible writer in an active project.
- Actor can manage this active board.

**Steps**

1. Submit a layout revision already superseded by an accepted configuration change.

**Expected results**

- A typed conflict returns current null with reload_current_state and leaves the accepted layout unchanged.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Shared business operations: `save_board_layout_v2`.

Related test files: [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-BRD-0082](../features/boards.md#uc-brd-0082).

Note: Atomic service outcome separated from native UI case UC-BRD-0082.

Note: Native SaveLayout uses orderConflict: current is null and the client explicitly reloads layout; the error does not embed a current LayoutView.

<a id="uc-brd-0107"></a>
### UC-BRD-0107 — Keep default board name read-only

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with administration access to an active project.

**Steps**

1. Open default-board settings as an administrator.

**Expected results**

- The current board name is enabled for reading but read-only; no native name edit can be submitted.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Related test files: [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts).

Related cases: [UC-BRD-0068](../features/boards.md#uc-brd-0068).

Note: Native prevention counterpart; the related raw service-rejection clause remains unchanged.

<a id="uc-brd-0108"></a>
### UC-BRD-0108 — Hide default board saved-view edits

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with administration access to an active project.

**Steps**

1. Open default-board settings.

**Expected results**

- No Saved view filter editor exists and the accepted default view remains unrestricted.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Related test files: [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts).

Related cases: [UC-BRD-0069](../features/boards.md#uc-brd-0069).

Note: Native prevention counterpart; the related raw service-rejection clause remains unchanged.

<a id="uc-brd-0109"></a>
### UC-BRD-0109 — Prevent removing the final native column

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with administration access to an active project.

**Steps**

1. Remove columns from a named board until one remains.

**Expected results**

- The final column stays visible and its Remove column control is disabled.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Related test files: [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts).

Related cases: [UC-BRD-0067](../features/boards.md#uc-brd-0067).

Note: Native prevention counterpart; the related raw service-rejection clause remains unchanged.

<a id="uc-brd-0110"></a>
### UC-BRD-0110 — Scope native stage mapping choices to this project

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with administration access to an active project.

**Steps**

1. Open workflow and mapped-stage choices while another project has a uniquely named stage.

**Expected results**

- Only current-project workflows and stages are offered; the foreign workflow and stage cannot be selected.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Related test files: [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts).

Related cases: [UC-BRD-0066](../features/boards.md#uc-brd-0066).

Note: Native prevention counterpart; the related raw service-rejection clause remains unchanged.

<a id="uc-brd-0111"></a>
### UC-BRD-0111 — Hide archive controls for the default board

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with administration access to an active project.

**Steps**

1. Open active default-board settings as an administrator.

**Expected results**

- No Archive board or Restore board action appears and the default board remains active.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Related test files: [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts).

Related cases: [UC-BRD-0076](../features/boards.md#uc-brd-0076).

Note: Native prevention counterpart; the related raw service-rejection clause remains unchanged.

<a id="uc-brd-0112"></a>
### UC-BRD-0112 — Generate distinct native column identities

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with administration access to an active project.

**Steps**

1. Add two independent columns through native controls and save.

**Expected results**

- Each column receives a distinct UUID, no raw identifier input exists, and the exact generated identities persist.

Sources: [frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts:78](../../../frontend/src/app/features/boards/pages/modern-board-settings/modern-board-settings.page.ts#L78).

Related test files: [coverage-board-native-validation.spec.ts](../../../frontend/e2e/coverage-board-native-validation.spec.ts).

Related cases: [UC-BRD-0063](../features/boards.md#uc-brd-0063).

Note: Native prevention counterpart; the related raw service-rejection clause remains unchanged.
