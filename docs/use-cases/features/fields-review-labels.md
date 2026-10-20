# Issue custom values, approval execution and reusable labels

Value behaviors separate from definition settings; review is a revision-bound transition context with immutable votes, not an independent approval request object.

[Catalog index](../README.md) · [Roles](../roles.md) · [Known gaps](../gaps.md)

Source-inspected use cases. Runtime verification in this documentation run: **not run**. Related test files are pointers, not assertions of coverage or success.

## Source map

- `fieldUi`: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29)
- `fieldDraft`: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133)
- `fieldSave`: [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152)
- `fieldValidate`: [backend/internal/features/issues/custom_fields.go:286](../../../backend/internal/features/issues/custom_fields.go#L286)
- `creationValues`: [backend/internal/features/issues/custom_fields.go:354](../../../backend/internal/features/issues/custom_fields.go#L354)
- `decimal`: [backend/internal/platform/command/field_values.go:26](../../../backend/internal/platform/command/field_values.go#L26)
- `fieldSql`: [backend/internal/features/issues/custom_field_queries.sql:26](../../../backend/internal/features/issues/custom_field_queries.sql#L26)
- `fieldBackfill`: [backend/internal/features/issues/custom_fields.go:413](../../../backend/internal/features/issues/custom_fields.go#L413)
- `reviewUi`: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30)
- `reviewActions`: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:308](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L308)
- `reviewRules`: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80)
- `vote`: [backend/internal/features/issues/approvals.go:256](../../../backend/internal/features/issues/approvals.go#L256)
- `resubmit`: [backend/internal/features/issues/approvals.go:344](../../../backend/internal/features/issues/approvals.go#L344)
- `voteSql`: [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6)
- `moveRules`: [backend/internal/features/issues/canonical_move.go:78](../../../backend/internal/features/issues/canonical_move.go#L78)
- `transitionFields`: [backend/internal/features/issues/approvals.go:425](../../../backend/internal/features/issues/approvals.go#L425)
- `statusRefresh`: [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts:89](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts#L89)
- `labelUi`: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27)
- `labelCreate`: [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48)
- `labelRead`: [backend/internal/features/issues/dates_labels.go:97](../../../backend/internal/features/issues/dates_labels.go#L97)
- `fieldMcp`: [backend/internal/features/issues/field_mcp.go:9](../../../backend/internal/features/issues/field_mcp.go#L9)
- `gap_gap_fld_002`: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:147](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L147)
- `gap_gap_fld_003`: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:250](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L250)

## Cases

<a id="uc-fld-0001"></a>
### UC-FLD-0001 — Read issue custom values

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open custom fields on existing issue.

**Expected results**

- Actual stored values load; missing values do not acquire creation defaults.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133).

Shared business operations: `get_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-fld-0002"></a>
### UC-FLD-0002 — Show creation defaults

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Open create issue/subtask custom fields.

**Expected results**

- Current configured defaults display.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133), [backend/internal/features/issues/custom_fields.go:354](../../../backend/internal/features/issues/custom_fields.go#L354).

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

<a id="uc-fld-0003"></a>
### UC-FLD-0003 — Use omitted creation default

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create without supplying an assignment.

**Expected results**

- Configured active-field default is stored.

Sources: [backend/internal/features/issues/custom_fields.go:354](../../../backend/internal/features/issues/custom_fields.go#L354).

Shared business operations: `create_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0004"></a>
### UC-FLD-0004 — Override creation default

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create with explicit field assignment.

**Expected results**

- Provided value replaces default for that issue.

Sources: [backend/internal/features/issues/custom_fields.go:354](../../../backend/internal/features/issues/custom_fields.go#L354).

Shared business operations: `create_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0005"></a>
### UC-FLD-0005 — Clear optional creation default

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create with explicit null optional assignment.

**Expected results**

- Null suppresses default instead of treating assignment as omitted.

Sources: [backend/internal/features/issues/custom_fields.go:354](../../../backend/internal/features/issues/custom_fields.go#L354).

Shared business operations: `create_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0006"></a>
### UC-FLD-0006 — Create text value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create issue with Arabic or mixed Unicode text.

**Expected results**

- Typed text value is stored atomically with issue.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [backend/internal/features/issues/custom_fields.go:354](../../../backend/internal/features/issues/custom_fields.go#L354).

Shared business operations: `create_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0007"></a>
### UC-FLD-0007 — Edit text value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Change text value and choose Save fields.

**Expected results**

- New typed text value persists.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0008"></a>
### UC-FLD-0008 — Clear optional text value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Empty/clear optional text and choose Save fields.

**Expected results**

- Stored value is removed rather than replaced by default.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0009"></a>
### UC-FLD-0009 — Create number value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create issue with an exact decimal string.

**Expected results**

- Typed number value is stored atomically with issue.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [backend/internal/features/issues/custom_fields.go:354](../../../backend/internal/features/issues/custom_fields.go#L354).

Shared business operations: `create_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0010"></a>
### UC-FLD-0010 — Edit number value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Change number value and choose Save fields.

**Expected results**

- New typed number value persists.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0011"></a>
### UC-FLD-0011 — Clear optional number value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Empty/clear optional number and choose Save fields.

**Expected results**

- Stored value is removed rather than replaced by default.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0012"></a>
### UC-FLD-0012 — Create date value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create issue with a calendar date.

**Expected results**

- Typed date value is stored atomically with issue.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [backend/internal/features/issues/custom_fields.go:354](../../../backend/internal/features/issues/custom_fields.go#L354).

Shared business operations: `create_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0013"></a>
### UC-FLD-0013 — Edit date value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Change date value and choose Save fields.

**Expected results**

- New typed date value persists.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0014"></a>
### UC-FLD-0014 — Clear optional date value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Empty/clear optional date and choose Save fields.

**Expected results**

- Stored value is removed rather than replaced by default.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0015"></a>
### UC-FLD-0015 — Create choice value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create issue with an active field-option ID.

**Expected results**

- Typed choice value is stored atomically with issue.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [backend/internal/features/issues/custom_fields.go:354](../../../backend/internal/features/issues/custom_fields.go#L354).

Shared business operations: `create_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0016"></a>
### UC-FLD-0016 — Edit choice value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Change choice value and choose Save fields.

**Expected results**

- New typed choice value persists.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0017"></a>
### UC-FLD-0017 — Clear optional choice value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Empty/clear optional choice and choose Save fields.

**Expected results**

- Stored value is removed rather than replaced by default.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0018"></a>
### UC-FLD-0018 — Create person value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create issue with an eligible project user ID.

**Expected results**

- Typed user value is stored atomically with issue.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [backend/internal/features/issues/custom_fields.go:354](../../../backend/internal/features/issues/custom_fields.go#L354).

Shared business operations: `create_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0019"></a>
### UC-FLD-0019 — Edit person value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Change person value and choose Save fields.

**Expected results**

- New typed user value persists.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0020"></a>
### UC-FLD-0020 — Clear optional person value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Empty/clear optional person and choose Save fields.

**Expected results**

- Stored value is removed rather than replaced by default.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0021"></a>
### UC-FLD-0021 — Preserve large decimal precision

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save a decimal beyond JavaScript safe integer range.

**Expected results**

- All accepted integer/fractional digits survive round-trip without floats.

Sources: [backend/internal/platform/command/field_values.go:26](../../../backend/internal/platform/command/field_values.go#L26), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0022"></a>
### UC-FLD-0022 — Normalize decimal trailing zeros

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save a valid decimal ending in fractional zeros.

**Expected results**

- Canonical result trims redundant fractional zeros without changing value.

Sources: [backend/internal/platform/command/field_values.go:26](../../../backend/internal/platform/command/field_values.go#L26), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0023"></a>
### UC-FLD-0023 — Normalize negative zero

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save negative zero.

**Expected results**

- Canonical result is zero.

Sources: [backend/internal/platform/command/field_values.go:26](../../../backend/internal/platform/command/field_values.go#L26), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0024"></a>
### UC-FLD-0024 — Reject numeric JSON literal

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit number field as JSON numeric literal.

**Expected results**

- Typed contract rejects it rather than float-converting.

Sources: [backend/internal/platform/command/field_values.go:26](../../../backend/internal/platform/command/field_values.go#L26).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-fld-0025"></a>
### UC-FLD-0025 — Reject excess integer precision

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit decimal with more than 28 integer digits.

**Expected results**

- Value rejects rather than rounding.

Sources: [backend/internal/platform/command/field_values.go:26](../../../backend/internal/platform/command/field_values.go#L26).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-fld-0026"></a>
### UC-FLD-0026 — Reject excess fractional precision

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit decimal with more than 10 fractional digits.

**Expected results**

- Value rejects rather than rounding.

Sources: [backend/internal/platform/command/field_values.go:26](../../../backend/internal/platform/command/field_values.go#L26).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-fld-0027"></a>
### UC-FLD-0027 — Reject exponent numeric notation

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit exponent-form decimal string.

**Expected results**

- Exact decimal format rejects exponent notation.

Sources: [backend/internal/platform/command/field_values.go:26](../../../backend/internal/platform/command/field_values.go#L26).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-fld-0028"></a>
### UC-FLD-0028 — Reject malformed decimal

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit malformed signed/decimal text.

**Expected results**

- Invalid number is rejected with draft retained.

Sources: [backend/internal/platform/command/field_values.go:26](../../../backend/internal/platform/command/field_values.go#L26), [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-FLD-0075](../features/fields-review-labels.md#uc-fld-0075).

Note: Surface correction: Appending/displaying picker results or preserving/reviewing an editor draft is native client state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-fld-0029"></a>
### UC-FLD-0029 — Reject overlong text value

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit more than 5000 Unicode text characters.

**Expected results**

- Typed text validation rejects.

Sources: [backend/internal/platform/command/field_values.go:26](../../../backend/internal/platform/command/field_values.go#L26).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-FLD-0086](../features/fields-review-labels.md#uc-fld-0086).

Note: Surface correction: The native text input has maxlength 5000 and does not send an overlong text draft through ordinary typing. The original raw Unicode text validation remains required on REST/MCP.

<a id="uc-fld-0030"></a>
### UC-FLD-0030 — Reject invalid custom calendar date

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit invalid custom date.

**Expected results**

- Typed date validation rejects.

Sources: [backend/internal/platform/command/field_values.go:26](../../../backend/internal/platform/command/field_values.go#L26).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-FLD-0012](../features/fields-review-labels.md#uc-fld-0012), [UC-FLD-0013](../features/fields-review-labels.md#uc-fld-0013).

Note: Surface correction: The native calendar input uses type=date; an impossible calendar string is not a selectable native value. The original typed calendar rejection remains required on REST/MCP.

<a id="uc-fld-0031"></a>
### UC-FLD-0031 — Reject wrong value kind

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit value kind different from field definition.

**Expected results**

- No field changes commit.

Sources: [backend/internal/features/issues/custom_fields.go:286](../../../backend/internal/features/issues/custom_fields.go#L286).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-FLD-0006](../features/fields-review-labels.md#uc-fld-0006), [UC-FLD-0009](../features/fields-review-labels.md#uc-fld-0009), [UC-FLD-0012](../features/fields-review-labels.md#uc-fld-0012), [UC-FLD-0015](../features/fields-review-labels.md#uc-fld-0015), [UC-FLD-0018](../features/fields-review-labels.md#uc-fld-0018).

Note: Surface correction: Each native field renders the control selected by its fixed definition kind; there is no value-kind selector. A mismatching discriminated value is a raw REST/MCP boundary.

<a id="uc-fld-0032"></a>
### UC-FLD-0032 — Reject mixed value slots

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit more than one typed value slot.

**Expected results**

- Discriminated value validation rejects.

Sources: [backend/internal/platform/command/field_values.go:26](../../../backend/internal/platform/command/field_values.go#L26).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-fld-0033"></a>
### UC-FLD-0033 — Reject unknown value kind

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit an unknown kind.

**Expected results**

- Typed value validation rejects.

Sources: [backend/internal/platform/command/field_values.go:26](../../../backend/internal/platform/command/field_values.go#L26).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-fld-0034"></a>
### UC-FLD-0034 — Search loaded choice options

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Type in choice picker.

**Expected results**

- Matching active options from loaded pages display.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29).

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Gaps: [GAP-FLD-001](../gaps.md#gap-fld-001).

Note: Choice search currently filters loaded options locally; More loads further pages.

<a id="uc-fld-0035"></a>
### UC-FLD-0035 — Page choice options

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Request more options.

**Expected results**

- Additional options append and enter local search.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29).

Shared business operations: `list_field_options`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Gaps: [GAP-FLD-001](../gaps.md#gap-fld-001).

Related cases: [UC-FLD-0076](../features/fields-review-labels.md#uc-fld-0076).

Note: Surface correction: Appending/displaying picker results or preserving/reviewing an editor draft is native client state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-fld-0036"></a>
### UC-FLD-0036 — Retain selected retired option

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open issue containing retired option.

**Expected results**

- Existing selected option remains visible with retired detail.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29).

Shared business operations: `get_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-FLD-0077](../features/fields-review-labels.md#uc-fld-0077).

Note: Surface correction: Appending/displaying picker results or preserving/reviewing an editor draft is native client state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-fld-0037"></a>
### UC-FLD-0037 — Reject new retired option

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Change choice to retired option.

**Expected results**

- Changed value is rejected.

Sources: [backend/internal/features/issues/custom_fields.go:286](../../../backend/internal/features/issues/custom_fields.go#L286).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0038"></a>
### UC-FLD-0038 — Reject foreign field option

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Select option belonging to another field/project.

**Expected results**

- Scope validation rejects.

Sources: [backend/internal/features/issues/custom_fields.go:286](../../../backend/internal/features/issues/custom_fields.go#L286).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-FLD-0083](../features/fields-review-labels.md#uc-fld-0083).

Note: Surface correction: Native choice lookup uses the current definition field and project scope. Options owned by another field/project cannot be selected; raw foreign option identifiers remain rejected by REST/MCP.

<a id="uc-fld-0039"></a>
### UC-FLD-0039 — Search person field

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Type teammate query.

**Expected results**

- Latest eligible project person candidates load live.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29).

Shared business operations: `list_mention_candidates`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-COM-0136](../features/collaboration.md#uc-com-0136).

Note: Surface correction: Displaying the latest eligible people while typing is native custom-person picker behavior. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-fld-0040"></a>
### UC-FLD-0040 — Page person choices

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Request further person candidates.

**Expected results**

- Next candidates append.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29).

Shared business operations: `list_mention_candidates`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-FLD-0078](../features/fields-review-labels.md#uc-fld-0078).

Note: Surface correction: Appending/displaying picker results or preserving/reviewing an editor draft is native client state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-fld-0041"></a>
### UC-FLD-0041 — Choose viewer as person value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Select an active project viewer as custom person value.

**Expected results**

- Viewer ID is accepted for this field.

Sources: [backend/internal/features/issues/custom_field_queries.sql:26](../../../backend/internal/features/issues/custom_field_queries.sql#L26), [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

Note: Person-field eligibility includes readers; assignee eligibility is narrower.

<a id="uc-fld-0042"></a>
### UC-FLD-0042 — Reject disabled person value

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save changed person field after selected user becomes disabled.

**Expected results**

- Current eligibility rejects assignment.

Sources: [backend/internal/features/issues/custom_fields.go:286](../../../backend/internal/features/issues/custom_fields.go#L286), [backend/internal/features/issues/custom_field_queries.sql:26](../../../backend/internal/features/issues/custom_field_queries.sql#L26).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0043"></a>
### UC-FLD-0043 — Reject removed person value

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save changed person field after selected user loses project access.

**Expected results**

- Current eligibility rejects assignment.

Sources: [backend/internal/features/issues/custom_fields.go:286](../../../backend/internal/features/issues/custom_fields.go#L286), [backend/internal/features/issues/custom_field_queries.sql:26](../../../backend/internal/features/issues/custom_field_queries.sql#L26).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0044"></a>
### UC-FLD-0044 — Reject unapproved person value

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save changed person field for unapproved user.

**Expected results**

- Current eligibility rejects assignment.

Sources: [backend/internal/features/issues/custom_fields.go:286](../../../backend/internal/features/issues/custom_fields.go#L286), [backend/internal/features/issues/custom_field_queries.sql:26](../../../backend/internal/features/issues/custom_field_queries.sql#L26).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0045"></a>
### UC-FLD-0045 — Require field at creation

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create while globally required field is missing.

**Expected results**

- Entire issue creation rejects.

Sources: [backend/internal/features/issues/custom_fields.go:354](../../../backend/internal/features/issues/custom_fields.go#L354), [backend/internal/features/issues/custom_fields.go:286](../../../backend/internal/features/issues/custom_fields.go#L286).

Shared business operations: `create_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-fld-0046"></a>
### UC-FLD-0046 — Prevent required value clearing

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Clear globally required value.

**Expected results**

- Save rejects and previous values remain.

Sources: [backend/internal/features/issues/custom_fields.go:286](../../../backend/internal/features/issues/custom_fields.go#L286).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0047"></a>
### UC-FLD-0047 — Reject whitespace required text

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save whitespace-only required text.

**Expected results**

- Missing meaningful text is rejected.

Sources: [backend/internal/features/issues/custom_fields.go:286](../../../backend/internal/features/issues/custom_fields.go#L286).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0048"></a>
### UC-FLD-0048 — Read retired field value

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open a retired field.

**Expected results**

- Historical value is rendered read-only.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133).

Shared business operations: `get_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Gaps: [GAP-FLD-002](../gaps.md#gap-fld-002).

Related cases: [UC-FLD-0079](../features/fields-review-labels.md#uc-fld-0079).

Note: Surface correction: Appending/displaying picker results or preserving/reviewing an editor draft is native client state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-fld-0049"></a>
### UC-FLD-0049 — Retain unchanged retired value

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Resubmit unchanged retired field value.

**Expected results**

- Historical value is retained as a no-op.

Sources: [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0050"></a>
### UC-FLD-0050 — Reject retired field replacement

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Change value of retired field.

**Expected results**

- Historical field cannot receive new value.

Sources: [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0051"></a>
### UC-FLD-0051 — Reject retired field clearing

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Clear value of retired field.

**Expected results**

- Historical field value cannot be removed through normal edit.

Sources: [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0052"></a>
### UC-FLD-0052 — Save fields atomically

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save several changed values with one invalid value.

**Expected results**

- No partial field changes commit.

Sources: [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0053"></a>
### UC-FLD-0053 — Discard field draft

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Discard draft.

**Expected results**

- Draft clears and stored values reload.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133).

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

<a id="uc-fld-0054"></a>
### UC-FLD-0054 — Restore field draft

Actor: `writer` · Kind: `lifecycle` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Return to same-tab issue field draft.

**Expected results**

- Draft values and original issue revision restore.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133).

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

<a id="uc-fld-0055"></a>
### UC-FLD-0055 — Review stale field draft

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save draft after issue revision changed.

**Expected results**

- Conflict preserves draft and requires review.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

Related cases: [UC-FLD-0080](../features/fields-review-labels.md#uc-fld-0080).

Note: Surface correction: Appending/displaying picker results or preserving/reviewing an editor draft is native client state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-fld-0056"></a>
### UC-FLD-0056 — Apply reviewed field draft

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Review current issue, then save.

**Expected results**

- Latest issue revision is used while edited values remain.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

Related cases: [UC-FLD-0080](../features/fields-review-labels.md#uc-fld-0080), [UC-FLD-0007](../features/fields-review-labels.md#uc-fld-0007).

Note: Surface correction: Reviewing a preserved local draft and applying its chosen revision is a native action. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-fld-0057"></a>
### UC-FLD-0057 — Replay uncertain field save

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Retry original accepted save after response loss.

**Expected results**

- Frozen request/reference replays once.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-fld-0058"></a>
### UC-FLD-0058 — Lock uncertain field values

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Attempt editing while original save pending.

**Expected results**

- Editors are disabled to preserve original payload.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133).

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

<a id="uc-fld-0059"></a>
### UC-FLD-0059 — Correct field validation failure

Actor: `writer` · Kind: `failure` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Edit after definite validation failure.

**Expected results**

- Pending intent clears for corrected submission.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133).

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

<a id="uc-fld-0060"></a>
### UC-FLD-0060 — Avoid no-op field revision

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save all values unchanged.

**Expected results**

- Issue revision and audit event do not advance.

Sources: [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0061"></a>
### UC-FLD-0061 — Record accepted field change

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save actual changed value.

**Expected results**

- Issue revision advances and before/after audit change is recorded.

Sources: [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0062"></a>
### UC-FLD-0062 — Page field definitions

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose More fields.

**Expected results**

- Definitions and actual stored values append.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133).

Shared business operations: `get_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

Related cases: [UC-FLD-0081](../features/fields-review-labels.md#uc-fld-0081).

Note: Surface correction: Appending/displaying picker results or preserving/reviewing an editor draft is native client state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-fld-0063"></a>
### UC-FLD-0063 — Prevent paging dirty fields

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Edit field before requesting More fields.

**Expected results**

- Paging is disabled until draft resolved.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133).

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

<a id="uc-fld-0064"></a>
### UC-FLD-0064 — Reject stale field cursor

Actor: `reader` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Continue field page after issue/configuration changes.

**Expected results**

- Scoped cursor cannot continue stale state.

Sources: [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `get_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

<a id="uc-fld-0065"></a>
### UC-FLD-0065 — Protect viewer custom fields

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Open custom fields as viewer.

**Expected results**

- Values readable, editors disabled, direct write rejected.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-FLD-0082](../features/fields-review-labels.md#uc-fld-0082).

Note: Surface correction: Disabled editor controls require native proof independently of service authorization. Original expected behavior is unchanged and requires native-client assertions.

<a id="uc-fld-0066"></a>
### UC-FLD-0066 — Reject foreign field assignment

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit field ID from another project.

**Expected results**

- No values commit.

Sources: [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-FLD-0085](../features/fields-review-labels.md#uc-fld-0085).

Note: Surface correction: Native issue fields are loaded only from the owning project and expose no arbitrary field identifier input. Foreign field assignment rejection remains required on REST/MCP.

<a id="uc-fld-0067"></a>
### UC-FLD-0067 — Reject zero field ID

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit zero field ID.

**Expected results**

- Assignment validation rejects.

Sources: [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-fld-0068"></a>
### UC-FLD-0068 — Reject duplicate field IDs

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit repeated field ID assignments.

**Expected results**

- Assignment validation rejects.

Sources: [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-fld-0069"></a>
### UC-FLD-0069 — Reject empty update batch

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit zero edit assignments.

**Expected results**

- Update requires 1-100 assignments.

Sources: [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-fld-0070"></a>
### UC-FLD-0070 — Reject oversized update batch

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit more than 100 edit assignments.

**Expected results**

- Update batch rejects.

Sources: [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-fld-0071"></a>
### UC-FLD-0071 — Backfill missing default

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current configuration access to the relevant project.

**Steps**

1. Run a configured active-field default backfill.

**Expected results**

- Only missing values receive default in bounded batches; affected issue revisions/events advance.

Sources: [backend/internal/features/issues/custom_fields.go:413](../../../backend/internal/features/issues/custom_fields.go#L413).

Shared business operations: `backfill_field_defaults`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-fld-0072"></a>
### UC-FLD-0072 — Retain explicit value in backfill

Actor: `project_admin` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current configuration access to the relevant project.

**Steps**

1. Backfill field on issue with explicit value.

**Expected results**

- Existing stored value remains unchanged.

Sources: [backend/internal/features/issues/custom_fields.go:413](../../../backend/internal/features/issues/custom_fields.go#L413).

Shared business operations: `backfill_field_defaults`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

<a id="uc-apr-0001"></a>
### UC-APR-0001 — Read transition review choices

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Open Review and approvals.

**Expected results**

- Assigned workflow transitions/stage names load.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30).

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

<a id="uc-apr-0002"></a>
### UC-APR-0002 — Select review context

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose a transition.

**Expected results**

- Current review context and retained votes load without executing/requesting a move.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30).

Shared business operations: `get_issue_approvals`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-apr-0003"></a>
### UC-APR-0003 — Page review move choices

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose More moves.

**Expected results**

- Additional workflow transitions append.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30).

Shared business operations: `list_workflow_transitions`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-APR-0058](../features/fields-review-labels.md#uc-apr-0058).

Note: Surface correction: Native selection, labels, popup reopening and appending are distinct from returned service state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-apr-0004"></a>
### UC-APR-0004 — Page review stage names

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose More stage names.

**Expected results**

- Further names replace fallback identifiers.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30).

Shared business operations: `list_workflow_stages`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-APR-0059](../features/fields-review-labels.md#uc-apr-0059).

Note: Surface correction: Native selection, labels, popup reopening and appending are distinct from returned service state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-apr-0005"></a>
### UC-APR-0005 — Clear review selection

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose empty transition.

**Expected results**

- Review context clears without mutation.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30).

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

<a id="uc-apr-0006"></a>
### UC-APR-0006 — Display approval count

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read active review context.

**Expected results**

- Approved/required count is displayed.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30).

Shared business operations: `get_issue_approvals`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

Related cases: [UC-APR-0060](../features/fields-review-labels.md#uc-apr-0060).

Note: Surface correction: Native selection, labels, popup reopening and appending are distinct from returned service state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-apr-0007"></a>
### UC-APR-0007 — Approve current review

Actor: `reviewer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Choose Approve as eligible reviewer.

**Expected results**

- Immutable current-context decision is recorded with identity/time/revisions.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30), [backend/internal/features/issues/approvals.go:256](../../../backend/internal/features/issues/approvals.go#L256).

Shared business operations: `vote_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-apr-0008"></a>
### UC-APR-0008 — Request changes

Actor: `reviewer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Choose Request changes as eligible reviewer.

**Expected results**

- Rejection is retained and Changes requested appears.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30), [backend/internal/features/issues/approvals.go:256](../../../backend/internal/features/issues/approvals.go#L256).

Shared business operations: `vote_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

Related cases: [UC-APR-0061](../features/fields-review-labels.md#uc-apr-0061).

Note: Surface correction: Native selection, labels, popup reopening and appending are distinct from returned service state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-apr-0009"></a>
### UC-APR-0009 — Hide repeat vote controls

Actor: `reviewer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Open context after current reviewer already voted.

**Expected results**

- Approve/Request changes controls are absent.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30).

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

<a id="uc-apr-0010"></a>
### UC-APR-0010 — Repeat identical decision

Actor: `reviewer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Submit same current-context decision again.

**Expected results**

- No duplicate vote or issue-content revision.

Sources: [backend/internal/features/issues/approvals.go:256](../../../backend/internal/features/issues/approvals.go#L256).

Shared business operations: `vote_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0011"></a>
### UC-APR-0011 — Reject changing retained decision

Actor: `reviewer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Submit opposite decision within same context.

**Expected results**

- Validation requires resubmission rather than replacing immutable vote.

Sources: [backend/internal/features/issues/approvals.go:256](../../../backend/internal/features/issues/approvals.go#L256).

Shared business operations: `vote_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0012"></a>
### UC-APR-0012 — Count distinct simultaneous reviewers

Actor: `reviewer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Two eligible people approve same current context concurrently.

**Expected results**

- Both distinct votes count without advancing issue content revision.

Sources: [backend/internal/features/issues/approvals.go:256](../../../backend/internal/features/issues/approvals.go#L256), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `vote_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0013"></a>
### UC-APR-0013 — Satisfy threshold

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Record enough eligible approvals without rejection.

**Expected results**

- Review requirements satisfied appears.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `get_issue_approvals`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0014"></a>
### UC-APR-0014 — Let rejection veto threshold

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Record eligible rejection despite enough approvals.

**Expected results**

- Review remains unsatisfied.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `get_issue_approvals`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0015"></a>
### UC-APR-0015 — Resubmit fresh context

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose Resubmit for review.

**Expected results**

- Issue revision advances; old decisions remain history but no longer count.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30), [backend/internal/features/issues/approvals.go:344](../../../backend/internal/features/issues/approvals.go#L344).

Shared business operations: `resubmit_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0016"></a>
### UC-APR-0016 — Vote after resubmission

Actor: `reviewer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Vote in fresh resubmitted context.

**Expected results**

- New immutable decision belongs to new revision context.

Sources: [backend/internal/features/issues/approvals.go:256](../../../backend/internal/features/issues/approvals.go#L256), [backend/internal/features/issues/approvals.go:344](../../../backend/internal/features/issues/approvals.go#L344).

Shared business operations: `vote_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0017"></a>
### UC-APR-0017 — Execute approved issue move

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose approved target in normal status menu.

**Expected results**

- Issue transitions separately from voting.

Sources: [backend/internal/features/issues/canonical_move.go:78](../../../backend/internal/features/issues/canonical_move.go#L78), [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts:89](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts#L89).

Shared business operations: `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

Related cases: [UC-APR-0062](../features/fields-review-labels.md#uc-apr-0062).

Note: Surface correction: Native selection, labels, popup reopening and appending are distinct from returned service state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-apr-0018"></a>
### UC-APR-0018 — Execute approved board move

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move approved card to target board column.

**Expected results**

- Shared move service applies current review requirement.

Sources: [backend/internal/features/issues/canonical_move.go:78](../../../backend/internal/features/issues/canonical_move.go#L78).

Shared business operations: `move_board_card_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-board-native-approvals.spec.ts](../../../frontend/e2e/coverage-board-native-approvals.spec.ts).

<a id="uc-apr-0019"></a>
### UC-APR-0019 — Execute approved bulk move

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Apply target stage to selected approved issue.

**Expected results**

- Per-issue current approvals are checked.

Sources: [backend/internal/features/issues/canonical_move.go:78](../../../backend/internal/features/issues/canonical_move.go#L78).

Shared business operations: `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-board-native-approvals.spec.ts](../../../frontend/e2e/coverage-board-native-approvals.spec.ts).

<a id="uc-apr-0020"></a>
### UC-APR-0020 — Reject insufficient approvals

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move before threshold is reached.

**Expected results**

- Stage remains unchanged.

Sources: [backend/internal/features/issues/canonical_move.go:78](../../../backend/internal/features/issues/canonical_move.go#L78).

Shared business operations: `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0021"></a>
### UC-APR-0021 — Reject currently rejected review

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move while eligible current rejection exists.

**Expected results**

- Move remains blocked until fresh valid review.

Sources: [backend/internal/features/issues/canonical_move.go:78](../../../backend/internal/features/issues/canonical_move.go#L78).

Shared business operations: `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0022"></a>
### UC-APR-0022 — Enforce transition assignee

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move with enough approvals but missing assignee.

**Expected results**

- Transition field requirement rejects move without changing stage.

Sources: [backend/internal/features/issues/approvals.go:425](../../../backend/internal/features/issues/approvals.go#L425), [backend/internal/features/issues/canonical_move.go:78](../../../backend/internal/features/issues/canonical_move.go#L78).

Shared business operations: `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0023"></a>
### UC-APR-0023 — Enforce transition due date

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move with enough approvals but missing due date.

**Expected results**

- Transition field requirement rejects move without changing stage.

Sources: [backend/internal/features/issues/approvals.go:425](../../../backend/internal/features/issues/approvals.go#L425), [backend/internal/features/issues/canonical_move.go:78](../../../backend/internal/features/issues/canonical_move.go#L78).

Shared business operations: `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0024"></a>
### UC-APR-0024 — Enforce transition meaningful description

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move with enough approvals but missing meaningful description.

**Expected results**

- Transition field requirement rejects move without changing stage.

Sources: [backend/internal/features/issues/approvals.go:425](../../../backend/internal/features/issues/approvals.go#L425), [backend/internal/features/issues/canonical_move.go:78](../../../backend/internal/features/issues/canonical_move.go#L78).

Shared business operations: `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0025"></a>
### UC-APR-0025 — Enforce transition required custom value

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move with enough approvals but missing required custom value.

**Expected results**

- Transition field requirement rejects move without changing stage.

Sources: [backend/internal/features/issues/approvals.go:425](../../../backend/internal/features/issues/approvals.go#L425), [backend/internal/features/issues/canonical_move.go:78](../../../backend/internal/features/issues/canonical_move.go#L78).

Shared business operations: `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0026"></a>
### UC-APR-0026 — Keep completion guards after approval

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move approved issue to Done with unfinished prerequisites.

**Expected results**

- Blocker/subtask completion guard still rejects.

Sources: [backend/internal/features/issues/canonical_move.go:78](../../../backend/internal/features/issues/canonical_move.go#L78).

Shared business operations: `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0027"></a>
### UC-APR-0027 — Keep transition administrator guard

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move approved issue through administrator-only transition as member.

**Expected results**

- Permission rejects despite enough approvals.

Sources: [backend/internal/features/issues/canonical_move.go:78](../../../backend/internal/features/issues/canonical_move.go#L78).

Shared business operations: `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0028"></a>
### UC-APR-0028 — Exclude reporter from voting

Actor: `reviewer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Reporter attempts vote under exclude-reporter rule.

**Expected results**

- Vote rejects and retained reporter decision does not count.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `vote_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-APR-0069](../features/fields-review-labels.md#uc-apr-0069).

Note: Surface correction: The native approval context marks the reporter ineligible when reporter exclusion is enabled and therefore offers no vote action. Policy changes also change the review revision token, so a stale native request exercises context conflict; direct reporter-ineligible request rejection remains independently required on REST/MCP.

<a id="uc-apr-0029"></a>
### UC-APR-0029 — Enforce administrator reviewer role

Actor: `reviewer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Member votes when rule requires project administrator.

**Expected results**

- Vote rejected as ineligible.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `vote_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0030"></a>
### UC-APR-0030 — Allow administrator reviewer

Actor: `reviewer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Eligible project/company administrator votes under admin rule.

**Expected results**

- Vote counts.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `vote_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0031"></a>
### UC-APR-0031 — Allow member reviewer

Actor: `reviewer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Eligible member votes under member rule.

**Expected results**

- Vote counts.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `vote_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0032"></a>
### UC-APR-0032 — Reject viewer reviewer

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Viewer attempts review vote.

**Expected results**

- Current write/reviewer eligibility rejects.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `vote_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0033"></a>
### UC-APR-0033 — Invalidate vote after removed membership

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read/execute review after reviewer has removed membership.

**Expected results**

- Retained decision remains history but no longer counts.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `get_issue_approvals`, `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0034"></a>
### UC-APR-0034 — Invalidate vote after disabled account

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read/execute review after reviewer has disabled account.

**Expected results**

- Retained decision remains history but no longer counts.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `get_issue_approvals`, `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0035"></a>
### UC-APR-0035 — Invalidate vote after unapproved account

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read/execute review after reviewer has unapproved account.

**Expected results**

- Retained decision remains history but no longer counts.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `get_issue_approvals`, `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0036"></a>
### UC-APR-0036 — Invalidate vote after demotion below reviewer role

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read/execute review after reviewer has demotion below reviewer role.

**Expected results**

- Retained decision remains history but no longer counts.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `get_issue_approvals`, `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0037"></a>
### UC-APR-0037 — Invalidate approval on issue content revision

Actor: `reader` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read/execute review after issue content revision advances.

**Expected results**

- Earlier decisions remain history but approval count for current context resets.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `get_issue_approvals`, `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0038"></a>
### UC-APR-0038 — Invalidate approval on workflow revision

Actor: `reader` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read/execute review after workflow revision advances.

**Expected results**

- Earlier decisions remain history but approval count for current context resets.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `get_issue_approvals`, `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0039"></a>
### UC-APR-0039 — Invalidate approval on project configuration revision

Actor: `reader` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read/execute review after project configuration revision advances.

**Expected results**

- Earlier decisions remain history but approval count for current context resets.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `get_issue_approvals`, `move_issue_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0040"></a>
### UC-APR-0040 — Reject stale issue review token

Actor: `reviewer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Vote/resubmit with outdated issue revision.

**Expected results**

- Conflict requires current-context reload.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80).

Shared business operations: `vote_issue_approval`, `resubmit_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0041"></a>
### UC-APR-0041 — Reject stale workflow review token

Actor: `reviewer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Vote/resubmit with outdated workflow revision.

**Expected results**

- Conflict requires current-context reload.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80).

Shared business operations: `vote_issue_approval`, `resubmit_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0042"></a>
### UC-APR-0042 — Reject stale configuration review token

Actor: `reviewer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Vote/resubmit with outdated configuration revision.

**Expected results**

- Conflict requires current-context reload.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80).

Shared business operations: `vote_issue_approval`, `resubmit_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0043"></a>
### UC-APR-0043 — Reject retired transition

Actor: `reviewer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Vote/resubmit using retired transition.

**Expected results**

- Review action rejects invalid current context.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80).

Shared business operations: `vote_issue_approval`, `resubmit_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

<a id="uc-apr-0044"></a>
### UC-APR-0044 — Reject different workflow transition

Actor: `reviewer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Vote/resubmit using different workflow transition.

**Expected results**

- Review action rejects invalid current context.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80).

Shared business operations: `vote_issue_approval`, `resubmit_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-APR-0001](../features/fields-review-labels.md#uc-apr-0001).

Note: Surface correction: The native review move selector loads only the issue assigned workflow. It cannot submit a foreign workflow transition identifier; that invalid current-context service boundary remains required on REST/MCP.

<a id="uc-apr-0045"></a>
### UC-APR-0045 — Reject transition not from current stage

Actor: `reviewer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Vote/resubmit using transition not from current stage.

**Expected results**

- Review action rejects invalid current context.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80).

Shared business operations: `vote_issue_approval`, `resubmit_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-APR-0047](../features/fields-review-labels.md#uc-apr-0047).

Note: Surface correction: Native non-current transition context is History only and hides review actions. Sending vote/resubmit for such a transition remains a separate REST/MCP rejection boundary.

<a id="uc-apr-0046"></a>
### UC-APR-0046 — Reject no-requirement resubmit

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Resubmit a transition with zero approval requirement.

**Expected results**

- Validation rejects unnecessary new review context.

Sources: [backend/internal/features/issues/approvals.go:344](../../../backend/internal/features/issues/approvals.go#L344).

Shared business operations: `resubmit_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-APR-0068](../features/fields-review-labels.md#uc-apr-0068).

Note: Surface correction: Native approval action buttons render only for a current transition with required > 0. No unnecessary resubmit button is offered; the raw service request remains validated on REST/MCP.

<a id="uc-apr-0047"></a>
### UC-APR-0047 — Read past transition history

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read selected transition after moving away.

**Expected results**

- Past move / History only appears; no current voting.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30), [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80).

Shared business operations: `get_issue_approvals`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

Related cases: [UC-APR-0063](../features/fields-review-labels.md#uc-apr-0063).

Note: Surface correction: Native selection, labels, popup reopening and appending are distinct from returned service state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-apr-0048"></a>
### UC-APR-0048 — Distinguish current previous votes

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read retained decisions.

**Expected results**

- Eligible current versus previous/ineligible decisions are labeled.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30), [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80).

Shared business operations: `get_issue_approvals`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-APR-0064](../features/fields-review-labels.md#uc-apr-0064).

Note: Surface correction: Native selection, labels, popup reopening and appending are distinct from returned service state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-apr-0049"></a>
### UC-APR-0049 — Append earlier review decisions

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose Earlier decisions.

**Expected results**

- Next newest-first history page appends without losing revision contexts.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `get_issue_approvals`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-APR-0065](../features/fields-review-labels.md#uc-apr-0065).

Note: Surface correction: Native selection, labels, popup reopening and appending are distinct from returned service state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-apr-0050"></a>
### UC-APR-0050 — Reject stale review history cursor

Actor: `reader` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Continue history after issue/workflow/configuration revision changes.

**Expected results**

- Scoped cursor rejects continuation of old context.

Sources: [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80).

Shared business operations: `get_issue_approvals`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

<a id="uc-apr-0051"></a>
### UC-APR-0051 — Retry original review action

Actor: `reviewer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Retry after review vote/resubmit acknowledgment loss.

**Expected results**

- Original transition/body/reference is reused.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:308](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L308).

Shared business operations: `vote_issue_approval`, `resubmit_issue_approval`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

Related cases: [UC-APR-0067](../features/fields-review-labels.md#uc-apr-0067).

Note: Surface correction: Reuse of the frozen native pending-action object is client ownership. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-apr-0052"></a>
### UC-APR-0052 — Refresh review context deliberately

Actor: `reviewer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Choose Review current context after uncertain/conflicting action.

**Expected results**

- Pending intent clears and fresh context loads.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:308](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L308).

Shared business operations: `get_issue_approvals`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

Related cases: [UC-APR-0002](../features/fields-review-labels.md#uc-apr-0002).

Note: Surface correction: Clearing a native pending intent is not a stateless read operation. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-apr-0053"></a>
### UC-APR-0053 — Ignore stale review load

Actor: `reader` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Switch issue/session while context request is pending.

**Expected results**

- Late reply cannot replace current review.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30).

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

<a id="uc-apr-0054"></a>
### UC-APR-0054 — Refresh target eligibility after vote

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Reopen issue status popup after vote.

**Expected results**

- Fresh transition read reflects current approval eligibility.

Sources: [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts:89](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts#L89).

Shared business operations: `list_issue_transitions_v2`.

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts).

Related cases: [UC-APR-0066](../features/fields-review-labels.md#uc-apr-0066).

Note: Surface correction: Native selection, labels, popup reopening and appending are distinct from returned service state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-apr-0055"></a>
### UC-APR-0055 — Request independent review object

Actor: `writer` · Kind: `lifecycle` · Implementation: `not_implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Attempt separate request-review action/assign reviewers.

**Expected results**

- No standalone request object/action exists; context derives from transition rules.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30), [backend/internal/features/issues/field_mcp.go:9](../../../backend/internal/features/issues/field_mcp.go#L9).

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

<a id="uc-apr-0056"></a>
### UC-APR-0056 — Withdraw review request

Actor: `writer` · Kind: `lifecycle` · Implementation: `not_implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Attempt cancel/withdraw of approval request.

**Expected results**

- No independent cancel/withdraw operation exists.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30), [backend/internal/features/issues/field_mcp.go:9](../../../backend/internal/features/issues/field_mcp.go#L9).

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

<a id="uc-apr-0057"></a>
### UC-APR-0057 — Retract prior vote

Actor: `reviewer` · Kind: `lifecycle` · Implementation: `not_implemented` · Surfaces: `web`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Attempt deletion/retraction of immutable vote.

**Expected results**

- No vote-retraction operation exists; resubmit starts another context.

Sources: [backend/internal/features/issues/approvals.go:256](../../../backend/internal/features/issues/approvals.go#L256), [backend/internal/features/issues/field_mcp.go:9](../../../backend/internal/features/issues/field_mcp.go#L9).

Related test files: [fields-approvals.spec.ts](../../../frontend/e2e/fields-approvals.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

<a id="uc-lbl-0001"></a>
### UC-LBL-0001 — Create reusable label

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Enter new label and choose Create and select.

**Expected results**

- Project label is created and selected in local issue draft.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Shared business operations: `create_label`.

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-LBL-0023](../features/fields-review-labels.md#uc-lbl-0023).

Note: Surface correction: Live typing, direction rendering and selected-chip state require the native controls. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-lbl-0002"></a>
### UC-LBL-0002 — Create Arabic label

Actor: `writer` · Kind: `localization` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create an Arabic/mixed Unicode label.

**Expected results**

- Accepted name displays with automatic direction.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Shared business operations: `create_label`.

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-LBL-0024](../features/fields-review-labels.md#uc-lbl-0024).

Note: Surface correction: Live typing, direction rendering and selected-chip state require the native controls. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-lbl-0003"></a>
### UC-LBL-0003 — Trim label name

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create name with surrounding spaces.

**Expected results**

- Trimmed name is stored.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Shared business operations: `create_label`.

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-label-extra.spec.ts](../../../frontend/e2e/coverage-native-label-extra.spec.ts).

<a id="uc-lbl-0004"></a>
### UC-LBL-0004 — Reuse equivalent label

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create name case-fold equivalent to existing label.

**Expected results**

- Existing ID is returned rather than duplicate.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Shared business operations: `create_label`.

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-label-extra.spec.ts](../../../frontend/e2e/coverage-native-label-extra.spec.ts).

<a id="uc-lbl-0005"></a>
### UC-LBL-0005 — Serialize equivalent label creation

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create case-fold-equivalent names simultaneously.

**Expected results**

- Project write serialization yields one reusable identity.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Shared business operations: `create_label`.

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-label-extra.spec.ts](../../../frontend/e2e/coverage-native-label-extra.spec.ts).

<a id="uc-lbl-0006"></a>
### UC-LBL-0006 — Reject empty label

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create blank/whitespace-only name.

**Expected results**

- Validation rejects.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Shared business operations: `create_label`.

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-label-extra.spec.ts](../../../frontend/e2e/coverage-native-label-extra.spec.ts).

<a id="uc-lbl-0007"></a>
### UC-LBL-0007 — Reject overlong label

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create label longer than 40 Unicode characters.

**Expected results**

- Validation rejects.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Shared business operations: `create_label`.

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-label-extra.spec.ts](../../../frontend/e2e/coverage-native-label-extra.spec.ts).

<a id="uc-lbl-0008"></a>
### UC-LBL-0008 — Reject invalid label Unicode

Actor: `writer` · Kind: `validation` · Implementation: `service_only` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit invalid Unicode/control text.

**Expected results**

- Validation rejects.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Shared business operations: `create_label`.

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

<a id="uc-lbl-0009"></a>
### UC-LBL-0009 — Search labels live

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Type project label query.

**Expected results**

- Case-folded matching choices update without search click.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:97](../../../backend/internal/features/issues/dates_labels.go#L97).

Shared business operations: `list_labels`.

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts).

Related cases: [UC-LBL-0025](../features/fields-review-labels.md#uc-lbl-0025).

Note: Surface correction: Live typing, direction rendering and selected-chip state require the native controls. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-lbl-0010"></a>
### UC-LBL-0010 — Page label choices

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Request more labels.

**Expected results**

- Next scoped page appends while selected labels remain.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:97](../../../backend/internal/features/issues/dates_labels.go#L97).

Shared business operations: `list_labels`.

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts).

Related cases: [UC-LBL-0026](../features/fields-review-labels.md#uc-lbl-0026).

Note: Surface correction: Live typing, direction rendering and selected-chip state require the native controls. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-lbl-0011"></a>
### UC-LBL-0011 — Select existing label

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Choose a label in issue edit.

**Expected results**

- Local draft selection changes without implicit issue save.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts).

<a id="uc-lbl-0012"></a>
### UC-LBL-0012 — Remove label selection

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Remove selected label from issue draft.

**Expected results**

- Only selection changes; reusable project label is not deleted.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts).

<a id="uc-lbl-0013"></a>
### UC-LBL-0013 — Create label at selection capacity

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create label while ten labels selected.

**Expected results**

- Label is saved reusable; user must remove one before selecting it.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Shared business operations: `create_label`.

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts).

Related cases: [UC-LBL-0023](../features/fields-review-labels.md#uc-lbl-0023).

Note: Surface correction: The service cannot observe the unsaved local ten-label selection capacity. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-lbl-0014"></a>
### UC-LBL-0014 — Remove unloaded selected label

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Remove a retained selection absent from loaded choices.

**Expected results**

- Selection remains removable rather than disappearing.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

<a id="uc-lbl-0015"></a>
### UC-LBL-0015 — Filter using all labels

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Choose several labels in Issues filter.

**Expected results**

- All selected labels are required and create-label control is absent.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27).

Shared business operations: `search_issues_v2`.

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-LBL-0027](../features/fields-review-labels.md#uc-lbl-0027).

Note: Surface correction: Live typing, direction rendering and selected-chip state require the native controls. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-lbl-0016"></a>
### UC-LBL-0016 — Reset labels across projects

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Switch selected project.

**Expected results**

- Previous-project choice scope/cache is invalidated.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27).

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

<a id="uc-lbl-0017"></a>
### UC-LBL-0017 — Reject foreign label assignment

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save another project label on issue.

**Expected results**

- Assignment rejects atomically.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Shared business operations: `update_issue_v2`.

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-LBL-0028](../features/fields-review-labels.md#uc-lbl-0028).

Note: Surface correction: The native label picker scopes lookup and existing issue draft to its fixed project. Label definitions cannot change owning project, so a foreign UUID cannot be selected or introduced through ordinary controls. The original atomic foreign-identifier assignment rejection remains required on REST/MCP.

<a id="uc-lbl-0018"></a>
### UC-LBL-0018 — Reject viewer label creation

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`, `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Create project label as viewer.

**Expected results**

- Current write permission rejects.

Sources: [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Shared business operations: `create_label`.

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts), [coverage-native-label-extra.spec.ts](../../../frontend/e2e/coverage-native-label-extra.spec.ts).

<a id="uc-lbl-0019"></a>
### UC-LBL-0019 — Ignore earlier label lookup

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Let old query complete after new query.

**Expected results**

- Latest choices remain.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27).

Shared business operations: `list_labels`.

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

Related cases: [UC-LBL-0025](../features/fields-review-labels.md#uc-lbl-0025).

Note: Surface correction: Only the client can reject an earlier lookup completion from its visible state. Native UI assertions are required here; stateless tool data is not proof of this control or retained client state.

<a id="uc-lbl-0020"></a>
### UC-LBL-0020 — Rename reusable label

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `not_implemented` · Surfaces: `web`

**Preconditions**

- The actor has current configuration access to the relevant project.

**Steps**

1. Attempt project label rename.

**Expected results**

- No update-label action/UI exists in current feature.

Sources: [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48), [backend/internal/features/issues/dates_labels.go:97](../../../backend/internal/features/issues/dates_labels.go#L97).

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

<a id="uc-lbl-0021"></a>
### UC-LBL-0021 — Retire reusable label

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `not_implemented` · Surfaces: `web`

**Preconditions**

- The actor has current configuration access to the relevant project.

**Steps**

1. Attempt project label retirement.

**Expected results**

- No label retirement action/UI exists.

Sources: [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48), [backend/internal/features/issues/dates_labels.go:97](../../../backend/internal/features/issues/dates_labels.go#L97).

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

<a id="uc-lbl-0022"></a>
### UC-LBL-0022 — Delete reusable label

Actor: `project_admin` · Kind: `lifecycle` · Implementation: `not_implemented` · Surfaces: `web`

**Preconditions**

- The actor has current configuration access to the relevant project.

**Steps**

1. Attempt deleting reusable label itself.

**Expected results**

- Only issue deselection exists; no label-delete action was found.

Sources: [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48), [backend/internal/features/issues/dates_labels.go:97](../../../backend/internal/features/issues/dates_labels.go#L97).

Related test files: [dates-labels.spec.ts](../../../frontend/e2e/dates-labels.spec.ts), [teammate-label-live-search.spec.ts](../../../frontend/e2e/teammate-label-live-search.spec.ts), [coverage-native-domain.spec.ts](../../../frontend/e2e/coverage-native-domain.spec.ts).

<a id="uc-fld-0073"></a>
### UC-FLD-0073 — Retired person and choice friendly display

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- A readable issue retains a person or choice value on a retired custom field.

**Steps**

1. Open that retired field in issue detail.

**Expected results**

- Authorized retained person and choice references display their current friendly names, including on retired fields; their raw typed IDs remain unchanged in the issue values.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:147](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L147).

Related test files: [coverage-fields.spec.ts](../../../frontend/e2e/coverage-fields.spec.ts), [custom_field_display_test.go](../../../backend/internal/features/issues/custom_field_display_test.go).

Gaps: [GAP-FLD-002](../gaps.md#gap-fld-002).

Note: The initial runtime reproduction displayed UUIDs. The additive displayValues read projection resolves only the authorized current field page with one bounded SQL join; no per-row HTTP lookup is required.

<a id="uc-fld-0074"></a>
### UC-FLD-0074 — Field definition changes during conflict review

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- A writer has an unsaved custom-field draft and another administrator changes a relevant field definition or option.

**Steps**

1. Use Review current issue and inspect the preserved draft and available options.

**Expected results**

- Review refreshes the current loaded field definitions, retained display names and current picker options together with the issue revision while preserving the writer draft. Retired options remain readable but cannot be newly selected.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:250](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L250).

Related test files: [coverage-fields.spec.ts](../../../frontend/e2e/coverage-fields.spec.ts).

Gaps: [GAP-FLD-003](../gaps.md#gap-fld-003).

Note: The initial runtime reproduction kept the previous field name after Review. Recovery now reloads the current loaded definition pages and recreates picker inputs before allowing the preserved draft to be applied.

<a id="uc-fld-0075"></a>
### UC-FLD-0075 — Reject malformed decimal at service boundary

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Submit malformed signed/decimal text.

**Expected results**

- Validation rejects the write and preserves the stored typed value.

Sources: [backend/internal/platform/command/field_values.go:26](../../../backend/internal/platform/command/field_values.go#L26), [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133).

Shared business operations: `save_issue_fields`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-FLD-0028](../features/fields-review-labels.md#uc-fld-0028).

Note: Atomic service outcome separated from the native UI behavior in UC-FLD-0028. Its browser behavior remains in the original stable case.

<a id="uc-fld-0076"></a>
### UC-FLD-0076 — Read choice option cursor pages

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Read a bounded choice-options page and its next cursor.

**Expected results**

- Later distinct options return in stable configured order.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29).

Shared business operations: `list_field_options`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Gaps: [GAP-FLD-001](../gaps.md#gap-fld-001).

Related cases: [UC-FLD-0035](../features/fields-review-labels.md#uc-fld-0035).

Note: Atomic service outcome separated from the native UI behavior in UC-FLD-0035. Its browser behavior remains in the original stable case.

<a id="uc-fld-0077"></a>
### UC-FLD-0077 — Read retained option identity and display metadata

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read an issue retaining an old retired choice option.

**Expected results**

- The raw typed option ID and authorized friendly/retired display metadata remain readable.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29).

Shared business operations: `get_issue_fields`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-FLD-0036](../features/fields-review-labels.md#uc-fld-0036).

Note: Atomic service outcome separated from the native UI behavior in UC-FLD-0036. Its browser behavior remains in the original stable case.

<a id="uc-fld-0078"></a>
### UC-FLD-0078 — Read custom-person candidate cursor pages

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Read scoped person choices and their next cursor.

**Expected results**

- Later eligible distinct project people return without replacing stored values.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29).

Shared business operations: `list_mention_candidates`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-FLD-0040](../features/fields-review-labels.md#uc-fld-0040).

Note: Atomic service outcome separated from the native UI behavior in UC-FLD-0040. Its browser behavior remains in the original stable case.

<a id="uc-fld-0079"></a>
### UC-FLD-0079 — Read typed values of retired fields

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read an issue containing retired field definitions.

**Expected results**

- Retired definitions and their historical raw typed values remain readable.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133).

Shared business operations: `get_issue_fields`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Gaps: [GAP-FLD-002](../gaps.md#gap-fld-002).

Related cases: [UC-FLD-0048](../features/fields-review-labels.md#uc-fld-0048).

Note: Atomic service outcome separated from the native UI behavior in UC-FLD-0048. Its browser behavior remains in the original stable case.

<a id="uc-fld-0080"></a>
### UC-FLD-0080 — Reject stale custom-field write

Actor: `writer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Save custom values using an outdated issue revision.

**Expected results**

- A conflict rejects the stale write and reports the current issue without overwriting values.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `save_issue_fields`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-FLD-0055](../features/fields-review-labels.md#uc-fld-0055).

Note: Atomic service outcome separated from the native UI behavior in UC-FLD-0055. Its browser behavior remains in the original stable case.

<a id="uc-fld-0081"></a>
### UC-FLD-0081 — Read paged definitions with stored custom values

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read a bounded issue-field page and its next cursor.

**Expected results**

- Distinct definition pages return their corresponding stored values and scoped cursors.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133).

Shared business operations: `get_issue_fields`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-FLD-0062](../features/fields-review-labels.md#uc-fld-0062).

Note: Atomic service outcome separated from the native UI behavior in UC-FLD-0062. Its browser behavior remains in the original stable case.

<a id="uc-apr-0058"></a>
### UC-APR-0058 — Read workflow transition cursor pages

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read workflow transitions with a bounded limit and next cursor.

**Expected results**

- Later distinct current-workflow transitions are returned.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30).

Shared business operations: `list_workflow_transitions`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-APR-0003](../features/fields-review-labels.md#uc-apr-0003).

Note: Atomic service outcome separated from the native UI behavior in UC-APR-0003. Its browser behavior remains in the original stable case.

<a id="uc-apr-0059"></a>
### UC-APR-0059 — Read workflow stage-name cursor pages

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read workflow stages with a bounded limit and next cursor.

**Expected results**

- Later stage IDs retain their configured friendly names.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30).

Shared business operations: `list_workflow_stages`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-APR-0004](../features/fields-review-labels.md#uc-apr-0004).

Note: Atomic service outcome separated from the native UI behavior in UC-APR-0004. Its browser behavior remains in the original stable case.

<a id="uc-apr-0060"></a>
### UC-APR-0060 — Read approval count projection

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read an active transition approval context.

**Expected results**

- Approved and required counts match the current eligible distinct decisions.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30).

Shared business operations: `get_issue_approvals`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-APR-0006](../features/fields-review-labels.md#uc-apr-0006).

Note: Atomic service outcome separated from the native UI behavior in UC-APR-0006. Its browser behavior remains in the original stable case.

<a id="uc-apr-0061"></a>
### UC-APR-0061 — Retain current review rejection decision

Actor: `reviewer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Reject a current review as an eligible reviewer.

**Expected results**

- The immutable rejection is retained and the context reports rejected/unsatisfied.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30), [backend/internal/features/issues/approvals.go:256](../../../backend/internal/features/issues/approvals.go#L256).

Shared business operations: `vote_issue_approval`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-APR-0008](../features/fields-review-labels.md#uc-apr-0008).

Note: Atomic service outcome separated from the native UI behavior in UC-APR-0008. Its browser behavior remains in the original stable case.

<a id="uc-apr-0062"></a>
### UC-APR-0062 — Execute approved service issue move

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Move an issue whose target review is satisfied.

**Expected results**

- The stage changes only through the separate move command; voting alone does not move it.

Sources: [backend/internal/features/issues/canonical_move.go:78](../../../backend/internal/features/issues/canonical_move.go#L78), [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts:89](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts#L89).

Shared business operations: `move_issue_v2`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-APR-0017](../features/fields-review-labels.md#uc-apr-0017).

Note: Atomic service outcome separated from the native UI behavior in UC-APR-0017. Its browser behavior remains in the original stable case.

<a id="uc-apr-0063"></a>
### UC-APR-0063 — Read past-transition review-only context

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read a transition context after the issue has moved away.

**Expected results**

- The context is not current and disallows new voting while retaining history.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30), [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80).

Shared business operations: `get_issue_approvals`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-APR-0047](../features/fields-review-labels.md#uc-apr-0047).

Note: Atomic service outcome separated from the native UI behavior in UC-APR-0047. Its browser behavior remains in the original stable case.

<a id="uc-apr-0064"></a>
### UC-APR-0064 — Read current and eligible review flags

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read retained transition review decisions.

**Expected results**

- Each decision exposes its current-context and current-eligibility flags.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30), [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80).

Shared business operations: `get_issue_approvals`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-APR-0048](../features/fields-review-labels.md#uc-apr-0048).

Note: Atomic service outcome separated from the native UI behavior in UC-APR-0048. Its browser behavior remains in the original stable case.

<a id="uc-apr-0065"></a>
### UC-APR-0065 — Read paged review decision history

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read a bounded review decision page and advance its cursor.

**Expected results**

- Distinct newest-first decisions retain their original revision contexts.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30), [backend/internal/features/issues/approval_queries.sql:6](../../../backend/internal/features/issues/approval_queries.sql#L6).

Shared business operations: `get_issue_approvals`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-APR-0049](../features/fields-review-labels.md#uc-apr-0049).

Note: Atomic service outcome separated from the native UI behavior in UC-APR-0049. Its browser behavior remains in the original stable case.

<a id="uc-apr-0066"></a>
### UC-APR-0066 — Read target review eligibility after vote

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Read issue transition targets before and after an accepted review decision.

**Expected results**

- The fresh target projection reflects the current review-satisfied state.

Sources: [frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts:89](../../../frontend/src/app/features/issues/components/modern-issue-status-menu/modern-issue-status-menu.component.ts#L89).

Shared business operations: `list_issue_transitions_v2`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-APR-0054](../features/fields-review-labels.md#uc-apr-0054).

Note: Atomic service outcome separated from the native UI behavior in UC-APR-0054. Its browser behavior remains in the original stable case.

<a id="uc-apr-0067"></a>
### UC-APR-0067 — Replay accepted review action once

Actor: `reviewer` · Kind: `concurrency` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- A transition approval context exists; reviewer eligibility is evaluated by the case.

**Steps**

1. Retry the identical accepted vote or resubmit with its original retry reference.

**Expected results**

- The original outcome replays without duplicate decisions or another resubmit revision.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:308](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L308).

Shared business operations: `vote_issue_approval`, `resubmit_issue_approval`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-APR-0051](../features/fields-review-labels.md#uc-apr-0051).

Note: Atomic service outcome separated from the native UI behavior in UC-APR-0051. Its browser behavior remains in the original stable case.

<a id="uc-lbl-0023"></a>
### UC-LBL-0023 — Create reusable project label through service

Actor: `writer` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create a new allowed label name in the project.

**Expected results**

- One reusable label is returned and persisted independently of issue selection.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Shared business operations: `create_label`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-LBL-0001](../features/fields-review-labels.md#uc-lbl-0001).

Note: Atomic service outcome separated from the native UI behavior in UC-LBL-0001. Its browser behavior remains in the original stable case.

<a id="uc-lbl-0024"></a>
### UC-LBL-0024 — Retain Arabic label name through service

Actor: `writer` · Kind: `localization` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Create an Arabic or mixed Unicode project label.

**Expected results**

- The exact accepted Unicode name is retained and returned.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:48](../../../backend/internal/features/issues/dates_labels.go#L48).

Shared business operations: `create_label`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-LBL-0002](../features/fields-review-labels.md#uc-lbl-0002).

Note: Atomic service outcome separated from the native UI behavior in UC-LBL-0002. Its browser behavior remains in the original stable case.

<a id="uc-lbl-0025"></a>
### UC-LBL-0025 — Read case-folded project label matches

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Query a project label name using case-folded text.

**Expected results**

- Only matching authorized-project labels are returned.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:97](../../../backend/internal/features/issues/dates_labels.go#L97).

Shared business operations: `list_labels`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-LBL-0009](../features/fields-review-labels.md#uc-lbl-0009).

Note: Atomic service outcome separated from the native UI behavior in UC-LBL-0009. Its browser behavior remains in the original stable case.

<a id="uc-lbl-0026"></a>
### UC-LBL-0026 — Read scoped label cursor pages

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read a bounded label page and its next cursor.

**Expected results**

- Distinct later matching labels return with the same project/query scope.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27), [backend/internal/features/issues/dates_labels.go:97](../../../backend/internal/features/issues/dates_labels.go#L97).

Shared business operations: `list_labels`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-LBL-0010](../features/fields-review-labels.md#uc-lbl-0010).

Note: Atomic service outcome separated from the native UI behavior in UC-LBL-0010. Its browser behavior remains in the original stable case.

<a id="uc-lbl-0027"></a>
### UC-LBL-0027 — Search issues requiring every requested label

Actor: `reader` · Kind: `happy_path` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Search issues with multiple allowed label IDs.

**Expected results**

- Every returned issue carries all requested labels; matching uses intersection.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27).

Shared business operations: `search_issues_v2`.

Related test files: [coverage-domain-mcp-extra.spec.ts](../../../frontend/e2e/coverage-domain-mcp-extra.spec.ts), [coverage-domain-rest-extra.spec.ts](../../../frontend/e2e/coverage-domain-rest-extra.spec.ts).

Related cases: [UC-LBL-0015](../features/fields-review-labels.md#uc-lbl-0015).

Note: Atomic service outcome separated from the native UI behavior in UC-LBL-0015. Its browser behavior remains in the original stable case.

<a id="uc-fld-0082"></a>
### UC-FLD-0082 — Authorize viewer custom-field reads and deny writes

Actor: `reader` · Kind: `permission` · Implementation: `implemented` · Surfaces: `rest`, `mcp`

**Preconditions**

- The actor has current read access to the relevant project unless the case explicitly checks denied access.

**Steps**

1. Read stored custom values as a viewer, then attempt a write.

**Expected results**

- Authorized values remain readable and the forbidden write leaves stored values unchanged.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133), [backend/internal/features/issues/custom_fields.go:152](../../../backend/internal/features/issues/custom_fields.go#L152).

Shared business operations: `get_issue_fields`, `save_issue_fields`.

Related test files: [coverage-domain-mcp.spec.ts](../../../frontend/e2e/coverage-domain-mcp.spec.ts), [coverage-domain-rest.spec.ts](../../../frontend/e2e/coverage-domain-rest.spec.ts).

Related cases: [UC-FLD-0065](../features/fields-review-labels.md#uc-fld-0065).

Note: Atomic service outcome separated from native UI case UC-FLD-0065.

<a id="uc-fld-0083"></a>
### UC-FLD-0083 — Scope native choice options to their owning field

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Open a choice-valued issue field lookup with options also present on other fields and another project.

**Expected results**

- Only options belonging to this issue field are selectable; foreign field/project options are absent.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29).

Related test files: [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

Related cases: [UC-FLD-0038](../features/fields-review-labels.md#uc-fld-0038).

Note: Atomic native control boundary, distinct from submitting unsupported raw REST/MCP arguments.

<a id="uc-fld-0084"></a>
### UC-FLD-0084 — Offer only currently eligible custom-field people

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Open the native person-valued issue field picker.

**Expected results**

- An approved active project member is offered; unapproved, disabled and approved non-member accounts are absent.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29).

Related test files: [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

Related cases: [UC-FLD-0041](../features/fields-review-labels.md#uc-fld-0041), [UC-FLD-0044](../features/fields-review-labels.md#uc-fld-0044).

Note: Atomic native control boundary, distinct from submitting unsupported raw REST/MCP arguments.

<a id="uc-fld-0085"></a>
### UC-FLD-0085 — Scope native field definitions to the issue project

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Open an issue while another project owns a separately named custom field.

**Expected results**

- Only owning-project field controls appear; the foreign field cannot be selected or assigned.

Sources: [frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts:133](../../../frontend/src/app/features/issues/components/custom-fields/custom-fields.component.ts#L133).

Related test files: [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

Related cases: [UC-FLD-0066](../features/fields-review-labels.md#uc-fld-0066).

Note: Atomic native control boundary, distinct from submitting unsupported raw REST/MCP arguments.

<a id="uc-fld-0086"></a>
### UC-FLD-0086 — Bound native text field entry to 5000 characters

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Enter 5001 ASCII text characters using the native custom field input, then save.

**Expected results**

- The native maxlength retains exactly 5000 characters; the accepted save persists exactly that bounded value.

Sources: [frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts:29](../../../frontend/src/app/features/issues/components/custom-fields/field-value-editor.component.ts#L29).

Related test files: [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

Related cases: [UC-FLD-0029](../features/fields-review-labels.md#uc-fld-0029).

Note: Atomic native control boundary, distinct from submitting unsupported raw REST/MCP arguments.

<a id="uc-apr-0068"></a>
### UC-APR-0068 — Omit review actions when no approval is required

Actor: `writer` · Kind: `validation` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor is signed in with current project write access unless this case explicitly changes that access.

**Steps**

1. Select a current transition whose approval requirement is zero in Review and approvals.

**Expected results**

- The satisfied current context is visible and Approve, Request changes and Resubmit for review controls are absent.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30).

Related test files: [coverage-native-fields-extra.spec.ts](../../../frontend/e2e/coverage-native-fields-extra.spec.ts).

Related cases: [UC-APR-0046](../features/fields-review-labels.md#uc-apr-0046).

Note: Atomic native control boundary, distinct from submitting unsupported raw REST/MCP arguments.

<a id="uc-apr-0069"></a>
### UC-APR-0069 — Omit reporter voting and exclude retained reporter decisions

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor reported the issue and its transition review policy excludes the reporter.

**Steps**

1. Read the native transition review after reporter exclusion is enabled, retaining any earlier reporter decision.

**Expected results**

- Approve and Request changes actions are absent for the reporter; its retained decision stays visible as previous history and no longer counts.

Sources: [frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts:30](../../../frontend/src/app/features/issues/components/custom-fields/issue-review.component.ts#L30), [backend/internal/features/issues/approvals.go:80](../../../backend/internal/features/issues/approvals.go#L80).

Related test files: [coverage-native-approval-extra.spec.ts](../../../frontend/e2e/coverage-native-approval-extra.spec.ts).

Related cases: [UC-APR-0028](../features/fields-review-labels.md#uc-apr-0028).

Note: Atomic native policy boundary distinct from direct reporter-ineligible service rejection.

<a id="uc-lbl-0028"></a>
### UC-LBL-0028 — Omit foreign project labels from native assignment choices

Actor: `writer` · Kind: `permission` · Implementation: `implemented` · Surfaces: `web`

**Preconditions**

- The actor can read two projects with distinct reusable labels.

**Steps**

1. Open an issue label picker and search for another project label, then search and select an owning-project label.

**Expected results**

- Foreign project labels are absent and cannot be selected; the owning-project label remains selectable.

Sources: [frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts:27](../../../frontend/src/app/features/issues/components/date-label-fields/date-label-fields.component.ts#L27).

Related test files: [coverage-native-label-extra.spec.ts](../../../frontend/e2e/coverage-native-label-extra.spec.ts).

Related cases: [UC-LBL-0017](../features/fields-review-labels.md#uc-lbl-0017).

Note: Atomic native scoped-choice boundary distinct from direct raw assignment validation.
