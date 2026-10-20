# Manual development links and stage assignment rules

Current integration features are manually maintained development URLs and stage-entry assignee rules. Automatic Git provider synchronization, build webhooks and a general trigger/action automation builder are outside the implemented boundary.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `linksPage`: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169)
- `rulesPage`: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242)
- `normalizeLink`: [backend/internal/features/integrations/service.go:77](../../../backend/internal/features/integrations/service.go#L77)
- `saveLink`: [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102)
- `saveRule`: [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234)
- `applyRule`: [backend/internal/features/integrations/service.go:374](../../../backend/internal/features/integrations/service.go#L374)
- `queries`: [backend/internal/features/integrations/queries.sql:1](../../../backend/internal/features/integrations/queries.sql#L1)
- `boardListing`: [backend/internal/features/boards/queries.sql:23](../../../backend/internal/features/boards/queries.sql#L23)
- `mcp`: [backend/internal/features/integrations/mcp.go:29](../../../backend/internal/features/integrations/mcp.go#L29)
- `gap_gap_int_001`: [frontend/src/app/features/integrations/automation-rules.page.ts:266](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L266)
- `issueMove`: [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts:40](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts#L40)

## Cases

<a id="uc-int-0001"></a>
### UC-INT-0001 — Read manual development links

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open the issue's Development section.

**Expected results**

- Visible manually entered links show kind, title and destination hostname.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169).

Shared business operations: `list_development_links`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-INT-0061](../features/integrations.md#uc-int-0061).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-INT-0061.

<a id="uc-int-0002"></a>
### UC-INT-0002 — Read empty development links

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open Development for an issue without links.

**Expected results**

- The empty state appears without implying provider synchronization.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169).

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

<a id="uc-int-0003"></a>
### UC-INT-0003 — Page development links

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Choose Load more development links.

**Expected results**

- The next cursor page appends.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169).

Shared business operations: `list_development_links`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-INT-0059](../features/integrations.md#uc-int-0059).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-INT-0059.

<a id="uc-int-0004"></a>
### UC-INT-0004 — Add a pull_request development link

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Save a valid pull_request URL and title.

**Expected results**

- The manually maintained typed link appears on the issue.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0005"></a>
### UC-INT-0005 — Add a commit development link

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Save a valid commit URL and title.

**Expected results**

- The manually maintained typed link appears on the issue.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0006"></a>
### UC-INT-0006 — Add a other development link

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Save a valid other URL and title.

**Expected results**

- The manually maintained typed link appears on the issue.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0007"></a>
### UC-INT-0007 — Follow a development link

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open an existing development URL.

**Expected results**

- The external page opens separately with noopener/noreferrer attributes.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169).

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

<a id="uc-int-0008"></a>
### UC-INT-0008 — Edit development link title

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Save a changed title for a retained link.

**Expected results**

- The same link identity shows the updated title.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0009"></a>
### UC-INT-0009 — Edit development link URL

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Save a changed URL for a retained link.

**Expected results**

- The destination and displayed hostname update.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-INT-0062](../features/integrations.md#uc-int-0062).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-INT-0062.

<a id="uc-int-0010"></a>
### UC-INT-0010 — Edit development link kind

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Save a different supported link kind.

**Expected results**

- The same link displays its new kind.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0011"></a>
### UC-INT-0011 — Detach a development link

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Choose Remove for an existing development link.

**Expected results**

- The link is removed from the visible issue list.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0012"></a>
### UC-INT-0012 — Cancel development link editing

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Cancel an open link form.

**Expected results**

- No staged link mutation is saved.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169).

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

<a id="uc-int-0013"></a>
### UC-INT-0013 — Retain Arabic development link titles

Actor: `writer` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Save a link using Arabic title text.

**Expected results**

- The exact title remains readable using automatic direction.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169), [backend/internal/features/integrations/service.go:77](../../../backend/internal/features/integrations/service.go#L77).

Shared business operations: `save_development_link`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-INT-0063](../features/integrations.md#uc-int-0063).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-INT-0063.

<a id="uc-int-0014"></a>
### UC-INT-0014 — Read assignment rules

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open project Automation.

**Expected results**

- Enabled and disabled stage-entry rules show current stage and assignee.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242).

Shared business operations: `list_automation_rules`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0015"></a>
### UC-INT-0015 — Page assignment rules

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Choose Load more rules.

**Expected results**

- The next bounded rule page appends.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242).

Shared business operations: `list_automation_rules`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-INT-0060](../features/integrations.md#uc-int-0060).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-INT-0060.

<a id="uc-int-0016"></a>
### UC-INT-0016 — Read empty automation rules

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open Automation where no assignment rules exist.

**Expected results**

- The empty state explains stage-entry assignment.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242).

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

<a id="uc-int-0017"></a>
### UC-INT-0017 — Create an enabled assignment rule

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save a name, eligible stage and eligible assignee with Enabled selected.

**Expected results**

- A new enabled rule appears for that project stage.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0018"></a>
### UC-INT-0018 — Create a disabled assignment rule

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save an assignment rule with Enabled cleared.

**Expected results**

- The rule is retained but does not assign work.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0019"></a>
### UC-INT-0019 — Rename an assignment rule

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save a changed rule name.

**Expected results**

- The retained rule displays its new name.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0020"></a>
### UC-INT-0020 — Change an assignment rule's stage

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Choose another eligible project stage and save.

**Expected results**

- Later matching stage entries use the new rule stage.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0021"></a>
### UC-INT-0021 — Change an assignment rule's assignee

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Choose another eligible teammate and save.

**Expected results**

- Later matching stage entries assign the new teammate.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0022"></a>
### UC-INT-0022 — Disable an assignment rule

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Clear Enabled on an existing rule.

**Expected results**

- Later stage entries stop applying that rule.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0023"></a>
### UC-INT-0023 — Enable an assignment rule

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Enable an eligible disabled rule.

**Expected results**

- Later stage entries apply the selected assignment.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0024"></a>
### UC-INT-0024 — Cancel assignment rule editing

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Cancel an open rule editor.

**Expected results**

- No staged rule changes are saved.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

<a id="uc-int-0025"></a>
### UC-INT-0025 — Search rule assignees as typed

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Type a teammate name in Assign to.

**Expected results**

- Eligible assignee choices update after the typing debounce.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `list_assignees`.

Related test files: [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts).

Related cases: [UC-ISS-0197](../features/issues.md#uc-iss-0197).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-ISS-0197.

<a id="uc-int-0026"></a>
### UC-INT-0026 — Page rule assignee choices

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Choose more assignees after a search.

**Expected results**

- The next real cursor page appends without duplicate user IDs.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `list_assignees`.

Related test files: [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts).

Related cases: [UC-INT-0064](../features/integrations.md#uc-int-0064).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-INT-0064.

<a id="uc-int-0027"></a>
### UC-INT-0027 — Run assignment rule on stage entry

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Move an issue into a stage with an enabled eligible rule.

**Expected results**

- Assignment joins the same move transaction and existing completion/permission guards remain authoritative.

Sources: [backend/internal/features/integrations/service.go:374](../../../backend/internal/features/integrations/service.go#L374), [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts:40](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts#L40).

Shared business operations: `move_issue_v2`, `move_board_card_v2`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts), [coverage-integration-native-guards.spec.ts](../../../frontend/e2e/coverage-integration-native-guards.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-int-0028"></a>
### UC-INT-0028 — Keep a revoked rule assignee inert

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Move work after its configured assignee loses project eligibility.

**Expected results**

- The rule does not assign work to the revoked teammate.

Sources: [backend/internal/features/integrations/service.go:374](../../../backend/internal/features/integrations/service.go#L374), [backend/internal/features/integrations/queries.sql:1](../../../backend/internal/features/integrations/queries.sql#L1), [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts:40](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts#L40).

Shared business operations: `move_issue_v2`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-integration-native-guards.spec.ts](../../../frontend/e2e/coverage-integration-native-guards.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-int-0029"></a>
### UC-INT-0029 — Keep a retired-stage rule inert

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Exercise work after its configured stage is retired.

**Expected results**

- The obsolete stage rule does not assign work.

Sources: [backend/internal/features/integrations/service.go:374](../../../backend/internal/features/integrations/service.go#L374), [backend/internal/features/integrations/queries.sql:1](../../../backend/internal/features/integrations/queries.sql#L1), [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts:40](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts#L40).

Shared business operations: `move_issue_v2`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-integration-native-guards.spec.ts](../../../frontend/e2e/coverage-integration-native-guards.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-int-0030"></a>
### UC-INT-0030 — Hide link mutations from viewers

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Actor has viewer access to the issue's project.

**Steps**

1. Open Development as a project viewer.

**Expected results**

- Links remain readable; add/edit/remove controls and writes are unavailable.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `list_development_links`, `save_development_link`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

Related cases: [UC-INT-0065](../features/integrations.md#uc-int-0065).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-INT-0065.

<a id="uc-int-0031"></a>
### UC-INT-0031 — Reject rule writes by ordinary members

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Actor is a project member without administration authority.

**Steps**

1. Submit a rule mutation without project administrator authority.

**Expected results**

- The server refuses configuration writes.

Sources: [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234), [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242).

Shared business operations: `save_automation_rule`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts), [coverage-integration-native-guards.spec.ts](../../../frontend/e2e/coverage-integration-native-guards.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-int-0032"></a>
### UC-INT-0032 — Reject blank development link title

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Submit a whitespace-only title.

**Expected results**

- Validation requires a nonblank title.

Sources: [backend/internal/features/integrations/service.go:77](../../../backend/internal/features/integrations/service.go#L77), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0033"></a>
### UC-INT-0033 — Reject oversized development link title

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Submit more than 200 title characters.

**Expected results**

- Validation rejects the title.

Sources: [backend/internal/features/integrations/service.go:77](../../../backend/internal/features/integrations/service.go#L77), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0034"></a>
### UC-INT-0034 — Reject non-HTTP development URLs

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Submit a URL with a scheme other than HTTP or HTTPS.

**Expected results**

- The link is refused.

Sources: [backend/internal/features/integrations/service.go:77](../../../backend/internal/features/integrations/service.go#L77), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0035"></a>
### UC-INT-0035 — Reject credential-bearing development URLs

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Submit an HTTP URL containing username/password credentials.

**Expected results**

- The link is refused without storing credentials.

Sources: [backend/internal/features/integrations/service.go:77](../../../backend/internal/features/integrations/service.go#L77), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0036"></a>
### UC-INT-0036 — Reject malformed development URLs

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Submit an invalid or hostless URL.

**Expected results**

- The link is refused.

Sources: [backend/internal/features/integrations/service.go:77](../../../backend/internal/features/integrations/service.go#L77), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0037"></a>
### UC-INT-0037 — Reject oversized development URLs

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Submit more than 2000 URL characters.

**Expected results**

- The link is refused.

Sources: [backend/internal/features/integrations/service.go:77](../../../backend/internal/features/integrations/service.go#L77), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0038"></a>
### UC-INT-0038 — Reject unsupported development link kind

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Submit a kind outside pull_request, commit and other.

**Expected results**

- Validation rejects the kind.

Sources: [backend/internal/features/integrations/service.go:77](../../../backend/internal/features/integrations/service.go#L77), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0039"></a>
### UC-INT-0039 — Reject an already-removed new link

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Create a new link ID with removed true.

**Expected results**

- A new link must initially be visible.

Sources: [backend/internal/features/integrations/service.go:77](../../../backend/internal/features/integrations/service.go#L77), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0040"></a>
### UC-INT-0040 — Reject development writes on archived issue

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Save a link for an archived issue.

**Expected results**

- The issue must be restored before link mutation.

Sources: [backend/internal/features/integrations/service.go:77](../../../backend/internal/features/integrations/service.go#L77), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0041"></a>
### UC-INT-0041 — Reject blank automation rule name

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save a whitespace-only rule name.

**Expected results**

- A nonblank bounded name is required.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [canonical_rule_test.go](../../../backend/internal/features/integrations/canonical_rule_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0042"></a>
### UC-INT-0042 — Reject oversized automation rule name

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save more than 100 rule-name characters.

**Expected results**

- Validation rejects the name.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [canonical_rule_test.go](../../../backend/internal/features/integrations/canonical_rule_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0043"></a>
### UC-INT-0043 — Reject a second enabled rule for a stage

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Enable another rule for a stage that already has an enabled rule.

**Expected results**

- The uniqueness guard prevents competing enabled stage assignments.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [canonical_rule_test.go](../../../backend/internal/features/integrations/canonical_rule_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0044"></a>
### UC-INT-0044 — Reject an ineligible rule assignee

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Enable a rule targeting a user without active project eligibility.

**Expected results**

- The enabled rule is refused.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [canonical_rule_test.go](../../../backend/internal/features/integrations/canonical_rule_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0045"></a>
### UC-INT-0045 — Reject an unavailable rule stage

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Enable a rule for a noncurrent stage.

**Expected results**

- The enabled rule must use a current project stage.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [canonical_rule_test.go](../../../backend/internal/features/integrations/canonical_rule_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0046"></a>
### UC-INT-0046 — Reject mismatched rule stage identity

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Submit inconsistent native stage ID and stage token.

**Expected results**

- Validation requires one matching stage identity.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [canonical_rule_test.go](../../../backend/internal/features/integrations/canonical_rule_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0047"></a>
### UC-INT-0047 — Reject a stale development link revision

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Save a link after another actor changed it.

**Expected results**

- The newer link is preserved through a typed conflict.

Sources: [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102), [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169).

Shared business operations: `save_development_link`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-int-0048"></a>
### UC-INT-0048 — Reject a stale assignment rule revision

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save a rule after another administrator changed it.

**Expected results**

- The stale operation cannot overwrite the newer rule.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [service_test.go](../../../backend/internal/features/integrations/service_test.go), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts), [coverage-integration-native-guards.spec.ts](../../../frontend/e2e/coverage-integration-native-guards.spec.ts).

Note: Source classification correction: the native action and its validation/recovery path are present. This records implementation availability, not a passing runtime coverage claim.

<a id="uc-int-0049"></a>
### UC-INT-0049 — Replay an accepted development link write

Actor: `writer` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Retry the same accepted link operation after losing the response.

**Expected results**

- The stable link ID and retry reference prevent duplicate side effects.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0050"></a>
### UC-INT-0050 — Replay an accepted assignment rule write

Actor: `project_admin` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Retry an accepted rule operation after losing the response.

**Expected results**

- The stable rule ID and retry reference confirm the original mutation once.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts), [coverage-integration-native-guards.spec.ts](../../../frontend/e2e/coverage-integration-native-guards.spec.ts).

<a id="uc-int-0051"></a>
### UC-INT-0051 — Ignore stale assignee-search replies

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Change the query or project while a rule-assignee search is pending.

**Expected results**

- Generation/session ownership discards obsolete search results.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Related test files: [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts).

<a id="uc-int-0052"></a>
### UC-INT-0052 — Reflow development links on narrow screens

Actor: `reader` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open a long-title development link list on a narrow viewport.

**Expected results**

- Content wraps and link actions reflow without hiding the destination.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169).

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

<a id="uc-int-0053"></a>
### UC-INT-0053 — Reflow assignment rules on narrow screens

Actor: `reader` · Kind: `accessibility` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open Automation on a narrow viewport.

**Expected results**

- Rule rows and editor reflow to a usable single-column layout.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242).

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts).

<a id="uc-int-0054"></a>
### UC-INT-0054 — Retain Arabic assignment rule names

Actor: `project_admin` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save an Arabic rule name.

**Expected results**

- The exact Unicode name remains readable.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `save_automation_rule`.

Related test files: [planning-integrations.spec.ts](../../../frontend/e2e/planning-integrations.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

<a id="uc-int-0055"></a>
### UC-INT-0055 — Discover automation stages beyond the first board directory page

Actor: `project_admin` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Create 26 alphabetically earlier nondefault boards, then open automation stage choices.

**Expected results**

- All four eligible default-workflow stages remain selectable even when All Issues is beyond the first board-directory page.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/boards/queries.sql:23](../../../backend/internal/features/boards/queries.sql#L23).

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts).

Gaps: [GAP-INT-001](../gaps.md#gap-int-001).

Note: The browser regression passed after discovery moved to typed paginated workflow/stage reads, independent of board-directory pagination.

<a id="uc-int-0056"></a>
### UC-INT-0056 — Isolate development-link continuations

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Switch issue or sign out and back in while a development-link read or accepted save reply is delayed.

**Expected results**

- An obsolete read error, saving state or save continuation cannot affect the destination issue editor or the new signed-in session.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169).

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts).

Gaps: [GAP-INT-002](../gaps.md#gap-int-002).

Note: The actual late read failure already remained isolated through native detail child recreation. Additional delayed-save/session checks retain that behavior as an explicit regression boundary.

Note: Implementation status is separate from the first-attempt runtime evidence ledger.

<a id="uc-int-0057"></a>
### UC-INT-0057 — Isolate late automation saves

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Accept a rule save but delay its reply, then open a different project rule editor.

**Expected results**

- The source rule remains in its original project; the late reply cannot close, overwrite or reload the destination project editor.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242).

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts).

Gaps: [GAP-INT-003](../gaps.md#gap-int-003).

Note: Reproduced destination-editor closure; rule saves now check project, session, editor-generation and component ownership.

Note: Implementation status is separate from the first-attempt runtime evidence ledger.

<a id="uc-int-0058"></a>
### UC-INT-0058 — Configure assignment for an eligible stage absent from the default board

Actor: `project_admin` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- An active workflow stage is valid for assignment automation but intentionally not mapped in the default board layout.

**Steps**

1. Page workflow and stage choices, select an open unmapped stage, and save an enabled assignment rule.

**Expected results**

- The eligible unmapped stage is selectable across real workflow/stage cursor pages; a closed stage is excluded, and saving retains the exact selected stage ID.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:266](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L266).

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts).

Gaps: [GAP-INT-001](../gaps.md#gap-int-001).

Note: The browser regression passed with an active future workflow absent from default-board mappings and real limit-one workflow/stage pages.

<a id="uc-int-0059"></a>
### UC-INT-0059 — Read another development-link cursor page

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request a bounded development-link page and its continuation for one issue.

**Expected results**

- The next distinct retained development links and continuation metadata are returned.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169).

Shared business operations: `list_development_links`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-INT-0003](../features/integrations.md#uc-int-0003).

Note: Atomic service outcome separated from native UI case UC-INT-0003.

<a id="uc-int-0060"></a>
### UC-INT-0060 — Read another assignment-rule cursor page

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request a bounded assignment-rule page and its continuation for one project.

**Expected results**

- The next distinct enabled/disabled rules and continuation metadata are returned.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242).

Shared business operations: `list_automation_rules`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-INT-0015](../features/integrations.md#uc-int-0015).

Note: Atomic service outcome separated from native UI case UC-INT-0015.

<a id="uc-int-0061"></a>
### UC-INT-0061 — Read retained development-link service metadata

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request visible manually maintained development links for an authorized issue.

**Expected results**

- The typed kind, title, URL and retained link identities are returned.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169).

Shared business operations: `list_development_links`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-INT-0001](../features/integrations.md#uc-int-0001).

Note: Atomic service outcome separated from native UI case UC-INT-0001.

<a id="uc-int-0062"></a>
### UC-INT-0062 — Persist a changed development-link URL

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Save a new valid URL at the current link revision, then list that retained link.

**Expected results**

- The same link identity returns the accepted new URL.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `save_development_link`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-INT-0009](../features/integrations.md#uc-int-0009).

Note: Atomic service outcome separated from native UI case UC-INT-0009.

<a id="uc-int-0063"></a>
### UC-INT-0063 — Retain Arabic development-link title through service

Actor: `writer` · Kind: `localization` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with write access to the issue's active project.

**Steps**

1. Save an Arabic title on a development link and read it again.

**Expected results**

- The same retained link returns the exact Unicode title.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169), [backend/internal/features/integrations/service.go:77](../../../backend/internal/features/integrations/service.go#L77).

Shared business operations: `save_development_link`.

Related test files: [coverage-planning.spec.ts](../../../frontend/e2e/coverage-planning.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-rest.spec.ts](../../../frontend/e2e/coverage-board-service-rest.spec.ts).

Related cases: [UC-INT-0013](../features/integrations.md#uc-int-0013).

Note: Atomic service outcome separated from native UI case UC-INT-0013.

<a id="uc-int-0064"></a>
### UC-INT-0064 — Read another eligible assignee cursor page

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Request a bounded eligible-assignee page and its next cursor within the same project/query.

**Expected results**

- The next distinct assignable user IDs are returned without overlapping the first page.

Sources: [frontend/src/app/features/integrations/automation-rules.page.ts:242](../../../frontend/src/app/features/integrations/automation-rules.page.ts#L242), [backend/internal/features/integrations/service.go:234](../../../backend/internal/features/integrations/service.go#L234).

Shared business operations: `list_assignees`.

Related test files: [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-INT-0026](../features/integrations.md#uc-int-0026).

Note: Atomic service outcome separated from native UI case UC-INT-0026.

<a id="uc-int-0065"></a>
### UC-INT-0065 — Enforce viewer development-link service access

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Actor has viewer access to the issue's project.

**Steps**

1. Read development links as a viewer and attempt a link mutation.

**Expected results**

- The authorized link read succeeds while current write permission refuses the mutation.

Sources: [frontend/src/app/features/integrations/development-links.component.ts:169](../../../frontend/src/app/features/integrations/development-links.component.ts#L169), [backend/internal/features/integrations/service.go:102](../../../backend/internal/features/integrations/service.go#L102).

Shared business operations: `list_development_links`, `save_development_link`.

Related test files: [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-INT-0030](../features/integrations.md#uc-int-0030).

Note: Atomic service outcome separated from native UI case UC-INT-0030.
