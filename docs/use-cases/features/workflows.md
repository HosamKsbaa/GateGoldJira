# Workflows, stages, transitions, policies and migration

Canonical owner for workflow configuration, type bindings and transition-policy configuration. Board columns map these stages but do not define workflows. Review requests and votes belong to issue collaboration.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `page`: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61)
- `workflow`: [backend/internal/features/configuration/workflows.go:118](../../../backend/internal/features/configuration/workflows.go#L118)
- `safety`: [backend/internal/features/configuration/workflows.go:226](../../../backend/internal/features/configuration/workflows.go#L226)
- `stage`: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15)
- `transition`: [backend/internal/features/configuration/stages.go:125](../../../backend/internal/features/configuration/stages.go#L125)
- `bindings`: [backend/internal/features/configuration/bindings.go:14](../../../backend/internal/features/configuration/bindings.go#L14)
- `migration`: [backend/internal/features/configuration/migration.go:22](../../../backend/internal/features/configuration/migration.go#L22)
- `policy`: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56)
- `policyEditor`: [frontend/src/app/features/projects/components/transition-policy.component.ts:205](../../../frontend/src/app/features/projects/components/transition-policy.component.ts#L205)
- `reads`: [backend/internal/features/configuration/workflow_reads.go:18](../../../backend/internal/features/configuration/workflow_reads.go#L18)
- `mcp`: [backend/internal/features/configuration/workflow_mcp.go:9](../../../backend/internal/features/configuration/workflow_mcp.go#L9)
- `policyRead`: [backend/internal/features/configuration/transition_policy.go:130](../../../backend/internal/features/configuration/transition_policy.go#L130)

## Cases

<a id="uc-wfl-0001"></a>
### UC-WFL-0001 — Read workflows

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open or request the project's workflows.

**Expected results**

- Accessible retained configuration is returned with stable identities and cursor state.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/workflow_reads.go:18](../../../backend/internal/features/configuration/workflow_reads.go#L18).

Shared business operations: `list_workflows`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0002"></a>
### UC-WFL-0002 — Page workflows

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request the next cursor page of workflows.

**Expected results**

- The next bounded page appends to the corresponding list.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/workflow_reads.go:18](../../../backend/internal/features/configuration/workflow_reads.go#L18).

Shared business operations: `list_workflows`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-WFL-0091](../features/workflows.md#uc-wfl-0091).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-WFL-0091.

<a id="uc-wfl-0003"></a>
### UC-WFL-0003 — Read stages

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open or request the project's stages.

**Expected results**

- Accessible retained configuration is returned with stable identities and cursor state.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/workflow_reads.go:18](../../../backend/internal/features/configuration/workflow_reads.go#L18).

Shared business operations: `list_workflow_stages`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0004"></a>
### UC-WFL-0004 — Page stages

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request the next cursor page of stages.

**Expected results**

- The next bounded page appends to the corresponding list.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/workflow_reads.go:18](../../../backend/internal/features/configuration/workflow_reads.go#L18).

Shared business operations: `list_workflow_stages`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-WFL-0092](../features/workflows.md#uc-wfl-0092).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-WFL-0092.

<a id="uc-wfl-0005"></a>
### UC-WFL-0005 — Read transitions

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open or request the project's transitions.

**Expected results**

- Accessible retained configuration is returned with stable identities and cursor state.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/workflow_reads.go:18](../../../backend/internal/features/configuration/workflow_reads.go#L18).

Shared business operations: `list_workflow_transitions`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-policy-native.spec.ts](../../../frontend/e2e/coverage-workflow-policy-native.spec.ts).

<a id="uc-wfl-0006"></a>
### UC-WFL-0006 — Page transitions

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request the next cursor page of transitions.

**Expected results**

- The next bounded page appends to the corresponding list.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/workflow_reads.go:18](../../../backend/internal/features/configuration/workflow_reads.go#L18).

Shared business operations: `list_workflow_transitions`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-WFL-0093](../features/workflows.md#uc-wfl-0093).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-WFL-0093.

<a id="uc-wfl-0007"></a>
### UC-WFL-0007 — Read type workflow bindings

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Open or request the project's type workflow bindings.

**Expected results**

- Accessible retained configuration is returned with stable identities and cursor state.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/workflow_reads.go:18](../../../backend/internal/features/configuration/workflow_reads.go#L18).

Shared business operations: `list_type_workflow_bindings`.

Related test files: [coverage-workflows.spec.ts](../../../frontend/e2e/coverage-workflows.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

<a id="uc-wfl-0008"></a>
### UC-WFL-0008 — Page type workflow bindings

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request the next cursor page of type workflow bindings.

**Expected results**

- The next bounded page appends to the corresponding list.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/workflow_reads.go:18](../../../backend/internal/features/configuration/workflow_reads.go#L18).

Shared business operations: `list_type_workflow_bindings`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-WFL-0094](../features/workflows.md#uc-wfl-0094).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-WFL-0094.

<a id="uc-wfl-0009"></a>
### UC-WFL-0009 — Select a different workflow

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Select another workflow in settings.

**Expected results**

- Its stages and transitions replace the previous selection.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts).

<a id="uc-wfl-0010"></a>
### UC-WFL-0010 — Select a type's bindings

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Choose another issue type.

**Expected results**

- The selected type's allowed and default workflow bindings load.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/bindings.go:14](../../../backend/internal/features/configuration/bindings.go#L14).

Shared business operations: `list_type_workflow_bindings`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts).

Related cases: [UC-WFL-0007](../features/workflows.md#uc-wfl-0007).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-WFL-0007.

<a id="uc-wfl-0011"></a>
### UC-WFL-0011 — Create a workflow

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save a new workflow name.

**Expected results**

- An active workflow is created without moving existing issues.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/workflows.go:118](../../../backend/internal/features/configuration/workflows.go#L118).

Shared business operations: `save_workflow`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0012"></a>
### UC-WFL-0012 — Rename a workflow

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save a new name for an existing workflow.

**Expected results**

- The stable workflow identity retains its issues and receives the new name.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/workflows.go:118](../../../backend/internal/features/configuration/workflows.go#L118).

Shared business operations: `save_workflow`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0013"></a>
### UC-WFL-0013 — Retire an eligible workflow

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Retire a workflow with no creation-default binding.

**Expected results**

- New-work bindings close while existing identities are retained.

Sources: [backend/internal/features/configuration/workflows.go:118](../../../backend/internal/features/configuration/workflows.go#L118).

Shared business operations: `save_workflow`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0014"></a>
### UC-WFL-0014 — Restore a retained workflow

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Clear retirement on a retained workflow and save valid configuration.

**Expected results**

- The workflow becomes active; bindings still require explicit eligible settings.

Sources: [backend/internal/features/configuration/workflows.go:118](../../../backend/internal/features/configuration/workflows.go#L118), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow`.

Related test files: [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Note: The service permits clearing retirement, but the current web editor disables Edit workflow when the workflow is retired. Web restoration is not claimed.

<a id="uc-wfl-0015"></a>
### UC-WFL-0015 — Create a named custom stage

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save a new stage in the selected active workflow.

**Expected results**

- The stage receives a stable project/workflow-scoped identity.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0016"></a>
### UC-WFL-0016 — Create an Arabic-named stage

Actor: `project_admin` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save an Arabic stage name.

**Expected results**

- The exact Unicode name is retained and displayed.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0017"></a>
### UC-WFL-0017 — Rename a stage

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save a changed stage name.

**Expected results**

- Existing issues keep stage identity while its display name changes.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0018"></a>
### UC-WFL-0018 — Create a todo category stage

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Choose todo while creating a new stage.

**Expected results**

- The stage uses that base category for completion and reporting semantics.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0019"></a>
### UC-WFL-0019 — Create a in_progress category stage

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Choose in_progress while creating a new stage.

**Expected results**

- The stage uses that base category for completion and reporting semantics.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0020"></a>
### UC-WFL-0020 — Create a review category stage

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Choose review while creating a new stage.

**Expected results**

- The stage uses that base category for completion and reporting semantics.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0021"></a>
### UC-WFL-0021 — Create a done category stage

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Choose done while creating a new stage.

**Expected results**

- The stage uses that base category for completion and reporting semantics.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0022"></a>
### UC-WFL-0022 — Reorder a stage by precise position

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save another positive integer stage position.

**Expected results**

- Stage ordering retains exact integer precision.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0023"></a>
### UC-WFL-0023 — Set the initial stage

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Mark an open To do stage as initial.

**Expected results**

- It becomes the workflow's initial stage and the old designation clears.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-boundaries-native.spec.ts](../../../frontend/e2e/coverage-workflow-boundaries-native.spec.ts).

<a id="uc-wfl-0024"></a>
### UC-WFL-0024 — Open stage intake

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Enable Accepts entries for an eligible stage.

**Expected results**

- Normal eligible transitions can enter the stage.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0025"></a>
### UC-WFL-0025 — Close stage intake

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Disable Accepts entries while preserving a valid workflow.

**Expected results**

- Existing issues remain in the stage; new entries stop.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0026"></a>
### UC-WFL-0026 — Retire a closed unused stage

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Retire a closed stage after references are removed.

**Expected results**

- Retained stage identity becomes retired and stays closed.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0027"></a>
### UC-WFL-0027 — Restore a retained stage

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Clear retirement on a stage in an active workflow with safe coverage.

**Expected results**

- The stage is active again; its explicit intake flag controls entries.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0028"></a>
### UC-WFL-0028 — Create a directed transition

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save a source-to-destination stage edge in one workflow.

**Expected results**

- The directed move is retained for eligibility checks.

Sources: [backend/internal/features/configuration/stages.go:125](../../../backend/internal/features/configuration/stages.go#L125), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_transition`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-process-native.spec.ts](../../../frontend/e2e/coverage-workflow-process-native.spec.ts).

<a id="uc-wfl-0029"></a>
### UC-WFL-0029 — Require member transition permission

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Set the move's permission to member.

**Expected results**

- The move exposes and enforces the selected actor permission.

Sources: [backend/internal/features/configuration/stages.go:125](../../../backend/internal/features/configuration/stages.go#L125), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_transition`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-process-native.spec.ts](../../../frontend/e2e/coverage-workflow-process-native.spec.ts).

<a id="uc-wfl-0030"></a>
### UC-WFL-0030 — Require administrator transition permission

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Set the move's permission to project_admin.

**Expected results**

- The move exposes and enforces the selected actor permission.

Sources: [backend/internal/features/configuration/stages.go:125](../../../backend/internal/features/configuration/stages.go#L125), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_transition`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-process-native.spec.ts](../../../frontend/e2e/coverage-workflow-process-native.spec.ts).

<a id="uc-wfl-0031"></a>
### UC-WFL-0031 — Clear an extra transition permission

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Clear the configured required permission.

**Expected results**

- The move returns to ordinary project-write authorization requirements.

Sources: [backend/internal/features/configuration/stages.go:125](../../../backend/internal/features/configuration/stages.go#L125), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_transition`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-process-native.spec.ts](../../../frontend/e2e/coverage-workflow-process-native.spec.ts).

<a id="uc-wfl-0032"></a>
### UC-WFL-0032 — Retire a transition

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Retire an edge while preserving required completion paths.

**Expected results**

- The directed move is no longer eligible.

Sources: [backend/internal/features/configuration/stages.go:125](../../../backend/internal/features/configuration/stages.go#L125), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_transition`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-process-native.spec.ts](../../../frontend/e2e/coverage-workflow-process-native.spec.ts).

<a id="uc-wfl-0033"></a>
### UC-WFL-0033 — Restore a transition

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Clear retirement on a valid retained edge.

**Expected results**

- The directed move becomes available under its current guards.

Sources: [backend/internal/features/configuration/stages.go:125](../../../backend/internal/features/configuration/stages.go#L125), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_transition`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-process-native.spec.ts](../../../frontend/e2e/coverage-workflow-process-native.spec.ts).

<a id="uc-wfl-0034"></a>
### UC-WFL-0034 — Allow a workflow for an issue type

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save an eligible type-to-workflow binding with intake open.

**Expected results**

- The type may use that workflow for new work.

Sources: [backend/internal/features/configuration/bindings.go:14](../../../backend/internal/features/configuration/bindings.go#L14), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `set_type_workflow_binding`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-process-native.spec.ts](../../../frontend/e2e/coverage-workflow-process-native.spec.ts).

<a id="uc-wfl-0035"></a>
### UC-WFL-0035 — Change a type's creation-default workflow

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Choose another eligible binding as default.

**Expected results**

- Future creation uses the new default; existing issues are not migrated.

Sources: [backend/internal/features/configuration/bindings.go:14](../../../backend/internal/features/configuration/bindings.go#L14), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `set_type_workflow_binding`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-process-native.spec.ts](../../../frontend/e2e/coverage-workflow-process-native.spec.ts).

<a id="uc-wfl-0036"></a>
### UC-WFL-0036 — Close a nondefault binding intake

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Disable new-work intake on a nondefault binding.

**Expected results**

- Existing issues retain their workflow while new issues cannot choose that binding.

Sources: [backend/internal/features/configuration/bindings.go:14](../../../backend/internal/features/configuration/bindings.go#L14), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `set_type_workflow_binding`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-process-native.spec.ts](../../../frontend/e2e/coverage-workflow-process-native.spec.ts).

<a id="uc-wfl-0037"></a>
### UC-WFL-0037 — Select workflow migration targets

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Choose a destination workflow in the migration editor.

**Expected results**

- Its stage choices load and paginate independently.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `list_workflow_stages`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts).

Related cases: [UC-WFL-0003](../features/workflows.md#uc-wfl-0003), [UC-WFL-0092](../features/workflows.md#uc-wfl-0092).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-WFL-0003, UC-WFL-0092.

<a id="uc-wfl-0038"></a>
### UC-WFL-0038 — Migrate a same-category issue batch

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Migrate 1–100 issues from a closed source into an eligible same-category target.

**Expected results**

- The batch commits atomically and reports moved/remaining counts.

Sources: [backend/internal/features/configuration/migration.go:22](../../../backend/internal/features/configuration/migration.go#L22), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `migrate_workflow_issues`.

Related test files: [daily-workflow.spec.ts](../../../frontend/e2e/daily-workflow.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-migration-native.spec.ts](../../../frontend/e2e/coverage-workflow-migration-native.spec.ts).

<a id="uc-wfl-0039"></a>
### UC-WFL-0039 — Continue a remaining migration

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Submit a new migration operation for remaining source work.

**Expected results**

- Another bounded batch moves without duplicating the previous operation.

Sources: [backend/internal/features/configuration/migration.go:22](../../../backend/internal/features/configuration/migration.go#L22), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `migrate_workflow_issues`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-migration-native.spec.ts](../../../frontend/e2e/coverage-workflow-migration-native.spec.ts).

<a id="uc-wfl-0040"></a>
### UC-WFL-0040 — Require assignee for a transition

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Enable the assignee system-field requirement.

**Expected results**

- The saved transition policy includes that field and movement validates its presence.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56), [frontend/src/app/features/projects/components/transition-policy.component.ts:205](../../../frontend/src/app/features/projects/components/transition-policy.component.ts#L205).

Shared business operations: `save_transition_policy`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-workflow-policy-native.spec.ts](../../../frontend/e2e/coverage-workflow-policy-native.spec.ts).

<a id="uc-wfl-0041"></a>
### UC-WFL-0041 — Require due date for a transition

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Enable the due_date system-field requirement.

**Expected results**

- The saved transition policy includes that field and movement validates its presence.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56), [frontend/src/app/features/projects/components/transition-policy.component.ts:205](../../../frontend/src/app/features/projects/components/transition-policy.component.ts#L205).

Shared business operations: `save_transition_policy`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-workflow-policy-native.spec.ts](../../../frontend/e2e/coverage-workflow-policy-native.spec.ts).

<a id="uc-wfl-0042"></a>
### UC-WFL-0042 — Require description for a transition

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Enable the description system-field requirement.

**Expected results**

- The saved transition policy includes that field and movement validates its presence.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56), [frontend/src/app/features/projects/components/transition-policy.component.ts:205](../../../frontend/src/app/features/projects/components/transition-policy.component.ts#L205).

Shared business operations: `save_transition_policy`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-workflow-policy-native.spec.ts](../../../frontend/e2e/coverage-workflow-policy-native.spec.ts).

<a id="uc-wfl-0043"></a>
### UC-WFL-0043 — Require a custom field for a transition

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Select an active project custom field as a required value.

**Expected results**

- The saved policy retains its field ID and movement checks its value.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56), [frontend/src/app/features/projects/components/transition-policy.component.ts:205](../../../frontend/src/app/features/projects/components/transition-policy.component.ts#L205).

Shared business operations: `save_transition_policy`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-policy-native.spec.ts](../../../frontend/e2e/coverage-workflow-policy-native.spec.ts).

<a id="uc-wfl-0044"></a>
### UC-WFL-0044 — Remove a transition field requirement

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Deselect one requirement and save.

**Expected results**

- That requirement is absent without removing unrelated policy settings.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56), [frontend/src/app/features/projects/components/transition-policy.component.ts:205](../../../frontend/src/app/features/projects/components/transition-policy.component.ts#L205).

Shared business operations: `save_transition_policy`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-policy-native.spec.ts](../../../frontend/e2e/coverage-workflow-policy-native.spec.ts).

<a id="uc-wfl-0045"></a>
### UC-WFL-0045 — Require member approvals

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Set a positive approval count and member reviewer role.

**Expected results**

- The policy requires that number of eligible member approvals.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56), [frontend/src/app/features/projects/components/transition-policy.component.ts:205](../../../frontend/src/app/features/projects/components/transition-policy.component.ts#L205).

Shared business operations: `save_transition_policy`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-policy-native.spec.ts](../../../frontend/e2e/coverage-workflow-policy-native.spec.ts).

<a id="uc-wfl-0046"></a>
### UC-WFL-0046 — Require administrator approvals

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Set a positive approval count and project administrator reviewer role.

**Expected results**

- The policy restricts qualifying approvals to eligible administrators.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56), [frontend/src/app/features/projects/components/transition-policy.component.ts:205](../../../frontend/src/app/features/projects/components/transition-policy.component.ts#L205).

Shared business operations: `save_transition_policy`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-policy-native.spec.ts](../../../frontend/e2e/coverage-workflow-policy-native.spec.ts).

<a id="uc-wfl-0047"></a>
### UC-WFL-0047 — Exclude the issue reporter from approval

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Enable reporter exclusion.

**Expected results**

- The reporter cannot supply a qualifying approval under the policy.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56), [frontend/src/app/features/projects/components/transition-policy.component.ts:205](../../../frontend/src/app/features/projects/components/transition-policy.component.ts#L205).

Shared business operations: `save_transition_policy`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-policy-native.spec.ts](../../../frontend/e2e/coverage-workflow-policy-native.spec.ts).

<a id="uc-wfl-0048"></a>
### UC-WFL-0048 — Disable required approval

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Set required approval count to zero and save.

**Expected results**

- The editor sends a null reviewer role and the saved policy no longer requires approvals.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56), [frontend/src/app/features/projects/components/transition-policy.component.ts:205](../../../frontend/src/app/features/projects/components/transition-policy.component.ts#L205).

Shared business operations: `save_transition_policy`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-native-residual.spec.ts](../../../frontend/e2e/coverage-board-native-residual.spec.ts).

Related cases: [UC-WFL-0095](../features/workflows.md#uc-wfl-0095).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-WFL-0095.

<a id="uc-wfl-0049"></a>
### UC-WFL-0049 — Reject nonadministrator workflow configuration

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Actor has project write access but no configuration authority.

**Steps**

1. Attempt any workflow configuration mutation.

**Expected results**

- Server project-configuration authority blocks the write.

Sources: [backend/internal/features/configuration/workflows.go:118](../../../backend/internal/features/configuration/workflows.go#L118), [backend/internal/features/configuration/bindings.go:14](../../../backend/internal/features/configuration/bindings.go#L14), [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow`, `save_workflow_stage`, `save_workflow_transition`, `set_type_workflow_binding`, `migrate_workflow_issues`, `save_transition_policy`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-boundaries-native.spec.ts](../../../frontend/e2e/coverage-workflow-boundaries-native.spec.ts).

<a id="uc-wfl-0050"></a>
### UC-WFL-0050 — Reject blank workflow name

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save an empty or whitespace-only workflow name.

**Expected results**

- Validation requires a nonblank bounded name.

Sources: [backend/internal/features/configuration/workflows.go:118](../../../backend/internal/features/configuration/workflows.go#L118), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0051"></a>
### UC-WFL-0051 — Reject oversized workflow name

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save a workflow name longer than 100 Unicode characters.

**Expected results**

- Validation rejects the name.

Sources: [backend/internal/features/configuration/workflows.go:118](../../../backend/internal/features/configuration/workflows.go#L118), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0052"></a>
### UC-WFL-0052 — Reject blank stage name

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save an empty stage name.

**Expected results**

- Validation requires a nonblank bounded name.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0053"></a>
### UC-WFL-0053 — Reject oversized stage name

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save a stage name longer than 60 Unicode characters.

**Expected results**

- Validation rejects the name.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0054"></a>
### UC-WFL-0054 — Reject nonpositive stage position

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save position zero or a negative position.

**Expected results**

- Validation refuses an invalid position.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0055"></a>
### UC-WFL-0055 — Reject changing an existing stage category

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Change a retained stage's base category.

**Expected results**

- A new stage must be created instead; retained identity is not rewritten.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-policy-native.spec.ts](../../../frontend/e2e/coverage-workflow-policy-native.spec.ts).

<a id="uc-wfl-0056"></a>
### UC-WFL-0056 — Reject initial stage outside To do

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Mark a non-To-do stage initial.

**Expected results**

- Validation requires an open To do initial stage.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0057"></a>
### UC-WFL-0057 — Reject a closed initial stage

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Close intake while retaining the initial designation.

**Expected results**

- Validation rejects the closed initial stage.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0058"></a>
### UC-WFL-0058 — Reject retirement while stage intake is open

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Retire a stage whose current intake is open.

**Expected results**

- Close intake before retirement is required.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-native.spec.ts](../../../frontend/e2e/coverage-workflow-native.spec.ts).

<a id="uc-wfl-0059"></a>
### UC-WFL-0059 — Reject retirement of an occupied stage

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Retire a closed stage that still contains issues.

**Expected results**

- Migration is required before retirement.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-migration-native.spec.ts](../../../frontend/e2e/coverage-workflow-migration-native.spec.ts).

<a id="uc-wfl-0060"></a>
### UC-WFL-0060 — Reject retirement of a rule-referenced stage

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Retire a stage still referenced by assignment rules.

**Expected results**

- Rules must be remapped before retirement.

Sources: [backend/internal/features/configuration/stages.go:15](../../../backend/internal/features/configuration/stages.go#L15), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-migration-native.spec.ts](../../../frontend/e2e/coverage-workflow-migration-native.spec.ts).

<a id="uc-wfl-0061"></a>
### UC-WFL-0061 — Reject a self transition

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Use the same source and destination stage.

**Expected results**

- Validation refuses a self transition.

Sources: [backend/internal/features/configuration/stages.go:125](../../../backend/internal/features/configuration/stages.go#L125), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_transition`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-process-native.spec.ts](../../../frontend/e2e/coverage-workflow-process-native.spec.ts).

<a id="uc-wfl-0062"></a>
### UC-WFL-0062 — Reject a cross-workflow transition

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Use stages from different workflows.

**Expected results**

- Both endpoints must belong to the selected workflow.

Sources: [backend/internal/features/configuration/stages.go:125](../../../backend/internal/features/configuration/stages.go#L125).

Shared business operations: `save_workflow_transition`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts).

Note: Native surface correction: Both transition endpoint selectors enumerate only the selected workflow stages; a cross-workflow raw endpoint is not selectable.

<a id="uc-wfl-0063"></a>
### UC-WFL-0063 — Reject rewriting transition endpoints

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Change endpoints on an existing transition ID.

**Expected results**

- The existing transition identity retains its original endpoints.

Sources: [backend/internal/features/configuration/stages.go:125](../../../backend/internal/features/configuration/stages.go#L125), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_transition`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-process-native.spec.ts](../../../frontend/e2e/coverage-workflow-process-native.spec.ts).

<a id="uc-wfl-0064"></a>
### UC-WFL-0064 — Preserve a completion path

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Remove the last path from retained work to a Done stage.

**Expected results**

- The configuration transaction is rejected.

Sources: [backend/internal/features/configuration/workflows.go:226](../../../backend/internal/features/configuration/workflows.go#L226), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`, `save_workflow_transition`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-boundaries-native.spec.ts](../../../frontend/e2e/coverage-workflow-boundaries-native.spec.ts).

<a id="uc-wfl-0065"></a>
### UC-WFL-0065 — Preserve an open initial stage for an in-use workflow

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Remove the workflow's only eligible initial stage.

**Expected results**

- In-use workflow validation rejects the unsafe state.

Sources: [backend/internal/features/configuration/workflows.go:226](../../../backend/internal/features/configuration/workflows.go#L226), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-policy-native.spec.ts](../../../frontend/e2e/coverage-workflow-policy-native.spec.ts).

<a id="uc-wfl-0066"></a>
### UC-WFL-0066 — Reject a default binding without intake

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save a creation-default binding with acceptsNew false.

**Expected results**

- Default bindings must accept new issues.

Sources: [backend/internal/features/configuration/bindings.go:14](../../../backend/internal/features/configuration/bindings.go#L14), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `set_type_workflow_binding`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-process-native.spec.ts](../../../frontend/e2e/coverage-workflow-process-native.spec.ts).

<a id="uc-wfl-0067"></a>
### UC-WFL-0067 — Reject closing the current default binding

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Remove the current creation default before installing a replacement.

**Expected results**

- An eligible replacement must become default first.

Sources: [backend/internal/features/configuration/bindings.go:14](../../../backend/internal/features/configuration/bindings.go#L14), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `set_type_workflow_binding`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-process-native.spec.ts](../../../frontend/e2e/coverage-workflow-process-native.spec.ts).

<a id="uc-wfl-0068"></a>
### UC-WFL-0068 — Reject enabling a retired type binding

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Open intake for a retired issue type.

**Expected results**

- Only active types can accept new issues.

Sources: [backend/internal/features/configuration/bindings.go:14](../../../backend/internal/features/configuration/bindings.go#L14), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `set_type_workflow_binding`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-boundaries-native.spec.ts](../../../frontend/e2e/coverage-workflow-boundaries-native.spec.ts).

<a id="uc-wfl-0069"></a>
### UC-WFL-0069 — Reject enabling a retired workflow binding

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Open intake for a retired workflow.

**Expected results**

- Only active workflows can accept new issues.

Sources: [backend/internal/features/configuration/bindings.go:14](../../../backend/internal/features/configuration/bindings.go#L14), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `set_type_workflow_binding`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-boundaries-native.spec.ts](../../../frontend/e2e/coverage-workflow-boundaries-native.spec.ts).

<a id="uc-wfl-0070"></a>
### UC-WFL-0070 — Require default-board stage coverage

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Enable a workflow whose open or occupied stages are not mapped to the default board.

**Expected results**

- The workflow cannot accept work until coverage is valid.

Sources: [backend/internal/features/configuration/workflows.go:226](../../../backend/internal/features/configuration/workflows.go#L226), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `set_type_workflow_binding`, `save_workflow_stage`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-process-native.spec.ts](../../../frontend/e2e/coverage-workflow-process-native.spec.ts).

<a id="uc-wfl-0071"></a>
### UC-WFL-0071 — Reject retirement of a creation-default workflow

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Retire a workflow still used by any creation-default binding.

**Expected results**

- Replace those defaults before retirement.

Sources: [backend/internal/features/configuration/workflows.go:118](../../../backend/internal/features/configuration/workflows.go#L118), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-process-native.spec.ts](../../../frontend/e2e/coverage-workflow-process-native.spec.ts).

<a id="uc-wfl-0072"></a>
### UC-WFL-0072 — Reject migration from open intake

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Migrate issues before closing source-stage intake.

**Expected results**

- Validation requires closed source intake.

Sources: [backend/internal/features/configuration/migration.go:22](../../../backend/internal/features/configuration/migration.go#L22).

Shared business operations: `migrate_workflow_issues`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Note: Native surface correction: The migration source selector enumerates closed stages only; an open source ID is not a native option.

<a id="uc-wfl-0073"></a>
### UC-WFL-0073 — Reject migration to the same stage

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Choose the source stage as target.

**Expected results**

- Validation requires different stages.

Sources: [backend/internal/features/configuration/migration.go:22](../../../backend/internal/features/configuration/migration.go#L22).

Shared business operations: `migrate_workflow_issues`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Note: Native surface correction: Migration targets enumerate open active stages, while the selected source is closed; the source cannot be submitted as its own target.

<a id="uc-wfl-0074"></a>
### UC-WFL-0074 — Reject cross-category migration

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Choose a destination with a different completion category.

**Expected results**

- Normal complete/reopen transitions are required before representation migration.

Sources: [backend/internal/features/configuration/migration.go:22](../../../backend/internal/features/configuration/migration.go#L22), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `migrate_workflow_issues`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-migration-native.spec.ts](../../../frontend/e2e/coverage-workflow-migration-native.spec.ts).

<a id="uc-wfl-0075"></a>
### UC-WFL-0075 — Reject migration into retired target

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Choose a retired target stage or workflow.

**Expected results**

- Target must be open and active.

Sources: [backend/internal/features/configuration/migration.go:22](../../../backend/internal/features/configuration/migration.go#L22).

Shared business operations: `migrate_workflow_issues`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Note: Native surface correction: Migration target options exclude retired stages; the raw retired target rejection is a service boundary.

<a id="uc-wfl-0076"></a>
### UC-WFL-0076 — Reject incompatible type migration

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Migrate source work whose types do not permit the target workflow.

**Expected results**

- Every retained type must permit the target before migration.

Sources: [backend/internal/features/configuration/migration.go:22](../../../backend/internal/features/configuration/migration.go#L22), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `migrate_workflow_issues`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-migration-native.spec.ts](../../../frontend/e2e/coverage-workflow-migration-native.spec.ts).

<a id="uc-wfl-0077"></a>
### UC-WFL-0077 — Reject an oversized migration batch

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Request more than 100 issue moves in one migration.

**Expected results**

- Validation rejects the batch size.

Sources: [backend/internal/features/configuration/migration.go:22](../../../backend/internal/features/configuration/migration.go#L22), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `migrate_workflow_issues`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-migration-native.spec.ts](../../../frontend/e2e/coverage-workflow-migration-native.spec.ts).

<a id="uc-wfl-0078"></a>
### UC-WFL-0078 — Reject an empty migration batch size

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Request a migration limit of zero.

**Expected results**

- Validation requires at least one issue per batch limit.

Sources: [backend/internal/features/configuration/migration.go:22](../../../backend/internal/features/configuration/migration.go#L22), [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `migrate_workflow_issues`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts), [coverage-workflow-migration-native.spec.ts](../../../frontend/e2e/coverage-workflow-migration-native.spec.ts).

<a id="uc-wfl-0079"></a>
### UC-WFL-0079 — Reject duplicate field requirements

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Submit repeated system/custom-field IDs in a transition policy.

**Expected results**

- Policy normalization rejects duplicate requirements.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56).

Shared business operations: `save_transition_policy`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts).

Note: Native surface correction: Native checkbox and multi-select state contains unique field identities; it cannot construct a duplicate-ID policy.

<a id="uc-wfl-0080"></a>
### UC-WFL-0080 — Reject foreign-project required fields

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Require a custom field outside the project.

**Expected results**

- Only scoped active project fields may be required.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56).

Shared business operations: `save_transition_policy`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Note: Native surface correction: The required-field picker reads only scoped project definitions; it has no input for an arbitrary foreign UUID.

<a id="uc-wfl-0081"></a>
### UC-WFL-0081 — Reject retired required fields

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Require a retired custom field.

**Expected results**

- The policy rejects retired field IDs.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56).

Shared business operations: `save_transition_policy`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Note: Native surface correction: The native required-field picker filters out retired definitions; a retired UUID cannot be selected as a new requirement.

<a id="uc-wfl-0082"></a>
### UC-WFL-0082 — Reject excessive approval count

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Set more than 100 required approvals.

**Expected results**

- Policy validation rejects the count.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56), [frontend/src/app/features/projects/components/transition-policy.component.ts:205](../../../frontend/src/app/features/projects/components/transition-policy.component.ts#L205).

Shared business operations: `save_transition_policy`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-policy-native.spec.ts](../../../frontend/e2e/coverage-workflow-policy-native.spec.ts).

<a id="uc-wfl-0083"></a>
### UC-WFL-0083 — Reject negative approval count

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Set a negative required approval count.

**Expected results**

- Policy validation rejects the count.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56), [frontend/src/app/features/projects/components/transition-policy.component.ts:205](../../../frontend/src/app/features/projects/components/transition-policy.component.ts#L205).

Shared business operations: `save_transition_policy`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts), [coverage-workflow-policy-native.spec.ts](../../../frontend/e2e/coverage-workflow-policy-native.spec.ts).

<a id="uc-wfl-0084"></a>
### UC-WFL-0084 — Reject approval role/count mismatch

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Submit zero approvals with a role, or a positive count without a role.

**Expected results**

- Role and count must form a valid policy.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56).

Shared business operations: `save_transition_policy`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts).

Note: Native surface correction: The native policy command sets approverRole=null when count=0 and supplies the selected role for positive counts; incompatible raw combinations are service boundaries.

<a id="uc-wfl-0085"></a>
### UC-WFL-0085 — Freeze an uncertain workflow save

Actor: `project_admin` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Retry after the server accepts a write but its response is lost.

**Expected results**

- The exact pending input and retry reference are reused while the form is frozen.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts).

Related cases: [UC-WFL-0096](../features/workflows.md#uc-wfl-0096).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-WFL-0096.

<a id="uc-wfl-0086"></a>
### UC-WFL-0086 — Review a configuration revision conflict

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Review current configuration after a stale settings write.

**Expected results**

- The draft remains but cannot save until current configuration has been explicitly reviewed.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow`.

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts).

Related cases: [UC-WFL-0097](../features/workflows.md#uc-wfl-0097).

Note: Surface correction preserves this complete browser behavior; stateless service outcomes are recorded separately in UC-WFL-0097.

<a id="uc-wfl-0087"></a>
### UC-WFL-0087 — Protect a dirty workflow editor during navigation

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Attempt to leave after editing workflow settings.

**Expected results**

- The dirty-leave confirmation can retain the current editor instead of discarding it.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Related test files: [code-quality-regressions.spec.ts](../../../frontend/e2e/code-quality-regressions.spec.ts).

<a id="uc-wfl-0088"></a>
### UC-WFL-0088 — Recreate project-scoped workflow editing context

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Navigate settings to another project using browser history.

**Expected results**

- The editor targets only the destination project and respects its access guards.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Related test files: [code-quality-regressions.spec.ts](../../../frontend/e2e/code-quality-regressions.spec.ts).

<a id="uc-wfl-0089"></a>
### UC-WFL-0089 — Retain exact large stage positions

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Edit a position larger than JavaScript's exact-number range.

**Expected results**

- The string/BigInt editing path preserves precise integer position.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Related test files: [project-workflows.spec.ts](../../../frontend/e2e/project-workflows.spec.ts).

<a id="uc-wfl-0090"></a>
### UC-WFL-0090 — Read a transition policy

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator with an accessible workflow transition.

**Steps**

1. Read the requirements and approval policy for a selected workflow transition.

**Expected results**

- The current required system/custom fields, approval count and role, reporter exclusion, and configuration/workflow revisions are returned.

Sources: [backend/internal/features/configuration/transition_policy.go:130](../../../backend/internal/features/configuration/transition_policy.go#L130), [frontend/src/app/features/projects/components/transition-policy.component.ts:205](../../../frontend/src/app/features/projects/components/transition-policy.component.ts#L205).

Shared business operations: `get_transition_policy`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-workflow-policy-native.spec.ts](../../../frontend/e2e/coverage-workflow-policy-native.spec.ts).

<a id="uc-wfl-0091"></a>
### UC-WFL-0091 — Read another workflow cursor page

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request a bounded workflow page and its next cursor.

**Expected results**

- The later workflow identities are returned without overlapping the first page.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/workflow_reads.go:18](../../../backend/internal/features/configuration/workflow_reads.go#L18).

Shared business operations: `list_workflows`.

Related test files: [coverage-workflows.spec.ts](../../../frontend/e2e/coverage-workflows.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts).

Related cases: [UC-WFL-0002](../features/workflows.md#uc-wfl-0002).

Note: Atomic service outcome separated from native UI case UC-WFL-0002.

<a id="uc-wfl-0092"></a>
### UC-WFL-0092 — Read another workflow-stage cursor page

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request a bounded stage page and its next cursor within one workflow.

**Expected results**

- The later stage identities and precise order are returned without overlapping the first page.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/workflow_reads.go:18](../../../backend/internal/features/configuration/workflow_reads.go#L18).

Shared business operations: `list_workflow_stages`.

Related test files: [coverage-workflows.spec.ts](../../../frontend/e2e/coverage-workflows.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts).

Related cases: [UC-WFL-0004](../features/workflows.md#uc-wfl-0004).

Note: Atomic service outcome separated from native UI case UC-WFL-0004.

<a id="uc-wfl-0093"></a>
### UC-WFL-0093 — Read another transition cursor page

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request a bounded transition page and its next cursor within one workflow.

**Expected results**

- The later directed transition identities are returned without overlapping the first page.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/workflow_reads.go:18](../../../backend/internal/features/configuration/workflow_reads.go#L18).

Shared business operations: `list_workflow_transitions`.

Related test files: [coverage-workflows.spec.ts](../../../frontend/e2e/coverage-workflows.spec.ts), [coverage-board-mcp.spec.ts](../../../frontend/e2e/coverage-board-mcp.spec.ts).

Related cases: [UC-WFL-0006](../features/workflows.md#uc-wfl-0006).

Note: Atomic service outcome separated from native UI case UC-WFL-0006.

<a id="uc-wfl-0094"></a>
### UC-WFL-0094 — Read another type-binding cursor page

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in with project read access.

**Steps**

1. Request a bounded binding page and its next cursor for one type.

**Expected results**

- The later type/workflow bindings are returned without overlapping the first page.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61), [backend/internal/features/configuration/workflow_reads.go:18](../../../backend/internal/features/configuration/workflow_reads.go#L18).

Shared business operations: `list_type_workflow_bindings`.

Related test files: [coverage-workflows.spec.ts](../../../frontend/e2e/coverage-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-WFL-0008](../features/workflows.md#uc-wfl-0008).

Note: Atomic service outcome separated from native UI case UC-WFL-0008.

<a id="uc-wfl-0095"></a>
### UC-WFL-0095 — Disable transition approvals through service

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Save approvalsRequired zero with approverRole null while retaining valid unrelated policy requirements.

**Expected results**

- The saved/read policy requires no approvals and retains its unrelated requirements.

Sources: [backend/internal/features/configuration/transition_policy.go:56](../../../backend/internal/features/configuration/transition_policy.go#L56), [frontend/src/app/features/projects/components/transition-policy.component.ts:205](../../../frontend/src/app/features/projects/components/transition-policy.component.ts#L205).

Shared business operations: `save_transition_policy`.

Related test files: [coverage-workflows.spec.ts](../../../frontend/e2e/coverage-workflows.spec.ts), [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-WFL-0048](../features/workflows.md#uc-wfl-0048).

Note: Atomic service outcome separated from native UI case UC-WFL-0048.

<a id="uc-wfl-0096"></a>
### UC-WFL-0096 — Replay an accepted workflow configuration command

Actor: `project_admin` · Kind: `failure` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Repeat the same accepted workflow body and retry reference.

**Expected results**

- The original result/event receipt is confirmed once without advancing configuration again.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow`.

Related test files: [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-WFL-0085](../features/workflows.md#uc-wfl-0085).

Note: Atomic service outcome separated from native UI case UC-WFL-0085.

<a id="uc-wfl-0097"></a>
### UC-WFL-0097 — Reject stale workflow configuration revision

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- Signed in as a project administrator in an active project.

**Steps**

1. Submit workflow configuration against a superseded project configuration revision.

**Expected results**

- Conflict preserves the accepted workflow and returns current revision information for a new operation.

Sources: [frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts:61](../../../frontend/src/app/features/projects/pages/project-workflows/project-workflows.page.ts#L61).

Shared business operations: `save_workflow`.

Related test files: [coverage-board-service-mcp-second.spec.ts](../../../frontend/e2e/coverage-board-service-mcp-second.spec.ts).

Related cases: [UC-WFL-0086](../features/workflows.md#uc-wfl-0086).

Note: Atomic service outcome separated from native UI case UC-WFL-0086.
