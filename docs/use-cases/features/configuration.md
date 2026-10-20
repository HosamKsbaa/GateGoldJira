# Project taxonomy, typed custom fields and safe activation

Workflow/stage/transition/binding/migration and review-policy setup are canonical in workflows; this area retains taxonomy, defaults, custom-field lifecycle and activation guards. Existing test references do not certify execution or per-case coverage.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `ui`: [frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.html:51](../../../frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.html#L51)
- `editor`: [frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.ts:41](../../../frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.ts#L41)
- `service`: [backend/internal/features/configuration/service.go:128](../../../backend/internal/features/configuration/service.go#L128)
- `reads`: [backend/internal/features/configuration/reads.go:23](../../../backend/internal/features/configuration/reads.go#L23)
- `defaults`: [backend/internal/features/configuration/taxonomy.go:270](../../../backend/internal/features/configuration/taxonomy.go#L270)
- `type`: [backend/internal/features/configuration/taxonomy.go:41](../../../backend/internal/features/configuration/taxonomy.go#L41)
- `priority`: [backend/internal/features/configuration/taxonomy.go:165](../../../backend/internal/features/configuration/taxonomy.go#L165)
- `fieldUi`: [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210)
- `field`: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57)
- `option`: [backend/internal/features/configuration/fields.go:211](../../../backend/internal/features/configuration/fields.go#L211)
- `fieldRead`: [backend/internal/features/configuration/field_reads.go:18](../../../backend/internal/features/configuration/field_reads.go#L18)
- `backfill`: [backend/internal/features/configuration/fields.go:293](../../../backend/internal/features/configuration/fields.go#L293)
- `activation`: [backend/internal/features/configuration/activation.go:37](../../../backend/internal/features/configuration/activation.go#L37)
- `activate`: [backend/internal/features/configuration/activation.go:123](../../../backend/internal/features/configuration/activation.go#L123)
- `activationUi`: [frontend/src/app/features/projects/components/project-activation/project-activation.component.ts:122](../../../frontend/src/app/features/projects/components/project-activation/project-activation.component.ts#L122)
- `route`: [frontend/src/app/features/projects/projects.routes.ts:29](../../../frontend/src/app/features/projects/projects.routes.ts#L29)
- `guard`: [frontend/src/app/core/auth/auth.guards.ts:31](../../../frontend/src/app/core/auth/auth.guards.ts#L31)

## Cases

<a id="uc-cfg-0001"></a>
### UC-CFG-0001 — Read project configuration

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Open issue configuration for the current project.

**Expected results**

- Current revision, creation defaults, mode and manage capability load.

Sources: [frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.html:51](../../../frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.html#L51), [backend/internal/features/configuration/service.go:128](../../../backend/internal/features/configuration/service.go#L128).

Shared business operations: `get_project_configuration`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0002"></a>
### UC-CFG-0002 — Page project issue types

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Request another issue-type page.

**Expected results**

- Bounded type choices retain behavior, default and retired flags.

Sources: [backend/internal/features/configuration/reads.go:23](../../../backend/internal/features/configuration/reads.go#L23).

Shared business operations: `list_issue_types`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-boundaries-native.spec.ts](../../../frontend/e2e/coverage-configuration-boundaries-native.spec.ts).

<a id="uc-cfg-0003"></a>
### UC-CFG-0003 — Include retired issue types

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Read issue types with includeRetired true.

**Expected results**

- Retired identities remain inspectable for historical work.

Sources: [backend/internal/features/configuration/reads.go:23](../../../backend/internal/features/configuration/reads.go#L23).

Shared business operations: `list_issue_types`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0004"></a>
### UC-CFG-0004 — Page priorities

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Request another priority page.

**Expected results**

- Choices return with exact positive order and default/retired flags.

Sources: [backend/internal/features/configuration/reads.go:23](../../../backend/internal/features/configuration/reads.go#L23).

Shared business operations: `list_priorities`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-boundaries-native.spec.ts](../../../frontend/e2e/coverage-configuration-boundaries-native.spec.ts).

<a id="uc-cfg-0005"></a>
### UC-CFG-0005 — Include retired priorities

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Request priorities including retired records.

**Expected results**

- Historical priorities remain readable without becoming new active choices.

Sources: [backend/internal/features/configuration/reads.go:23](../../../backend/internal/features/configuration/reads.go#L23).

Shared business operations: `list_priorities`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0006"></a>
### UC-CFG-0006 — Create standard issue type

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save a new stable-key type with Standard behavior.

**Expected results**

- The new project-scoped type can represent standard issues.

Sources: [backend/internal/features/configuration/taxonomy.go:41](../../../backend/internal/features/configuration/taxonomy.go#L41), [frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.html:51](../../../frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.html#L51).

Shared business operations: `save_issue_type`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0007"></a>
### UC-CFG-0007 — Create subtask issue type

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save a new type with Subtask behavior.

**Expected results**

- The type is retained as a subtask behavior choice.

Sources: [backend/internal/features/configuration/taxonomy.go:41](../../../backend/internal/features/configuration/taxonomy.go#L41), [frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.html:51](../../../frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.html#L51).

Shared business operations: `save_issue_type`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0008"></a>
### UC-CFG-0008 — Rename issue type

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Edit only the type display name.

**Expected results**

- The new name appears and stable identity/key remain unchanged.

Sources: [backend/internal/features/configuration/taxonomy.go:41](../../../backend/internal/features/configuration/taxonomy.go#L41).

Shared business operations: `save_issue_type`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0009"></a>
### UC-CFG-0009 — Retire nondefault type

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Retire an active type that is not the current creation default.

**Expected results**

- New use is disabled while historical type references remain.

Sources: [backend/internal/features/configuration/taxonomy.go:41](../../../backend/internal/features/configuration/taxonomy.go#L41).

Shared business operations: `save_issue_type`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0010"></a>
### UC-CFG-0010 — Retire default type with replacement

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Retire a creation default while selecting another active same-behavior type.

**Expected results**

- The replacement becomes the creation default atomically.

Sources: [backend/internal/features/configuration/taxonomy.go:41](../../../backend/internal/features/configuration/taxonomy.go#L41).

Shared business operations: `save_issue_type`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0011"></a>
### UC-CFG-0011 — Reject missing default-type replacement

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Retire the current default without an eligible replacement.

**Expected results**

- The command is rejected rather than leaving invalid defaults.

Sources: [backend/internal/features/configuration/taxonomy.go:41](../../../backend/internal/features/configuration/taxonomy.go#L41).

Shared business operations: `save_issue_type`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0012"></a>
### UC-CFG-0012 — Reject wrong-behavior replacement

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Supply a standard type as a subtask-default replacement or vice versa.

**Expected results**

- The replacement is rejected.

Sources: [backend/internal/features/configuration/taxonomy.go:41](../../../backend/internal/features/configuration/taxonomy.go#L41).

Shared business operations: `save_issue_type`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go).

Note: Native surface correction: Replacement controls enumerate only active types with the same behavior; a wrong-behavior ID cannot be submitted through this control.

<a id="uc-cfg-0013"></a>
### UC-CFG-0013 — Restore retired type

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Clear retirement on a retained type.

**Expected results**

- The same type identity becomes active again.

Sources: [backend/internal/features/configuration/taxonomy.go:41](../../../backend/internal/features/configuration/taxonomy.go#L41).

Shared business operations: `save_issue_type`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0014"></a>
### UC-CFG-0014 — Keep type stable key immutable

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Attempt to rename the key of a saved type.

**Expected results**

- Validation requires changing display name instead.

Sources: [backend/internal/features/configuration/taxonomy.go:41](../../../backend/internal/features/configuration/taxonomy.go#L41).

Shared business operations: `save_issue_type`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go).

Note: Native surface correction: The type editor has no stable-key input and retains the existing key internally; this literal raw-key rename is an API boundary.

<a id="uc-cfg-0015"></a>
### UC-CFG-0015 — Protect used type behavior

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Change behavior of a used or default type.

**Expected results**

- The change is rejected; a separate type is required.

Sources: [backend/internal/features/configuration/taxonomy.go:41](../../../backend/internal/features/configuration/taxonomy.go#L41).

Shared business operations: `save_issue_type`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0016"></a>
### UC-CFG-0016 — Reject invalid taxonomy key

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Submit a key outside the lowercase stable-key pattern.

**Expected results**

- The type or priority save is rejected.

Sources: [backend/internal/features/configuration/taxonomy.go:41](../../../backend/internal/features/configuration/taxonomy.go#L41), [backend/internal/features/configuration/taxonomy.go:165](../../../backend/internal/features/configuration/taxonomy.go#L165).

Shared business operations: `save_issue_type`, `save_priority`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go).

Note: Native surface correction: Type and priority stable keys are generated from the entered display name; the native editor exposes no raw taxonomy-key input.

<a id="uc-cfg-0017"></a>
### UC-CFG-0017 — Reject empty or long taxonomy name

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Submit a blank or over-60-character type/priority name.

**Expected results**

- Validation rejects the save.

Sources: [backend/internal/features/configuration/taxonomy.go:41](../../../backend/internal/features/configuration/taxonomy.go#L41), [backend/internal/features/configuration/taxonomy.go:165](../../../backend/internal/features/configuration/taxonomy.go#L165).

Shared business operations: `save_issue_type`, `save_priority`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0018"></a>
### UC-CFG-0018 — Preserve Arabic taxonomy names

Actor: `project_admin` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Create a type or priority with an Arabic display name.

**Expected results**

- Its Unicode name remains intact across reload and display.

Sources: [frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.html:51](../../../frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.html#L51), [backend/internal/features/configuration/taxonomy.go:41](../../../backend/internal/features/configuration/taxonomy.go#L41), [backend/internal/features/configuration/taxonomy.go:165](../../../backend/internal/features/configuration/taxonomy.go#L165).

Shared business operations: `save_issue_type`, `save_priority`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0019"></a>
### UC-CFG-0019 — Create custom priority

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save a new project priority with stable key and positive order.

**Expected results**

- The priority becomes an active configured choice.

Sources: [backend/internal/features/configuration/taxonomy.go:165](../../../backend/internal/features/configuration/taxonomy.go#L165), [frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.html:51](../../../frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.html#L51).

Shared business operations: `save_priority`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0020"></a>
### UC-CFG-0020 — Rename priority

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Edit a priority display name.

**Expected results**

- The name changes while existing issue references retain the same priority identity.

Sources: [backend/internal/features/configuration/taxonomy.go:165](../../../backend/internal/features/configuration/taxonomy.go#L165).

Shared business operations: `save_priority`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0021"></a>
### UC-CFG-0021 — Reorder priority precisely

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save a positive decimal-string position beyond JavaScript safe integer range.

**Expected results**

- The exact order representation is preserved.

Sources: [backend/internal/features/configuration/taxonomy.go:165](../../../backend/internal/features/configuration/taxonomy.go#L165).

Shared business operations: `save_priority`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0022"></a>
### UC-CFG-0022 — Reject nonpositive priority position

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Supply zero or negative priority order.

**Expected results**

- The save is rejected.

Sources: [backend/internal/features/configuration/taxonomy.go:165](../../../backend/internal/features/configuration/taxonomy.go#L165).

Shared business operations: `save_priority`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0023"></a>
### UC-CFG-0023 — Protect priority stable key

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Change an existing priority stable key.

**Expected results**

- The service rejects the rename.

Sources: [backend/internal/features/configuration/taxonomy.go:165](../../../backend/internal/features/configuration/taxonomy.go#L165).

Shared business operations: `save_priority`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go).

Note: Native surface correction: The priority editor has no stable-key input and retains the stored key internally.

<a id="uc-cfg-0024"></a>
### UC-CFG-0024 — Retire nondefault priority

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Retire an active nondefault priority.

**Expected results**

- Existing issue references remain readable but the choice is retired for new use.

Sources: [backend/internal/features/configuration/taxonomy.go:165](../../../backend/internal/features/configuration/taxonomy.go#L165).

Shared business operations: `save_priority`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0025"></a>
### UC-CFG-0025 — Retire default priority with replacement

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Choose another active default while retiring the current default.

**Expected results**

- The replacement default and retirement save together.

Sources: [backend/internal/features/configuration/taxonomy.go:165](../../../backend/internal/features/configuration/taxonomy.go#L165).

Shared business operations: `save_priority`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0026"></a>
### UC-CFG-0026 — Reject default-priority retirement without replacement

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Retire the creation default without an eligible replacement.

**Expected results**

- The service rejects the change.

Sources: [backend/internal/features/configuration/taxonomy.go:165](../../../backend/internal/features/configuration/taxonomy.go#L165).

Shared business operations: `save_priority`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0027"></a>
### UC-CFG-0027 — Restore priority

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Unretire a retained priority.

**Expected results**

- The same priority identity becomes available again.

Sources: [backend/internal/features/configuration/taxonomy.go:165](../../../backend/internal/features/configuration/taxonomy.go#L165).

Shared business operations: `save_priority`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0028"></a>
### UC-CFG-0028 — Set creation defaults

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Select active standard type, subtask type and priority defaults.

**Expected results**

- New work resolves omitted choices from the saved project defaults.

Sources: [backend/internal/features/configuration/taxonomy.go:270](../../../backend/internal/features/configuration/taxonomy.go#L270), [frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.html:51](../../../frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.html#L51).

Shared business operations: `set_project_defaults`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0029"></a>
### UC-CFG-0029 — Reject retired or foreign defaults

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Choose a default belonging to another project or a retired/ineligible choice.

**Expected results**

- The defaults change is rejected.

Sources: [backend/internal/features/configuration/taxonomy.go:270](../../../backend/internal/features/configuration/taxonomy.go#L270).

Shared business operations: `set_project_defaults`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go).

Note: Native surface correction: Default selectors enumerate scoped active choices; a foreign or retired raw default ID is not a native option.

<a id="uc-cfg-0030"></a>
### UC-CFG-0030 — Reject default changes before native mode

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Change native creation defaults while legacy mode is active.

**Expected results**

- The service asks for modern access rather than silently changing fixed legacy behavior.

Sources: [backend/internal/features/configuration/taxonomy.go:270](../../../backend/internal/features/configuration/taxonomy.go#L270).

Shared business operations: `set_project_defaults`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native.spec.ts](../../../frontend/e2e/coverage-configuration-native.spec.ts).

<a id="uc-cfg-0031"></a>
### UC-CFG-0031 — List typed fields

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Open Custom fields.

**Expected results**

- Field names, value kinds, requirements and retirement flags are listed.

Sources: [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210), [backend/internal/features/configuration/field_reads.go:18](../../../backend/internal/features/configuration/field_reads.go#L18).

Shared business operations: `list_fields`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0032"></a>
### UC-CFG-0032 — Page fields

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Request another field-definition page.

**Expected results**

- Further project-scoped definitions load with a scoped cursor.

Sources: [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210), [backend/internal/features/configuration/field_reads.go:18](../../../backend/internal/features/configuration/field_reads.go#L18).

Shared business operations: `list_fields`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-options-native.spec.ts](../../../frontend/e2e/coverage-configuration-options-native.spec.ts).

<a id="uc-cfg-0033"></a>
### UC-CFG-0033 — Create text field

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save a new text field with optional text default.

**Expected results**

- A text-kind definition is retained.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0034"></a>
### UC-CFG-0034 — Create decimal field

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save a number field using a precise decimal default.

**Expected results**

- The decimal is retained as typed data without binary-float rounding.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0035"></a>
### UC-CFG-0035 — Create date field

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save a date field with a valid calendar-date default.

**Expected results**

- The date remains a calendar date across reads.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0036"></a>
### UC-CFG-0036 — Create choice field

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save a new choice field without an unsaved option default.

**Expected results**

- The definition is created before options can be selected as defaults.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-options-native.spec.ts](../../../frontend/e2e/coverage-configuration-options-native.spec.ts).

<a id="uc-cfg-0037"></a>
### UC-CFG-0037 — Create person field

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save a user-kind field with eligible person default.

**Expected results**

- The typed user reference is retained.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0038"></a>
### UC-CFG-0038 — Rename field

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Change a custom field display name.

**Expected results**

- The field identity and stable key remain unchanged.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0039"></a>
### UC-CFG-0039 — Change field default

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save a new valid typed creation default.

**Expected results**

- Future creation receives the default without overwriting existing issue values.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0040"></a>
### UC-CFG-0040 — Clear field default

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save a null default on an optional field.

**Expected results**

- No default value is configured for future work.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0041"></a>
### UC-CFG-0041 — Reject field stable-key rename

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Change the key of a saved field.

**Expected results**

- The service rejects changing its stable key.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go).

Note: Native surface correction: The saved custom-field key input is readonly; the exact raw key-rewrite rejection belongs to REST/MCP.

<a id="uc-cfg-0042"></a>
### UC-CFG-0042 — Change unused field kind

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Change a field kind before any values, options or transition rules use it.

**Expected results**

- The kind changes with a compatible default.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-boundaries-native.spec.ts](../../../frontend/e2e/coverage-configuration-boundaries-native.spec.ts).

<a id="uc-cfg-0043"></a>
### UC-CFG-0043 — Reject used field-kind change

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Change kind after values, options or transition rules use the field.

**Expected results**

- The service retains the original kind and rejects the mutation.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0044"></a>
### UC-CFG-0044 — Reject mismatched default kind

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save a default whose typed kind differs from its field.

**Expected results**

- The save is rejected.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go).

Note: Native surface correction: The default editor constructs its discriminated value from the selected field kind and clears it on a kind change; it cannot submit a mismatched discriminator.

<a id="uc-cfg-0045"></a>
### UC-CFG-0045 — Reject invalid default option

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Select a retired, foreign or missing option as a default.

**Expected results**

- The field save is rejected.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go).

Note: Native surface correction: The choice picker exposes current scoped active option identities; raw foreign/missing option IDs cannot be selected.

<a id="uc-cfg-0046"></a>
### UC-CFG-0046 — Reject ineligible person default

Actor: `project_admin` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Choose a person who is not eligible in the project.

**Expected results**

- The default is rejected.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-boundaries-native.spec.ts](../../../frontend/e2e/coverage-configuration-boundaries-native.spec.ts).

<a id="uc-cfg-0047"></a>
### UC-CFG-0047 — Reject blank required-text default

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Supply whitespace-only text as the default of a required text field.

**Expected results**

- The save is rejected.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-boundaries-native.spec.ts](../../../frontend/e2e/coverage-configuration-boundaries-native.spec.ts).

<a id="uc-cfg-0048"></a>
### UC-CFG-0048 — Require native model for global field requirement

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Enable Required on every issue before native mode is active.

**Expected results**

- The service rejects the requirement until native access is enabled.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0049"></a>
### UC-CFG-0049 — Require backfill before global requirement

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Enable a global requirement while existing issues lack a value.

**Expected results**

- The change is rejected with preparation/backfill guidance.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0050"></a>
### UC-CFG-0050 — Enable completed field requirement

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Enable a requirement after missing values have been filled.

**Expected results**

- The field becomes globally required for issues.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0051"></a>
### UC-CFG-0051 — Disable global requirement

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Clear Required on every issue.

**Expected results**

- The field becomes optional while values remain stored.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0052"></a>
### UC-CFG-0052 — Reject retirement while globally required

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Retire a field with a global requirement still enabled.

**Expected results**

- The service rejects incompatible requirement/retirement state.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0053"></a>
### UC-CFG-0053 — Reject retirement while transition-required

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Retire a field used by an active transition requirement.

**Expected results**

- The service requires removing that transition requirement first.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native-residual.spec.ts](../../../frontend/e2e/coverage-configuration-native-residual.spec.ts), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

Note: Transition-policy configuration is canonical in the workflows area.

<a id="uc-cfg-0054"></a>
### UC-CFG-0054 — Retire optional custom field

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Retire an optional field with no active transition requirement.

**Expected results**

- The definition/history remain retained while future use is disabled.

Sources: [backend/internal/features/configuration/fields.go:57](../../../backend/internal/features/configuration/fields.go#L57).

Shared business operations: `save_field`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0055"></a>
### UC-CFG-0055 — List choice options

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Open options for an active choice field.

**Expected results**

- Names, positions and active/retired state load.

Sources: [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210), [backend/internal/features/configuration/field_reads.go:18](../../../backend/internal/features/configuration/field_reads.go#L18).

Shared business operations: `list_field_options`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-options-native.spec.ts](../../../frontend/e2e/coverage-configuration-options-native.spec.ts).

<a id="uc-cfg-0056"></a>
### UC-CFG-0056 — Page choice options

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Request More options.

**Expected results**

- Further bounded option records are returned.

Sources: [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210), [backend/internal/features/configuration/field_reads.go:18](../../../backend/internal/features/configuration/field_reads.go#L18).

Shared business operations: `list_field_options`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-options-native.spec.ts](../../../frontend/e2e/coverage-configuration-options-native.spec.ts).

<a id="uc-cfg-0057"></a>
### UC-CFG-0057 — Add choice option

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save a new option with name and positive position.

**Expected results**

- The option becomes a usable project-field choice.

Sources: [backend/internal/features/configuration/fields.go:211](../../../backend/internal/features/configuration/fields.go#L211), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Shared business operations: `save_field_option`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-options-native.spec.ts](../../../frontend/e2e/coverage-configuration-options-native.spec.ts).

<a id="uc-cfg-0058"></a>
### UC-CFG-0058 — Rename choice option

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Edit an option name.

**Expected results**

- The name changes while issue values retain its identity.

Sources: [backend/internal/features/configuration/fields.go:211](../../../backend/internal/features/configuration/fields.go#L211).

Shared business operations: `save_field_option`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-options-native.spec.ts](../../../frontend/e2e/coverage-configuration-options-native.spec.ts).

<a id="uc-cfg-0059"></a>
### UC-CFG-0059 — Reorder choice option

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save a new positive exact option position.

**Expected results**

- The option sorts using its retained precise position.

Sources: [backend/internal/features/configuration/fields.go:211](../../../backend/internal/features/configuration/fields.go#L211).

Shared business operations: `save_field_option`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-options-native.spec.ts](../../../frontend/e2e/coverage-configuration-options-native.spec.ts).

<a id="uc-cfg-0060"></a>
### UC-CFG-0060 — Retire choice option

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Retire a nondefault option.

**Expected results**

- New selection is disabled while history remains readable.

Sources: [backend/internal/features/configuration/fields.go:211](../../../backend/internal/features/configuration/fields.go#L211).

Shared business operations: `save_field_option`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-options-native.spec.ts](../../../frontend/e2e/coverage-configuration-options-native.spec.ts).

<a id="uc-cfg-0061"></a>
### UC-CFG-0061 — Reject retiring default option

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Retire the option still selected as field default.

**Expected results**

- The service requires replacing or clearing the default first.

Sources: [backend/internal/features/configuration/fields.go:211](../../../backend/internal/features/configuration/fields.go#L211).

Shared business operations: `save_field_option`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-options-native.spec.ts](../../../frontend/e2e/coverage-configuration-options-native.spec.ts).

<a id="uc-cfg-0062"></a>
### UC-CFG-0062 — Restore choice option

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Clear retirement on a retained option.

**Expected results**

- The same option identity becomes active again.

Sources: [backend/internal/features/configuration/fields.go:211](../../../backend/internal/features/configuration/fields.go#L211).

Shared business operations: `save_field_option`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-options-native.spec.ts](../../../frontend/e2e/coverage-configuration-options-native.spec.ts).

<a id="uc-cfg-0063"></a>
### UC-CFG-0063 — Reject options on other field kinds

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save an option for a text/number/date/user field or retired field.

**Expected results**

- The service requires an active choice field.

Sources: [backend/internal/features/configuration/fields.go:211](../../../backend/internal/features/configuration/fields.go#L211).

Shared business operations: `save_field_option`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-boundaries-native.spec.ts](../../../frontend/e2e/coverage-configuration-boundaries-native.spec.ts).

<a id="uc-cfg-0064"></a>
### UC-CFG-0064 — Reject invalid option metadata

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Submit missing IDs, empty or long name, stale missing revision or nonpositive position.

**Expected results**

- The option save is rejected.

Sources: [backend/internal/features/configuration/fields.go:211](../../../backend/internal/features/configuration/fields.go#L211).

Shared business operations: `save_field_option`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go).

Note: Native surface correction: This aggregate raw-input case includes missing generated IDs/revisions that the native option form never exposes. Native name/order validation is tested independently.

<a id="uc-cfg-0065"></a>
### UC-CFG-0065 — Backfill one bounded batch

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Choose Fill missing values for a field with default.

**Expected results**

- Up to 100 missing issue values are filled and changed/remaining counts returned.

Sources: [backend/internal/features/configuration/fields.go:293](../../../backend/internal/features/configuration/fields.go#L293), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Shared business operations: `backfill_field_defaults`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0066"></a>
### UC-CFG-0066 — Continue default backfill

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Repeat batches with current state until remaining reaches zero.

**Expected results**

- Only missing values are filled and existing values are preserved.

Sources: [backend/internal/features/configuration/fields.go:293](../../../backend/internal/features/configuration/fields.go#L293), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Shared business operations: `backfill_field_defaults`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-fields-native.spec.ts](../../../frontend/e2e/coverage-configuration-fields-native.spec.ts).

<a id="uc-cfg-0067"></a>
### UC-CFG-0067 — Reject invalid backfill size

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Request fewer than one or more than 100 issues.

**Expected results**

- The service rejects the batch.

Sources: [backend/internal/features/configuration/fields.go:293](../../../backend/internal/features/configuration/fields.go#L293).

Shared business operations: `backfill_field_defaults`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go).

Note: Native surface correction: The native backfill action always requests a fixed bounded batch; there is no editable batch-size input.

<a id="uc-cfg-0068"></a>
### UC-CFG-0068 — Reject legacy backfill

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Request field-default backfill before native issue mode.

**Expected results**

- The service requires the native issue model.

Sources: [backend/internal/features/configuration/fields.go:293](../../../backend/internal/features/configuration/fields.go#L293).

Shared business operations: `backfill_field_defaults`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-boundaries-native.spec.ts](../../../frontend/e2e/coverage-configuration-boundaries-native.spec.ts).

<a id="uc-cfg-0069"></a>
### UC-CFG-0069 — Review configuration conflict

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save against an outdated configuration revision.

**Expected results**

- The draft is retained and the UI offers current configuration review before saving again.

Sources: [frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.ts:41](../../../frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.ts#L41), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Shared business operations: `save_field`, `save_issue_type`, `save_priority`, `set_project_defaults`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-boundaries-native.spec.ts](../../../frontend/e2e/coverage-configuration-boundaries-native.spec.ts).

<a id="uc-cfg-0070"></a>
### UC-CFG-0070 — Retain draft when conflict refresh fails

Actor: `project_admin` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Select Review current configuration while its reload fails.

**Expected results**

- The draft remains visible and stale save remains blocked.

Sources: [frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.ts:41](../../../frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.ts#L41), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native-residual.spec.ts](../../../frontend/e2e/coverage-configuration-native-residual.spec.ts).

Note: Browser draft/transport ownership is exercised only through real browser controls. Atomic service concurrency and replay boundaries are recorded separately as UC-CFG-0089 and UC-CFG-0090.

<a id="uc-cfg-0071"></a>
### UC-CFG-0071 — Retry uncertain configuration save

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Retry a lost accepted save using the frozen original payload/reference.

**Expected results**

- The original accepted mutation is returned without duplication.

Sources: [frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.ts:41](../../../frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.ts#L41), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Shared business operations: `save_field`, `save_field_option`, `save_issue_type`, `save_priority`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native-residual.spec.ts](../../../frontend/e2e/coverage-configuration-native-residual.spec.ts).

Note: Browser draft/transport ownership is exercised only through real browser controls. Atomic service concurrency and replay boundaries are recorded separately as UC-CFG-0089 and UC-CFG-0090.

<a id="uc-cfg-0072"></a>
### UC-CFG-0072 — Protect draft on navigation

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Leave settings with an unsaved draft and cancel navigation.

**Expected results**

- The draft remains and the current editor stays open.

Sources: [frontend/src/app/features/projects/projects.routes.ts:29](../../../frontend/src/app/features/projects/projects.routes.ts#L29), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native-residual.spec.ts](../../../frontend/e2e/coverage-configuration-native-residual.spec.ts).

<a id="uc-cfg-0073"></a>
### UC-CFG-0073 — Discard settings draft explicitly

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Confirm leaving a dirty settings editor.

**Expected results**

- Navigation completes after explicit discard.

Sources: [frontend/src/app/features/projects/projects.routes.ts:29](../../../frontend/src/app/features/projects/projects.routes.ts#L29), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native-residual.spec.ts](../../../frontend/e2e/coverage-configuration-native-residual.spec.ts).

<a id="uc-cfg-0074"></a>
### UC-CFG-0074 — Separate project editor state

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Navigate between project settings routes with delayed option/configuration replies.

**Expected results**

- The new project cannot inherit old draft, choices or late reply data.

Sources: [frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.ts:41](../../../frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.ts#L41), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native-residual.spec.ts](../../../frontend/e2e/coverage-configuration-native-residual.spec.ts).

<a id="uc-cfg-0075"></a>
### UC-CFG-0075 — Deny configuration mutation to reader

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Attempt to save configuration without project Configure permission.

**Expected results**

- The service rejects the mutation regardless of hidden web controls.

Sources: [backend/internal/features/configuration/service.go:128](../../../backend/internal/features/configuration/service.go#L128).

Shared business operations: `save_field`, `save_issue_type`, `save_priority`, `set_project_defaults`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go).

<a id="uc-cfg-0076"></a>
### UC-CFG-0076 — Read activation readiness

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Open native-mode activation readiness.

**Expected results**

- Configuration/project/default-board revisions, issue count and readiness problems are returned.

Sources: [backend/internal/features/configuration/activation.go:37](../../../backend/internal/features/configuration/activation.go#L37), [frontend/src/app/features/projects/components/project-activation/project-activation.component.ts:122](../../../frontend/src/app/features/projects/components/project-activation/project-activation.component.ts#L122).

Shared business operations: `get_project_activation`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-boundaries-native.spec.ts](../../../frontend/e2e/coverage-configuration-boundaries-native.spec.ts).

<a id="uc-cfg-0077"></a>
### UC-CFG-0077 — Explain missing default board

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Review readiness when the default board is missing or archived.

**Expected results**

- A default_board problem identifies the prerequisite.

Sources: [backend/internal/features/configuration/activation.go:37](../../../backend/internal/features/configuration/activation.go#L37).

Shared business operations: `get_project_activation`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

<a id="uc-cfg-0078"></a>
### UC-CFG-0078 — Explain filtered default board

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Review readiness when the default board has saved filters.

**Expected results**

- A default_filters problem requires complete project coverage.

Sources: [backend/internal/features/configuration/activation.go:37](../../../backend/internal/features/configuration/activation.go#L37).

Shared business operations: `get_project_activation`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

Note: Defensive historical-data acceptance: ordinary current API writes cannot produce this state because the named PostgreSQL CHECK rejects it. A guarded disposable-database fixture captures that exact validated CHECK, changes only its owned retained row while dropping/restoring the identical CHECK NOT VALID in one transaction, proves later writes remain protected, and finally repairs the row and validates the CHECK. Actual Go readiness responses and rendered UI warnings are then tested; no normal-user corruption or production schema change is claimed.

<a id="uc-cfg-0079"></a>
### UC-CFG-0079 — Explain canonical-reference gap

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Review readiness before canonical issue references are complete.

**Expected results**

- A canonical_references problem is returned.

Sources: [backend/internal/features/configuration/activation.go:37](../../../backend/internal/features/configuration/activation.go#L37).

Shared business operations: `get_project_activation`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

Note: Defensive historical-data acceptance: ordinary current API writes cannot produce this state because the named PostgreSQL CHECK rejects it. A guarded disposable-database fixture captures that exact validated CHECK, changes only its owned retained row while dropping/restoring the identical CHECK NOT VALID in one transaction, proves later writes remain protected, and finally repairs the row and validates the CHECK. Actual Go readiness responses and rendered UI warnings are then tested; no normal-user corruption or production schema change is claimed.

Note: The retained null-reference fixture also captures and restores the exact enabled issues_canonical_shape trigger within the same locked transaction. Both its new-write rejection and the restored CHECK are proved before commit; finally the owned row is repaired and the identical CHECK validated.

<a id="uc-cfg-0080"></a>
### UC-CFG-0080 — Explain stage-coverage gap

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Review readiness while open/occupied stages lack default-board mapping.

**Expected results**

- A stage_coverage problem is returned.

Sources: [backend/internal/features/configuration/activation.go:37](../../../backend/internal/features/configuration/activation.go#L37).

Shared business operations: `get_project_activation`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

<a id="uc-cfg-0081"></a>
### UC-CFG-0081 — Explain invalid creation defaults

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Review readiness with retired or ineligible type/priority/default workflows.

**Expected results**

- A creation_defaults problem is returned.

Sources: [backend/internal/features/configuration/activation.go:37](../../../backend/internal/features/configuration/activation.go#L37).

Shared business operations: `get_project_activation`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

<a id="uc-cfg-0082"></a>
### UC-CFG-0082 — Explain invalid workflow progression

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Review readiness when live/new-work workflows lack an initial stage or path to Done.

**Expected results**

- A workflow_progression problem is returned.

Sources: [backend/internal/features/configuration/activation.go:37](../../../backend/internal/features/configuration/activation.go#L37).

Shared business operations: `get_project_activation`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

Note: Workflow editing and progression repair belong to the workflows area.

<a id="uc-cfg-0083"></a>
### UC-CFG-0083 — Bound activation workflow review

Actor: `project_admin` · Kind: `performance` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Review a project with over 1000 active workflows.

**Expected results**

- The configuration_limit problem requires review instead of unbounded inspection.

Sources: [backend/internal/features/configuration/activation.go:37](../../../backend/internal/features/configuration/activation.go#L37).

Shared business operations: `get_project_activation`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

<a id="uc-cfg-0084"></a>
### UC-CFG-0084 — Confirm ready activation

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Submit explicit confirmation and exact reviewed configuration/project/board revisions.

**Expected results**

- Canonical mode activates and an attributed change is recorded.

Sources: [backend/internal/features/configuration/activation.go:123](../../../backend/internal/features/configuration/activation.go#L123), [frontend/src/app/features/projects/components/project-activation/project-activation.component.ts:122](../../../frontend/src/app/features/projects/components/project-activation/project-activation.component.ts#L122).

Shared business operations: `activate_project_core`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-boundaries-native.spec.ts](../../../frontend/e2e/coverage-configuration-boundaries-native.spec.ts).

<a id="uc-cfg-0085"></a>
### UC-CFG-0085 — Reject unconfirmed activation

Actor: `project_admin` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Submit activation without confirmation.

**Expected results**

- Validation rejects the activation.

Sources: [backend/internal/features/configuration/activation.go:123](../../../backend/internal/features/configuration/activation.go#L123).

Shared business operations: `activate_project_core`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go).

Note: Native surface correction: The ready activation submit button is disabled until explicit confirmation. The exact confirm=false service request is not a native action.

<a id="uc-cfg-0086"></a>
### UC-CFG-0086 — Reject stale activation snapshot

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Change a relevant project/configuration/board revision after readiness then activate.

**Expected results**

- The stale command conflicts instead of activating unchecked state.

Sources: [backend/internal/features/configuration/activation.go:123](../../../backend/internal/features/configuration/activation.go#L123).

Shared business operations: `activate_project_core`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-boundaries-native.spec.ts](../../../frontend/e2e/coverage-configuration-boundaries-native.spec.ts).

<a id="uc-cfg-0087"></a>
### UC-CFG-0087 — Reject unready activation

Actor: `project_admin` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Confirm activation while readiness still has problems.

**Expected results**

- The service requires resolving and reviewing prerequisites.

Sources: [backend/internal/features/configuration/activation.go:123](../../../backend/internal/features/configuration/activation.go#L123).

Shared business operations: `activate_project_core`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go), [coverage-configuration-native-residual.spec.ts](../../../frontend/e2e/coverage-configuration-native-residual.spec.ts), [coverage-board-missing-surfaces.spec.ts](../../../frontend/e2e/coverage-board-missing-surfaces.spec.ts).

<a id="uc-cfg-0088"></a>
### UC-CFG-0088 — Repeat already active mode

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Activate an already modern project using matching current snapshot.

**Expected results**

- The current configuration is returned without repeated activation effects.

Sources: [backend/internal/features/configuration/activation.go:123](../../../backend/internal/features/configuration/activation.go#L123).

Shared business operations: `activate_project_core`.

Related test files: [project-configuration.spec.ts](../../../frontend/e2e/project-configuration.spec.ts), [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [fields_test.go](../../../backend/internal/features/configuration/fields_test.go).

Note: Native surface correction: Already-active projects show current mode and Open issues; they expose no repeat-activation submit action.

<a id="uc-cfg-0089"></a>
### UC-CFG-0089 — Return current configuration on stale service mutation

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Commit one configuration change, then send an earlier expectedRevision through the real service interface.

**Expected results**

- The service returns conflict with current configuration and leaves the newer taxonomy unchanged.

Sources: [frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.ts:41](../../../frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.ts#L41), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Shared business operations: `save_field`, `save_issue_type`, `save_priority`, `set_project_defaults`.

Related test files: [coverage-configuration-mcp.spec.ts](../../../frontend/e2e/coverage-configuration-mcp.spec.ts).

Note: Atomic service boundary split from the browser-specific draft/retry journeys UC-CFG-0070 and UC-CFG-0071.

<a id="uc-cfg-0090"></a>
### UC-CFG-0090 — Replay accepted configuration command exactly once

Actor: `project_admin` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has the stated role in a current project; mutations use its latest configuration revision unless a conflict case states otherwise.

**Steps**

1. Save a configuration change, then repeat the same accepted payload and retryReference.

**Expected results**

- The replay retains the original result, revision and event ID, marks its receipt replayed, and creates no duplicate taxonomy entry.

Sources: [frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.ts:41](../../../frontend/src/app/features/projects/pages/project-configuration/project-configuration.page.ts#L41), [frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts:210](../../../frontend/src/app/features/projects/pages/project-fields/project-fields.page.ts#L210).

Shared business operations: `save_field`, `save_issue_type`, `save_priority`, `set_project_defaults`.

Related test files: [coverage-configuration-mcp.spec.ts](../../../frontend/e2e/coverage-configuration-mcp.spec.ts).

Note: Atomic service boundary split from the browser-specific draft/retry journeys UC-CFG-0070 and UC-CFG-0071.
