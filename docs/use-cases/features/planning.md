# Epics, releases, issue planning and Kanban reports

Current planning groups work into epics/releases and reports actual Kanban completion history. Planning items are not issue hierarchy nodes or Scrum sprints; this catalog does not count roadmap or time-log capabilities as implemented.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `page`: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388)
- `assignment`: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31)
- `assignmentTemplate`: [frontend/src/app/features/planning/issue-planning.component.html:1](../../../frontend/src/app/features/planning/issue-planning.component.html#L1)
- `service`: [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118)
- `setIssue`: [backend/internal/features/planning/service.go:272](../../../backend/internal/features/planning/service.go#L272)
- `report`: [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142)
- `reportPage`: [frontend/src/app/features/planning/kanban-report.page.ts:372](../../../frontend/src/app/features/planning/kanban-report.page.ts#L372)
- `queries`: [backend/internal/features/planning/queries.sql:9](../../../backend/internal/features/planning/queries.sql#L9)
- `normalize`: [backend/internal/features/planning/service.go:28](../../../backend/internal/features/planning/service.go#L28)
- `reads`: [backend/internal/features/planning/reads.go:23](../../../backend/internal/features/planning/reads.go#L23)
- `mcp`: [backend/internal/features/planning/mcp.go:29](../../../backend/internal/features/planning/mcp.go#L29)

## Cases

<a id="uc-pln-0001"></a>
### UC-PLN-0001 — Read project planning

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open the project Planning page.

**Expected results**

- Epics and releases show status, description, target date and linked-issue progress.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388).

Shared business operations: `list_planning_items`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0002"></a>
### UC-PLN-0002 — Read empty project planning

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open planning with no items.

**Expected results**

- An empty state explains creating epics/releases and assigning issues.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388).

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

<a id="uc-pln-0003"></a>
### UC-PLN-0003 — Page through planning items

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Choose Load more planning items.

**Expected results**

- The next cursor page appends.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/reads.go:23](../../../backend/internal/features/planning/reads.go#L23).

Shared business operations: `list_planning_items`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-PLN-0080](../features/planning.md#uc-pln-0080).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-PLN-0080.

<a id="uc-pln-0004"></a>
### UC-PLN-0004 — Create an epic

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Create a planning item of kind epic.

**Expected results**

- The new epic appears in the project.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `create_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0005"></a>
### UC-PLN-0005 — Rename an epic

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Save a changed name for an existing epic.

**Expected results**

- The epic retains identity and linked issues under the new name.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0006"></a>
### UC-PLN-0006 — Edit an epic description

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Save changed description text for an epic.

**Expected results**

- The description persists without modifying issue descriptions.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0007"></a>
### UC-PLN-0007 — Set an epic target date

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Choose and save a valid target date for an epic.

**Expected results**

- The target date appears on its planning card.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-PLN-0083](../features/planning.md#uc-pln-0083).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-PLN-0083.

<a id="uc-pln-0008"></a>
### UC-PLN-0008 — Clear an epic target date

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Clear and save the target date of an epic.

**Expected results**

- The planning card shows no target date.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-PLN-0084](../features/planning.md#uc-pln-0084).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-PLN-0084.

<a id="uc-pln-0009"></a>
### UC-PLN-0009 — Set epic status to planned

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Save planned on the epic.

**Expected results**

- The planning status changes without transitioning its linked issues.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0010"></a>
### UC-PLN-0010 — Set epic status to active

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Save active on the epic.

**Expected results**

- The planning status changes without transitioning its linked issues.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0011"></a>
### UC-PLN-0011 — Set epic status to complete

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Save complete on the epic.

**Expected results**

- The planning status changes without transitioning its linked issues.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0012"></a>
### UC-PLN-0012 — Create a release

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Create a planning item of kind release.

**Expected results**

- The new release appears in the project.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `create_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0013"></a>
### UC-PLN-0013 — Rename a release

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Save a changed name for an existing release.

**Expected results**

- The release retains identity and linked issues under the new name.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0014"></a>
### UC-PLN-0014 — Edit a release description

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Save changed description text for a release.

**Expected results**

- The description persists without modifying issue descriptions.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0015"></a>
### UC-PLN-0015 — Set a release target date

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Choose and save a valid target date for a release.

**Expected results**

- The target date appears on its planning card.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-PLN-0085](../features/planning.md#uc-pln-0085).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-PLN-0085.

<a id="uc-pln-0016"></a>
### UC-PLN-0016 — Clear a release target date

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Clear and save the target date of a release.

**Expected results**

- The planning card shows no target date.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-PLN-0086](../features/planning.md#uc-pln-0086).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-PLN-0086.

<a id="uc-pln-0017"></a>
### UC-PLN-0017 — Set release status to planned

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Save planned on the release.

**Expected results**

- The planning status changes without transitioning its linked issues.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0018"></a>
### UC-PLN-0018 — Set release status to active

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Save active on the release.

**Expected results**

- The planning status changes without transitioning its linked issues.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0019"></a>
### UC-PLN-0019 — Set release status to complete

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Save complete on the release.

**Expected results**

- The planning status changes without transitioning its linked issues.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0020"></a>
### UC-PLN-0020 — Cancel planning item editing

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Cancel an open planning-item form.

**Expected results**

- The editor closes without saving the staged fields.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388).

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

<a id="uc-pln-0021"></a>
### UC-PLN-0021 — Read an epic's issues

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Choose View issues on an epic.

**Expected results**

- Its nonarchived assigned issues appear.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/reads.go:23](../../../backend/internal/features/planning/reads.go#L23).

Shared business operations: `list_planning_issues`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0022"></a>
### UC-PLN-0022 — Read a release's issues

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Choose View issues on a release.

**Expected results**

- Its nonarchived assigned issues appear.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/reads.go:23](../../../backend/internal/features/planning/reads.go#L23).

Shared business operations: `list_planning_issues`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0023"></a>
### UC-PLN-0023 — Page through linked planning work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Choose Load more linked issues.

**Expected results**

- The next bounded page appends to the selected planning item.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/reads.go:23](../../../backend/internal/features/planning/reads.go#L23).

Shared business operations: `list_planning_issues`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-PLN-0081](../features/planning.md#uc-pln-0081).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-PLN-0081.

<a id="uc-pln-0024"></a>
### UC-PLN-0024 — Open a linked planning issue

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Follow an issue in a planning item's issue list.

**Expected results**

- Its dedicated issue route opens.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388).

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

<a id="uc-pln-0025"></a>
### UC-PLN-0025 — Filter planning by epic kind through API

Actor: `reader` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request planning with kind epic.

**Expected results**

- Only epic items are returned with cursor metadata.

Sources: [backend/internal/features/planning/reads.go:23](../../../backend/internal/features/planning/reads.go#L23), [backend/internal/features/planning/mcp.go:29](../../../backend/internal/features/planning/mcp.go#L29).

Shared business operations: `list_planning_items`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0026"></a>
### UC-PLN-0026 — Filter planning by release kind through API

Actor: `reader` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request planning with kind release.

**Expected results**

- Only release items are returned with cursor metadata.

Sources: [backend/internal/features/planning/reads.go:23](../../../backend/internal/features/planning/reads.go#L23), [backend/internal/features/planning/mcp.go:29](../../../backend/internal/features/planning/mcp.go#L29).

Shared business operations: `list_planning_items`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0027"></a>
### UC-PLN-0027 — Read issue planning assignments

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open an issue's Planning section.

**Expected results**

- Current epic/release names and the separate planning revision load.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31), [backend/internal/features/planning/service.go:272](../../../backend/internal/features/planning/service.go#L272).

Shared business operations: `get_issue_planning`.

Related test files: [planning-autosave.spec.ts](../../../frontend/e2e/planning-autosave.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0028"></a>
### UC-PLN-0028 — Assign issue epic immediately

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Choose an epic on the issue.

**Expected results**

- The selection autosaves without a Save button and the other assignment is preserved.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31), [backend/internal/features/planning/service.go:272](../../../backend/internal/features/planning/service.go#L272).

Shared business operations: `set_issue_planning`.

Related test files: [planning-autosave.spec.ts](../../../frontend/e2e/planning-autosave.spec.ts).

Related cases: [UC-PLN-0087](../features/planning.md#uc-pln-0087).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-PLN-0087.

<a id="uc-pln-0029"></a>
### UC-PLN-0029 — Change issue epic

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Choose a different epic.

**Expected results**

- Only the selected planning relationship changes.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31), [backend/internal/features/planning/service.go:272](../../../backend/internal/features/planning/service.go#L272).

Shared business operations: `set_issue_planning`.

Related test files: [planning-autosave.spec.ts](../../../frontend/e2e/planning-autosave.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0030"></a>
### UC-PLN-0030 — Clear issue epic

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Choose None for epic.

**Expected results**

- That relationship clears while the other assignment remains.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31), [backend/internal/features/planning/service.go:272](../../../backend/internal/features/planning/service.go#L272).

Shared business operations: `set_issue_planning`.

Related test files: [planning-autosave.spec.ts](../../../frontend/e2e/planning-autosave.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0031"></a>
### UC-PLN-0031 — Assign issue release immediately

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Choose a release on the issue.

**Expected results**

- The selection autosaves without a Save button and the other assignment is preserved.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31), [backend/internal/features/planning/service.go:272](../../../backend/internal/features/planning/service.go#L272).

Shared business operations: `set_issue_planning`.

Related test files: [planning-autosave.spec.ts](../../../frontend/e2e/planning-autosave.spec.ts).

Related cases: [UC-PLN-0088](../features/planning.md#uc-pln-0088).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-PLN-0088.

<a id="uc-pln-0032"></a>
### UC-PLN-0032 — Change issue release

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Choose a different release.

**Expected results**

- Only the selected planning relationship changes.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31), [backend/internal/features/planning/service.go:272](../../../backend/internal/features/planning/service.go#L272).

Shared business operations: `set_issue_planning`.

Related test files: [planning-autosave.spec.ts](../../../frontend/e2e/planning-autosave.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0033"></a>
### UC-PLN-0033 — Clear issue release

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Choose None for release.

**Expected results**

- That relationship clears while the other assignment remains.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31), [backend/internal/features/planning/service.go:272](../../../backend/internal/features/planning/service.go#L272).

Shared business operations: `set_issue_planning`.

Related test files: [planning-autosave.spec.ts](../../../frontend/e2e/planning-autosave.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0034"></a>
### UC-PLN-0034 — Page issue planning choices

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Load more epics and releases in the issue Planning section.

**Expected results**

- Cursor choices append without duplicate identities; an existing selected value remains visible.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31), [frontend/src/app/features/planning/issue-planning.component.html:1](../../../frontend/src/app/features/planning/issue-planning.component.html#L1).

Shared business operations: `list_planning_items`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

Related cases: [UC-PLN-0080](../features/planning.md#uc-pln-0080), [UC-PLN-0025](../features/planning.md#uc-pln-0025), [UC-PLN-0026](../features/planning.md#uc-pln-0026).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-PLN-0080, UC-PLN-0025, UC-PLN-0026.

<a id="uc-pln-0035"></a>
### UC-PLN-0035 — Avoid no-op planning writes

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Choose the issue's already selected planning value.

**Expected results**

- The editor avoids sending another assignment mutation.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31).

Related test files: [planning-autosave.spec.ts](../../../frontend/e2e/planning-autosave.spec.ts).

<a id="uc-pln-0036"></a>
### UC-PLN-0036 — Preserve completed planning progress

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Complete an issue assigned to an epic/release.

**Expected results**

- Its base Done category contributes to completed count and percentage.

Sources: [backend/internal/features/planning/queries.sql:9](../../../backend/internal/features/planning/queries.sql#L9).

Shared business operations: `move_issue_v2`, `list_planning_items`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0037"></a>
### UC-PLN-0037 — Reduce progress when work reopens

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Reopen a completed linked issue.

**Expected results**

- Current completed count and percentage decrease accordingly.

Sources: [backend/internal/features/planning/queries.sql:9](../../../backend/internal/features/planning/queries.sql#L9).

Shared business operations: `move_issue_v2`, `list_planning_items`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0038"></a>
### UC-PLN-0038 — Exclude archived work from planning progress

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Archive a linked issue.

**Expected results**

- Archived issues are omitted from current planning progress and linked issue list.

Sources: [backend/internal/features/planning/queries.sql:9](../../../backend/internal/features/planning/queries.sql#L9).

Shared business operations: `organize_issue`, `list_planning_items`, `list_planning_issues`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0039"></a>
### UC-PLN-0039 — Open the default Kanban report

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open project Reports.

**Expected results**

- A default inclusive 30-day UTC window loads.

Sources: [frontend/src/app/features/planning/kanban-report.page.ts:372](../../../frontend/src/app/features/planning/kanban-report.page.ts#L372), [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142).

Shared business operations: `get_kanban_report`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

Related cases: [UC-PLN-0040](../features/planning.md#uc-pln-0040).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-PLN-0040.

<a id="uc-pln-0040"></a>
### UC-PLN-0040 — Update report date window

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Choose valid From and Through dates and Update report.

**Expected results**

- Completion history is recomputed for that inclusive window.

Sources: [frontend/src/app/features/planning/kanban-report.page.ts:372](../../../frontend/src/app/features/planning/kanban-report.page.ts#L372), [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142).

Shared business operations: `get_kanban_report`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-surface-followup.spec.ts](../../../frontend/e2e/coverage-board-surface-followup.spec.ts).

<a id="uc-pln-0041"></a>
### UC-PLN-0041 — Read daily throughput

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Inspect daily completion rows.

**Expected results**

- Each UTC date shows its recorded completed-cycle count.

Sources: [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142), [frontend/src/app/features/planning/kanban-report.page.ts:372](../../../frontend/src/app/features/planning/kanban-report.page.ts#L372).

Shared business operations: `get_kanban_report`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0042"></a>
### UC-PLN-0042 — Count completion after reopening

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Read a report including an issue completed, reopened and completed again.

**Expected results**

- Each recorded completion contributes a separate completed cycle.

Sources: [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142).

Shared business operations: `get_kanban_report`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0043"></a>
### UC-PLN-0043 — Measure cycle time from recorded start

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Read a report containing work with a recorded In progress/Review start.

**Expected results**

- Average cycle time uses recorded start-to-completion duration.

Sources: [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142).

Shared business operations: `get_kanban_report`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0044"></a>
### UC-PLN-0044 — Exclude unstarted cycles from the average

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Read completions having no recorded start.

**Expected results**

- They contribute to throughput but not measured-cycle average.

Sources: [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142).

Shared business operations: `get_kanban_report`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0045"></a>
### UC-PLN-0045 — Retain clock when work returns to To do

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Read history where started work returned to To do before completion.

**Expected results**

- Its cycle clock continues rather than restarting on the return.

Sources: [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142).

Shared business operations: `get_kanban_report`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0046"></a>
### UC-PLN-0046 — Read active work count

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Inspect Active board work.

**Expected results**

- The current snapshot includes unfinished nonarchived nonbacklog work, including To do.

Sources: [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142), [backend/internal/features/planning/queries.sql:9](../../../backend/internal/features/planning/queries.sql#L9).

Shared business operations: `get_kanban_report`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0047"></a>
### UC-PLN-0047 — Read blocked work count

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Inspect Blocked work.

**Expected results**

- Current unfinished active issues with unfinished blockers contribute to the count.

Sources: [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142), [backend/internal/features/planning/queries.sql:9](../../../backend/internal/features/planning/queries.sql#L9).

Shared business operations: `get_kanban_report`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0048"></a>
### UC-PLN-0048 — Read aging work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Inspect an active-work row.

**Expected results**

- The row shows assignee, work age, cycle age where recorded, and unfinished blocker count.

Sources: [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142), [frontend/src/app/features/planning/kanban-report.page.ts:372](../../../frontend/src/app/features/planning/kanban-report.page.ts#L372).

Shared business operations: `get_kanban_report`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0049"></a>
### UC-PLN-0049 — Page aging work

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Choose Load more active work.

**Expected results**

- The next bounded issue page appends using the report's loaded date window.

Sources: [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142), [frontend/src/app/features/planning/kanban-report.page.ts:372](../../../frontend/src/app/features/planning/kanban-report.page.ts#L372).

Shared business operations: `get_kanban_report`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-PLN-0082](../features/planning.md#uc-pln-0082).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-PLN-0082.

<a id="uc-pln-0050"></a>
### UC-PLN-0050 — Open a reported issue

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Follow an aging-work issue link.

**Expected results**

- The issue route opens.

Sources: [frontend/src/app/features/planning/kanban-report.page.ts:372](../../../frontend/src/app/features/planning/kanban-report.page.ts#L372).

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

<a id="uc-pln-0051"></a>
### UC-PLN-0051 — Read report definitions

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Expand How these numbers are calculated.

**Expected results**

- UTC, cycle-start, reopening and current-snapshot semantics are explained.

Sources: [frontend/src/app/features/planning/kanban-report.page.ts:372](../../../frontend/src/app/features/planning/kanban-report.page.ts#L372), [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142).

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

<a id="uc-pln-0052"></a>
### UC-PLN-0052 — Reject blank planning name

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Save a whitespace-only planning name.

**Expected results**

- A bounded nonblank name is required.

Sources: [backend/internal/features/planning/service.go:28](../../../backend/internal/features/planning/service.go#L28).

Shared business operations: `create_planning_item`, `update_planning_item`.

Related test files: [service_test.go](../../../backend/internal/features/planning/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0053"></a>
### UC-PLN-0053 — Reject oversized planning name

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Save a name longer than 100 Unicode characters.

**Expected results**

- Validation rejects the name.

Sources: [backend/internal/features/planning/service.go:28](../../../backend/internal/features/planning/service.go#L28).

Shared business operations: `create_planning_item`, `update_planning_item`.

Related test files: [service_test.go](../../../backend/internal/features/planning/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0054"></a>
### UC-PLN-0054 — Reject oversized planning description

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Save more than 2000 description characters.

**Expected results**

- Validation rejects the description.

Sources: [backend/internal/features/planning/service.go:28](../../../backend/internal/features/planning/service.go#L28).

Shared business operations: `create_planning_item`, `update_planning_item`.

Related test files: [service_test.go](../../../backend/internal/features/planning/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0055"></a>
### UC-PLN-0055 — Reject invalid planning target date

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Submit an invalid calendar date.

**Expected results**

- Validation rejects the target date.

Sources: [backend/internal/features/planning/service.go:28](../../../backend/internal/features/planning/service.go#L28).

Shared business operations: `create_planning_item`, `update_planning_item`.

Related test files: [service_test.go](../../../backend/internal/features/planning/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0056"></a>
### UC-PLN-0056 — Reject unsupported planning status

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Submit a status outside planned, active and complete.

**Expected results**

- Validation rejects the status.

Sources: [backend/internal/features/planning/service.go:28](../../../backend/internal/features/planning/service.go#L28).

Shared business operations: `create_planning_item`, `update_planning_item`.

Related test files: [service_test.go](../../../backend/internal/features/planning/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0057"></a>
### UC-PLN-0057 — Reject unsupported planning kind

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Create a planning kind other than epic or release.

**Expected results**

- Validation rejects the kind.

Sources: [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `create_planning_item`.

Related test files: [service_test.go](../../../backend/internal/features/planning/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0058"></a>
### UC-PLN-0058 — Reject wrong-kind epic assignment

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Use a release ID in the epic field.

**Expected results**

- The assignment is rejected without changing existing relationships.

Sources: [backend/internal/features/planning/service.go:272](../../../backend/internal/features/planning/service.go#L272).

Shared business operations: `set_issue_planning`.

Related test files: [service_test.go](../../../backend/internal/features/planning/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0059"></a>
### UC-PLN-0059 — Reject wrong-kind release assignment

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Use an epic ID in the release field.

**Expected results**

- The assignment is rejected without changing existing relationships.

Sources: [backend/internal/features/planning/service.go:272](../../../backend/internal/features/planning/service.go#L272).

Shared business operations: `set_issue_planning`.

Related test files: [service_test.go](../../../backend/internal/features/planning/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0060"></a>
### UC-PLN-0060 — Reject foreign-project planning assignment

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Assign an item from another project.

**Expected results**

- The foreign item is unavailable for the scoped assignment.

Sources: [backend/internal/features/planning/service.go:272](../../../backend/internal/features/planning/service.go#L272).

Shared business operations: `set_issue_planning`.

Related test files: [service_test.go](../../../backend/internal/features/planning/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0061"></a>
### UC-PLN-0061 — Reject planning edits on archived issue

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Set planning on an archived issue.

**Expected results**

- Restore is required before changing its assignments.

Sources: [backend/internal/features/planning/service.go:272](../../../backend/internal/features/planning/service.go#L272).

Shared business operations: `set_issue_planning`.

Related test files: [service_test.go](../../../backend/internal/features/planning/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0062"></a>
### UC-PLN-0062 — Reject reversed report dates

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Request Through earlier than From.

**Expected results**

- Validation rejects the reversed range.

Sources: [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142).

Shared business operations: `get_kanban_report`.

Related test files: [service_test.go](../../../backend/internal/features/planning/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0063"></a>
### UC-PLN-0063 — Reject report range beyond 366 days

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Request an inclusive range longer than 366 days.

**Expected results**

- Validation rejects the oversized window.

Sources: [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142).

Shared business operations: `get_kanban_report`.

Related test files: [service_test.go](../../../backend/internal/features/planning/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0064"></a>
### UC-PLN-0064 — Enforce viewer planning access

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open planning as a viewer and attempt a planning write.

**Expected results**

- Read views remain available; write controls and server mutations are refused.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118), [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31).

Shared business operations: `create_planning_item`, `update_planning_item`, `set_issue_planning`.

Related test files: [planning-autosave.spec.ts](../../../frontend/e2e/planning-autosave.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-PLN-0089](../features/planning.md#uc-pln-0089).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-PLN-0089.

<a id="uc-pln-0065"></a>
### UC-PLN-0065 — Freeze pending issue planning choices

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Change an assignment while the save response is unresolved.

**Expected results**

- Both controls remain locked against overlapping writes.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31).

Related test files: [planning-autosave.spec.ts](../../../frontend/e2e/planning-autosave.spec.ts).

<a id="uc-pln-0066"></a>
### UC-PLN-0066 — Retry a lost accepted planning response

Actor: `writer` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Retry after an assignment response is lost.

**Expected results**

- The frozen original body/reference confirms once without duplicate effects.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31).

Shared business operations: `set_issue_planning`.

Related test files: [planning-autosave.spec.ts](../../../frontend/e2e/planning-autosave.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0067"></a>
### UC-PLN-0067 — Review conflicting planning assignment

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Review a stale epic/release autosave.

**Expected results**

- The draft reuses the latest unrelated assignment and needs explicit apply.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31).

Shared business operations: `get_issue_planning`, `set_issue_planning`.

Related test files: [planning-autosave.spec.ts](../../../frontend/e2e/planning-autosave.spec.ts).

Related cases: [UC-PLN-0090](../features/planning.md#uc-pln-0090).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-PLN-0090.

<a id="uc-pln-0068"></a>
### UC-PLN-0068 — Cancel a failed planning assignment

Actor: `writer` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Cancel an unsaved failed assignment.

**Expected results**

- The draft clears and current server assignments are reloaded.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31).

Related test files: [planning-autosave.spec.ts](../../../frontend/e2e/planning-autosave.spec.ts).

<a id="uc-pln-0069"></a>
### UC-PLN-0069 — Protect failed planning on drawer close

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Close a drawer with failed unsaved planning.

**Expected results**

- Leave protection permits retaining the draft; reopening restores the pending selection.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31).

Related test files: [planning-autosave.spec.ts](../../../frontend/e2e/planning-autosave.spec.ts).

<a id="uc-pln-0070"></a>
### UC-PLN-0070 — Ignore an old issue's planning reply

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Switch issue while an assignment request is pending.

**Expected results**

- Session/generation ownership prevents the old response from replacing the new issue.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31).

Related test files: [planning-autosave.spec.ts](../../../frontend/e2e/planning-autosave.spec.ts).

<a id="uc-pln-0071"></a>
### UC-PLN-0071 — Reject a stale planning-item revision

Actor: `writer` · Kind: `concurrency` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Update a planning item after another actor changed it.

**Expected results**

- Conflict leaves the newer item unchanged.

Sources: [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [service_test.go](../../../backend/internal/features/planning/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0072"></a>
### UC-PLN-0072 — Treat unchanged planning item update as no-op

Actor: `writer` · Kind: `happy_path` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Save the same planning fields at current revision.

**Expected results**

- No extra field-change event or revision advance is produced.

Sources: [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [service_test.go](../../../backend/internal/features/planning/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-pln-0073"></a>
### UC-PLN-0073 — Render planning on narrow screens

Actor: `reader` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open Planning at a narrow viewport.

**Expected results**

- Cards use one column and editor fields reflow.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388).

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

<a id="uc-pln-0074"></a>
### UC-PLN-0074 — Scroll a narrow report table

Actor: `reader` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Inspect report tables on a narrow viewport.

**Expected results**

- Metrics reflow and the aging-work table scrolls horizontally.

Sources: [frontend/src/app/features/planning/kanban-report.page.ts:372](../../../frontend/src/app/features/planning/kanban-report.page.ts#L372).

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

<a id="uc-pln-0075"></a>
### UC-PLN-0075 — Retain Arabic planning text

Actor: `writer` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Create or edit an epic/release with Arabic name and description.

**Expected results**

- Unicode text is retained and displayed using automatic direction.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:28](../../../backend/internal/features/planning/service.go#L28).

Shared business operations: `create_planning_item`, `update_planning_item`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-PLN-0091](../features/planning.md#uc-pln-0091).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-PLN-0091.

<a id="uc-pln-0076"></a>
### UC-PLN-0076 — Bound report issue payload

Actor: `reader` · Kind: `performance` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Read a report for a large project.

**Expected results**

- Aging work is cursor-paged instead of sending all project issues.

Sources: [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142).

Shared business operations: `get_kanban_report`.

Related test files: [report_performance_test.go](../../../backend/internal/features/planning/report_performance_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

<a id="uc-pln-0077"></a>
### UC-PLN-0077 — Isolate late planning-item saves

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Accept a planning-item save but delay its reply, then open another project editor.

**Expected results**

- The accepted item belongs to its original project; its late reply cannot close, overwrite, reload or unlock another project editor.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388).

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts).

Gaps: [GAP-PLN-001](../gaps.md#gap-pln-001).

Note: Reproduced destination-editor closure; saves now retain project, session, editor-generation and component ownership.

Note: Implementation status is separate from the first-attempt runtime evidence ledger.

<a id="uc-pln-0078"></a>
### UC-PLN-0078 — Confirm discarding a dirty planning editor

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Edit an epic or release and attempt to leave; reject the confirmation, then explicitly accept leaving.

**Expected results**

- Rejecting the discard keeps the route and draft intact; accepting leaves without creating a planning item. Reloading or closing a dirty editor also requests the browser leave warning.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388).

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts).

Gaps: [GAP-PLN-002](../gaps.md#gap-pln-002).

Note: Reproduced silent dirty navigation. Planning now participates in a component-specific route discard guard and browser unload warning.

Note: Implementation status is separate from the first-attempt runtime evidence ledger.

<a id="uc-pln-0079"></a>
### UC-PLN-0079 — Show exact current stage names in planning and reports

Actor: `reader` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Read planning-linked and aging-report rows for work at a custom named stage.

**Expected results**

- Both rows display the exact current stage name, including Arabic, while the API retains its existing status field for compatibility.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [frontend/src/app/features/planning/kanban-report.page.ts:372](../../../frontend/src/app/features/planning/kanban-report.page.ts#L372).

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts).

Gaps: [GAP-PLN-003](../gaps.md#gap-pln-003).

Note: Reproduced Review instead of the custom name. Bounded SQL page projections now return additive stageName without per-issue requests.

Note: Implementation status is separate from the first-attempt runtime evidence ledger.

<a id="uc-pln-0080"></a>
### UC-PLN-0080 — Read another planning-item cursor page

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request a bounded planning-item page and its signed continuation.

**Expected results**

- The next distinct planning items retain project/kind scope and current cursor metadata.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/reads.go:23](../../../backend/internal/features/planning/reads.go#L23).

Shared business operations: `list_planning_items`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-PLN-0003](../features/planning.md#uc-pln-0003).

Note: Atomic service outcome separated from native UI case UC-PLN-0003.

<a id="uc-pln-0081"></a>
### UC-PLN-0081 — Read another linked-planning cursor page

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request a bounded linked-issue page and its signed continuation for one planning item.

**Expected results**

- The next distinct authorized issue summaries remain assigned to the selected planning item.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/reads.go:23](../../../backend/internal/features/planning/reads.go#L23).

Shared business operations: `list_planning_issues`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-PLN-0023](../features/planning.md#uc-pln-0023).

Note: Atomic service outcome separated from native UI case UC-PLN-0023.

<a id="uc-pln-0082"></a>
### UC-PLN-0082 — Read another aging-work cursor page

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request an aging-work cursor page using the same explicit report date window.

**Expected results**

- The next distinct issue summaries retain the loaded date-window scope and bounded continuation.

Sources: [backend/internal/features/planning/reads.go:142](../../../backend/internal/features/planning/reads.go#L142), [frontend/src/app/features/planning/kanban-report.page.ts:372](../../../frontend/src/app/features/planning/kanban-report.page.ts#L372).

Shared business operations: `get_kanban_report`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-PLN-0049](../features/planning.md#uc-pln-0049).

Note: Atomic service outcome separated from native UI case UC-PLN-0049.

<a id="uc-pln-0083"></a>
### UC-PLN-0083 — Set epic target date through service

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Update an existing epic with a valid targetDate.

**Expected results**

- A fresh planning read returns the exact saved calendar date.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-PLN-0007](../features/planning.md#uc-pln-0007).

Note: Atomic service outcome separated from native UI case UC-PLN-0007.

<a id="uc-pln-0084"></a>
### UC-PLN-0084 — Clear epic target date through service

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Update an existing epic with targetDate null.

**Expected results**

- A fresh planning read returns the cleared null target date.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-PLN-0008](../features/planning.md#uc-pln-0008).

Note: Atomic service outcome separated from native UI case UC-PLN-0008.

<a id="uc-pln-0085"></a>
### UC-PLN-0085 — Set release target date through service

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Update an existing release with a valid targetDate.

**Expected results**

- A fresh planning read returns the exact saved calendar date.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-PLN-0015](../features/planning.md#uc-pln-0015).

Note: Atomic service outcome separated from native UI case UC-PLN-0015.

<a id="uc-pln-0086"></a>
### UC-PLN-0086 — Clear release target date through service

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Update an existing release with targetDate null.

**Expected results**

- A fresh planning read returns the cleared null target date.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118).

Shared business operations: `update_planning_item`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-PLN-0016](../features/planning.md#uc-pln-0016).

Note: Atomic service outcome separated from native UI case UC-PLN-0016.

<a id="uc-pln-0087"></a>
### UC-PLN-0087 — Assign issue epic through service

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Set the issue epic ID using the current separate planning revision.

**Expected results**

- The accepted epic identity/name persist while the other planning relationship remains unchanged.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31), [backend/internal/features/planning/service.go:272](../../../backend/internal/features/planning/service.go#L272).

Shared business operations: `set_issue_planning`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

Related cases: [UC-PLN-0028](../features/planning.md#uc-pln-0028).

Note: Atomic service outcome separated from native UI case UC-PLN-0028.

<a id="uc-pln-0088"></a>
### UC-PLN-0088 — Assign issue release through service

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Set the issue release ID using the current separate planning revision.

**Expected results**

- The accepted release identity/name persist while the other planning relationship remains unchanged.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31), [backend/internal/features/planning/service.go:272](../../../backend/internal/features/planning/service.go#L272).

Shared business operations: `set_issue_planning`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

Related cases: [UC-PLN-0031](../features/planning.md#uc-pln-0031).

Note: Atomic service outcome separated from native UI case UC-PLN-0031.

<a id="uc-pln-0089"></a>
### UC-PLN-0089 — Enforce viewer planning service permission

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Read planning as a viewer and submit a planning-item or assignment write.

**Expected results**

- Authorized planning reads succeed and current write permission refuses the mutation.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:118](../../../backend/internal/features/planning/service.go#L118), [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31).

Shared business operations: `create_planning_item`, `update_planning_item`, `set_issue_planning`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-PLN-0064](../features/planning.md#uc-pln-0064).

Note: Atomic service outcome separated from native UI case UC-PLN-0064.

<a id="uc-pln-0090"></a>
### UC-PLN-0090 — Reject stale issue-planning revision

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Submit planning assignments using a revision superseded by another accepted assignment.

**Expected results**

- A typed conflict returns current null with reload_current_state; an explicit fresh assignment read retains the accepted relationships and planning revision.

Sources: [frontend/src/app/features/planning/issue-planning.component.ts:31](../../../frontend/src/app/features/planning/issue-planning.component.ts#L31).

Shared business operations: `get_issue_planning`, `set_issue_planning`.

Related test files: [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-PLN-0067](../features/planning.md#uc-pln-0067).

Note: Atomic service outcome separated from native UI case UC-PLN-0067.

Note: SetIssue returns stale(nil); the client fetches get_issue_planning after the conflict instead of receiving an embedded IssuePlanningView.

<a id="uc-pln-0091"></a>
### UC-PLN-0091 — Retain Arabic planning fields through service

Actor: `writer` · Kind: `localization` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to an active project.

**Steps**

1. Create or update an epic/release with Arabic name and description, then read it again.

**Expected results**

- The exact Unicode name and description persist with the same planning identity.

Sources: [frontend/src/app/features/planning/project-planning.page.ts:388](../../../frontend/src/app/features/planning/project-planning.page.ts#L388), [backend/internal/features/planning/service.go:28](../../../backend/internal/features/planning/service.go#L28).

Shared business operations: `create_planning_item`, `update_planning_item`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-PLN-0075](../features/planning.md#uc-pln-0075).

Note: Atomic service outcome separated from native UI case UC-PLN-0075.
